"use client";

import { useEffect, useRef, useState } from "react";
import { loadWorldAssets } from "../../src/assets.js";
import { getWorldPreset, project, unproject } from "../../src/friend-world.js";
import { createWorldMovement } from "../../src/movement.js";
import { createFriendReader, spriteFrame, type GenerationSprites } from "../../src/friend-sprites.js";

const world = getWorldPreset("01-garden-oval-complete");
const view = { x: 260, y: 400, width: 1080, height: 580 };

/** Canonical terrain/props and character pixels; only the camera is game-specific. */
export function FishingWorld({ friendId, paused }: { friendId: bigint; paused: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const movement = useRef<ReturnType<typeof createWorldMovement> | null>(null);
  const [artStatus, setArtStatus] = useState("Loading Friend artwork…");
  const [worldError, setWorldError] = useState("");
  const pause = useRef(paused);
  useEffect(() => { pause.current = paused; if (paused) movement.current?.stop(); }, [paused]);

  useEffect(() => {
    const node = canvas.current, context = node?.getContext("2d");
    if (!node || !context) return;
    const controller = new AbortController();
    const mover = createWorldMovement(world, [120, 212]);
    movement.current = mover;
    let frame = 0, last = 0, sprites: GenerationSprites | undefined;
    let assets: Awaited<ReturnType<typeof loadWorldAssets>> | undefined;
    let side: "left" | "right" = "right";
    const stop = () => mover.stop();
    const hidden = () => { if (document.hidden) stop(); };
    window.addEventListener("blur", stop);
    document.addEventListener("visibilitychange", hidden);
    loadWorldAssets(world, { color: true, signals: false }, controller.signal).then(value => { assets = value; }).catch(() => {
      if (!controller.signal.aborted) setWorldError("World artwork could not load. The game controls still work.");
    });
    createFriendReader().read(friendId).then(value => {
      if (controller.signal.aborted) return;
      sprites = value; setArtStatus(`Friend #${friendId} · ${value.familyName}`);
    }).catch(() => {
      if (!controller.signal.aborted) setArtStatus("Friend artwork unavailable. The circle marks your position.");
    });
    const render = (now: number) => {
      const state = mover.update(!pause.current && !document.hidden && last ? now - last : 0);
      last = now;
      context.clearRect(0, 0, view.width, view.height);
      context.save(); context.translate(-view.x, -view.y); context.imageSmoothingEnabled = false;
      if (assets) context.drawImage(assets.terrain, 0, 0);
      const [x, y] = project(...state.position);
      const character = () => {
        context.fillStyle = "#0003"; context.beginPath(); context.ellipse(x, y + 2, 20, 7, 0, 0, Math.PI * 2); context.fill();
        if (!sprites) {
          context.fillStyle = "#fff"; context.strokeStyle = "#111"; context.lineWidth = 2;
          context.beginPath(); context.arc(x, y - 10, 8, 0, Math.PI * 2); context.fill(); context.stroke(); return;
        }
        if (state.facing === "left" || state.facing === "right") side = state.facing;
        const rows = spriteFrame(sprites, state.facing, state.walking, state.walking ? Math.floor(now / 110) % 8 : 0, side).frame.rows;
        const pixels = rows.flatMap((row, py) => [...row].flatMap((pixel, px) => pixel === "#" ? [[px, py]] : []));
        const scale = 4, left = Math.round(x) - 32, top = Math.round(y) - 64;
        context.save(); context.beginPath(); context.rect(left, top, 16 * scale, 16 * scale); context.clip();
        context.fillStyle = "#fff";
        for (const [px, py] of pixels) context.fillRect(left + px * scale - scale, top + py * scale - scale, scale * 3, scale * 3);
        context.fillStyle = "#000";
        for (const [px, py] of pixels) context.fillRect(left + px * scale, top + py * scale, scale, scale);
        context.restore();
      };
      let drawn = false;
      for (const object of assets?.objects ?? []) {
        if (!drawn && object.depth >= state.position[0] + state.position[1]) { character(); drawn = true; }
        context.drawImage(object.image, 0, 0);
      }
      if (!drawn) character();
      context.restore();
      node.dataset.x = state.position[0].toFixed(2); node.dataset.y = state.position[1].toFixed(2);
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => {
      controller.abort(); cancelAnimationFrame(frame); mover.stop(); movement.current = null;
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", hidden);
    };
  }, [friendId]);

  return <div className="fv1-world">
    <canvas ref={canvas} width={view.width} height={view.height} tabIndex={0} aria-label="Garden lake. Use arrow keys or WASD to walk, or click or tap a destination."
      onKeyDown={event => { if (!paused && movement.current?.setKey(event.key, true)) event.preventDefault(); }}
      onKeyUp={event => { if (movement.current?.setKey(event.key, false)) event.preventDefault(); }}
      onBlur={() => movement.current?.stop()}
      onPointerDown={event => {
        if (paused) return;
        event.currentTarget.focus(); const rect = event.currentTarget.getBoundingClientRect();
        movement.current?.moveTo(unproject(view.x + (event.clientX - rect.left) * view.width / rect.width, view.y + (event.clientY - rect.top) * view.height / rect.height));
      }} />
    <p className="fv1-world-status" role="status">{worldError || artStatus}</p>
  </div>;
}
