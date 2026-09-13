#!/usr/bin/env node
/** Read an edited BVH back onto the authored clip lane. */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Clip } from "../../src/clips/types.ts";
import { sampleClip } from "../../src/rig/sample.ts";
import { AUTHORED_DIR, buildCatalog, validateAuthoredClip } from "../motion/catalog.ts";
import { parseBvh } from "../motion/bvh-parse.ts";
import { bvhToClip } from "./bvh-read.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALUE_FLAGS = new Set(["key", "derived-from", "note"]);
const BOOLEAN_FLAGS = new Set(["loop", "no-loop", "dry-run", "check", "json"]);

interface Arguments {
  readonly file: string;
  readonly values: ReadonlyMap<string, string>;
  readonly booleans: ReadonlySet<string>;
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  const positional: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const name = token.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value`);
      values.set(name, value);
    } else if (BOOLEAN_FLAGS.has(name)) {
      booleans.add(name);
    } else {
      throw new Error(`unknown option --${name}`);
    }
  }
  if (positional.length !== 1) throw new Error(`expected one BVH file, got ${positional.length}`);
  if (booleans.has("loop") && booleans.has("no-loop")) throw new Error("choose --loop or --no-loop, not both");
  return { file: positional[0], values, booleans };
}

interface Deviation {
  readonly bone: string;
  rotation: number;
  position: number;
  frame: number;
}

function deviations(origin: Clip | null, entry: Clip): Deviation[] {
  if (!origin) return [];
  const ticks = Math.max(origin.duration, entry.duration);
  const worst = new Map<string, Deviation>();
  for (let frame = 0; frame <= ticks; frame += 1) {
    const before = sampleClip(origin, Math.min(frame, origin.duration));
    const after = sampleClip(entry, Math.min(frame, entry.duration));
    for (const bone of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const rotation = Math.abs((after[bone]?.rotation ?? 0) - (before[bone]?.rotation ?? 0));
      const position = Math.hypot(
        (after[bone]?.x ?? 0) - (before[bone]?.x ?? 0),
        (after[bone]?.y ?? 0) - (before[bone]?.y ?? 0),
      );
      const current = worst.get(bone) ?? { bone, rotation: 0, position: 0, frame };
      if (rotation > current.rotation || (rotation === current.rotation && position > current.position)) {
        current.frame = frame;
      }
      current.rotation = Math.max(current.rotation, rotation);
      current.position = Math.max(current.position, position);
      worst.set(bone, current);
    }
  }
  return [...worst.values()].sort((a, b) => b.rotation - a.rotation || b.position - a.position || a.bone.localeCompare(b.bone));
}

const display = (value: number): string => value.toFixed(4);

function usage(): string {
  return `Usage: npm run import:motions -- <edited.bvh> [--key <clipKey>] [--derived-from <clipKey>]
                      [--note "what changed"] [--loop|--no-loop] [--dry-run] [--json]

Reads a 60 FPS BVH back onto SVGLab's eleven-bone rig. Unless --dry-run or --check is used,
writes motions/authored/<clipKey>.json and a review report beside the BVH.`;
}

export function main(argv: readonly string[]): number {
  if (argv.length === 0) {
    console.error(usage());
    return 1;
  }
  const wantsJson = argv.includes("--json");
  try {
    const args = parseArguments(argv);
    const file = isAbsolute(args.file) ? args.file : resolve(process.cwd(), args.file);
    if (!existsSync(file)) throw new Error(`${file} does not exist`);
    const catalog = buildCatalog(ROOT);
    const key = args.values.get("key") ?? basename(file).replace(/\.bvh$/i, "");
    const derivedFrom = key.startsWith("bnr")
      ? args.values.get("derived-from") ?? (key in catalog.bandaiNamco ? key : null)
      : null;
    if (key.startsWith("bnr") && derivedFrom === null) {
      throw new Error(`${key}: pass --derived-from <manifest clip>, or name it lab* if it is original`);
    }
    const origin = derivedFrom === null ? null : catalog.bandaiNamco[derivedFrom] ?? null;
    if (derivedFrom !== null && origin === null) throw new Error(`derivedFrom '${derivedFrom}' is not a manifest clip`);
    const loop = args.booleans.has("loop") ? true : args.booleans.has("no-loop") ? false : origin?.loop ?? false;
    const easing = origin?.easing ?? "linear";

    const bvh = parseBvh(readFileSync(file, "utf8"), file);
    const read = bvhToClip(bvh, catalog.rig, { loop, easing, tolerances: catalog.manifest.defaults });
    const authored = validateAuthoredClip({
      key,
      derivedFrom,
      loop,
      duration: read.duration,
      easing,
      note: args.values.get("note") ?? (derivedFrom === null
        ? "Authored by hand on SVGLab's eleven-bone rig."
        : `Hand-tweaked from ${derivedFrom}.`),
      keyframes: read.keyframes,
    }, { rig: catalog.rig, bandaiNamco: catalog.bandaiNamco });
    const entry: Clip = { name: key, loop, duration: authored.duration, easing, note: authored.note, keyframes: authored.keyframes };
    const moved = deviations(origin, entry);
    const dryRun = args.booleans.has("dry-run") || args.booleans.has("check");
    const target = join(ROOT, AUTHORED_DIR, `${key}.json`);
    const reportPath = join(dirname(file), `${key}.review.md`);
    const report = [
      `# ${key}`,
      "",
      `- source file: \`${relative(ROOT, file)}\``,
      `- derived from: ${derivedFrom ?? "nothing — authored here"}`,
      `- duration: ${entry.duration} ticks${origin ? ` (was ${origin.duration})` : ""}`,
      `- keyframes: ${entry.keyframes.length}${origin ? ` (was ${origin.keyframes.length})` : ""}`,
      `- playback: ${loop ? "loop" : "one-shot"}${loop ? `, seam ${display(read.seamDegrees)}° before closing` : ""}`,
      `- rest scale read from the file: ${display(read.scale)}`,
      "",
      "## Dropped on the way in",
      "",
      `- out-of-plane rotation: ${display(read.dropped.outOfPlaneDegrees)}°${read.dropped.bones.length > 0 ? ` (${read.dropped.bones.join(", ")})` : ""}`,
      `- depth translation: ${display(read.dropped.depthUnits)} units${read.dropped.depthBones.length > 0 ? ` (${read.dropped.depthBones.join(", ")})` : ""}`,
      `- horizontal root travel: ${display(read.dropped.horizontalUnits)} units${read.dropped.horizontalBones.length > 0 ? ` (${read.dropped.horizontalBones.join(", ")})` : ""}`,
      "",
      ...(moved.length === 0 ? ["## Changes", "", "No origin clip to compare against."] : [
        "## What moved",
        "",
        "| bone | max rotation delta | max position delta | at tick |",
        "| --- | ---: | ---: | ---: |",
        ...moved.map(({ bone, rotation, position, frame }) => (
          `| ${bone} | ${display(rotation)}° | ${display(position)} | ${frame} |`
        )),
      ]),
      "",
    ].join("\n");

    if (!dryRun) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, `${JSON.stringify(authored, null, 2)}\n`);
      writeFileSync(reportPath, report);
    }

    const summary = {
      ok: true,
      dryRun,
      key,
      derivedFrom,
      duration: entry.duration,
      keyframes: entry.keyframes.length,
      scale: read.scale,
      dropped: read.dropped,
      changes: moved,
      target: relative(ROOT, target),
      report: relative(ROOT, reportPath),
    };
    if (wantsJson) console.log(JSON.stringify(summary, null, 2));
    else {
      console.log(report);
      if (dryRun) console.log("dry run: nothing written");
      else {
        console.log(`wrote ${summary.target} and ${summary.report}`);
        console.log("run npm run build:motions to fold it into the catalog");
      }
    }
    return 0;
  } catch (error) {
    const message = (error as Error).message;
    if (wantsJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`import:motions: ${message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
