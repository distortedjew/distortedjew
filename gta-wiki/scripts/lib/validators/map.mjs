// Validatore di content/map.json: slug esistenti, coordinate 0-100, coerenza tra confidence e source.
// Hook: default async ({ ROOT, load, err, data, config })
import fs from 'node:fs';
import path from 'node:path';

const FILE = 'map.json';
const DANGEROUS = /<|javascript:|data:text|vbscript:|on[a-z]+\s*=\s*["']/i;
const CONF = ['verified', 'indicative'];
const isHttps = (u) => {
  try { const x = new URL(u); return x.protocol === 'https:' && !x.username && !x.password && u.length < 400; } catch { return false; }
};
const isNum = (n) => typeof n === 'number' && Number.isFinite(n);

export default async function validateMap({ ROOT, load, err, data }) {
  let map;
  try { map = await load(FILE); } catch (e) { err(FILE, '-', 'JSON non valido o mancante: ' + (e && e.message)); return; }
  let locations = data && (data['locations.json'] || data.locations);
  if (!Array.isArray(locations)) {
    try { locations = await load('locations.json'); } catch { locations = []; }
  }
  const slugs = new Set(locations.map((l) => l.slug));

  for (const k of ['disclaimer', 'intro']) {
    if (typeof map[k] !== 'string' || !map[k].trim()) err(FILE, k, 'testo mancante');
    else if (DANGEROUS.test(map[k])) err(FILE, k, 'testo non consentito (HTML/script)');
  }
  // Mappa ufficiale opzionale: assets/img/map/leonida.(avif|webp|jpg|jpeg|png) + "basemap": {"source": "<https>", "label": "..."} in map.json
  const baseFile = ['avif', 'webp', 'jpg', 'jpeg', 'png'].map((e) => path.join(ROOT, 'assets', 'img', 'map', `leonida.${e}`)).find((f) => fs.existsSync(f));
  const bm = map.basemap;
  if (baseFile && !(bm && isHttps(bm.source))) err(FILE, 'basemap', 'con assets/img/map/leonida.* serve "basemap": {"source": "<url https della fonte ufficiale>"}');
  if (!baseFile && bm) err(FILE, 'basemap', 'basemap dichiarato ma manca il file assets/img/map/leonida.*');
  if (bm && (typeof bm !== 'object' || (bm.label !== undefined && (typeof bm.label !== 'string' || DANGEROUS.test(bm.label) || bm.label.length > 80)))) err(FILE, 'basemap', 'basemap non valido (label testo semplice max 80 caratteri)');
  if (!baseFile && !/non in scala/i.test(map.disclaimer || '')) err(FILE, 'disclaimer', 'deve dichiarare che lo schema non è in scala');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(map.updated || '')) err(FILE, 'updated', 'data YYYY-MM-DD richiesta');

  const types = map.types && typeof map.types === 'object' ? map.types : {};
  if (!Object.keys(types).length) err(FILE, 'types', 'serve almeno un tipo');
  for (const [k, v] of Object.entries(types)) {
    if (!/^[a-z0-9-]+$/.test(k)) err(FILE, `types.${k}`, 'chiave non valida (a-z, 0-9, trattino)');
    if (typeof v !== 'string' || !v.trim() || DANGEROUS.test(v)) err(FILE, `types.${k}`, 'etichetta non valida');
  }

  for (const s of map.containers || []) if (!slugs.has(s)) err(FILE, `containers`, `slug inesistente in locations.json: ${s}`);

  if (!Array.isArray(map.pins)) { err(FILE, 'pins', 'deve essere un array'); return; }
  const seen = new Set();
  for (const p of map.pins) {
    const id = p && p.slug ? p.slug : '(senza slug)';
    if (!p || typeof p !== 'object') { err(FILE, id, 'pin non valido'); continue; }
    if (!slugs.has(p.slug)) err(FILE, id, 'slug inesistente in locations.json');
    if (seen.has(p.slug)) err(FILE, id, 'pin duplicato');
    seen.add(p.slug);
    if ((map.containers || []).includes(p.slug)) err(FILE, id, 'un contenitore (es. lo stato) non può avere un pin');
    for (const k of ['x', 'y']) if (!isNum(p[k]) || p[k] < 0 || p[k] > 100) err(FILE, id, `${k} deve essere un numero tra 0 e 100`);
    if (!types[p.type]) err(FILE, id, `type sconosciuto: ${p.type} (usa uno di ${Object.keys(types).join(', ')})`);
    if (!CONF.includes(p.confidence)) err(FILE, id, `confidence deve essere ${CONF.join(' o ')}`);
    if (p.source !== null && p.source !== undefined && !isHttps(p.source)) err(FILE, id, 'source deve essere un URL https oppure null');
    if (p.confidence === 'verified' && !isHttps(p.source)) err(FILE, id, 'un pin "verified" richiede una source https');
    if (p.source === undefined) err(FILE, id, 'manca source (URL https o null)');
    if (p.labelSide !== undefined && !["left", "right"].includes(p.labelSide)) err(FILE, id, "labelSide deve essere left o right");
    if (typeof p.note !== 'string' || DANGEROUS.test(p.note) || p.note.length > 300) err(FILE, id, 'note mancante, troppo lunga (max 300) o con HTML');
  }
  for (const [i, a] of map.pins.entries()) for (const b of map.pins.slice(i + 1)) {
    if (a && b && isNum(a.x) && isNum(b.x) && Math.hypot(a.x - b.x, a.y - b.y) < 6) err(FILE, a.slug, `troppo vicino a ${b.slug} (distanza < 6): i pin si sovrapporrebbero`);
  }
}
