import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parseChanceGame, expectedReward, maximumPrize } from '../dist/game.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const games = resolve(root, 'games');
const entries = await readdir(games, { withFileTypes: true });
const paths = ['examples/starter', 'examples/fishing', ...entries.filter(entry => entry.isDirectory()).map(entry => `games/${entry.name}`)];

for (const path of paths) {
  const directory = resolve(root, path);
  const game = parseChanceGame(JSON.parse(await readFile(resolve(directory, 'game.json'), 'utf8')));
  await access(resolve(directory, 'README.md'));
  const result = await build({
    absWorkingDir: root, entryPoints: [resolve(directory, 'index.tsx')], bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', write: false,
    outdir: 'unused', metafile: true, external: ['react', 'react/jsx-runtime', 'react-dom/client'],
    loader: { '.png': 'file', '.jpg': 'file', '.webp': 'file', '.svg': 'file', '.woff2': 'file', '.mp3': 'file', '.wav': 'file' },
    assetNames: 'assets/[name]-[hash]',
    plugins: [{ name: 'game-boundary', setup(builder) {
      builder.onResolve({ filter: /^@rarefriends\/friendsdk\/host$/ }, () => ({ errors: [{ text: 'Wallet transport belongs to the SDK runtime, not game code.' }] }));
    } }],
  });
  for (const source of Object.keys(result.metafile.inputs)) {
    if (['src/chain.ts', 'dist/chain.js'].includes(relative(root, resolve(root, source)))) {
      throw new Error(`${path}: wallet transport belongs to the host, not the game frame`);
    }
  }
  // Submissions cannot silently pull private platform files into their build.
  if (path.startsWith('games/')) for (const source of Object.keys(result.metafile.inputs)) {
    const full = resolve(root, source), local = relative(directory, full);
    if (!local.startsWith(`..${sep}`) && local !== '..') continue;
    if (full.startsWith(resolve(root, 'dist') + sep) || full.startsWith(resolve(root, 'src') + sep) || full.startsWith(resolve(root, 'node_modules') + sep)) continue;
    throw new Error(`${path}: undeclared source outside the game/SDK: ${source}`);
  }
  console.log(`${path}: valid; expected reward ${expectedReward(game)}; maximum ${maximumPrize(game)} RF base units; build ${result.outputFiles.reduce((n, file) => n + file.contents.length, 0)} bytes`);
}
