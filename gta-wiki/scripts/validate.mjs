// Validazione dei contenuti e degli asset. È il "cancello" dell'automazione: se fallisce, nulla viene pubblicato.
import fs from 'node:fs';
import path from 'node:path';
import { SECTIONS } from './lib/sections.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const dir = path.join(ROOT, 'content');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const errors = [];
const err = (file, id, msg) => errors.push(`${file} › ${id}: ${msg}`);

const STATUS = ['confirmed', 'unverified', 'rumor', 'planned', 'debunked'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;
const isDate = (s) => typeof s === 'string' && DATE.test(s) && !Number.isNaN(Date.parse(s));
const isHttps = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && u.length < 400; } catch { return false; }
};

/* Difesa contro contenuti malevoli o iniettati (es. prompt injection da pagine web lette dall'agente):
   nessun tag HTML, nessuno schema pericoloso, lunghezze limitate. */
const DANGEROUS = /<|javascript:|data:text|vbscript:|on[a-z]+\s*=\s*["']/i;
function scan(file, id, value, pathName = '') {
  if (typeof value === 'string') {
    if (DANGEROUS.test(value)) err(file, id, `testo non consentito in "${pathName}" (HTML/script)`);
    if (value.length > 12000) err(file, id, `"${pathName}" troppo lungo`);
  } else if (Array.isArray(value)) value.forEach((v, i) => scan(file, id, v, `${pathName}[${i}]`));
  else if (value && typeof value === 'object') for (const [k, v] of Object.entries(value)) scan(file, id, v, pathName ? `${pathName}.${k}` : k);
}

let meta;
try { meta = load('meta.json'); } catch (e) { console.error('meta.json non valido:', e.message); process.exit(1); }
scan('meta.json', 'meta', meta);
if (!['prelaunch', 'launched'].includes(meta.phase)) err('meta.json', 'phase', 'deve essere prelaunch o launched');
if (!isDate(meta.lastUpdate)) err('meta.json', 'lastUpdate', 'data non valida');
if (Number.isNaN(Date.parse(meta.release?.iso))) err('meta.json', 'release.iso', 'data non valida');
if (meta.siteUrl && !/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(meta.siteUrl)) err('meta.json', 'siteUrl', 'deve essere un origin https senza slash finale');
for (const c of meta.changelog || []) if (!isDate(c.date) || !c.text) err('meta.json', 'changelog', 'voce non valida');

const common = ['status', 'spoiler', 'needs_review', 'updated', 'sources'];
const sets = {
  'characters.json': { title: 'name', extra: ['role', 'tagline', 'summary', 'color', 'accent', 'hair', 'locations', 'facts'] },
  'locations.json': { title: 'name', extra: ['kind', 'tagline', 'summary', 'facts'] },
  'easter-eggs.json': { title: 'title', extra: ['category', 'summary'] },
  'guides.json': { title: 'title', extra: ['category', 'summary', 'body'] },
  'topics.json': { title: 'title', extra: ['section', 'tagline', 'summary', 'facts'] }
};

const data = {};
for (const [file, spec] of Object.entries(sets)) {
  let arr;
  try { arr = load(file); } catch (e) { err(file, '-', 'JSON non valido: ' + e.message); continue; }
  data[file] = arr;
  const seen = new Set();
  for (const e of arr) {
    const id = e.slug || '(senza slug)';
    scan(file, id, e);
    if (!SLUG.test(e.slug || '')) err(file, id, 'slug non valido (solo a-z, 0-9 e trattini)');
    const key = file === 'topics.json' ? `${e.section}/${e.slug}` : e.slug;
    if (seen.has(key)) err(file, id, 'slug duplicato');
    seen.add(key);
    if (!e[spec.title]) err(file, id, `manca ${spec.title}`);
    else if (String(e[spec.title]).length > 90) err(file, id, `${spec.title} oltre 90 caratteri`);
    for (const k of [...spec.extra, ...common]) if (e[k] === undefined || e[k] === null) err(file, id, `manca ${k}`);
    if (e.summary && String(e.summary).length > 700) err(file, id, 'summary oltre 700 caratteri');
    if (e.tagline && String(e.tagline).length > 150) err(file, id, 'tagline oltre 150 caratteri');
    if (!STATUS.includes(e.status)) err(file, id, `status deve essere uno tra ${STATUS.join(', ')}`);
    if (typeof e.spoiler !== 'boolean') err(file, id, 'spoiler deve essere true/false');
    if (typeof e.needs_review !== 'boolean') err(file, id, 'needs_review deve essere true/false');
    if (!isDate(e.updated)) err(file, id, 'updated non è una data YYYY-MM-DD');
    if (!Array.isArray(e.sources)) err(file, id, 'sources deve essere un array');
    else {
      for (const s of e.sources) if (!s.label || !isHttps(s.url)) err(file, id, 'ogni fonte richiede label e url https');
      // Regola chiave anti-allucinazioni: tutto ciò che non è "planned" deve citare almeno una fonte.
      if (e.status !== 'planned' && e.sources.length === 0) err(file, id, 'serve almeno una fonte');
    }
    if (file === 'guides.json' && e.status !== 'planned' && String(e.body).trim().length < 80) err(file, id, 'guida pubblicata ma body troppo corto');
    if (file === 'guides.json') for (const m of String(e.body).matchAll(/\]\(([^)\s]*)\)/g)) if (!isHttps(m[1]) && !/^\/(?!\/)/.test(m[1])) err(file, id, `link non consentito nel body: ${m[1]}`);
    if (file === 'characters.json') {
      if (!COLOR.test(e.color) || !COLOR.test(e.accent)) err(file, id, 'color/accent devono essere #rrggbb');
      if (!['long', 'short', 'cap', 'bald', 'curly'].includes(e.hair)) err(file, id, 'hair non valido');
      if (e.photoFocus !== undefined && !/^(100|[1-9]?\d)%$/.test(e.photoFocus)) err(file, id, 'photoFocus deve essere una percentuale, es. "40%"');
    }
    if (file === 'topics.json' && !SECTIONS.some((s) => s.slug === e.section)) err(file, id, `section sconosciuta: ${e.section}`);
  }
}

const locSlugs = new Set((data['locations.json'] || []).map((l) => l.slug));
const charSlugs = new Set((data['characters.json'] || []).map((c) => c.slug));
for (const c of data['characters.json'] || []) {
  for (const l of c.locations || []) if (!locSlugs.has(l)) err('characters.json', c.slug, `luogo inesistente: ${l}`);
  for (const r of c.related || []) if (!charSlugs.has(r)) err('characters.json', c.slug, `personaggio correlato inesistente: ${r}`);
}

let news = [];
try { news = load('news.json'); } catch (e) { err('news.json', '-', 'JSON non valido: ' + e.message); }
for (const n of news) {
  const id = n.title || '(senza titolo)';
  scan('news.json', id, n);
  if (!isDate(n.date)) err('news.json', id, 'data non valida');
  if (!n.title || !n.body) err('news.json', id, 'servono title e body');
  if (!STATUS.includes(n.status)) err('news.json', id, 'status non valido');
  if (n.status !== 'planned' && !(n.sources || []).length) err('news.json', id, 'serve almeno una fonte');
  for (const s of n.sources || []) if (!s.label || !isHttps(s.url)) err('news.json', id, 'fonte non valida');
}

let faq = [];
try { faq = load('faq.json'); } catch (e) { err('faq.json', '-', 'JSON non valido: ' + e.message); }
for (const f of faq) {
  const id = f.q || '(senza domanda)';
  scan('faq.json', id, f);
  if (!f.q || !f.a) err('faq.json', id, 'servono q e a');
  if (!(f.sources || []).length) err('faq.json', id, 'serve almeno una fonte');
  for (const s of f.sources || []) if (!s.label || !isHttps(s.url)) err('faq.json', id, 'fonte non valida');
}

/* Asset: solo immagini raster, dimensione limitata, niente symlink (niente SVG: possono contenere script). */
const assetsDir = path.join(ROOT, 'assets');
const OKEXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
let assetCount = 0;
(function walk(d) {
  if (!fs.existsSync(d)) return;
  for (const name of fs.readdirSync(d)) {
    const p = path.join(d, name);
    const rel = path.relative(ROOT, p);
    const st = fs.lstatSync(p);
    if (st.isSymbolicLink()) { err('assets', rel, 'symlink non consentito'); continue; }
    if (st.isDirectory()) { walk(p); continue; }
    if (name === '.gitkeep') continue;
    assetCount++;
    if (!OKEXT.has(path.extname(name).toLowerCase())) err('assets', rel, 'estensione non consentita (solo jpg, png, webp, avif)');
    if (st.size > 1_800_000) err('assets', rel, `file troppo pesante (${(st.size / 1e6).toFixed(1)} MB, max 1.8 MB)`);
    if (!/^[a-z0-9._-]+$/i.test(name)) err('assets', rel, 'nome file non valido');
  }
})(assetsDir);

if (errors.length) {
  console.error(`✗ ${errors.length} problemi:\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ Contenuti validi: ${Object.values(data).reduce((n, a) => n + a.length, 0)} schede, ${news.length} news, ${faq.length} FAQ, ${assetCount} asset.`);
