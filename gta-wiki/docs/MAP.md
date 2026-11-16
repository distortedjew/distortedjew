# Mappa di Leonida (`/mappa/`)

Schema indicativo e non in scala: Rockstar non ha pubblicato una mappa ufficiale. La sagoma è un disegno nostro (in `scripts/lib/ext/map.mjs`); i punti vengono da `content/map.json`.

## Formato di `content/map.json`
- `disclaimer` (deve contenere «non in scala»), `intro`, `updated` (YYYY-MM-DD).
- `types`: `{ chiave: "Etichetta" }` (usati per filtri e legenda).
- `containers`: slug di luoghi che contengono gli altri (es. `leonida`): non hanno pin.
- `pins[]`: `slug` (deve esistere in `locations.json`), `x`,`y` (0-100, nord in alto, x verso est), `type`, `confidence` (`verified` | `indicative`), `source` (URL https o `null`), `note`, `labelSide` opzionale (`left`|`right`).
- `verified` richiede una `source` https. Passa a `verified` solo dopo aver visto la posizione nel gioco o in una fonte ufficiale.
- I luoghi di `locations.json` senza pin compaiono in «Posizione non ancora nota», mai sulla mappa. Non inventare punti di interesse.

Il validatore è `scripts/lib/validators/map.mjs` (slug, range, coerenza confidence/source, pin troppo vicini).

## Uso
Click o Invio su un pin per la scheda; frecce tra i pin; `+`/`-`/`0` e frecce sulla mappa attiva; Ctrl + rotella o pizzico per lo zoom; Esc chiude la scheda; `#slug` nell'URL seleziona un luogo.

## Mappa ufficiale (19 novembre 2026)
Rockstar ha annunciato una mappa ufficiale scaricabile il giorno del lancio. Finché non esce, la pagina usa lo schema stilizzato. **Non usare la versione trapelata dal cofanetto da collezione**: non è autorizzata e i nomi sono sbagliati.

Quando la mappa ufficiale è disponibile:
1. Scaricala dal sito ufficiale (rockstargames.com/VI) e annota l'URL della pagina da cui l'hai presa.
2. Ottimizzala: formato jpg o webp, larghezza circa 2400 px, max 1,8 MB. Salvala come `gta-wiki/assets/img/map/leonida.jpg` (o `.webp`, `.png`, `.avif`). Facoltativo: una versione più leggera `leonida-1600.webp` per la visualizzazione nella pagina; l'originale resta disponibile col link «Apri l'originale».
3. In `content/map.json` aggiungi `"basemap": { "source": "<URL https della pagina ufficiale>", "label": "Rockstar Games" }`. Senza `source` la build fallisce (regola di sicurezza).
4. Riscrivi `intro` e `disclaimer` in `map.json`: con l'immagine ufficiale non devono più dire «schema non in scala» (quella frase è obbligatoria solo senza immagine).
5. Ricalcola `x` e `y` di ogni pin come **percentuale dell'immagine** (0-100, origine in alto a sinistra, nord in alto come nell'immagine). Esempio: un luogo a metà larghezza e a un quarto dell'altezza è `x: 50, y: 25`. Guarda l'immagine e correggi un pin alla volta con `npm run dev`.
6. Porta a `"confidence": "verified"` solo i pin che combaciano con l'immagine ufficiale e metti in `source` lo stesso URL. I luoghi che non compaiono sulla mappa restano `indicative` o si tolgono.
7. `npm run check`, poi commit.

Come funziona: se il file esiste, la mappa usa l'immagine come base al posto della sagoma, con gli stessi pin, filtri, zoom e pan, e mostra credito e link alla fonte. Senza il file non cambia nulla.
