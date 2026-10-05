"""Deterministic simulated crypto market (``FEED=simulated`` and the ``FEED=auto`` fallback).

The market is generated one UTC day at a time, minute by minute, from numpy PCG64 streams
keyed by ``(SIM_SEED, purpose, asset, day)``: the same seed and starting state always give
the same market, a day can be regenerated exactly after a restart, and adding a symbol never
changes the others. Live ticks are not a second model: the live feed reveals the very same
minutes, second by second, along each minute's Brownian bridge.

Model (parameters are set from typical BTC/ETH/SOL behaviour, not tuned to any strategy):

- **Market factor** (≈ BTC) with seven hourly Markov regimes — range, quiet, bull trend, bear
  trend, volatile, breakout up/down. Trends carry drift (≈ ±1 %/day, breakouts ≈ ±4.5 %/day
  for a few hours); range and quiet are mean-reverting around the level where they began
  (consolidation, half-life ≈ 6 h); breakouts usually hand over to a trend in their direction.
  Regimes last hours to days, so trends persist the way crypto trends do while most of the
  minute-to-minute movement stays noise.
- **Volatility clustering**: two AR(1) log-volatility components (half-lives 3 h and 2 days)
  at 5-minute resolution, with a volatility spike after every jump.
- **Fat tails and jumps**: Student-t(5) innovations; Poisson jumps with Laplace sizes whose
  intensity rises in volatile and bearish regimes (bear-market jumps lean down).
- **Intraday seasonality**: volatility and volume peak around the US/EU overlap (~15:00 UTC)
  and bottom out around 03:00 UTC; weekends are quieter.
- **Cross-asset structure**: each asset is ``beta × market + idiosyncratic`` with its own
  stochastic volatility (partly shared with the market's), slow idiosyncratic trends and weak
  mean reversion of its relative price, calibrated to a target daily volatility and correlation
  (ETH ≈ 3.6 %/day, ρ≈0.8; SOL ≈ 4.8 %/day, ρ≈0.72).
- **OHLC** from sub-steps: each 1m candle's intra-minute path is a Brownian bridge between
  consecutive closes (60 sub-steps for recent days — one per live second — and 12 for older
  history). Higher timeframes are exact aggregations of the 1m candles.
- **Volume**: per-asset base volume × seasonality × volatility × |move| × log-normal noise.

History is anchored at its *end*: on first open BTC trades near 97,000, ETH near 3,450 and
SOL near 165 (unknown symbols get a stable hash-derived price and volatility).
"""

from __future__ import annotations

import math
import zlib
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field

import numpy as np

from .candles import CandleArrays
from .symbols import normalize, qty_decimals, tick_size

MINUTES = 1440
DAY = 86_400
BLOCK_MIN = 5  # volatility-process resolution
BLOCKS = MINUTES // BLOCK_MIN
RECENT_SUBSTEPS = 60  # one sub-step per second: what the live feed reveals
OLD_SUBSTEPS = 12
FINE_DAYS = 16  # days (back from the end) built with RECENT_SUBSTEPS

# Market factor: daily volatility before regime / clustering multipliers (≈ 2.7 %/day realised).
MARKET_DAILY_VOL = 0.026
MARKET_SIGMA_MIN = MARKET_DAILY_VOL / math.sqrt(MINUTES)
# Effective daily volatility of the market factor including regimes, clustering and jumps;
# used to turn an asset's (vol, corr) into (beta, idiosyncratic vol).
MARKET_EFFECTIVE_VOL = 0.0275

# Volatility clustering (AR(1) on log-volatility, 5-minute steps)
PHI_FAST = 0.5 ** (1 / 36)  # half-life 3 h
STD_FAST = 0.30
SIG_FAST = STD_FAST * math.sqrt(1 - PHI_FAST**2)
PHI_SLOW = 0.5 ** (1 / 576)  # half-life 2 days
STD_SLOW = 0.25
SIG_SLOW = STD_SLOW * math.sqrt(1 - PHI_SLOW**2)
VOL_VAR = STD_FAST**2 + STD_SLOW**2  # E[exp(2h - 2·var/2·2)] = 1 correction below
JUMP_VOL_BUMP = 0.6
PHI_OWN = 0.5 ** (1 / 72)  # idiosyncratic vol half-life 6 h
STD_OWN = 0.25
SIG_OWN = STD_OWN * math.sqrt(1 - PHI_OWN**2)
SHARED_VOL = 0.7  # how much of the market's log-vol an asset's idiosyncratic vol inherits

# Jumps
JUMPS_PER_DAY = 0.35
JUMP_SCALE = 0.005  # Laplace scale (mean |jump| 0.5 %)
IDIO_JUMPS_PER_DAY = 0.25
IDIO_JUMP_SCALE = 0.007

# Mean reversion
KAPPA_RANGE = math.log(2) / 6.0  # per hour, half-life 6 h
KAPPA_IDIO = math.log(2) / 120.0  # relative price, half-life 5 days
IDIO_TREND_DRIFT = 0.008  # per day while an idiosyncratic trend runs
IDIO_TREND_HOURS = 30.0

T5_SCALE = math.sqrt(5 / 3)  # Student-t(5) to unit variance


@dataclass(frozen=True)
class RegimeSpec:
    drift: float  # per day (log return)
    vol: float  # volatility multiplier
    hours: float  # mean duration
    jumps: float  # jump-intensity multiplier
    jump_up: float  # probability a jump is upward
    revert: bool  # mean-reverting around the level where the regime began
    next: tuple[tuple[str, float], ...]


REGIMES: dict[str, RegimeSpec] = {
    "range": RegimeSpec(
        0.0, 0.80, 40.0, 0.6, 0.5, True,
        (("bull", 0.25), ("bear", 0.22), ("quiet", 0.20), ("volatile", 0.13), ("breakout_up", 0.10), ("breakout_down", 0.10)),
    ),
    "quiet": RegimeSpec(
        0.0, 0.55, 20.0, 0.3, 0.5, True,
        (("range", 0.45), ("breakout_up", 0.25), ("breakout_down", 0.22), ("volatile", 0.08)),
    ),
    "bull": RegimeSpec(
        0.008, 1.00, 56.0, 0.8, 0.6, False,
        (("range", 0.45), ("volatile", 0.20), ("quiet", 0.15), ("bear", 0.10), ("breakout_down", 0.10)),
    ),
    "bear": RegimeSpec(
        -0.0095, 1.15, 44.0, 1.2, 0.35, False,
        (("range", 0.45), ("volatile", 0.25), ("quiet", 0.10), ("bull", 0.10), ("breakout_up", 0.10)),
    ),
    "volatile": RegimeSpec(
        0.0, 1.90, 10.0, 3.0, 0.45, False,
        (("range", 0.40), ("bear", 0.25), ("bull", 0.20), ("breakout_down", 0.08), ("breakout_up", 0.07)),
    ),
    "breakout_up": RegimeSpec(
        0.045, 1.50, 4.0, 2.0, 0.75, False,
        (("bull", 0.60), ("volatile", 0.20), ("range", 0.20)),
    ),
    "breakout_down": RegimeSpec(
        -0.045, 1.50, 3.5, 2.0, 0.25, False,
        (("bear", 0.60), ("volatile", 0.25), ("range", 0.15)),
    ),
}  # fmt: skip
REGIME_NAMES: tuple[str, ...] = tuple(REGIMES)


@dataclass(frozen=True)
class AssetSpec:
    symbol: str
    price: float  # anchor: the price on first open
    daily_vol: float  # total daily volatility (fraction)
    corr: float  # correlation with the market factor
    volume_per_min: float  # average base-asset volume per minute

    @property
    def beta(self) -> float:
        return self.corr * self.daily_vol / MARKET_EFFECTIVE_VOL

    @property
    def idio_vol(self) -> float:
        return self.daily_vol * math.sqrt(max(0.0, 1.0 - self.corr**2))


KNOWN_ASSETS: dict[str, AssetSpec] = {
    spec.symbol: spec
    for spec in (
        AssetSpec("BTC/USDT", 97_000.0, 0.0275, 0.995, 18.0),
        AssetSpec("ETH/USDT", 3_450.0, 0.036, 0.80, 210.0),
        AssetSpec("SOL/USDT", 165.0, 0.048, 0.72, 2_200.0),
        AssetSpec("BNB/USDT", 690.0, 0.030, 0.70, 400.0),
        AssetSpec("XRP/USDT", 2.35, 0.050, 0.65, 300_000.0),
        AssetSpec("DOGE/USDT", 0.32, 0.058, 0.68, 2_500_000.0),
    )
}


def _key(text: str) -> int:
    return zlib.crc32(text.encode())


def asset_spec(symbol: str) -> AssetSpec:
    """Known assets get hand-set parameters; others a stable hash-derived profile."""
    sym = normalize(symbol)
    if sym in KNOWN_ASSETS:
        return KNOWN_ASSETS[sym]
    h = _key(sym)
    u1 = (h & 0xFFFF) / 0xFFFF
    u2 = ((h >> 16) & 0xFF) / 0xFF
    u3 = ((h >> 24) & 0xFF) / 0xFF
    price = float(10 ** (-1.3 + 4.0 * u1))  # $0.05 … $500, log-uniform
    vol = 0.035 + 0.035 * u2
    corr = 0.5 + 0.3 * u3
    volume = 150_000.0 / price  # ≈ $150k per minute
    return AssetSpec(sym, round(price, 6 if price < 1 else 2), vol, corr, volume)


def _season_curves() -> tuple[np.ndarray, np.ndarray, float, float]:
    hour = np.arange(MINUTES) / 60.0
    vol = (
        1.0 + 0.22 * np.cos(2 * np.pi * (hour - 15.0) / 24.0) + 0.06 * np.cos(4 * np.pi * (hour - 9.0) / 24.0)
    )
    volume = 1.0 + 0.45 * np.cos(2 * np.pi * (hour - 15.0) / 24.0)
    # normalise over a week (5 weekdays + 2 quieter weekend days)
    vol_norm = math.sqrt((5 * np.mean(vol**2) + 2 * np.mean((0.82 * vol) ** 2)) / 7)
    volume_norm = (5 * np.mean(volume) + 2 * np.mean(0.68 * volume)) / 7
    return vol, volume, float(vol_norm), float(volume_norm)


_VOL_SEASON, _VOLUME_SEASON, _VOL_NORM, _VOLUME_NORM = _season_curves()


def _weekend(day: int) -> bool:
    return (day + 3) % 7 >= 5  # 1970-01-01 (day 0) was a Thursday


def _stationary_regimes() -> dict[str, float]:
    names = REGIME_NAMES
    idx = {n: i for i, n in enumerate(names)}
    p = np.zeros((len(names), len(names)))
    for n, spec in REGIMES.items():
        stay = 1.0 - 1.0 / spec.hours
        p[idx[n], idx[n]] = stay
        for m, w in spec.next:
            p[idx[n], idx[m]] += (1.0 - stay) * w
    vals, vecs = np.linalg.eig(p.T)
    v = np.real(vecs[:, np.argmin(np.abs(vals - 1.0))])
    v = v / v.sum()
    return {n: float(v[i]) for n, i in idx.items()}


STATIONARY = _stationary_regimes()


def _pick(options: Sequence[tuple[str, float]], u: float) -> str:
    total = sum(w for _, w in options)
    acc = 0.0
    for name, w in options:
        acc += w / total
        if u < acc:
            return name
    return options[-1][0]


# --------------------------------------------------------------------------
# State
# --------------------------------------------------------------------------


@dataclass
class AssetState:
    logp: float  # log close of the last generated minute
    idio: float = 0.0  # cumulative idiosyncratic log return
    idio_anchor: float = 0.0
    h_own: float = 0.0
    trend: int = 0  # idiosyncratic slow trend: -1, 0, +1


@dataclass
class MarketState:
    day: int  # next UTC day (days since the epoch) to generate
    regime: str
    level: float = 0.0  # cumulative market-factor log return
    anchor: float = 0.0  # mean-reversion reference of range/quiet regimes
    h_fast: float = 0.0
    h_slow: float = 0.0
    assets: dict[str, AssetState] = field(default_factory=dict)
    origin_day: int = 0  # first generated day (lets later symbols share the same market path)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> MarketState:
        assets = {k: AssetState(**v) for k, v in data.get("assets", {}).items()}
        return cls(**{**data, "assets": assets})


@dataclass
class DayBlock:
    """One generated UTC day: per-minute log closes, volatility and volume for every asset."""

    day: int
    symbols: tuple[str, ...]
    logp_open: np.ndarray  # (n,) log close before minute 0
    logp: np.ndarray  # (1440, n) log close of each minute
    sigma: np.ndarray  # (1440, n) per-minute volatility (log units), drives the bridges
    volume: np.ndarray  # (1440, n)
    regimes: tuple[str, ...]  # hourly market regime
    seed: int

    @property
    def start(self) -> int:
        return self.day * DAY

    def index(self, symbol: str) -> int:
        return self.symbols.index(symbol)

    def shift(self, deltas: np.ndarray) -> None:
        """Add per-asset log offsets (used to anchor history at its end)."""
        self.logp_open = self.logp_open + deltas
        self.logp = self.logp + deltas[None, :]

    def bridge(self, symbol: str, substeps: int) -> np.ndarray:
        """(1440, substeps) intra-minute log-price paths; the last column is each close."""
        i = self.index(symbol)
        rng = _rng(self.seed, "bridge", self.day, symbol, substeps)
        z = rng.standard_normal((MINUTES, substeps))
        sigma = self.sigma[:, i : i + 1] / math.sqrt(substeps)
        w = np.cumsum(z * sigma, axis=1)
        frac = np.arange(1, substeps + 1) / substeps
        start = np.r_[self.logp_open[i], self.logp[:-1, i]]
        delta = self.logp[:, i] - start
        return start[:, None] + w - frac[None, :] * w[:, -1:] + frac[None, :] * delta[:, None]

    def candles(self, symbol: str, substeps: int) -> CandleArrays:
        """The day's 1m OHLCV arrays for one asset (prices rounded to the asset's tick)."""
        i = self.index(symbol)
        path = self.bridge(symbol, substeps)
        start = np.r_[self.logp_open[i], self.logp[:-1, i]]
        tick = tick_size(float(np.exp(self.logp[-1, i])))
        open_ = _round(np.exp(start), tick)
        close = _round(np.exp(self.logp[:, i]), tick)
        high = np.maximum(_round(np.exp(path.max(axis=1)), tick), np.maximum(open_, close))
        low = np.minimum(_round(np.exp(path.min(axis=1)), tick), np.minimum(open_, close))
        price = float(np.exp(self.logp[-1, i]))
        volume = np.round(self.volume[:, i], qty_decimals(price) + 1)
        t = self.start + np.arange(MINUTES, dtype=np.int64) * 60
        return CandleArrays(t, open_, high, low, close, volume)


def _round(values: np.ndarray, tick: float) -> np.ndarray:
    decimals = max(0, -int(math.floor(math.log10(tick)))) if tick < 1 else 0
    return np.round(np.round(values / tick) * tick, decimals)


def _rng(seed: int, purpose: str, day: int, symbol: str = "", extra: int = 0) -> np.random.Generator:
    entropy = [seed & 0xFFFFFFFF, _key(purpose), day, _key(symbol) if symbol else 0, extra]
    return np.random.Generator(np.random.PCG64(np.random.SeedSequence(entropy)))


# --------------------------------------------------------------------------
# The process
# --------------------------------------------------------------------------


class MarketSimulator:
    """Generates the market one UTC day at a time from a ``MarketState``."""

    def __init__(
        self, seed: int, symbols: Sequence[str], state: MarketState | None = None, *, start_day: int = 0
    ):
        self.seed = int(seed)
        self.specs: dict[str, AssetSpec] = {}
        self.state = state if state is not None else self.initial_state(self.seed, start_day)
        self.ensure_assets(symbols)

    @staticmethod
    def initial_state(seed: int, day: int) -> MarketState:
        """A state drawn from the process's stationary distribution, keyed by (seed, day)."""
        rng = _rng(seed, "init", day)
        names = list(STATIONARY)
        regime = str(rng.choice(names, p=np.array([STATIONARY[n] for n in names])))
        return MarketState(
            day=day,
            regime=regime,
            h_fast=float(rng.normal(0.0, STD_FAST)),
            h_slow=float(rng.normal(0.0, STD_SLOW)),
            origin_day=day,
        )

    @property
    def symbols(self) -> tuple[str, ...]:
        return tuple(self.specs)

    def ensure_assets(self, symbols: Sequence[str]) -> list[str]:
        """Register assets (new ones start at their anchor price); returns those added to the state."""
        added: list[str] = []
        for raw in symbols:
            sym = normalize(raw)
            if sym not in self.specs:
                self.specs[sym] = asset_spec(sym)
            if sym not in self.state.assets:
                rng = _rng(self.seed, "asset-init", self.state.day, sym)
                self.state.assets[sym] = AssetState(
                    logp=math.log(self.specs[sym].price), h_own=float(rng.normal(0.0, STD_OWN))
                )
                added.append(sym)
        return added

    def next_day(self) -> DayBlock:
        """Generate the next day (``state.day``) and advance the state."""
        st = self.state
        day = st.day
        seed = self.seed

        # 1. hourly market regimes
        u = _rng(seed, "regime", day).random((24, 2))
        hourly: list[str] = []
        entered: list[bool] = []
        regime = st.regime
        for hr in range(24):
            spec = REGIMES[regime]
            switched = bool(u[hr, 0] < 1.0 / spec.hours)
            if switched:
                regime = _pick(spec.next, float(u[hr, 1]))
            hourly.append(regime)
            entered.append(switched)
        st.regime = regime
        specs = [REGIMES[r] for r in hourly]
        regime_vol = np.repeat(np.array([s.vol for s in specs]), 60)
        jump_mult = np.repeat(np.array([s.jumps for s in specs]), 60)
        jump_up = np.repeat(np.array([s.jump_up for s in specs]), 60)

        weekend = _weekend(day)
        vol_season = _VOL_SEASON * (0.82 if weekend else 1.0) / _VOL_NORM
        volume_season = _VOLUME_SEASON * (0.68 if weekend else 1.0) / _VOLUME_NORM

        # 2. market jumps
        rj = _rng(seed, "jumps", day)
        has_jump = rj.random(MINUTES) < JUMPS_PER_DAY / MINUTES * jump_mult
        sizes = np.abs(rj.laplace(0.0, JUMP_SCALE, MINUTES))
        up = rj.random(MINUTES) < jump_up
        jumps = np.where(has_jump, np.where(up, sizes, -sizes), 0.0)

        # 3. volatility clustering (5-minute blocks)
        z = _rng(seed, "vol", day).standard_normal((BLOCKS, 2)).tolist()
        jump_blocks = has_jump.reshape(BLOCKS, BLOCK_MIN).any(axis=1).tolist()
        h_fast, h_slow = st.h_fast, st.h_slow
        hf = [0.0] * BLOCKS
        hs = [0.0] * BLOCKS
        for b in range(BLOCKS):
            h_fast = PHI_FAST * h_fast + SIG_FAST * z[b][0]
            h_slow = PHI_SLOW * h_slow + SIG_SLOW * z[b][1]
            hf[b], hs[b] = h_fast, h_slow
            if jump_blocks[b]:
                h_fast += JUMP_VOL_BUMP
        st.h_fast, st.h_slow = h_fast, h_slow
        h_market = np.array(hf) + np.array(hs)
        vol_mult = np.repeat(np.exp(h_market - VOL_VAR), BLOCK_MIN)
        sigma_m = MARKET_SIGMA_MIN * vol_mult * regime_vol * vol_season

        # 4. market innovations, drift and mean reversion (hourly)
        eps = _rng(seed, "noise", day).standard_t(5, MINUTES) / T5_SCALE
        noise = sigma_m * eps + jumps
        hour_noise = noise.reshape(24, 60).sum(axis=1).tolist()
        drift = [0.0] * 24
        level, anchor = st.level, st.anchor
        for hr in range(24):
            spec = specs[hr]
            if spec.revert and entered[hr]:
                anchor = level
            d = spec.drift / MINUTES
            if spec.revert:
                d -= KAPPA_RANGE * (level - anchor) / 60.0
            drift[hr] = d
            level += hour_noise[hr] + 60.0 * d
        st.level, st.anchor = level, anchor
        r_market = noise + np.repeat(np.array(drift), 60)

        # 5. assets
        symbols = self.symbols
        n = len(symbols)
        logp = np.empty((MINUTES, n))
        sigma = np.empty((MINUTES, n))
        volume = np.empty((MINUTES, n))
        logp_open = np.empty(n)
        for i, sym in enumerate(symbols):
            spec_a = self.specs[sym]
            a = st.assets[sym]
            ra = _rng(seed, "asset", day, sym)
            z_own = ra.standard_normal(BLOCKS).tolist()
            h_own = a.h_own
            ho = [0.0] * BLOCKS
            for b in range(BLOCKS):
                h_own = PHI_OWN * h_own + SIG_OWN * z_own[b]
                ho[b] = h_own
            a.h_own = h_own
            log_vol = SHARED_VOL * h_market + np.array(ho) - (SHARED_VOL**2 * VOL_VAR + STD_OWN**2)
            idio_mult = np.repeat(np.exp(log_vol), BLOCK_MIN)
            idio_sigma = spec_a.idio_vol / math.sqrt(MINUTES) * idio_mult * np.sqrt(regime_vol) * vol_season
            eps_i = ra.standard_t(5, MINUTES) / T5_SCALE
            jump_i = np.where(
                ra.random(MINUTES) < IDIO_JUMPS_PER_DAY / MINUTES * np.sqrt(jump_mult),
                ra.laplace(0.0, IDIO_JUMP_SCALE, MINUTES),
                0.0,
            )
            idio_noise = idio_sigma * eps_i + jump_i
            # slow idiosyncratic trends + weak mean reversion of the relative price
            ut = ra.random((24, 2)).tolist()
            idio_hour = idio_noise.reshape(24, 60).sum(axis=1).tolist()
            idio_drift = [0.0] * 24
            idio, trend = a.idio, a.trend
            for hr in range(24):
                if ut[hr][0] < 1.0 / IDIO_TREND_HOURS:
                    trend = 0 if ut[hr][1] < 0.5 else (1 if ut[hr][1] < 0.75 else -1)
                d = trend * IDIO_TREND_DRIFT / MINUTES - KAPPA_IDIO * (idio - a.idio_anchor) / 60.0
                idio_drift[hr] = d
                idio += idio_hour[hr] + 60.0 * d
            a.idio, a.trend = idio, trend
            r_i = spec_a.beta * r_market + idio_noise + np.repeat(np.array(idio_drift), 60)

            logp_open[i] = a.logp
            path = a.logp + np.cumsum(r_i)
            a.logp = float(path[-1])
            logp[:, i] = path
            total_sigma = np.sqrt((spec_a.beta * sigma_m) ** 2 + idio_sigma**2)
            sigma[:, i] = total_sigma
            # volume: seasonality × activity × |move| × noise (mean ≈ volume_per_min)
            typical = spec_a.daily_vol / math.sqrt(MINUTES)
            activity = (total_sigma / typical) ** 0.8
            surprise = (0.6 + 0.4 * np.abs(r_i) / np.maximum(total_sigma, 1e-12)) / 0.9
            noise_v = ra.lognormal(-0.5 * 0.35**2, 0.35, MINUTES)
            volume[:, i] = spec_a.volume_per_min * volume_season * activity * surprise * noise_v

        st.day = day + 1
        return DayBlock(
            day=day,
            symbols=symbols,
            logp_open=logp_open,
            logp=logp,
            sigma=sigma,
            volume=volume,
            regimes=tuple(hourly),
            seed=seed,
        )


# --------------------------------------------------------------------------
# History generation
# --------------------------------------------------------------------------


@dataclass
class SimHistory:
    """Generated history up to ``end`` (exclusive) plus what the live feed continues from."""

    end: int  # unix seconds, minute-aligned: the first minute NOT in the history (the live one)
    minutes: dict[str, CandleArrays]  # 1m candles per symbol, from origin to end
    current: DayBlock  # the block of the day containing ``end``
    simulator: MarketSimulator  # state positioned after ``current``
    day_state: MarketState  # state at the start of ``current`` (persisted for exact restarts)

    def candles(self, symbol: str, timeframe_seconds: int, since: int | None = None) -> CandleArrays:
        """Closed candles of a timeframe (the trailing partial bucket is excluded)."""
        m = self.minutes[symbol]
        agg = m.aggregate(timeframe_seconds)
        closed_end = self.end - self.end % timeframe_seconds
        return agg.window(since, closed_end)


def _copy_state(state: MarketState) -> MarketState:
    return MarketState.from_dict(state.to_dict())


def generate_history(
    seed: int,
    symbols: Sequence[str],
    end: int,
    days: int,
    *,
    origin_day: int | None = None,
    anchor: bool = True,
) -> SimHistory:
    """Simulate ``days`` full UTC days plus the current day up to ``end`` (minute-aligned).

    With ``anchor`` the series is shifted so the last close equals each asset's anchor price
    (BTC ≈ 97,000 on first open). ``origin_day`` replays the market factor from an earlier
    origin, so a symbol added later shares the exact market path of the others.
    """
    end = end - end % 60
    end_day = end // DAY
    start_day = end_day - days if origin_day is None else origin_day
    sim = MarketSimulator(seed, symbols, start_day=start_day)
    parts: dict[str, list[CandleArrays]] = {s: [] for s in sim.symbols}
    day_state = _copy_state(sim.state)
    blocks: list[DayBlock] = []
    while sim.state.day <= end_day:
        day_state = _copy_state(sim.state)
        blocks.append(sim.next_day())
    current = blocks[-1]
    minutes_today = (end - current.start) // 60
    if anchor:
        last_minute = minutes_today - 1
        last = current.logp[last_minute] if last_minute >= 0 else current.logp_open
        deltas = np.array([math.log(sim.specs[s].price) for s in sim.symbols]) - last
        for b in blocks:
            b.shift(deltas)
        for i, s in enumerate(sim.symbols):
            sim.state.assets[s].logp += float(deltas[i])
            day_state.assets[s].logp += float(deltas[i])
    for b in blocks:
        fine = (end_day - b.day) < FINE_DAYS
        for s in sim.symbols:
            arrays = b.candles(s, RECENT_SUBSTEPS if fine else OLD_SUBSTEPS)
            if b is current:
                arrays = arrays.window(None, end)
            parts[s].append(arrays)
    minutes = {s: CandleArrays.concat(p) for s, p in parts.items()}
    return SimHistory(end=end, minutes=minutes, current=current, simulator=sim, day_state=day_state)


def regenerate_day(seed: int, state: MarketState, symbols: Sequence[str]) -> tuple[DayBlock, MarketSimulator]:
    """Regenerate the day ``state.day`` exactly (restart recovery); returns the block and the
    simulator positioned after it."""
    sim = MarketSimulator(seed, symbols, _copy_state(state))
    block = sim.next_day()
    return block, sim
