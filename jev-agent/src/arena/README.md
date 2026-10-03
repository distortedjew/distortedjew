# Strategy arena: tournament rules

You are a strategy researcher competing in a tournament. Build ONE strategy, backtest it, report honestly.

## The harness (locked)
- `src/arena/harness.ts` defines `Strategy` and `Ctx`. **Do not modify it**, `run.ts`, or any file other than your own strategy file.
- Your strategy is `src/arena/strategies/<your-id>.ts`, and its default export implements `Strategy`. Look at `incumbent-trend.ts` and `bench-*.ts` for examples.
- `onBar(ctx)` is called every trading day at the close, including the warm-up history before the scored window, so stateful indicators can warm up. Return target weights `{SYMBOL: fraction}`, or `null` for no change. Fills happen at the **next open**. Long-only, no leverage (sum ≤ 1), and every trade pays the arena cost.
- You may keep state in module-level variables. You may import from `src/strategy/*` (e.g. `trend.ts`, `reversion.ts`) and `src/backtest.ts`. No network access, no new npm packages.
- One split must run in under 60 s.

## Arenas
| Arena | Assets | Cost/side | Train | Validation |
|---|---|---|---|---|
| `crypto` | BTC ETH SOL DOGE AVAX LINK (daily) | 0.30% | 2018-2021 | 2022 → 2024-06 |
| `etf` | 26 ETFs: SPY QQQ IWM DIA VTI EFA EEM VNQ TLT IEF SHY AGG LQD HYG TIP GLD SLV XLB XLE XLF XLI XLK XLP XLU XLV XLY | 0.05% | 2008-2018 | 2019-2023 |

There is also a sealed holdout period after validation. You do not have that data, and you must not try to obtain it. **Do not read files outside `jev-agent/`.** The organiser tests the finalists on the holdout once.

## Commands
```
npx tsx src/arena/run.ts --arena crypto --strategy src/arena/strategies/<id>.ts --split train
npx tsx src/arena/run.ts --arena crypto --strategy src/arena/strategies/<id>.ts --split validation
```

## Scoring
**score = min(train Sharpe, validation Sharpe).** A strategy has to work in both periods. Ties go to higher validation CAGR, then smaller max drawdown.

Bars to beat (score):
- crypto: incumbent-trend **1.22** (train 1.98, val 1.22, val CAGR 15.3%, val DD -8.1%)
- etf: bench-6040 **0.64** (train 0.64, val 0.82) and incumbent-trend **0.65** (train 0.79, val 0.65)

## Research discipline (this decides whether your result is real)
- Start from an economic reason or published evidence, not from curve fitting. Say what it is.
- **Develop and tune on `train` only.** Run `validation` at most **3 times** in total. If you tune on validation, the score is meaningless.
- Prefer few parameters and round, conventional values (20, 50, 200 days, and so on). Avoid fragile thresholds.
- Before you report, check robustness on train: nudge your main parameters by about ±25%. A strategy that only works at one exact setting is overfit, so say so.
- Report honestly, including when you fail. A clean "this doesn't beat the bar" is a valid and useful result.

## What to report (final message)
1. File path and strategy name.
2. Idea and evidence (2-4 sentences), parameter list.
3. The `RESULT` JSON lines for train and validation (copy them exactly), and your score.
4. Robustness notes, how many validation runs you used, and any concerns (e.g. depends on one asset or one year).
