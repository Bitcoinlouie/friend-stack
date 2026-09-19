// Serves a built preview over HTTP. No dependency on the contract scripts.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { extname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
};

/** A read-only static server confined to `rootDir`. */
export function createStaticServer(rootDir) {
  const root = resolve(rootDir);
  return createServer(async (request, response) => {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, { 'allow': 'GET, HEAD', 'cache-control': 'no-store' }).end();
      return;
    }
    let pathname;
    try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
    catch { response.writeHead(400, { 'cache-control': 'no-store' }).end(); return; }

    // `relative` rejects `..`, encoded `%2e%2e` and Windows drive-letter targets alike.
    let target = join(root, pathname);
    const inside = path => { const step = relative(root, path); return step === '' || (!step.startsWith('..') && !isAbsolute(step)); };
    if (!inside(target)) { response.writeHead(404, { 'cache-control': 'no-store' }).end(); return; }

    let info;
    try { info = await stat(target); } catch { response.writeHead(404, { 'cache-control': 'no-store' }).end(); return; }
    if (info.isDirectory()) {
      target = join(target, 'index.html');
      if (!inside(target)) { response.writeHead(404, { 'cache-control': 'no-store' }).end(); return; }
      try { info = await stat(target); } catch { response.writeHead(404, { 'cache-control': 'no-store' }).end(); return; }
    }
    if (!info.isFile()) { response.writeHead(404, { 'cache-control': 'no-store' }).end(); return; }

    const headers = {
      'content-type': TYPES[extname(target).toLowerCase()] ?? 'application/octet-stream',
      'content-length': String(info.size),
      'cache-control': 'no-store',
    };
    if (request.method === 'HEAD') { response.writeHead(200, headers).end(); return; }
    response.writeHead(200, headers);
    createReadStream(target).on('error', () => response.destroy()).pipe(response);
  });
}

async function main(args) {
  const root = fileURLToPath(new URL('../examples/fishing/dist/', import.meta.url));
  try { await stat(join(root, 'index.html')); }
  catch {
    console.error('No preview build in examples/fishing/dist. Run npm run build first.');
    process.exit(1);
  }
  let port = 4178;
  if (args[0] !== undefined) {
    if (!/^[0-9]+$/.test(args[0]) || Number(args[0]) < 1 || Number(args[0]) > 65535) {
      console.error('Port must be an integer from 1 to 65535.');
      process.exit(1);
    }
    port = Number(args[0]);
  }
  const server = createStaticServer(root);
  server.on('error', error => {
    if (error.code === 'EADDRINUSE') console.error(`Port ${port} is in use. Pass another: npm run preview -- ${port + 1}`);
    else console.error(`Could not start the preview: ${error.code ?? 'unknown error'}`);
    process.exit(1);
  });
  server.listen(port, '127.0.0.1', () => {
    console.log(`FriendSDK fishing preview (local, simulated balances): http://127.0.0.1:${port}`);
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) main(process.argv.slice(2));
