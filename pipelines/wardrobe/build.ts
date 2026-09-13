#!/usr/bin/env node
/**
 * Build independently fetched cosmetics from an authored wardrobe atlas.
 *
 *   node pipelines/wardrobe/build.ts             # rebuild every set
 *   node pipelines/wardrobe/build.ts royal-guard # rebuild one set
 *   node pipelines/wardrobe/build.ts --check     # require byte-identical generated SVGs
 *
 * Atlas islands are read row-major in 128-pixel bands and named by `set.json.islands`.
 * Placement offsets never enter this stage: the generated paths keep atlas-pixel size so the
 * runtime's scale is exactly declared rig height / measured source height.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { cutIsland, renderPaths } from "../sprite/part.ts";
import { decodePng } from "../sprite/png.ts";
import { findIslands } from "../sprite/segment.ts";
import type { Island } from "../sprite/segment.ts";
import { tracePart } from "../sprite/trace.ts";
import type { TraceOptions } from "../sprite/trace.ts";
import type { CosmeticAlign, CosmeticTraceProfile, WardrobeSet } from "./types.ts";
import { validateWardrobeSet } from "./types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const COSMETICS = join(ROOT, "cosmetics");
const ROW_HEIGHT = 128;

export interface BuiltCosmetic {
  readonly id: string;
  readonly width: number;
  readonly height: number;
  readonly svg: string;
  readonly colours: number;
}

export interface RenderedWardrobe {
  readonly set: WardrobeSet;
  readonly pieces: ReadonlyMap<string, BuiltCosmetic>;
}

export function wardrobeIds(): string[] {
  if (!existsSync(COSMETICS)) return [];
  return readdirSync(COSMETICS, { withFileTypes: true })
    .filter((entry) => entry.isDirectory()
      && existsSync(join(COSMETICS, entry.name, "atlas.png"))
      && existsSync(join(COSMETICS, entry.name, "set.json")))
    .map((entry) => entry.name)
    .sort();
}

export function loadWardrobeSet(id: string): WardrobeSet {
  const path = join(COSMETICS, id, "set.json");
  if (!existsSync(path)) throw new Error(`cosmetics/${id}/set.json does not exist`);
  return validateWardrobeSet(JSON.parse(readFileSync(path, "utf8")), `cosmetics/${id}/set.json`);
}

function islandOrder(a: Island, b: Island): number {
  const rowA = Math.floor((a.y + a.h / 2) / ROW_HEIGHT);
  const rowB = Math.floor((b.y + b.h / 2) / ROW_HEIGHT);
  return rowA - rowB || (a.x + a.w / 2) - (b.x + b.w / 2);
}

function optionsFor(profile: CosmeticTraceProfile = {}, pieceId: string): TraceOptions {
  return { ...(profile.default ?? {}), ...(profile.byPiece?.[pieceId] ?? {}) };
}

function originFor(island: Island, align: CosmeticAlign): { x: number; y: number } {
  const y = align === "top" ? 0 : align === "bottom" ? island.h : island.h / 2;
  return { x: island.w / 2, y };
}

function number(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 1000) / 1000);
}

export function toCosmeticSvg(
  id: string,
  island: Island,
  align: CosmeticAlign,
  art: string,
): string {
  const origin = originFor(island, align);
  return `<!-- Generated -->
<svg xmlns="http://www.w3.org/2000/svg" data-cosmetic="${id}" data-width="${island.w}" data-height="${island.h}" viewBox="${number(-origin.x)} ${number(-origin.y)} ${island.w} ${island.h}">${art}</svg>
`;
}

export function renderWardrobe(id: string): RenderedWardrobe {
  const set = loadWardrobeSet(id);
  const atlasPath = join(COSMETICS, id, "atlas.png");
  const atlas = decodePng(atlasPath);
  const { labels, islands } = findIslands(atlas);
  const ordered = [...islands].sort(islandOrder);
  if (ordered.length !== set.islands.length) {
    throw new Error(`${set.name}: atlas has ${ordered.length} islands but set.json names ${set.islands.length}`);
  }

  const pieces = new Map<string, BuiltCosmetic>();
  ordered.forEach((island, index) => {
    const pieceId = set.islands[index];
    const piece = set.pieces[pieceId];
    const align = piece.align ?? "centre";
    const traced = tracePart(
      cutIsland(atlas, labels, island),
      originFor(island, align),
      { ...optionsFor(set.trace, pieceId), scale: 1 },
    );
    pieces.set(pieceId, {
      id: pieceId,
      width: island.w,
      height: island.h,
      svg: toCosmeticSvg(pieceId, island, align, renderPaths(traced.paths)),
      colours: traced.palette.length,
    });
  });
  return { set, pieces };
}

export const outputPath = (setId: string, pieceId: string, outputRoot = COSMETICS): string => (
  join(outputRoot, setId, `${pieceId}.svg`)
);

interface CliReport {
  readonly id: string;
  readonly ok: boolean;
  readonly checked: boolean;
  readonly pieces?: number;
  readonly rawBytes?: number;
  readonly error?: string;
}

function parseTargets(argv: readonly string[]): { check: boolean; json: boolean; outputRoot: string; targets: string[] } {
  const check = argv.includes("--check");
  const json = argv.includes("--json");
  let outputRoot = COSMETICS;
  const targets: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--out") {
      const value = argv[++index];
      if (!value) throw new Error("--out needs a directory");
      outputRoot = resolve(value);
    } else if (!argument.startsWith("--")) targets.push(argument);
  }
  return { check, json, outputRoot, targets: targets.length > 0 ? targets : wardrobeIds() };
}

export function main(argv: readonly string[]): number {
  let parsed: ReturnType<typeof parseTargets>;
  try {
    parsed = parseTargets(argv);
  } catch (error) {
    console.error(`build:cosmetics: ${(error as Error).message}`);
    return 2;
  }
  const reports: CliReport[] = [];
  let failed = false;
  for (const id of parsed.targets) {
    try {
      const rendered = renderWardrobe(id);
      let stale = false;
      let rawBytes = 0;
      for (const [pieceId, piece] of rendered.pieces) {
        const path = outputPath(id, pieceId, parsed.outputRoot);
        rawBytes += Buffer.byteLength(piece.svg);
        if (parsed.check) {
          if (!existsSync(path) || readFileSync(path, "utf8") !== piece.svg) {
            stale = true;
            if (!parsed.json) console.error(`${id}: ${relative(ROOT, path)} is stale — run npm run build:cosmetics`);
          }
        } else {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, piece.svg);
        }
      }
      if (parsed.check) {
        const directory = dirname(outputPath(id, "unused", parsed.outputRoot));
        const expected = new Set([...rendered.pieces.keys()].map((pieceId) => `${pieceId}.svg`));
        const extras = existsSync(directory)
          ? readdirSync(directory).filter((name) => name.endsWith(".svg") && !expected.has(name))
          : [];
        if (extras.length > 0) {
          stale = true;
          if (!parsed.json) console.error(`${id}: remove stale generated cosmetics: ${extras.join(", ")}`);
        }
      }
      failed ||= stale;
      reports.push({ id, ok: !stale, checked: parsed.check, pieces: rendered.pieces.size, rawBytes });
      if (!parsed.json && !stale) console.log(`${id.padEnd(16)} ${rendered.pieces.size} pieces, ${rawBytes} bytes`);
    } catch (error) {
      failed = true;
      const message = (error as Error).message;
      reports.push({ id, ok: false, checked: parsed.check, error: message });
      if (!parsed.json) console.error(`${id}: ${message}`);
    }
  }
  if (parsed.json) console.log(JSON.stringify({ ok: !failed, checked: parsed.check, wardrobes: reports }, null, 2));
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}

