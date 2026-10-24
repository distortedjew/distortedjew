# Solana memecoin sniper (paper trading)

Simulatore TypeScript, zero dipendenze (Node >= 22.18). **Nessun wallet, nessuna chiave, nessun ordine reale.**

```
cd sniper
npm test      # test su filtri, uscite, slippage/fee, limite di perdita giornaliero
npm start     # loop live: scansiona nuovi token e simula i trade, log in logs/trades.jsonl
```

Flusso: DexScreener (nuovi token) -> RugCheck (sicurezza) -> `filters.ts` (gate d'ingresso) -> `paper.ts` (fill simulati con slippage + fee) -> `strategy.ts` (stop-loss, take-profit a scalini, trailing, timeout).
Parametri in `src/config.ts`, override via env (vedi `loadConfig`).

Limiti noti: polling ogni 15s (uno sniper vero userebbe Geyser/gRPC e latenza in ms); lo slippage simulato è fisso; la sicurezza fallisce "chiusa" se i dati mancano.
Prima di qualsiasi esecuzione reale servono: swap via Jupiter, bundle Jito anti-sandwich, wallet dedicato con fondi minimi.
