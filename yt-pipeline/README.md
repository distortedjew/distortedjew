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
Gemini scrive uno script **strutturato e diretto come un film**:
- **Personaggi stickman con personalità** (`remotion/src/stick.tsx`): rig con braccia/gambe a due segmenti, volto con occhi che sbattono, sopracciglia e bocca
  per 8 emozioni (neutral, happy, sad, angry, scared, surprised, thinking, smug), 9 azioni (idle, walk, run, wave, point, shrug, think, cower, celebrate),
  accessori (cappello, capelli, occhiali, barba, baffi, sciarpa) e oggetti (lettera, torcia, lanterna, libro). Ogni personaggio ha un *tratto*
  (nervous, confident, grumpy, cheerful, wise, energetic) che cambia postura, ritmo dell'idle ed emozione di default; emote sopra la testa (!, ?, sudore, rabbia).
- **Ambienti dettagliati** (`env.tsx`): 11 ambientazioni (strada, villaggio, campo, foresta, mare, montagna, deserto, stanza, castello, laboratorio, grotta) × 4 momenti
  (alba/giorno/tramonto/notte) × meteo (pioggia, neve, nebbia, fuoco), a strati con parallax, finestre illuminate, lampioni, fumo, onde, fiamme, ecc.
- **Camera cinematografica** (`camera.ts`): static, push_in, pull_out, pan_left/right, tilt_up/down, shake, follow + leggero "handheld"; vignettatura e color grading per umore.
- **Transizioni** (`Story.tsx`): cut, fade, slide, wipe, flip, clock (con sovrapposizione, sottotitoli e audio restano sincronizzati).
- **Audio** (`ytp/synth_audio.py`): effetti (whoosh, boom, impact, thunder, ding, bell, tick, paper, heartbeat, knock, clang, stinger, passi),
  ambienti in loop per ogni location/meteo, musica di sottofondo per umore (calm/tense/joy/sad) con crossfade; tutto **sintetizzato da codice** (gratis, senza licenze).
  Per musica più bella metti i tuoi mp3 *royalty-free* in `assets/music/{calm,tense,joy,sad}.mp3`: hanno la precedenza.

Aggiungere nuove ambientazioni/azioni = un componente in `remotion/src/` + il valore ammesso in `ytp/doc_script.py` (il validatore scarta tutto ciò che non conosce).

**GPU/CPU**: Remotion renderizza via Chromium su CPU; per questa grafica 2D la GPU non serve. Sul tuo PC usa `--concurrency N` (N = core).
Tempo di render misurato su 4 CPU: circa 21 frame/s (stress test: 3.816 frame in 3 minuti, 24 scene con tutte le ambientazioni, camere e transizioni) → un video da 8 minuti (~12.000 frame) richiede ~10 minuti.

## Stato verifiche
- ✅ Testato: render di personaggi/ambienti/camere (controllati i frame), transizioni (controllate nel video), mix audio (livelli misurati), validatore dello script, `--dry-run` completo con audio (`pytest tests`).
- ⚠️ **Non ascoltato**: musica ed effetti sintetici sono verificati solo numericamente (non ho un orecchio). Aspettati un suono semplice/"da chiptune morbido": per la musica conviene sostituire con tracce royalty-free.
- ⚠️ **Non testato end-to-end**: chiamate a Gemini, edge-tts e upload YouTube (il sandbox di sviluppo non raggiungeva questi servizi). Primo run consigliato: `workflow_dispatch` con `no_upload`, controlla l'artifact, poi abilita l'upload.
- Dettagli API da ricontrollare: la fonte trovata era contraddittoria su costo quota upload e restrizioni per progetti non verificati; se i video restano privati senza programmazione, serve l'audit del progetto API.
- **Accuratezza storica**: è una nicchia di storie vere e l'LLM può sbagliare date/cifre. Il prompt impone fatti verificabili, citazioni solo attestate e una lista di fonti
  in descrizione, ma **rivedi `output/*.script.json` prima della pubblicazione** (il video esce privato/programmato proprio per questo).
- Miniature: nel motore Remotion non sono ancora generate (YouTube userà un frame automatico); da aggiungere con `remotion still`.
