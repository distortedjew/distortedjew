# Estensioni del generatore

Ogni file `*.mjs` in questa cartella (esclusi quelli che iniziano con `_`) viene caricato da `scripts/build.mjs`, in ordine alfabetico, e riceve un oggetto `ctx`.

```js
export default async function register(ctx) {
  // ... aggiungi pagine, hook, CSS/JS, file
}
```

## Cosa c'è in `ctx`
| Campo | Uso |
|---|---|
| `ctx.config` | Configurazione pubblica (`config/site.json` + env). `ctx.config.enabled.{analytics,ads,accounts,newsletter}` dice cosa è attivo. |
| `ctx.meta`, `ctx.data` | Metadati e contenuti (`characters, locations, eggs, guides, topics, faq, news`). Sola lettura. |
| `ctx.SITE`, `ctx.BASE`, `ctx.CREDIT`, `ctx.SECTIONS`, `ctx.STATUS` | Costanti del sito. |
| `ctx.put(rel, html, {lastmod, prio, skipSitemap})` | Aggiunge una pagina (es. `ctx.put('mappa/index.html', ctx.layout({...}))`). |
| `ctx.layout({title, desc, path, body, section, crumbs, schema, type, image, noindex})` | Pagina completa con SEO, CSP e JSON-LD. |
| `ctx.nav` | Array `[slug, etichetta]` del menu (push per aggiungere una voce). |
| `ctx.hooks.head / headerTools / bodyEnd / mainEnd` | Array di funzioni `(info) => html`. `info = {path, section, type, noindex}`. |
| `ctx.hooks.footerLinks` | Array di `[etichetta, percorsoRelativo]`. |
| `ctx.addSlot(nome, fn)` | Slot della home: `home:after-ticker`, `home:after-cast`, `home:after-gallery`, `home:end`. |
| `ctx.styles / ctx.scripts` | Array di percorsi (relativi a `dist/`) di CSS/JS **same-origin** da caricare in ogni pagina. |
| `ctx.files` | `Map` di file extra da scrivere in `dist/`. `ctx.copyFile('src/ext/x.js')` copia un file di `gta-wiki/`. |
| `ctx.csp.add(direttiva, ...valori)` | Allarga la CSP, **solo** quando la funzione è attiva. |
| `ctx.searchIndex` | Array di voci `{t, k, u, s, sp}` aggiunte alla ricerca. |
| `ctx.esc, href, abs, trunc, fmtDate, badge, shot, thumb, ldJson, markdown, sources, updated, crumbsHtml` | Helper di rendering. |

## Regole
- **Nessuno script o stile inline** (la CSP li blocca): metti JS in `src/ext/<nome>.js` e CSS in `src/ext/<nome>.css`, poi registrali con `ctx.styles.push('ext/<nome>.css')` e `ctx.copyFile('src/ext/<nome>.css')`.
- Le funzioni che trattano dati personali (analytics, pubblicità, account, newsletter) vanno **disattivate di default** e attivate solo da `ctx.config.enabled.*`. Con la funzione spenta la pagina non deve contenere né caricare nulla di esterno.
- Ogni script esterno si carica **solo dopo il consenso** dell'utente (vedi `consent.mjs`).
- Nessun segreto nel repository: solo identificativi pubblici.
- Ogni pagina nuova deve passare `node scripts/audit.mjs` (title/description unici, un solo h1, nessun link rotto).
