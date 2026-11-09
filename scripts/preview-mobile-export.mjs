import { createServer } from 'node:http';
import { createReadStream, existsSync, realpathSync, statSync } from 'node:fs';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Loopback-only preview of the already-built web export. No builds, provider
// calls, native launchers, deployment or files outside the export directory.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../apps/mobile/dist-release-check');
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Export the mobile app before starting this preview.');
const canonicalRoot = realpathSync(root);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff': 'font/woff', '.woff2': 'font/woff2' };

createServer((request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405).end(); return;
  }
  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://127.0.0.1').pathname);
    const path = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (!path.startsWith(root + sep)) { response.writeHead(404).end(); return; }
    const real = realpathSync(path);
    if (!real.startsWith(canonicalRoot + sep) || !statSync(real).isFile()) { response.writeHead(404).end(); return; }
    response.setHeader('Content-Type', contentTypes[extname(real)] ?? 'application/octet-stream');
    response.writeHead(200);
    if (request.method === 'HEAD') { response.end(); return; }
    const stream = createReadStream(real);
    stream.on('error', () => response.destroy());
    stream.pipe(response);
  } catch { response.writeHead(404).end(); }
}).listen(8081, '127.0.0.1', () => {
  console.log('Local exported mobile preview: http://127.0.0.1:8081/ (web verification only)');
});
