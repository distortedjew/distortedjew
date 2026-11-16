# Immagini ufficiali

Tutte le immagini attuali provengono dalla pagina media ufficiale di Rockstar (https://www.rockstargames.com/VI/media), che mette a disposizione artwork e screenshot da scaricare e condividere. Il credito «© Rockstar Games» è mostrato sotto ogni immagine e nel footer (`meta.json` → `imageCredit`). Usale nel rispetto delle condizioni indicate da Rockstar; se un titolare dei diritti chiede la rimozione, basta cancellare il file e ricostruire.

## Come funziona
Basta copiare un file nella cartella giusta, **senza modificare altro**: la build lo rileva da sola. Formati: jpg, png, webp, avif (niente SVG). Max 1,8 MB per file.

| Cartella | Nome file | Dove compare |
|---|---|---|
| `assets/img/characters/` | `<slug>.jpg` | card del cast, scheda personaggio, dati strutturati, og:image |
| `assets/img/locations/` | `<slug>.jpg` | miniatura in «Luoghi», immagine nella scheda, galleria in home |
| `assets/img/topics/` | `<slug>.jpg` | miniatura nelle sezioni Wiki, immagine nella scheda, galleria in home |
| `assets/img/` | `hero.jpg` | sfondo della home (1920×1080) |

Gli slug sono quelli dei file in `content/`. Per un'immagine di una voce di wiki lo slug è quello della voce (es. `grotti-cheetah.jpg`).

Le foto 16:9 usate nel ritratto dei personaggi vengono ritagliate in verticale. Per centrare il volto aggiungi `"photoFocus": "40%"` (posizione orizzontale del soggetto) al personaggio in `content/characters.json`.

## Immagini già presenti
| File | Soggetto |
|---|---|
| `characters/lucia-caminos.jpg` | Lucia Caminos (`photoFocus` 19%) |
| `characters/jason-duval.jpg` | Jason Duval (`photoFocus` 72%) |
| `hero.jpg` | Jason e Lucia, sfondo della home |
| `locations/vice-city.jpg` | Skyline di Vice City |
| `topics/vapid-stanier-55.jpg` | '55 Vapid Stanier |
| `topics/grotti-cheetah.jpg` | Grotti Cheetah |
| `topics/hawk-little-morgan-revolver.jpg` | Revolver Hawk & Little Morgan |
| `topics/standard-e-ultimate.jpg` | Opere dell'Ultimate Edition |
| `topics/premessa-della-storia.jpg` | Jason e Lucia sul tetto |
| `topics/radio-e-colonna-sonora.jpg` | Copertina dell'album |

## Ancora senza immagine (non pubblicata da Rockstar nella pagina media)
Cal Hampton, Boobie Ike, Dre'Quan Priest, Raul Bautista, Brian Heder, Real Dimez, Bae-Luxe & Roxy, gli altri luoghi, Crest Kayak, Squalo, Sara's Unisex Salon, Stockyard. Restano le locandine tipografiche e le schede senza foto.

**Mappa:** non c'è una mappa ufficiale da mostrare. Verrà aggiunta dopo il lancio, con posizioni verificate in gioco (non inventiamo geografie).

L'agente automatico **non** scarica né aggiunge immagini: va fatto a mano, così il controllo sui diritti resta tuo.
