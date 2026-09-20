import { readFile, readdir, access } from 'node:fs/promises';
import { resolve, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { parseChanceGame, expectedReward, maximumPrize } from '../dist/game.js';

const root = fileURLToPath(new URL('..', import.meta.url));
const games = resolve(root, 'games');
const entries = await readdir(games, { withFileTypes: true });
const paths = ['examples/fishing', ...entries.filter(entry => entry.isDirectory()).map(entry => `games/${entry.name}`)];

for (const path of paths) {
  const directory = resolve(root, path);
  const game = parseChanceGame(JSON.parse(await readFile(resolve(directory, 'game.json'), 'utf8')));
  await access(resolve(directory, 'README.md'));
  const result = await build({
    absWorkingDir: root, entryPoints: [resolve(directory, 'index.tsx')], bundle: true,
    platform: 'browser', format: 'esm', target: 'es2022', jsx: 'automatic', write: false,
    outdir: 'unused', metafile: true, external: ['react', 'react/jsx-runtime', 'react-dom/client'],
    plugins: [{ name: 'game-boundary', setup(builder) {
      builder.onResolve({ filter: /^@rarefriends\/friendsdk\/host$/ }, () => ({ errors: [{ text: 'Wallet transport belongs to the Rare Friends host, not game code.' }] }));
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
    // Public SDK stylesheet exports resolve into assets/ alongside src/ and dist/.
    if (['dist', 'src', 'assets', 'node_modules'].some(directory => full.startsWith(resolve(root, directory) + sep))) continue;
    throw new Error(`${path}: undeclared source outside the game/SDK: ${source}`);
  }
  console.log(`${path}: valid; expected reward ${expectedReward(game)}; maximum ${maximumPrize(game)} RF base units; build ${result.outputFiles.reduce((n, file) => n + file.contents.length, 0)} bytes`);
}
