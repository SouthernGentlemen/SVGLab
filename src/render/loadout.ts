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
  if (loadout.weapon !== null && (typeof loadout.weapon !== "string" || !loadout.weapon)) {
    throw new Error("loadout weapon must be a cosmetic reference or null");
  }
  if (loadout.weapon !== null && loadout.cosmetics.includes(loadout.weapon)) {
    throw new Error(`loadout repeats weapon '${loadout.weapon}' in cosmetics`);
  }

  for (const bone of node.rig.bones) {
    const reference = loadout.parts[bone.slot];
    if (typeof reference !== "string" || !reference) throw new Error(`loadout has no part for '${bone.slot}'`);
    if (node.sources.get(bone.name) !== reference) await swapPart(node, bone.name, reference, baseUrl, fetcher);
  }

  // A weapon stays a wardrobe piece all the way through placement and fit checking. The
  // separate loadout field only makes the slot exclusive and lets animation select a moveset.
  const selections = [
    ...loadout.cosmetics.map((reference) => ({ reference, weapon: false })),
    ...(loadout.weapon === null ? [] : [{ reference: loadout.weapon, weapon: true }]),
  ];
  const wanted = new Set(selections.map((selection) => selection.reference));
  for (const selection of selections) {
    const { reference } = selection;
    const existed = node.cosmetics.has(reference);
    if (!node.cosmetics.get(reference)?.enabled) {
      const fit = await wearCosmetic(node, reference, baseUrl, fetcher);
      if (fit !== "ok") throw new Error(`cannot wear '${reference}': ${fit}`);
    }
    const piece = node.cosmetics.get(reference)?.piece;
    const isWeapon = piece?.kind === "weapon";
    if (isWeapon !== selection.weapon) {
      if (!existed) removeCosmetic(node, reference);
      throw new Error(selection.weapon
        ? `loadout weapon '${reference}' has kind '${piece?.kind ?? "unknown"}', not 'weapon'`
        : `loadout cosmetics contains weapon '${reference}'; use the weapon field`);
    }
  }
  for (const [reference, cosmetic] of [...node.cosmetics]) {
    if (cosmetic.enabled && !wanted.has(reference)) removeCosmetic(node, reference);
  }
}
