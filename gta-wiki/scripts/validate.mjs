// Validazione dei contenuti. È il "cancello" dell'automazione: se fallisce, nulla viene pubblicato.
import fs from 'node:fs';
import path from 'node:path';

const dir = path.resolve(import.meta.dirname, '..', 'content');
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const errors = [];
const err = (file, id, msg) => errors.push(`${file} › ${id}: ${msg}`);

const STATUS = ['confirmed', 'unverified', 'rumor', 'planned', 'debunked'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

const isDate = (s) => DATE.test(s) && !Number.isNaN(Date.parse(s));
const isHttps = (u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } };

let meta;
try { meta = load('meta.json'); } catch (e) { console.error('meta.json non valido:', e.message); process.exit(1); }
if (!['prelaunch', 'launched'].includes(meta.phase)) err('meta.json', 'phase', 'deve essere prelaunch o launched');
if (!isDate(meta.lastUpdate)) err('meta.json', 'lastUpdate', 'data non valida');
if (Number.isNaN(Date.parse(meta.release?.iso))) err('meta.json', 'release.iso', 'data non valida');
for (const c of meta.changelog || []) if (!isDate(c.date) || !c.text) err('meta.json', 'changelog', 'voce non valida');

const sets = {
  'characters.json': { key: 'slug', title: 'name', extra: ['role', 'tagline', 'summary', 'color', 'accent', 'hair', 'locations'] },
  'locations.json': { key: 'slug', title: 'name', extra: ['kind', 'tagline', 'summary'] },
  'easter-eggs.json': { key: 'slug', title: 'title', extra: ['category', 'summary'] },
  'guides.json': { key: 'slug', title: 'title', extra: ['category', 'summary', 'body'] }
};

const data = {};
for (const [file, spec] of Object.entries(sets)) {
  let arr;
  try { arr = load(file); } catch (e) { err(file, '-', 'JSON non valido: ' + e.message); continue; }
  data[file] = arr;
  const seen = new Set();
  for (const e of arr) {
    const id = e[spec.key] || '(senza slug)';
    if (!SLUG.test(e[spec.key] || '')) err(file, id, 'slug non valido (solo a-z, 0-9 e trattini)');
    if (seen.has(e[spec.key])) err(file, id, 'slug duplicato');
    seen.add(e[spec.key]);
    if (!e[spec.title]) err(file, id, `manca ${spec.title}`);
    for (const k of spec.extra) if (e[k] === undefined || e[k] === null) err(file, id, `manca ${k}`);
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
    if (e.status === 'confirmed' && e.needs_review === false && (e.sources || []).length < 1) err(file, id, 'confermato senza fonti');
    if (file === 'guides.json' && e.status !== 'planned' && String(e.body).trim().length < 80) err(file, id, 'guida pubblicata ma body troppo corto');
    if (file === 'characters.json') {
      if (!COLOR.test(e.color) || !COLOR.test(e.accent)) err(file, id, 'color/accent devono essere #rrggbb');
      if (!['long', 'short', 'cap', 'bald', 'curly'].includes(e.hair)) err(file, id, 'hair non valido');
    }
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
  if (!isDate(n.date)) err('news.json', id, 'data non valida');
  if (!n.title || !n.body) err('news.json', id, 'servono title e body');
  if (!STATUS.includes(n.status)) err('news.json', id, 'status non valido');
  if (n.status !== 'planned' && !(n.sources || []).length) err('news.json', id, 'serve almeno una fonte');
  for (const s of n.sources || []) if (!s.label || !isHttps(s.url)) err('news.json', id, 'fonte non valida');
}

if (errors.length) {
  console.error(`✗ ${errors.length} problemi nei contenuti:\n` + errors.map((e) => '  - ' + e).join('\n'));
  process.exit(1);
}
console.log(`✓ Contenuti validi: ${Object.values(data).reduce((n, a) => n + a.length, 0)} schede, ${news.length} news.`);
