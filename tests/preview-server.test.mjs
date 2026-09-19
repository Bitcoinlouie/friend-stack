import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createStaticServer } from '../scripts/preview.mjs';

const INDEX = '<!doctype html><title>Preview</title>';
const NESTED = '<!doctype html><title>Nested</title>';

/** `fetch` normalizes `..` away, so traversal cases need a raw request with the literal path. */
function raw(origin, path, method = 'GET') {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const call = request({ host: url.hostname, port: url.port, path, method }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => { body += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body }));
    });
    call.on('error', reject);
    call.end();
  });
}

async function withServer(run) {
  const root = await mkdtemp(join(tmpdir(), 'friendsdk-preview-'));
  await writeFile(join(root, 'index.html'), INDEX);
  await writeFile(join(root, 'demo.js'), 'export const ready = true;\n');
  await writeFile(join(root, 'demo.css'), '.rf {}\n');
  await mkdir(join(root, 'sub'));
  await writeFile(join(root, 'sub', 'index.html'), NESTED);
  const server = createStaticServer(root);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try { await run(origin); }
  finally {
    await new Promise(resolve => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
}

test('the preview server serves the build with the declared types and no caching', async () => {
  await withServer(async origin => {
    const index = await fetch(origin);
    assert.equal(index.status, 200);
    assert.equal(index.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(index.headers.get('cache-control'), 'no-store');
    assert.equal(await index.text(), INDEX);

    assert.equal((await fetch(`${origin}/demo.js`)).headers.get('content-type'), 'text/javascript');
    assert.equal((await fetch(`${origin}/demo.css`)).headers.get('content-type'), 'text/css');
    assert.equal(await (await fetch(`${origin}/sub/`)).text(), NESTED);
    assert.equal((await fetch(`${origin}/missing.js`)).status, 404);
  });
});

test('the preview server serves nothing outside its root and refuses writes', async () => {
  await withServer(async origin => {
    // `/..` is normalized away by URL parsing; the encoded and drive-letter forms reach the root check.
    for (const path of ['/../package.json', '/%2e%2e/package.json', '/..%2f..%2fpackage.json', '/C:/Windows/win.ini', '/%43:/Windows/win.ini']) {
      const escape = await raw(origin, path);
      assert.equal(escape.status, 404, `${path} must not resolve`);
      assert.equal(escape.body, '', `${path} must not return a file outside the root`);
    }

    const write = await raw(origin, '/', 'POST');
    assert.equal(write.status, 405);
    assert.equal(write.headers.allow, 'GET, HEAD');

    const head = await raw(origin, '/', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-length'], String(Buffer.byteLength(INDEX)));
    assert.equal(head.body, '');
  });
});
