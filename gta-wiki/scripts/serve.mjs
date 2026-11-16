// Server statico minimale per l'anteprima locale: npm run dev -> http://127.0.0.1:4173
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', 'dist');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.xml': 'application/xml', '.txt': 'text/plain; charset=utf-8', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };
const security = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin'
};

http.createServer((req, res) => {
  let p;
  try { p = decodeURIComponent(new URL(req.url, 'http://x').pathname); } catch { res.writeHead(400).end(); return; }
  if (p.includes('\0')) { res.writeHead(400).end(); return; }
  let file = path.resolve(root, '.' + p);
  const rel = path.relative(root, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) { res.writeHead(403).end(); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  let status = 200;
  if (!fs.existsSync(file)) { file = path.join(root, '404.html'); status = 404; }
  res.writeHead(status, { ...security, 'Content-Type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
}).listen(4173, '127.0.0.1', () => console.log('Wiki su http://127.0.0.1:4173'));
