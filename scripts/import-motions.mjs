import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBvh } from "./motion/bvh.mjs";
import { bvhToClip } from "./motion/bvh-read.mjs";
import { AUTHORED_DIR, buildCatalog, validateAuthoredClip } from "./motion/catalog.mjs";
import { round, samplePose } from "./motion/clip.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const VALUE_FLAGS = new Set(["key", "derived-from", "note"]);
const BOOLEAN_FLAGS = new Set(["loop", "no-loop", "dry-run"]);

const options = new Map();
const positional = [];
for (let index = 0; index < process.argv.length - 2; index += 1) {
  const token = process.argv[index + 2];
  if (!token.startsWith("--")) {
    positional.push(token);
    continue;
  }
  const name = token.slice(2);
  if (VALUE_FLAGS.has(name)) {
    const value = process.argv[index + 3];
    if (value === undefined || value.startsWith("--")) throw new Error(`--${name} needs a value`);
    options.set(name, value);
    index += 1;
  } else if (BOOLEAN_FLAGS.has(name)) {
    options.set(name, true);
  } else {
    throw new Error(`unknown option --${name}`);
  }
}

const flag = (name) => options.get(name) ?? null;
const has = (name) => options.get(name) === true;
const file = positional[0];
if (positional.length > 1) throw new Error(`expected one BVH file, got ${positional.length}`);

if (!file) {
  console.error(`Usage: npm run import:motions -- <edited.bvh> [--key <clipKey>] [--derived-from <clipKey>]
                      [--note "what changed"] [--loop|--no-loop] [--dry-run]

Reads a BVH exported from an external tool back onto SVGLab's eleven-bone rig and writes
motions/authored/<clipKey>.json. Run npm run build:motions afterwards.`);
  process.exit(1);
}

const catalog = buildCatalog(root);
const key = flag("key") ?? basename(file).replace(/\.bvh$/i, "");
const derivedFrom = key.startsWith("bnr") ? flag("derived-from") ?? (key in catalog.bandaiNamco ? key : null) : null;
if (key.startsWith("bnr") && derivedFrom === null) {
  throw new Error(`${key}: pass --derived-from <manifest clip>, or name the clip lab* if it is not an adaptation`);
}
const origin = derivedFrom === null ? null : catalog.bandaiNamco[derivedFrom] ?? null;
if (derivedFrom !== null && origin === null) throw new Error(`derivedFrom '${derivedFrom}' is not a manifest clip`);
const loop = has("loop") ? true : has("no-loop") ? false : origin?.loop ?? false;

const bvh = parseBvh(readFileSync(file, "utf8"), file);
const read = bvhToClip(bvh, catalog.rig, { loop, easing: origin?.easing ?? "linear", tolerances: catalog.manifest.defaults });

const entry = validateAuthoredClip({
  key,
  derivedFrom,
  loop,
  duration: read.duration,
  easing: origin?.easing ?? "linear",
  note: flag("note") ?? (derivedFrom === null
    ? `Authored by hand on SVGLab's eleven-bone rig.`
    : `Hand-tweaked from ${derivedFrom}.`),
  keyframes: read.keyframes,
}, { rig: catalog.rig, bandaiNamco: catalog.bandaiNamco });

/** What moved, per bone, against the clip this one came from. */
function deviations() {
  if (!origin) return [];
  const ticks = Math.max(origin.duration, entry.duration);
  const worst = new Map();
  for (let frame = 0; frame <= ticks; frame += 1) {
    const before = samplePose(origin, Math.min(frame, origin.duration));
    const after = samplePose(entry, Math.min(frame, entry.duration));
    for (const bone of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const rotation = Math.abs((after[bone]?.rotation ?? 0) - (before[bone]?.rotation ?? 0));
      const position = Math.hypot(
        (after[bone]?.x ?? 0) - (before[bone]?.x ?? 0),
        (after[bone]?.y ?? 0) - (before[bone]?.y ?? 0),
      );
      const current = worst.get(bone) ?? { rotation: 0, position: 0, frame };
      if (rotation > current.rotation) Object.assign(current, { rotation, frame });
      current.position = Math.max(current.position, position);
      worst.set(bone, current);
    }
  }
  return [...worst.entries()]
    .map(([bone, value]) => ({ bone, ...value }))
    .sort((a, b) => b.rotation - a.rotation || b.position - a.position);
}

const moved = deviations();
const report = [
  `# ${key}`,
  "",
  `- source file: \`${file}\``,
  `- derived from: ${derivedFrom ?? "nothing — authored here"}`,
  `- duration: ${entry.duration} ticks${origin ? ` (was ${origin.duration})` : ""}`,
  `- keyframes: ${entry.keyframes.length}${origin ? ` (was ${origin.keyframes.length})` : ""}`,
  `- playback: ${loop ? "loop" : "one-shot"}${loop ? `, seam ${round(read.seamDegrees)}° before closing` : ""}`,
  `- rest scale read from the file: ${read.scale}`,
  "",
  "## Dropped on the way in",
  "",
  `- out-of-plane rotation: ${round(read.dropped.outOfPlaneDegrees)}°${read.dropped.bones.length > 0 ? ` (${read.dropped.bones.join(", ")})` : ""}`,
  `- depth translation: ${round(read.dropped.depthUnits)} units`,
  `- horizontal root travel: ${round(read.dropped.horizontalUnits)} units`,
  "",
  ...(moved.length === 0 ? ["## Changes", "", "No origin clip to compare against."] : [
    "## What moved",
    "",
    "| bone | max rotation delta | max position delta | at tick |",
    "| --- | --- | --- | --- |",
    ...moved.map(({ bone, rotation, position, frame }) =>
      `| ${bone} | ${round(rotation)}° | ${round(position)} | ${frame} |`),
  ]),
  "",
].join("\n");

console.log(report);

if (has("dry-run")) {
  console.log("dry run: nothing written");
} else {
  const directory = join(root, AUTHORED_DIR);
  mkdirSync(directory, { recursive: true });
  const target = join(directory, `${key}.json`);
  writeFileSync(target, `${JSON.stringify(entry, null, 2)}\n`);
  const reportPath = join(dirname(file), `${key}.review.md`);
  writeFileSync(reportPath, report);
  console.log(`wrote ${target.replace(`${root}/`, "")} and ${reportPath}`);
  console.log("run npm run build:motions to fold it into the catalog");
}
