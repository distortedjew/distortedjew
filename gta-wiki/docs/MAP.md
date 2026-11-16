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
