import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createFrameGameClient } from '../../src/frame-bridge.js';
import type { PreviewGameClient } from '../../src/game.js';
import { FishingGame, fishingGame } from './index.js';
import './embedded.css';

function EmbeddedFishing() {
  const [session, setSession] = useState<{ friendId: bigint; client: PreviewGameClient } | null>(null);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    let connection: ReturnType<typeof createFrameGameClient> | undefined;
    function receive(event: MessageEvent) {
      if (event.source !== window.parent || connection || event.data?.type !== 'friendsdk:init' ||
        typeof event.data.friendId !== 'bigint' || event.data.friendId < 0n || event.ports.length !== 1) return;
      connection = createFrameGameClient(event.ports[0], fishingGame, setPaused);
      setSession({ friendId: event.data.friendId, client: connection.client });
    }
    window.addEventListener('message', receive);
    // Parent waits for this message from its exact child window before transferring the port.
    window.parent.postMessage({ type: 'friendsdk:ready' }, '*');
    return () => { window.removeEventListener('message', receive); connection?.close(); };
  }, []);
  return session ? <FishingGame friendId={session.friendId} client={session.client} paused={paused} />
    : <p role="status">Waiting for your Friend…</p>;
}

createRoot(document.getElementById('root')!).render(<EmbeddedFishing />);
