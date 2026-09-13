import {
  COSMETIC_REFERENCE_PATTERN_SOURCE,
  FIGURE_ID_PATTERN_SOURCE,
  PART_REFERENCE_PATTERN_SOURCE,
  validateFigure,
} from "../../src/render/manifest.ts";
import type { FigureManifest } from "../../src/render/manifest.ts";
import type { Rig } from "../../src/rig/types.ts";

export const FIGURE_FIELDS = ["contract", "name", "rig", "parts", "cosmetics"] as const;
const FIGURE_ID = new RegExp(FIGURE_ID_PATTERN_SOURCE);
const PART_REFERENCE = new RegExp(PART_REFERENCE_PATTERN_SOURCE);
const COSMETIC_REFERENCE = new RegExp(COSMETIC_REFERENCE_PATTERN_SOURCE);

/** Full authored-manifest rules used by node pipelines and represented by figure.schema.json. */
export function validateAuthoredFigure(value: unknown, id: string, rig: Rig): FigureManifest {
  const figure = validateFigure(value, id);
  const unknown = Object.keys(value as object).filter((field) => !(FIGURE_FIELDS as readonly string[]).includes(field));
  if (unknown.length > 0) throw new Error(`${id}: manifest has unknown fields: ${unknown.join(", ")}`);
  if (figure.name.trim() === "") throw new Error(`${id}: manifest has no name`);
  if (!FIGURE_ID.test(figure.rig)) throw new Error(`${id}: manifest has an invalid rig id`);
  if (figure.rig !== rig.contract.id) throw new Error(`${id}: targets rig '${figure.rig}', not '${rig.contract.id}'`);
  const expected = rig.bones.map((bone) => bone.slot).sort();
  const actual = Object.keys(figure.parts).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${id}: parts are not the slots in rigs/${rig.contract.id}.rig.json`);
  }
  for (const [slot, reference] of Object.entries(figure.parts)) {
    if (typeof reference !== "string" || !PART_REFERENCE.test(reference) || !reference.endsWith(`/${slot}.svg`)) {
      throw new Error(`${id}: has invalid part reference '${String(reference)}' for '${slot}'`);
    }
  }
  for (const reference of figure.cosmetics) {
    if (!COSMETIC_REFERENCE.test(reference)) throw new Error(`${id}: has invalid cosmetic reference '${reference}'`);
  }
  return figure;
}
