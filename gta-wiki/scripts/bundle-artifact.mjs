// Trasforma dist/ (base "/") in UN solo file HTML con navigazione via hash, pensato per essere
// pubblicato come Artifact. Uso: node scripts/build.mjs && node scripts/bundle-artifact.mjs [--wrap] [--out file]
//   --wrap  aggiunge doctype/html/head/body (solo per provare il file in locale; l'Artifact li aggiunge da sé)
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const DIST = path.join(ROOT, 'dist');
const args = process.argv.slice(2);
const wrap = args.includes('--wrap');
const outFile = args.includes('--out') ? args[args.indexOf('--out') + 1] : path.join(ROOT, 'dist-artifact', 'index.html');
const meta = JSON.parse(fs.readFileSync(path.join(ROOT, 'content', 'meta.json'), 'utf8'));

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const routeId = (p) => p.replace(/^\/+|\/+$/g, '').replace(/\//g, '-') || 'home';
const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.woff2': 'font/woff2' };
const dataUri = (rel) => {
  const f = path.join(DIST, rel);
  return `data:${mime[path.extname(f)] || 'application/octet-stream'};base64,${fs.readFileSync(f).toString('base64')}`;
};

// Riscrive i link interni in link hash e toglie ciò che non ha senso in un singolo file.
const rewrite = (html) => html
  .replace(/<li><a href="\/feed\.xml">[^<]*<\/a><\/li>/g, '')
  .replace(/<a\b[^>]*href="\/(?:feed\.xml|\.well-known\/security\.txt)"[^>]*>([\s\S]*?)<\/a>/g, '$1')
  .replace(/href="\/([^"#]*)(?:#[^"]*)?"/g, (m, p) => `href="#${routeId(p)}"`)
  .replace(/action="\/cerca\/"/g, 'action="#cerca"')
  .replace(/src="\/(assets\/[^"]+)"/g, (m, p) => `src="${dataUri(p)}"`);

// Pagine
const pages = {};
for (const f of walk(DIST).filter((x) => x.endsWith('.html'))) {
  const rel = path.relative(DIST, f).split(path.sep).join('/');
  const id = rel === '404.html' ? '404' : routeId(rel.replace(/index\.html$/, ''));
  const h = fs.readFileSync(f, 'utf8');
  const m = h.match(/<main id="main">\n?([\s\S]*?)\n?<\/main>/);
  if (!m) throw new Error(`main non trovato in ${rel}`);
  pages[id] = { html: rewrite(m[1]) };
}

// Guscio (header + dialog di ricerca + footer) preso dalla home
const home = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const shellTop = rewrite(home.slice(home.indexOf('>', home.indexOf('<body')) + 1, home.indexOf('<main id="main">')).trim());
const shellBottom = rewrite(home.slice(home.indexOf('</main>') + 7, home.indexOf('</body>')).trim());

// Indice di ricerca con id di rotta al posto dei percorsi
const index = JSON.parse(fs.readFileSync(path.join(DIST, 'search-index.json'), 'utf8')).map((d) => ({ ...d, u: routeId(d.u) }));

// CSS con font incorporati
let css = fs.readFileSync(path.join(DIST, 'site.css'), 'utf8');
css = css.replace(/url\("fonts\/([^"]+)"\)/g, (m, name) => `url("${dataUri('fonts/' + name)}")`);
css += `
/* --- adattamenti per l'Artifact --- */
:root { color-scheme: dark; }
html, body { background: var(--ink); color: var(--cream); }
.js [data-reveal] { opacity: 1 !important; translate: none !important; }
.hero { min-height: 0; }
.top { top: env(safe-area-inset-top, 0px); }
body::before { content: ""; position: fixed; inset: 0 0 auto; height: env(safe-area-inset-top, 0px); z-index: 70; background: var(--ink); }
`;

const json = (o) => JSON.stringify(o).replace(/</g, '\\u003c').split(String.fromCharCode(0x2028)).join('\\u2028').split(String.fromCharCode(0x2029)).join('\\u2029');
const js = fs.readFileSync(path.join(import.meta.dirname, 'lib', 'artifact-app.js'), 'utf8')
  .replace('__PAGES__', () => json(pages))
  .replace('__INDEX__', () => json(index))
  .replace('__RELEASE__', meta.release.iso);

const body = `${shellTop}
<main id="main" tabindex="-1"></main>
${shellBottom}
<script>${js.replace(/<\/script/gi, '<\\/script')}</script>`;
const page = `<title>${meta.siteName}</title>\n<style>${css}</style>\n${body}\n`;
const out = wrap
  ? `<!doctype html><html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"></head><body>${page}</body></html>`
  : page;
fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, out);
console.log(`✓ Bundle artefatto: ${Object.keys(pages).length} pagine, ${(out.length / 1024).toFixed(0)} KB → ${path.relative(process.cwd(), outFile)}`);
