import { createPublicClient, http, parseAbi } from "viem";
import { GENERATION_SPRITE_MANIFEST } from "@rarefriends/friendsdk/sprites";

/** Generation 1 is the highest. The runtime has already verified ownership and generation ≥ 1 before the game mounts. */
export type Generation = 1 | 2 | 3 | 4 | 5 | 6;
export type Material = Readonly<{ name: string; fill: string; stripe: string }>;

/** "Promote gives your Rare Friend more land": Free Stack platform half-width in metres. Daily Tower ignores this. */
export const LAND: Readonly<Record<Generation, number>> = { 6: 4, 5: 4.2, 4: 4.4, 3: 4.6, 2: 4.8, 1: 5.2 };
export const MATERIALS: Readonly<Record<Generation, Material>> = {
  6: { name: "Stone", fill: "#3b3b3b", stripe: "#a3a3a3" },
  5: { name: "Timber", fill: "#4a3322", stripe: "#c08a52" },
  4: { name: "Bronze", fill: "#3d2716", stripe: "#d0843a" },
  3: { name: "Silver", fill: "#2c3238", stripe: "#d6dde4" },
  2: { name: "Signal", fill: "#111111", stripe: "#ccff00" },
  1: { name: "Gold", fill: "#2a2108", stripe: "#f2c230" },
};
/** Real protocol price, in RF, to promote from this generation to the next one up (not preview-scaled). */
export const PROMOTION_RF: Readonly<Record<Exclude<Generation, 1>, number>> = { 6: 9, 5: 90, 4: 900, 3: 9_000, 2: 90_000 };

const ABI = parseAbi(["function generation(uint256 tokenId) view returns (uint8)"]);

/** One public read of the selected Friend's generation; no wallet, signer or ownership logic. */
export async function readGeneration(friendId: bigint): Promise<Generation> {
  const client = createPublicClient({ transport: http(GENERATION_SPRITE_MANIFEST.rpcUrl, { retryCount: 1, timeout: 12_000 }) });
  const value = await client.readContract({ address: GENERATION_SPRITE_MANIFEST.generations, abi: ABI, functionName: "generation", args: [friendId] });
  if (value < 1 || value > 6) throw new RangeError("Unexpected generation.");
  return value as Generation;
}

export function nextPromotion(generation: Generation) {
  if (generation === 1) return null;
  const to = (generation - 1) as Generation, cost = PROMOTION_RF[generation];
  return { to, cost, burned: cost / 2, rewards: cost / 2, extra: LAND[to] - LAND[generation] };
}
