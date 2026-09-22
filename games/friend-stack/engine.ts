import { Box, Vec2, World, type Body, type Contact } from "planck";
import { FREE_RULES, type Rules } from "./daily";
import { CRATE_ART, CRATE_BODY, pixelCount, pixelRects, type Rows } from "./pieces";

/** World units are metres; y points up and the platform top is y = 0. */
export const PIXEL = 0.15;
export const PLATFORM_DEPTH = 1.2;
export const CRATE_MIN_HEIGHT = 3;
export const LIVES = 3;
export const MAX_REVIVES = 3;
const KILL_Y = -5, STEP = 1 / 60, DROP_SPEED = 1;
const SPAWN_GAP = 3.8, SPAWN_MIN = 5, CRATE_OPEN_FLOOR = 1.5, REVIVE_GRACE_MS = 2000;
const WIND_WARNING_MS = 1300, WIND_GUST_MS = 2400;
const CRATE_DAMPING = 4, CRATE_FRICTION = 1.6, CRATE_STICK_MS = 450;

export type PieceKind = "friend" | "crate";
export type PieceData = { kind: PieceKind; rows: Rows; serial: number; pixels: number; landed: boolean; landedAt: number; restMs: number; frozen: boolean; hitTower: boolean };
export type Hover = { kind: PieceKind; rows: Rows; x: number; y: number; turns: number };
export type Wind = { phase: "still" | "calm" | "warning" | "gust"; direction: 1 | -1; timer: number; accel: number };
export type EngineEvent =
  | { type: "drop"; kind: PieceKind }
  | { type: "land"; kind: PieceKind; x: number; y: number; pixels: number }
  | { type: "lost"; x: number; y: number; lives: number; forgiven: boolean }
  | { type: "gain"; metres: number; x: number; y: number }
  | { type: "milestone"; meters: number }
  | { type: "wind"; phase: "warning" | "gust"; direction: 1 | -1 }
  | { type: "crate-stuck" }
  | { type: "crate-ready"; x: number; y: number }
  | { type: "crate-returned"; reason: "fell" | "low" }
  | { type: "game-over"; height: number };

export const pieceData = (body: Body) => body.getUserData() as PieceData;

export function bounds(body: Body) {
  let bottom = Infinity, top = -Infinity, left = Infinity, right = -Infinity;
  for (let fixture = body.getFixtureList(); fixture; fixture = fixture.getNext()) {
    const box = fixture.getAABB(0);
    bottom = Math.min(bottom, box.lowerBound.y); top = Math.max(top, box.upperBound.y);
    left = Math.min(left, box.lowerBound.x); right = Math.max(right, box.upperBound.x);
  }
  return { bottom, top, left, right };
}

const still = (body: Body, speed = 0.12) => body.getLinearVelocity().length() < speed && Math.abs(body.getAngularVelocity()) < 0.2;

/** Presentation-only physics. RF actions never depend on this simulation's randomness. */
export class StackEngine {
  rules: Rules = FREE_RULES;
  world = new World(Vec2(0, FREE_RULES.gravity));
  pieces: Body[] = [];
  active: Body | null = null;
  crate: Body | null = null;
  hover: Hover | null = null;
  next: Rows;
  lives = LIVES;
  height = 0;
  /** Best height for the current mode across runs; the caller restores it when switching modes. */
  best = 0;
  runBest = 0;
  /** Best height before the first revive of this run. */
  pureBest = 0;
  drops = 0;
  lost = 0;
  revives = 0;
  over = false;
  halfRange = 7;
  clock = 0;
  wind: Wind = { phase: "still", direction: 1, timer: 0, accel: 0 };
  private random: () => number = Math.random;
  private bag: Rows[] = [];
  private accumulator = 0;
  private activeMs = 0;
  private bestAtDrop = 0;
  private spawnWait = 0;
  private grace = 0;
  private milestone = 0;
  private crateQueued = false;
  private lastX = 0;
  private serial = 0;
  private events: EngineEvent[] = [];

  constructor(private readonly poses: readonly Rows[]) {
    if (!poses.length) throw new Error("This Friend has no drawable poses.");
    this.next = this.draw();
    this.reset();
  }

  /** Daily runs pass a freshly seeded generator so every attempt that day sees the same order and gusts. */
  reset(rules: Rules = this.rules, random: () => number = rules.mode === "free" ? Math.random : this.random) {
    this.rules = rules; this.random = random;
    this.world = new World(Vec2(0, rules.gravity));
    this.world.on("begin-contact", (contact: Contact) => this.touch(contact));
    const ground = this.world.createBody({ type: "static", position: Vec2(0, 0) });
    ground.createFixture({ shape: new Box(rules.platformHalfWidth, PLATFORM_DEPTH / 2, Vec2(0, -PLATFORM_DEPTH / 2)), friction: rules.friction });
    this.pieces = []; this.active = null; this.crate = null; this.hover = null; this.events = [];
    this.lives = LIVES; this.height = 0; this.runBest = 0; this.pureBest = 0; this.drops = 0; this.lost = 0; this.revives = 0; this.over = false;
    this.accumulator = 0; this.activeMs = 0; this.spawnWait = 0; this.grace = 0; this.milestone = 0; this.crateQueued = false;
    this.lastX = 0; this.serial = 0; this.clock = 0;
    this.wind = { phase: "still", direction: 1, timer: 0, accel: 0 };
    this.bag = []; this.next = this.draw();
    this.spawn(0);
  }

  get canQueueCrate() {
    return !this.over && this.height >= CRATE_MIN_HEIGHT && !this.crate && !this.crateQueued && this.hover?.kind !== "crate";
  }
  get crateInPlay() { return Boolean(this.crate || this.crateQueued || this.hover?.kind === "crate"); }
  get reviveCost() { return this.revives + 1; }
  get canRevive() { return this.over && this.revives < MAX_REVIVES; }
  get nextSerial() { return this.serial; }

  setViewHalfWidth(halfWidth: number) {
    this.halfRange = Math.max(3, Math.min(7, halfWidth - 1.4));
    if (this.hover) this.hover.x = this.clampX(this.hover.x);
  }
  move(dx: number) { if (this.hover) this.hover.x = this.clampX(this.hover.x + dx); }
  setX(x: number) { if (this.hover) this.hover.x = this.clampX(x); }
  rotate(direction: 1 | -1) {
    if (!this.hover || this.hover.kind === "crate") return false;
    this.hover.turns = (this.hover.turns + direction + 4) % 4;
    return true;
  }

  /** The current Friend pose returns to the front of the queue when a crate takes its place. */
  queueCrate() {
    if (!this.canQueueCrate) return false;
    if (this.hover && !this.active) {
      this.bag.unshift(this.next); this.next = this.hover.rows;
      this.hover = { kind: "crate", rows: CRATE_ART, x: this.hover.x, y: this.hover.y, turns: 0 };
    } else this.crateQueued = true;
    return true;
  }
  cancelCrate() {
    if (this.crateQueued) { this.crateQueued = false; return true; }
    if (this.hover?.kind !== "crate") return false;
    this.hover = { kind: "friend", rows: this.next, x: this.hover.x, y: this.hover.y, turns: 0 };
    this.next = this.bag.shift() ?? this.draw();
    return true;
  }

  drop() {
    if (!this.hover || this.active || this.over) return false;
    const { kind, rows, x, y, turns } = this.hover;
    this.lastX = x; this.bestAtDrop = this.runBest;
    // Crates parachute down slowly and grip, so they settle on rounded Friend tops instead of tumbling off.
    const crate = kind === "crate";
    const body = this.world.createBody({ type: "dynamic", position: Vec2(x, y), angle: -turns * Math.PI / 2,
      linearDamping: crate ? CRATE_DAMPING : 0.05, angularDamping: crate ? 5 : 0.6, bullet: crate });
    for (const rect of pixelRects(crate ? CRATE_BODY : rows)) {
      const center = Vec2((rect.x + rect.w / 2 - 8) * PIXEL, (8 - rect.y - rect.h / 2) * PIXEL);
      body.createFixture({ shape: new Box(rect.w * PIXEL / 2, rect.h * PIXEL / 2, center), density: crate ? 0.5 : 1, friction: crate ? CRATE_FRICTION : this.rules.friction, restitution: 0 });
    }
    const data: PieceData = { kind, rows, serial: kind === "crate" ? -1 : this.serial++, pixels: pixelCount(kind === "crate" ? CRATE_BODY : rows),
      landed: false, landedAt: -Infinity, restMs: 0, frozen: false, hitTower: false };
    body.setUserData(data);
    body.setLinearVelocity(Vec2(0, -DROP_SPEED));
    this.pieces.push(body); this.active = body; this.hover = null; this.activeMs = 0;
    if (kind === "crate") this.crate = body; else this.drops++;
    this.events.push({ type: "drop", kind });
    return true;
  }

  /** Called after the runtime settles the crate's simulated play. */
  removeCrate() {
    const crate = this.crate;
    if (!crate) return null;
    const position = crate.getPosition(), at = { x: position.x, y: position.y };
    this.destroy(crate);
    return at;
  }

  /** Paid continue: the opened crates' glue sets every piece still standing, and one life returns. */
  revive() {
    if (!this.canRevive) return false;
    for (const body of [...this.pieces]) {
      const data = pieceData(body);
      if (body.getPosition().y < -0.3) { this.destroy(body); continue; }
      if (data.kind !== "friend") continue;
      body.setLinearVelocity(Vec2(0, 0)); body.setAngularVelocity(0);
      body.setStatic(); data.frozen = true; data.landed = true;
    }
    this.over = false; this.lives = 1; this.revives++; this.grace = REVIVE_GRACE_MS;
    this.active = null; this.hover = null; this.spawnWait = 500;
    this.wind = { phase: "calm", direction: this.wind.direction, timer: 6000, accel: 0 };
    return true;
  }

  step(seconds: number): EngineEvent[] {
    const clamped = Math.min(seconds, 0.1), ms = clamped * 1000;
    this.clock += ms;
    this.updateWind(ms);
    this.accumulator += clamped;
    while (this.accumulator >= STEP) {
      if (this.wind.accel) this.blow();
      this.world.step(STEP, 10, 6);
      this.accumulator -= STEP;
    }
    this.grace = Math.max(0, this.grace - ms);
    for (const body of [...this.pieces]) {
      const data = pieceData(body), position = body.getPosition();
      if (position.y > KILL_Y && Math.abs(position.x) < 40) continue;
      this.destroy(body);
      if (data.kind === "crate") { this.events.push({ type: "crate-returned", reason: "fell" }); continue; }
      if (this.over) continue;
      const forgiven = this.grace > 0;
      if (!forgiven) { this.lives--; this.lost++; }
      this.events.push({ type: "lost", x: position.x, y: Math.max(position.y, -2), lives: this.lives, forgiven });
    }
    if (this.active && pieceData(this.active).kind === "friend") {
      const active = this.active, data = pieceData(active);
      this.activeMs += ms;
      data.restMs = data.landed && still(active, 0.25) ? data.restMs + ms : 0;
      if (data.restMs >= 280 || this.activeMs > 4500) {
        this.active = null; this.spawnWait = 180;
        this.measure();
        const gain = this.runBest - this.bestAtDrop;
        if (gain >= 0.2) {
          const position = active.getPosition();
          this.events.push({ type: "gain", metres: gain, x: position.x, y: this.runBest });
        }
      }
    }
    this.measure();
    this.watchCrate(ms);
    if (!this.over && this.lives <= 0) {
      this.over = true; this.hover = null; this.crateQueued = false;
      this.wind = { ...this.wind, phase: "calm", accel: 0, timer: 6000 };
      this.events.push({ type: "game-over", height: this.runBest });
    }
    if (!this.over && !this.active && !this.hover && !this.crate) {
      this.spawnWait -= ms;
      if (this.spawnWait <= 0) this.spawn(this.lastX);
    }
    const events = this.events; this.events = [];
    return events;
  }

  topPiece() {
    let best: Body | null = null, top = -Infinity;
    for (const body of this.pieces) {
      if (body === this.active || pieceData(body).kind !== "friend") continue;
      const edge = bounds(body).top;
      if (edge > top) { top = edge; best = body; }
    }
    return best ? { body: best, top } : null;
  }

  private measure() {
    let top = 0;
    for (const body of this.pieces) {
      const data = pieceData(body);
      if (body === this.active || data.kind !== "friend" || !data.landed || !still(body, 0.5)) continue;
      const box = bounds(body);
      top = Math.max(top, box.top);
      // Deep, sleeping layers become static so tall towers stay fast on phones.
      if (!body.isAwake() && box.top < this.height - 10 && !body.isStatic()) { body.setStatic(); data.frozen = true; }
    }
    this.height = top;
    if (this.over) return;
    this.runBest = Math.max(this.runBest, top); this.best = Math.max(this.best, top);
    if (!this.revives) this.pureBest = this.runBest;
    const reached = Math.floor(top / 5) * 5;
    if (reached > this.milestone) { this.milestone = reached; this.events.push({ type: "milestone", meters: reached }); }
  }

  /** Calm spells alternate with a warned gust once the tower is tall enough for the current rules. */
  private updateWind(ms: number) {
    const wind = this.wind;
    if (this.over || this.height < this.rules.windFloor) {
      if (wind.phase !== "still") this.wind = { phase: "still", direction: wind.direction, timer: 0, accel: 0 };
      return;
    }
    if (wind.phase === "still") { this.wind = { phase: "calm", direction: wind.direction, timer: 3500 + this.random() * 3000, accel: 0 }; return; }
    wind.timer -= ms;
    if (wind.phase === "gust") {
      const progress = 1 - wind.timer / WIND_GUST_MS;
      const peak = Math.min(3.2, 1.6 + (this.height - this.rules.windFloor) * 0.05) * this.rules.windScale;
      wind.accel = wind.direction * peak * Math.sin(Math.PI * Math.min(1, Math.max(0, progress)));
    }
    if (wind.timer > 0) return;
    if (wind.phase === "calm") {
      this.wind = { phase: "warning", direction: this.random() < 0.5 ? -1 : 1, timer: WIND_WARNING_MS, accel: 0 };
      this.events.push({ type: "wind", phase: "warning", direction: this.wind.direction });
    } else if (wind.phase === "warning") {
      this.wind = { phase: "gust", direction: wind.direction, timer: WIND_GUST_MS, accel: 0 };
      this.events.push({ type: "wind", phase: "gust", direction: wind.direction });
    } else this.wind = { phase: "calm", direction: wind.direction, timer: 5000 + this.random() * 4000, accel: 0 };
  }

  /** Gusts push the falling piece and the upper part of the tower, never the frozen base. */
  private blow() {
    const floor = this.rules.windFloor - 2;
    for (const body of this.pieces) {
      if (!body.isDynamic() || body.getPosition().y < floor) continue;
      body.applyForceToCenter(Vec2(this.wind.accel * body.getMass(), 0), true);
    }
  }

  /** Sticky crates: touching the tower in the open zone sticks the crate there; resting low returns it. */
  private watchCrate(ms: number) {
    const crate = this.crate;
    if (!crate) return;
    const data = pieceData(crate);
    if (data.frozen) {
      if (data.restMs < 0) return;
      data.restMs += ms;
      if (data.restMs < CRATE_STICK_MS) return;
      data.restMs = -1;
      const position = crate.getPosition();
      this.events.push({ type: "crate-ready", x: position.x, y: position.y });
      return;
    }
    const high = bounds(crate).bottom >= CRATE_OPEN_FLOOR;
    if (data.hitTower && high) {
      if (this.active === crate) this.active = null;
      crate.setLinearVelocity(Vec2(0, 0)); crate.setAngularVelocity(0); crate.setStatic();
      data.frozen = true; data.restMs = 0;
      this.events.push({ type: "crate-stuck" });
      return;
    }
    data.restMs = data.landed && still(crate) ? data.restMs + ms : 0;
    if (data.restMs < 700 || high) return;
    this.destroy(crate);
    this.events.push({ type: "crate-returned", reason: "low" });
  }

  private spawn(x: number) {
    const kind: PieceKind = this.crateQueued ? "crate" : "friend";
    let rows: Rows = CRATE_ART;
    if (kind === "friend") { rows = this.next; this.next = this.draw(); }
    this.crateQueued = false;
    this.hover = { kind, rows, x: this.clampX(x), y: Math.max(this.height + SPAWN_GAP, SPAWN_MIN), turns: 0 };
  }

  private destroy(body: Body) {
    if (body === this.active) this.active = null;
    if (body === this.crate) this.crate = null;
    this.pieces = this.pieces.filter(piece => piece !== body);
    this.world.destroyBody(body);
  }

  private touch(contact: Contact) {
    const [a, b] = [contact.getFixtureA().getBody(), contact.getFixtureB().getBody()];
    for (const [body, other] of [[a, b], [b, a]] as const) {
      const data = body.getUserData() as PieceData | null, otherData = other.getUserData() as PieceData | null;
      if (data?.kind === "crate" && otherData?.kind === "friend") data.hitTower = true;
      if (!data || data.landed) continue;
      data.landed = true; data.landedAt = this.clock;
      if (body === this.active) { const position = body.getPosition(); this.events.push({ type: "land", kind: data.kind, x: position.x, y: position.y, pixels: data.pixels }); }
    }
  }

  private clampX(x: number) { return Math.max(-this.halfRange, Math.min(this.halfRange, x)); }

  /** A shuffled bag shows every pose before any repeats. */
  private draw(): Rows {
    if (!this.bag.length) {
      this.bag = [...this.poses];
      for (let index = this.bag.length - 1; index > 0; index--) {
        const other = Math.floor(this.random() * (index + 1));
        [this.bag[index], this.bag[other]] = [this.bag[other], this.bag[index]];
      }
    }
    return this.bag.shift()!;
  }
}
