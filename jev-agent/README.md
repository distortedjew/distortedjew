# jev-agent

A small always-on decision agent for stocks and crypto, built on **Jev** (TypeSafe AI's fast decision model: a typed choice/score in ~70-500 ms instead of generated text). **Paper trading only.**

```
feed (ticks) -> state -> Jev "higher or lower in HORIZON_SEC?" -> confidence gate -> RISK LAYER -> broker -> logs/decisions.jsonl
```

- `src/model.ts`  Jev via `experimental_evaluate` (AI SDK 7), plus a `MockModel` so it runs with no key.
- `src/risk.ts`   Hard limits outside the model: per-symbol and total exposure caps, order rate limit, daily-loss kill switch (flattens and halts), spot only (no shorting).
- `src/broker.ts` Paper broker: crosses the spread, adds slippage and taker fees.
- `src/feeds.ts`  Binance public websocket (crypto, no key) and a simulated feed for tests.

## Run

```bash
cp .env.example .env
npm install
npm test
npm start                       # MODEL=mock FEED=sim: no key, no network needed
# real data, mock model:        FEED=binance npm start
# real data, real Jev:          MODEL=jev TYPESAFE_AI_API_KEY=... FEED=binance npm start
```

## Always on (VPS)

`sudo bash deploy/install.sh` installs a systemd unit (`Restart=always`, unprivileged user). Watch it with `journalctl -u jev-agent -f`.

## Honest limits

- "Very fast" here means a decision every ~0.5 s per symbol, bounded by API latency. This is not co-located HFT; you won't out-race market makers on latency. Slow decisions are discarded (`MAX_LATENCY_MS`).
- Fees and spread eat short-horizon edge. Run on paper for weeks and read `logs/decisions.jsonl` before trusting any result. Confidence from Jev is calibrated in aggregate, not a guarantee.
- The simulated feed only tests plumbing. The default `MockModel` is not a strategy.
- Stocks are **not implemented yet**: the `Feed`/`Broker` interfaces are ready for an Alpaca adapter (free paper API, market hours only). Live crypto orders are also not implemented; going live is a separate step behind these same risk limits.
