# FriendSDK v0.1

Build a playable Rare Friends game with your AI coding agent. You create the
world, activities and game rules; the SDK supplies wallet connection, owned
Friend selection, inventory, action confirmations and a sandboxed **960 × 640**
game container. Purchases and rewards are simulated by default.

Start in this repository or install the package in your current project. The SDK
includes the runtime, optional world assets and examples to get started. Choose
the world's artwork and visual style to suit your game.

## What you need

- A Linux or Windows computer and an AI coding agent that can edit files and run
  terminal commands in your project.
- **Node.js 22 or newer**, npm and Git. The setup below uses Node.js 22.
- A browser wallet connected to **Robinhood mainnet (chain 4663)**, holding a
  hardwired Rare Friends Generations NFT (generation ≥ 1).

The wallet and NFT are required to play, including simulated previews. Preview
balances and outcomes are simulated; preview play requires no RF funding,
private key or transaction signature. Foundry is needed only for contract work.

## Set up your machine

### Linux

Install Git with your distribution's package manager. On Ubuntu or Debian:

```sh
sudo apt update
sudo apt install -y git curl ca-certificates
```

Install [Node.js](https://nodejs.org/en/download) 22+ with npm. If you use
[nvm](https://github.com/nvm-sh/nvm#installing-and-updating), install it using its
official instructions, reopen your terminal, then run:

```sh
nvm install 22
nvm use 22
```

Check that the tools are available in the terminal your agent uses:

```sh
node --version
npm --version
git --version
```

### Windows

Use **Ubuntu in WSL2** for the v0.1 workflow. Open PowerShell as Administrator:

```powershell
wsl --install -d Ubuntu
```

Restart if prompted, open **Ubuntu** from the Start menu, and finish creating
its Linux username and password. See [Microsoft's WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install)
for prerequisites and installation help.

Complete the Linux setup above **inside Ubuntu**, including Node.js, npm and Git.
Run the remaining commands in Ubuntu. Keep the project in your Linux home
folder, and open that folder with an agent/editor connected to WSL so its tools
use the same environment. Native PowerShell builds and checks are not yet a
verified SDK workflow.

Your browser and wallet extension run on Windows. Open `http://localhost:4173`
to reach the game running in WSL, as described in [Microsoft's networking guide](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-linux-networking-apps-from-windows-localhost).

## Run your first game

In your Linux or Ubuntu terminal, choose a folder for your projects and run:

```sh
git clone https://github.com/spokesz/friendsdk.git
cd friendsdk
npm ci
npm run dev:game -- examples/starter
```

If you downloaded a ZIP, extract it and open a terminal in the folder containing
`package.json`; start with `npm ci`.

Open the displayed URL, normally `http://localhost:4173`. Choose **Connect
wallet**, select your owned Friend, and enter the garden. Move with WASD, arrow
keys or a tap/click destination. Walk to the pack dispenser to buy a simulated
pack, then to the opening station to reveal it.

Keep the terminal running while you play. Source changes rebuild automatically;
refresh the browser to see them. Press **Ctrl+C** to stop the server.

## Build your game with an AI agent

Open this project folder in your agent. After trying the starter, stop its server
and give your agent a brief such as this, replacing the bracketed description:

> Read AGENTS.md, README.md, API.md, WORLD_RULES.md and FISHING_GAME_DESIGN.md.
> Build [describe the game and its activities] in games/my-game, starting from
> examples/starter. Work in this project and deliver the game component, assets
> and rules. Choose world assets and an art style that fit my idea. Use a playable
> world with keyboard and touch movement; put activities at interactable world
> objects or locations. Keep all UI inside the
> SDK's game container. Use the SDK runtime for wallet connection, owned Friend
> selection, inventory and confirmations. Keep purchases and rewards simulated.
> Do not add website navigation, headers, footers, About/Store pages, a separate
> wallet flow or another application checkout. Run the relevant checks and give
> me the command and local URL to play.

The commands to create and run your own copy of the starter are:

```sh
npm run build
node scripts/dev-game.mjs init games/my-game
npm run dev:game -- games/my-game
```

`init` creates a new directory and refuses to overwrite an existing one. Choose
your own name in place of `my-game`. Your game files are:

| File | What your agent changes |
| --- | --- |
| `index.tsx` | World, movement and interactions; default-export the game component |
| `game.json` | Exact RF cost, outcome weights, rewards and consumable rules |
| `style.css` and local assets | Your game's visual style and world artwork |
| `README.md` | Your game's controls, run instructions and exact rules |

The component receives `friendId`, `client` and `paused` through
`GameComponentProps`. Use the SDK's fixed action client and menus. The supplied
world renderer, presets and scenery are optional; your component can use its own
world assets and rendering approach. Use the canonical Friend sprites for the
selected character, and pause movement and interactions when `paused` is true.
Edit source files; `.friendsdk/` contains generated output.

### Required prototype identity and interface

The runtime verifies fresh ownership of the selected hardwired Generations NFT
before play and rechecks when the account, network or selection changes. Items
and rewards belong to that NFT's canonical wallet. Mock identities are reserved
for automated tests.

Keep the world, vendors, inventory, reveals, settings and confirmations inside
the same container. Preserve canonical Friend pixels and make collision and
depth ordering match your world. Support keyboard/touch, mute, reduced motion,
loading and error states.
Use existing wallet and Friend context through `ConnectedGameHost` when supplied
by the current project; see [the runtime guide](HOST_INTEGRATION.md).

## Try the fishing example

Fishing is a complete example with a bait vendor, lake, catches and fixed-price
redemption. Run these commands from the SDK root:

| Mode | Play locally | Build static files | Output folder |
| --- | --- | --- | --- |
| Simulated | `npm run dev:fishing` | `npm run build:fishing` | `examples/fishing/.friendsdk/preview/` |
| Live contracts | `npm run dev:fishing:live` | `npm run build:fishing:live` | `examples/fishing/.friendsdk/live/` |

Live mode uses the included [public deployment configuration](examples/fishing/deployment.json)
and real wallet transactions. The NFT's canonical wallet needs RF for bait;
**Transfer RF to Friend** in the wallet menu funds it from the connected account.
Keep ETH in the signing wallet for gas and RNG fees. Bait costs **1 RF**, the
maximum reward is **10 RF**, and the expected reward is **0.90 RF**. See the
[fishing guide](examples/fishing/README.md) for controls and the full outcome table.

The live runtime caps each Dice RNG request at **0.000025 ETH**, excluding gas.
Rare Friends plans to subsidize RNG costs for all developers to improve the user
experience and reduce costs. This demo uses wallet-paid RNG and does not include
the subsidy. For a pending cast, choose **Resume cast** to continue its existing
result. Detailed [oracle operations and recovery](docs/oracle/README.md) are
separate from game development.

## Build and share a preview

Build your component from the SDK root:

```sh
npm run build
node scripts/dev-game.mjs build games/my-game
```

The output is `games/my-game/.friendsdk/`. Use that folder as your static site's
root and upload all generated HTML, JavaScript, CSS and assets. Preserve relative
paths and the sandbox document's CSP. See [serving requirements](HOST_INTEGRATION.md#serving-and-sandbox)
for HTTPS hosting. Publishing a game requires its own explicit authorization.

To play from another device on your local network:

```sh
npm run dev:game -- games/my-game --host 0.0.0.0 --port 4173
```

Open `http://YOUR_COMPUTER_LAN_IP:4173` on that device using a browser with your
wallet available. Allow the port through your local firewall as needed. WSL2
also needs [LAN networking configuration](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-a-wsl-2-distribution-from-your-local-area-network-lan).

## Install in an existing project

Create a package archive from the SDK folder:

```sh
npm ci
npm pack
```

The **v0.1** release uses npm version **0.1.0**. Copy
`rarefriends-friendsdk-0.1.0.tgz` into your existing project, then run there:

```sh
npm install ./rarefriends-friendsdk-0.1.0.tgz react react-dom
npx friendsdk init ./games/my-game
npx friendsdk dev ./games/my-game
```

Build with `npx friendsdk build ./games/my-game`. The package supplies the runner
and runtime; your agent works in your current project. For an existing React
mount, use `GameHost` or `ConnectedGameHost` from
`@rarefriends/friendsdk/runtime`. See [runtime integration](HOST_INTEGRATION.md).

## Optional contract development

Keep the first game prototype simulated. Use the supplied live adapter and
contract tools when you explicitly choose to implement on-chain play. Deployment,
funding, wallet transactions and publication each require the applicable explicit
authorization. Production publication requires separate Rare Friends review.

### Deploy your game to mainnet

Install [Foundry](https://getfoundry.sh/introduction/installation/) in your Linux
or WSL environment, then follow [contract setup and deployment](contracts/README.md).
The deploying wallet needs ETH for gas and RF for the prize stake. Deployment
does not require a Generations NFT ID.

From the SDK root:

```sh
npm run deploy:contracts -- examples/fishing/game.json
```

Enter the stake and private key only at the script's terminal prompts; the key
prompt is hidden. Review the terms before confirming deployment. Never put a
private key in chat, source or an environment file. The script prints a manifest
for connecting the game to your contracts. The [contract guide](contracts/README.md#deploy-and-run-a-game)
covers that connection, deployment resume and terminal play.

## Verify and submit

Ask your agent to run these checks from the SDK root:

```sh
npm test
npm run typecheck
npm run check:games
npx playwright install --with-deps chromium
npm run check:browser
```

Playwright's browser installation is a one-time setup; Linux may request system
package installation. Foundry is optional for the SDK checks: local contract
integration tests report a skip when its tools are unavailable. For contract
changes, also run the checks in the [contract guide](contracts/README.md).

Submit the game source and assets, run instructions, SDK version **v0.1** and
exact costs, outcome weights, rewards and consumable rules. RF uses bigint base
units (`1 RF = 10n ** 18n`). Each purchased consumable reserves its maximum prize;
kept rewards retain their RF backing with no redemption expiry. Label simulated
results, and claim live transactions only after verified receipts.

Record asset sources and any capability gaps. Supply thumbnail/title, developer
credit, About and Store metadata only when requested by the publishing interface.
Rare Friends reviews the game and assets against `AGENTS.md` before production
publication. Automated checks do not deploy or publish games.

## Reference docs

| Guide | Use it for |
| --- | --- |
| [AGENTS.md](AGENTS.md) | Instructions for your coding agent |
| [API.md](API.md) | Exported modules and game actions |
| [Runtime and capabilities](HOST_INTEGRATION.md) | Runtime integration, sandbox serving and implemented features |
| [World and character guidance](WORLD_RULES.md) | World design, canonical Friend sprites and optional renderer utilities |
| [Fishing design](FISHING_GAME_DESIGN.md) | Complete example rules and reward table |
| [Sound kit](SOUND_KIT.md) and [asset notices](NOTICE.md) | Audio controls and asset provenance |
| [Contracts](contracts/README.md) | Optional contract deployment and developer tooling |
| [Oracle operations](docs/oracle/README.md) | RNG delivery, pending plays and proposed recovery work |

Trading, creator fees and wearable NFTs are not implemented in v0.1. See the
[capability list](HOST_INTEGRATION.md#capabilities) for the full supported scope.
