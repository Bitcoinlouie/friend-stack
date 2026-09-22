export type Mode = "free" | "daily";
export type Rules = Readonly<{
  mode: Mode;
  title: string;
  modifier: string;
  blurb: string;
  gravity: number;
  friction: number;
  platformHalfWidth: number;
  /** Gusts start once the tower reaches this height. */
  windFloor: number;
  windScale: number;
}>;

const BASE = { gravity: -9, friction: 0.9, platformHalfWidth: 4, windFloor: 20, windScale: 1 };

export const FREE_RULES: Rules = { ...BASE, mode: "free", title: "Free Stack", modifier: "Random poses", blurb: "A fresh random order every run. Wind picks up above 20 m." };

/** Every player gets the same modifier and the same seed on a given UTC day. */
const MODIFIERS = [
  { modifier: "Calm day", blurb: "Standard physics. Wind picks up above 20 m." },
  { modifier: "Gusty day", blurb: "Wind starts at 8 m and blows harder.", windFloor: 8, windScale: 1.35 },
  { modifier: "Icy platform", blurb: "Everything is slippery. Place pieces gently.", friction: 0.35 },
  { modifier: "Moon day", blurb: "Low gravity. Pieces drift down and bounce around.", gravity: -5 },
  { modifier: "Narrow ledge", blurb: "The platform is a quarter narrower.", platformHalfWidth: 3 },
] as const;

export function utcDay(date = new Date()) { return date.toISOString().slice(0, 10); }

export function dayLabel(day: string) {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function hash(text: string) {
  let value = 2166136261;
  for (let index = 0; index < text.length; index++) { value ^= text.charCodeAt(index); value = Math.imul(value, 16777619); }
  return value >>> 0;
}

export function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export function dailyRules(day = utcDay()): Rules {
  const pick = MODIFIERS[hash(`friend-stack:${day}`) % MODIFIERS.length];
  return { ...BASE, ...pick, mode: "daily", title: `Daily Tower · ${dayLabel(day)}` };
}

export const dailySeed = (day = utcDay()) => hash(`friend-stack:seed:${day}`);
