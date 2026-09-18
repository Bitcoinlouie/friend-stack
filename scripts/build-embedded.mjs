import { build } from 'esbuild';
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
await build({ absWorkingDir: fileURLToPath(new URL('..', import.meta.url)), entryPoints: ['examples/fishing/embedded.tsx'],
  outfile: 'dist/embed/fishing-frame.mjs', bundle: true, format: 'esm', platform: 'browser', target: 'es2022', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' }, minify: true, logLevel: 'warning' });
await writeFile(new URL('../dist/embed/fishing-frame.html', import.meta.url), '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fishing game</title><link rel="stylesheet" crossorigin="anonymous" href="./fishing-frame.css"></head><body><main id="root"></main><script type="module" crossorigin="anonymous" src="./fishing-frame.mjs"></script></body></html>\n');
