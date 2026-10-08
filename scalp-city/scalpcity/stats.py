"""Performance stats across every day in a dashboard state file (served at /api/stats)."""

from __future__ import annotations

from collections import defaultdict


def _group(trades: list[dict], key) -> list[dict]:
    g: dict[str, list[float]] = defaultdict(list)
    for t in trades:
        g[key(t)].append(t["pnl"])
    rows = [{"key": k, "trades": len(v), "wins": sum(p > 0 for p in v), "pnl": round(sum(v), 2)} for k, v in g.items()]
    return sorted(rows, key=lambda r: -r["trades"])


def compute(state: dict) -> dict:
    trades = [{**t, "worker": w["name"], "date": d}
              for w in state.get("workers", []) for d, dl in (w.get("days") or {}).items() for t in dl.get("trades", [])]
    hist = state.get("history", [])

    equity, cum, peak, max_dd = [], 0.0, 0.0, 0.0
    for h in hist:
        cum += h["pnl"]
        peak = max(peak, cum)
        max_dd = min(max_dd, cum - peak)
        equity.append({"date": h["date"], "pnl": h["pnl"], "cum": round(cum, 2), "dd": round(cum - peak, 2)})

    pnl = [t["pnl"] for t in trades]
    wins, losses = [p for p in pnl if p > 0], [p for p in pnl if p <= 0]
    streak = 0
    for h in reversed(hist):  # current run of green (+) or red (-) days
        s = 1 if h["pnl"] > 0 else -1
        if streak == 0 or (streak > 0) == (s > 0):
            streak += s
        else:
            break

    return {
        "totals": {
            "days": len(hist),
            "green_days": sum(1 for h in hist if h["pnl"] > 0),
            "total": round(sum(h["pnl"] for h in hist), 2),
            "avg_day": round(sum(h["pnl"] for h in hist) / len(hist), 2) if hist else 0.0,
            "best_day": max(hist, key=lambda h: h["pnl"], default=None),
            "worst_day": min(hist, key=lambda h: h["pnl"], default=None),
            "max_drawdown": round(max_dd, 2),
            "trades": len(trades),
            "win_rate": round(len(wins) / len(trades), 4) if trades else 0.0,
            "avg_win": round(sum(wins) / len(wins), 2) if wins else 0.0,
            "avg_loss": round(sum(losses) / len(losses), 2) if losses else 0.0,
            "profit_factor": round(sum(wins) / -sum(losses), 2) if sum(losses) < 0 else None,
            "expectancy": round(sum(pnl) / len(pnl), 2) if pnl else 0.0,
            "streak": streak,
        },
        "equity": equity,
        "by_worker": _group(trades, lambda t: t["worker"]),
        "by_trigger": _group(trades, lambda t: "+".join(t["triggers"])),
        "by_exit": _group(trades, lambda t: t["reason"]),
        "by_side": _group(trades, lambda t: t["right"]),
        "by_hour": sorted(_group(trades, lambda t: t["opened"][:2] + ":00"), key=lambda r: r["key"]),
    }
