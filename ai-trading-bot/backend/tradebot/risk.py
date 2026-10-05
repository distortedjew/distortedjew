"""Risk manager: pre-trade checks, position sizing, halts and the risk snapshot.

Every check is evaluated and recorded (``RiskDecision.checks``) with display strings, so the
dashboard can show exactly why a signal passed or failed. ``RiskDecision.reasons`` are short
stable phrases without numbers (they aggregate across decisions); numbers live in the checks.

Checks, in order: direction allowed (shorts toggle) · trading not halted · confidence ≥
``min_ai_confidence`` · valid levels (correct sides, stop 0.1–10 % away) · risk/reward ≥
``min_risk_reward`` · open positions < ``max_positions`` · no same-direction position on the
symbol (an opposite one is reversed when confidence ≥ minimum + 10) · exposure after entry ≤
``max_exposure_pct`` · today's loss + the open risk of the other positions + this trade's risk
≤ ``max_daily_loss_usd`` · notional ≥ $10.

Counting open risk in the daily budget is deliberate: BTC, ETH and SOL move together, so
three positions that each risk 1 % can all stop out within minutes. Budgeting them up front
keeps the kill switch an emergency brake (gaps, slippage) instead of a daily event.

Sizing: ``risk_per_trade_pct`` of equity divided by the per-unit loss at the stop — the stop
distance plus entry/exit fees and exit slippage, so a stopped trade loses about one R — capped
by ``max_position_pct`` of equity, by the remaining exposure headroom and by what is left of
the daily loss budget. The effective risk is what gets recorded.

Halts: the daily loss limit (equity-based: realized + change in unrealized since 00:00 UTC)
closes everything (kill switch) and halts until the next UTC day; 80 % of it raises a warning
once a day; ``max_consecutive_losses`` pauses entries for ``loss_streak_cooldown_minutes``
(again after every further loss while the streak lasts); a drawdown of ``max_drawdown_pct``
from peak pauses entries for 24 h. After that pause the drawdown halt re-arms on a new equity
low (or a new peak), so a market that keeps falling pauses the bot again instead of letting
it trade unchecked, without halting it forever once it stabilises.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass
from datetime import datetime, timedelta

from .analytics.metrics import classify
from .db import iso, parse_iso
from .market.symbols import fmt_pct, fmt_usd, qty_decimals
from .schemas import (
    ExecutionSettings,
    NotificationType,
    RiskCheck,
    RiskDecision,
    RiskMeter,
    RiskMeterStatus,
    RiskSettings,
    RiskSnapshot,
    Side,
    TradingSettings,
)

MIN_NOTIONAL = 10.0
MIN_STOP_PCT = 0.1
MAX_STOP_PCT = 10.0
REVERSAL_EXTRA_CONFIDENCE = 10.0
DAILY_WARNING_FRACTION = 0.8
DRAWDOWN_PAUSE = timedelta(hours=24)

# Stable rejection phrases (no numbers: they aggregate in analytics)
R_SHORTS = "Shorts disabled"
R_HALTED = "Trading halted"
R_CONFIDENCE = "Confidence below minimum"
R_LEVELS = "Invalid stop/target levels"
R_RR = "Risk/reward below minimum"
R_POSITIONS = "Max open positions reached"
R_SAME = "Position already open"
R_OPPOSITE = "Opposite position open"
R_EXPOSURE = "Exposure limit exceeded"
R_DAILY = "Daily loss limit reached"
R_NOTIONAL = "Position size below minimum"
R_HOLD = "HOLD signal"

HALT_DAILY = "Daily loss limit reached"
HALT_STREAK = "Loss-streak cooldown"
HALT_DRAWDOWN = "Max drawdown pause"


def next_midnight(now: datetime) -> datetime:
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


@dataclass(slots=True)
class PortfolioView:
    """The portfolio numbers a risk decision needs (provided by the trading core)."""

    equity: float
    exposure: float  # Σ |notional| at current prices, positions + resting limit orders
    open_positions: int  # positions + resting limit orders
    open_risk: float  # Σ risk_amount over open positions
    daily_pnl: float  # equity change since 00:00 UTC
    drawdown_pct: float  # current, <= 0
    max_drawdown_pct: float  # worst observed, <= 0
    side_on_symbol: Side | None = None  # open position or resting order on the decision symbol
    exposure_on_symbol: float = 0.0  # what a reversal would free up
    risk_on_symbol: float = 0.0  # open risk a reversal would free up


@dataclass(slots=True)
class Sizing:
    size: float
    notional: float
    risk_amount: float
    risk_pct: float
    fill_price: float
    capped_by: str | None  # None, "max position", "exposure headroom" or "daily loss budget"
    exposure_headroom: float = 0.0  # quote currency left under max_exposure_pct before this trade
    risk_budget: float = 0.0  # daily loss budget left before this trade (quote currency)
    committed: float = 0.0  # today's loss + open risk of the other positions


@dataclass(slots=True)
class Assessment:
    decision: RiskDecision
    sizing: Sizing | None
    reverse: bool  # close the opposite position on the symbol first


@dataclass(slots=True)
class RiskAlert:
    """A limit event the core turns into a RISK_WARNING event and a notification."""

    meter: str
    current: float
    limit: float
    title: str
    message: str
    notification: NotificationType
    severity: str = "warning"
    kill_switch: bool = False


@dataclass
class RiskState:
    """Halt / streak bookkeeping, persisted so a restart keeps every halt in force."""

    day: str = ""  # UTC date the daily flags belong to
    daily_halt_until: datetime | None = None
    cooldown_until: datetime | None = None
    drawdown_until: datetime | None = None
    dd_trigger_equity: float | None = None
    consecutive_losses: int = 0
    daily_warning_sent: bool = False
    rejections_today: int = 0

    def to_dict(self) -> dict:
        data = asdict(self)
        for key in ("daily_halt_until", "cooldown_until", "drawdown_until"):
            if data[key] is not None:
                data[key] = iso(data[key])
        return data

    @classmethod
    def from_dict(cls, data: dict) -> RiskState:
        clean = {k: v for k, v in data.items() if k in cls.__dataclass_fields__}
        for key in ("daily_halt_until", "cooldown_until", "drawdown_until"):
            if clean.get(key):
                clean[key] = parse_iso(clean[key])
        return cls(**clean)


def meter_status(utilization: float) -> RiskMeterStatus:
    if utilization >= 100.0:
        return "breached"
    if utilization >= 90.0:
        return "critical"
    if utilization >= 70.0:
        return "warning"
    return "ok"


_METER_MESSAGES: dict[str, dict[str, str]] = {
    "daily_loss": {
        "warning": "APPROACHING DAILY LIMIT",
        "critical": "NEAR DAILY LIMIT",
        "breached": "DAILY LIMIT REACHED — TRADING HALTED",
    },
    "drawdown": {
        "warning": "DRAWDOWN ELEVATED",
        "critical": "NEAR DRAWDOWN LIMIT",
        "breached": "DRAWDOWN LIMIT REACHED — ENTRIES PAUSED",
    },
    "exposure": {
        "warning": "EXPOSURE HIGH",
        "critical": "NEAR EXPOSURE LIMIT",
        "breached": "EXPOSURE LIMIT REACHED",
    },
    "positions": {
        "warning": "POSITION SLOTS FILLING",
        "critical": "LAST POSITION SLOT",
        "breached": "ALL POSITION SLOTS IN USE",
    },
    "consecutive_losses": {
        "warning": "LOSS STREAK BUILDING",
        "critical": "ONE LOSS FROM COOLDOWN",
        "breached": "LOSS STREAK LIMIT — COOLDOWN",
    },
    "daily_risk": {
        "warning": "OPEN RISK HIGH",
        "critical": "OPEN RISK NEAR DAILY BUDGET",
        "breached": "OPEN RISK EXCEEDS DAILY BUDGET",
    },
}


def make_meter(key: str, label: str, current: float, limit: float, unit: str) -> RiskMeter:
    util = current / limit * 100.0 if limit > 0 else 0.0
    status = meter_status(util)
    return RiskMeter(
        key=key,  # type: ignore[arg-type]
        label=label,
        current=round(current, 4),
        limit=round(limit, 4),
        unit=unit,  # type: ignore[arg-type]
        utilization_pct=round(util, 2),
        status=status,
        message=_METER_MESSAGES[key].get(status),
    )


class RiskManager:
    def __init__(
        self,
        risk: RiskSettings,
        execution: ExecutionSettings,
        trading: TradingSettings,
        state: RiskState | None = None,
    ) -> None:
        self.risk = risk
        self.execution = execution
        self.trading = trading
        self.state = state or RiskState()

    def update_settings(
        self, risk: RiskSettings, execution: ExecutionSettings, trading: TradingSettings
    ) -> None:
        self.risk, self.execution, self.trading = risk, execution, trading

    # ------------------------------------------------------------------
    # halts
    # ------------------------------------------------------------------

    def halts(self, now: datetime) -> list[tuple[str, datetime]]:
        """Active halts as (reason, until), most restrictive first."""
        st = self.state
        active = [
            (HALT_DAILY, st.daily_halt_until),
            (HALT_DRAWDOWN, st.drawdown_until),
            (HALT_STREAK, st.cooldown_until),
        ]
        return [(reason, until) for reason, until in active if until is not None and until > now]

    def trading_allowed(self, now: datetime) -> bool:
        return not self.halts(now)

    def halt_status(self, now: datetime) -> tuple[str | None, datetime | None]:
        halts = self.halts(now)
        if not halts:
            return None, None
        reason = halts[0][0]
        return reason, max(until for _, until in halts)

    def roll_day(self, now: datetime) -> bool:
        """Reset daily flags when the UTC date changed; returns True on a new day."""
        day = now.date().isoformat()
        if self.state.day == day:
            return False
        self.state.day = day
        self.state.daily_warning_sent = False
        self.state.rejections_today = 0
        if self.state.daily_halt_until is not None and self.state.daily_halt_until <= now:
            self.state.daily_halt_until = None
        return True

    def check_limits(self, view: PortfolioView, now: datetime) -> list[RiskAlert]:
        """Daily-loss warning / kill switch and the drawdown pause; call on every mark."""
        alerts: list[RiskAlert] = []
        st = self.state
        limit = self.risk.max_daily_loss_usd
        daily_loss = max(0.0, -view.daily_pnl)
        if daily_loss >= limit and (st.daily_halt_until is None or st.daily_halt_until <= now):
            st.daily_halt_until = next_midnight(now)
            st.daily_warning_sent = True
            alerts.append(
                RiskAlert(
                    meter="daily_loss",
                    current=round(daily_loss, 2),
                    limit=limit,
                    title="Daily loss limit reached — trading halted",
                    message=(
                        f"Daily loss {fmt_usd(daily_loss)} hit the {fmt_usd(limit)} limit. All positions are being "
                        f"closed and trading resumes at 00:00 UTC."
                    ),
                    notification="DAILY_LOSS_LIMIT",
                    severity="error",
                    kill_switch=True,
                )
            )
        elif (
            daily_loss >= DAILY_WARNING_FRACTION * limit
            and not st.daily_warning_sent
            and st.daily_halt_until is None
        ):
            st.daily_warning_sent = True
            alerts.append(
                RiskAlert(
                    meter="daily_loss",
                    current=round(daily_loss, 2),
                    limit=limit,
                    title="Approaching the daily loss limit",
                    message=(
                        f"Daily loss {fmt_usd(daily_loss)} is {daily_loss / limit * 100:.0f}% of the "
                        f"{fmt_usd(limit)} limit. New entries stop at the limit."
                    ),
                    notification="DAILY_LOSS_WARNING",
                )
            )
        dd = -view.drawdown_pct
        if view.drawdown_pct >= 0:
            st.dd_trigger_equity = None  # new peak re-arms the drawdown halt
        dd_limit = self.risk.max_drawdown_pct
        paused = st.drawdown_until is not None and st.drawdown_until > now
        if (
            dd >= dd_limit
            and not paused
            and (st.dd_trigger_equity is None or view.equity < st.dd_trigger_equity)
        ):
            st.drawdown_until = now + DRAWDOWN_PAUSE
            st.dd_trigger_equity = view.equity
            alerts.append(
                RiskAlert(
                    meter="drawdown",
                    current=round(dd, 2),
                    limit=dd_limit,
                    title="Max drawdown reached — entries paused for 24 h",
                    message=(
                        f"Drawdown {fmt_pct(dd)} from the equity peak reached the {fmt_pct(dd_limit, decimals=0)} "
                        f"limit. No new entries for 24 hours; open positions keep their stops."
                    ),
                    notification="RISK_LIMIT",
                    severity="error",
                )
            )
        return alerts

    def on_trade_closed(self, pnl: float, now: datetime) -> list[RiskAlert]:
        """Update the loss streak; starts the cooldown when it reaches the limit."""
        st = self.state
        result = classify(pnl)
        if result != "LOSS":
            st.consecutive_losses = 0
            return []
        st.consecutive_losses += 1
        limit = self.risk.max_consecutive_losses
        if st.consecutive_losses < limit:
            return []
        minutes = self.risk.loss_streak_cooldown_minutes
        if minutes > 0:
            st.cooldown_until = now + timedelta(minutes=minutes)
        return [
            RiskAlert(
                meter="consecutive_losses",
                current=st.consecutive_losses,
                limit=limit,
                title=f"{st.consecutive_losses} losses in a row — cooling down",
                message=(
                    f"The loss streak reached the limit of {limit}. New entries pause for {minutes} minutes."
                    if minutes > 0
                    else f"The loss streak reached the limit of {limit} (no cooldown configured)."
                ),
                notification="RISK_LIMIT",
            )
        ]

    # ------------------------------------------------------------------
    # sizing and checks
    # ------------------------------------------------------------------

    def fill_estimate(self, side: Side, price: float, entry: float) -> float:
        """Expected entry fill: market orders pay slippage, limit orders fill at their price."""
        if self.execution.order_type == "limit":
            return entry
        slip = self.execution.slippage_bps / 10_000.0
        return price * (1.0 + slip) if side == "LONG" else price * (1.0 - slip)

    def per_unit_loss(self, fill: float, stop: float) -> float:
        """Loss per unit if the stop fills: distance + entry and exit fees + exit slippage."""
        fee = self.execution.fee_bps / 10_000.0
        slip = self.execution.slippage_bps / 10_000.0
        return abs(fill - stop) + fill * fee + stop * (fee + slip)

    def size(self, side: Side, fill: float, stop: float, view: PortfolioView, *, reverse: bool) -> Sizing:
        equity = max(view.equity, 0.0)
        target_risk = equity * self.risk.risk_per_trade_pct / 100.0
        unit = self.per_unit_loss(fill, stop)
        size = target_risk / unit if unit > 0 else 0.0
        capped_by: str | None = None
        cap_position = equity * self.risk.max_position_pct / 100.0 / fill
        exposure = view.exposure - (view.exposure_on_symbol if reverse else 0.0)
        headroom = max(0.0, equity * self.risk.max_exposure_pct / 100.0 - exposure)
        cap_exposure = headroom / fill
        committed = max(0.0, -view.daily_pnl) + view.open_risk - (view.risk_on_symbol if reverse else 0.0)
        budget = max(0.0, self.risk.max_daily_loss_usd - committed)
        cap_budget = budget / unit if unit > 0 else 0.0
        if cap_position < size:
            size, capped_by = cap_position, "max position"
        if cap_exposure < size:
            size, capped_by = cap_exposure, "exposure headroom"
        if cap_budget < size:
            size, capped_by = cap_budget, "daily loss budget"
        decimals = qty_decimals(fill)
        size = math.floor(size * 10**decimals) / 10**decimals
        notional = size * fill
        risk_amount = size * unit
        return Sizing(
            size=size,
            notional=round(notional, 2),
            risk_amount=round(risk_amount, 2),
            risk_pct=round(risk_amount / equity * 100.0, 4) if equity > 0 else 0.0,
            fill_price=fill,
            capped_by=capped_by,
            exposure_headroom=headroom,
            risk_budget=budget,
            committed=committed,
        )

    def assess(
        self,
        *,
        side: Side,
        confidence: float,
        price: float,
        entry: float | None,
        stop: float | None,
        target: float | None,
        view: PortfolioView,
        now: datetime,
    ) -> Assessment:
        """Evaluate every check for a directional signal and size the position."""
        r = self.risk
        checks: list[RiskCheck] = []
        reasons: list[str] = []

        def add(
            name: str, passed: bool, reason: str, value: str | None, limit: str | None, detail: str | None
        ) -> None:
            checks.append(RiskCheck(name=name, passed=passed, value=value, limit=limit, detail=detail))
            if not passed and reason not in reasons:
                reasons.append(reason)

        # 1. direction
        shorts_ok = side == "LONG" or self.trading.allow_shorts
        add(
            "Direction allowed",
            shorts_ok,
            R_SHORTS,
            side,
            "LONG or SHORT" if self.trading.allow_shorts else "LONG only",
            None if shorts_ok else "Short selling is disabled in the trading settings",
        )
        # 2. halts
        halt_reason, halted_until = self.halt_status(now)
        add(
            "Trading not halted",
            halt_reason is None,
            R_HALTED,
            "Halted" if halt_reason else "Active",
            "Active",
            f"{halt_reason} — resumes {halted_until:%Y-%m-%d %H:%M} UTC"
            if halt_reason and halted_until
            else None,
        )
        # 3. confidence
        add(
            "Confidence",
            confidence >= r.min_ai_confidence,
            R_CONFIDENCE,
            f"{confidence:.0f}%",
            f"≥ {r.min_ai_confidence:.0f}%",
            None,
        )
        # 4. levels
        entry_px = entry if entry is not None else price
        fill = self.fill_estimate(side, price, entry_px)
        levels_ok = (
            stop is not None
            and target is not None
            and (
                (side == "LONG" and stop < fill and target > fill)
                or (side == "SHORT" and stop > fill and target < fill)
            )
        )
        stop_pct = abs(fill - stop) / fill * 100.0 if stop is not None and fill > 0 else None
        in_range = stop_pct is not None and MIN_STOP_PCT <= stop_pct <= MAX_STOP_PCT
        if not levels_ok:
            detail = "Stop and target must sit on opposite sides of the entry"
        elif not in_range:
            detail = f"Stop must be {MIN_STOP_PCT:g}–{MAX_STOP_PCT:g}% from the entry"
        else:
            detail = None
        add(
            "Valid levels",
            bool(levels_ok and in_range),
            R_LEVELS,
            fmt_pct(stop_pct) if stop_pct is not None else None,
            f"{MIN_STOP_PCT:g}–{MAX_STOP_PCT:g}% stop",
            detail,
        )
        # 5. risk / reward (from the levels, never from the analyst's claim)
        rr = None
        if stop is not None and target is not None and abs(entry_px - stop) > 0:
            rr = abs(target - entry_px) / abs(entry_px - stop)
        add(
            "Risk / reward",
            rr is not None and rr >= r.min_risk_reward,
            R_RR,
            f"{rr:.2f}" if rr is not None else None,
            f"≥ {r.min_risk_reward:g}",
            None,
        )
        # 6/7. positions and the symbol's existing position
        reverse = False
        same = view.side_on_symbol == side
        opposite = view.side_on_symbol is not None and not same
        if opposite:
            reverse_needed = r.min_ai_confidence + REVERSAL_EXTRA_CONFIDENCE
            reverse = confidence >= reverse_needed
            add(
                "Existing position",
                reverse,
                R_OPPOSITE,
                f"{view.side_on_symbol} open",
                f"reverse at ≥ {reverse_needed:.0f}% confidence",
                f"Closes the {view.side_on_symbol} first (signal reversal)"
                if reverse
                else f"A reversal needs confidence ≥ {reverse_needed:.0f}%",
            )
        else:
            add(
                "Existing position",
                not same,
                R_SAME,
                f"{view.side_on_symbol} open" if same else "None",
                "No same-direction position",
                "Already positioned this way" if same else None,
            )
        count = view.open_positions - (1 if (opposite and reverse) else 0)
        add(
            "Open positions",
            count < r.max_positions,
            R_POSITIONS,
            str(count),
            f"< {r.max_positions}",
            None,
        )
        # 8-10. size-dependent checks
        sizing: Sizing | None = None
        if levels_ok and stop is not None and view.equity > 0:
            sizing = self.size(side, fill, stop, view, reverse=reverse)
            exposure_after = view.exposure - (view.exposure_on_symbol if reverse else 0.0) + sizing.notional
            exp_pct = exposure_after / view.equity * 100.0
            add(
                "Exposure after entry",
                sizing.exposure_headroom > 0 and exp_pct <= r.max_exposure_pct + 1e-6,
                R_EXPOSURE,
                fmt_pct(exp_pct, decimals=0),
                f"≤ {r.max_exposure_pct:.0f}%",
                f"Size capped by {sizing.capped_by}" if sizing.capped_by else None,
            )
            daily_loss = max(0.0, -view.daily_pnl)
            add(
                "Daily loss budget",
                sizing.risk_budget > 0
                and sizing.committed + sizing.risk_amount <= r.max_daily_loss_usd + 1e-6,
                R_DAILY,
                fmt_usd(sizing.committed + sizing.risk_amount),
                f"≤ {fmt_usd(r.max_daily_loss_usd)}",
                f"Today's loss {fmt_usd(daily_loss)} + open risk {fmt_usd(sizing.committed - daily_loss)} "
                f"+ this trade's risk {fmt_usd(sizing.risk_amount)}",
            )
            add(
                "Minimum notional",
                sizing.notional >= MIN_NOTIONAL,
                R_NOTIONAL,
                fmt_usd(sizing.notional),
                f"≥ {fmt_usd(MIN_NOTIONAL)}",
                None,
            )
        else:
            for name in ("Exposure after entry", "Daily loss budget", "Minimum notional"):
                checks.append(
                    RiskCheck(
                        name=name,
                        passed=False,
                        value=None,
                        limit=None,
                        detail="Not evaluated: no valid stop to size from",
                    )
                )

        approved = all(c.passed for c in checks)
        if same:
            decision = RiskDecision(status="NOT_APPLICABLE", reasons=[R_SAME], checks=checks)
            return Assessment(decision, None, False)
        if approved and sizing is not None:
            decision = RiskDecision(
                status="APPROVED",
                reasons=[],
                checks=checks,
                position_size=sizing.size,
                notional=sizing.notional,
                risk_amount=sizing.risk_amount,
                risk_pct=sizing.risk_pct,
            )
            return Assessment(decision, sizing, reverse)
        self.state.rejections_today += 1
        decision = RiskDecision(status="REJECTED", reasons=reasons or [R_LEVELS], checks=checks)
        return Assessment(decision, None, reverse)

    @staticmethod
    def not_applicable(reason: str = R_HOLD) -> RiskDecision:
        return RiskDecision(status="NOT_APPLICABLE", reasons=[reason], checks=[])

    # ------------------------------------------------------------------
    # snapshot
    # ------------------------------------------------------------------

    def snapshot(self, view: PortfolioView, now: datetime) -> RiskSnapshot:
        r = self.risk
        st = self.state
        equity = view.equity
        daily_loss = max(0.0, -view.daily_pnl)
        exposure_pct = view.exposure / equity * 100.0 if equity > 0 else 0.0
        open_risk_pct = view.open_risk / equity * 100.0 if equity > 0 else 0.0
        dd = -view.drawdown_pct
        meters = [
            make_meter("daily_loss", "Daily loss", daily_loss, r.max_daily_loss_usd, "usd"),
            make_meter("drawdown", "Drawdown", dd, r.max_drawdown_pct, "pct"),
            make_meter("exposure", "Exposure", exposure_pct, r.max_exposure_pct, "pct"),
            make_meter("positions", "Open positions", view.open_positions, r.max_positions, "count"),
            make_meter(
                "consecutive_losses",
                "Consecutive losses",
                st.consecutive_losses,
                r.max_consecutive_losses,
                "count",
            ),
            make_meter(
                "daily_risk",
                "Daily risk (loss + open risk)",
                daily_loss + view.open_risk,
                r.max_daily_loss_usd,
                "usd",
            ),
        ]
        reason, until = self.halt_status(now)
        warnings: list[str] = []
        if reason and until:
            warnings.append(f"Trading is halted until {until:%Y-%m-%d %H:%M} UTC: {reason.lower()}.")
        sentences = {
            "daily_loss": f"Daily loss is {fmt_usd(daily_loss)}, {{u:.0f}}% of the {fmt_usd(r.max_daily_loss_usd)} limit.",
            "drawdown": f"Drawdown is {fmt_pct(dd)}, {{u:.0f}}% of the {fmt_pct(r.max_drawdown_pct, decimals=0)} limit.",
            "exposure": f"Exposure is {fmt_pct(exposure_pct, decimals=0)} of equity, {{u:.0f}}% of the allowed "
            f"{fmt_pct(r.max_exposure_pct, decimals=0)}.",
            "positions": f"{view.open_positions} of {r.max_positions} position slots are in use.",
            "consecutive_losses": f"{st.consecutive_losses} consecutive losses (cooldown at {r.max_consecutive_losses}).",
            "daily_risk": f"Today's loss plus open risk is {fmt_usd(daily_loss + view.open_risk)}, {{u:.0f}}% of the "
            f"daily budget.",
        }
        for m in meters:
            if m.status != "ok":
                warnings.append(sentences[m.key].format(u=m.utilization_pct))
        return RiskSnapshot(
            trading_allowed=reason is None,
            halt_reason=reason,
            halted_until=until,
            equity=round(equity, 2),
            current_exposure=round(view.exposure, 2),
            current_exposure_pct=round(exposure_pct, 4),
            max_exposure_pct=r.max_exposure_pct,
            risk_per_trade_pct=r.risk_per_trade_pct,
            open_risk=round(view.open_risk, 2),
            open_risk_pct=round(open_risk_pct, 4),
            daily_pnl=round(view.daily_pnl, 2),
            daily_loss=round(daily_loss, 2),
            max_daily_loss=r.max_daily_loss_usd,
            drawdown_pct=round(view.drawdown_pct, 4),
            max_drawdown_pct=round(view.max_drawdown_pct, 4),
            max_drawdown_limit_pct=r.max_drawdown_pct,
            open_positions=view.open_positions,
            max_positions=r.max_positions,
            consecutive_losses=st.consecutive_losses,
            max_consecutive_losses=r.max_consecutive_losses,
            min_risk_reward=r.min_risk_reward,
            min_confidence=r.min_ai_confidence,
            rejections_today=st.rejections_today,
            meters=meters,
            warnings=warnings,
            updated_at=now,
        )
