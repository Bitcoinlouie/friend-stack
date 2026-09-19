# Intent — Windows portability for the SDK toolchain

The SDK's own checks, scripts and documented commands assume a POSIX operating system in a few places, so they do not work as written on Windows. Nothing in the game rules or contracts is affected. The change makes every SDK-side check, script and documented command work the same way on Windows as on Linux and macOS, and adds a Windows job to CI so the repository cannot silently regress.

## Why this matters

Foundry, the Solidity toolchain that provides `forge` and `anvil`, is an optional install for someone working only on SDK modules, game content or documentation. Node.js is the one hard requirement. A developer with only Node on Windows should be able to run the SDK build, the unit tests, the type check, the game-definition check and the local browser preview, and get an honest result from each. Today two tests fail for reasons that have nothing to do with the code under test, and the preview instructions depend on a `python3` command that Windows does not normally provide.

## The deployment manifest stays private on every platform

When a developer deploys a game, the script saves a deployment manifest: a JSON record of the contract addresses, the immutable game terms and the transaction hashes. It never contains a private key. On Linux and macOS the file is written so that only the creating user can read it. Windows ignores that POSIX file mode, so today the same file is written with whatever access the folder inherits, and the test that checks the restriction fails.

The agreed rule is that the manifest is readable only by the account that created it on every supported platform, using the operating system's own access-control mechanism. Windows gets an equivalent owner-only restriction, not a skipped check. The test verifies the restriction that is actually in effect on the platform it runs on. Node has no built-in way to set or read Windows access-control lists, so the Windows path relies on a system tool that ships with Windows; that is an accepted tradeoff for keeping the check real rather than conditional. If that tool fails during a live deployment, the manifest is still saved and the script prints a warning naming the file, because losing the record of a mainnet deployment is worse than an unrestricted file that holds no secret.

The manifest's protection remains defense in depth. The private key is entered only at the hidden terminal prompt and is never written anywhere, which stays the primary safeguard and is unchanged by this work.

## Tests build file paths the same way on every OS

One unit test hands the bundler a file path taken directly from a URL, which produces a path with a stray leading slash on Windows. Every script in the repository already converts URLs to file paths with the correct helper. The test should do the same. There is no behavioral change; the SDK bundle it checks is already correct.

## The local preview runs with Node alone

The root README and the fishing example README both tell developers to serve the built preview with Python's built-in web server. Python is not part of the stated prerequisites and is not reliably available as `python3` on Windows.

The preview should be served by a small script that lives in this repository, uses only Node's standard library, and is run through an npm script. It serves the built output directory of the fishing example on a fixed local port, exactly as the Python command did. The separate embed page used for sandboxed-host experiments is built elsewhere and needs a host handshake; it is not part of the preview, as before. Both READMEs point at the npm command and stop mentioning Python.

The server changes nothing about what a player sees. It serves the built files as they are. The preview remains the clearly labeled local preview with sample Friends and simulated balances that the READMEs already describe, and that labeling must stay in place.

## The optional browser check runs on Windows

The optional Playwright check script writes its screenshots to a hard-coded `/tmp/` path. It should write them to a location that exists on every platform, so a Windows developer with Playwright installed can run the complete-loop check without editing the script.

## A Windows check in CI

CI currently runs one Ubuntu job that installs Foundry and runs every check. A second job runs on Windows with the same pinned Node version and runs the SDK build and unit tests, the type check and the game-definition check. It does not install Foundry. The local Anvil integration test already skips itself with a visible reason when Foundry is absent, and that remains the expected outcome on the Windows job. Contract compilation, contract tests and the ABI verification stay on the Ubuntu job only.

## Boundaries and non-goals

- No contract, game definition, SDK module or host-transport behavior changes. Nothing here requires a new deployment.
- This work adds no connected preview mode and no new claim about live results.
- The Windows CI job is not expected to run Foundry. Windows support for the deployment, play and resolve scripts is exercised by the unit tests and by the manifest-permission change, not by a real deployment.
- No third-party static-server dependency is added.

## What success looks like

- On a Windows machine with Node and no Foundry, `npm test`, `npm run typecheck` and `npm run check:games` all pass, with the Anvil test reported as skipped and the reason shown.
- On Windows, a freshly saved deployment manifest is readable only by the creating account, and the unit test confirms that directly rather than skipping.
- Following either README on Windows, a developer can start the preview with one npm command and open the fishing example in a browser.
- The optional Playwright check completes on Windows without editing the script.
- CI shows a green Ubuntu job with Foundry and a green Windows job without it. A green Windows job is evidence that the SDK-side checks pass on Windows; it is not evidence about the contracts, a deployment or unattended operation.
