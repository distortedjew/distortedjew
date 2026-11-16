# Leonida Files — wiki non ufficiale di GTA VI

Sito statico in italiano (nessuna dipendenza, solo Node ≥ 20). I contenuti stanno in `content/*.json`, `scripts/build.mjs` genera `dist/`.

```bash
npm run check   # valida i contenuti e costruisce il sito
npm run dev     # build + anteprima su http://localhost:4173
```

## Struttura
| Percorso | Cosa contiene |
|---|---|
| `content/` | Dati: personaggi, luoghi, easter egg, guide, news, `meta.json` (fase, data di uscita, changelog) |
| `scripts/validate.mjs` | Cancello di qualità: schema, slug, fonti obbligatorie, riferimenti incrociati |
| `scripts/build.mjs` | Generatore delle pagine, indice di ricerca, sitemap |
| `src/` | CSS, JS, favicon |
| `assets/` | (opzionale) immagini proprie copiate in `dist/assets/` |
| `AGENT.md` | Regole editoriali dell'agente che aggiorna la wiki |

## Aggiornamento automatico
`.github/workflows/wiki-update.yml` esegue Claude (via `anthropics/claude-code-action`) ogni ora:
cerca novità, modifica solo `gta-wiki/content/`, passa dal validatore, fa commit su `main`.
`.github/workflows/wiki-deploy.yml` ricostruisce e pubblica su GitHub Pages a ogni modifica.

Configurazione una tantum:
1. Settings → Secrets and variables → Actions → **ANTHROPIC_API_KEY** (secret).
2. Settings → Pages → Source: **GitHub Actions**.
3. (Facoltativo) variabile `WIKI_MODE=pr` per ricevere Pull Request invece di commit diretti.
4. (Facoltativo) imposta `siteUrl` in `content/meta.json` per la sitemap.

## Garanzie anti-errore
- Nessuna scheda pubblicata senza fonte `https` (tranne «in arrivo»).
- Stati visibili: Confermato / Non verificato / Teoria / Smentito.
- Il workflow rifiuta i commit che toccano file fuori da `gta-wiki/content` e `gta-wiki/assets`.
- Gli spoiler sono sfocati finché il lettore non li attiva.

Fan site non ufficiale; non affiliato a Rockstar Games o Take-Two Interactive.
