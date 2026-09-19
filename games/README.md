# Build and submit a game

Unless explicitly instructed otherwise, build only the game component in the
user's current project directory. Create a playable world where the user moves
their owned Rare Friend with keyboard and touch controls. Place activities such
as buying and opening packs at interactable world objects or locations. Menus
support those interactions. Add website navigation, footers and
About/Store/catalog/detail pages only when explicitly requested.

## Component and runtime

A game directory contains `index.tsx`, `game.json`, its assets and a README with
run instructions. `index.tsx` default-exports a React game component accepting
`GameComponentProps`: the verified `friendId`, limited `client` and `paused`
state. Import public SDK modules from `@rarefriends/friendsdk`. Use the shared
world, movement, sprite, sound and UI building blocks.

In this SDK repository, place game submissions under `games/<name>`. In another
project, follow its component and asset conventions. The generic starter is
`examples/starter`; fishing is an example of a complete chance-game loop.

From a downloaded SDK checkout:

```sh
npm ci
npm run dev:game -- examples/starter
```

For your own game directory:

```sh
npm run dev:game -- games/my-game
```

For an existing project, create the package archive using
[the installation instructions](../README.md#install-in-an-existing-project).
Copy it into the current project directory, then run:

```sh
npm install ./rarefriends-friendsdk-0.1.0.tgz react react-dom
npx friendsdk init ./games/my-game
npx friendsdk dev ./games/my-game
```

`init` creates the generic starter. `dev` watches source files; refresh the
browser after edits. `npx friendsdk build ./games/my-game` writes generated output
to the game's `.friendsdk/` directory.

The package runner builds the component and serves it in the SDK's 960 × 640
container. It supplies wallet connection, owned Friend selection, fresh ownership
and eligibility checks, a sandbox and in-frame confirmations. Existing wallet
and selection context can be supplied through `ConnectedGameHost`.
See [the runtime guide](../HOST_INTEGRATION.md) for its interface.

Every playable prototype requires the connected account to own a hardwired
Generations NFT. Simulated previews have the same requirement. The runtime must
verify fresh eligibility before play and recheck on account, network or Friend
changes. Mock identities are for internal automated tests. Follow the
[prototype requirements](../README.md#required-prototype-identity-and-interface).

## Prototype economy and scope

Keep purchases, rewards, redemption and other economy actions simulated by
default. Wallet connection and read-only ownership checks are required; new
transaction adapters and custom Solidity contracts are deferred. On-chain work
is a later phase with the Rare Friends team after publishing requirements are
met, unless explicitly requested. Document intended actions and capability gaps
for that review.

Use bigint RF base units. State the exact cost, outcome weights, rewards,
maximum-prize reserves and consumable rules in `game.json` and the README. Keep
vendors, purchases, inventory, reveals, settings and confirmations inside the
game container. Trading, creator fees and wearable NFTs are not implemented SDK
v1 capabilities; see the [capability list](../HOST_INTEGRATION.md#capabilities).

Publication metadata is needed only when requested. Supply thumbnail/title,
developer credit, About and linked Store items as data for the publishing
interface.

## Verify and submit

Run `npm test`, `npm run typecheck`, `npm run check:games` and `npm run check:browser`.
`npm run check:runtime` runs the generic runtime browser check alone.
Submit source/assets, run instructions, SDK version, exact RF cost,
outcome weights, rewards and consumable rules. The reviewing AI and Rare Friends
review behavior and assets against `AGENTS.md`.

Deployment, wallet transactions and publication require their applicable
explicit authorization. Production publication requires Rare Friends review
and agreement. CI does not publish or deploy. Developer mainnet testing follows
the optional root README workflow.
