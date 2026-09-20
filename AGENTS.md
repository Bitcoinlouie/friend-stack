# Build with FriendSDK

## Default game experience

Unless otherwise requested, build a playable world where the user controls their
owned Rare Friend using keyboard and touch movement. Place activities—such as
buying and opening packs—at interactable locations or objects within that world.
Use menus to support those interactions, not replace the world.

## Workspace and deliverable

Unless otherwise requested, build in the user's current project directory. Do
not modify another application or integrate into a separate host repository.
Build only the requested game component, assets and logic. Do not add site
navigation, routing, headers, footers, landing pages, About/Store pages, catalogs
or detail pages unless explicitly requested.

Read README.md, API.md, WORLD_RULES.md and FISHING_GAME_DESIGN.md before changing a
game. Use the exported SDK runtime and game APIs. Choose world assets, art style,
palette and camera to suit the requested game; the supplied scenery, world
presets and renderer are optional. Keep SDK reference content in
`examples/` or `games/`; consuming projects keep their components in that project.

## Use the package runtime

The game directory contains `index.tsx`, `game.json` and assets. Default-export a
React game component accepting `GameComponentProps` (`friendId`, `client`,
`paused`). The generic starting point is `examples/starter`; fishing is an
example of a complete chance-game loop.

Run `npm ci` and `npm run dev:game -- examples/starter` in this SDK checkout, or
`npx friendsdk dev ./games/my-game` with the
[package archive installed](README.md#install-in-an-existing-project).
The runner supplies the runtime, sandbox document, bridge and local serving.

`GameHost` from `@rarefriends/friendsdk/runtime` supplies wallet connection,
owned Friend discovery/selection, fresh eligibility checks, a simulated ledger
by default, frame and confirmations. Use `ConnectedGameHost` when wallet and selected Friend
context already exists. Reuse that context without adding another selection or
connection flow. `GameSession` handles the child session. Game code uses only the
SDK's fixed action client; wallet providers and clients remain outside the sandbox.

Do not implement wallet connection, NFT discovery, an ownership gate or another
Friend selector in game code. Use the SDK runtime. Never scan the Generations
collection or enumerate token IDs to find a player's NFTs. Do not locate another
checkout or require website source, private services or developer-local files.

Fit one **960 × 640** game container. Keep the world, vendors, purchases, pack
opening, inventory, reveals, settings and confirmations inside it. Use SDK menus.
Do not access the parent page, inject outside UI, open popups or request
fullscreen/top navigation. Community games remain sandboxed.

## Required prototype identity

Every creator-facing or playable prototype requires a connected wallet whose
account owns a hardwired Rare Friends Generations NFT (generation ≥ 1). This
applies to builders and players, including simulated previews and explicitly
requested alternative interfaces. No activation, tier or weight rule is added.

The trusted runtime must use `readGenerationEligibility` at a fresh block before
enabling play. Artwork, a typed token ID, discovery results and a `kind: "owned"`
label do not verify ownership. Keep connection, selection, loading, ineligible,
error and retry states in the container. Unverified or failed reads cannot play.

On account, network or Friend changes, cancel pending confirmations, close the
old bridge and recheck eligibility before the new session. Resolve the canonical
NFT wallet for the selected session. Contracts enforce ownership and eligibility
when live actions execute; do not add repeated ownership reads or transaction
simulations before wallet prompts. Retain account/network/session cancellation
and receipt verification. Inventory and rewards belong to the canonical NFT
wallet, not a substituted owner address.

Internal automated tests may use mock accounts and sample Friends. They are test
fixtures, not deliverable prototypes. Verify the real ownership gate before
delivering a playable prototype. Wallet connection and ownership reads require
no private key or signing transaction.

## Prototype scope: defer on-chain implementation

Unless explicitly instructed otherwise, keep purchases, rewards, redemption and
other economy actions simulated. Do not implement transaction adapters,
deployment flows, on-chain game actions or custom Solidity for a prototype.
Required wallet connection and read-only ownership checks remain in scope.
Label simulated balances and outcomes.

On-chain implementation is a later phase with the Rare Friends team after the
experience passes publishing requirements. Document intended actions and
capability gaps for that review. Existing contract tools and transport docs are
references for that phase. An explicit request for on-chain coding does not
authorize funding, deployment, signatures, wallet transactions or publication;
obtain the applicable explicit authorization. Report publishing readiness only
when supported by evidence.

For explicitly requested live play, use the SDK runtime with a public deployment
configuration (`--deployment` in the CLI). Keep exact RF approvals, wallet
confirmations, canonical-wallet RF transfers and the Dice fee cap of 0.000025 ETH
excluding gas in trusted runtime code. Live mode requires signed transactions.
Rare Friends plans to subsidize RNG costs for all developers; the demo implements
wallet-paid RNG and does not implement that planned subsidy.
Recover pending plays by their existing IDs and expose **Resume cast**; never
consume another bait to recover a pending result or reveal an unsettled outcome.
Do not expose funding or transaction clients to sandboxed game code.

## Game and delivery rules

- Build the requested v0.1 game. No currencies beyond RF, launchpads, markets,
  redemption expiry, activation gates or tier rules.
- New purchases require free stake covering the highest prize. Every purchased
  consumable reserves its maximum prize. Pending plays and kept rewards cannot
  share backing; redemption has no expiry.
- Contracts determine paid outcomes. Animation, browser randomness and local
  balances are preview/presentation only. Claim a transaction only after a
  confirmed verified receipt.
- Preserve canonical Friend pixels. Keep movement, collision, pointer input and
  depth ordering consistent with the game's chosen camera and renderer. Support
  keyboard/touch, mute, reduced motion, loading and errors.
- Do not expose a signer, arbitrary calldata, deployment or bankroll withdrawal
  powers to game code.
- Submit source/assets, run instructions, SDK version, exact RF cost, outcome
  weights, rewards and consumable rules. Use bigint RF base units.
- Run the relevant tests, typecheck, game validation and browser checks. Report
  failures honestly. Do not deploy or publish from PR automation. Production
  publication requires separate Rare Friends review.

See [the runtime guide and capability list](HOST_INTEGRATION.md). Trading,
creator fees and wearable NFTs are not implemented SDK v0.1 capabilities.

Contracts live in `contracts/`; read its `AGENTS.md` and `COMMANDMENTS.md` before
contract work. Reference existing mainnet RF, Generations, canonical NFT wallets
and Dice through interfaces only. Explicitly authorized developer testing may use
the interactive mainnet tools. Private keys are entered in the developer's
terminal, never in chat, source, environment files or deployment records.
