import { removeCosmetic, swapPart, wearCosmetic } from "./assemble.ts";
import type { Fetcher, FigureNode } from "./assemble.ts";

export interface Loadout {
  readonly figure: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly cosmetics: readonly string[];
  readonly weapon: string | null;
}

/** Applies a complete presentation value while preserving the node and its current pose. */
export async function applyLoadout(
  node: FigureNode,
  loadout: Loadout,
  baseUrl = document.baseURI,
  fetcher: Fetcher = fetch,
): Promise<void> {
  if (loadout.figure !== node.figureId) {
    throw new Error(`loadout targets figure '${loadout.figure}', not '${node.figureId}'`);
  }

  const expectedSlots = new Set(node.rig.bones.map((bone) => bone.slot));
  const suppliedSlots = Object.keys(loadout.parts);
  if (suppliedSlots.length !== expectedSlots.size || suppliedSlots.some((slot) => !expectedSlots.has(slot))) {
    throw new Error(`loadout parts are not the slots in rig '${node.rig.contract.id}'`);
  }
  if (new Set(loadout.cosmetics).size !== loadout.cosmetics.length) {
    throw new Error("loadout repeats a cosmetic");
  }

  for (const bone of node.rig.bones) {
    const reference = loadout.parts[bone.slot];
    if (typeof reference !== "string" || !reference) throw new Error(`loadout has no part for '${bone.slot}'`);
    if (node.sources.get(bone.name) !== reference) await swapPart(node, bone.name, reference, baseUrl, fetcher);
  }

  const wanted = new Set(loadout.cosmetics);
  for (const reference of loadout.cosmetics) {
    if (node.cosmetics.get(reference)?.enabled) continue;
    const fit = await wearCosmetic(node, reference, baseUrl, fetcher);
    if (fit !== "ok") throw new Error(`cannot wear '${reference}': ${fit}`);
  }
  for (const [reference, cosmetic] of [...node.cosmetics]) {
    if (cosmetic.enabled && !wanted.has(reference)) removeCosmetic(node, reference);
  }
}
