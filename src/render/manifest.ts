export const FIGURE_CONTRACT = 1;
export const FIGURE_ID_PATTERN_SOURCE = "^[a-z][a-z0-9-]*$";
export const PART_REFERENCE_PATTERN_SOURCE = "^characters/[a-z][a-z0-9-]*/parts/[a-z][a-z0-9_]*\\.svg$";
export const COSMETIC_REFERENCE_PATTERN_SOURCE = "^cosmetics/[a-z][a-z0-9-]*/[a-z][a-z0-9-]*\\.svg$";

export interface FigureManifest {
  readonly contract: number;
  readonly name: string;
  readonly rig: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly cosmetics: readonly string[];
}

/** Base rules shared with the browser; pipeline-only authored rules stay out of the bundle. */
export function validateFigure(value: unknown, id = "figure"): FigureManifest {
  if (typeof value !== "object" || value === null) throw new Error(`${id}: manifest is not an object`);
  const figure = value as FigureManifest;
  if (figure.contract !== FIGURE_CONTRACT) throw new Error(`${id}: unsupported figure contract ${figure.contract}`);
  if (typeof figure.name !== "string" || !figure.name) throw new Error(`${id}: manifest has no name`);
  if (typeof figure.rig !== "string" || !figure.rig) throw new Error(`${id}: manifest has no rig`);
  if (typeof figure.parts !== "object" || figure.parts === null || Array.isArray(figure.parts)) {
    throw new Error(`${id}: manifest has no parts map`);
  }
  if (!Array.isArray(figure.cosmetics) || figure.cosmetics.some((reference) => typeof reference !== "string")) {
    throw new Error(`${id}: manifest has no cosmetics list`);
  }
  if (new Set(figure.cosmetics).size !== figure.cosmetics.length) throw new Error(`${id}: repeats a cosmetic`);
  return figure;
}

export function inspectPart(source: string, expectedBone: string, reference: string): void {
  const names = [...source.matchAll(/\bdata-bone\s*=\s*(["'])([^"']+)\1/g)].map((match) => match[2]);
  if (names.length !== 1 || names[0] !== expectedBone) {
    throw new Error(`${reference}: expected exactly data-bone="${expectedBone}"`);
  }
  if (/\bdata-[xy]\s*=/.test(source)) {
    throw new Error(`${reference}: carries a skeleton offset; offsets belong only to the rig`);
  }
}

export function cosmeticReference(reference: string): { pieceId: string; setPath: string } {
  const match = reference.match(/^cosmetics\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\.svg$/);
  if (!match) throw new Error(`invalid cosmetic reference '${reference}'`);
  return { pieceId: match[2], setPath: `cosmetics/${match[1]}/set.json` };
}

export function figurePath(reference: string): string {
  return reference.endsWith(".json") || reference.includes("/") ? reference : `figures/${reference}.json`;
}
