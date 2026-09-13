#!/usr/bin/env node
/**
 * check:footprint — C7's byte ratchet for every shipped part, figure and clip catalog.
 *
 *   node pipelines/guards/footprint.ts          # fail if anything grew
 *   node pipelines/guards/footprint.ts --write  # accept today's measurements as the baseline
 *   node pipelines/guards/footprint.ts --json   # machine-readable report
 *
 * The baseline is evidence, not a budget. Shrinking passes; growth is accepted only by
 * committing a newly written baseline, where the increase is visible in review.
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

import { validateRig } from "../../src/rig/contract.ts";
import type { Rig } from "../../src/rig/types.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const FIGURES = join(ROOT, "figures");
const CHARACTERS = join(ROOT, "characters");
const COSMETICS = join(ROOT, "cosmetics");
const CLIPS = join(ROOT, "src", "clips", "generated");
const RIGS = join(ROOT, "rigs");
const DIST = join(ROOT, "dist");
const BASELINE = join(RIGS, "footprint.baseline.json");

export interface Size {
  readonly raw: number;
  readonly gzip: number;
}

export interface FootprintMeasurements {
  readonly contract: 1;
  readonly parts: Readonly<Record<string, Size>>;
  readonly cosmetics?: Readonly<Record<string, Size>>;
  readonly figures: Readonly<Record<string, Size>>;
  readonly catalogs?: Readonly<Record<string, Size>>;
  readonly shells?: Readonly<Record<string, Size>>;
}

export interface FigureManifest {
  readonly contract: number;
  readonly name: string;
  readonly rig: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly cosmetics?: readonly string[];
}

export interface Growth {
  readonly kind: "new" | "raw" | "gzip" | "missing";
  readonly path: string;
  readonly previous?: number;
  readonly current?: number;
}

const portable = (path: string): string => relative(ROOT, path).split(sep).join("/");

function bytes(path: string): Size {
  const data = readFileSync(path);
  return { raw: data.byteLength, gzip: gzipSync(data, { level: 9 }).byteLength };
}

function jsonFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".json")).sort()
    .map((name) => join(directory, name));
}

function typescriptFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory).filter((name) => name.endsWith(".ts")).sort()
    .map((name) => join(directory, name));
}

function shellChunks(): Readonly<Record<string, Size>> {
  const directory = join(DIST, "assets");
  if (!existsSync(directory)) throw new Error("dist/assets is missing — run npm run build before check:footprint");
  return Object.fromEntries(readdirSync(directory).filter((name) => name.endsWith(".js")).sort().map((name) => {
    const logical = name.replace(/-[A-Za-z0-9_-]{8,}\.js$/, ".js");
    return [`dist/assets/${logical}`, bytes(join(directory, name))];
  }));
}

function svgFiles(directory: string): string[] {
  const files: string[] = [];
  if (!existsSync(directory)) return files;
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => (
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0
  ))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...svgFiles(path));
    else if (entry.isFile() && entry.name.endsWith(".svg")) files.push(path);
  }
  return files;
}

function rigFor(id: string): Rig {
  const path = join(RIGS, `${id}.rig.json`);
  if (!existsSync(path)) throw new Error(`figure names unknown rig '${id}'; expected rigs/${id}.rig.json`);
  return validateRig(JSON.parse(readFileSync(path, "utf8")));
}

export function readFigure(path: string): FigureManifest {
  const figurePath = resolve(ROOT, path);
  const raw = JSON.parse(readFileSync(figurePath, "utf8")) as unknown;
  if (typeof raw !== "object" || raw === null) throw new Error(`${portable(figurePath)} is not an object`);
  const figure = raw as FigureManifest;
  if (figure.contract !== 1) throw new Error(`${portable(figurePath)} has unsupported contract ${figure.contract}`);
  if (typeof figure.name !== "string" || !figure.name) throw new Error(`${portable(figurePath)} has no name`);
  if (typeof figure.rig !== "string" || !figure.rig) throw new Error(`${portable(figurePath)} has no rig`);
  if (typeof figure.parts !== "object" || figure.parts === null || Array.isArray(figure.parts)) {
    throw new Error(`${portable(figurePath)} has no parts map`);
  }

  const rig = rigFor(figure.rig);
  const expected = rig.bones.map((bone) => bone.slot).sort();
  const actual = Object.keys(figure.parts).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${portable(figurePath)} parts are not the slots in rigs/${figure.rig}.rig.json`);
  }
  const boneForSlot = new Map(rig.bones.map((bone) => [bone.slot, bone.name]));
  for (const [slot, reference] of Object.entries(figure.parts)) {
    if (typeof reference !== "string" || !reference.endsWith(`/${slot}.svg`)) {
      throw new Error(`${portable(figurePath)} slot '${slot}' has invalid part reference '${String(reference)}'`);
    }
    const partPath = resolve(ROOT, reference);
    if (!partPath.startsWith(`${ROOT}${sep}`) || !existsSync(partPath)) {
      throw new Error(`${portable(figurePath)} slot '${slot}' cannot read '${reference}'`);
    }
    const source = readFileSync(partPath, "utf8");
    const bones = [...source.matchAll(/\bdata-bone="([a-z-]+)"/g)].map((match) => match[1]);
    if (bones.length !== 1 || bones[0] !== boneForSlot.get(slot)) {
      throw new Error(`${portable(figurePath)} slot '${slot}' needs data-bone="${boneForSlot.get(slot)}" in '${reference}'`);
    }
    if (/\bdata-[xy]=/.test(source)) {
      throw new Error(`${reference} carries a skeleton offset; offsets belong only to the rig`);
    }
  }
  return figure;
}

/** Measure generated files individually, then a figure as the sum of the parts it asks the renderer to fetch. */
export function measureFootprint(): FootprintMeasurements {
  const parts = Object.fromEntries(svgFiles(CHARACTERS).map((path) => [portable(path), bytes(path)]));
  const cosmetics = Object.fromEntries(svgFiles(COSMETICS).map((path) => [portable(path), bytes(path)]));
  const catalogs = Object.fromEntries(typescriptFiles(CLIPS).map((path) => [portable(path), bytes(path)]));
  const figures: Record<string, Size> = {};
  for (const path of jsonFiles(FIGURES)) {
    const figure = readFigure(path);
    let raw = 0;
    let gzip = 0;
    for (const reference of Object.values(figure.parts)) {
      const size = bytes(resolve(ROOT, reference));
      raw += size.raw;
      gzip += size.gzip;
    }
    for (const reference of figure.cosmetics ?? []) {
      const size = bytes(resolve(ROOT, reference));
      raw += size.raw;
      gzip += size.gzip;
    }
    figures[portable(path)] = { raw, gzip };
  }
  return { contract: 1, parts, cosmetics, figures, catalogs, shells: shellChunks() };
}

function compareSection(
  section: "parts" | "cosmetics" | "figures" | "catalogs" | "shells",
  actual: Readonly<Record<string, Size>>,
  baseline: Readonly<Record<string, Size>>,
): Growth[] {
  const growth: Growth[] = [];
  for (const path of Object.keys(actual).sort()) {
    const current = actual[path];
    const previous = baseline[path];
    if (!previous) {
      growth.push({ kind: "new", path: `${section}.${path}` });
      continue;
    }
    if (current.raw > previous.raw) growth.push({ kind: "raw", path: `${section}.${path}`, previous: previous.raw, current: current.raw });
    if (current.gzip > previous.gzip) growth.push({ kind: "gzip", path: `${section}.${path}`, previous: previous.gzip, current: current.gzip });
  }
  for (const path of Object.keys(baseline).sort()) {
    if (!actual[path]) growth.push({ kind: "missing", path: `${section}.${path}` });
  }
  return growth;
}

export function compareFootprint(
  actual: FootprintMeasurements,
  baseline: FootprintMeasurements,
): Growth[] {
  return [
    ...compareSection("parts", actual.parts, baseline.parts ?? {}),
    ...compareSection("cosmetics", actual.cosmetics ?? {}, baseline.cosmetics ?? {}),
    ...compareSection("figures", actual.figures, baseline.figures ?? {}),
    ...compareSection("catalogs", actual.catalogs ?? {}, baseline.catalogs ?? {}),
    ...compareSection("shells", actual.shells ?? {}, baseline.shells ?? {}),
  ];
}

/** The absolute half of C7 remains a gate even while the numeric baseline grows by milestone. */
export function checkInvariants(): string[] {
  const failures: string[] = [];
  const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  if (packageJson.dependencies && Object.keys(packageJson.dependencies).length > 0) {
    failures.push("package.json has runtime dependencies; C7 requires zero");
  }
  for (const path of [...svgFiles(CHARACTERS), ...svgFiles(COSMETICS)]) {
    const source = readFileSync(path, "utf8");
    if (/<image\b|data:image|\.png\b/i.test(source)) failures.push(`${portable(path)} contains raster art`);
  }
  const srcRoot = join(ROOT, "src");
  const sourceFiles = (directory: string): string[] => {
    if (!existsSync(directory)) return [];
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? sourceFiles(path) : /\.(?:ts|tsx|js|css|html)$/.test(entry.name) ? [path] : [];
    });
  };
  for (const path of sourceFiles(srcRoot)) {
    const source = readFileSync(path, "utf8");
    if (/\?raw["']|data:image|\.png["')]/i.test(source)) failures.push(`${portable(path)} inlines or references raster art`);
  }
  const builtFiles = (directory: string): string[] => !existsSync(directory) ? [] : readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? builtFiles(path) : [path];
  });
  for (const path of builtFiles(DIST)) {
    if (/\.(?:png|jpe?g|gif|webp|bmp|avif|ico)$/i.test(path)) failures.push(`${portable(path)} is raster shipped to the page`);
    if (path.endsWith(".js")) {
      const source = readFileSync(path, "utf8");
      if (/data:image|<svg[^>]+data-bone=|\?raw/i.test(source)) failures.push(`${portable(path)} inlines art into a shell chunk`);
    }
  }
  return failures;
}

function readBaseline(): FootprintMeasurements {
  if (!existsSync(BASELINE)) {
    throw new Error("no rigs/footprint.baseline.json — run npm run check:footprint -- --write and review it");
  }
  const value = JSON.parse(readFileSync(BASELINE, "utf8")) as FootprintMeasurements;
  if (value.contract !== 1) throw new Error(`unsupported footprint baseline contract ${value.contract}`);
  return value;
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  const write = argv.includes("--write");
  try {
    const measurements = measureFootprint();
    const invariants = checkInvariants();
    if (write) {
      const previous = existsSync(BASELINE)
        ? JSON.parse(readFileSync(BASELINE, "utf8")) as Record<string, unknown>
        : {};
      writeFileSync(BASELINE, `${JSON.stringify({ ...previous, ...measurements }, null, 2)}\n`);
    }
    const growth = write ? [] : compareFootprint(measurements, readBaseline());
    const ok = invariants.length === 0 && growth.length === 0;

    if (asJson) {
      console.log(JSON.stringify({ ok, wrote: write, measurements, invariants, growth }, null, 2));
    } else {
      for (const [path, size] of Object.entries(measurements.figures)) {
        console.log(`${path.padEnd(24)} ${String(size.raw).padStart(7)} raw  ${String(size.gzip).padStart(6)} gzip`);
      }
      for (const [path, size] of Object.entries(measurements.catalogs ?? {})) {
        console.log(`${path.padEnd(46)} ${String(size.raw).padStart(7)} raw  ${String(size.gzip).padStart(6)} gzip`);
      }
      for (const [path, size] of Object.entries(measurements.shells ?? {})) {
        console.log(`${path.padEnd(46)} ${String(size.raw).padStart(7)} raw  ${String(size.gzip).padStart(6)} gzip`);
      }
      for (const failure of invariants) console.error(`check:footprint: ${failure}`);
      for (const item of growth) {
        if (item.kind === "new" || item.kind === "missing") {
          console.error(`check:footprint: ${item.path} is ${item.kind} in the baseline — run npm run check:footprint -- --write and review it`);
        } else {
          console.error(`check:footprint: ${item.path} ${item.kind} grew ${item.previous} -> ${item.current}; `
            + "accept only by writing and committing the new baseline");
        }
      }
      if (write) console.log(`check:footprint: wrote ${portable(BASELINE)}`);
      else if (ok) console.log(`check:footprint: ${Object.keys(measurements.parts).length} parts, `
        + `${Object.keys(measurements.cosmetics ?? {}).length} cosmetics, `
        + `${Object.keys(measurements.figures).length} figures, ${Object.keys(measurements.catalogs ?? {}).length} catalogs and `
        + `${Object.keys(measurements.shells ?? {}).length} shell chunks did not grow`);
    }
    return ok ? 0 : 1;
  } catch (error) {
    if (asJson) console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
    else console.error(`check:footprint: ${(error as Error).message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
