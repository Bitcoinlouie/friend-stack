"use client";

import { useEffect, useRef, useState } from "react";
import { createGamePreview, parseChanceGame, RF, type GamePlay, type GameSnapshot, type PreviewGameClient } from "../../src/game.js";
import { createFriendSoundKit, type FriendSoundCue, type FriendSoundKit } from "../../src/friend-sounds.js";
import { formatGameAmount, ItemArt } from "../../src/experience-ui.js";
import { GameMenu } from "../../src/game-frame.js";
import { RewardReveal } from "../../src/reward-reveal.js";
import type { GameItem } from "../../src/items.js";
import definition from "./game.json" with { type: "json" };
import art from "./art.json" with { type: "json" };
import { FishingWorld } from "./world.js";
import "../../assets/experience-ui.css";
import "../../assets/reward-reveal.css";
import "../../assets/game-frame.css";
import "./style.css";

export { FishingPreview } from "./preview.js";

export const fishingGame = parseChanceGame(definition);
export const fishingItems: readonly GameItem[] = fishingGame.outcomes.map((outcome, index) => ({
  id: art[index].id, name: outcome.name, rarity: art[index].rarity, art: { rows: art[index].rows },
}));
const rf = (amount: bigint) => `${formatGameAmount(amount, 18)} RF`;
type Screen = "shop" | "lake" | "reveal" | "collection" | "vendor" | "odds" | "settings";
export type FishingGameProps = { friendId: bigint | null; client?: PreviewGameClient; onSnapshot?: (snapshot: GameSnapshot) => void; paused?: boolean };

/** Developer viewport only. The host supplies the shared frame and selected Friend. */
export function FishingGame({ friendId, client, onSnapshot, paused = false }: FishingGameProps) {
  const sessions = useRef(new Map<bigint, PreviewGameClient>());
  if (friendId === null) return <div className="fv1 fv1-empty">Choose a Friend to enter the lake.</div>;
  let active = client ?? sessions.current.get(friendId);
  if (!active) {
    active = createGamePreview(fishingGame, { stake: 100n * RF, rfBalance: 20n * RF, friendId }).client;
    sessions.current.set(friendId, active);
  }
  return <FishingSession key={friendId.toString()} friendId={friendId} client={active} onSnapshot={onSnapshot} paused={paused} />;
}

function FishingSession({ friendId, client, onSnapshot, paused }: Required<Pick<FishingGameProps, "friendId" | "paused">> & { client: PreviewGameClient; onSnapshot?: FishingGameProps["onSnapshot"] }) {
  const [snapshot, setSnapshot] = useState<GameSnapshot | null>(null);
  const [screen, setScreen] = useState<Screen>("shop");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<GamePlay | null>(null);
  const [casting, setCasting] = useState(false);
  const [bite, setBite] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [muted, setMuted] = useState(true);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [worldRevision, setWorldRevision] = useState(0);
  const locked = useRef(false);
  const alive = useRef(true);
  const sound = useRef<FriendSoundKit | null>(null);

  useEffect(() => {
    alive.current = true;
    sound.current = createFriendSoundKit({ muted: true });
    void client.read().then(value => { if (alive.current) setSnapshot(value); }).catch(cause => { if (alive.current) setError(cause instanceof Error ? cause.message : "The game could not load."); });
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update(); query.addEventListener("change", update);
    return () => { alive.current = false; sound.current?.dispose(); sound.current = null; query.removeEventListener("change", update); };
  }, [client]);
  useEffect(() => { if (snapshot) onSnapshot?.(snapshot); }, [snapshot, onSnapshot]);
  useEffect(() => {
    if (!casting || !result) return;
    const timer = setTimeout(() => { setBite(true); sound.current?.play("action-ready"); }, reduceMotion ? 0 : 800);
    return () => clearTimeout(timer);
  }, [casting, result, reduceMotion]);

  async function action(work: () => Promise<void>, cue?: FriendSoundCue) {
    if (locked.current || paused) return;
    locked.current = true; setBusy(true); setError(""); setMessage("");
    void sound.current?.unlock();
    try { await work(); const value = await client.read(); if (alive.current) { setSnapshot(value); if (cue) sound.current?.play(cue); } }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Preview action failed."); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  if (!snapshot) return <div className="fv1 fv1-empty" role={error ? "alert" : "status"}>{error || "Loading fishing preview…"}</div>;
  if (snapshot.friendId !== friendId) return <div className="fv1 fv1-empty" role="alert">The selected Friend does not match this game session.</div>;

  const items = fishingItems;
  const count = /^[1-9]\d?$/.test(quantity) ? BigInt(quantity) : 0n;
  const cost = count * fishingGame.price;
  const hasBacking = snapshot.freeStake >= 10n * RF && snapshot.freeStake + cost >= count * 10n * RF;
  const canBuy = count > 0n && hasBacking && snapshot.rfBalance >= cost;
  const caughtId = result?.outcomeId ?? null;
  const caughtItem = caughtId ? items[caughtId - 1] : null;
  const caughtValue = caughtId ? fishingGame.outcomes[caughtId - 1].reward : 0n;
  const totalValue = snapshot.inventory.reduce((sum, amount, index) => sum + amount * fishingGame.outcomes[index].reward, 0n);
  const bestIndex = snapshot.plays.reduce((best, play) => play.outcomeId !== null && play.outcomeId - 1 > best ? play.outcomeId - 1 : best, -1);
  const navigate = (next: Screen) => { if (!casting && !busy && !paused) { setScreen(next); setError(""); setMessage(""); } };
  const sell = (outcomeId: number, amount: bigint) => action(async () => {
    await client.redeem(outcomeId, amount); setMessage(`Sold ${amount} ${items[outcomeId - 1].name}. Simulated RF added to this Friend.`);
  }, "reward");
  const cast = () => action(async () => {
    const [play] = await client.play(1n);
    // Store the result before any bite/reel/reveal animation runs.
    const settled = await client.settle(play.id);
    if (alive.current) { setResult(settled); setBite(false); setCasting(true); setRevealed(false); }
  }, "action-start");
  const panelTitle = screen === "shop" ? "Bait shop" : screen === "reveal" ? "Your catch" : screen[0].toUpperCase() + screen.slice(1);

  return <section className="fv1" aria-label="Fishing game" aria-busy={busy}>
    <FishingWorld key={worldRevision} friendId={snapshot.friendId} paused={paused || casting || screen !== "lake"} />
    <div className="fv1-game-ui" inert={screen !== "lake" || paused || undefined}>
      <div className="fv1-hud"><span><strong data-testid="bait">{snapshot.consumables.toString()}</strong> bait</span><span><strong data-testid="balance">{rf(snapshot.rfBalance)}</strong><small>simulated RF</small></span></div>
      <div className="fv1-lake-action">{casting ? <><p role="status">{bite ? "A bite!" : "Waiting for a bite…"}</p><button className="fv1-primary" type="button" disabled={!result || busy || paused} onClick={() => { setCasting(false); setScreen("reveal"); sound.current?.play("impact"); }}>{bite ? "Reel in" : "Skip wait and reel in"}</button></>
        : <button className="fv1-primary" type="button" disabled={busy || paused || snapshot.consumables === 0n} onClick={() => void cast()}>Cast · 1 bait</button>}</div>
      <nav className="fv1-nav" aria-label="Fishing menus">{(["shop", "collection", "vendor", "odds", "settings"] as const).map(tab => <button key={tab} type="button" disabled={busy || casting || paused} onClick={() => navigate(tab)}>{tab === "shop" ? "Bait shop" : tab[0].toUpperCase() + tab.slice(1)}</button>)}</nav>
      {screen === "lake" && (error || message) && <p className="fv1-feedback" role={error ? "alert" : "status"}>{error || message}</p>}
    </div>
    {screen !== "lake" && <GameMenu title={panelTitle} onClose={busy || screen === "reveal" ? undefined : () => navigate("lake")}>
      <div className="fv1-panel">
        {screen === "shop" && <>
          <p>One bait costs 1 RF. Each bait gives one cast.</p>
          <label className="fv1-quantity">Quantity <input inputMode="numeric" type="number" min="1" max="99" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
          <p>Total: {rf(cost)} · {rf(snapshot.rfBalance)} available</p>
          <button className="fv1-primary" type="button" disabled={busy || paused || !canBuy} onClick={() => void action(async () => { await client.buy(count); setMessage(`Bought ${count} bait with simulated RF.`); }, "purchase")}>Buy bait</button>
          {!hasBacking && <p role="status">Bait sales paused: not enough free stake. Purchased bait remains playable.</p>}
          {snapshot.rfBalance < cost && <p>Not enough simulated RF.</p>}
          <div className="fv1-actions"><button type="button" onClick={() => navigate("lake")} disabled={busy}>Go to lake</button><button type="button" onClick={() => navigate("odds")} disabled={busy}>View odds</button></div>
        </>}
        {screen === "reveal" && caughtItem && result && <>
          <div className="fv1-reveal"><RewardReveal item={caughtItem} revealKey={result.id.toString()} reducedMotion={reduceMotion} skipLabel="Skip reveal" onComplete={() => { setRevealed(true); sound.current?.play(caughtValue >= 5n * RF ? "reveal-legendary" : caughtValue >= RF ? "reveal-rare" : "reveal-common"); }} /></div>
          {revealed && <><h3>{caughtItem.name}</h3><p>{caughtItem.rarity} · {fishingGame.outcomes[caughtId! - 1].chanceBps / 100}% chance · {rf(caughtValue)}</p><p>{caughtValue ? "Sell now or keep it. The price never expires." : "A collectible boot with no RF sale value."}</p></>}
          <button type="button" disabled={!revealed || busy || paused} onClick={() => { setScreen("collection"); setMessage(`Kept ${caughtItem.name}.`); }}>Keep catch</button>
          {caughtValue > 0n && <button className="fv1-primary" type="button" disabled={!revealed || busy || paused} onClick={() => void action(async () => { await client.redeem(caughtId!, 1n); setScreen("lake"); setMessage(`Sold ${caughtItem.name} for ${rf(caughtValue)} in preview.`); }, "reward")}>Sell catch · {rf(caughtValue)}</button>}
        </>}
        {screen === "collection" && <>
          <p>Best catch: {bestIndex < 0 ? "None yet" : items[bestIndex].name}</p>
          <ul className="fv1-collection">{items.map((item, index) => <li key={item.id} data-owned={snapshot.inventory[index] > 0n}><ItemArt item={item} /><span>{item.name}<small>{snapshot.inventory[index].toString()} owned · {rf(fishingGame.outcomes[index].reward)}</small></span></li>)}</ul>
          <button type="button" onClick={() => navigate("vendor")}>Visit vendor</button>
        </>}
        {screen === "vendor" && <>
          <p>Fixed prices, no expiry. Sales credit this Friend’s simulated wallet.</p>
          <ul className="fv1-sales">{items.map((item, index) => snapshot.inventory[index] > 0n && <li key={item.id}><span>{item.name} × {snapshot.inventory[index].toString()}<small>{rf(fishingGame.outcomes[index].reward)} each</small></span>{fishingGame.outcomes[index].reward > 0n ? <button type="button" disabled={busy || paused} onClick={() => void sell(index + 1, 1n)}>Sell one {item.name}</button> : <small>Collectible only</small>}</li>)}</ul>
          {snapshot.inventory.every(amount => amount === 0n) && <p>No catches yet.</p>}
          <button className="fv1-primary" type="button" disabled={busy || paused || totalValue === 0n} onClick={() => void action(async () => { for (let index = 0; index < items.length; index++) if (snapshot.inventory[index] > 0n && fishingGame.outcomes[index].reward > 0n) await client.redeem(index + 1, snapshot.inventory[index]); setMessage("Sold all fish. Boots stay in your collection."); }, "reward")}>Sell all fish · {rf(totalValue)}</button>
        </>}
        {screen === "odds" && <>
          <p>1 RF per bait · Expected return 0.90 RF · 10% vendor edge</p>
          <table><thead><tr><th>Catch</th><th>Chance</th><th>Value</th></tr></thead><tbody>{fishingGame.outcomes.map(outcome => <tr key={outcome.name}><th scope="row">{outcome.name}</th><td>{outcome.chanceBps / 100}%</td><td>{rf(outcome.reward)}</td></tr>)}</tbody></table>
          <p>Every bait reserves 10 RF. Kept fish remain backed until sold.</p><p>Free stake: <span data-testid="free-stake">{rf(snapshot.freeStake)}</span></p>
        </>}
        {screen === "settings" && <>
          <p>Local preview. Simulated RF and outcomes; no live transactions. Progress resets on reload.</p>
          <button type="button" aria-pressed={!muted} onClick={() => { const next = !muted; setMuted(next); sound.current?.setMuted(next); if (!next) void sound.current?.unlock(); }}>{muted ? "Sound off" : "Sound on"}</button>
          <label className="fv1-motion"><input type="checkbox" checked={reduceMotion} onChange={event => setReduceMotion(event.target.checked)} /> Reduce motion</label>
          <button type="button" onClick={() => setWorldRevision(value => value + 1)}>Reset walking position</button>
          <p>Click or tap the world to walk. Use arrows or WASD while the scene is focused.</p>
        </>}
        {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
      </div>
    </GameMenu>}
  </section>;
}
