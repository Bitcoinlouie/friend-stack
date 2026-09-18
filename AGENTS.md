# Build with FriendSDK

Read README.md, API.md, WORLD_RULES.md, and FISHING_GAME_DESIGN.md before changing a game. Use the exported SDK and shared assets. Keep game content in examples/ or games/.

- Fit the standard 960 × 640 game container. All game UI, menus and interactions stay inside it. Never access the parent page, inject outside UI, open popups, or request fullscreen/top navigation. Use the SDK menus.
- The host supplies the shared Friend selector, NFT wallet and transaction confirmations. Use its selected Friend and fixed action client; do not create another wallet/NFT selector. The catalog is thumbnail/title only; detail metadata is title, by dev, About and linked Store items.
- Build only the requested v1 game. Reuse working code and remove unnecessary scope. No currencies beyond RF, launchpads, markets, expiry windows, activation gates, or tier rules.
- A player controls a hardwired Generations NFT. Inventory and rewards belong to its canonical wallet, not a substituted owner address. Reading character artwork is not proof of ownership.
- Contracts determine paid outcomes. Animation, browser randomness, and local balances are presentation/preview only. Label previews clearly and never claim a transaction happened without a confirmed receipt.
- New purchases require free stake covering the highest prize; every purchased consumable reserves its maximum prize. Pending plays and kept rewards cannot share backing. Redemption has no expiry.
- Preserve canonical Friend pixels, world projection, collision, and depth sorting. Support keyboard/touch, mute, reduced motion, and loading/error states.
- Game code calls the SDK's defined actions. Do not request a signer, arbitrary calldata, deployment powers, or bankroll withdrawals.
- Submit source/assets, run instructions, SDK version, and the exact RF cost, outcome weights, rewards, and consumable rules. Use bigint for RF base units.
- Run the relevant checks and report failures honestly. Do not deploy or publish from PR automation. Developers may explicitly run the standalone mainnet deployment script for their own testing; production publication requires separate Rare Friends review.

FriendSDK is an isolated prototype. The production `rarefriends-web` app has no SDK integration, SDK content, or game demo. Keep examples and builds here; do not add production web routes, dependencies, or assets unless explicitly requested. Use `examples/fishing` as the local v1 reference.

Standalone game contracts live in `contracts/`; read its `AGENTS.md` and `COMMANDMENTS.md`. Reference the existing mainnet RF, Generations, canonical NFT wallets and Dice oracle through interfaces only. Private keys are entered in the developer's terminal, never in chat, source, environment files, or deployment records.
