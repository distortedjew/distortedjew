# Pipeline YouTube automatica (gratis)

**Idea → script (Gemini) → immagini (Pollinations/FLUX) → voce (edge-tts) → video (ffmpeg) → upload programmato su YouTube**, tutto in GitHub Actions.
Vedi `docs/ANALISI.md` per lo stile e i limiti della ricerca.

## Costo: 0 €
| Fase | Tool | Nota |
|---|---|---|
| Script | Gemini API (free tier AI Studio) | `GEMINI_API_KEY` |
| Immagini | Pollinations (no chiave) o HF FLUX (`HF_TOKEN` gratuito) | quota/velocità variabili |
| Voce | edge-tts (it-IT-DiegoNeural, ecc.) | no chiave |
| Video | ffmpeg: Ken Burns, sottotitoli, musica | |
| Hosting | GitHub Actions | gratis su repo pubblici; ~2000 min/mese su privati |
| Upload | YouTube Data API v3 | quota default 10.000 unità/giorno |

## Setup (una volta)
1. **Gemini**: chiave gratuita su https://aistudio.google.com → secret `GEMINI_API_KEY`.
2. **YouTube API**: Google Cloud Console → nuovo progetto → abilita *YouTube Data API v3* → credenziali *OAuth client ID* (tipo Desktop) → scarica `client_secret.json`.
   Schermata consenso OAuth: aggiungi te come utente di test, poi **pubblica l'app ("In production")**: in modalità *Testing* il refresh token scade dopo 7 giorni.
3. Sul tuo PC: `pip install -r requirements.txt && python -m ytp.auth client_secret.json` → stampa `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN`.
4. Su GitHub → Settings → Secrets → Actions: aggiungi `GEMINI_API_KEY`, `YT_CLIENT_ID`, `YT_CLIENT_SECRET`, `YT_REFRESH_TOKEN` (opz. `HF_TOKEN`).
5. (Opz.) metti musica libera da diritti in `assets/music/*.mp3`.
6. Verifica la verifica del canale via telefono (serve per miniature personalizzate e video >15 min).

## Uso
- Automatico: `.github/workflows/youtube.yml` gira ogni giorno 14:00 UTC; il video viene caricato **privato con `publishAt`** = ora + `publish_delay_hours` (default 3h → esce alle 17:00 UTC).
  Cambia l'ora modificando il `cron` e `publish_delay_hours`.
- Manuale: Actions → *youtube-video* → Run workflow (opz. "no_upload").
- Locale: `python -m ytp.run --dry-run` (test senza API) · `python -m ytp.run --no-upload`.
- Personalizza nicchia, stile visivo, voce, durata in `channel.json`.

## Stato verifiche
- ✅ Testato: montaggio ffmpeg, sottotitoli, mix musicale, orchestratore in `--dry-run` (`pytest tests`).
- ⚠️ **Non testato end-to-end**: chiamate a Gemini, Pollinations, edge-tts e upload YouTube (il sandbox di sviluppo non raggiungeva questi servizi). Primo run consigliato: `workflow_dispatch` con `no_upload`, controlla l'artifact, poi abilita l'upload.
- Dettagli API da ricontrollare: la fonte trovata era contraddittoria su costo quota upload e restrizioni per progetti non verificati; se i video restano privati senza programmazione, serve l'audit del progetto API.
