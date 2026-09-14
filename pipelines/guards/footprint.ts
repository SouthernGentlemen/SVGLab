#!/usr/bin/env node
/**
 * check:footprint — C7's byte ratchet for what this lab actually ships to a page.
 *
 *   node pipelines/guards/footprint.ts          # fail if anything grew
 *   node pipelines/guards/footprint.ts --write  # accept today's measurements as the baseline
 *   node pipelines/guards/footprint.ts --json   # machine-readable report
 *
 * The baseline is evidence, not a budget. Shrinking passes; growth is accepted only by
 * committing a newly written baseline, where the increase is visible in review.
 *
 * What the art weighs is Boneyard's ratchet, against Boneyard's own baseline. This one measures
 * the shell chunks and the clip modules baked out of Boneyard's catalog — the two things a
 * change here can actually make heavier.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CLIPS = join(ROOT, "src", "clips", "generated");
const DIST = join(ROOT, "dist");
const BASELINE = join(ROOT, "pipelines", "guards", "footprint.baseline.json");
export interface Size {
  readonly raw: number;
  readonly gzip: number;
}
export interface FootprintMeasurements {
  readonly contract: 1;
  readonly catalogs: Readonly<Record<string, Size>>;
  readonly shells: Readonly<Record<string, Size>>;
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
/** What this lab compiles and what it ships. Boneyard measures what the art weighs. */
export function measureFootprint(): FootprintMeasurements {
  const catalogs = Object.fromEntries(typescriptFiles(CLIPS).map((path) => [portable(path), bytes(path)]));
  return { contract: 1, catalogs, shells: shellChunks() };
}
function compareSection(
  section: "catalogs" | "shells",
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
    ...compareSection("catalogs", actual.catalogs, baseline.catalogs ?? {}),
    ...compareSection("shells", actual.shells, baseline.shells ?? {}),
  ];
}
/** The absolute half of C7 remains a gate even while the numeric baseline grows by milestone. */
export function checkInvariants(): string[] {
  const failures: string[] = [];
  const packageJson = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { dependencies?: Record<string, string> };
  // "Zero runtime dependencies" always meant no third-party code in the bundle. Boneyard is the
  // rig and the art themselves, linked from a sibling checkout; pinning the specifier to file:
  // is what keeps that from quietly becoming a registry package, and its own guard keeps its
  // dependency list empty, so the property this gate protects still holds transitively.
  for (const [name, specifier] of Object.entries(packageJson.dependencies ?? {})) {
    if (name !== "boneyard") failures.push(`package.json depends on '${name}'; only boneyard may be a runtime dependency`);
    else if (!specifier.startsWith("file:")) failures.push(`boneyard is '${specifier}'; it must stay a file: link to the sibling checkout`);
  }
  const boneyardPackage = join(ROOT, "node_modules", "boneyard", "package.json");
  if (existsSync(boneyardPackage)) {
    const linked = JSON.parse(readFileSync(boneyardPackage, "utf8")) as { dependencies?: Record<string, string> };
    if (linked.dependencies && Object.keys(linked.dependencies).length > 0) {
      failures.push("boneyard has runtime dependencies of its own; C7 requires zero");
    }
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
    throw new Error("no pipelines/guards/footprint.baseline.json — run npm run check:footprint -- --write and review it");
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
      for (const [path, size] of Object.entries(measurements.catalogs)) {
        console.log(`${path.padEnd(46)} ${String(size.raw).padStart(7)} raw  ${String(size.gzip).padStart(6)} gzip`);
      }
      for (const [path, size] of Object.entries(measurements.shells)) {
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
      else if (ok) console.log(`check:footprint: ${Object.keys(measurements.catalogs).length} clip modules `
        + `and ${Object.keys(measurements.shells).length} shell chunks did not grow`);
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
