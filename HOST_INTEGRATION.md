# Game runtime and capabilities

FriendSDK **v0.1** runs a game component in a **960 × 640** container. The package
provides wallet connection, owned Friend selection, fresh eligibility checks,
a sandbox, simulated RF state by default and in-frame confirmations. An explicit
deployment enables live contract actions. Build the component and
assets in the user's current project directory.

## Run a component

A game directory contains:

```text
games/my-game/
  index.tsx   # Default-exported React game component
  game.json   # Consumable price and weighted outcomes
  assets/     # Game-specific assets, if needed
```

`index.tsx` accepts `GameComponentProps` from `@rarefriends/friendsdk/runtime`:
`friendId`, `client` and `paused`. The game renders a playable world with keyboard
and touch movement. Activities such as purchases and opening consumables belong
at interactable world objects or locations; menus support those interactions.

Choose your own setting, world assets, rendering approach, visual style, palette
and camera. `GameWorld`, the shipped scenery and presets are optional utilities;
the runtime does not require their illustration style. Preserve canonical Rare
Friend sprites and keep SDK menus, actions and controls inside the game frame.

From the SDK checkout:

```sh
npm ci
npm run dev:game -- examples/starter
```

Run another game with `npm run dev:game -- games/my-game`.

To install in an existing project, create an archive from a downloaded SDK:

```sh
npm ci
npm pack
```

Copy `rarefriends-friendsdk-0.1.0.tgz` into the current project directory and run:

```sh
npm install ./rarefriends-friendsdk-0.1.0.tgz react react-dom
npx friendsdk init ./games/my-game
npx friendsdk dev ./games/my-game
```

The runner builds the component, wraps it in `GameSession`, serves the child
assets and mounts `GameHost`. The SDK frame contains the playable world and all
identity controls, settings and confirmations. Game delivery includes source,
assets, exact economy terms and run instructions. Surrounding website pages are
included only when explicitly requested.

## CLI commands

| Command | Result |
| --- | --- |
| `npx friendsdk init ./games/my-game` | Creates a game directory from the generic starter. |
| `npx friendsdk dev ./games/my-game` | Builds, watches source files and serves the component locally. Refresh the browser after edits. |
| `npx friendsdk build ./games/my-game` | Writes the game bundle and runtime documents to the game's `.friendsdk/` directory. Add `--outdir ./build/my-game` to choose another output. |

`.friendsdk/` contains generated output. Edit `index.tsx`, `game.json` and assets,
then rebuild; exclude generated output from source control.

## Fishing commands

Run `npm ci` in the SDK root, then choose a mode:

| Mode | Development | Static build | Output directory |
| --- | --- | --- | --- |
| Simulated | `npm run dev:fishing` | `npm run build:fishing` | `examples/fishing/.friendsdk/preview/` |
| Live | `npm run dev:fishing:live` | `npm run build:fishing:live` | `examples/fishing/.friendsdk/live/` |

Both development commands print their URL. Append
`-- --host 0.0.0.0 --port 4187` to select the listening interface and port. Use
different ports when running both modes at once.

Live fishing uses the public configuration in `examples/fishing/deployment.json`:
game `0x671a5080103cd44628d6725f8187aa2d2610f8b3`, chain **4663**, deployment block
**67238313**. Stake, balances, inventory and pending casts come from the contract.

The generic command accepts a personal deployment manifest:

```sh
npm run dev:game -- examples/fishing --deployment ./contracts/deployments/YOUR_DEPLOYMENT.json
node scripts/dev-game.mjs build examples/fishing --deployment ./contracts/deployments/YOUR_DEPLOYMENT.json --outdir ./examples/fishing/.friendsdk/my-live
```

With the SDK installed as a package, use `npx friendsdk dev|build <game-directory>`
with the same `--deployment` and `--outdir` options. Omit `--deployment` for
simulated actions. [Deploy your own contract](README.md#deploy-your-game-to-mainnet)
with Node.js 22+, Foundry, ETH and RF stake; the deployment command prints the
manifest path.

The CLI accepts public fields `chainId`, `game`, `rf`, `generations`, `entropy`,
`provider` and `deploymentBlock`. A confirmed deployment transaction in a manifest
can supply its block. Only these public fields enter the browser bundle.

## Live costs and recovery

Use the connected NFT owner's wallet on Robinhood mainnet. The in-frame wallet
menu's **Transfer RF to Friend** sends the entered RF amount to the selected NFT's
canonical wallet. Purchases approve exactly their RF cost. Each live transaction
requires wallet confirmation and ETH gas.

A Dice RNG request costs **0.000025 ETH**, excluding gas. The runtime caps its fee
quote at that amount and stops if the quote is higher. Rare Friends plans to
subsidize RNG costs for **all developers** to improve the user experience and
reduce costs. This demo implements wallet-paid RNG, not the planned subsidy.

**Resume cast** resolves the same pending play without consuming another bait or
replacing its randomness request. Unrevealed results stay pending. Read the
Friend's stored plays after reload or an action error; report purchases,
settlement and redemption only after verified receipts.

## React runtime

For a React mount with an already-built child document:

```tsx
import { GameHost } from "@rarefriends/friendsdk/runtime";
import { parseChanceGame } from "@rarefriends/friendsdk/game";
import gameJson from "./game.json";
import "@rarefriends/friendsdk/frame.css";
import "@rarefriends/friendsdk/runtime.css";

const definition = parseChanceGame(gameJson);

<GameHost definition={definition} frameUrl="/game/frame.html" />
```

`GameHost` supplies the browser wallet connection and owned Friend picker.
Optional `walletProvider` and `publicClient` props reuse a browser provider and
read-only RPC client. The defaults discover browser wallets and use the package's
public RPC configuration. Supply `deployment: LiveGameDeployment` to enable live
actions; its `deploymentBlock` is a bigint. When wallet and Friend context already
exists, use `ConnectedGameHost`:

```tsx
<ConnectedGameHost
  definition={definition}
  frameUrl="/game/frame.html"
  selectedFriend={selectedFriend}
  account={account}
  chainId={chainId}
  publicClient={publicClient}
/>
```

Import it from the same `runtime` module. `selectedFriend` is `GameFriend | null`;
account, chain ID and read-only client can be null while unavailable. The public
client implements `GenerationIdentityClient`. Both runtime components enforce
the same fresh ownership gate. Keep one runtime frame per game.
Increment `revision` when the supplied connection invalidates identity without
changing the other context values. For live mode, also supply `deployment`, a
configured `walletClient`, a public client supporting live reads, and an
`assertActive` callback that rejects invalidated connections before wallet prompts.

For custom child builds, `GameSession` renders a callback with the verified
`GameComponentProps` and handles the SDK handshake:

```tsx
<GameSession definition={definition}>
  {props => <Game {...props} />}
</GameSession>
```

Import `GameSession` from `@rarefriends/friendsdk/runtime` and `runtime.css` in the
child. Component development through the runner supplies this wrapper and
serving configuration automatically. [API.md](API.md) describes the low-level
modules for advanced integrations.

## Identity and session behavior

Every playable prototype requires a connected account that owns a hardwired
Generations NFT (generation ≥ 1) on Robinhood mainnet (4663). This includes
builders, players and simulated previews. No activation, tier or weight rule
applies.

The runtime discovers browser wallets, connects on request and finds the
account's owned eligible Friends. Discovery uses account-filtered `Transfer`
history and current token reads. It requires complete RPC results and does not
scan the collection. The selected Friend then passes a separate fresh
`readGenerationEligibility` check before the playable child mounts.

Connection, selection, loading, wrong-network, ineligible, read-error and retry
states stay in the frame. Failed or unverified reads cannot enable play. Account,
network or Friend changes close the old bridge, cancel confirmations and require
new verification. Resolve the canonical NFT wallet once for that selected
session. Contracts enforce ownership and eligibility for live writes; local
account/network/session checks cancel invalidated actions, and receipts verify
completed writes. Child reload cancels the old session before a new handshake.
Mock identities are limited to internal automated tests.

The child receives a selected Friend ID, fixed action client and pause state.
`client.mode` and snapshots identify `"preview"` or `"chain"`. Wallet providers and public clients stay in the trusted runtime. Connection
and ownership reads do not sign, deploy or spend.

## Serving and sandbox

The runner supplies a sandbox document and development server. For static
hosting, upload the entire chosen build output to an HTTPS static host and use
its `index.html` as the entry point. Preserve file names, subfolders and relative
paths, serve JavaScript and CSS with their correct MIME types, and retain the
child HTML's restrictive CSP. The output contains bundled classic JavaScript and
CSS; it needs no backend, host-side build or custom CORS headers. The development
server is optional for hosting.

For a custom mount, serve the same child files under the configured `frameUrl`.
The iframe uses `sandbox="allow-scripts"` without same-origin, popup, form or
navigation permissions.

Only the exact child window receives a private `MessagePort`; the child accepts
initialization from its parent. The bridge exposes `read`, `canBuy`, `buy`, `play`,
`settle` and `redeem`, with action quantities 1–99. The runtime obtains in-frame
confirmation for buy, play and redeem, plus live settlement. Wallet prompts
authorize each live transaction. Game input pauses while menus are open.
Community code cannot access parent-page UI, a signer, arbitrary calldata,
deployment or bankroll withdrawals.

## Capabilities

| Capability | Implemented in SDK v0.1 | Limits or future work |
| --- | --- | --- |
| Generic game runtime | Directory runner, `GameHost`, `ConnectedGameHost`, `GameSession`, one 960 × 640 frame and sandbox bridge. | The game supplies its world, activities, assets and definition. |
| Wallet connection | EIP-6963/injected EIP-1193 browser wallets and account/network lifecycle. | WalletConnect and native-wallet deep links are not supplied. Connection grants no transaction permission. |
| Owned Friend discovery | Account-filtered incoming/outgoing `Transfer` reads; current ownership, generation and canonical wallet checks. | RPC must supply complete filtered history. There is no collection-scan fallback. |
| Prototype eligibility | Fresh `readGenerationEligibility` before play; account ownership and generation ≥ 1 required. | Discovery/artwork alone is insufficient. Identity changes require rechecking. |
| Optional world tools | `GameWorld`, world presets, scenery, movement and collision utilities. | Creators may supply their own assets, rendering, visual style and camera. |
| Game UI and characters | Canonical Friend sprites, SDK menus, HUD, inventory panels, reveals, sound and reduced motion. | Preserve canonical Friend artwork, keyboard/touch controls and accessibility; keep menus and actions inside the frame. |
| Simulated actions | `read`, `canBuy`, `buy`, `play`, `settle`, `redeem`; RF balances, consumables, rewards and reservation accounting. | Preview state is session-local and does not persist on-chain. |
| Consumable mechanics | One configured consumable with a fixed weighted outcome table and exact RF values. | Multiple consumable tiers and arbitrary pack/NFT minting APIs are not implemented. |
| Vendor redemption | Fixed-value redemption, kept-reward backing and no expiry. | Player-to-player trading is not implemented. |
| Live contract actions | `createLiveGameClient` and the bridge support buy/play/settle/redeem; exact RF approval, a selected canonical wallet, contract-enforced ownership and receipt/event verification. | Requires an explicit deployment, owning wallet, RF and ETH gas. |
| Friend wallet RF transfer | Trusted in-frame control transfers an entered amount from the connected account to the verified canonical NFT wallet. | Separate wallet-confirmed transaction; unavailable to sandboxed game code. |
| Randomness and recovery | Live settlement requests Dice for an existing batch, caps the fee at 0.000025 ETH excluding gas, verifies receipts and supports resuming pending casts. | Delivery depends on Dice. Unrevealed results remain pending; no replacement request, refund or unattended settlement is supplied. |
| Trading | No trading, listing, bidding, swap or transfer actions. | Requires separately scoped APIs and implementation. |
| Planned RNG subsidy | Rare Friends plans to subsidize RNG costs for all developers. | Not implemented by the demo; its wallet-paid RNG flow demonstrates the cost. |
| Creator fees | No creator royalty, revenue-share or fee-claim actions. | Prize stake and developer free-stake withdrawals are separate contract operations. |
| Wearable NFTs | No hat purchase, mint, equip or item-for-hat actions. | Requires separately scoped NFT capabilities. |
| Publication | Builds, validation and reviewable source/assets. | Production publication requires Rare Friends review and agreement. CI does not deploy or publish. |

## On-chain phase

Keep prototype economy actions simulated unless explicitly instructed otherwise.
Defer transaction adapters, deployment flows and custom Solidity to the phase
with the Rare Friends team after publishing requirements are met. Record intended
actions and integration gaps for that review. An explicit on-chain coding request
does not authorize funding, deployment, signatures, transactions or publication.

Paid outcomes must come from contracts and verified receipts. Consumables and
rewards belong to the NFT's canonical wallet. Every purchased consumable reserves
its maximum prize; pending plays and kept rewards cannot share backing. See
[the API](API.md#optional-contract-transport) and [contract notes](contracts/README.md)
for later-phase transport and accounting requirements.

## Checks

```sh
npm test
npm run typecheck
npm run check:games
npm run check:browser
```

`npm run check:runtime` runs the generic runtime browser check alone. Validate
keyboard/touch movement, interaction reach, container bounds and the simulated
loop. Verify disconnected, wrong-network, non-owner, generation-zero and failed
reads cannot play, and identity changes cancel pending actions.

`npm run check:live` runs the live-mode browser fixture with mocked transactions,
including RF transfer controls and pending-cast recovery.
