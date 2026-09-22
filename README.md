# Friend Stack

A physics tower stacker where **every piece is your own Rare Friend**. Connect a
wallet, pick a hardwired Generations Friend, and stack its on-chain poses. Each
pose's 16 × 16 pixel mask is the piece's exact collision shape — spiky Friends
interlock, round ones roll, and hollow ones catch other pieces.

**Live preview:** https://bitcoinlouie.github.io/friend-stack/

You need a browser wallet on Robinhood mainnet (chain 4663) holding a hardwired
Generations NFT (generation 1 or higher). On a phone, open the link in your
wallet app's built-in browser. Balances and outcomes in this preview are
simulated.

## Run locally

Node.js 22+:

```sh
npm ci
(cd games/friend-stack && npm ci)
npm run dev:game -- games/friend-stack
```

Open `http://localhost:4173`. Build static files with
`npx friendsdk build games/friend-stack` (output:
`games/friend-stack/.friendsdk/`).

## Modes

- **Free Stack** — random pose order; platform width follows your Friend's
  generation ("land").
- **Daily Tower** — seeded by the UTC date so everyone gets the same poses,
  wind, standard platform, and daily modifier.

Aim, rotate, and drop. You have 3 lives. Above the wind zone, gusts push the
falling piece and the upper tower. Game over produces a shareable tower card.
RF crates, coats, and revives use FriendSDK's simulated action client.

## More

Full rules, economy notes, checks, and file map:
[`games/friend-stack/README.md`](games/friend-stack/README.md).

Builder: BitcoinLouie · [@Bitcoinlouie](https://github.com/Bitcoinlouie).

Built on **FriendSDK v0.1.2** — this repository is a fork of
[spokesz/friendsdk](https://github.com/spokesz/friendsdk). SDK docs and source
remain in the tree for building and extending Rare Friends games.
