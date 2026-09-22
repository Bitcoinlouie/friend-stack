import { PIXEL, PLATFORM_DEPTH, pieceData, type StackEngine } from "./engine";
import { CRATE_ART, CROWN_ART, GOLD, PRISM_COATS, type Coat, type Rows } from "./pieces";
import type { Generation, Material } from "./land";

/** Logical height is fixed at 16 m; width follows the frame's aspect ratio. */
export const VIEW_HEIGHT = 640;
const SCALE = 40, DENSITY = 2, HALO = 1.5, SQUASH_MS = 170;
const SIGNAL = "#ccff00", INK = "#111111";

export type Look = Readonly<{ coat: Coat; prism: boolean; crown: boolean; reducedMotion: boolean; material: Material; generation: Generation | null }>;
export type CardText = Readonly<{ title: string; height: string; detail: string; footer: string }>;
type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string };
type Popup = { text: string; x: number; y: number; life: number };

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
function mix(from: string, to: string, amount: number) {
  const parse = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const [a, b] = [parse(from), parse(to)];
  return `rgb(${a.map((value, index) => Math.round(value + (b[index] - value) * amount)).join(",")})`;
}
const nightAt = (bottom: number) => clamp((bottom - 5) / 55, 0, 1);

export class StackRenderer {
  width = 960;
  height = VIEW_HEIGHT;
  camBottom = -3;
  /** Logical y of the NEXT preview, kept below the DOM HUD at every frame size. */
  nextTop = 74;
  /** Logical left/top of the on-screen Rotate/Drop controls, measured from the DOM on resize. */
  controls: Readonly<{ left: number; top: number }> | null = null;
  private scale = SCALE;
  private dpr = 1;
  private shake = 0;
  private particles: Particle[] = [];
  private popups: Popup[] = [];
  private sprites = new Map<string, HTMLCanvasElement>();
  private ctx: CanvasRenderingContext2D;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw the tower.");
    this.ctx = ctx;
  }

  /** Returns the visible half-width in metres so the engine can clamp the hovering piece. */
  resize(cssWidth: number, cssHeight: number) {
    if (cssWidth <= 0 || cssHeight <= 0) return this.width / 2 / SCALE;
    this.width = Math.round(clamp(VIEW_HEIGHT * cssWidth / cssHeight, 360, 1280));
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    return this.width / 2 / SCALE;
  }

  worldX(clientX: number, rect: DOMRect) { return ((clientX - rect.left) * this.width / rect.width - this.width / 2) / SCALE; }
  metres(clientDx: number, rect: DOMRect) { return clientDx * this.width / rect.width / SCALE; }

  burst(x: number, y: number, colors: readonly string[], count = 28) {
    for (let index = 0; index < count; index++) {
      const angle = Math.random() * Math.PI * 2, speed = 2 + Math.random() * 6;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed + 3, life: 0, max: 0.6 + Math.random() * 0.7, color: colors[index % colors.length] });
    }
  }
  popup(text: string, x: number, y: number) { this.popups.push({ text, x, y, life: 0 }); }
  jolt() { this.shake = 0.35; }
  clearEffects() { this.particles = []; this.popups = []; this.shake = 0; }

  draw(engine: StackEngine, look: Look, seconds: number, now: number) {
    const { ctx } = this;
    const target = Math.max(this.cameraFloor(engine), engine.height - 9.5, (engine.hover?.y ?? 0) - 13.5);
    this.camBottom = look.reducedMotion ? target : this.camBottom + (target - this.camBottom) * Math.min(1, seconds * 2.5);
    this.shake = Math.max(0, this.shake - seconds);
    const jitter = look.reducedMotion || !this.shake ? 0 : this.shake * 14;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.save();
    ctx.translate((Math.random() - 0.5) * jitter, (Math.random() - 0.5) * jitter);
    this.scene(engine, look, nightAt(this.camBottom));
    this.drawWindStreaks(engine, look, now);
    if (engine.hover) this.drawHover(engine, look, now);
    this.drawParticles(seconds, look.reducedMotion);
    this.drawPopups(seconds, look.reducedMotion);
    ctx.restore();
    this.drawNext(engine, look);
    this.drawWindFlag(engine, look, now);
  }

  /** A portrait card of the whole tower, for the game-over screen. Long-press or right-click saves it. */
  snapshot(engine: StackEngine, look: Look, text: CardText) {
    const width = 480, height = 720, dpr = 2;
    const card = document.createElement("canvas");
    card.width = width * dpr; card.height = height * dpr;
    const ctx = card.getContext("2d");
    if (!ctx) return null;
    const top = Math.max(engine.runBest, engine.height, 6) + 3, bottom = -2.4;
    const saved = { ctx: this.ctx, width: this.width, height: this.height, dpr: this.dpr, camBottom: this.camBottom, scale: this.scale };
    Object.assign(this, { ctx, width, height, dpr, camBottom: bottom, scale: Math.min(SCALE * 1.1, (height - 190) / (top - bottom)) });
    try {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.scene(engine, look, nightAt(top - 16));
      ctx.fillStyle = "rgba(255,255,255,.94)"; ctx.fillRect(16, 16, width - 32, 132);
      ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(16, 16, width - 32, 132);
      ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.font = "bold 13px ui-monospace, monospace"; ctx.fillText(text.title, 30, 28);
      ctx.font = "bold 52px ui-monospace, monospace"; ctx.fillText(text.height, 28, 48);
      ctx.font = "12px ui-monospace, monospace"; ctx.fillText(text.detail, 30, 110);
      ctx.fillStyle = INK; ctx.fillRect(0, height - 30, width, 30);
      ctx.fillStyle = SIGNAL; ctx.font = "bold 11px ui-monospace, monospace"; ctx.textBaseline = "middle";
      ctx.fillText(text.footer, 16, height - 15);
      return card.toDataURL("image/png");
    } catch { return null; }
    finally { Object.assign(this, saved); }
  }

  /** On narrow frames the controls reach over the platform, so the camera starts lower to keep it clear of them. */
  private cameraFloor(engine: StackEngine) {
    const controls = this.controls;
    if (!controls || controls.left > this.width / 2 + engine.rules.platformHalfWidth * SCALE + 8) return -3;
    return Math.min(-3, (controls.top - 10 - this.height) / SCALE - PLATFORM_DEPTH);
  }

  private sx(x: number) { return this.width / 2 + x * this.scale; }
  private sy(y: number) { return this.height - (y - this.camBottom) * this.scale; }

  private scene(engine: StackEngine, look: Look, night: number) {
    const { ctx, width, height } = this;
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = mix("#f2efe6", "#11132a", night);
    ctx.fillRect(-20, -20, width + 40, height + 40);
    this.drawStars(night);
    this.drawRuler(engine, night);
    this.drawPlatform(engine.rules.platformHalfWidth, look);
    for (const body of engine.pieces) {
      const data = pieceData(body), position = body.getPosition();
      const age = engine.clock - data.landedAt, squash = look.reducedMotion || age > SQUASH_MS ? 0 : (1 - age / SQUASH_MS) * 0.14;
      this.drawSprite(this.sprite(data.rows, data.kind === "crate" ? null : this.coatFor(look, data.serial)),
        this.sx(position.x), this.sy(position.y), -body.getAngle(), 1 + squash, 1 - squash);
      if (data.kind === "crate" && !data.frozen && !data.hitTower) this.drawParachute(this.sx(position.x), this.sy(position.y));
    }
    if (look.crown) this.drawCrown(engine);
  }

  private coatFor(look: Look, serial: number) { return look.prism ? PRISM_COATS[((serial % PRISM_COATS.length) + PRISM_COATS.length) % PRISM_COATS.length] : look.coat; }

  private drawStars(night: number) {
    if (night < 0.25) return;
    const { ctx, width, height } = this;
    ctx.fillStyle = `rgba(255,255,240,${(night - 0.25) / 0.75})`;
    for (let index = 0; index < Math.round(width / 12); index++) {
      const x = (index * 137.5) % width;
      const y = ((index * 89.3 + this.camBottom * 6) % height + height) % height;
      const size = index % 7 === 0 ? 3 : 2;
      ctx.fillRect(Math.round(x), Math.round(y), size, size);
    }
  }

  private drawRuler(engine: StackEngine, night: number) {
    const { ctx, height } = this, ink = night > 0.5 ? "#e8e6dd" : INK;
    const low = Math.floor(this.camBottom), high = Math.ceil(this.camBottom + height / this.scale);
    const every = this.scale < 16 ? 10 : 5, tick = this.scale < 16 ? 5 : 1;
    ctx.fillStyle = ink; ctx.font = "bold 12px ui-monospace, monospace"; ctx.textBaseline = "middle"; ctx.textAlign = "left";
    for (let metre = Math.max(0, low); metre <= high; metre++) {
      if (metre % tick) continue;
      const y = Math.round(this.sy(metre)), major = metre % every === 0;
      ctx.fillRect(0, y, major ? 14 : 7, 2);
      if (major && metre > 0) {
        ctx.fillText(`${metre} m`, 18, y);
        ctx.globalAlpha = 0.12; ctx.fillRect(56, y, this.width - 56, 1); ctx.globalAlpha = 1;
      }
    }
    if (engine.rules.windFloor > 0 && engine.rules.windFloor <= high && engine.rules.windFloor >= low) {
      const y = Math.round(this.sy(engine.rules.windFloor));
      ctx.globalAlpha = 0.5; ctx.fillStyle = ink; ctx.font = "10px ui-monospace, monospace";
      ctx.fillText("~ wind zone ~", 60, y - 9); ctx.globalAlpha = 1;
    }
    if (engine.best > 0.4) {
      const y = Math.round(this.sy(engine.best));
      ctx.strokeStyle = night > 0.5 ? SIGNAL : "#5d7500"; ctx.lineWidth = 2; ctx.setLineDash([10, 8]);
      ctx.beginPath(); ctx.moveTo(56, y); ctx.lineTo(this.width, y); ctx.stroke(); ctx.setLineDash([]);
      const label = `BEST ${engine.best.toFixed(1)} m`;
      ctx.font = "bold 11px ui-monospace, monospace";
      const labelWidth = ctx.measureText(label).width + 12;
      ctx.fillStyle = INK; ctx.fillRect(this.width - labelWidth - 12, y - 10, labelWidth, 20);
      ctx.fillStyle = SIGNAL; ctx.textAlign = "left"; ctx.fillText(label, this.width - labelWidth - 6, y);
    }
  }

  /** The platform's material shows the Friend's generation; its width comes from the current rules. */
  private drawPlatform(halfWidth: number, look: Look) {
    const { ctx } = this, { fill, stripe } = look.material;
    const left = this.sx(-halfWidth), right = this.sx(halfWidth), top = this.sy(0), bottom = this.sy(-PLATFORM_DEPTH);
    const pillar = Math.min(2.4, halfWidth * 0.6);
    ctx.fillStyle = "#2b2b2b"; ctx.fillRect(this.sx(-pillar), bottom, this.sx(pillar) - this.sx(-pillar), this.height - bottom + 40);
    ctx.fillStyle = "#3a3a3a";
    for (let y = bottom + 10; y < this.height + 40; y += 18) ctx.fillRect(this.sx(-pillar), y, this.sx(pillar) - this.sx(-pillar), 3);
    ctx.fillStyle = fill; ctx.fillRect(left, top, right - left, bottom - top);
    ctx.fillStyle = stripe; ctx.fillRect(left, top, right - left, 4);
    ctx.globalAlpha = 0.35; ctx.fillRect(left, bottom - 3, right - left, 3); ctx.globalAlpha = 1;
    if (this.scale >= 24) {
      const label = look.generation ? `FRIEND STACK · GEN ${look.generation}` : "FRIEND STACK";
      ctx.font = "bold 13px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, (left + right) / 2, (top + bottom) / 2 + 2);
    }
  }

  private drawHover(engine: StackEngine, look: Look, now: number) {
    const hover = engine.hover!, { ctx } = this;
    const x = this.sx(hover.x), y = this.sy(hover.y), floor = this.sy(engine.height);
    // The guide bends with the current gust so wind is readable before the drop.
    const fall = Math.max(0, hover.y - engine.height), gravity = Math.abs(engine.rules.gravity);
    const time = (-1 + Math.sqrt(1 + 2 * gravity * fall)) / gravity;
    const drift = 0.5 * engine.wind.accel * time * time * this.scale;
    ctx.strokeStyle = hover.kind === "crate" ? "#5d7500" : engine.wind.accel ? "rgba(17,17,17,.55)" : "rgba(17,17,17,.35)"; ctx.lineWidth = 2; ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(x, y + 8 * PIXEL * this.scale);
    ctx.quadraticCurveTo(x, (y + floor) / 2, x + drift, floor); ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = look.reducedMotion ? 1 : 0.82 + Math.sin(now / 180) * 0.18;
    this.drawSprite(this.sprite(hover.rows, hover.kind === "crate" ? null : this.coatFor(look, engine.nextSerial)), x, y, hover.turns * Math.PI / 2);
    ctx.globalAlpha = 1;
  }

  private drawParachute(x: number, y: number) {
    const { ctx } = this, unit = PIXEL * this.scale, top = y - 14 * unit, half = 9 * unit;
    ctx.strokeStyle = INK; ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (const side of [-1, 1]) { ctx.moveTo(x + side * half, top); ctx.lineTo(x + side * 5 * unit, y - 6 * unit); }
    ctx.moveTo(x, top - 3 * unit); ctx.lineTo(x, y - 6 * unit);
    ctx.stroke();
    ctx.fillStyle = "#ffffff"; ctx.beginPath(); ctx.ellipse(x, top, half, 5 * unit, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = SIGNAL; ctx.beginPath(); ctx.ellipse(x, top, half / 3, 5 * unit, 0, Math.PI, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
  }

  private drawCrown(engine: StackEngine) {
    const top = engine.topPiece();
    if (!top) return;
    const x = this.sx(top.body.getPosition().x), y = this.sy(top.top) - 3 * PIXEL * this.scale;
    this.drawSprite(this.sprite(CROWN_ART, { name: "crown", fill: GOLD, halo: INK }), x, y, 0);
  }

  private drawNext(engine: StackEngine, look: Look) {
    const { ctx } = this, size = 64, left = this.width - size - 16, top = this.nextTop;
    ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.fillRect(left, top, size, size + 16);
    ctx.strokeStyle = INK; ctx.lineWidth = 2; ctx.strokeRect(left, top, size, size + 16);
    ctx.fillStyle = INK; ctx.font = "bold 10px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.fillText("NEXT", left + size / 2, top + 4);
    const serial = engine.nextSerial + (engine.hover?.kind === "friend" ? 1 : 0);
    const sprite = this.sprite(engine.next, this.coatFor(look, serial));
    const drawn = size - 12;
    ctx.drawImage(sprite, left + 6, top + 16, drawn, drawn);
  }

  private drawWindStreaks(engine: StackEngine, look: Look, now: number) {
    const { phase, accel, direction } = engine.wind;
    if (phase !== "gust" || look.reducedMotion) return;
    const { ctx, width, height } = this, strength = Math.min(1, Math.abs(accel) / 2.5);
    ctx.strokeStyle = `rgba(120,130,150,${0.15 + strength * 0.35})`; ctx.lineWidth = 2;
    for (let index = 0; index < 22; index++) {
      const lane = (index * 97.3) % height, length = 40 + (index % 5) * 18;
      const x = (((now * 0.9 * (1 + (index % 3) * 0.4)) * direction + index * 211) % (width + 200) + width + 200) % (width + 200) - 100;
      ctx.beginPath(); ctx.moveTo(x, lane); ctx.lineTo(x - direction * length * (0.4 + strength), lane); ctx.stroke();
    }
  }

  private drawWindFlag(engine: StackEngine, look: Look, now: number) {
    const { phase, direction } = engine.wind;
    if (phase !== "warning" && phase !== "gust") return;
    if (phase === "warning" && !look.reducedMotion && Math.floor(now / 250) % 2) return;
    const { ctx } = this, label = phase === "warning" ? `WIND RISING ${direction > 0 ? "→" : "←"}` : `GUST ${direction > 0 ? "→ → →" : "← ← ←"}`;
    ctx.font = "bold 14px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    const textWidth = ctx.measureText(label).width + 20, x = this.width / 2, y = this.nextTop + 10;
    ctx.fillStyle = phase === "gust" ? INK : SIGNAL; ctx.fillRect(x - textWidth / 2, y - 13, textWidth, 26);
    ctx.fillStyle = phase === "gust" ? SIGNAL : INK; ctx.fillText(label, x, y + 1);
  }

  private drawParticles(seconds: number, reducedMotion: boolean) {
    if (reducedMotion) { this.particles = []; return; }
    const { ctx } = this;
    this.particles = this.particles.filter(particle => {
      particle.life += seconds; particle.vy -= 12 * seconds;
      particle.x += particle.vx * seconds; particle.y += particle.vy * seconds;
      if (particle.life >= particle.max) return false;
      ctx.globalAlpha = 1 - particle.life / particle.max; ctx.fillStyle = particle.color;
      ctx.fillRect(Math.round(this.sx(particle.x)) - 3, Math.round(this.sy(particle.y)) - 3, 6, 6);
      return true;
    });
    ctx.globalAlpha = 1;
  }

  private drawPopups(seconds: number, reducedMotion: boolean) {
    const { ctx } = this;
    ctx.font = "bold 18px ui-monospace, monospace"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    this.popups = this.popups.filter(popup => {
      popup.life += seconds;
      if (popup.life > 1.3) return false;
      const x = this.sx(popup.x), y = this.sy(popup.y + (reducedMotion ? 0.6 : 0.6 + popup.life * 1.2));
      ctx.globalAlpha = Math.min(1, 2.2 - popup.life * 1.7);
      ctx.lineWidth = 4; ctx.strokeStyle = INK; ctx.strokeText(popup.text, x, y);
      ctx.fillStyle = SIGNAL; ctx.fillText(popup.text, x, y);
      return true;
    });
    ctx.globalAlpha = 1;
  }

  private drawSprite(sprite: HTMLCanvasElement, x: number, y: number, rotation: number, stretchX = 1, stretchY = 1) {
    const { ctx } = this, ratio = this.scale / SCALE;
    const w = sprite.width / DENSITY * ratio * stretchX, h = sprite.height / DENSITY * ratio * stretchY;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation);
    ctx.drawImage(sprite, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** Pre-rendered pixel art with a halo; a null coat draws the Summit Crate. */
  private sprite(rows: Rows, coat: Coat | null) {
    const key = `${coat?.name ?? "crate"}|${rows.join("")}`;
    const cached = this.sprites.get(key);
    if (cached) return cached;
    const columns = Math.max(...rows.map(row => row.length)), cell = PIXEL * SCALE * DENSITY, halo = HALO * DENSITY;
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(columns * cell + halo * 2); canvas.height = Math.ceil(rows.length * cell + halo * 2);
    const ctx = canvas.getContext("2d")!;
    const each = (source: Rows, draw: (x: number, y: number) => void) =>
      source.forEach((row, y) => [...row].forEach((pixel, x) => { if (pixel === "#") draw(halo + x * cell, halo + y * cell); }));
    if (!coat) {
      ctx.fillStyle = INK; ctx.fillRect(halo + 2 * cell - halo, halo + 2 * cell - halo, 12 * cell + halo * 2, 12 * cell + halo * 2);
      ctx.fillStyle = SIGNAL; ctx.fillRect(halo + 2 * cell, halo + 2 * cell, 12 * cell, 12 * cell);
      ctx.fillStyle = INK; each(CRATE_ART, (x, y) => ctx.fillRect(x, y, cell, cell));
    } else {
      ctx.fillStyle = coat.halo; each(rows, (x, y) => ctx.fillRect(x - halo, y - halo, cell + halo * 2, cell + halo * 2));
      rows.forEach((row, y) => [...row].forEach((pixel, x) => {
        if (pixel !== "#") return;
        ctx.fillStyle = coat.stripe && y % 2 ? coat.stripe : coat.fill;
        ctx.fillRect(halo + x * cell, halo + y * cell, cell, cell);
      }));
    }
    this.sprites.set(key, canvas);
    return canvas;
  }
}
