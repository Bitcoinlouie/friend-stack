# Plan — Retry a Dice request that never reveals

Implements [Intent — Recover plays when Dice never reveals](intent-oracle-recovery.md).

Terms used below. A **play group** (batch) is the set of plays committed in one `play` call; its ID is its first play ID and it gets one Dice request. The **Friend controller** is the NFT's current owner or the NFT's canonical wallet, the same two parties the contract already accepts for `buy`, `play` and `redeem`. **Reclaim** is Dice's own `refundRequest`, which the original requester may call once Dice's delay has passed; it clears the request and returns the fee paid.

## Outcome

On a new deployment, a play group whose Dice request is never revealed can be moved forward by its Friend controller: one transaction reclaims the stuck request from Dice and sends a new one for the same group. Play IDs, pending count and reserved backing do not change. A delivered result can never be requested again. The resolve command detects the stuck state, explains it, and offers the retry behind a typed confirmation.

Non-goals: no bait or RF refund, no voiding, no developer power, no fallback randomness, no game-side timer, no change to the host transport or the frame's fixed action set, no change to existing deployments.

## Verified current state

- `ChanceGame.requestRandomness` sets `requested` once and refuses forever after ([ChanceGame.sol:189](../contracts/src/ChanceGame.sol)). `_entropyCallback` looks the batch up by sequence number and rejects unknown or already fulfilled ones. The game has no `receive` function, so it cannot accept ETH.
- Dice's deployed `refundRequest(provider, sequenceNumber)` reverts `Unauthorized` unless `msg.sender` is the recorded requester, reverts `RefundNotAvailable` until `block.number >= request.blockNumber + refundDelayBlocks`, clears the request, then sends `feePaid` with a plain call. `getRefundDelayBlocks()` and `getRequestV2(provider, sequenceNumber)` are public views. `requestV2` requires `msg.value` to equal the fee exactly. Callback status values: 1 not started, 2 in progress, 3 failed. In status 3 Dice has already emitted the random number in its `Revealed` event and keeps the request active for a callback retry.
- `scripts/contracts/resolve.mjs` sends one request if none exists, waits up to two minutes, and otherwise returns `pending`. `play.mjs` reuses it and prints the recovery command.
- `tests/contracts-anvil.test.mjs` deploys `MockDice` from the compiled contract test file, so the mock is shared by both suites.
- `testPublishedFishingTableAndBoundaries` asserts the game bytecode stays under the 24,576-byte limit.

## Phase 1 — Contract retry

### `contracts/src/ChanceGame.sol` — `IDiceEntropy`
- Add `refundRequest(address provider, uint64 sequenceNumber) external`.
- Add `getRequestV2(address provider, uint64 sequenceNumber) external view returns (DiceRequest memory)` with a `DiceRequest` struct declared in the interface mirroring Dice's storage struct field for field and in order: `address provider; uint64 sequenceNumber; uint32 numHashes; bytes32 commitment; uint64 blockNumber; address requester; bool useBlockhash; uint8 callbackStatus; uint16 gasLimit10k; uint128 feePaid`. A layout mismatch would make the view call revert or decode garbage; the fork test in Phase 4 is what checks it against deployed code.

### `contracts/src/ChanceGame.sol` — `retryRandomness(uint256 batchId)`
`external payable nonReentrant returns (uint64 sequenceNumber)`. In order:
1. `InvalidBatch` unless `batchId` is a committed group, same check as `requestRandomness`.
2. New error `RetryUnavailable` unless `randomness[batchId].requested` is true and `fulfilled` is false.
3. `_controller(plays[batchId].friendId)` must accept `msg.sender`; it already reverts `NotFriendController` or `InvalidFriend`.
4. `IncorrectOracleFee` unless `msg.value` equals `entropy.getFeeV2(provider, CALLBACK_GAS_LIMIT)` exactly. The caller pays the full current fee.
5. `RetryUnavailable` unless the struct from `entropy.getRequestV2(provider, stale)` has `sequenceNumber == stale` and `callbackStatus == 1`, where `stale` is the stored sequence number. Dice's `clearRequest` only zeroes the sequence number and leaves other fields, and the storage slot can later hold a different request, so both fields are checked. Status 3 means the word is already public. Either way the game refuses before touching Dice.
6. Record the game's ETH balance, call `entropy.refundRequest(provider, stale)`, and take the balance increase as `reclaimed`. Dice's `Unauthorized`, `RefundNotAvailable` and `NoSuchRequest` propagate unchanged, so a too-early retry fails atomically with Dice's own reason.
7. `delete _requestBatch[stale]`, so a callback for the old sequence reverts `InvalidRandomness` in `_entropyCallback` (batch resolves to zero).
8. `entropy.requestV2{ value: msg.value }` with the same user random number expression and gas limit as `requestRandomness`; store the new sequence, map it to the batch.
9. Send `reclaimed` to `msg.sender` with a plain call; revert with a new error `RefundFailed` if it fails. A controller that cannot receive ETH cannot retry, which hurts only themself.
10. Emit new event `RandomnessRetried(uint256 indexed batchId, uint64 indexed staleSequence, uint64 indexed sequenceNumber, uint256 reclaimed)`.

`requested` stays true throughout, so `requestRandomness` still refuses the batch and `settle` still reverts `RandomnessPending` until the new request is fulfilled. `pendingPlays`, `reservedPlays`, `plays` and consumable balances are not touched. The game's ETH balance is zero after the call.

### `contracts/src/ChanceGame.sol` — `receive()`
Accept ETH only when `msg.sender == address(entropy)`; otherwise revert `UnauthorizedRandomness`. It carries no reentrancy guard because it runs inside the guarded retry. Nothing else in the game can hold or move ETH.

### House style
Custom errors, no `require` strings, no getters duplicating state, no new storage beyond what exists. Keep the code size under the limit the existing test asserts; if it does not fit, say so rather than removing the callback-status guard.

## Phase 2 — Contract tests and bindings

### `contracts/test/ChanceGame.t.sol` — `MockDice`
Model Dice's behavior the retry depends on, nothing more:
- Store a `DiceRequest` per sequence: `requester = msg.sender`, `blockNumber`, `feePaid = msg.value`, `callbackStatus = 1`.
- Keep the `FEE` constant as the default so existing call sites such as `dice.FEE()` still compile; add a `fee` storage value initialized to it with `setFee`, and make `getFeeV2` return `fee` and `requestV2` require it exactly.
- `refundRequest`: revert `Unauthorized` unless caller is the requester, `RefundNotAvailable` until `blockNumber + 6`, `NoSuchRequest` if cleared; clear by zeroing only the stored sequence number, as Dice does, then send `feePaid` with a plain call. Declare these errors on the mock with Dice's names.
- `getRequestV2`, `getRefundDelayBlocks` (returns 6).
- `fulfill`: require an active request with status 1; clear it after a successful callback.
- `setCallbackFailed(sequence)`: set status 3 to simulate Dice's failed-callback state.

### `contracts/test/ChanceGame.t.sol` — new tests
- `testRetryNeedsFriendControllerAndDiceDelayThenBindsOneNewRequest`: request, retry from a non-controller reverts `NotFriendController`; retry as owner before six blocks reverts `MockDice.RefundNotAvailable`; `vm.roll` past the delay; retry as owner succeeds with the exact fee; assert new sequence differs, `randomness()` shows `requested` true and `fulfilled` false, old sequence `fulfill` reverts `InvalidRandomness`, new sequence `fulfill` succeeds, `settle` mints the expected outcome, `_assertBacking()` holds, `address(game).balance == 0`, `pendingPlays` and `reservedPlays` unchanged across the retry, and the owner's ETH is unchanged net of the fee they paid and got back. Also retry through the canonical wallet via `_execute` to cover the second controller.
- `testRetryPaysFullFeeAndReturnsReclaimedFee`: fee raised after the first request: retry with the old fee reverts `IncorrectOracleFee`; with the new fee succeeds and the caller receives exactly the old fee back. Fee lowered: same, caller pays the lower fee and receives the higher old fee back. `address(game).balance == 0` after each.
- `testRetryRefusesUnrequestedFulfilledSettledAndRevealedBatches`: unrequested batch reverts `RetryUnavailable`; fulfilled but unsettled batch reverts `RetryUnavailable`; settled batch reverts `RetryUnavailable`; after `setCallbackFailed` on an active request, retry reverts `RetryUnavailable` even after the delay. Assert no ETH moved.
- `testGameAcceptsEtherOnlyFromDice`: a direct ETH transfer to the game reverts; `address(game).balance` stays zero.
- Existing `testPendingRandomnessCannotBeReplacedOrSettledEarly` keeps its assertions and gains one line: retry immediately after the request reverts with Dice's `RefundNotAvailable`.

### Bindings
After Solidity changes run `npm run build:contracts`, `npm run sync:contracts` and `npm run build`. `src/chance-game-abi.ts` regenerates with the new function, event and errors; `npm run verify:contracts` must pass. No package export changes. The deployment manifest schema is unchanged.

## Phase 3 — Resolve command retry

### `scripts/contracts/common.mjs` — `ENTROPY_ABI`
Extend with `getRefundDelayBlocks() view returns (uint64)`, `getRequestV2(address,uint64) view returns ((address,uint64,uint32,bytes32,uint64,address,bool,uint8,uint16,uint128))`, and the errors `RefundNotAvailable()`, `NoSuchRequest()`, `Unauthorized()`. Errors are included so a simulation that fails inside Dice prints a name instead of raw revert data.

### `scripts/contracts/resolve.mjs` — `resolvePlay`
New option `retryStuck`, an async callback receiving a details object and returning true to proceed; default returns false so `play.mjs` and existing callers behave exactly as today. After the existing wait loop, when the request is still unfulfilled:
1. Read the Dice request with `getRequestV2` and the delay with `getRefundDelayBlocks`, and the current block number. If the request is not active (sequence zero), `callbackStatus` is not 1, or the delay has not passed, return `pending` as today with the extra fields `requestBlock`, `refundDelayBlocks`, `retryAvailable: false`.
2. Read the Friend's owner from Generations. If it is not the signing account, return `pending` with `retryAvailable: false` and `reason: 'not the Friend owner'`. Retrying through the canonical wallet is not offered by this command; the owner signs directly, as `_controller` allows.
3. Re-quote the fee; apply the same `maxOracleFee` rule as the first request.
4. Simulate `retryRandomness(batchId)` with `value: fee` using the game ABI merged with the Dice errors from `ENTROPY_ABI`. On failure return `pending` with the decoded error name as `reason`.
5. Call `retryStuck({ playId, batchId, friendId, staleSequence, requestBlock, currentBlock, fee, reclaim: request.feePaid })`. If it returns false, return `pending` with `retryAvailable: true`.
6. Send with `sendContract`. From the receipt, require a `RandomnessRetried` event from the game with this `batchId`, `staleSequence` equal to the old sequence and a different `sequenceNumber`. Re-read `randomness(batchId)` and require `requested` true, `fulfilled` false and the new sequence. Otherwise throw the same "receipt succeeded but could not be verified" style error used today.
7. Run the wait loop once more for the new sequence, then settle as today. If still unfulfilled, return `pending` with `retried: transactionHash` and the new `sequenceNumber`.

### `scripts/contracts/resolve.mjs` — `main`
Before the existing `RESOLVE` prompt, print that a stuck request may be retried and what that costs. Pass a `retryStuck` callback that prints, in plain words: the request's sequence and block, Dice's delay, the fee to pay now, the amount reclaimed in the same transaction, that it is the same play and the same bait with one result, and that only the Friend's owner can send it; then asks for `RETRY`. On a `pending` result, print `reason` when present, otherwise the existing "rerun later" line.

### `tests/contracts-cli.test.mjs`
Extend `fixture` with reads for `getRefundDelayBlocks` (6), `getRequestV2` (requester, `blockNumber` from an option, `callbackStatus` from an option, `feePaid` 5n, sequence from the request state), `getBlockNumber` from an option, and a `retryRandomness` write that changes the sequence to 2n and emits `RandomnessRetried` unless `missingLogs`. New test `resolver offers a retry only when Dice can reclaim, pays the quoted fee once, verifies the new request, and never retries a revealed or fulfilled request`:
- delay not passed: no write, `retryAvailable` false;
- delay passed, callback returns false: no write, `retryAvailable` true;
- callback returns true: one `retryRandomness` write with `value` 5n, result `pending` with sequence 2n and `retried` hash;
- `fulfillOnRetry` option: continues to settle with writes `['retryRandomness', 'settle']`;
- `missingLogs`: rejects with the verification error;
- fulfilled request or `callbackStatus` 3: callback never invoked, no write;
- `ownerOf` not the signer: no write, `reason` mentions the owner;
- `maxOracleFee` below the re-quoted fee: rejects with the existing "fee increased" error before the callback is invoked, extending the existing fee-increase test to the retry path.

### `tests/contracts-anvil.test.mjs`
In the existing single test, after the first `pending` assertion: call `resolvePlay` with `retryStuck: async () => true` before mining and assert no new transaction; mine six blocks with `anvil_mine`; call again and assert `retried` is set, the sequence changed, the mock Dice balance equals one fee, and the game's ETH balance is zero; then `fulfill` the new sequence and continue with the existing settlement assertions unchanged. `RandomnessRetried` is verified through `resolvePlay` itself.

## Phase 4 — Local mainnet fork proof

### `contracts/test/MainnetFork.t.sol`
After the real `requestV2` on the fork and before mocked delivery: read `getRefundDelayBlocks()` through a test-local interface, `vm.roll` past it, `vm.deal` the owner, and call `retryRandomness{ value: fee }(batchId)` as the owner. This executes Dice's deployed `refundRequest` and `requestV2` code. Assert the new sequence differs, `getRequestV2` for the old sequence reports sequence zero, the game's ETH balance is zero, and the owner's balance is unchanged. Then mock delivery for the new sequence and keep the existing settlement and redemption assertions. This is the only check that the `DiceRequest` layout and refund path match deployed Dice code. It runs only with `FRIENDSDK_FORK_RPC` set and is not part of CI.

## Phase 5 — Rules and docs

- `contracts/AGENTS.md`, the Dice rule: keep "Use Dice's explicit requestV2 interface. Authenticate callbacks." Replace "bind each request once. Do not add rerolls, cancellation, fallback entropy, or mutable provider selection." with: never reroll a delivered result; never send a second request while one is active; a play group may get a new request only after Dice has cleared an unrevealed one through its own refund, triggered by the Friend controller; no cancellation, fallback entropy, or mutable provider selection.
- `README.md`, the recovery paragraph after the resolve command: replace "The supplied game has no refund, replacement request or expiry." with a description of the retry: who may send it, that it costs the current fee and returns the reclaimed one, that the play and bait are unchanged, that there is no refund of bait or RF, and that the live reclaim path has not been observed on mainnet until a developer reports one.
- `contracts/README.md`: step 4 of the paid loop gains the retry sentence; the "Tests and limits" paragraph replaces "does not expose Dice fee refunds, cancellation, rerolls or provider replacement" with the retry's limits, names the callback-status guard, and states that the fork test exercises Dice's refund code locally only.
- `API.md`, the paragraph on `requestRandomness`: one sentence that a stuck request is retried through the resolve command by the Friend's owner and that the transport and bridge expose no retry.

## Integrity risks

- A retry shown as a new play or second chance — the contract leaves `plays`, `pendingPlays` and `reservedPlays` untouched and the resolve output names the same play and batch IDs; pinned by the controller-and-delay contract test and the CLI test's result fields.
- Re-requesting a word Dice already revealed — step 5's callback-status guard; pinned by the revealed-batch case in the refusal contract test.
- A late callback for the reclaimed sequence landing on the batch — the sequence mapping is deleted at step 7; pinned by the old-sequence `fulfill` assertion.
- A second request while the first is still active — Dice's delay and active checks are the only clock and the game never bypasses them; pinned by the too-early revert in the existing pending test and the Anvil pre-mining call.
- Reclaimed ETH read as a payout or RF change — the output labels it as the Dice fee returned to the signer; RF balances, reserves and inventory are asserted unchanged across a retry in the contract and Anvil tests.
- A retry reported before it happened — `sendContract` receipt checks plus the required `RandomnessRetried` event and the re-read of `randomness`; pinned by the `missingLogs` CLI case.
- A stale fee quote — the fee is re-quoted before simulation and compared with `maxOracleFee` exactly as the first request is; pinned by the existing fee-increase CLI test extended to the retry path.
- Docs claiming live proof — README and contracts README say the fork test proves the code path locally and that live reclaim is unobserved until reported.
- Game ETH left behind — `receive` accepts only Dice; balance asserted zero after every retry in all three suites.

## Verification

### Tests
- `npm run build:contracts`, `npm run sync:contracts`, `npm run build` after Solidity changes.
- `npm run test:contracts` (needs Foundry): the four new tests, the extended pending test, and all existing tests including the size assertion and the fuzz backing test.
- `npm run verify:contracts`: bindings match the build.
- `npm test`: builds, then runs the CLI test and the Anvil test (Anvil skips itself without Foundry).
- `npm run typecheck`, `npm run check:games`: unchanged expectations; the frame and games do not change.

### Real-run verification
- The Anvil test is the end-to-end local run: real transactions on a local chain through the same resolve code the developer uses, with mock delivery.
- `FRIENDSDK_FORK_RPC=https://rpc.mainnet.chain.robinhood.com forge test --root contracts --match-contract MainnetForkTest -vv` proves the retry against deployed Dice code on a local fork. Passing means the struct layout decodes, the reclaim returns the fee to the game, the new request is accepted, and the game holds no ETH.
- A mainnet retry against a genuinely stuck request is the only proof of live behavior. It is run explicitly by a developer with `npm run resolve:contracts`, never by automation, and the docs state it is unobserved until then.

## Delivery order
1. Phase 1 and Phase 2 together: contract, mock, contract tests, bindings. Verifiable by `npm run test:contracts` and `npm run verify:contracts`.
2. Phase 3: tooling and its CLI and Anvil tests. Verifiable by `npm test`.
3. Phase 4: fork test extension. Verifiable with the fork RPC.
4. Phase 5: rule and doc wording, last so it describes what was built.

## Done
- A stuck request can be retried by the Friend controller on a fresh local deployment, and only by them, only after Dice's delay, only when Dice's callback never started.
- After a retry, the old sequence cannot fulfill the batch, the new one can, settlement and redemption behave exactly as for an unstuck play, and backing accounting balances.
- The game never holds ETH after any call and never accepts ETH except from Dice.
- The resolve command offers the retry only when it would succeed, requires `RETRY`, verifies the receipt and event, and reports still-pending honestly with a reason.
- All CI gates pass; the fork test passes against deployed Dice code.
- The contracts rule, both READMEs and API.md describe the retry and its limits, and state that live reclaim is unobserved.
