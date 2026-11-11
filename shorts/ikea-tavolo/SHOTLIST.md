# Piano inquadrature — "Il tavolo che non entrava in macchina"

Tempi **stimati** (3,7 parole/s, ~57 s = ~1710 f a 30 fps). Vanno riallineati alle parole vere in `voice/words.json` quando c'è la voce.
Luce: giorno salvo dove indicato. Ogni reazione visiva 0-3 f prima della sua parola.

| # | Beat | Sec | Frame | Inquadratura / azione | Luce |
|---|------|-----|-------|------------------------|------|
| 1 | Hook | 0-5 | 0-150 | Primo piano sul tavolo davanti al baule aperto di una piccola auto anni '50, non entra. Push-in. Flash bianco a f150. | giorno |
| 2 | Ambientazione | 5-11.5 | 150-345 | Panoramica sulla casetta rossa di Älmhult, Kamprad con la cartella del catalogo. Pacco di legno che arriva rotto. | giorno |
| 3 | Azione 1 | 11.5-16 | 345-480 | I rivenditori (cappelli, baffi) dicono ai fornitori "no" davanti a una fabbrica. | giorno |
| 4 | Azione 2 | 16-20 | 480-600 | Cartello "FIERA DEL MOBILE" con IKEA lasciata fuori dal cancello (cartello senza testo: icona/ombra, la skill non vuole didascalie). | giorno |
| 5 | Azione 3 | 20-23 | 600-690 | Camion di fornitori con targa "neutra", scatole travestite. | giorno |
| 6 | Scatto | 23-31 | 690-930 | Lundgren con il tavolo davanti all'auto; svita le gambe, il tavolo scivola dentro. Kick d'impatto a "entra". | dorato |
| 7 | Doppia battuta | 31-37 | 930-1110 | Kamprad su un camion verso la Polonia, sorriso; concorrenti sconsolati. | giorno |
| 8 | Spiegazione | 37-46 | 1110-1380 | Confronto: tavolo montato pieno d'aria (nuvolette) vs scatola piatta; valigia contro armadio su un camion. | giorno |
| 9 | Conseguenza | 46-52 | 1380-1560 | Cartellini prezzo che scendono; cliente con la scatola in spalla. | giorno |
| 10 | Finale | 52-57 | 1560-1710 | Tavolo Lövbacken rilanciato, gambe già smontate nella scatola; omino con la brugola. | dorato |

## Cosa va riscritto nel template (7.900 righe, tutto specifico del ponte)
- `story.ts`: SHOTS/CAMS/KICKS/DOF/FOREGROUND per questo piano; rimuovere fisica del ponte (SNAP, DROP, march, COUNT).
- `build.ts` + `paint.ts`: mondo = Älmhult anni '50 (casetta rossa, piazzale, fabbrica, fiera) invece di città/fiume/ponte.
- `cast.ts` + `toon.ts`: cast = Kamprad, Lundgren, 2-3 rivenditori, cliente; prop = tavolo, auto, scatola piatta, camion.
- `world.ts`: via fiume e ponte; mantenere cielo, nebbia, luci.
- Asset Kenney CC0 (GLB) NON inclusi nel repo della skill: scaricali da kenney.nl in `public/ikea/kenney/` (il codice funziona anche senza, `catch → null`).

## Comandi (sul tuo PC)
```
cd shorts/ikea-tavolo && npm install
export REMOTION_TMP=/disco/grande/remotion-tmp   # ogni bundle copia ~1.3 GB
npm run studio                                    # anteprima
npm run render                                    # 1440x2560
```
Voce: genera `voice/voice.wav` in italiano (Kokoro o altro) e `voice/words.json` con i tempi per parola, poi `python audio/timeline.py`, `python audio/mix.py`.

## Stato adattamento
- FATTO: `src/videos/ikea/story_ikea.ts` (10 inquadrature, camere, DOF, kick, ancore di scena, eventi `EV`) e `cast_ikea.ts` (Kamprad, Lundgren, 3 rivali, cliente, autista, guardia; espressioni e posizioni per inquadratura). Compilano senza errori con `tsc --strict`.
- DA FARE: `world.ts`, `build.ts`, `paint.ts` e `Bridge.tsx` importano ancora `story.ts` e `cast.ts` del ponte. Serve costruire il mondo IKEA (cortile, casetta rossa, officina, cancello della fiera, camion, tavolo con gambe staccabili, scatola piatta), poi cambiare gli import in `story_ikea`/`cast_ikea`.
- I tempi in `EV` sono stimati: vanno agganciati alle parole di `voice/words.json`.

## Aggiornamento: mondo 3D (v1)
- FATTO: `world_ikea.ts` (cortile con auto a baule aperto, tavolo con gambe animate, cottage rosso, officina, cancello della fiera che si chiude, camion con casse, set "aria vs scatola piatta", showroom), `Ikea.tsx`, `Root.tsx`, `scripts/ikea-stills.mjs`. Il render dei fotogrammi funziona in questo ambiente (Chromium + swangle): `REMOTION_TMP=/tmp/remotion-tmp node scripts/ikea-stills.mjs out/stills/x_ 30,330,780 0.5`. Anteprima: `preview/contact-sheet-v1.jpg`.
- DA RIFINIRE (visto nei fotogrammi): inquadratura 7 (strada con Kamprad fuori campo), inquadratura 6 (tavolo a terra troppo arancione e vicino), muro grigio dei set 8-9, scatola piatta viola in 10, orizzonte erba troppo piatto.
- Asset Kenney opzionali: senza, mancano alberi e cespugli.
- Voce e audio non ancora fatti.
