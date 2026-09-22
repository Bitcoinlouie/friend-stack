import { decodeSpriteBitmap, type GenerationSprites } from "@rarefriends/friendsdk/sprites";

export type Rows = readonly string[];
export type PixelRect = Readonly<{ x: number; y: number; w: number; h: number }>;
export type Coat = Readonly<{ name: string; fill: string; halo: string; stripe?: string }>;

export const CLASSIC_COAT: Coat = { name: "Classic", fill: "#111111", halo: "#ffffff" };
/** Indexed like the outcomes in game.json; the Summit Crown (index 3) is drawn separately. */
export const COATS: readonly (Coat | null)[] = [
  { name: "Chalk Coat", fill: "#f4f1e8", halo: "#111111" },
  { name: "Brick Coat", fill: "#b4462c", halo: "#ffffff", stripe: "#8e3421" },
  { name: "Neon Coat", fill: "#ccff00", halo: "#111111" },
  null,
];
export const CROWN_INDEX = 3;
export const GOLD = "#f2c230";
/** Holding one of each coat unlocks the Prism Coat: a cosmetic with no RF value of its own. */
export const SET_INDEXES = [0, 1, 2] as const;
export const PRISM_COATS: readonly Coat[] = [
  COATS[0]!, COATS[1]!, COATS[2]!, { name: "Gold", fill: GOLD, halo: "#111111" },
];

/** Every distinct pose becomes a piece; empty frames never become bodies. */
export function friendPieces(sprites: GenerationSprites): Rows[] {
  const seen = new Set<bigint>(), pieces: Rows[] = [];
  for (const bitmap of sprites.frames) {
    if (bitmap === 0n || seen.has(bitmap)) continue;
    seen.add(bitmap);
    pieces.push(decodeSpriteBitmap(bitmap).rows);
  }
  return pieces;
}

export function idleRows(sprites: GenerationSprites): Rows {
  const frame = sprites.clips.idle.down[0]?.bitmap || sprites.clips.idle.right[0]?.bitmap || sprites.frames.find(bitmap => bitmap !== 0n) || 0n;
  return decodeSpriteBitmap(frame).rows;
}

/** Row runs merged downward into rectangles, so a 16 × 16 mask needs few physics boxes. */
export function pixelRects(rows: Rows): PixelRect[] {
  const done: PixelRect[] = [];
  let open = new Map<string, { x: number; y: number; w: number; h: number }>();
  rows.forEach((row, y) => {
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (let x = 0; x < row.length;) {
      if (row[x] !== "#") { x++; continue; }
      const start = x;
      while (x < row.length && row[x] === "#") x++;
      const key = `${start}:${x}`, rect = open.get(key);
      if (rect) { rect.h++; next.set(key, rect); open.delete(key); }
      else next.set(key, { x: start, y, w: x - start, h: 1 });
    }
    done.push(...open.values());
    open = next;
  });
  done.push(...open.values());
  return done;
}

export function pixelCount(rows: Rows) {
  return rows.reduce((total, row) => total + [...row].filter(pixel => pixel === "#").length, 0);
}

export const CRATE_BODY: Rows = [
  "................", "................",
  ..."..############..,".repeat(12).split(",").filter(Boolean),
  "................", "................",
];
export const CRATE_ART: Rows = [
  "................",
  "................",
  "..############..",
  "..#..........#..",
  "..#.#......#.#..",
  "..#..#....#..#..",
  "..#...#..#...#..",
  "..#....##....#..",
  "..#....##....#..",
  "..#...#..#...#..",
  "..#..#....#..#..",
  "..#.#......#.#..",
  "..#..........#..",
  "..############..",
  "................",
  "................",
];
export const CROWN_ART: Rows = [
  "#...#...#",
  "##.###.##",
  "#########",
  "#.#.#.#.#",
  "#########",
];
