# Submit a game

Submissions stay in this isolated SDK prototype. The production web app has no game host or catalog; publication requires a separate approved integration.

Copy `examples/fishing` into `games/<name>` and keep `index.tsx`, `game.json`, assets, and a README with run instructions. Replace the presentation and game definition; use public SDK imports from `@rarefriends/friendsdk`.

Build the game viewport for the standard 960 × 640 container. Use the SDK menus inside it. The host supplies the selected Friend, NFT-wallet controls and confirmations through the isolated frame; game code cannot render UI outside the container. Supply a thumbnail, title, developer credit, About text and linked Store items as metadata for a future catalog/detail page. Keep purchases inside the container.

Run `npm test` and `npm run check:games`. Open a PR with a short description of the player action, probabilities and rewards. The automated checks validate configuration and build the game; the reviewing AI and Rare Friends review behavior and asset use against `AGENTS.md`.

After approval, Rare Friends contacts you to agree stake and deploys the contracts. No submission payment or developer contract is required. Stake must back every accepted play and kept reward.

For isolated mainnet development with your own Generations NFT, follow the build/deploy/play commands in the root README. This creates the standalone v1 game contracts without publishing to the production web app.
