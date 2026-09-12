import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { parseBvh } from "./bvh.mjs";
import { readRig } from "./rig.mjs";
import { retargetClip } from "./retarget.mjs";

export const MANIFEST_PATH = join("motions", "bandai-namco-motiondataset-1.json");
export const AUTHORED_DIR = join("motions", "authored");
export const AUTHORED_OUTPUT = join("src", "animation", "generated", "authored.ts");
export const EASINGS = ["linear", "smoothstep"];

/**
 * Two lanes, one catalog.
 *
 * Manifest clips are derived from the pinned Bandai Namco source on every build and must not
 * be edited. Authored clips come back from an external tool through `import:motions` and are
 * source in their own right. An authored clip may carry a manifest clip's key, which is how a
 * hand-tweaked version replaces what the lab plays while the manifest keeps the untouched
 * original for comparison.
 */
export function buildCatalog(root) {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8"));
  const rig = readRig(readFileSync(join(root, "src", "svg", "fighter.svg"), "utf8"));
  const bandaiNamco = {};

  for (const definition of manifest.clips) {
    const sourcePath = join(root, manifest.sourceRoot, definition.source);
    const annotation = JSON.parse(readFileSync(sourcePath.replace(/\.bvh$/, ".json"), "utf8"));
    if (annotation.content !== definition.content || annotation.style !== definition.style) {
      throw new Error(`${definition.key}: source annotation does not match the manifest`);
    }
    const bvh = parseBvh(readFileSync(sourcePath, "utf8"), definition.source);
    if (Math.abs(bvh.frameTime - 1 / manifest.sourceFps) > 0.000001) {
      throw new Error(`${definition.key}: expected ${manifest.sourceFps} FPS, found ${1 / bvh.frameTime}`);
    }
    bandaiNamco[definition.key] = retargetClip(bvh, { ...manifest.defaults, ...definition });
  }

  const authored = {};
  const origins = {};
  const directory = join(root, AUTHORED_DIR);
  const files = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".json")).sort() : [];
  for (const file of files) {
    const entry = JSON.parse(readFileSync(join(directory, file), "utf8"));
    validateAuthoredClip(entry, { file, rig, bandaiNamco });
    authored[entry.key] = {
      name: entry.key,
      loop: entry.loop,
      duration: entry.duration,
      easing: entry.easing,
      note: entry.note,
      keyframes: entry.keyframes,
    };
    origins[entry.key] = entry.derivedFrom;
  }

  return { manifest, rig, bandaiNamco, authored, origins, clips: { ...bandaiNamco, ...authored } };
}

/**
 * Everything an authored clip has to say for itself before it ships.
 *
 * The key carries provenance: a `bnr` clip is still an adaptation of Bandai Namco material
 * and names the clip it came from, and a `lab` clip is authored here and claims no origin.
 * Nothing else in the lab can tell the difference once a clip is playing, so the file has to.
 */
export function validateAuthoredClip(entry, { file, rig, bandaiNamco }) {
  const label = file ?? entry?.key ?? "authored clip";
  const fail = (message) => {
    throw new Error(`${label}: ${message}`);
  };

  if (!entry || typeof entry !== "object") fail("is not an object");
  if (typeof entry.key !== "string" || !/^(bnr|lab)[A-Za-z0-9]+$/.test(entry.key)) {
    fail("key must be a bnr* adaptation or a lab* original");
  }
  if (file !== undefined && file !== `${entry.key}.json`) fail(`key '${entry.key}' does not match the file name`);

  const derived = entry.key.startsWith("bnr");
  if (derived && typeof entry.derivedFrom !== "string") fail("a bnr* clip must name the clip it was derived from");
  if (!derived && entry.derivedFrom !== null) fail("a lab* clip must set derivedFrom to null");
  if (derived && bandaiNamco && !(entry.derivedFrom in bandaiNamco)) {
    fail(`derivedFrom '${entry.derivedFrom}' is not a manifest clip`);
  }

  if (typeof entry.loop !== "boolean") fail("loop must be a boolean");
  if (!Number.isInteger(entry.duration) || entry.duration <= 0) fail("duration must be a positive whole number of ticks");
  if (!EASINGS.includes(entry.easing)) fail(`easing must be one of ${EASINGS.join(", ")}`);
  if (typeof entry.note !== "string" || entry.note.trim() === "") fail("note must say what this clip is");
  if (!Array.isArray(entry.keyframes) || entry.keyframes.length === 0) fail("has no keyframes");

  let previous = -1;
  for (const keyframe of entry.keyframes) {
    if (!Number.isInteger(keyframe.frame)) fail("keyframe frames must be whole ticks");
    if (keyframe.frame <= previous) fail(`keyframe ${keyframe.frame} is out of order`);
    if (keyframe.frame < 0 || keyframe.frame > entry.duration) fail(`keyframe ${keyframe.frame} is outside 0-${entry.duration}`);
    previous = keyframe.frame;
    if (!keyframe.bones || typeof keyframe.bones !== "object") fail(`keyframe ${keyframe.frame} has no bones`);
    for (const [bone, pose] of Object.entries(keyframe.bones)) {
      if (rig && !rig.byName.has(bone)) fail(`keyframe ${keyframe.frame} poses unknown bone '${bone}'`);
      for (const [property, value] of Object.entries(pose)) {
        if (!["x", "y", "rotation"].includes(property)) fail(`keyframe ${keyframe.frame} sets unknown property '${property}'`);
        if (!Number.isFinite(value)) fail(`keyframe ${keyframe.frame} sets ${bone}.${property} to a non-finite value`);
      }
    }
  }

  if (entry.keyframes[0].frame !== 0) fail("must start at tick 0");
  if (entry.loop) {
    const last = entry.keyframes.at(-1);
    if (last.frame !== entry.duration) fail("a looping clip must key its closing tick");
    if (JSON.stringify(last.bones) !== JSON.stringify(entry.keyframes[0].bones)) fail("loop seam does not close");
  }
  return entry;
}
