# Standalone FriendSDK v1 contracts

The package supplies immutable RF chance-game contracts and deployment tools.
RF, Generations, canonical NFT wallets and Dice are existing mainnet dependencies
accessed through interfaces.

## Two new contracts

| Contract | Responsibility |
| --- | --- |
| `ChanceGame` | Immutable RF price and outcome table, canonical-wallet purchases, reserved backing, permanent ERC-1155 rewards, Dice requests and settlement |
| `Consumable` | Whole prepaid plays held in the NFT wallet; only the game can mint or consume them; transfers are disabled |

Deploying `ChanceGame` creates its consumable in the same transaction. Its `team`
getter identifies the deploying developer, who alone can withdraw **free** RF
stake. Contract deployment and game publication are separate operations.

There are no launchpads, submission payments, extra currencies, tiers, activation gates, proxies, upgrade hooks, pause controls or configurable administrators. The existing RF token, Generations collection, NFT-wallet implementation and Dice oracle are referenced by interfaces only. Test doubles live exclusively in `test/`.

## Existing Robinhood mainnet dependencies

| Dependency | Address / value |
| --- | --- |
| Chain | Robinhood mainnet, `4663` |
| Public RPC | `https://rpc.mainnet.chain.robinhood.com` |
| Generations | `0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D` |
| RF | `0x0779369854d3EcdEA927206718FFD7730C67B71f` |
| Dice Entropy | `0xd8a0680e7699526b57140ed4eafdcc7219dc0a0c` |
| Dice provider | `0x8741b8a825644D9Ef18Faf2DAB5e9b47B900F2b6` |

Generations' `token()` must match RF. Deployment requires ETH for gas and the
selected RF prize stake in the deploying account. The deployment script prompts
for the stake and that account's private key.

For real play, the selected NFT must have generation ≥ 1 and be owned by the
signing account. Its wallet address comes from `tokenBoundAccount(tokenId)`; the
initial selection verifies ownership and hardwired eligibility and resolves that
canonical wallet for the session. Contracts enforce authorization and eligibility
when actions execute. No activation or tier is required.

The RF and Generations addresses are the existing project deployment and have been checked through public RPC. Dice's addresses and interface are published in its [mainnet deployment record](https://github.com/diceprotocol/dice-entropy/blob/main/docs/mainnet-deployment.md) and [integration guide](https://diceprotocol.world/). The CLI pins these addresses and checks chain and deployed code before deployment.

## Deploy and run a game

Use Node.js 22+, npm and Foundry with `forge` on your `PATH`. The deploying account
needs ETH for gas and RF for the chosen prize stake. Deployment does not require
an NFT ID. From the SDK root:

```sh
npm ci
npm run deploy:contracts -- examples/fishing/game.json
```

Enter the RF stake and deploying account's private key at the terminal prompts.
The private-key prompt is hidden. Review the immutable game terms and gas
estimate, then type `DEPLOY` to submit the deployment, exact RF approval and
stake-funding transactions. The command builds contracts and SDK bindings and
prints the saved public manifest path. Substitute your own `game.json` to deploy
different terms. Keep private keys out of source, shell arguments and manifests.

Set the following variable to the actual printed manifest path:

```sh
FRIENDSDK_DEPLOYMENT='contracts/deployments/4663-0xYOUR_GAME_ADDRESS.json'
npm run dev:game -- examples/fishing --deployment "$FRIENDSDK_DEPLOYMENT"
```

To build static files for that deployment:

```sh
node scripts/dev-game.mjs build examples/fishing --deployment "$FRIENDSDK_DEPLOYMENT" --outdir examples/fishing/.friendsdk/my-live
```

Host all files in `examples/fishing/.friendsdk/my-live/` as the static site root,
following the [serving requirements](../HOST_INTEGRATION.md#serving-and-sandbox).
Only public deployment fields enter the browser build. Omit `--deployment` for
simulated actions. See the [root workflow](../README.md#deploy-your-game-to-mainnet)
for deployment recovery and terminal play commands.

## Paid loop

1. The developer approves exactly the selected RF stake and funds the game from their signing account.
2. The NFT wallet approves exactly the purchase cost and calls `buy(friendId, quantity)`. Direct owner-funded purchases are rejected.
3. `play(friendId, quantity)` burns prepaid consumables and commits play IDs. The first play ID is the group's `batchId`. It remains callable even when new purchases are unavailable.
4. A sponsor calls `requestRandomness(batchId)` with the exact current fee from `Dice.getFeeV2(provider, 200000)`. The contract forwards the fee to `requestV2(provider, userRandomNumber, 200000)`. One request covers that play group.
5. Dice calls `_entropyCallback(sequenceNumber, provider, randomNumber)`. Only the pinned oracle and provider can fulfill a known request, once. This callback only records the result.
6. Anyone calls `settle(playId)`. The game derives the outcome from Dice's word, game address, chain ID, batch ID and play ID, then mints the reward into the canonical NFT wallet.
7. The NFT's current owner or wallet can `redeem(friendId, outcomeId, quantity)`. The reward burns and its fixed RF value returns to that same NFT wallet.

No oracle token, subscription setup or separate keeper deployment is needed.
`npm run play:contracts -- <manifest> [friendId]` prompts for an NFT ID when the
argument is omitted, verifies the initial selection and pays for its committed play's RNG request.
`npm run resolve:contracts` can resume a pending play. Running only the browser
preview does not request oracle delivery.

A Dice RNG request costs **0.000025 ETH**, excluding transaction gas. The browser
runtime rejects a quoted fee above that amount. Pending plays reuse their
existing request. Rare Friends plans to subsidize RNG costs for **all developers**
to improve the user experience and reduce costs. The demo does not implement this
subsidy; it demonstrates wallet-paid RNG.

## Backing and fishing terms

All RF amounts use 18-decimal base-unit integers. A new purchase requires free stake ≥ the highest prize before payment, and enough free stake plus payment to reserve every new consumable's maximum prize. Consuming a unit retains its reserve; settlement replaces it with the actual reward value. Redemption has no expiry. The developer cannot withdraw reserves for unused consumables, pending plays or kept rewards.

The default [fishing definition](../examples/fishing/game.json) charges 1 RF per bait, has a 10 RF maximum prize and a 0.90 RF expected reward. The exact outcome weights and redemption prices are in that JSON and [FISHING_GAME_DESIGN.md](../FISHING_GAME_DESIGN.md). Each purchased bait reserves 10 RF. Buying two bait therefore needs 18 RF of free stake before the 2 RF payment. Reward terms never change after deployment.

The stake is developer capital in the game. Player RF is separately held in the canonical NFT wallet. The play command can explicitly transfer a purchase shortfall from the owner's account to the NFT wallet before buying; the purchase itself always debits the NFT wallet.

## SDK integration

Pass the saved manifest to the SDK host transport as `deployment`; it supplies `chainId`, `game`, `rf` and `generations`. `scripts/contracts/play.mjs` is a working terminal example of the SDK's real transaction flow. Keep private keys and deployment tools outside browser game code.

```js
import { createChanceGameTransport } from '@rarefriends/friendsdk/host';

const game = createChanceGameTransport({
  deployment: manifest,
  account: ownerAddress,
  publicClient,
  walletClient,
});
await game.approvePurchase(friendId, 1n);
await game.buy(friendId, 1n);
const committed = await game.play(friendId, 1n);
// Sponsor Dice and settle with resolve:contracts using committed.plays[0].playId.
```

After Solidity changes, run `npm run build:contracts`, `npm run sync:contracts`, and `npm run build`. `npm run verify:contracts` checks that the generated ABI and compiler/source hashes match the local Forge artifact. Each new set of terms needs a new deployment; existing obligations remain with the old game.

## Tests and limits

`npm run test:contracts` checks backing, NFT-wallet payment, ownership transfers, permanent redemption, callbacks, request replay, and exact fishing odds, including fuzzed multi-player backing. The optional `MainnetForkTest` executes the actual RF, NFT wallet and Dice request code on a **local** mainnet fork. Oracle delivery is simulated because the live provider does not observe private fork transactions.

Dice uses commit-and-reveal and an external provider. That provider can delay or withhold delivery. Pending plays retain their RF backing, but this game does not expose Dice fee refunds, cancellation, rerolls or provider replacement. The deployment script does not prove live delivery or independently audit the external oracle.

The third-party OpenZeppelin and forge-std dependency subset, licenses and exact source hashes are included in `lib/`. The compiler is Solidity 0.8.36. Deployment manifests are ignored by Git and never contain a private key.
