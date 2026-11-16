// Audit del sito costruito (dist/): SEO, sicurezza, accessibilità di base, link interni.
// Uso: node scripts/audit.mjs   (dopo la build). Esce con codice 1 se trova problemi.
import fs from 'node:fs';
import path from 'node:path';

const DIST = path.resolve(import.meta.dirname, '..', 'dist');
const problems = [];
const warn = [];
const add = (page, msg) => problems.push(`${page}: ${msg}`);

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(DIST);
const htmlFiles = files.filter((f) => f.endsWith('.html'));
const exists = new Set(files.map((f) => '/' + path.relative(DIST, f).split(path.sep).join('/')));

const base = (() => { const m = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/data-base="([^"]*)"/); return m ? m[1] : '/'; })();
const hasSite = /<link rel="canonical"/.test(fs.readFileSync(path.join(DIST, 'index.html'), 'utf8'));

const resolveLocal = (href) => {
  let p = href.split('#')[0].split('?')[0];
  if (!p) return true;
  if (!p.startsWith(base)) return false;
  p = '/' + p.slice(base.length);
  return exists.has(p) || exists.has(p.replace(/\/$/, '') + '/index.html') || exists.has(p + 'index.html');
};

const titles = new Map();
const descs = new Map();
for (const f of htmlFiles) {
  const rel = path.relative(DIST, f);
  const h = fs.readFileSync(f, 'utf8');
  const noindex = /<meta name="robots" content="noindex/.test(h);

  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!title) add(rel, 'manca <title>');
  else {
    if (title.length > 70) add(rel, `title troppo lungo (${title.length})`);
    if (!noindex) { if (titles.has(title)) add(rel, `title duplicato con ${titles.get(title)}`); titles.set(title, rel); }
  }
  if (!desc) add(rel, 'manca meta description');
  else {
    if (desc.length < 50 || desc.length > 165) add(rel, `meta description fuori misura (${desc.length})`);
    if (!noindex) { if (descs.has(desc)) add(rel, `description duplicata con ${descs.get(desc)}`); descs.set(desc, rel); }
  }

  const h1 = (h.match(/<h1[\s>]/g) || []).length;
  if (h1 !== 1) add(rel, `deve avere esattamente un h1 (trovati ${h1})`);
  if (!/<html lang="it"/.test(h)) add(rel, 'manca lang="it"');
  if (!/<meta name="viewport"/.test(h)) add(rel, 'manca viewport');
  if (!/<meta http-equiv="Content-Security-Policy"/.test(h)) add(rel, 'manca CSP');
  if (!noindex && hasSite && !/<link rel="canonical" href="https:\/\//.test(h)) add(rel, 'manca canonical');
  for (const t of ['og:title', 'og:description', 'og:type', 'og:site_name', 'og:locale']) if (!h.includes(`property="${t}"`)) add(rel, `manca ${t}`);
  if (hasSite && !h.includes('property="og:image"')) add(rel, 'manca og:image');

  // Sicurezza: niente script/stile inline eseguibili, niente handler inline
  for (const m of h.matchAll(/<script\b([^>]*)>/g)) {
    const attrs = m[1];
    if (/type="application\/ld\+json"/.test(attrs)) continue;
    if (!/\bsrc="/.test(attrs)) add(rel, 'script inline non consentito dalla CSP');
    const ssrc = (attrs.match(/\bsrc="([^"]*)"/) || [])[1];
    if (ssrc && /^(https?:)?\/\//.test(ssrc)) add(rel, `script esterno nel markup (devono caricarsi solo dopo il consenso, da JS): ${ssrc}`);
  }
  if (/<style[\s>]/.test(h)) add(rel, '<style> inline non consentito dalla CSP');
  if (/\sstyle="/.test(h)) add(rel, 'attributo style inline non consentito dalla CSP');
  if (/\son[a-z]+="/i.test(h)) add(rel, 'handler inline (onclick…) non consentito');
  if (/javascript:/i.test(h)) add(rel, 'URL javascript: trovato');

  // JSON-LD valido
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch { add(rel, 'JSON-LD non valido'); }
  }

  // Link
  for (const m of h.matchAll(/<a\b([^>]*)>/g)) {
    const a = m[1];
    const hr = (a.match(/href="([^"]*)"/) || [])[1];
    if (hr === undefined) continue;
    if (/^https?:\/\//.test(hr)) {
      if (!hr.startsWith('https://')) add(rel, `link http non sicuro: ${hr}`);
      if (/target="_blank"/.test(a) && !/rel="[^"]*noopener/.test(a)) add(rel, `target=_blank senza noopener: ${hr}`);
    } else if (hr.startsWith('#')) {
      const id = hr.slice(1); if (id && !new RegExp(`id="${id}"`).test(h)) add(rel, `ancora mancante ${hr}`);
    } else if (hr.startsWith('mailto:')) { /* ok */ } else if (!resolveLocal(hr)) add(rel, `link interno rotto: ${hr}`);
  }
  // Risorse locali
  for (const m of h.matchAll(/(?:src|href)="(\/[^"]*)"/g)) {
    if (!m[1].startsWith('//') && !resolveLocal(m[1])) add(rel, `risorsa mancante: ${m[1]}`);
  }
  // Immagini: alt e dimensioni
  for (const m of h.matchAll(/<img\b([^>]*)>/g)) {
    if (!/\salt="/.test(m[1])) add(rel, 'img senza alt');
    if (!/\swidth="/.test(m[1]) || !/\sheight="/.test(m[1])) add(rel, 'img senza width/height (CLS)');
  }
  // id duplicati
  const ids = [...h.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  // gli id degli SVG delle locandine includono lo slug, quindi devono essere unici
  if (dup.length) add(rel, `id duplicati: ${[...new Set(dup)].join(', ')}`);
}

// File richiesti
for (const f of ['robots.txt', 'feed.xml', 'manifest.webmanifest', 'search-index.json', '_headers', '.well-known/security.txt', 'favicon.svg', 'og.png', 'icon-192.png', '404.html']) {
  if (!exists.has('/' + f)) add('dist', `file mancante: ${f}`);
}
if (hasSite && !exists.has('/sitemap.xml')) add('dist', 'sitemap.xml mancante');
for (const f of files.filter((x) => x.endsWith('.svg') && x.includes(`${path.sep}assets${path.sep}`))) add(path.relative(DIST, f), 'SVG negli asset non consentito');

if (problems.length) {
  console.error(`✗ Audit: ${problems.length} problemi\n` + problems.map((p) => '  - ' + p).join('\n'));
  process.exit(1);
}
console.log(`✓ Audit superato: ${htmlFiles.length} pagine controllate (SEO, CSP, link, immagini, JSON-LD).${hasSite ? '' : ' [canonical/sitemap non verificati: manca WIKI_SITE_URL]'}`);
