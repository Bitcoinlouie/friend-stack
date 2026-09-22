# Friend Stack

A physics tower stacker where **every piece is your own Rare Friend**. FriendSDK
**v0.1.2** supplies wallet connection, owned-Friend selection, the fresh
ownership gate and the simulated action client. Friend Stack reads the selected
Friend's on-chain sprite frames and turns each distinct pose into a rigid body
whose collision shape is exactly its 16 × 16 pixel mask. Spiky Friends interlock,
round ones roll and hollow ones catch other pieces, so no two NFTs play the same.

## Run it

From the SDK root (Node.js 22+):

```sh
npm ci
(cd games/friend-stack && npm ci)   # installs planck, the Box2D physics engine
npm run dev:game -- games/friend-stack
```

Open `http://localhost:4173`, connect a wallet on Robinhood mainnet (chain 4663)
that holds a hardwired Generations Friend (generation 1 or higher), choose the
Friend and start stacking. For another device on your network, add
`--host 0.0.0.0 --port 4173` and open `http://YOUR_LAN_IP:4173` in a browser that
has the wallet (on a phone, use the wallet app's built-in browser).

Build static files for hosting with `npx friendsdk build games/friend-stack`.
The output is `games/friend-stack/.friendsdk/`.

## How to play

- Pick a mode on the start card. A pose of your Friend hovers above the
  platform: aim it, rotate it and drop it.
- Tower height is measured from the platform top to the highest resting piece.
  Your best height for the mode is marked with a dashed line, and a `+m` pop-up
  shows each time a piece raises your record.
- You have **3 lives**. Each Friend piece that falls off the platform costs one.
- Every 5 m is a milestone. The sky darkens into night as the tower climbs.
- **Wind:** above the wind zone (20 m in Free Stack), gusts come every few
  seconds. Each gust is announced about a second early ("WIND RISING →"), blows
  for about 2.4 s, and pushes the falling piece and the upper tower. The dashed
  drop guide bends to show the drift. You can wait out a gust before dropping.

### Modes

| Mode | Rules |
| --- | --- |
| Free Stack | A fresh random pose order every run. Standard physics. Wind above 20 m. |
| Daily Tower | Seeded by the UTC date: everyone gets the same pose order, gust timing and daily modifier, and every retry that day replays the same seed. |

Daily modifiers rotate between **Calm day** (standard), **Gusty day** (wind
from 8 m, 35% stronger), **Icy platform** (friction 0.35), **Moon day** (low
gravity) and **Narrow ledge** (platform 25% narrower). Heights are reported as
*pure* (before any revive) and *revived*, so paid continues never blur a
leaderboard comparison.

### Land: your Friend's generation matters

The Rare Friends docs say promotion "gives your Rare Friend more land to collect
crypto." In Friend Stack, land is the platform. The game reads the selected
Friend's `generation(friendId)` once, as a public read on the same RPC the
sprite reader uses, with no wallet or ownership logic. It then applies:

| Generation | Free Stack platform | Material | Promote to the next generation (real protocol price) |
| --- | --- | --- | --- |
| 6 | 8.0 m | Stone | 9 RF: 4.5 burned, 4.5 to NFT rewards |
| 5 | 8.4 m | Timber | 90 RF: 45 burned, 45 to NFT rewards |
| 4 | 8.8 m | Bronze | 900 RF: 450 burned, 450 to NFT rewards |
| 3 | 9.2 m | Silver | 9,000 RF: 4,500 burned, 4,500 to NFT rewards |
| 2 | 9.6 m | Signal | 90,000 RF: 45,000 burned, 45,000 to NFT rewards |
| 1 | 10.4 m | Gold | Widest land |

- **Land is additive.** Gen 6 gets the standard platform, and higher
  generations only add width.
- **The Daily Tower ignores land.** Everyone stacks on the day's standard
  platform, so daily heights stay a pure skill comparison.
- **The material is cosmetic, in every mode.** The platform wears its
  generation's material and label ("FRIEND STACK · GEN 1"), and the tower
  card shows the generation.
- **Upgrade nudges.** The first Friend lost in each Free Stack run notes how
  much wider the next generation's land is. The game-over screen and the menu
  show the next promotion's protocol price and its burn and reward split. The
  sandbox cannot link out, so the nudge says "Promote at rarefriends.com."
- **Fallback.** If the generation read fails, the game uses Gen 6 land and says
  so. Play is never blocked.

**Why this is the Genesis flywheel lever:** promotions are protocol actions,
split 50% burned and 50% to active NFT rewards, and about 95% of active reward
weight is Genesis today. A player climbing from Gen 6 to Gen 1 spends about
100,000 RF. That sends Genesis holders roughly as much RF as the full edge
from about 400 crates would.

### Controls

| Input | Move | Rotate | Drop |
| --- | --- | --- | --- |
| Keyboard | ← → or A D | ↑ W X (Z Q rotates back) | Space or ↓ |
| Mouse | Move the pointer | Right-click or scroll | Left-click |
| Touch | Drag | Tap | Swipe down or **Drop** |

On-screen **Rotate** and **Drop** buttons work on every device. The top bar has
**Sound on/off**, **Crates**, **Coats** and **Menu** (reduced motion, controls,
restart and change mode). Reduced motion, from the menu or the system setting,
turns off camera easing, screen shake, particles, landing squash, wind streaks
and the hover pulse; wind is still announced with a static banner. Gameplay
pauses whenever a menu or runtime confirmation is open. Sound is off until you
turn it on; landing thuds change pitch with piece size and altitude.

Phones in portrait get a 3:4 frame (`host.css`); wider screens use 3:2.

### Game over

The game-over screen shows a **tower card**: a snapshot of the whole tower with
the height, mode, Friend and revive count. Long-press or right-click saves it
for sharing. It also lists pure height, pieces dropped and lost, revives used
and the session best, and offers a revive, a restart or the other mode.

## The $RAREFRIENDS loop (simulated)

All RF, crates, coats, revives and redemptions are **simulated** in this preview.
Nothing is a real transaction. Every paid action uses the SDK's own `buy`,
`play`, `settle` and `redeem` calls with in-frame runtime confirmations, so the
same flow maps onto live contracts later.

The single consumable, the **Summit Crate** (1 RF), has three sinks. Each is
tied to a moment where the player *wants* to spend:

1. **Carry it up.** Once the tower is at least 3 m tall, choose **Carry a crate
   up**. The crate parachutes down in place of your next piece and is sticky: if
   it touches your tower with its base above 1.5 m, it sticks there and opens.
   If you miss the tower, it returns to your pack unopened, so physics never
   costs RF. Only a crate that sticks triggers `play` and `settle`.
2. **Revive.** When the last life goes, open crates to glue every standing
   piece in place and get 1 life back (with 2 s of grace for pieces still
   falling). The first revive costs 1 crate, the second 2 and the third 3, with
   at most 3 per tower. Missing crates are bought first. You keep every coat
   inside the crates you open.
3. **Collect the set.** Holding a Chalk, Brick *and* Neon Coat at the same time
   unlocks the **Prism Coat**, where each piece wears a different coat. It's
   purely cosmetic, with no RF value, and it lasts only while you keep all
   three, so it rewards holding rather than redeeming.

### Prices: preview and planned mainnet

The SDK's simulated preview gives every player a fixed 20 RF wallet, so
`game.json` prices crates at **1 RF** to keep the economy playable in the
preview. The **planned mainnet price is 1,000 RF per crate**, and every value
scales by the same 1:1000 factor. The game shows both columns in the Crates,
Coats, reveal and revive screens.

1,000 RF matches a Generation 3 hardwire on the protocol's powers-of-10 price
ladder. At the time of writing it was worth roughly $1.60, about one mobile
gacha pull. It also keeps the capped Dice randomness fee (0.000025 ETH per
request) to a few percent of the purchase. A deployed `ChanceGame` price is
immutable, so a large RF price move would call for a new deployment rather than
a price change.

| Rule | Preview (`game.json`, exact) | Planned mainnet |
| --- | --- | --- |
| Crate price | 1 RF (`1000000000000000000` base units) | 1,000 RF |
| Chalk Coat · 60% / 6,000 bps | 0.25 RF | 250 RF |
| Brick Coat · 25% / 2,500 bps | 1 RF | 1,000 RF |
| Neon Coat · 12% / 1,200 bps | 2 RF | 2,000 RF |
| Summit Crown · 3% / 300 bps · gold crown on your tower | 8 RF | 8,000 RF |
| Expected reward per crate | 0.88 RF | 880 RF |
| Revive cost (1st / 2nd / 3rd) | 1 / 2 / 3 crates | 1,000 / 2,000 / 3,000 RF |
| Backing per purchased or pending crate | 8 RF | 8,000 RF |

| Rule | Value |
| --- | --- |
| Consumable | One crate opens into exactly one coat |
| Revives | At most 3 per tower |
| Kept coats | Keep their fixed RF value as reserved liability |
| Redemption | Fixed value, no expiry |
| Prism Coat | Cosmetic unlock while holding one of each coat; no RF value or redemption |

**Where the crate edge goes (decision: the SDK default).** Each crate returns
88% of its price on average. Purchases are paid into the game's `ChanceGame`
prize pool, and the remaining 12% becomes free stake that only the deploying
developer can withdraw. The developer funds the prizes, and the edge pays for
that capital and its risk. The 3% Summit Crown makes each crate's payout swing
by about ±1,380 RF at mainnet scale, so the pool needs roughly 530 opened
crates before it reliably profits. Crate spending burns no RF and does not fund
NFT rewards directly. Players reach the protocol's burn and reward flows by
buying RF on the Rare Friends market to play (a 5% WETH fee funds active NFT
rewards) and by hardwiring a Generations Friend, which play requires (50%
burned, 50% to rewards).

The Crates menu shows a **Session spend** panel at mainnet scale: RF spent on
crates, crates opened, coat value received and the prize pool's result. It
makes spending, the vibeathon's Token Activity measure, visible during play.

**Why players spend:** coats hold their RF value, so buying a crate feels
low-regret. Revives put spending at the most emotional moment, just as your
best tower is about to fall. The set bonus gives a reason to keep coats rather
than cash them out, and the Daily Tower brings players back every day with a
new modifier. The tower card is a free share loop that brings in new players.

### Capability gaps for a later integration

- The sandbox has no save API, so heights, session bests, the worn coat and
  Daily results reset on reload. A real Daily leaderboard (for example with an
  RF entry pot) needs a persistence API and a backend.
- Crate outcomes come from the SDK's weighted chance table. The physics sim and
  daily seed are presentation only and never decide an RF outcome.
- Tier perks (tiers 0–4) are not implemented. The SDK exposes no tier read, and
  a tier-based bonus, such as a second NEXT preview or tier stars on the tower
  card, would need that read confirmed.
- Revives spend crates through `play`, so every revive also yields coats. A
  pure RF burn for revives, RF-priced perks (for example glue that anchors one
  piece) or wearable NFT coats would need upgrade, burn, multi-tier consumable
  or wearable APIs that SDK v0.1.2 does not supply.

## Files

| File | Purpose |
| --- | --- |
| `index.tsx` | Game component: start card, HUD, menus, input, sound, crate, revive and set flows |
| `engine.ts` | planck.js world, piece queue, lives, height, wind, sticky crates, revive glue |
| `render.ts` | Canvas renderer: sky, ruler, platform, pixel sprites, wind, effects, tower card |
| `daily.ts` | Free and Daily rules, daily modifiers, seeded random generator |
| `land.ts` | Generation read, land widths, platform materials, promotion prices |
| `pieces.ts` | Pixel mask to physics rectangles, coats, Prism palette, crate and crown art |
| `thud.ts` | Web Audio landing thuds (respects the mute toggle) |
| `game.json` | Crate price and outcome table |
| `host.css` | Responsive frame (3:2 landscape, 3:4 on portrait phones) |
| `test.mjs` | Automated browser check with the SDK's mock wallet |

## Checks

From the SDK root:

```sh
npx friendsdk check games/friend-stack
npx tsc -p games/friend-stack/tsconfig.json
node games/friend-stack/test.mjs            # add FRIEND_STACK_CHROME=chrome to use installed Chrome
```

`test.mjs` runs the real runtime and sandbox with the SDK's mock wallet and
sample Friend #7730, at 960 px and at 390 px (portrait). On desktop it:

- chooses Free Stack from the start card and checks the Gen 1 fixture Friend
  gets the 10.4 m Gold land, then drops pieces;
- buys a crate through the runtime confirmation and carries it up until it
  sticks and opens, then wears the coat and checks the collection counter;
- steers three pieces off the platform to end the run, and checks the tower
  card image;
- buys and opens a crate to revive, confirming both runtime prompts, then keeps
  stacking with the revived tag;
- checks the Session spend panel;
- switches to the Daily Tower and checks it uses the standard platform.

On the phone it starts the Daily Tower and drops pieces. Mock tests do not
replace a real-wallet playtest.

## Credits

- Physics: [planck.js](https://github.com/piqnt/planck.js) (MIT), a JavaScript port of Box2D.
- Friend artwork: canonical Rare Friends Generations sprites read on-chain through FriendSDK (see the SDK's NOTICE.md).
- Sounds: FriendSDK sound kit, plus landing thuds synthesised in code.
- All other art (platform, crate, parachute, crown, coats, sky, tower card) is drawn in code for this game.
