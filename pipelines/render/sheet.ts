import { existsSync, readFileSync } from "node:fs";
import { basename, isAbsolute, join, relative, resolve, sep } from "node:path";

import type { Pose } from "../../src/clips/types.ts";
import { cosmeticReference, figurePath, inspectPart, validateFigure } from "../../src/render/manifest.ts";
import type { FigureManifest } from "../../src/render/manifest.ts";
import { inspectCosmetic, placementTransform, resolveCosmeticPlacements, validateWardrobeSet } from "../../src/render/wardrobe.ts";
import type { CosmeticPiece, CosmeticPlacement, WardrobeSet } from "../../src/render/wardrobe.ts";
import { validateRig } from "../../src/rig/contract.ts";
import { forwardKinematics } from "../../src/rig/fk.ts";
import type { Rig } from "../../src/rig/types.ts";
import { visualPaintOrder } from "./depth.ts";
import { validateAuthoredFigure } from "./manifest.ts";

export interface LoadedPart {
  readonly bone: string;
  readonly slot: string;
  readonly reference: string;
  readonly contents: string;
}

export interface LoadedCosmetic {
  readonly reference: string;
  readonly piece: CosmeticPiece;
  readonly placements: readonly CosmeticPlacement[];
  readonly contents: string;
}

export interface LoadedFigure {
  readonly id: string;
  readonly path: string;
  readonly manifest: FigureManifest;
  readonly rig: Rig;
  readonly parts: ReadonlyMap<string, LoadedPart>;
  readonly cosmetics: readonly LoadedCosmetic[];
}

export interface SheetCell {
  readonly label: string;
  readonly pose: Pose;
  readonly profile: string;
  readonly facing?: -1 | 1;
  readonly parts?: ReadonlySet<string>;
  readonly cosmetics?: ReadonlySet<string>;
}

export interface AssembledBone {
  readonly bone: string;
  readonly slot: string;
  readonly layers: ReadonlyMap<string, string>;
}

function portable(root: string, path: string): string {
  const result = relative(root, path).split(sep).join("/");
  return result.startsWith("../") ? path : result;
}

function assetPath(root: string, reference: string): string {
  const path = resolve(root, reference);
  if (!path.startsWith(`${resolve(root)}${sep}`) || !existsSync(path)) throw new Error(`cannot read '${reference}'`);
  return path;
}

function readAsset(root: string, reference: string): string {
  return readFileSync(assetPath(root, reference), "utf8");
}

function svgContents(source: string, reference: string): string {
  const match = source.match(/<svg\b[^>]*>([\s\S]*)<\/svg>\s*$/);
  if (!match) throw new Error(`${reference}: is not a complete SVG document`);
  return match[1];
}

export function loadFigure(root: string, requested: string, additionalCosmetics: readonly string[] = []): LoadedFigure {
  const candidate = figurePath(requested);
  const path = isAbsolute(candidate) ? candidate : resolve(root, candidate);
  if (!existsSync(path)) throw new Error(`figure manifest '${portable(root, path)}' does not exist`);
  const id = basename(path, ".json");
  const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
  const base = validateFigure(raw, portable(root, path));
  const rigReference = `rigs/${base.rig}.rig.json`;
  const rig = validateRig(JSON.parse(readAsset(root, rigReference)) as unknown);
  const manifest = validateAuthoredFigure(raw, portable(root, path), rig);

  const parts = new Map<string, LoadedPart>();
  for (const bone of rig.bones) {
    const reference = manifest.parts[bone.slot];
    const source = readAsset(root, reference);
    inspectPart(source, bone.name, reference);
    parts.set(bone.name, { bone: bone.name, slot: bone.slot, reference, contents: svgContents(source, reference) });
  }

  const sets = new Map<string, WardrobeSet>();
  const cosmeticReferences = [...manifest.cosmetics, ...additionalCosmetics];
  if (new Set(cosmeticReferences).size !== cosmeticReferences.length) {
    throw new Error(`${portable(root, path)} repeats a requested cosmetic`);
  }
  const cosmetics = cosmeticReferences.map((reference): LoadedCosmetic => {
    const { pieceId, setPath } = cosmeticReference(reference);
    let set = sets.get(setPath);
    if (!set) {
      set = validateWardrobeSet(JSON.parse(readAsset(root, setPath)) as unknown, setPath);
      sets.set(setPath, set);
    }
    if (set.rig !== rig.contract.id) throw new Error(`${setPath}: targets rig '${set.rig}', not '${rig.contract.id}'`);
    const piece = set.pieces[pieceId];
    if (!piece) throw new Error(`${reference}: is not declared in ${setPath}`);
    if (piece.fitted && !piece.fitted.includes(id)) throw new Error(`${reference}: is not fitted for figure '${id}'`);
    const source = readAsset(root, reference);
    const asset = inspectCosmetic(source, pieceId, reference);
    return {
      reference,
      piece,
      placements: resolveCosmeticPlacements(rig, set, pieceId, asset.height),
      contents: svgContents(source, reference),
    };
  });
  return { id, path, manifest, rig, parts, cosmetics };
}

function number(value: number): string {
  const rounded = Math.abs(value) < 0.0005 ? 0 : Math.round(value * 1000) / 1000;
  return String(rounded);
}

function xml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export function assembleFigureBones(
  figure: LoadedFigure,
  parts?: ReadonlySet<string>,
  cosmetics?: ReadonlySet<string>,
): ReadonlyMap<string, AssembledBone> {
  const activeCosmetics = figure.cosmetics.filter((cosmetic) => cosmetics?.has(cosmetic.reference) ?? true);
  const hidden = new Set(activeCosmetics.flatMap((cosmetic) => cosmetic.piece.hides ?? []));
  const cosmeticsByBone = new Map<string, Array<{ cosmetic: LoadedCosmetic; placement: CosmeticPlacement }>>();
  for (const cosmetic of activeCosmetics) {
    for (const placement of cosmetic.placements) {
      const entries = cosmeticsByBone.get(placement.bone) ?? [];
      entries.push({ cosmetic, placement });
      cosmeticsByBone.set(placement.bone, entries);
    }
  }

  return new Map(figure.rig.bones.map((bone) => {
    const entries = cosmeticsByBone.get(bone.name) ?? [];
    const layers = new Map(figure.rig.contract.depthSlots.map((layer) => {
      const contents: string[] = [];
      for (const { cosmetic, placement } of entries.filter((entry) => entry.placement.layer === layer)) {
        contents.push(`<g data-cosmetic="${xml(cosmetic.reference)}" transform="${placementTransform(placement)}">${cosmetic.contents}</g>`);
      }
      if (layer === "part" && !hidden.has(bone.slot) && (parts?.has(bone.slot) ?? true)) {
        contents.push(figure.parts.get(bone.name)!.contents);
      }
      return [layer, contents.join("")] as const;
    }));
    return [bone.name, { bone: bone.name, slot: bone.slot, layers }] as const;
  }));
}

function figureGroup(figure: LoadedFigure, cell: SheetCell): string {
  const placed = forwardKinematics(figure.rig, cell.pose);
  const assembly = assembleFigureBones(figure, cell.parts, cell.cosmetics);
  const facing = cell.facing ?? 1;

  const bones = visualPaintOrder(figure.rig, facing, cell.profile).map((boneName) => {
    const world = placed.get(boneName)!;
    const rotation = world.rotation * 180 / Math.PI;
    const layers = [...assembly.get(boneName)!.layers].map(([layer, contents]) =>
      `<g data-depth="${layer}">${contents}</g>`).join("");
    return `<g data-bone="${boneName}" transform="translate(${number(world.x)} ${number(world.y)}) rotate(${number(rotation)})">${layers}</g>`;
  }).join("");
  return facing === -1 ? `<g transform="scale(-1 1)">${bones}</g>` : bones;
}

/** A deterministic vector sheet: labels and source art stay searchable in the output. */
export function renderSheet(
  figure: LoadedFigure,
  title: string,
  subtitle: string,
  columns: number,
  cells: readonly SheetCell[],
): string {
  const [viewX, viewY, viewWidth, viewHeight] = figure.rig.contract.space.viewBox;
  const padding = 10;
  const labelHeight = 22;
  const headerHeight = 44;
  const cellWidth = viewWidth + padding * 2;
  const cellHeight = viewHeight + padding * 2 + labelHeight;
  const rows = Math.ceil(cells.length / columns);
  const width = columns * cellWidth;
  const height = headerHeight + rows * cellHeight;
  const panels = cells.map((cell, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * cellWidth;
    const y = headerHeight + row * cellHeight;
    const artX = padding - viewX;
    const artY = labelHeight + padding - viewY;
    return `<g class="cell" transform="translate(${number(x)} ${number(y)})"><rect x="4" y="4" width="${number(cellWidth - 8)}" height="${number(cellHeight - 8)}" rx="5"/><text x="${padding}" y="17">${xml(cell.label)}</text><g class="figure" transform="translate(${number(artX)} ${number(artY)})">${figureGroup(figure, cell)}</g></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(width)}" height="${number(height)}" viewBox="0 0 ${number(width)} ${number(height)}"><title>${xml(title)}</title><desc>${xml(subtitle)}</desc><style>svg{background:#e8e9ed;color:#20232a;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.cell rect{fill:#fff;stroke:#c5c8d0}.cell text{fill:#20232a;font-size:10px}.sheet-title{font-size:16px;font-weight:700}.sheet-subtitle{font-size:10px;fill:#5e6470}</style><rect width="100%" height="100%" fill="#e8e9ed"/><text class="sheet-title" x="10" y="19">${xml(title)}</text><text class="sheet-subtitle" x="10" y="35">${xml(subtitle)}</text>${panels}</svg>\n`;
}

export function sampleTicks(from: number, to: number, requested: number): readonly number[] {
  const count = Math.min(requested, to - from + 1);
  if (count === 1) return [from];
  const ticks = Array.from({ length: count }, (_, index) => Math.round(from + index * (to - from) / (count - 1)));
  return [...new Set(ticks)];
}

export function outputPath(root: string, requested: string | null, fallback: string): string {
  const path = requested === null ? join(root, "out", "render", fallback)
    : isAbsolute(requested) ? requested : resolve(root, requested);
  const out = join(resolve(root), "out");
  if (path !== out && !path.startsWith(`${out}${sep}`)) throw new Error("sheet output must be inside out/");
  return path;
}

export function outputDelta(root: string, path: string, contents: string): {
  readonly output: string;
  readonly bytes: number;
  readonly previousBytes: number;
  readonly byteDelta: number;
  readonly changed: boolean;
} {
  const previous = existsSync(path) ? readFileSync(path, "utf8") : "";
  const bytes = Buffer.byteLength(contents);
  const previousBytes = Buffer.byteLength(previous);
  return { output: portable(root, path), bytes, previousBytes, byteDelta: bytes - previousBytes, changed: previous !== contents };
}
