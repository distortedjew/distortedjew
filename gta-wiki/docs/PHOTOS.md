# Immagini ufficiali

Tutte le immagini provengono da pagine pubbliche di Rockstar Games, servite da `www.rockstargames.com`:
- https://www.rockstargames.com/VI/media (artwork, locandine, immagini Ultimate Edition e Vintage Vice City Pack)
- https://www.rockstargames.com/VI/launch-gallery (screenshot e scene di Jason, Lucia, Vice City e Leonida)
- https://www.rockstargames.com/VI/only-in-leonida (e le sottopagine `/cal`, `/boobie`, `/drequan`, `/raul`, `/brian`, `/dimez`, `/jason`, `/lucia`, `/vice-city`, `/leonida-keys`, `/grassrivers`, `/port-gellhorn`, `/ambrosia`, `/kalaga`): personaggi del Trailer 2 e luoghi
- https://www.rockstargames.com/VI/trailer-1, `/trailer-2`, `/launch-trailer`, `/pre-load-now` e https://www.rockstargames.com/videos/rk721912 (date, durate e locandine dei trailer)

Il credito «© Rockstar Games» è mostrato sotto ogni immagine e nel footer (`meta.json` → `imageCredit`). Se un titolare dei diritti chiede la rimozione, basta cancellare il file (e la voce in `content/gallery.json`) e ricostruire. Nessun video è scaricato o incorporato.

## Come funziona
Le immagini sono scaricate dal markup delle pagine (`/VI/_next/static/media/NOME.jpg?akim=1&imdensity=1&imwidth=1280`), ricompresse in JPEG (max 1280 px, qualità 74) e salvate in `assets/img/`. Formati ammessi: jpg, png, webp, avif (niente SVG). Max 1,8 MB per file.

| Cartella | Nome file | Dove compare |
|---|---|---|
| `assets/img/characters/` | `<slug>.jpg` | card del cast, scheda personaggio, JSON-LD, og:image |
| `assets/img/locations/` | `<slug>.jpg` | «Luoghi», scheda, galleria in home |
| `assets/img/topics/` | `<slug>.jpg` | sezioni Wiki, scheda, galleria in home |
| `assets/img/gallery/` | libero | solo in `/galleria/` e `/trailer/` (deve essere elencata in `content/gallery.json`) |
| `assets/img/gallery/thumbs/` | `<id>.jpg` | miniature 480 px del teaser in home |
| `assets/img/` | `hero.jpg` | sfondo della home (1920×1080) |

Gli slug sono quelli di `content/`. Per un personaggio ritagliato in verticale si imposta `"photoFocus": "40%"` (posizione orizzontale del soggetto) in `content/characters.json`.

## Galleria (`content/gallery.json`)
Ogni voce: `file` (percorso sotto `assets/`, es. `img/gallery/x.jpg`), `title`, `alt` (descrive solo ciò che si vede), `caption`, `tags` (`personaggi|luoghi|veicoli|armi|edizioni|arte`), `link` (scheda interna opzionale, es. `luoghi/vice-city/`), `source` (pagina https di rockstargames.com), `w`, `h` (dimensioni reali). Il validatore (`scripts/lib/validators/gallery.mjs`) controlla file esistente, tag, fonte https, alt, dimensioni e segnala i file orfani in `assets/img/gallery/`. Le didascalie si basano sul testo alternativo ufficiale di Rockstar o su ciò che si vede.

Per aggiungere un'immagine: copiare il file in `assets/img/gallery/`, aggiungere la voce, ricostruire. Per il teaser in home vedi `TEASER` in `scripts/lib/ext/gallery.mjs`.

## Immagini presenti (115, ~12 MB)
- **Cast** (7 ritratti nuovi): Cal Hampton, Boobie Ike, Dre'Quan Priest, Raul Bautista, Brian Heder, Real Dimez, Bae-Luxe & Roxy (`characters/`); già presenti Lucia e Jason. Per Real Dimez e Bae-Luxe & Roxy le immagini ufficiali sono comuni alle due voci.
- **Luoghi**: Vice City, Leonida Keys, Grassrivers, Port Gellhorn, Ambrosia, Mount Kalaga National Park (`locations/`), più altre scene in galleria.
- **Voci wiki**: Crest Kayak, Squalo, Sara's Unisex Salon, Stockyard (immagini aggiunte a voci esistenti) e nuove voci Vapid Buggy, Vapid Ganado Retro Build, Wyman Car Collection, Electric Fang Tattoo, Vintage Vice City Pack (`topics/`).
- **Arte e locandine**: locandine dei trailer (Trailer 1 e 2 verticali), logo, copertina Ultimate Edition, «The Album».
- Elenco completo con soggetto e fonte: `content/gallery.json`.

## Ancora mancante
- Nessuna immagine ufficiale per la voce «Leonida» (regione) né per i veicoli/armi non mostrati da Rockstar (Crest Kayak e Squalo hanno solo le immagini dei bonus).
- Alcuni elementi Ultimate Edition (Rideout Customs, One-Eyed Willie, Goodtime Gear) sono in galleria senza scheda perché Rockstar non ne spiega ancora la funzione.
- **Mappa:** non c'è una mappa ufficiale da mostrare. Verrà aggiunta dopo il lancio, con posizioni verificate in gioco.
- Per «An Extended Look» la durata non è riportata: il dato letto nella pagina ufficiale non è risultato attendibile.

L'agente automatico **non** scarica né aggiunge immagini: va fatto a mano, così il controllo sui diritti resta tuo.
