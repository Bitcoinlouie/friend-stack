# Plan — Windows portability for the SDK toolchain

Implements [Intent — Windows portability](intent-windows-portability.md).

## Outcome

On a Windows machine with Node and no Foundry, `npm test`, `npm run typecheck` and `npm run check:games` pass, with only the Anvil integration test skipped and its reason shown. The deployment manifest (the JSON record the deploy script saves, with addresses, terms and transaction hashes and never a private key) is readable only by the creating account on Windows as well as on POSIX, and the unit test checks the real restriction on each platform. The fishing preview is served by a Node script through `npm run preview`; Python is no longer mentioned. The optional Playwright check writes screenshots to the platform temp directory and reuses the same server. CI gains a Windows job that runs the SDK-side checks without Foundry.

Non-goals: no change to contracts, game definitions, SDK modules, the host transport or the frame bridge; no new deployment; no Foundry on the Windows job; no third-party static server; the embed page in `dist/embed/` stays outside the preview, as it is today.

## Verified current state

- `scripts/contracts/common.mjs` `saveManifest` writes `<path>.tmp` with mode `0o600`, then renames it over `<path>`. Windows ignores the mode. The deploy script calls it through a `save` helper after every submitted and confirmed transaction, so a save failure on the first call would leave a broadcast deployment with no manifest.
- `tests/contracts-cli.test.mjs:203` asserts `mode & 0o777 === 0o600` and fails on Windows.
- `tests/friend-world.test.mjs:244` passes `new URL(...).pathname` to esbuild, which is `/E:/...` on Windows and fails. esbuild's metafile input keys are forward-slash relative paths on Windows, so the existing ending regex is fine once the entry path is correct.
- `icacls <file> /inheritance:r /grant:r <account>:F` in one call removes every `(I)` inherited entry and leaves `DOMAIN\user:(F)`. Renaming the file keeps the entry. `os.userInfo().username` names the same account. Verified on this machine.
  - **Corrected during execution.** On this machine that leaves *exactly one* entry, but that does not generalize: `/inheritance:r` removes only inherited entries and `/grant:r` replaces only the named account's, so any *explicit* entry for another principal survives both. The GitHub `windows-latest` runner creates files in `TEMP` with explicit `NT AUTHORITY\SYSTEM:(F)` and `BUILTIN\Administrators:(F)` entries, so three remain there. Those two are the machine's root-equivalents, and POSIX `0600` does not exclude root either, so this still meets the outcome; stripping them would be stricter than the POSIX baseline and would break backup and anti-virus tooling, and Administrators can take ownership regardless. The writer is unchanged; the assertion below is what needed correcting.
- `scripts/build-fishing.mjs` writes `examples/fishing/dist/index.html`, `demo.js` and `demo.css`. `scripts/build-embedded.mjs` writes the embed page to the repo-root `dist/embed/`, not the preview directory.
- `scripts/check-fishing-browser.mjs` contains an inline three-file HTTP server and writes screenshots to `/tmp/friendsdk-frame-<width>.png`.
- `.github/workflows/check.yml` has one `ubuntu-latest` job on Node 22 with Foundry v1.7.1 running every check. `tests/contracts-anvil.test.mjs` skips itself with a printed reason when `anvil` is missing.
- `README.md:94` and `examples/fishing/README.md:8` document `python3 -m http.server 4178 --directory examples/fishing/dist`.

## Phase 1 — Tests and tooling stop assuming POSIX

### `tests/friend-world.test.mjs` — bundle test

- Import `fileURLToPath` from `node:url`. Replace the `.pathname` entry with `fileURLToPath(new URL('../src/friend-world.ts', import.meta.url))`. No other change; the assertions on inputs and the absence of `node:fs` stay as they are.

### `scripts/contracts/common.mjs` — `saveManifest`

- After writing `<path>.tmp` with mode `0o600` and before the rename, when `process.platform === 'win32'`, run a module-private `restrictToCurrentUser(file)`.
- `restrictToCurrentUser` runs `icacls` through `execFile` from `node:child_process` (promisified, argument array, no shell, a timeout of about ten seconds) with arguments `[file, '/inheritance:r', '/grant:r', `${account}:F`]`. `account` is `${process.env.USERDOMAIN}\${username}` when `USERDOMAIN` is set, otherwise `username`, with `username` from `os.userInfo().username`. Qualifying with the domain avoids granting a same-named local account on a domain-joined machine.
- Failure behavior (non-zero exit, spawn error or timeout): do not throw. Print one line to stderr: `Could not restrict <path> to the current Windows account: <short reason>. The manifest contains no private key; review its permissions before sharing it.` Then continue with the rename so the deployment record is kept and resumable. Never print the account name or any environment beyond the path.
- Applying the restriction to the temporary file before the rename means the final path never exists in an unrestricted state on a success path.

### `tests/contracts-cli.test.mjs` — manifest test at line 198

- Keep one test. Branch on `process.platform`.
- POSIX branch: the existing `mode & 0o777 === 0o600` assertion.
- Windows branch: run `execFileSync('icacls', [file], { encoding: 'utf8' })`. Select only the output lines that contain `:(`, which are the access entries; the summary lines are localized and must not be parsed. Strip the file path prefix from the first entry. Assert that the current account has a `:(F)` entry, that no entry names a principal other than that account or an administrative one (`NT AUTHORITY\SYSTEM`, `BUILTIN\Administrators`, or their well-known SIDs, since the names are localized), and that no entry contains `(I)`. An unrestricted file fails this on two independent counts — foreign principals and inherited entries — so the assertion keeps its teeth.
- The remaining assertions (base-unit strings, no `privateKey`, substituted `rf` rejected) are unchanged.
- Deliberately not covered: the warning path when `icacls` fails. Simulating that would need command injection into the writer; the behavior is a warning, not a guard, and is reviewed by reading.

## Phase 2 — Node preview server

### `scripts/preview.mjs` — new, `createStaticServer(rootDir)` plus CLI entry

- `createStaticServer(rootDir)` returns a `node:http` server that serves files under `rootDir` only.
  - Accepts `GET` and `HEAD`. Anything else gets `405` with `Allow: GET, HEAD`.
  - Decodes `new URL(request.url, 'http://localhost').pathname` with `decodeURIComponent`; a malformed escape gets `400`.
  - Resolves the target as `join(rootDir, pathname)`. If `relative(rootDir, target)` starts with `..` or is absolute, respond `404`. This closes `..`, encoded `%2e%2e` and drive-letter tricks on Windows.
  - A directory target is served as its `index.html`. A missing file or directory gets `404`.
  - Content types by extension: `.html` `text/html; charset=utf-8`, `.js` and `.mjs` `text/javascript`, `.css` `text/css`, `.json` and `.map` `application/json`, `.svg` `image/svg+xml`, `.png` `image/png`, `.ico` `image/x-icon`, `.wasm` `application/wasm`, `.txt` `text/plain; charset=utf-8`, otherwise `application/octet-stream`.
  - Every response carries `Cache-Control: no-store` so a rebuild is visible on reload. `HEAD` sends headers and `Content-Length` with no body.
- CLI entry, guarded like `deploy.mjs` with `import.meta.url === pathToFileURL(resolve(process.argv[1])).href`:
  - Root is `examples/fishing/dist` under the repository root computed with `fileURLToPath(new URL('..', import.meta.url))`, as the build scripts do. The script does not import `common.mjs`.
  - Before listening, check that `index.html` exists in the root. If not, print `No preview build in examples/fishing/dist. Run npm run build first.` and exit with code 1. Nothing else is served in its place.
  - Port is the optional first argument, an integer from 1 to 65535, default `4178`. Bind to `127.0.0.1`.
  - On listen, print `FriendSDK fishing preview (local, simulated balances): http://127.0.0.1:<port>`. On `EADDRINUSE`, print `Port <port> is in use. Pass another: npm run preview -- <port+1>` and exit 1.

### `package.json` — scripts

- Add `"preview": "node scripts/preview.mjs"`. The `files` list already includes `scripts`. No export changes.

### `scripts/check-fishing-browser.mjs` — reuse the server, fix the screenshot path

- Replace the inline `createServer` block with `createStaticServer(fileURLToPath(new URL('../examples/fishing/dist/', import.meta.url)))`, still listening on port `0` at `127.0.0.1`. The Playwright route filter that aborts any request outside the local origin or `blob:` stays, so the wider server does not widen what the page may load.
- Replace the `/tmp/friendsdk-frame-<width>.png` path with `join(tmpdir(), `friendsdk-frame-${width}.png`)` from `node:os` and `node:path`.
- Remove the now-unused `createServer` and `readFile` imports.

### `tests/preview-server.test.mjs` — new

- Fixture: `mkdtemp` under `tmpdir()` with `index.html`, `demo.js`, `demo.css` and `sub/index.html`. Start `createStaticServer(fixture)` on port `0` at `127.0.0.1`; close the server and remove the directory in `finally`.
- Cases, using `fetch` for normal paths and raw `http.request` where `fetch` would normalize the path:
  - `GET /` returns 200, `text/html; charset=utf-8`, the index body, and `Cache-Control: no-store`.
  - `GET /demo.js` returns `text/javascript`; `GET /demo.css` returns `text/css`.
  - `GET /sub/` returns the nested index.
  - `GET /missing.js` returns 404.
  - Raw `GET /../package.json`, `GET /%2e%2e/package.json` and `GET /..%2f..%2fpackage.json` return 404 and never a file body from outside the fixture.
  - `POST /` returns 405 with `Allow: GET, HEAD`.
  - `HEAD /` returns 200 with a `Content-Length` and an empty body.
- Deliberately not covered: the CLI entry, the fixed port, the missing-build message and the port-in-use message. Those are checked by the real run below.

## Phase 3 — Documentation

### `README.md`

- Section 4: replace the Python code block with `npm run preview`. Change the following sentence to `Open http://127.0.0.1:4178.` and drop the Python remark. Keep the sentence that the preview uses sample Friends and simulated balances.
- Section 2, after "no private key": add one sentence, `On Linux and macOS the file is readable only by your user; on Windows the script grants access only to your account and prints a warning if it cannot.`

### `examples/fishing/README.md`

- Line 8: replace the Python command with `npm run preview`. Line 11: the URL becomes `http://127.0.0.1:4178`. The Playwright instructions at the end are unchanged.

### `contracts/README.md`

- Line 78: extend the manifest sentence with `and are restricted to the creating user account`.

## Phase 4 — Windows CI job

### `.github/workflows/check.yml`

- Add a second job `check-windows` on `windows-latest`: `actions/checkout@v4` with `persist-credentials: false`, `actions/setup-node@v4` with `node-version: 22` and `cache: npm`, then `npm ci --ignore-scripts`, `npm test`, `npm run typecheck`, `npm run check:games`. No Foundry step.
- Expected log: the Anvil test appears as skipped with the message `Install Foundry/Anvil to run local contract integration.` The manifest test runs its `icacls` branch on the runner.
- The existing `check` job is unchanged and remains the only place contract build, ABI verification and contract tests run.

## Integrity risks

- The preview serves a stale, wrong or missing build. The CLI has one fixed root and exits with a build instruction when `index.html` is missing; nothing else is served. `Cache-Control: no-store` prevents a stale copy after a rebuild. Pinned by `tests/preview-server.test.mjs` for the root confinement and headers; the missing-build exit is checked by the real run.
- The preview server exposes files outside the build directory. Root confinement through `relative()` plus binding to `127.0.0.1`. Pinned by the traversal cases in `tests/preview-server.test.mjs`.
- A manifest is saved on Windows without the restriction and nobody notices. On success the temporary file is restricted before the rename. On failure a stderr warning names the file in the actual output, not only in docs. Pinned by the Windows branch of the manifest test for the success path.
- A platform check that quietly skips. The manifest test asserts the real restriction on both platforms rather than skipping on Windows. The Anvil test's skip prints its reason, unchanged.
- Documentation claiming more than the code does. The README sentence states exactly the two mechanisms and the warning; it does not call the manifest secret or encrypted.
- Player-visible output is untouched. The preview page, its "Confirm preview" labels and simulated balances are built by the unchanged fishing example; the server only transports bytes.

## Verification

### Tests

- `npm test` runs the SDK build and every `tests/*.test.mjs`, including the changed manifest test, the fixed bundle test and the new `tests/preview-server.test.mjs`. On Windows the manifest test exercises `icacls`; on POSIX it checks the file mode.
- `npm run typecheck` and `npm run check:games` as regression gates; neither is expected to change.
- `npm run test:contracts` and `npm run verify:contracts` are unchanged regression gates that need Foundry; they run on the Ubuntu job.

### Real-run verification

- On this Windows machine: `npm test` passes with only the Anvil test skipped and its reason printed. `npm run typecheck` and `npm run check:games` pass.
- `npm run preview` on Windows prints the labeled local URL; opening `http://127.0.0.1:4178` shows the fishing preview, choosing a sample Friend and buying bait shows the `Confirm preview` step and `Bought 1 bait with simulated RF.` Renaming `examples/fishing/dist` temporarily and running `npm run preview` prints the build instruction and exits 1. Starting it twice prints the port-in-use message.
- Optional, when Playwright is available: `PLAYWRIGHT_MODULE=... node scripts/check-fishing-browser.mjs` completes on Windows and leaves `friendsdk-frame-1100.png` and `friendsdk-frame-360.png` in the temp directory.
- CI: the pull request shows a green `check` job with Foundry and a green `check-windows` job without it. A green Windows job proves the SDK-side checks pass on Windows; it proves nothing about contracts or a deployment. No mainnet transaction is sent by any step in this plan.

## Delivery order

1. Phase 1: the two test fixes and the manifest writer. Verify with `npm test` on Windows; both previously failing tests now pass.
2. Phase 2: preview server, npm script, Playwright script reuse, server test. Verify with `npm test` and the manual preview run.
3. Phase 3: documentation, once the commands and URL are final.
4. Phase 4: the Windows CI job, last, so its first run is green.

## Done

- `npm test`, `npm run typecheck` and `npm run check:games` pass on Windows without Foundry; the Anvil test is reported skipped with its reason.
- On Windows a freshly saved manifest grants the creating account full access, carries no inherited entry and names no other principal except the machine's administrative ones, and the unit test asserts it; on POSIX the mode is `0600` and the test asserts that.
- `npm run preview` serves `examples/fishing/dist` on `127.0.0.1:4178`, refuses to start without a build, and both READMEs document it with no mention of Python.
- The Playwright check runs on Windows using the shared server and writes screenshots to the temp directory.
- `check.yml` has a green Windows job running the SDK-side checks and an unchanged Ubuntu job running everything.
