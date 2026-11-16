// Validatore della galleria: content/gallery.json e coerenza con assets/img/.
import fs from 'node:fs';
import path from 'node:path';

const TAGS = ['personaggi', 'luoghi', 'veicoli', 'armi', 'edizioni', 'arte'];
const OKEXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif']);
// Cartelle di assets/img/ i cui file sono rilevati dalla build (schede) senza stare in gallery.json
const AUTO = ['characters', 'locations', 'topics'];

export default async function validate({ ROOT, err }) {
  const f = path.join(ROOT, 'content', 'gallery.json');
  if (!fs.existsSync(f)) return;
  let arr;
  try { arr = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { err('gallery.json', '-', 'JSON non valido: ' + e.message); return; }
  if (!Array.isArray(arr)) { err('gallery.json', '-', 'deve essere un array'); return; }
  const imgRoot = path.join(ROOT, 'assets');
  const listed = new Set();
  const seenId = new Set();
  const DANGEROUS = /<|javascript:|data:text|vbscript:/i;
  for (const g of arr) {
    const id = g.file || '(senza file)';
    for (const k of ['file', 'title', 'alt', 'caption', 'source']) if (typeof g[k] !== 'string' || !g[k].trim()) err('gallery.json', id, `manca "${k}"`);
    for (const k of ['title', 'alt', 'caption', 'link']) if (typeof g[k] === 'string' && DANGEROUS.test(g[k])) err('gallery.json', id, `testo non consentito in "${k}"`);
    if (typeof g.file === 'string') {
      if (!/^img\/[a-z0-9/_.-]+$/.test(g.file) || g.file.includes('..')) err('gallery.json', id, 'percorso non valido (deve stare sotto assets/img/)');
      else {
        const p = path.join(imgRoot, g.file);
        if (!fs.existsSync(p)) err('gallery.json', id, 'file inesistente in assets/');
        else if (!OKEXT.has(path.extname(p).toLowerCase())) err('gallery.json', id, 'estensione non consentita');
        listed.add(path.normalize(p));
        const base = path.basename(g.file);
        if (seenId.has(base)) err('gallery.json', id, 'file duplicato in elenco'); seenId.add(base);
      }
    }
    if (g.alt && g.alt.length < 15) err('gallery.json', id, 'alt troppo breve: descrivi cosa si vede');
    if (!Array.isArray(g.tags) || !g.tags.length || g.tags.some((t) => !TAGS.includes(t))) err('gallery.json', id, `tags non validi (consentiti: ${TAGS.join(', ')})`);
    try { const u = new URL(g.source); if (u.protocol !== 'https:' || u.hostname !== 'www.rockstargames.com' && u.hostname !== 'rockstargames.com') err('gallery.json', id, 'source deve essere una pagina https di rockstargames.com'); } catch { err('gallery.json', id, 'source non è un URL valido'); }
    if (g.link !== undefined && (typeof g.link !== 'string' || !/^[a-z0-9][a-z0-9/_-]*\/(#[a-z0-9-]+)?$/.test(g.link))) err('gallery.json', id, 'link deve essere un percorso interno relativo che finisce con /');
    if (!Number.isInteger(g.w) || !Number.isInteger(g.h) || g.w < 100 || g.h < 100) err('gallery.json', id, 'w e h devono essere interi (dimensioni reali dell\'immagine)');
  }

  // Nessun file orfano in assets/img/gallery/ (le miniature stanno in gallery/thumbs/ e sono controllate dal teaser)
  const gdir = path.join(imgRoot, 'img', 'gallery');
  if (fs.existsSync(gdir)) {
    for (const n of fs.readdirSync(gdir)) {
      const p = path.join(gdir, n);
      if (fs.statSync(p).isDirectory()) continue;
      if (!listed.has(path.normalize(p))) err('gallery.json', `img/gallery/${n}`, 'immagine non elencata in content/gallery.json (file orfano)');
    }
  }
  // Immagini delle cartelle auto-rilevate: se non sono né associate a una scheda né in elenco, avvisa via errore
  const tdir = path.join(gdir, 'thumbs');
  if (fs.existsSync(tdir)) for (const n of fs.readdirSync(tdir)) if (!listed.has(path.normalize(path.join(gdir, n)))) err('gallery.json', `img/gallery/thumbs/${n}`, 'miniatura senza immagine corrispondente in elenco');
  void AUTO;
}
