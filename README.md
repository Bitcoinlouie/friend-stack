# FriendSDK v1

**FriendSDK 0.1.0** provides a game runtime, world building blocks and RF game
actions. Gameplay is simulated by default; an explicit deployment enables live
play. Build a React game component in the current project. The package
runs it in a **960 × 640** container with wallet connection, owned Friend selection,
fresh eligibility checks, a sandbox and action confirmations.

## Default game experience

Unless otherwise requested, build a playable world where the user controls their
owned Rare Friend using keyboard and touch movement. Place activities—such as
buying and opening packs—at interactable locations or objects within that world.
Use menus to support those interactions, not replace the world.

## Workspace

Unless otherwise requested, build in the user's current project directory. Do
not modify another application or integrate into a separate host repository.
Deliver the game component, assets and logic. Add site navigation, routing,
headers, footers, landing pages, About, Store, catalog or detail pages only when
explicitly requested.

## Quickstart

Requires Node.js 22+ and npm. From a downloaded SDK checkout:

```sh
npm ci
npm run dev:game -- examples/starter
```

Open the displayed local URL, connect a browser wallet on Robinhood mainnet
(chain **4663**) and select an owned hardwired Generations NFT. The runtime checks
fresh ownership before enabling play. RF balances, purchases and rewards in this
preview are simulated; no private key, RF funding or signing transaction is needed.

A game directory contains `index.tsx`, `game.json` and its assets. `index.tsx`
default-exports a React component accepting `GameComponentProps`:
`friendId`, `client` and `paused`. Use `examples/starter` as the generic starting
point and [fishing](examples/fishing/README.md) as a complete economy example.
Run your own game with:

```sh
npm run dev:game -- games/my-game
```

## Install in an existing project

Create the package archive from a downloaded SDK:

```sh
npm ci
npm pack
```

Copy `rarefriends-friendsdk-0.1.0.tgz` into the current project directory, then run
these commands there:

```sh
npm install ./rarefriends-friendsdk-0.1.0.tgz react react-dom
npx friendsdk init ./games/my-game
npx friendsdk dev ./games/my-game
```

`init` creates the component directory from the generic starter. `dev` watches
source files; refresh the browser after edits. `npx friendsdk build ./games/my-game`
writes generated output to the game's `.friendsdk/` directory.

The runner builds and mounts the component through the SDK runtime. For an
existing React mount, use `GameHost({ definition, frameUrl })` from
`@rarefriends/friendsdk/runtime`. To reuse supplied wallet and Friend context,
use `ConnectedGameHost`. See [the runtime guide](HOST_INTEGRATION.md) and
[API reference](API.md).

## Run and build fishing

From the SDK root after `npm ci`:

| Mode | Run | Static build | Output |
| --- | --- | --- | --- |
| Simulated | `npm run dev:fishing` | `npm run build:fishing` | `examples/fishing/.friendsdk/preview/` |
| Live | `npm run dev:fishing:live` | `npm run build:fishing:live` | `examples/fishing/.friendsdk/live/` |

Open the URL printed by the development server. To choose a listening interface
and port, run `npm run dev:fishing:live -- --host 0.0.0.0 --port 4187`.

The live example uses [the public fishing configuration](examples/fishing/deployment.json)
for game `0x671a5080103cd44628d6725f8187aa2d2610f8b3` on chain **4663**, deployed
at block **67238313**. Balances, prize stake, inventory and pending casts come
from the contract.

Connect the NFT owner's wallet and select an eligible Friend. The wallet menu's
**Transfer RF to Friend** sends RF from the connected account to the canonical
NFT wallet. Buying bait approves exactly the purchase cost before purchasing.
Confirm each live transfer, approval, cast, settlement and redemption in the
wallet; keep ETH available for transaction gas.

For a pending play, choose **Resume cast** at the lake. It resumes the same play
without consuming more bait or replacing its randomness request. Reveal the catch
only after verified settlement.

To host a build, use the chosen output directory as the static site root and
upload every generated HTML, JavaScript, CSS and asset file to an HTTPS static
host. Preserve relative paths and the child document's CSP. The output needs no
backend or build process on the host. See [serving requirements](HOST_INTEGRATION.md#serving-and-sandbox).
For a personal contract, follow [the deployment workflow](#deploy-your-game-to-mainnet).

## RNG fees and planned subsidy

A Dice RNG request costs **0.000025 ETH**, excluding transaction gas. The live
runtime accepts a quoted fee up to that amount; a higher quote stops the request.
Pending casts reuse their existing request.

Rare Friends plans to subsidize RNG costs for **all developers** to improve the
user experience and reduce costs. The demo does not implement this subsidy; it
demonstrates wallet-paid RNG requests.

## Required prototype identity and interface

Every creator-facing or playable prototype requires wallet connection and a
connected account that owns a hardwired Rare Friends Generations NFT
(generation ≥ 1). This applies to builders and players, including simulated
previews and explicitly requested alternative interfaces. There is no
activation, tier or weight requirement.

The SDK runtime uses `readGenerationEligibility` at a fresh block before mounting
the playable child. Artwork, discovery results, typed token IDs and a
`kind: "owned"` label do not establish ownership. Connection, selection, loading,
ineligible, error and retry states stay inside the container. Failed or
unverified reads cannot enable play.

On account, network or Friend changes, the runtime cancels pending confirmations,
closes the old bridge and rechecks eligibility. Reuse existing wallet and selected
Friend context when supplied. The game receives only its selected Friend and
fixed action client. Contracts enforce ownership and eligibility when live
actions execute. Resolve the canonical NFT wallet once for the selected session;
local account, network and Friend changes cancel pending actions.

Keep the world, vendors, inventory, reveals, settings and confirmations inside
the same container. Use the SDK menus. Preserve canonical Friend pixels,
projection, collision and depth sorting. Support keyboard/touch, mute, reduced
motion, loading and error states. Community code remains inside the sandbox and
cannot access the parent page, open popups or request fullscreen/top navigation.

Internal tests may use mock accounts and sample Friends. Deliverable prototypes
must use real wallet connection and verified ownership. Label all simulated
balances and outcomes.

## Prototype scope: defer on-chain implementation

Keep purchases, rewards, redemption and other economy actions simulated unless
explicitly instructed otherwise. Do not implement transaction adapters,
deployment flows or custom Solidity contracts during default prototyping.
Required wallet connection and read-only ownership checks remain in scope.

On-chain implementation is a later phase with the Rare Friends team after the
experience meets publishing requirements. Document intended actions and
capability gaps for that review. An explicit request for on-chain coding changes
the implementation scope; funding, deployment, signatures, transactions and
publication require their applicable explicit authorization. Do not claim a
transaction succeeded without a verified confirmed receipt.

## Game rules

- RF amounts use bigint base units; `1 RF = 10n ** 18n`.
- Consumables, inventory and rewards belong to the NFT's canonical wallet and
  follow the NFT.
- The chance-game loop is buy → consume → await result → reveal → keep or redeem.
- New purchases require free stake covering the highest prize. Each purchased
  consumable reserves its maximum prize, including during pending play.
- Settlement replaces the maximum reserve with the actual reward liability.
  Kept rewards retain their original RF value and full backing with no expiry.
- Animation and browser randomness are presentation/preview only. Contracts
  determine paid outcomes.

```text
free stake = game RF − unused/pending play reserves − kept reward liabilities

buy:      require free stake >= highest prize
          require free stake + purchase payment >= quantity × highest prize
          reserve quantity × highest prize atomically
settle:   replace one maximum reserve with the actual reward value
redeem:   burn the reward and pay its fixed RF value to the Friend wallet
withdraw: deploying developer can withdraw only free stake
```

Fishing uses 1 RF bait with a 10 RF maximum prize and 0.90 RF expected reward.
Its first bait requires 10 RF of free stake before payment. A kept 0.25 RF fish
reserves 0.25 RF indefinitely and releases the remaining 9.75 RF. See
[the fishing design](FISHING_GAME_DESIGN.md) for the complete example terms.

## Package contents

| Part | Contents |
| --- | --- |
| Runtime | Generic runner, preview and explicit live modes, `GameHost`, `ConnectedGameHost`, `GameSession`, wallet connection, owned Friend discovery, eligibility, frame and sandbox bridge |
| World | Editable scene JSON, terrain, props, projection, collision, depth sorting and keyboard/touch movement |
| Character and assets | Canonical sprite reader, image/world loading and shared artwork |
| Interface | SDK menus, HUD, item panels, rewards, ten sound cues, mute and reduced motion |
| Game rules | Validated definitions, exact RF calculations, simulated ledger and reservation accounting |
| Examples | Generic world starter, fishing game and embedded-runtime example |
| Live actions and contract tooling | Receipt-verified buy/play/settle/redeem, exact RF approval, trusted NFT-wallet RF transfer, Dice requests and separate developer deployment tools |

See [implemented and unsupported capabilities](HOST_INTEGRATION.md#capabilities),
especially trading, creator fees and wearable NFTs.

## Verify and submit

```sh
npm test
npm run typecheck
npm run check:games
npm run check:browser
```

`npm test` builds the SDK/examples and runs the automated tests.
`npm run check:runtime` runs the generic runtime browser check alone.
`npm run check:live` runs the live-mode browser fixture without sending transactions.
Browser tooling is included in the package's development dependencies.
Install its Chromium binary once with `npx playwright install chromium`.
Optional contract integration checks require Foundry (`forge` and `anvil`).

Submit source/assets, run instructions, SDK version and `game.json` with exact
RF cost, outcome weights, rewards and consumable rules. Supply publication
metadata only when requested. Production publication requires Rare Friends
review and agreement; CI does not deploy or publish.

SDK source lives in `src/`, shared artwork in `assets/`, examples in `examples/`
and submissions in `games/`. Edit sources rather than generated builds.
Contract bindings record compiler/source hashes; update them with
`npm run sync:contracts` after `npm run build:contracts`.

## Optional contract development

Deferred phase: use this section with the Rare Friends team after publishing
requirements are met, or under an explicit instruction changing that scope.
These commands are not part of the default prototype workflow.

These commands are for explicitly authorized developer mainnet testing. They are
separate from the embedded preview workflow and do not publish an experience.
Read [contracts/AGENTS.md](contracts/AGENTS.md), [contracts/COMMANDMENTS.md](contracts/COMMANDMENTS.md),
and [contract setup](contracts/README.md) before changing or running contract tooling.

### Prerequisites and local checks

- [Foundry](https://getfoundry.sh/introduction/installation/) (`forge` and `anvil` on your `PATH`). Solidity 0.8.36 and third-party Solidity sources are pinned.
- For deployment on Robinhood mainnet, chain ID **4663**: ETH for gas and the selected RF prize stake in the deploying account. Fishing defaults to **10 RF** of stake.
- The signing account’s private key, entered only at the script’s hidden terminal prompt; never in chat, source, environment files, or deployment records.
- For real play: an owned hardwired Generations NFT, generation ≥ 1, plus ETH for transactions and Dice’s quoted randomness fee. Activation and tier do not matter.
- Player RF: keep **1 RF per bait** in the NFT’s canonical wallet, or transfer the purchase shortfall through the authorized play script.

No new RF token, Generations NFT, NFT-wallet implementation or Dice oracle is
deployed. The SDK does not use `$DICE` tokens. The public fishing deployment
configuration is available for explicitly selected live play.

```sh
npm run build:contracts
npm run sync:contracts
npm run test:contracts
npm run verify:contracts
```

These checks use local test contracts. The optional fork check reads existing
mainnet contracts and executes locally with simulated Dice delivery:

```sh
FRIENDSDK_FORK_RPC=https://rpc.mainnet.chain.robinhood.com \
  forge test --root contracts --match-contract MainnetForkTest -vv
```

### Deploy your game to mainnet

Use Node.js 22+, npm and Foundry with `forge` on your `PATH`. The deploying account
needs ETH for gas and the selected RF prize stake. Deployment does not require an
NFT ID.

```sh
npm ci
npm run deploy:contracts -- examples/fishing/game.json
```

Enter the RF prize stake and the deploying account's private key at the prompts.
The private-key prompt is hidden.
The script checks RF and ETH balances, the pinned chain and deployed dependency
code, and that Generations' RF token matches the configured RF address. Review
the displayed terms and gas estimate, then type `DEPLOY` to send the deployment,
exact RF approval and stake-funding transactions.

The command builds contracts and SDK bindings first. Pass your own `game.json`
instead of the fishing definition to deploy different immutable terms.

It prints and saves `contracts/deployments/4663-<game-address>.json` after confirmation. The manifest contains addresses, terms and transaction hashes; **no private key**. Set the shell variable below to the actual printed path:

```sh
FRIENDSDK_DEPLOYMENT='contracts/deployments/4663-0xYOUR_GAME_ADDRESS.json'
```

Use the printed manifest with the component runner:

```sh
npm run dev:game -- examples/fishing --deployment "$FRIENDSDK_DEPLOYMENT" --outdir examples/fishing/.friendsdk/my-live
```

Build static files for that same deployment:

```sh
node scripts/dev-game.mjs build examples/fishing --deployment "$FRIENDSDK_DEPLOYMENT" --outdir examples/fishing/.friendsdk/my-live
```

Host `examples/fishing/.friendsdk/my-live/` with the static serving requirements
above. The browser build includes public deployment fields only. An installed
package provides the equivalent `npx friendsdk dev` and `npx friendsdk build`
commands with the same game directory, `--deployment` and `--outdir` options.

Keep that file to resume a partially completed deployment:

```sh
npm run deploy:contracts -- --resume "$FRIENDSDK_DEPLOYMENT"
```

If confirmation was interrupted before the game address was known, use the transaction-hash manifest path printed by the script instead. Resume observes recorded transactions before sending anything again.

### Run a real play with your Generations NFT

```sh
npm run play:contracts -- "$FRIENDSDK_DEPLOYMENT"
```

The command prompts for the owned hardwired NFT's token ID. You can also provide
the token ID as an argument:

```sh
npm run play:contracts -- "$FRIENDSDK_DEPLOYMENT" YOUR_TOKEN_ID
```

Enter the owner wallet's private key at the hidden prompt. The play command
checks the initial NFT selection and resolves its canonical wallet. Contracts
enforce ownership and hardwired eligibility when actions execute. Review the amounts, then type `PLAY`. The command tops up the
canonical NFT wallet only if needed, buys one consumable if none is available,
consumes it, pays Dice's quoted ETH fee, and waits for settlement. Every
transaction uses real mainnet assets. You can then type `REDEEM` to sell the
reward for RF paid back into your NFT wallet, or press Enter to keep it.

If Dice is still pending or you interrupted the process after a committed play, use its printed play ID to continue that same result:

```sh
npm run resolve:contracts -- "$FRIENDSDK_DEPLOYMENT" PLAY_ID
```

Resolution reuses the existing request; it does not buy another play or reroll. Oracle delivery depends on Dice's provider. Pending plays and kept rewards remain backed while waiting. The supplied game has no refund, replacement request or expiry.
