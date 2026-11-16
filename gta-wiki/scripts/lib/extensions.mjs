// Carica automaticamente le estensioni in scripts/lib/ext/*.mjs (in ordine alfabetico).
// Ogni estensione esporta `export default async function register(ctx) { ... }`. Vedi ext/README.md.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadExtensions(ctx) {
  const dir = path.join(import.meta.dirname, 'ext');
  if (!fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((f) => f.endsWith('.mjs') && !f.startsWith('_')).sort();
  for (const n of names) {
    const mod = await import(pathToFileURL(path.join(dir, n)).href);
    if (typeof mod.default !== 'function') throw new Error(`Estensione ${n}: manca l'export default (funzione register)`);
    await mod.default(ctx);
  }
  return names;
}
