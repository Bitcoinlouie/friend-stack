import test from 'node:test';
import assert from 'node:assert/strict';
import { bindGameFrame, createFrameGameClient } from '../dist/frame-bridge.js';
import { createGamePreview, RF } from '../dist/game.js';

const definition = { name: 'Test', consumable: 'Bait', price: RF, outcomes: [{ name: 'Fish', chanceBps: 10000, reward: 2n * RF }] };
function setup(authorize = async () => {}) {
  const { port1, port2 } = new MessageChannel();
  const preview = createGamePreview(definition, { stake: 10n * RF, rfBalance: 20n * RF, friendId: 5n, draw: () => 0 });
  const host = bindGameFrame(port1, { client: preview.client, authorize });
  const frame = createFrameGameClient(port2, definition);
  return { host, frame, preview, port2, close: () => { host.close(); frame.close(); } };
}
test('private frame actions require host approval and stay bound to its Friend', async () => {
  const approvals = [];
  const session = setup(async (method, args) => approvals.push([method, ...args]));
  try {
    assert.equal((await session.frame.client.read()).friendId, 5n);
    await session.frame.client.buy(1n);
    const [play] = await session.frame.client.play();
    await session.frame.client.settle(play.id);
    await session.frame.client.redeem(1, 1n);
    assert.equal((await session.frame.client.read()).rfBalance, 21n * RF);
    assert.deepEqual(approvals, [['buy', 1n], ['play', 1n], ['redeem', 1, 1n]]);
  } finally { session.close(); }
});
test('rejected confirmations and invalid quantities do not change a ledger', async () => {
  const session = setup(async () => { throw new Error('Cancelled'); });
  try {
    await assert.rejects(session.frame.client.buy(1n), /Cancelled/);
    for (const quantity of [0n, -1n, 100n, '1', 1]) await assert.rejects(session.frame.client.buy(quantity), /Unsupported/);
    assert.equal((await session.preview.client.read()).rfBalance, 20n * RF);
  } finally { session.close(); }
});
test('closing a session while confirmation waits prevents a later approval from spending', async () => {
  let approve, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const session = setup(() => { entered(); return new Promise(resolve => { approve = resolve; }); });
  try {
    const purchase = session.frame.client.buy(1n);
    const rejected = assert.rejects(purchase, /session changed/);
    await ready; session.host.close(); approve();
    await rejected;
    assert.equal((await session.preview.client.read()).consumables, 0n);
  } finally { session.close(); }
});
test('host menus pause new spending and a pending confirmation cannot be flooded', async () => {
  let approve, entered;
  const ready = new Promise(resolve => { entered = resolve; });
  const session = setup(() => { entered(); return new Promise(resolve => { approve = resolve; }); });
  try {
    session.host.setPaused(true);
    await assert.rejects(session.frame.client.buy(1n), /Close the host menu/);
    session.host.setPaused(false);
    const purchase = session.frame.client.buy(1n);
    await ready;
    await assert.rejects(session.frame.client.buy(1n), /pending/);
    session.host.setPaused(true); approve(); await purchase;
    assert.equal((await session.preview.client.read()).consumables, 1n);
  } finally { session.close(); }
});
test('arbitrary transactions and caller-selected Friend IDs are not bridge methods', async () => {
  const session = setup();
  try {
    for (const [id, method, args] of [[1, 'eth_sendTransaction', [{}]], [2, 'buy', [1n, 999n]], [3, 'selectFriend', [999n]]]) {
      const response = new Promise(resolve => session.port2.addEventListener('message', event => resolve(event.data), { once: true }));
      session.port2.postMessage({ type: 'friendsdk:request', id, method, args });
      assert.match((await response).error, /Unsupported/);
    }
    assert.equal((await session.preview.client.read()).friendId, 5n);
  } finally { session.close(); }
});
