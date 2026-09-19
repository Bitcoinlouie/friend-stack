# V1 fishing reference

From the repository root:

```sh
npm ci
npm run build
npm run preview
```

Open http://127.0.0.1:4178, choose a sample Friend, buy bait, visit the lake, cast, reel in, then keep or sell. The standard 960 × 640 frame contains every game control, menu, odds table, Friend selector, wallet view and action confirmation. Small screens keep the same ratio; menus scroll inside the frame.

`FishingGame` is only the developer viewport. The trusted host supplies `GameFrame`, the selected Friend ID and the defined game client. The standalone `FishingPreview` is a local host fixture. The build also emits `dist/embed/fishing-frame.html` for isolated sandboxed-host experiments; it requires the host handshake described in `API.md`. The production web app does not host this example. A developer cannot add UI outside the game container.

This remains a local preview. Each selected Friend has separate simulated RF, bait and catches; switching preserves them for this session. Reload clears them. Sample Friends are explicitly labeled and make no ownership claim. No preview action sends a transaction. The shared wallet and confirmation menus belong to the host.

`game.json` contains exact RF base-unit amounts and outcome weights. `index.tsx` uses the SDK game client, menus, sounds and reveals. `world.tsx` uses shared projection, collision, movement, assets and canonical Friend pixels. Artwork failures leave a labeled position marker. Arrows/WASD and click/tap move the Friend; menus support keyboard and touch. Settings contains mute, reduced motion and walking-position reset.

The standalone starts each sample ledger with 20 RF and 100 RF of simulated stake. Every purchased bait reserves 10 RF. When free stake cannot cover the highest prize and the full purchase, new purchases stop. Purchased bait remains playable. Kept fish retain their backed RF value until sold, with no expiry.

Each cast settles once before its reveal. Switching Friends leaves the settled catch in the original Friend’s collection. Production must use confirmed contract results and recover committed plays; this preview is not evidence of a live deployment.

`art.json` contains the existing eight collectible bitmaps, not Friend character snapshots. Generated builds are ignored by Git. To verify the complete loop and container bounds at desktop and phone sizes:

```sh
PLAYWRIGHT_MODULE=/path/to/playwright node scripts/check-fishing-browser.mjs
```
