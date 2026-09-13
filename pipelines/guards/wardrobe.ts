#!/usr/bin/env node
/** check:wardrobe — authored rules, fitted coverage, and honest `hides` extents. */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRig } from "../../src/rig/contract.ts";
import type { Point, Rig } from "../../src/rig/types.ts";
import { inspectCosmetic, resolveCosmeticPlacements, validateWardrobeSet } from "../../src/render/wardrobe.ts";
import type { CosmeticPlacement, WardrobeSet } from "../../src/render/wardrobe.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface WardrobeFigure {
  readonly contract: number;
  readonly name: string;
  readonly rig: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly cosmetics?: readonly string[];
}

export interface PieceReport {
  readonly piece: string;
  readonly kind: string;
  readonly fitted: readonly string[];
  readonly hides: readonly string[];
}

export interface Bounds {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

type Matrix = readonly [number, number, number, number, number, number];
type AssetReader = (reference: string) => string;

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5],
  ];
}

function apply(matrix: Matrix, point: Point): Point {
  return [
    matrix[0] * point[0] + matrix[2] * point[1] + matrix[4],
    matrix[1] * point[0] + matrix[3] * point[1] + matrix[5],
  ];
}

function transformAttribute(value: string | undefined): Matrix {
  if (!value) return IDENTITY;
  let matrix = IDENTITY;
  const matches = [...value.matchAll(/(translate|scale|rotate)\s*\(([^)]*)\)/g)];
  if (matches.map((match) => match[0]).join("").replace(/\s+/g, "") !== value.replace(/[,\s]+/g, "")) {
    throw new Error(`unsupported SVG transform '${value}'`);
  }
  for (const match of matches) {
    const values = match[2].split(/[\s,]+/).filter(Boolean).map(Number);
    if (values.some((entry) => !Number.isFinite(entry))) throw new Error(`invalid SVG transform '${value}'`);
    let next: Matrix;
    if (match[1] === "translate") next = [1, 0, 0, 1, values[0] ?? 0, values[1] ?? 0];
    else if (match[1] === "scale") next = [values[0], 0, 0, values[1] ?? values[0], 0, 0];
    else {
      const radians = (values[0] ?? 0) * Math.PI / 180;
      const rotation: Matrix = [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0];
      if (values.length >= 3) {
        const [cx, cy] = values.slice(1);
        next = multiply(multiply([1, 0, 0, 1, cx, cy], rotation), [1, 0, 0, 1, -cx, -cy]);
      } else next = rotation;
    }
    matrix = multiply(matrix, next);
  }
  return matrix;
}

class MutableBounds {
  x0 = Infinity;
  y0 = Infinity;
  x1 = -Infinity;
  y1 = -Infinity;

  add(point: Point): void {
    this.x0 = Math.min(this.x0, point[0]); this.y0 = Math.min(this.y0, point[1]);
    this.x1 = Math.max(this.x1, point[0]); this.y1 = Math.max(this.y1, point[1]);
  }

  value(reference: string): Bounds {
    if (!Number.isFinite(this.x0)) throw new Error(`${reference}: has no drawn paths`);
    return { x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 };
  }
}

function quadratic(bounds: MutableBounds, matrix: Matrix, from: Point, control: Point, to: Point): void {
  const [start, guide, end] = [from, control, to].map((point) => apply(matrix, point));
  bounds.add(start); bounds.add(end);
  for (let axis = 0; axis < 2; axis++) {
    const denominator = start[axis] - 2 * guide[axis] + end[axis];
    if (Math.abs(denominator) < 1e-12) continue;
    const t = (start[axis] - guide[axis]) / denominator;
    if (t <= 0 || t >= 1) continue;
    const value = (1 - t) ** 2 * start[axis] + 2 * (1 - t) * t * guide[axis] + t ** 2 * end[axis];
    const paired = axis === 0
      ? (1 - t) ** 2 * start[1] + 2 * (1 - t) * t * guide[1] + t ** 2 * end[1]
      : (1 - t) ** 2 * start[0] + 2 * (1 - t) * t * guide[0] + t ** 2 * end[0];
    bounds.add(axis === 0 ? [value, paired] : [paired, value]);
  }
}

function pathBounds(path: string, matrix: Matrix, bounds: MutableBounds, reference: string): void {
  const tokens = path.match(/[MLQHVZmlqhvyz]|[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/g) ?? [];
  let index = 0;
  let command = "";
  let current: Point = [0, 0];
  let start: Point = [0, 0];
  const number = (): number => {
    const value = Number(tokens[index++]);
    if (!Number.isFinite(value)) throw new Error(`${reference}: malformed path data`);
    return value;
  };
  while (index < tokens.length) {
    if (/^[A-Za-z]$/.test(tokens[index])) command = tokens[index++];
    if (!command || command !== command.toUpperCase() || !"MLQHVZ".includes(command)) {
      throw new Error(`${reference}: unsupported path command '${command || tokens[index - 1]}'`);
    }
    if (command === "Z") { current = start; command = ""; continue; }
    if (command === "H") current = [number(), current[1]];
    else if (command === "V") current = [current[0], number()];
    else if (command === "M" || command === "L") {
      current = [number(), number()];
      if (command === "M") { start = current; command = "L"; }
    } else {
      const guide: Point = [number(), number()];
      const target: Point = [number(), number()];
      quadratic(bounds, matrix, current, guide, target);
      current = target;
      continue;
    }
    bounds.add(apply(matrix, current));
  }
}

/** Exact for the M/L/H/V/Q dialect emitted by the tracer and used by the restored fighter. */
export function drawnBounds(source: string, reference: string, rootMatrix: Matrix = IDENTITY): Bounds {
  const bounds = new MutableBounds();
  const stack: Matrix[] = [rootMatrix];
  for (const match of source.matchAll(/<\/g\s*>|<g\b[^>]*>|<path\b[^>]*>/g)) {
    const tag = match[0];
    if (tag.startsWith("</g")) {
      if (stack.length === 1) throw new Error(`${reference}: invalid SVG group nesting`);
      stack.pop();
    } else if (tag.startsWith("<g")) {
      const transform = tag.match(/\btransform\s*=\s*["']([^"']*)["']/)?.[1];
      stack.push(multiply(stack[stack.length - 1], transformAttribute(transform)));
    } else {
      const path = tag.match(/\bd\s*=\s*["']([^"']+)["']/)?.[1];
      if (path) pathBounds(path, stack[stack.length - 1], bounds, reference);
    }
  }
  return bounds.value(reference);
}

function boneOrigin(rig: Rig, boneName: string): Point {
  const bone = rig.byName.get(boneName);
  if (!bone) throw new Error(`rig has no bone '${boneName}'`);
  if (bone.parent === null) return bone.offset;
  const parent = boneOrigin(rig, bone.parent);
  return [parent[0] + bone.offset[0], parent[1] + bone.offset[1]];
}

function matrixForPlacement(rig: Rig, placement: CosmeticPlacement): Matrix {
  const origin = boneOrigin(rig, placement.bone);
  const radians = placement.rotate * Math.PI / 180;
  const horizontal = placement.mirrored ? -placement.scale : placement.scale;
  return multiply(
    [1, 0, 0, 1, origin[0] + placement.point[0], origin[1] + placement.point[1]],
    multiply(
      [Math.cos(radians), Math.sin(radians), -Math.sin(radians), Math.cos(radians), 0, 0],
      [horizontal, 0, 0, placement.scale, 0, 0],
    ),
  );
}

function contains(cover: Bounds, hidden: Bounds): boolean {
  const tolerance = 0.01;
  return cover.x0 <= hidden.x0 + tolerance && cover.y0 <= hidden.y0 + tolerance
    && cover.x1 >= hidden.x1 - tolerance && cover.y1 >= hidden.y1 - tolerance;
}

export function validateWardrobe(
  setId: string,
  set: WardrobeSet,
  rig: Rig,
  figures: Readonly<Record<string, WardrobeFigure>>,
  readAsset: AssetReader,
): readonly PieceReport[] {
  if (set.rig !== rig.contract.id) throw new Error(`cosmetics/${setId}/set.json targets rig '${set.rig}', not '${rig.contract.id}'`);
  const allFigures = Object.keys(figures).filter((id) => figures[id].rig === set.rig).sort();
  const reports: PieceReport[] = [];
  for (const [pieceId, piece] of Object.entries(set.pieces)) {
    const reference = `cosmetics/${setId}/${pieceId}.svg`;
    const source = readAsset(reference);
    const asset = inspectCosmetic(source, pieceId, reference);
    const placements = resolveCosmeticPlacements(rig, set, pieceId, asset.height);
    const fitted = piece.fitted ? [...piece.fitted].sort() : allFigures;
    for (const figureId of fitted) {
      const figure = figures[figureId];
      if (!figure) throw new Error(`${set.name}/${pieceId}: fitted names unknown figure '${figureId}'`);
      if (figure.rig !== set.rig) throw new Error(`${set.name}/${pieceId}: fitted figure '${figureId}' uses rig '${figure.rig}'`);
      for (const slot of piece.hides ?? []) {
        const partReference = figure.parts[slot];
        if (!partReference) throw new Error(`${set.name}/${pieceId}: hides names slot '${slot}', which figure '${figureId}' does not have`);
        const hiddenBone = rig.bones.find((bone) => bone.slot === slot)!;
        const hiddenOrigin = boneOrigin(rig, hiddenBone.name);
        const hidden = drawnBounds(readAsset(partReference), partReference, [1, 0, 0, 1, hiddenOrigin[0], hiddenOrigin[1]]);
        const covered = placements.some((placement) => contains(
          drawnBounds(source, reference, matrixForPlacement(rig, placement)),
          hidden,
        ));
        if (!covered) throw new Error(`${set.name}/${pieceId}: drawn extent does not cover '${slot}' on figure '${figureId}'`);
      }
    }
    reports.push({ piece: pieceId, kind: piece.kind, fitted, hides: piece.hides ?? [] });
  }
  return reports;
}

function jsonFiles(directory: string): string[] {
  return readdirSync(directory).filter((name) => name.endsWith(".json")).sort();
}

function diskReader(reference: string): string {
  const path = resolve(ROOT, reference);
  if (!path.startsWith(`${ROOT}${sep}`) || !existsSync(path)) throw new Error(`cannot read '${reference}'`);
  return readFileSync(path, "utf8");
}

export function checkWardrobes(root = ROOT): Readonly<Record<string, readonly PieceReport[]>> {
  const figures = Object.fromEntries(jsonFiles(join(root, "figures")).map((file) => {
    const path = join(root, "figures", file);
    return [basename(file, ".json"), JSON.parse(readFileSync(path, "utf8")) as WardrobeFigure];
  }));
  const sets: Record<string, WardrobeSet> = {};
  const rigs: Record<string, Rig> = {};
  const reports: Record<string, readonly PieceReport[]> = {};
  const directory = join(root, "cosmetics");
  const reader = root === ROOT ? diskReader : (reference: string): string => {
    const path = resolve(root, reference);
    if (!path.startsWith(`${resolve(root)}${sep}`) || !existsSync(path)) throw new Error(`cannot read '${reference}'`);
    return readFileSync(path, "utf8");
  };
  for (const entry of readdirSync(directory, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name, "set.json");
    if (!existsSync(path)) continue;
    const set = validateWardrobeSet(JSON.parse(readFileSync(path, "utf8")), `cosmetics/${entry.name}/set.json`);
    sets[entry.name] = set;
    const rig = rigs[set.rig] ??= validateRig(JSON.parse(readFileSync(join(root, "rigs", `${set.rig}.rig.json`), "utf8")));
    reports[entry.name] = validateWardrobe(entry.name, set, rig, figures, reader);
  }
  if (Object.keys(sets).length === 0) throw new Error("no cosmetics/<set>/set.json wardrobes found");

  const loadouts = new Map<string, string>();
  for (const [figureId, figure] of Object.entries(figures)) {
    if (!Array.isArray(figure.cosmetics)) throw new Error(`figures/${figureId}.json has no cosmetics list`);
    for (const reference of figure.cosmetics) {
      const match = reference.match(/^cosmetics\/([a-z][a-z0-9-]*)\/([a-z][a-z0-9-]*)\.svg$/);
      if (!match) throw new Error(`figures/${figureId}.json has invalid cosmetic reference '${reference}'`);
      const [, setId, pieceId] = match;
      const piece = sets[setId]?.pieces[pieceId];
      if (!piece) throw new Error(`figures/${figureId}.json names unknown cosmetic '${reference}'`);
      if (piece.fitted && !piece.fitted.includes(figureId)) {
        throw new Error(`figures/${figureId}.json wears '${reference}', but the piece is not fitted for it`);
      }
    }
    const signature = [...figure.cosmetics].sort().join("\n");
    const duplicate = loadouts.get(signature);
    if (duplicate) throw new Error(`figures/${duplicate}.json and figures/${figureId}.json wear the same cosmetic loadout`);
    loadouts.set(signature, figureId);
  }
  return reports;
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  try {
    const reports = checkWardrobes();
    if (asJson) console.log(JSON.stringify({ ok: true, wardrobes: reports }, null, 2));
    else {
      for (const [setId, pieces] of Object.entries(reports)) {
        for (const piece of pieces) console.log(`${setId}/${piece.piece}  ${piece.kind}  fitted: ${piece.fitted.join(", ")}`
          + (piece.hides.length > 0 ? `  hides: ${piece.hides.join(", ")}` : ""));
      }
      const pieces = Object.values(reports).flat();
      const hides = pieces.reduce((sum, piece) => sum + piece.hides.length, 0);
      console.log(`check:wardrobe: ${Object.keys(reports).length} wardrobes, ${pieces.length} pieces, ${hides} live hide${hides === 1 ? "" : "s"}`);
    }
    return 0;
  } catch (error) {
    if (asJson) console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
    else console.error(`check:wardrobe: ${(error as Error).message}`);
    return 1;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
