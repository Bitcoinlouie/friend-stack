"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { GameComponentProps } from "@rarefriends/friendsdk/runtime";
import { GameMenu } from "@rarefriends/friendsdk/frame";
import { formatGameAmount } from "@rarefriends/friendsdk/ui";
import { RewardReveal } from "@rarefriends/friendsdk/reveal";
import { expectedReward, maximumPrize, type GamePlay, type GameSnapshot } from "@rarefriends/friendsdk/game";
import { createFriendReader, type GenerationSprites } from "@rarefriends/friendsdk/sprites";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "@rarefriends/friendsdk/sounds";
import { CRATE_MIN_HEIGHT, LIVES, MAX_REVIVES, StackEngine, type EngineEvent } from "./engine";
import { StackRenderer, type Look } from "./render";
import { FREE_RULES, dailyRules, dailySeed, seeded, utcDay, type Mode, type Rules } from "./daily";
import { createThud, type Thud } from "./thud";
import { LAND, MATERIALS, nextPromotion, readGeneration, type Generation } from "./land";
import { CLASSIC_COAT, COATS, CROWN_ART, CROWN_INDEX, GOLD, PRISM_COATS, SET_INDEXES, friendPieces, idleRows, type Coat, type Rows } from "./pieces";
import "@rarefriends/friendsdk/frame.css";
import "@rarefriends/friendsdk/reveal.css";
import "./style.css";

type Menu = "intro" | "crates" | "wardrobe" | "settings" | "reveal" | "over" | null;
type Worn = number | "prism" | null;
type Hud = Readonly<{ height: string; best: string; lives: number; hover: "friend" | "crate" | null; crateInPlay: boolean; canQueue: boolean; revives: number }>;
type RunStats = Readonly<{ height: number; pure: number; drops: number; lost: number; revives: number; card: string | null; record: boolean }>;
type Spend = Readonly<{ spent: bigint; opened: bigint; coats: bigint }>;
const EMPTY_SPEND: Spend = { spent: 0n, opened: 0n, coats: 0n };
const EMPTY_HUD: Hud = { height: "0.0", best: "0.0", lives: LIVES, hover: null, crateInPlay: false, canQueue: false, revives: 0 };
const RARITY = ["common", "uncommon", "rare", "legendary"] as const;
const MOVE_KEYS = new Set(["arrowleft", "arrowright", "a", "d"]);
const rf = (value: bigint) => `${formatGameAmount(value, 18)} RF`;
/** The SDK preview wallet is fixed at 20 RF, so preview prices run at 1:1000 of the planned mainnet prices. */
const MAINNET_SCALE = 1000n;
const mainnet = (value: bigint) => rf(value * MAINNET_SCALE);
const signedMainnet = (value: bigint) => `${value < 0n ? "−" : "+"}${mainnet(value < 0n ? -value : value)}`;
const messageOf = (cause: unknown, fallback: string) => cause instanceof Error && cause.message ? cause.message : fallback;
const crateWord = (count: number | bigint) => `${count.toString()} ${count === 1 || count === 1n ? "crate" : "crates"}`;
const setOwned = (value: GameSnapshot | null) => SET_INDEXES.filter(index => (value?.inventory[index] ?? 0n) > 0n).length;

function PixelArt({ rows, coat, prism = false }: { rows: Rows; coat: Coat; prism?: boolean }) {
  const width = Math.max(...rows.map(row => row.length)), cells = rows.flatMap((row, y) => [...row].flatMap((pixel, x) => pixel === "#" ? [{ x, y }] : []));
  const fill = (x: number, y: number) => prism ? PRISM_COATS[Math.floor(y / 4) % PRISM_COATS.length].fill : coat.stripe && y % 2 ? coat.stripe : coat.fill;
  return <svg className="stack-art" viewBox={`-1 -1 ${width + 2} ${rows.length + 2}`} shapeRendering="crispEdges" aria-hidden="true">
    {cells.map(({ x, y }) => <rect key={`h${x}-${y}`} x={x - 0.25} y={y - 0.25} width={1.5} height={1.5} fill={prism ? "#111111" : coat.halo} />)}
    {cells.map(({ x, y }) => <rect key={`f${x}-${y}`} x={x} y={y} width={1} height={1} fill={fill(x, y)} />)}
  </svg>;
}

/** Only the game. The SDK runtime supplies wallet connection, the verified Friend and the simulated action client. */
export default function FriendStack({ friendId, client, paused }: GameComponentProps) {
  const definition = client.definition;
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [sprites, setSprites] = useState<GenerationSprites | null>(null);
  const [loadError, setLoadError] = useState(""), [revision, setRevision] = useState(0);
  const [menu, setMenu] = useState<Menu>(null), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [toast, setToast] = useState("");
  const [muted, setMuted] = useState(true), [reducedMotion, setReducedMotion] = useState(false);
  const [worn, setWorn] = useState<Worn>(null), [crownShown, setCrownShown] = useState(true);
  const [hud, setHud] = useState<Hud>(EMPTY_HUD), [reveals, setReveals] = useState<readonly GamePlay[]>([]);
  const [completedSet, setCompletedSet] = useState(false), [revived, setRevived] = useState(false);
  const [started, setStarted] = useState(false), [rules, setRules] = useState<Rules>(FREE_RULES);
  const [stats, setStats] = useState<RunStats | null>(null), [spend, setSpend] = useState<Spend>(EMPTY_SPEND);
  const [day] = useState(utcDay);
  const [generation, setGeneration] = useState<Generation | null>(null);
  const nudged = useRef(false);
  const canvas = useRef<HTMLCanvasElement>(null), stage = useRef<HTMLDivElement>(null);
  const engine = useRef<StackEngine | null>(null), renderer = useRef<StackRenderer | null>(null);
  const sound = useRef<FriendSoundKit | null>(null), thud = useRef<Thud | null>(null);
  const keys = useRef(new Set<string>()), epoch = useRef(0), locked = useRef(false);
  const bests = useRef<Record<Mode, { best: number; pure: number }>>({ free: { best: 0, pure: 0 }, daily: { best: 0, pure: 0 } });
  const gesture = useRef<{ id: number; x: number; y: number; time: number; pieceX: number; dragging: boolean } | null>(null);

  const owned = (index: number) => snapshot?.inventory[index] ?? 0n;
  const setCount = setOwned(snapshot), setComplete = setCount === SET_INDEXES.length;
  const prism = worn === "prism" && setComplete;
  const wornCoat = typeof worn === "number" && owned(worn) > 0n ? COATS[worn] ?? CLASSIC_COAT : CLASSIC_COAT;
  const look: Look = { coat: wornCoat, prism, crown: crownShown && owned(CROWN_INDEX) > 0n, reducedMotion, material: MATERIALS[generation ?? 6], generation };
  const land = LAND[generation ?? 6];
  const freeRules: Rules = { ...FREE_RULES, platformHalfWidth: land };
  const live = useRef({ paused, menu, busy, look, onEvents: (_events: EngineEvent[]) => {} });
  live.current = { ...live.current, paused, menu, busy, look };
  const today = dailyRules(day);

  useEffect(() => {
    sound.current = createFriendSoundKit({ muted: true }); thud.current = createThud();
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(preference.matches); change(); preference.addEventListener("change", change);
    return () => {
      sound.current?.dispose(); sound.current = null; thud.current?.dispose(); thud.current = null;
      preference.removeEventListener("change", change);
    };
  }, []);

  useEffect(() => {
    const version = ++epoch.current;
    engine.current = null; locked.current = false;
    setSnapshot(null); setSprites(null); setLoadError(""); setMenu(null); setReveals([]); setError(""); setToast(""); setBusy(false);
    setWorn(null); setHud(EMPTY_HUD); setStarted(false); setStats(null); setRules(FREE_RULES); setSpend(EMPTY_SPEND); setGeneration(null);
    bests.current = { free: { best: 0, pure: 0 }, daily: { best: 0, pure: 0 } };
    // A failed generation read falls back to Gen 6 land; it never blocks play.
    void Promise.all([createFriendReader().read(friendId), client.read(), readGeneration(friendId).catch(() => null)]).then(([art, value, gen]) => {
      if (version !== epoch.current) return;
      if (value.friendId !== friendId) throw new Error("This game session does not match the selected Friend.");
      engine.current = new StackEngine(friendPieces(art));
      setSprites(art); setSnapshot(value); setGeneration(gen); setMenu("intro");
    }).catch(cause => {
      if (version === epoch.current) setLoadError(messageOf(cause, "Your Friend's poses could not load. Check your connection and retry."));
    });
    return () => { epoch.current++; };
  }, [client, friendId, revision]);

  const play = (cue: FriendSoundCue) => sound.current?.play(cue);
  const say = (text: string) => setToast(text);

  async function refresh() {
    const version = epoch.current, value = await client.read();
    if (version === epoch.current) setSnapshot(value);
    return value;
  }

  const recordBought = (quantity: bigint) => setSpend(value => ({ ...value, spent: value.spent + quantity * definition.price }));
  const recordOpened = (settled: readonly GamePlay[]) => setSpend(value => ({ ...value, opened: value.opened + BigInt(settled.length),
    coats: settled.reduce((total, entry) => total + (entry.outcomeId ? definition.outcomes[entry.outcomeId - 1].reward : 0n), value.coats) }));

  async function act(work: () => Promise<void>, cue?: FriendSoundCue) {
    if (locked.current || paused) return false;
    const version = epoch.current;
    locked.current = true; setBusy(true); setError(""); void sound.current?.unlock();
    try { await work(); await refresh(); if (version === epoch.current && cue) play(cue); return true; }
    catch (cause) { if (version === epoch.current) setError(messageOf(cause, "The preview action failed.")); return false; }
    finally { if (version === epoch.current) { locked.current = false; setBusy(false); } }
  }

  function startRun(mode: Mode) {
    const game = engine.current;
    if (!game) return;
    const next = mode === "daily" ? dailyRules(day) : freeRules;
    nudged.current = false;
    game.best = bests.current[mode].best;
    game.reset(next, mode === "daily" ? seeded(dailySeed(day)) : Math.random);
    renderer.current?.clearEffects();
    setRules(next); setMenu(null); setStarted(false); setStats(null); setError(""); setToast(next.mode === "daily" ? `${next.modifier}: ${next.blurb}` : "");
    void sound.current?.unlock();
  }

  function showReveal(settled: readonly GamePlay[], before: GameSnapshot | null, after: GameSnapshot) {
    setCompletedSet(setOwned(before) < SET_INDEXES.length && setOwned(after) === SET_INDEXES.length);
    setReveals(settled); setMenu("reveal");
  }

  /** The crate is consumed only here, after it has survived on the tower. */
  async function openCrate() {
    if (locked.current) return;
    const version = epoch.current;
    locked.current = true; setBusy(true); live.current.busy = true; play("anticipation");
    try {
      const current = await client.read();
      const pending = current.plays.find(entry => entry.outcomeId === null);
      const playEntry = pending ?? (await client.play(1n))[0];
      const settled = await client.settle(playEntry.id);
      if (version !== epoch.current) return;
      recordOpened([settled]);
      const at = engine.current?.removeCrate();
      if (at) renderer.current?.burst(at.x, at.y, (settled.outcomeId ?? 1) - 1 === CROWN_INDEX ? [GOLD, "#111111", "#ffffff"] : ["#ccff00", "#111111", "#ffffff"], 40);
      setRevived(false); showReveal([settled], current, await refresh());
    } catch (cause) {
      if (version !== epoch.current) return;
      engine.current?.removeCrate();
      say(`The crate stayed shut and is still in your pack. ${messageOf(cause, "")}`.trim());
      await refresh().catch(() => {});
    } finally {
      if (version === epoch.current) { locked.current = false; setBusy(false); }
    }
  }

  /** Paid continue: opens crates through the SDK's real buy, play and settle actions, then glues the tower. */
  async function revive() {
    const game = engine.current;
    if (!game?.canRevive || locked.current || paused) return;
    const cost = game.reviveCost, version = epoch.current;
    locked.current = true; setBusy(true); setError(""); void sound.current?.unlock();
    try {
      const current = await client.read();
      const pending = current.plays.filter(entry => entry.outcomeId === null);
      const have = Number(current.consumables) + pending.length;
      if (have < cost) { await client.buy(BigInt(cost - have)); recordBought(BigInt(cost - have)); }
      const plays = pending.slice(0, cost);
      if (plays.length < cost) plays.push(...await client.play(BigInt(cost - plays.length)));
      const settled: GamePlay[] = [];
      for (const entry of plays) settled.push(await client.settle(entry.id));
      if (version !== epoch.current) return;
      recordOpened(settled);
      game.revive();
      renderer.current?.burst(0, Math.max(1, game.height), ["#ccff00", "#f2c230", "#ffffff"], 50);
      play("reward"); setRevived(true); setStats(null);
      showReveal(settled, current, await refresh());
    } catch (cause) {
      if (version === epoch.current) { setError(messageOf(cause, "The revive did not go through. Any crates you bought are still in your pack.")); await refresh().catch(() => {}); }
    } finally {
      if (version === epoch.current) { locked.current = false; setBusy(false); }
    }
  }

  function gameOver() {
    const game = engine.current, draw = renderer.current;
    if (!game) return;
    const record = bests.current[rules.mode];
    const isRecord = game.runBest > record.best + 0.05;
    record.best = Math.max(record.best, game.runBest); record.pure = Math.max(record.pure, game.pureBest);
    const detail = [`Friend #${friendId}`, generation ? `Gen ${generation}` : null, sprites?.familyName, game.revives ? `revived ×${game.revives}` : "no revives"].filter(Boolean).join(" · ");
    const card = draw?.snapshot(game, live.current.look, {
      title: `FRIEND STACK · ${rules.mode === "daily" ? `${rules.title} · ${rules.modifier}` : "FREE STACK"}`.toUpperCase(),
      height: `${game.runBest.toFixed(1)} m`, detail, footer: "RARE FRIENDS · FRIENDSDK · SIMULATED PREVIEW",
    }) ?? null;
    setStats({ height: game.runBest, pure: game.pureBest, drops: game.drops, lost: game.lost, revives: game.revives, card, record: isRecord });
    play("reveal-common"); setMenu("over");
  }

  live.current.onEvents = events => {
    const game = engine.current;
    for (const event of events) {
      if (event.type === "drop") { play(event.kind === "crate" ? "action-start" : "select"); setStarted(true); }
      else if (event.type === "land") thud.current?.play(event.pixels, game?.height ?? 0);
      else if (event.type === "gain") renderer.current?.popup(`+${event.metres.toFixed(1)} m`, event.x, event.y);
      else if (event.type === "lost") {
        renderer.current?.jolt(); renderer.current?.burst(event.x, event.y, ["#111111", "#888888"], 14); play("impact");
        const promotion = generation ? nextPromotion(generation) : null;
        const hint = !event.forgiven && !nudged.current && promotion && game?.rules.mode === "free"
          ? ` Gen ${promotion.to} land is ${(promotion.extra * 2).toFixed(1)} m wider.` : "";
        if (hint) nudged.current = true;
        say(event.forgiven ? "The glue is still setting. No life lost." : event.lives > 0 ? `A Friend fell off! ${event.lives} ${event.lives === 1 ? "life" : "lives"} left.${hint}` : `Last life gone.${hint}`);
      }
      else if (event.type === "milestone") { play("action-ready"); say(`${event.meters} m reached!`); }
      else if (event.type === "wind") play(event.phase === "warning" ? "anticipation" : "action-start");
      else if (event.type === "crate-stuck") { thud.current?.play(144, game?.height ?? 0); play("action-ready"); }
      else if (event.type === "crate-ready") void openCrate();
      else if (event.type === "crate-returned") say(event.reason === "low"
        ? "The crate missed your tower and landed too low. It's back in your pack."
        : "The crate missed your tower. It's still in your pack, unopened.");
      else if (event.type === "game-over") gameOver();
    }
  };

  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 3200); return () => clearTimeout(timer); }, [toast]);
  useEffect(() => { if (paused || menu) { keys.current.clear(); gesture.current = null; } }, [paused, menu]);

  useEffect(() => {
    const node = canvas.current, frame = stage.current, game = engine.current;
    if (!sprites || !node || !frame || !game) return;
    let draw: StackRenderer;
    try { draw = new StackRenderer(node); }
    catch (cause) { setLoadError(messageOf(cause, "This browser cannot draw the tower.")); return; }
    renderer.current = draw;
    const fit = () => {
      const box = frame.getBoundingClientRect(), actions = frame.querySelector(".stack-actions")?.getBoundingClientRect();
      const controls = frame.querySelector(".stack-controls")?.getBoundingClientRect();
      game.setViewHalfWidth(draw.resize(box.width, box.height));
      if (actions && box.height) draw.nextTop = Math.max(60, (actions.bottom - box.top + 10) * draw.height / box.height);
      draw.controls = controls && box.width && box.height
        ? { left: (controls.left - box.left) * draw.width / box.width, top: (controls.top - box.top) * draw.height / box.height } : null;
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(frame);
    const blocked = () => live.current.paused || live.current.menu !== null || live.current.busy || document.hidden;
    const stop = () => { keys.current.clear(); gesture.current = null; };
    const onKey = (event: KeyboardEvent) => {
      if (blocked() || event.altKey || event.metaKey || event.ctrlKey) return;
      const key = event.key.toLowerCase(), target = event.target as HTMLElement | null;
      const onControl = Boolean(target?.closest("button, input, select, textarea, [role=dialog]"));
      if (MOVE_KEYS.has(key)) { event.preventDefault(); keys.current.add(key); return; }
      if (event.repeat) return;
      if (["arrowup", "w", "x"].includes(key)) { event.preventDefault(); if (game.rotate(1)) play("select"); }
      else if (["z", "q"].includes(key)) { event.preventDefault(); if (game.rotate(-1)) play("select"); }
      else if (["arrowdown", "s"].includes(key) || (key === " " && !onControl)) { event.preventDefault(); game.drop(); }
    };
    const onKeyUp = (event: KeyboardEvent) => { keys.current.delete(event.key.toLowerCase()); };
    let wheel = 0;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      if (blocked()) return;
      wheel += event.deltaY;
      if (Math.abs(wheel) < 60) return;
      if (game.rotate(wheel > 0 ? 1 : -1)) play("select");
      wheel = 0;
    };
    window.addEventListener("keydown", onKey); window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", stop); document.addEventListener("visibilitychange", stop);
    node.addEventListener("wheel", onWheel, { passive: false });
    let raf = 0, previous = 0, lastHud = "";
    const loop = (now: number) => {
      const seconds = previous ? Math.min((now - previous) / 1000, 0.05) : 0; previous = now;
      const halted = blocked();
      if (!halted) {
        const direction = Number(keys.current.has("arrowright") || keys.current.has("d")) - Number(keys.current.has("arrowleft") || keys.current.has("a"));
        if (direction) game.move(direction * 7 * seconds);
        const events = game.step(seconds);
        if (events.length) live.current.onEvents(events);
      }
      draw.draw(game, live.current.look, halted ? 0 : seconds, now);
      const next: Hud = { height: game.height.toFixed(1), best: game.best.toFixed(1), lives: game.lives, hover: game.hover?.kind ?? null,
        crateInPlay: game.crateInPlay, canQueue: game.canQueueCrate, revives: game.revives };
      const serial = JSON.stringify(next);
      if (serial !== lastHud) { lastHud = serial; setHud(next); }
      node.dataset.height = game.height.toFixed(2); node.dataset.pieces = String(game.pieces.length);
      node.dataset.wind = game.wind.phase; node.dataset.mode = game.rules.mode;
      node.dataset.crate = game.crate ? "placed" : game.hover?.kind === "crate" ? "hover" : "none";
      node.dataset.land = String(game.rules.platformHalfWidth);
      node.dataset.camBottom = draw.camBottom.toFixed(2);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf); observer.disconnect(); stop();
      window.removeEventListener("keydown", onKey); window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", stop); document.removeEventListener("visibilitychange", stop);
      node.removeEventListener("wheel", onWheel);
      if (renderer.current === draw) renderer.current = null;
    };
  }, [sprites]);

  const blocked = paused || menu !== null || busy || !engine.current;
  const rotate = () => { if (!blocked && engine.current?.rotate(1)) play("select"); };
  const drop = () => { if (!blocked) engine.current?.drop(); };

  function pointerDown(event: ReactPointerEvent<HTMLCanvasElement>) {
    const game = engine.current;
    if (blocked || !game) return;
    event.currentTarget.focus(); void sound.current?.unlock();
    if (event.pointerType === "mouse") {
      event.preventDefault();
      if (event.button === 2) { if (game.rotate(1)) play("select"); }
      else if (event.button === 0) { game.setX(renderer.current!.worldX(event.clientX, event.currentTarget.getBoundingClientRect())); game.drop(); }
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY, time: performance.now(), pieceX: game.hover?.x ?? 0, dragging: false };
  }
  function pointerMove(event: ReactPointerEvent<HTMLCanvasElement>) {
    const game = engine.current, draw = renderer.current;
    if (blocked || !game || !draw) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (event.pointerType === "mouse") { if (!event.buttons) game.setX(draw.worldX(event.clientX, rect)); return; }
    const touch = gesture.current;
    if (!touch || touch.id !== event.pointerId) return;
    const dx = event.clientX - touch.x;
    if (!touch.dragging && Math.abs(dx) > 8) { touch.dragging = true; touch.x = event.clientX; touch.pieceX = game.hover?.x ?? touch.pieceX; }
    if (touch.dragging) game.setX(touch.pieceX + draw.metres(event.clientX - touch.x, rect));
  }
  function pointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
    const touch = gesture.current, game = engine.current;
    gesture.current = null;
    if (!touch || touch.id !== event.pointerId || blocked || !game) return;
    const dy = event.clientY - touch.y;
    if (touch.dragging) return;
    if (dy > 36) game.drop();
    else if (performance.now() - touch.time < 400 && game.rotate(1)) play("select");
  }

  const navigate = (next: Menu) => { if (!busy && !paused) { setMenu(next); setError(""); } };
  const toggleSound = () => {
    const next = !muted; setMuted(next); sound.current?.setMuted(next); thud.current?.setMuted(next);
    if (!next) void sound.current?.unlock().then(() => sound.current?.play("select"));
  };

  if (loadError && !sprites) return <div className="stack-status" role="alert"><p>{loadError}</p>
    <button type="button" disabled={paused} onClick={() => setRevision(value => value + 1)}>Retry loading</button></div>;
  if (!snapshot || !sprites) return <div className="stack-status" role="status"><p>Loading your Friend's poses…</p></div>;

  const maxPrize = maximumPrize(definition);
  const canBuy = snapshot.rfBalance >= definition.price && snapshot.freeStake >= maxPrize && snapshot.freeStake + definition.price >= maxPrize;
  const pendingCount = snapshot.plays.filter(entry => entry.outcomeId === null).length;
  const crates = snapshot.consumables + BigInt(pendingCount);
  const idle = idleRows(sprites);
  const outcomeIndexes = reveals.flatMap(entry => entry.outcomeId ? [entry.outcomeId - 1] : []);
  const revealIndex = outcomeIndexes.length ? Math.max(...outcomeIndexes) : null;
  const revealOutcome = revealIndex !== null ? definition.outcomes[revealIndex] : null;
  const extras = revealIndex === null ? [] : outcomeIndexes.filter((index, position) => position !== outcomeIndexes.indexOf(revealIndex));
  const engineNow = engine.current;
  const reviveCost = engineNow?.reviveCost ?? 1, canRevive = Boolean(engineNow?.canRevive);
  const reviveBuy = Math.max(0, reviveCost - Number(crates));
  const reviveAffordable = snapshot.rfBalance >= definition.price * BigInt(reviveBuy);
  const feedback = <p className="stack-feedback" role={error ? "alert" : "status"}>{error || (busy ? "Waiting for preview confirmation…" : "Simulated RF and outcomes. Nothing here is a real transaction.")}</p>;
  const artFor = (index: number) => index === CROWN_INDEX ? <PixelArt rows={CROWN_ART} coat={{ name: "crown", fill: GOLD, halo: "#111111" }} /> : <PixelArt rows={idle} coat={COATS[index] ?? CLASSIC_COAT} />;
  const crateBlocker = crates === 0n ? "Buy a crate first."
    : hud.crateInPlay ? "A crate is already on its way up."
    : Number(hud.height) < CRATE_MIN_HEIGHT ? `Build your tower to ${CRATE_MIN_HEIGHT} m first (now ${hud.height} m).`
    : !hud.canQueue ? "Wait for the next piece." : "";
  const modeLabel = rules.mode === "daily" ? `Daily · ${rules.modifier}` : "Free Stack";
  const promotion = generation ? nextPromotion(generation) : null;
  const landNote = <div className="stack-land">
    <p><strong>{generation ? `Gen ${generation} land` : "Land"}:</strong> {(land * 2).toFixed(1)} m {MATERIALS[generation ?? 6].name} platform in Free Stack. {generation === null
      ? "Your Friend's generation could not be read, so this uses Gen 6 land."
      : promotion ? <>Promote to Gen {promotion.to} for a {(LAND[promotion.to] * 2).toFixed(1)} m {MATERIALS[promotion.to].name} platform.</>
      : "Gen 1 has the widest land in Friend Stack."}</p>
    {promotion && <p className="stack-small">Promotion is a Rare Friends protocol action: {promotion.cost.toLocaleString("en-US")} RF on mainnet, with {promotion.burned.toLocaleString("en-US")} RF burned
      and {promotion.rewards.toLocaleString("en-US")} RF funding active NFT rewards. Promote at rarefriends.com. The Daily Tower uses one standard platform for everyone.</p>}
  </div>;
  const collection = <p className="stack-small">Collection {setCount}/{SET_INDEXES.length}: hold a Chalk, Brick and Neon Coat at once to unlock the <strong>Prism Coat</strong>.</p>;
  const title = menu === "intro" ? "Friend Stack" : menu === "crates" ? "Summit Crates" : menu === "wardrobe" ? "Coats" : menu === "reveal" ? (revived ? "Revived!" : "Crate opened")
    : menu === "over" ? "Tower down" : "Friend Stack";

  return <section className="stack-game" aria-label="Friend Stack" aria-busy={busy}>
    <div className="stack-stage" ref={stage} inert={Boolean(menu) || paused || undefined}>
      <canvas ref={canvas} className="stack-canvas" tabIndex={0}
        aria-label="Friend Stack tower. Move the piece with the arrow keys, A and D, the mouse or by dragging. Rotate with up, W, right-click, scroll or a tap. Drop with Space, down, a click or a downward swipe."
        onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={() => { gesture.current = null; }}
        onContextMenu={event => event.preventDefault()} />
      <div className="stack-hud">
        <div className="stack-score">
          <strong><span>Height</span> {hud.height} m</strong>
          <small>Best {hud.best} m · {modeLabel}{hud.revives ? ` · revived ×${hud.revives}` : ""}</small>
        </div>
        <div className="stack-lives" aria-label={`${hud.lives} of ${LIVES} lives`}>{Array.from({ length: LIVES }, (_, index) => <i key={index} data-on={index < hud.lives || undefined} />)}</div>
        <div className="stack-actions">
          <button type="button" aria-pressed={!muted} onClick={toggleSound}>{muted ? "Sound off" : "Sound on"}</button>
          <button type="button" className="stack-crate-button" onClick={() => navigate("crates")}>Crates · {crates.toString()}</button>
          <button type="button" onClick={() => navigate("wardrobe")}>Coats</button>
          <button type="button" onClick={() => navigate("settings")} aria-label="Settings and help">Menu</button>
        </div>
      </div>
      {toast && <p className="stack-toast" role="status">{toast}</p>}
      {hud.hover === "crate" && <p className="stack-toast stack-toast-crate" role="status">Summit Crate! Land it on your tower. It sticks where it hits and opens.</p>}
      {!started && !menu && <p className="stack-hint"><span className="stack-desktop">Mouse or ← → to move · Right-click, scroll or ↑ to rotate · Click or Space to drop</span>
        <span className="stack-touch">Drag to move · Tap to rotate · Swipe down or Drop</span></p>}
      <div className="stack-controls">
        <button type="button" onClick={rotate} disabled={blocked || hud.hover !== "friend"}>Rotate</button>
        <button type="button" className="stack-primary" onClick={drop} disabled={blocked || !hud.hover}>Drop</button>
      </div>
    </div>

    {menu && <GameMenu title={title} onClose={busy || menu === "over" || menu === "intro" ? undefined : () => navigate(null)}>
      {menu === "intro" ? <div className="stack-intro">
        <div className="stack-intro-hero"><PixelArt rows={idle} coat={CLASSIC_COAT} />
          <p>Every piece is one of <strong>Friend #{friendId.toString()}</strong>'s own poses, and its pixels are its physics shape. Stack as high as you can.
            You have {LIVES} lives, and each piece that falls off costs one.
            {generation && <> Your Gen {generation} Friend stacks on {MATERIALS[generation].name.toLowerCase()} land.</>}</p></div>
        <div className="stack-modes">
          <button type="button" className="stack-mode" disabled={paused} onClick={() => startRun("free")}>
            <strong>Free Stack</strong><small>{FREE_RULES.blurb} Your {generation ? `Gen ${generation}` : "Friend's"} land: a {(land * 2).toFixed(1)} m platform.</small></button>
          <button type="button" className="stack-mode stack-primary" disabled={paused} onClick={() => startRun("daily")}>
            <strong>{today.title}</strong><small>{today.modifier}: {today.blurb} Everyone gets the same piece order, gusts and platform today.</small></button>
        </div>
        <p className="stack-small"><span className="stack-desktop">Mouse or ← → to move · right-click, scroll or ↑ to rotate · click or Space to drop.</span>
          <span className="stack-touch">Drag to move · tap to rotate · swipe down or press Drop.</span>
          {" "}Summit Crates and coats use simulated RF.</p>
      </div> : menu === "crates" ? <>
        <p>Buy a crate and carry it up once your tower is {CRATE_MIN_HEIGHT} m tall. It parachutes down, sticks where it hits your tower and opens, revealing a coat for your Friend.
          If it misses, it returns to your pack unopened. When your tower falls, crates can also buy a revive.</p>
        <p><strong>Preview balance {rf(snapshot.rfBalance)}</strong> · {crateWord(crates)} in pack</p>
        <table><thead><tr><th>Coat</th><th>Chance</th><th>Preview</th><th>Mainnet</th></tr></thead><tbody>
          <tr className="stack-price-row"><td>Crate price</td><td /><td>{rf(definition.price)}</td><td>{mainnet(definition.price)}</td></tr>
          {definition.outcomes.map(item => <tr key={item.name}><td>{item.name}</td><td>{item.chanceBps / 100}%</td><td>{rf(item.reward)}</td><td>{mainnet(item.reward)}</td></tr>)}
        </tbody></table>
        <p className="stack-small">Preview prices are 1:1000 of the planned mainnet prices, because the SDK preview wallet holds 20 RF.
          Each crate reserves {rf(maxPrize)} ({mainnet(maxPrize)} on mainnet). The expected value is {rf(expectedReward(definition))} per crate. Kept coats keep their RF value and never expire.</p>
        {collection}
        <div className="stack-row">
          <button type="button" disabled={!canBuy || busy || paused} onClick={() => void act(async () => { await client.buy(1n); recordBought(1n); }, "purchase")}>Buy crate · {rf(definition.price)}</button>
          <button type="button" className="stack-primary" disabled={Boolean(crateBlocker) || busy || paused}
            onClick={() => { if (engine.current?.queueCrate()) { setMenu(null); play("select"); } }}>Carry a crate up</button>
        </div>
        {crateBlocker && crates > 0n && <p className="stack-small">{crateBlocker}</p>}
        <section className="stack-spend" aria-label="Session spend at mainnet scale">
          <h3>Session spend <small>(simulated, at mainnet scale)</small></h3>
          <dl className="stack-stats">
            <div><dt>Spent on crates</dt><dd>{mainnet(spend.spent)}</dd></div>
            <div><dt>Crates opened</dt><dd>{spend.opened.toString()}</dd></div>
            <div><dt>Coat value received</dt><dd>{mainnet(spend.coats)}</dd></div>
            <div><dt>Prize pool result</dt><dd>{signedMainnet(spend.opened * definition.price - spend.coats)}</dd></div>
          </dl>
          <p className="stack-small">Under FriendSDK v0.1.2 the prize pool's result stays with the game's developer, who funds the prizes. Crate spending itself burns nothing.
            Buying RF on the Rare Friends market to play sends a 5% WETH fee to active NFT rewards.</p>
        </section>
        {!canBuy && <p className="stack-small">{snapshot.rfBalance < definition.price ? "Not enough simulated RF." : "New crates are paused until there is enough free backing."}</p>}
        {hud.hover === "crate" && <button type="button" onClick={() => { engine.current?.cancelCrate(); setMenu(null); }}>Put the crate back</button>}
      </> : menu === "wardrobe" ? <>
        <p>Kept crate rewards dress every piece of your Friend. Redeem a coat for its fixed simulated RF value at any time.</p>
        {collection}
        <div className="stack-item"><PixelArt rows={idle} coat={CLASSIC_COAT} /><span><strong>Classic</strong><small>Always owned</small></span>
          <button type="button" aria-pressed={!prism && wornCoat === CLASSIC_COAT} onClick={() => setWorn(null)}>{!prism && wornCoat === CLASSIC_COAT ? "Wearing" : "Wear"}</button></div>
        {definition.outcomes.map((item, index) => <div className="stack-item" key={item.name}>{artFor(index)}
          <span><strong>{item.name}</strong><small>{owned(index).toString()} owned · {rf(item.reward)} each ({mainnet(item.reward)} on mainnet)</small></span>
          {index === CROWN_INDEX
            ? <button type="button" disabled={owned(index) === 0n} aria-pressed={look.crown} onClick={() => setCrownShown(value => !value)}>{look.crown ? "Shown" : "Show"}</button>
            : <button type="button" disabled={owned(index) === 0n} aria-pressed={!prism && worn === index && owned(index) > 0n} onClick={() => setWorn(index)}>{!prism && worn === index && owned(index) > 0n ? "Wearing" : "Wear"}</button>}
          <button type="button" disabled={busy || paused || owned(index) === 0n} onClick={() => void act(() => client.redeem(index + 1, 1n), "reward")}>Redeem</button>
        </div>)}
        <div className="stack-item" data-locked={!setComplete || undefined}><PixelArt rows={idle} coat={CLASSIC_COAT} prism />
          <span><strong>Prism Coat</strong><small>{setComplete ? "Unlocked: every piece wears a different coat" : `Locked · ${setCount}/${SET_INDEXES.length} coats held`} · no RF value</small></span>
          <button type="button" disabled={!setComplete} aria-pressed={prism} onClick={() => setWorn("prism")}>{prism ? "Wearing" : "Wear"}</button>
        </div>
      </> : menu === "reveal" && revealOutcome && revealIndex !== null ? <div className="stack-reveal">
        {revived && <p className="stack-banner">Your tower is glued in place and you have 1 life back. Opened {crateWord(reveals.length)}.</p>}
        <div className="stack-reveal-stage"><RewardReveal revealKey={reveals.map(entry => entry.id.toString()).join("-")} reducedMotion={reducedMotion} showSkipControl={!reducedMotion}
          item={{ id: `coat-${revealIndex}`, name: revealOutcome.name, rarity: RARITY[revealIndex] ?? "common", art: { rows: revealIndex === CROWN_INDEX ? CROWN_ART : idle } }}
          slots={{ itemArt: artFor(revealIndex) }}
          onComplete={() => play(revealIndex === CROWN_INDEX ? "reveal-legendary" : revealIndex >= 2 ? "reveal-rare" : "reveal-common")} /></div>
        <h3>{revealOutcome.name}</h3>
        <p>{rf(revealOutcome.reward)} ({mainnet(revealOutcome.reward)} on mainnet) · {revealOutcome.chanceBps / 100}% chance · simulated</p>
        {extras.length > 0 && <p className="stack-small">Also opened: {extras.map(index => definition.outcomes[index].name).join(", ")}.</p>}
        {completedSet && <p className="stack-banner">Collection complete! The Prism Coat is unlocked while you hold all three coats.</p>}
        <div className="stack-row">
          {completedSet
            ? <button type="button" className="stack-primary" disabled={busy || paused} onClick={() => { setWorn("prism"); setMenu(null); }}>Wear Prism Coat</button>
            : <button type="button" className="stack-primary" disabled={busy || paused} onClick={() => { if (revealIndex === CROWN_INDEX) setCrownShown(true); else setWorn(revealIndex); setMenu(null); }}>
              {revealIndex === CROWN_INDEX ? "Crown my tower" : "Wear it"}</button>}
          <button type="button" disabled={busy || paused} onClick={() => setMenu(null)}>{revived ? "Keep stacking" : "Keep in wardrobe"}</button>
          <button type="button" disabled={busy || paused} onClick={() => void act(() => client.redeem(revealIndex + 1, 1n), "reward").then(done => { if (done) setMenu(null); })}>Redeem · {rf(revealOutcome.reward)}</button>
        </div>
      </div> : menu === "over" && stats ? <div className="stack-over">
        {stats.card && <figure className="stack-card"><img src={stats.card} alt={`Tower card: ${stats.height.toFixed(1)} metres`} />
          <figcaption>Long-press or right-click to save and share.</figcaption></figure>}
        <div className="stack-over-body">
          <p className="stack-big">{stats.height.toFixed(1)} m{stats.record && <span className="stack-record">New best!</span>}</p>
          <dl className="stack-stats">
            <div><dt>Mode</dt><dd>{rules.mode === "daily" ? `${rules.title}, ${rules.modifier}` : "Free Stack"}</dd></div>
            <div><dt>Pure height</dt><dd>{stats.pure.toFixed(1)} m</dd></div>
            <div><dt>Pieces</dt><dd>{stats.drops} dropped · {stats.lost} lost</dd></div>
            <div><dt>Revives</dt><dd>{stats.revives} of {MAX_REVIVES}</dd></div>
            <div><dt>Session best</dt><dd>{bests.current[rules.mode].best.toFixed(1)} m · pure {bests.current[rules.mode].pure.toFixed(1)} m</dd></div>
          </dl>
          {canRevive ? <div className="stack-revive">
            <p><strong>Revive:</strong> open {crateWord(reviveCost)} to glue this tower in place and get 1 life back. You keep every coat inside.
              {reviveBuy > 0 && ` You have ${crateWord(crates)}, so ${crateWord(reviveBuy)} will be bought first (${rf(definition.price * BigInt(reviveBuy))}; ${mainnet(definition.price * BigInt(reviveBuy))} on mainnet).`}</p>
            <button type="button" className="stack-primary" disabled={busy || paused || !reviveAffordable} onClick={() => void revive()}>
              {reviveBuy > 0 ? `Buy ${reviveBuy} & revive · ${rf(definition.price * BigInt(reviveBuy))}` : `Revive · open ${crateWord(reviveCost)}`}</button>
            {!reviveAffordable && <p className="stack-small">Not enough simulated RF for this revive.</p>}
            <p className="stack-small">Each revive costs one more crate than the last ({mainnet(definition.price)}, then {mainnet(definition.price * 2n)}, then {mainnet(definition.price * 3n)} on mainnet). Revived heights are shown apart from pure heights.</p>
          </div> : stats.revives >= MAX_REVIVES && <p className="stack-small">All {MAX_REVIVES} revives used for this tower.</p>}
          <div className="stack-row">
            <button type="button" className={canRevive ? "" : "stack-primary"} disabled={busy || paused} onClick={() => startRun(rules.mode)}>Stack again</button>
            <button type="button" disabled={busy || paused} onClick={() => startRun(rules.mode === "daily" ? "free" : "daily")}>{rules.mode === "daily" ? "Play Free Stack" : "Play today's Daily"}</button>
          </div>
          {landNote}
          <p className="stack-small">Session bests reset when you reload; the SDK sandbox has no saves yet.</p>
        </div>
      </div> : menu === "settings" ? <>
        <div className="stack-row">
          <button type="button" aria-pressed={!muted} onClick={toggleSound}>{muted ? "Sound off" : "Sound on"}</button>
          <label><input type="checkbox" checked={reducedMotion} onChange={event => setReducedMotion(event.target.checked)} /> Reduce motion</label>
        </div>
        <h3>How to play</h3>
        <p>Every piece is one of your Friend's own poses. Its pixels are its physics shape. Stack them as high as you can on the platform.
          You have {LIVES} lives, and you lose one each time a Friend falls off. Above the wind zone, gusts are announced a moment before they blow.</p>
        {landNote}
        <p className="stack-small"><strong>Keyboard:</strong> ← → or A D to move · ↑ W X to rotate (Z Q rotates back) · Space or ↓ to drop.<br />
          <strong>Mouse:</strong> move to aim · right-click or scroll to rotate · click to drop.<br />
          <strong>Touch:</strong> drag to move · tap to rotate · swipe down or press Drop.</p>
        <p className="stack-small">Reduced motion turns off the camera easing, screen shake, particles, landing squash, wind streaks and the hover pulse. All RF, crates and coats are simulated for this preview.
          Wallet connection and ownership checks are handled by FriendSDK.</p>
        <div className="stack-row">
          <button type="button" disabled={paused} onClick={() => startRun(rules.mode)}>Restart tower</button>
          <button type="button" disabled={paused} onClick={() => setMenu("intro")}>Change mode</button>
        </div>
      </> : null}
      {menu !== "intro" && feedback}
    </GameMenu>}
  </section>;
}
