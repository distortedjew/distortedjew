# Analisi: cosa funziona nei video storytelling animati/AI

## Limiti onesti di questa ricerca
- Le ricerche web hanno restituito soprattutto blog SEO/affiliati e vendor di tool AI. **Non ho trovato una lista verificata di canali long-form
  sia "AI-nativi" sia virali**, e i numeri di iscritti sono discordanti tra le fonti.
- Dal sandbox in cui ho lavorato YouTube non è raggiungibile: **non ho potuto vedere frame/script reali** dei canali.
  Quindi lo "stile" qui sotto è sintesi di fonti secondarie + best practice, da **validare con la tua analisi diretta** (vedi "Prossimo passo").

## Canali di riferimento citati dalle fonti (animati, non tutti AI)
| Canale | Cosa si impara | Nota |
|---|---|---|
| fern | documentari animati di storie vere, stile minimale, narrazione forte | animazione tradizionale |
| SCP Explained | horror/fiction animata, atmosfera costante | |
| Kurzgesagt | flat design coerente, un'idea per video, mesi di lavoro | qualità-bersaglio, non replicabile in automatico |
| Skibidi Toilet (DaFuq!?Boom) | premessa assurda + serialità | 3D, non AI |
| Canali "storie con morale" / stickman / 3D Pixar-like | formato AI-friendly: immagini fisse animate + voce | citati da tutorial, numeri non verificati |

## Pattern ricorrenti (da fonti secondarie, **non verificati con dati propri**)
1. **Hook nei primi ~15s**: momento di tensione/payoff mostrato subito, niente intro.
2. **Conflict arc**: hook → ascesa → conflitto → rimonta → colpo di scena → payoff/morale. Il conflitto rende la storia meno prevedibile.
3. **Un protagonista, un desiderio**, ostacoli crescenti, open loop a fine capitolo.
4. **Cambio immagine ogni ~8-15s**; immagini statiche >10s peggiorano la retention (quindi: Ken Burns + scene corte).
5. **Calo tipico tra minuto 2 e 5**: servono pattern interrupt/open loop lì.
6. **Retention target** animati: 60-70% di view medio per video brevi (indicazione di un vendor).
7. **Coerenza visiva**: stile fisso + descrizione fissa dei personaggi in ogni prompt.
8. Voce con pause e ritmo lento per tensione; sottotitoli bruciati.

Tutti questi punti sono già codificati nei prompt (`ytp/script_gen.py`), in `channel.json` (stile) e nel montaggio (`ytp/assemble.py`).

## Rischi (importanti)
- **Monetizzazione**: YouTube sanziona contenuti "mass-produced"/template senza reale apporto creativo. Un canale 100% automatico con lo stesso
  schema ripetuto rischia la demonetizzazione. Mitigazioni: varia format/personaggi, cura idee e stile, rivedi i video prima della pubblicazione
  (la pipeline li carica **privati con pubblicazione programmata**: hai qualche ora per controllare e cancellare).
- **Disclosure**: la pipeline imposta `containsSyntheticMedia=true` e aggiunge una nota in descrizione.
- **Qualità free-tier**: Pollinations/FLUX gratuiti sono più lenti e meno coerenti di Midjourney/Kling; l'"animazione" è Ken Burns, non video generativo.

## Prossimo passo consigliato
Dammi 5-10 URL di canali/video che ti piacciono: sul tuo PC (o in un ambiente con accesso a YouTube) scarico con yt-dlp, estraggo frame, trascrivo
con Whisper e ricavo ritmo reale (durata scene, wpm, struttura) per tarare `channel.json` e i prompt.

## Fonti
- https://outlierkit.com/resources/faceless-youtube-channels/
- https://awisee.com/blog/successful-faceless-youtube-channels/
- https://blog.autonolab.com/niches/2025-12-02-faceless-youtube-ai-storytelling/
- https://longstories.ai/blog/retention-benchmarks-animated-youtube-videos
- https://channel.farm/blog/storytelling-ai-video-scripts-long-form-youtube
- https://recapio.com/digest/how-to-make-viral-ai-story-videos-like-botlm-2-0-free-ai-tools-faceless-video-tutorial-2025-by-ai-na

## Aggiornamento: nicchia scelta = stile fern (storie vere, animazione procedurale)
Dalle fonti: fern = documentari animati di storie vere, grafica piatta e minimale, narrazione forte. Scelta fatta perché è l'unico stile tra quelli
trovati che **si può riprodurre in modo credibile con codice** (forme vettoriali, mappe, testi) senza modelli generativi di immagini.
Differenza dichiarata: la qualità di illustrazione/animazione di un canale vero è molto superiore; qui si parte da un look pulito ma semplice.
Come per il resto, **non ho analizzato frame reali di fern** (YouTube non raggiungibile): invia link se vuoi tarare ritmo e palette sui loro video.
