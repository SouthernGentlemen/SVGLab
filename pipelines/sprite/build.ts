#!/usr/bin/env node
/**
 * Build traced SVGLab parts from their atlases.
 *
 *   node pipelines/sprite/build.ts           # rebuild every character
 *   node pipelines/sprite/build.ts barst     # rebuild one
 *   node pipelines/sprite/build.ts --check   # verify the checked-in files match
 *   node pipelines/sprite/build.ts --out DIR # build somewhere else
 *   node pipelines/sprite/build.ts --json    # machine-readable summary
 *
 * A character is `characters/<id>/atlas.png` — a sheet of loose body parts in the layout
 * `docs/CHARACTER_ATLAS.md` describes — plus an optional `atlas.json` beside it. The build
 * writes one `characters/<id>/parts/<slot>.svg` for each rig slot.
 *
 * The output is generated. Edit the atlas or the sidecar, never the SVG.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateRig } from "../../src/rig/contract.ts";
import type { Rig } from "../../src/rig/types.ts";
import { buildParts, toPartSvg } from "./part.ts";
import type { AtlasOptions, BuiltAtlas } from "./part.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ATLASES = join(ROOT, "characters");
const RIG_PATH = join(ROOT, "rigs", "fighter.rig.json");

export interface RenderedAtlas {
  readonly built: BuiltAtlas;
  readonly files: ReadonlyMap<string, string>;
}

export function characterIds(): string[] {
  if (!existsSync(ATLASES)) return [];
  return readdirSync(ATLASES, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(ATLASES, entry.name, "atlas.png")))
    .map((entry) => entry.name)
    .sort();
}

export function sidecarFor(id: string): AtlasOptions {
  const path = join(ATLASES, id, "atlas.json");
  return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) as AtlasOptions : {};
}

export function loadBuildRig(): Rig {
  return validateRig(JSON.parse(readFileSync(RIG_PATH, "utf8")));
}

/** Builds one character and returns every part's SVG text alongside what the build measured. */
export function renderParts(id: string, rig = loadBuildRig()): RenderedAtlas {
  const sidecar = sidecarFor(id);
  const name = sidecar.name ?? id;
  const built = buildParts(join(ATLASES, id, "atlas.png"), { ...sidecar, name }, rig);
  const files = new Map<string, string>();
  for (const [slot, part] of built.parts) {
    files.set(slot, toPartSvg(part));
  }
  return { built, files };
}

export const outputPath = (id: string, slot: string, outputRoot = ATLASES): string => (
  join(outputRoot, id, "parts", `${slot}.svg`)
);

interface CliReport {
  readonly id: string;
  readonly ok: boolean;
  readonly checked: boolean;
  readonly parts?: number;
  readonly rawBytes?: number;
  readonly palette?: number;
  readonly unused?: readonly string[];
  readonly error?: string;
}

function parseTargets(argv: readonly string[]): { check: boolean; json: boolean; outputRoot: string; targets: string[] } {
  const check = argv.includes("--check");
  const json = argv.includes("--json");
  let outputRoot = ATLASES;
  const targets: string[] = [];
  for (let index = 0; index < argv.length; index++) {
    const argument = argv[index];
    if (argument === "--out") {
      const value = argv[++index];
      if (!value) throw new Error("--out needs a directory");
      outputRoot = resolve(value);
    } else if (!argument.startsWith("--")) targets.push(argument);
  }
  return { check, json, outputRoot, targets: targets.length > 0 ? targets : characterIds() };
}

export function main(argv: readonly string[]): number {
  let parsed: ReturnType<typeof parseTargets>;
  try {
    parsed = parseTargets(argv);
  } catch (error) {
    console.error(`build:parts: ${(error as Error).message}`);
    return 2;
  }
  const { check, json, outputRoot, targets } = parsed;

  if (targets.length === 0) {
    console.error("build:parts: no characters. Expected at least one characters/<id>/atlas.png.");
    return 2;
  }

  const reports: CliReport[] = [];
  let failed = false;
  const rig = loadBuildRig();
  for (const id of targets) {
    try {
      const { files, built } = renderParts(id, rig);
      let stale = false;
      let rawBytes = 0;
      for (const [slot, svg] of files) {
        const path = outputPath(id, slot, outputRoot);
        rawBytes += Buffer.byteLength(svg);
        if (check) {
          // A generated file that no longer matches its atlas is either a hand-edit or a
          // tracer that stopped being deterministic. Both drift silently until a character
          // quietly changes shape, so the check is part of the build rather than a chore.
          const current = existsSync(path) ? readFileSync(path, "utf8") : "";
          if (current !== svg) {
            stale = true;
            if (!json) console.error(`${id}: ${relative(ROOT, path)} is stale — run npm run build:parts`);
          }
        } else {
          mkdirSync(dirname(path), { recursive: true });
          writeFileSync(path, svg);
        }
      }

      if (check) {
        const directory = dirname(outputPath(id, "unused", outputRoot));
        const expected = new Set([...files.keys()].map((slot) => `${slot}.svg`));
        const extras = existsSync(directory)
          ? readdirSync(directory).filter((name) => name.endsWith(".svg") && !expected.has(name))
          : [];
        if (extras.length > 0) {
          stale = true;
          if (!json) console.error(`${id}: remove stale generated parts: ${extras.join(", ")}`);
        }
      }

      failed ||= stale;
      reports.push({
        id,
        ok: !stale,
        checked: check,
        parts: files.size,
        rawBytes,
        palette: built.palette,
        unused: built.unused,
      });
      if (!json && !stale) {
        console.log(`${id.padEnd(10)} ${files.size} parts, ${rawBytes} bytes, ${built.palette} colours, ${built.props} costume islands left for wardrobe`
          + (built.unused.length ? `, ${built.unused.length} atlas islands unused` : ""));
      }
    } catch (error) {
      failed = true;
      const message = (error as Error).message;
      reports.push({ id, ok: false, checked: check, error: message });
      if (!json) console.error(`${id}: ${message}`);
    }
  }

  if (json) console.log(JSON.stringify({ ok: !failed, checked: check, characters: reports }, null, 2));
  return failed ? 1 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
