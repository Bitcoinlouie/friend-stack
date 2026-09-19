# Intent — Recover plays when Dice never reveals

A committed play waits for one random number from Dice, the external randomness provider. If Dice's provider never reveals it, the play stays pending forever: the player's consumed bait is gone, the game keeps the maximum prize reserved for that play, and nothing in the contract or tooling can move it. Dice already offers a way out of this, but the game contract cannot use it. This intent makes the game able to retry a stuck request so every committed play eventually gets its one result.

## What is true today

Each group of plays committed together gets exactly one Dice request, sent by the game contract itself. The contract records that a request was made and refuses to make another for that group, ever. The resolve command only waits and re-reads; it cannot send a second request.

Dice, on its side, lets the original requester reclaim a request that has not been revealed after a short delay (six L1 blocks, roughly one to two minutes). Reclaiming clears the request and returns the exact fee paid. Once cleared, that request can never be revealed, so no late result can arrive for it. The requester is the game contract, and only the requester may reclaim. The game exposes no way to do so and cannot even accept the returned fee. So the recovery Dice provides is unreachable from our side.

## What should become true

**A stuck request can be retried.** After Dice has cleared an unrevealed request for a play group, the game can send a new request for that same group. The group keeps its play IDs, its reserved backing, and its rule that each play resolves to one outcome derived from one Dice word. Nothing about the plays changes except which request they are waiting on.

**Only the Friend's controller may retry.** The retry is triggered by the NFT owner or the NFT's canonical wallet, the same parties allowed to buy and play for that Friend. Nobody else can unstick a play on the player's behalf, and nobody else can interfere with it.

**Reclaim and re-request happen as one action.** The retry reclaims the old request from Dice and immediately sends the new one, paying the new request with the reclaimed fee. Any difference between the old fee and Dice's current fee is settled with the caller in the same action. No fee ever rests inside the game contract between requests. The game's timer is Dice's own delay: the game holds no clock of its own, and a retry attempted too early simply fails.

**A retry is never a reroll.** A second request is possible only after Dice has cleared the first without revealing it. A delivered result is final and can never be requested again. While a request is still active, the game refuses a second one exactly as it does today.

**The rules say this precisely.** The contracts rule that reads "bind each request once. Do not add rerolls, cancellation, fallback entropy, or mutable provider selection" changes to say: no reroll of a delivered result, no second request while one is active, and a new request only after Dice has cleared an unrevealed one. The two READMEs stop stating that the game has no replacement request, and instead describe the retry and its limits.

**Tooling can drive the retry.** The resolve command, which today waits and re-reads, should recognize the cleared-request state, tell the developer plainly what it means, and offer the retry as the same Friend controller that committed the play.

## What stays fixed

- One outcome per play, derived from one Dice word. No outcome is ever replaced.
- Pending plays keep their maximum-prize reserve until settled. Kept rewards keep their value with no expiry.
- The pinned Dice contract and provider do not change. There is no fallback randomness source.
- The developer gains no new power. Only free stake may be withdrawn, as today.
- The game has no expiry window of its own; the only delay involved belongs to Dice.

## Non-goals

- Returning bait or RF for a stuck play. The player's remedy is a retry, not a refund.
- Voiding plays, by anyone.
- Recovering from Dice itself being paused, upgraded, or removed. No option inside these rules helps there; the reserve stays locked in that case, and the docs must say so.
- Changing existing deployments. This is a contract change, so it applies only to new deployments with new immutable terms. Plays stuck on a current deployment stay stuck.

## Player-facing honesty

- A retry must never be shown as a new play, a second chance, or a better odds event. Same play, same bait, one result.
- The reclaimed Dice fee is ETH moving between Dice and the caller. It must never be presented as a payout, a reward, or a change in the player's RF balance.
- While a request is stuck or being retried, the play is shown as pending. No preview, animation, or placeholder may stand in for a result before a confirmed settlement receipt.
- Tests can only simulate a provider that never reveals. A passing test proves the contract logic, not that Dice's live reclaim path works. Only a retry against a real stuck request on mainnet proves that, and until one has been observed the docs say it has not.

## What success looks like

A developer commits a play on a fresh deployment, and the provider does not reveal. After Dice's delay passes, the Friend's owner runs the resolve command, which retries the request. Dice reveals against the new request, the play settles to one outcome, the reserve becomes that outcome's reward liability, and the backing accounting balances exactly as it does for a play that was never stuck. Attempting the retry too early, on a play that is already settled, or from a wallet that is not the Friend's controller fails with a clear reason and changes nothing.
