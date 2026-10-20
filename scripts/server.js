// Server statico minimo per provare il portale in locale: node scripts/server.js [porta]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const radice = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const porta = Number(process.argv[2] || process.env.PORT || 5173);
const TIPI = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };
// Si servono solo la pagina e la cartella src: niente documenti, script o file nascosti.
const consentito = (relativo) => relativo === 'index.html' || relativo.startsWith(`src${path.sep}`);

http.createServer((richiesta, risposta) => {
  const percorso = decodeURIComponent(new URL(richiesta.url, 'http://localhost').pathname);
  const file = path.normalize(path.join(radice, percorso === '/' ? 'index.html' : percorso));
  const relativo = path.relative(radice, file);
  if (relativo.startsWith('..') || !consentito(relativo) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    risposta.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Non trovato');
    return;
  }
  risposta.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(risposta);
}).listen(porta, '127.0.0.1', () => console.log(`Portale in locale: http://localhost:${porta}`));
