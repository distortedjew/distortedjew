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

## Dashboard

```
npm run dashboard          # http://127.0.0.1:8787
```

Legge `logs/trades.jsonl` (solo la coda, ultimi 8 MB) e mostra: stato del bot (attivo/fermo), equity, PnL, win rate, profit factor, max drawdown, posizioni aperte con PnL, motivi di uscita e di scarto, feed live, ultime operazioni. Si aggiorna ogni 5 secondi, tema chiaro/scuro automatico, nessuna dipendenza esterna.

Variabili: `DASHBOARD_HOST` (default `127.0.0.1`), `DASHBOARD_PORT` (8787), `DASHBOARD_TOKEN`, `TRADES_LOG`.

**Accesso dalla VPS in sicurezza** (consigliato, nessuna porta pubblica):
```
ssh -L 8787:127.0.0.1:8787 utente@tua-vps      # poi apri http://localhost:8787
```
Per esporla altrimenti serve `DASHBOARD_TOKEN` (il server rifiuta di partire su un indirizzo non locale senza token) e un reverse proxy con HTTPS; apri `https://host/?token=...`. Il servizio systemd è in `deploy/sniper-dashboard.service`.
