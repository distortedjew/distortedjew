# Leonida Files — wiki non ufficiale di GTA VI

Sito statico in italiano (nessuna dipendenza di runtime, solo Node ≥ 20). I contenuti stanno in `content/*.json`; `scripts/build.mjs` genera `dist/`.

```bash
npm run check   # valida i contenuti, costruisce il sito e lo sottopone ad audit (SEO, CSP, link)
npm run dev     # build + anteprima su http://127.0.0.1:4173
```

## Struttura
| Percorso | Cosa contiene |
|---|---|
| `content/` | Dati: personaggi, luoghi, `topics` (veicoli, armi, radio, edizioni…), easter egg, guide, news, FAQ, `meta.json` |
| `scripts/validate.mjs` | Cancello sui contenuti: schema, slug, fonti obbligatorie, niente HTML/script, asset sicuri |
| `scripts/build.mjs` | Generatore: pagine, SEO, dati strutturati, indice di ricerca, sitemap, feed, `_headers` |
| `scripts/audit.mjs` | Audit del sito costruito: titoli/description, h1, canonical, CSP, link rotti, alt, JSON-LD |
| `src/` | CSS, JS, icone, immagine social, font ospitati in locale (OFL) |
| `assets/img/` | Foto ufficiali dei personaggi (vedi `docs/PHOTOS.md`) |
| `AGENT.md` | Regole editoriali e di sicurezza dell'agente che aggiorna la wiki |

## Pagine
Home · Personaggi (+ scheda) · Luoghi (+ scheda) · Wiki: Storia, Veicoli, Armi, Negozi e attività, Radio, Edizioni (+ voci) · Easter egg · Guide · Novità · FAQ · Informazioni (metodo, privacy, sicurezza) · Cerca · 404.

## Foto dei personaggi
Copia `assets/img/characters/<slug>.jpg` (o webp/png/avif) e ricostruisci: la foto sostituisce la locandina tipografica. Dettagli e specifiche in [`docs/PHOTOS.md`](docs/PHOTOS.md).

## SEO
- Title ≤ ~60 caratteri e description 50-165 univoci per pagina, canonical, Open Graph e Twitter Card, immagine social 1200×630.
- Dati strutturati JSON-LD: `WebSite` con `SearchAction`, `VideoGame`, `Article`, `FAQPage`, `CollectionPage`, `BreadcrumbList`.
- `sitemap.xml`, `robots.txt`, feed Atom, manifest PWA, icone, `lang="it"`, un solo `h1` per pagina, breadcrumb e link precedente/successivo.
- Canonical, sitemap e og:image richiedono l'URL pubblico: il deploy lo passa da solo (`WIKI_SITE_URL`); in locale puoi impostare `siteUrl` in `content/meta.json`.

## Sicurezza
- **CSP rigorosa** via `<meta>` (niente script o stili inline, niente risorse esterne) e `_headers` con CSP completa, HSTS, `frame-ancestors 'none'`, Permissions-Policy, COOP/CORP per host che li supportano (Netlify, Cloudflare Pages). GitHub Pages non applica `_headers`: resta attiva la CSP nel `<meta>`.
- Font ospitati in locale (niente Google Fonts). Nella configurazione predefinita nessun cookie, nessun tracker, nessuna richiesta a servizi esterni. Analytics, pubblicità, account e newsletter sono **opzionali, spenti di default** e, quando attivati, caricano script esterni solo dopo il consenso (vedi «Funzioni opzionali»).
- Contenuti validati: nessun tag HTML, schema pericoloso o link non `https`; escape di tutto l'output; link esterni con `noopener noreferrer nofollow`.
- Asset: solo immagini raster, max 1,8 MB, niente SVG né symlink.
- `.well-known/security.txt` con contatto per segnalazioni riservate.
- Agente: tool in allowlist, permessi minimi, perimetro limitato a `content/*.json` (verificato dal workflow), istruzioni contro la prompt injection da pagine web, validazione + audit prima di ogni commit, aggiornamento settimanale delle Actions con Dependabot.

## Aggiornamento automatico
`.github/workflows/wiki-update.yml` esegue Claude (via `anthropics/claude-code-action`) ogni ora: cerca novità, modifica solo `gta-wiki/content/*.json`, passa da validazione, build e audit, poi fa commit su `main`. `wiki-deploy.yml` ricostruisce e pubblica su GitHub Pages. `wiki-ci.yml` controlla ogni Pull Request.

Configurazione una tantum:
1. Settings → Secrets and variables → Actions → **ANTHROPIC_API_KEY** (secret).
2. Settings → Pages → Source: **GitHub Actions**.
3. (Facoltativo) variabile `WIKI_MODE=pr` per ricevere Pull Request invece di commit diretti (consigliato se `main` è protetto).

Fan site non ufficiale; non affiliato a Rockstar Games o Take-Two Interactive.

## Funzioni opzionali (estensioni)
Il generatore carica i moduli in `scripts/lib/ext/` (API in `scripts/lib/ext/README.md`). Si configurano con `config/site.json` oppure con variabili GitHub (`vars.WIKI_*`) passate dal workflow di deploy: **solo identificativi pubblici, mai segreti**. L'agente automatico non può modificare questa configurazione.

| Funzione | Cosa fa | Documentazione |
|---|---|---|
| Mappa | Pagina `/mappa/` con schema indicativo di Leonida e pin (`content/map.json`) | `docs/MAP.md` |
| Galleria e trailer | Immagini ufficiali e pagina trailer (`content/gallery.json`) | `docs/PHOTOS.md` |
| Analytics, consenso, pubblicità | Plausible o GA4 con banner di consenso; AdSense con CMP Google | `docs/MONETIZATION.md` |
| Account, preferiti, newsletter | Login e registrazione con Supabase, preferiti, newsletter con Buttondown | `docs/ACCOUNTS.md` |
| Pagine legali | `/privacy/`, `/cookie/`, `/termini/` generate in base alle funzioni attive | `docs/MONETIZATION.md` |

**Importante sulla pubblicità:** la policy di Rockstar consente l'uso del suo materiale solo senza scopo commerciale. Per questo gli annunci sono esclusi di default dalle pagine con immagini Rockstar e, se vuoi mostrarli lì, serve il permesso scritto di Take-Two (vedi `docs/MONETIZATION.md`).

Con tutte le funzioni attive la base resta controllata dallo stesso `npm run check` (validazione di configurazione, build e audit su ogni pagina). `WIKI_ENV=production` (impostato dal deploy) vieta il provider demo degli account.
