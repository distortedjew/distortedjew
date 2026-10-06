# sol-arb

A Solana cyclic-arbitrage bot. Every tick (default 1s) it asks Jupiter for the best
route `BASE -> X` and then `X -> BASE` (e.g. USDC -> SOL -> USDC). If the round trip
returns more than `input + fees + MIN_PROFIT`, it puts **both swaps in one
transaction** with leg 2's minimum-out set to that number.

That makes every trade atomic: it either lands profitable or reverts. With Jito
(`JITO=on`, the default, sent as a single-tx bundle) a trade that would revert is never
included, so failed attempts cost nothing. Via plain RPC a revert still pays the base +
priority fee.

## Read this before you put money in

- **Expect few or no profitable trades.** Solana arbitrage is one of the most
  competitive games in crypto. Professional searchers run co-located nodes, read
  pool state directly via Geyser, and react in milliseconds. A bot polling a public
  quote API once a second will mostly see opportunities after they are gone. The
  atomic design protects you from *losing* on a trade; it can't make the trades exist.
- **Your costs are real**: RPC and Jupiter API subscriptions, plus Jito tips on landed
  trades. Run in dry-run mode first and look at how often `OPPORTUNITY` appears
  before deciding whether to go live.
- **Use a dedicated wallet** holding only what you're willing to lose. Never your main wallet.
- Nothing here is financial advice, and this code has not been audited.

## Setup

```bash
cd sol-arb
npm install
cp .env.example .env     # edit it
npm test
```

Wallet: `solana-keygen new -o wallet.json`, then set `WALLET=./wallet.json`. Fund it with
some SOL for fees (≥ `MIN_SOL_BALANCE`) and the base token (USDC by default) of at
least `TRADE_SIZE`.

## Run

```bash
# 1. quotes only: no wallet needed, nothing signed
npx tsx --env-file=.env src/index.ts

# 2. with WALLET set, LIVE=off: builds and SIMULATES each opportunity, sends nothing
# 3. LIVE=on: real transactions
```

Output looks like:

```
12:00:01.204 OPPORTUNITY 50 -> 50.061 | net +0.034 | Raydium>Orca / Meteora
12:00:01.611   LANDED 5Kx…  | base Δ 0.0352
12:00:01.611   day net 0.000231 SOL
```

## Rate limits — the real bottleneck

Each tick checks one intermediate token (round-robin), so it uses 2 quotes/second.
The free `lite-api.jup.ag` tier will rate-limit that; the bot backs off 5s on HTTP
429. To actually scan every second you need a paid Jupiter key
(`JUPITER_URL=https://api.jup.ag/swap/v1`, `JUPITER_API_KEY=…`) or a self-hosted
Jupiter API, plus a paid RPC.

## Safety stops (src/risk.ts)

| Setting | Effect |
|---|---|
| `LIVE=off` (default) | never sends a transaction |
| `MAX_TRADES_PER_MIN` | caps sends per rolling minute |
| `DAILY_LOSS_LIMIT_SOL` | halts sending for the rest of the UTC day once fees − profit exceed it |
| `MAX_CONSECUTIVE_FAILURES` | halts until restart |
| `MIN_SOL_BALANCE` | never drains SOL needed for fees |
| `SIMULATE=on` | simulates before sending; skips anything that would revert |

## Files

- `src/arb.ts` — cycle evaluation and the profit-locking minimum-out math (pure, tested)
- `src/jupiter.ts` — Jupiter quote / swap-instructions client
- `src/executor.ts` — builds the two-leg v0 transaction, simulates, sends via Jito or RPC, confirms
- `src/risk.ts` — hard stops
- `src/index.ts` — the 1-second loop
