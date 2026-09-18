import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeFunctionData, encodeAbiParameters, encodeEventTopics, encodeFunctionResult, getAbiItem, parseAbi, zeroAddress } from 'viem';
import { CHANCE_GAME_ABI } from '../dist/chance-game-abi.js';
import { ChanceTransactionError, createChanceGameTransport } from '../dist/chain.js';

const GAME = '0x1111111111111111111111111111111111111111';
const GENERATIONS = '0x2222222222222222222222222222222222222222';
const RF = '0x3333333333333333333333333333333333333333';
const OWNER = '0x4444444444444444444444444444444444444444';
const FRIEND = '0x5555555555555555555555555555555555555555';
const CONSUMABLE = '0x6666666666666666666666666666666666666666';
const OTHER = '0x7777777777777777777777777777777777777777';
const TX = `0x${'aa'.repeat(32)}`, HASH = `0x${'bb'.repeat(32)}`, DIFFERENT = `0x${'cc'.repeat(32)}`;
const DEPLOYMENT = { chainId: 4663, game: GAME, generations: GENERATIONS, rf: RF };
const TOKEN_EVENTS = parseAbi([
  'function approve(address spender, uint256 amount) returns (bool)',
  'event Approval(address indexed owner, address indexed spender, uint256 value)',
  'event Transfer(address indexed from, address indexed to, uint256 value)',
]);

function inner(request) {
  assert.equal(request.functionName, 'execute');
  assert.equal(request.address, FRIEND);
  assert.equal(request.account, OWNER);
  assert.equal(request.value, 0n);
  const [target, value, data, operation] = request.args;
  assert.equal(value, 0n); assert.equal(operation, 0);
  assert.ok(target === GAME || target === RF);
  return decodeFunctionData({ abi: target === RF ? TOKEN_EVENTS : CHANCE_GAME_ABI, data });
}

function log(abi, eventName, args, address = GAME) {
  const event = getAbiItem({ abi, name: eventName });
  const inputs = event.inputs.filter(input => !input.indexed);
  return { address, topics: encodeEventTopics({ abi, eventName, args }),
    data: encodeAbiParameters(inputs, inputs.map(input => args[input.name])), blockNumber: 101n,
    blockHash: HASH, transactionHash: TX, transactionIndex: 0, logIndex: 0, removed: false };
}

function fixture(overrides = {}) {
  const account = overrides.account ?? OWNER;
  const state = { publicChain: 4663, walletChain: 4663, selected: account, generation: 2, owner: OWNER,
    canonicalWallet: FRIEND, tbaOwner: OWNER, tokenChain: 4663n, tokenCollection: GENERATIONS, tokenId: 5n,
    boundRF: RF, boundGenerations: GENERATIONS, receiptStatus: 'success', receiptHash: TX,
    reorg: false, waitFailure: false, simulationFailure: false, wrongEventFriend: false, wrongStoredFriend: false,
    wrongMintRecipient: false, wrongApproval: false, wrongStoredOutcome: false, switchAfterSimulation: false, ...overrides };
  const reads = [], simulations = [], writes = [];
  const publicClient = {
    async getChainId() { return state.publicChain; },
    async getBlockNumber() { return 100n; },
    async getBlock({ blockNumber }) { return { number: blockNumber, hash: state.reorg && blockNumber === 101n ? DIFFERENT : HASH }; },
    async readContract(call) {
      reads.push(call);
      if (state.missingDeployment && call.address === GAME) throw new Error('Contract function returned no data');
      const [first, second] = call.args ?? [];
      switch (call.functionName) {
        case 'rf': return state.boundRF;
        case 'generations': return state.boundGenerations;
        case 'consumable': return CONSUMABLE;
        case 'price': return 10n;
        case 'maxPrize': return 100n;
        case 'outcomeCount': return 2n;
        case 'ownerOf': return state.owner;
        case 'generation': return state.generation;
        case 'tokenBoundAccount': return state.canonicalWallet;
        case 'owner': return state.tbaOwner;
        case 'token': return [state.tokenChain, state.tokenCollection, state.tokenId];
        case 'reservedPlays': return 200n;
        case 'rewardLiability': return 100n;
        case 'balanceOf':
          if (call.address === CONSUMABLE) return 3n;
          if (first === GAME) return 1000n;
          if (first === OWNER) return 400n;
          if (first === FRIEND) return 70n;
          throw new Error('Unexpected balance address');
        case 'balanceOfBatch': assert.deepEqual(first, [FRIEND, FRIEND]); assert.deepEqual(second, [1n, 2n]); return [2n, 1n];
        case 'outcomes': return first === 1n ? [9000, 1n, 'ipfs://small'] : [1000, 100n, 'ipfs://large'];
        case 'plays':
          return [state.wrongStoredFriend ? 8n : 5n, 9n,
            call.blockNumber === 101n && writes.length && inner(writes.at(-1)).functionName === 'settle' ? state.wrongStoredOutcome ? 1n : 2n : 0n];
        default: throw new Error(`Unexpected read ${call.functionName}`);
      }
    },
    async simulateContract(request) {
      simulations.push(request);
      const action = inner(request);
      if (state.simulationFailure) throw new Error('Simulation reverted');
      if (state.switchAfterSimulation) state.selected = OTHER;
      if (state.transferAfterSimulation) state.owner = state.tbaOwner = OTHER;
      if (state.walletAfterSimulation) state.canonicalWallet = OTHER;
      if (state.temporaryAfterSimulation) state.generation = 0;
      return { request, result: action.functionName === 'approve'
        ? encodeFunctionResult({ abi: TOKEN_EVENTS, functionName: 'approve', result: !state.falseApproval }) : '0x' };
    },
    async waitForTransactionReceipt({ hash, confirmations }) {
      assert.equal(hash, TX); assert.equal(confirmations, 2);
      if (state.waitFailure) throw new Error('RPC timeout');
      const action = inner(writes.at(-1)), args = action.args;
      const friendId = state.wrongEventFriend ? 8n : 5n;
      const recipient = state.wrongMintRecipient ? OWNER : FRIEND;
      let logs;
      switch (action.functionName) {
        case 'approve': logs = [log(TOKEN_EVENTS, 'Approval', { owner: state.ownerApproval ? OWNER : FRIEND, spender: state.wrongApproval ? OTHER : GAME, value: args[1] }, RF)]; break;
        case 'buy': logs = [log(CHANCE_GAME_ABI, 'Purchased', { friendId, quantity: args[1], payment: args[1] * 10n }),
          log(TOKEN_EVENTS, 'Transfer', { from: state.ownerPayment ? OWNER : FRIEND, to: GAME, value: args[1] * 10n }, RF),
          log(TOKEN_EVENTS, 'Transfer', { from: zeroAddress, to: recipient, value: args[1] }, CONSUMABLE)]; break;
        case 'play': logs = [log(TOKEN_EVENTS, 'Transfer', { from: FRIEND, to: zeroAddress, value: args[1] }, CONSUMABLE),
          ...Array.from({ length: Number(args[1]) }, (_, index) => log(CHANCE_GAME_ABI, 'Played', { playId: 7n + BigInt(index), friendId, batchId: 9n }))]; break;
        case 'settle': logs = [log(CHANCE_GAME_ABI, 'Settled', { playId: args[0], friendId, outcomeId: 2n }),
          log(CHANCE_GAME_ABI, 'TransferSingle', { operator: account, from: zeroAddress, to: recipient, id: 2n, value: 1n })]; break;
        case 'redeem': logs = [log(CHANCE_GAME_ABI, 'Redeemed', { friendId, outcomeId: args[1], quantity: args[2], payment: args[2] * 100n }),
          log(CHANCE_GAME_ABI, 'TransferSingle', { operator: account, from: FRIEND, to: zeroAddress, id: args[1], value: args[2] }),
          log(TOKEN_EVENTS, 'Transfer', { from: GAME, to: recipient, value: args[2] * 100n }, RF)]; break;
        default: throw new Error('Unexpected wallet action');
      }
      return { status: state.receiptStatus, transactionHash: state.receiptHash, blockNumber: 101n, blockHash: HASH, logs };
    },
  };
  const walletClient = { chain: { id: 4663 },
    async getChainId() { return state.walletChain; },
    async getAddresses() { return [state.selected]; },
    async writeContract(request) { writes.push(request); return TX; },
  };
  const transport = createChanceGameTransport({ deployment: DEPLOYMENT, account, publicClient, walletClient, confirmations: 2 });
  return { state, reads, simulations, writes, transport, publicClient, walletClient };
}

test('construction is inert; one-block reads use only the canonical Friend RF balance', async () => {
  const f = fixture(); assert.equal(f.reads.length, 0); assert.equal(f.writes.length, 0);
  const snapshot = await f.transport.read(5n);
  assert.equal(snapshot.payer, FRIEND); assert.equal(snapshot.payerRF, 70n);
  assert.equal(snapshot.recipient, FRIEND); assert.equal(snapshot.recipientRF, 70n);
  assert.equal(snapshot.freeStake, 700n); assert.equal(snapshot.reservedPlays, 200n); assert.equal(snapshot.rewardLiability, 100n);
  assert.equal(snapshot.canControl, true); assert.equal(snapshot.consumables, 3n);
  assert.deepEqual(snapshot.outcomes.map(outcome => [outcome.id, outcome.quantity]), [[1n, 2n], [2n, 1n]]);
  assert.ok(f.reads.every(call => call.blockNumber === 100n));
  assert.ok(!f.reads.some(call => call.functionName === 'balanceOf' && call.args[0] === OWNER));
  for (const name of ['fund', 'withdraw', 'withdrawSurplus', 'writeContract', 'deploy', 'walletClient', 'publicClient']) assert.equal(f.transport[name], undefined);
});

test('wrong or missing deployment, wrong chain, temporary Friend and unrelated wallets cannot sign', async () => {
  for (const changes of [
    { boundRF: OTHER }, { boundGenerations: OTHER }, { missingDeployment: true },
    { publicChain: 1 }, { walletChain: 1 }, { generation: 0 }, { owner: OTHER }, { selected: OTHER },
    { tbaOwner: OTHER }, { tokenChain: 1n }, { tokenCollection: OTHER }, { tokenId: 7n },
    { account: FRIEND },
  ]) {
    const f = fixture(changes);
    await assert.rejects(f.transport.buy(5n, 1n));
    assert.equal(f.writes.length, 0, Object.keys(changes).join(', '));
  }
  assert.throws(() => createChanceGameTransport({ deployment: { ...DEPLOYMENT, game: zeroAddress }, account: OWNER }));
});

test('owner signs exact approval through the Friend wallet and never buys automatically', async () => {
  const f = fixture(), result = await f.transport.approvePurchase(5n, 3n);
  assert.equal(result.amount, 30n); assert.equal(result.spender, GAME); assert.equal(result.payer, FRIEND);
  assert.equal(f.writes.length, 1); assert.equal(f.writes[0].args[0], RF);
  assert.deepEqual(inner(f.writes[0]), { functionName: 'approve', args: [GAME, 30n] });
  assert.equal(f.simulations.length, 1);
  for (const changes of [{ wrongApproval: true }, { ownerApproval: true }]) {
    const wrong = fixture(changes);
    await assert.rejects(wrong.transport.approvePurchase(5n, 1n), { code: 'unverified', transactionHash: TX });
  }
  const noApproval = fixture({ falseApproval: true });
  await assert.rejects(noApproval.transport.approvePurchase(5n, 1n));
  assert.equal(noApproval.writes.length, 0);
});

test('simulation failure, wallet switches and stale Friend ownership submit nothing', async () => {
  for (const state of [{ simulationFailure: true }, { switchAfterSimulation: true },
    { transferAfterSimulation: true }, { walletAfterSimulation: true }, { temporaryAfterSimulation: true }]) {
    const f = fixture(state); await assert.rejects(f.transport.buy(5n, 1n)); assert.equal(f.writes.length, 0);
  }
});

test('successful purchase binds RF payer and consumable mint to the canonical Friend wallet', async () => {
  const f = fixture(), result = await f.transport.buy(5n, 2n);
  assert.equal(result.payer, FRIEND); assert.equal(result.recipient, FRIEND); assert.equal(result.payment, 20n);
  assert.deepEqual(inner(f.writes[0]), { functionName: 'buy', args: [5n, 2n] });
  for (const state of [{ wrongMintRecipient: true }, { wrongEventFriend: true }, { ownerPayment: true }]) {
    const wrong = fixture(state);
    await assert.rejects(wrong.transport.buy(5n, 1n), { code: 'unverified', transactionHash: TX });
  }
});

test('failed, unknown, replaced or reorganized receipts never return success', async () => {
  for (const [changes, code] of [
    [{ receiptStatus: 'reverted' }, 'reverted'], [{ waitFailure: true }, 'unconfirmed'],
    [{ receiptHash: DIFFERENT }, 'replaced'], [{ reorg: true }, 'reorg'],
  ]) {
    const f = fixture(changes);
    await assert.rejects(f.transport.buy(5n, 1n), error => error instanceof ChanceTransactionError && error.code === code && error.transactionHash === TX);
    assert.equal(f.writes.length, 1);
  }
});

test('play IDs come from confirmed events and must match stored Friend and randomness batch', async () => {
  const f = fixture(), result = await f.transport.play(5n, 2n);
  assert.deepEqual(result.plays.map(play => play.playId), [7n, 8n]);
  assert.deepEqual(inner(f.writes[0]), { functionName: 'play', args: [5n, 2n] });
  assert.ok(result.plays.every(play => play.friendId === 5n && play.batchId === 9n));
  assert.ok(f.reads.filter(call => call.functionName === 'plays').every(call => call.blockNumber === 101n));
  const wrong = fixture({ wrongStoredFriend: true });
  await assert.rejects(wrong.transport.play(5n), { code: 'unverified', transactionHash: TX });
});

test('settlement result must agree with stored play and actual minted item', async () => {
  const f = fixture(), result = await f.transport.settle(7n);
  assert.equal(result.outcomeId, 2n); assert.equal(result.recipient, FRIEND);
  assert.equal(result.friendId, 5n); assert.equal(result.batchId, 9n);
  assert.deepEqual(inner(f.writes[0]), { functionName: 'settle', args: [7n] });
  for (const state of [{ wrongStoredOutcome: true }, { wrongMintRecipient: true }, { wrongEventFriend: true }]) {
    const wrong = fixture(state);
    await assert.rejects(wrong.transport.settle(7n), { code: 'unverified', transactionHash: TX });
  }
});

test('redemption burns the kept item and pays RF to the Friend rather than its owner', async () => {
  const f = fixture(), result = await f.transport.redeem(5n, 2n, 1n);
  assert.equal(result.payment, 100n); assert.equal(result.recipient, FRIEND);
  assert.deepEqual(inner(f.writes[0]), { functionName: 'redeem', args: [5n, 2n, 1n] });
  const wrong = fixture({ wrongMintRecipient: true });
  await assert.rejects(wrong.transport.redeem(5n, 2n, 1n), { code: 'unverified', transactionHash: TX });
});
