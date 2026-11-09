# Pipeline YouTube automatica (gratis)

> **Motore attuale: Remotion (procedurale), nicchia stile *fern*** — documentari animati su storie vere, grafica piatta/minimale generata da codice
> (cielo, città, personaggi senza volto, mappe, timeline, statistiche). **Nessuna API per le immagini.** Il vecchio motore a immagini AI resta
> disponibile con `--engine images`.

**Idea → script (Gemini) → immagini (Pollinations/FLUX) → voce (edge-tts) → video (ffmpeg) → upload programmato su YouTube**, tutto in GitHub Actions.
Vedi `docs/ANALISI.md` per lo stile e i limiti della ricerca.

## Costo: 0 €
| Fase | Tool | Nota |
|---|---|---|
| Script | Gemini API (free tier AI Studio) | `GEMINI_API_KEY` |
| Grafica | **Remotion** (React/SVG, procedurale, `remotion/src`) | nessuna chiave; ~65 fps di render su 4 CPU → video da 8 min in ~4 min |
| (alt.) Immagini AI | Pollinations / HF FLUX con `--engine images` | quota/velocità variabili |
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
- Anteprima grafica: `cd remotion && npm i && npm run studio`.
- Locale: `python -m ytp.run --dry-run` (test senza API) · `python -m ytp.run --no-upload`.
- Personalizza nicchia, stile visivo, voce, durata in `channel.json`.

## Come funziona il motore Remotion
Gemini scrive uno script **strutturato**: ogni scena ha un `kind` (`narrate` illustrata, `map`, `timeline`, `stat`, `quote`, `title`) + parametri
(ambientazione, umore, notte, n. personaggi, titoletto "Londra, 1666"). `edge-tts` produce la voce per scena → la durata in frame → Remotion
compone: sfondi parallax procedurali, personaggi, mappe con rotta che si disegna, timeline, contatori, sottotitoli, musica. Aggiungere un nuovo tipo
di scena = un componente React in `remotion/src/scenes/` + il `kind` in `ytp/doc_script.py`.

**GPU/CPU**: Remotion renderizza via Chromium su CPU; per questa grafica 2D la GPU non serve. Sul tuo PC usa `--concurrency N` (N = core).

## Stato verifiche
- ✅ Testato: render Remotion di tutti i tipi di scena (controllati i frame), orchestratore in `--dry-run`, montaggio ffmpeg del motore `images` (`pytest tests`).
- ⚠️ **Non testato end-to-end**: chiamate a Gemini, edge-tts e upload YouTube (il sandbox di sviluppo non raggiungeva questi servizi). Primo run consigliato: `workflow_dispatch` con `no_upload`, controlla l'artifact, poi abilita l'upload.
- Dettagli API da ricontrollare: la fonte trovata era contraddittoria su costo quota upload e restrizioni per progetti non verificati; se i video restano privati senza programmazione, serve l'audit del progetto API.
- **Accuratezza storica**: è una nicchia di storie vere e l'LLM può sbagliare date/cifre. Il prompt impone fatti verificabili, citazioni solo attestate e una lista di fonti
  in descrizione, ma **rivedi `output/*.script.json` prima della pubblicazione** (il video esce privato/programmato proprio per questo).
- Miniature: nel motore Remotion non sono ancora generate (YouTube userà un frame automatico); da aggiungere con `remotion still`.
