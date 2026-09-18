import type { ChanceGameDefinition, GameSnapshot, PreviewGameClient } from './game.js';

export type GameMethod = 'read' | 'canBuy' | 'buy' | 'play' | 'settle' | 'redeem';
export type GameArguments = readonly (bigint | number)[];
const UINT256_MAX = (1n << 256n) - 1n;
const quantity = (value: unknown) => typeof value === 'bigint' && value > 0n && value <= 99n;
function valid(method: unknown, args: unknown, outcomes: number): args is (bigint | number)[] {
  if (!Array.isArray(args)) return false;
  switch (method) {
    case 'read': return args.length === 0;
    case 'canBuy': case 'buy': case 'play': return args.length === 1 && quantity(args[0]);
    case 'settle': return args.length === 1 && typeof args[0] === 'bigint' && args[0] > 0n && args[0] <= UINT256_MAX;
    case 'redeem': return args.length === 2 && Number.isInteger(args[0]) && args[0] >= 1 && args[0] <= outcomes && quantity(args[1]);
    default: return false;
  }
}

/** Trusted host only. Transfer the other port to the exact sandboxed iframe window. */
export function bindGameFrame(port: MessagePort, options: {
  client: PreviewGameClient;
  authorize: (method: GameMethod, args: GameArguments) => Promise<void>;
  onSnapshot?: (snapshot: GameSnapshot) => void;
}) {
  let alive = true, busy = false, lastId = 0, paused = false;
  const send = (message: unknown) => { if (alive) port.postMessage(message); };
  port.onmessage = async ({ data }: MessageEvent<unknown>) => {
    if (!alive || !data || typeof data !== 'object') return;
    const request = data as { type?: unknown; id?: unknown; method?: unknown; args?: unknown };
    if (request.type !== 'friendsdk:request' || !Number.isSafeInteger(request.id) || Number(request.id) <= lastId) return;
    const id = Number(request.id); lastId = id;
    if (!valid(request.method, request.args, options.client.definition.outcomes.length)) {
      send({ type: 'friendsdk:response', id, error: 'Unsupported game action.' }); return;
    }
    if (busy) { send({ type: 'friendsdk:response', id, error: 'Another game action is pending.' }); return; }
    const method = request.method as GameMethod, args = request.args;
    if (paused && ['buy', 'play', 'redeem'].includes(method)) {
      send({ type: 'friendsdk:response', id, error: 'Close the host menu before playing.' }); return;
    }
    busy = true;
    try {
      if (['buy', 'play', 'redeem'].includes(method)) await options.authorize(method, args);
      // Authorization may have waited on a menu while selection/account changed.
      if (!alive) return;
      let value: unknown;
      switch (method) {
        case 'read': value = await options.client.read(); break;
        case 'canBuy': value = await options.client.canBuy(args[0] as bigint); break;
        case 'buy': value = await options.client.buy(args[0] as bigint); break;
        case 'play': value = await options.client.play(args[0] as bigint); break;
        case 'settle': value = await options.client.settle(args[0] as bigint); break;
        case 'redeem': value = await options.client.redeem(args[0] as number, args[1] as bigint); break;
      }
      if (!alive) return;
      if (method !== 'canBuy') options.onSnapshot?.(method === 'read' ? value as GameSnapshot : await options.client.read());
      send({ type: 'friendsdk:response', id, value });
    } catch (error) {
      send({ type: 'friendsdk:response', id, error: error instanceof Error ? error.message : 'Game action failed.' });
    } finally { busy = false; }
  };
  port.start();
  return {
    setPaused(value: boolean) { paused = value; send({ type: 'friendsdk:paused', paused }); },
    close() { if (!alive) return; port.postMessage({ type: 'friendsdk:closed' }); alive = false; port.onmessage = null; port.close(); },
  };
}

/** Game-side client. No signer, account selection, deployment, or arbitrary RPC. */
export function createFrameGameClient(port: MessagePort, definition: ChanceGameDefinition, onPause?: (paused: boolean) => void) {
  let nextId = 0, alive = true;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const close = () => {
    alive = false;
    for (const request of pending.values()) request.reject(new Error('Game session changed.'));
    pending.clear(); port.onmessage = null; port.close();
  };
  port.onmessage = ({ data }) => {
    if (!data || typeof data !== 'object') return;
    if (data.type === 'friendsdk:closed') { close(); return; }
    if (data.type === 'friendsdk:paused' && typeof data.paused === 'boolean') { onPause?.(data.paused); return; }
    if (data.type !== 'friendsdk:response') return;
    const request = pending.get(data.id);
    if (!request) return;
    pending.delete(data.id);
    if (typeof data.error === 'string') request.reject(new Error(data.error)); else request.resolve(data.value);
  };
  port.start();
  function call<T>(method: GameMethod, args: GameArguments): Promise<T> {
    if (!alive) return Promise.reject(new Error('Game session changed.'));
    if (pending.size >= 8) return Promise.reject(new Error('Too many pending game actions.'));
    const id = ++nextId;
    return new Promise<T>((resolve, reject) => {
      pending.set(id, { resolve: value => resolve(value as T), reject });
      port.postMessage({ type: 'friendsdk:request', id, method, args });
    });
  }
  const client = Object.freeze<PreviewGameClient>({ mode: 'preview', definition,
    read: () => call('read', []), canBuy: quantity => call('canBuy', [quantity]),
    buy: quantity => call('buy', [quantity]), play: (quantity = 1n) => call('play', [quantity]),
    settle: playId => call('settle', [playId]), redeem: (outcomeId, quantity) => call('redeem', [outcomeId, quantity]),
  });
  return { client, close };
}
