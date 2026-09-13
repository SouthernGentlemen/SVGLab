import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { hierarchyOrder, validateRig } from "../../src/rig/contract.ts";
import type { Clip, Easing, Keyframe } from "../../src/clips/types.ts";
import type { Rig } from "../../src/rig/types.ts";
import { parseBvh } from "./bvh-parse.ts";
import { retargetClip } from "./retarget.ts";
import type { RetargetDefinition } from "./retarget.ts";

export const MANIFEST_PATH = join("motions", "bandai-namco-motiondataset-1.json");
export const AUTHORED_DIR = join("motions", "authored");
export const AUTHORED_OUTPUT = join("src", "clips", "generated", "authored.ts");
export const EASINGS = ["linear", "smoothstep"] as const;

export type ClipLane = "shipped" | "study";

export interface ManifestClip extends Omit<RetargetDefinition, "targetFps" | "targetLegLength" | "frontSourceSide"
  | "angleTolerance" | "positionTolerance" | "rotationPrecision" | "positionPrecision" | "maxLoopSeamDegrees"> {
  readonly source: string;
  readonly content: number;
  readonly style: number;
  readonly lane: ClipLane;
}

export interface MotionManifest {
  readonly sourceUrl: string;
  readonly sourceRevision: string;
  readonly sourceRoot: string;
  readonly sourceFps: number;
  readonly output: string;
  readonly defaults: Pick<RetargetDefinition, "targetFps" | "targetLegLength" | "frontSourceSide"
    | "angleTolerance" | "positionTolerance" | "rotationPrecision" | "positionPrecision" | "maxLoopSeamDegrees">;
  readonly clips: readonly ManifestClip[];
}

export interface AuthoredClip {
  readonly key: string;
  readonly derivedFrom: string | null;
  readonly loop: boolean;
  readonly duration: number;
  readonly easing: Easing;
  readonly note: string;
  readonly keyframes: readonly Keyframe[];
}

export interface MotionCatalog {
  readonly manifest: MotionManifest;
  readonly rig: Rig;
  readonly bandaiNamco: Readonly<Record<string, Clip>>;
  readonly studies: Readonly<Record<string, Clip>>;
  readonly authored: Readonly<Record<string, Clip>>;
  readonly origins: Readonly<Record<string, string | null>>;
  readonly clips: Readonly<Record<string, Clip>>;
}

/**
 * Two lanes, one catalog.
 *
 * Manifest clips are derived from the pinned Bandai Namco source on every build and must not
 * be edited. Authored clips come back from an external tool through `import:motions` and are
 * source in their own right. An authored clip may carry a manifest clip's key, which is how a
 * hand-tweaked version replaces what the lab plays while the manifest keeps the untouched
 * original for comparison.
 */
export function buildCatalog(root: string): MotionCatalog {
  const manifest = JSON.parse(readFileSync(join(root, MANIFEST_PATH), "utf8")) as MotionManifest;
  const validatedRig = validateRig(JSON.parse(readFileSync(join(root, "rigs", "fighter.rig.json"), "utf8")));
  // The contract need not store bones in traversal order. BVH does, so every motion consumer
  // sees the parent-before-child order the old authored-document reader returned.
  const rig: Rig = { ...validatedRig, bones: [...hierarchyOrder(validatedRig)] };
  const bandaiNamco: Record<string, Clip> = {};
  const studies: Record<string, Clip> = {};
  const derivedClips: Record<string, Clip> = {};

  for (const definition of manifest.clips) {
    const sourcePath = join(root, manifest.sourceRoot, definition.source);
    const annotation = JSON.parse(readFileSync(sourcePath.replace(/\.bvh$/, ".json"), "utf8")) as {
      content: number;
      style: number;
    };
    if (annotation.content !== definition.content || annotation.style !== definition.style) {
      throw new Error(`${definition.key}: source annotation does not match the manifest`);
    }
    const bvh = parseBvh(readFileSync(sourcePath, "utf8"), definition.source);
    if (Math.abs(bvh.frameTime - 1 / manifest.sourceFps) > 0.000001) {
      throw new Error(`${definition.key}: expected ${manifest.sourceFps} FPS, found ${1 / bvh.frameTime}`);
    }
    if (definition.lane !== "shipped" && definition.lane !== "study") {
      throw new Error(`${definition.key}: lane must be shipped or study`);
    }
    if (definition.key in derivedClips) throw new Error(`${definition.key}: duplicate manifest clip key`);
    const clip = retargetClip(bvh, { ...manifest.defaults, ...definition });
    derivedClips[definition.key] = clip;
    (definition.lane === "shipped" ? bandaiNamco : studies)[definition.key] = clip;
  }

  const authored: Record<string, Clip> = {};
  const origins: Record<string, string | null> = {};
  const directory = join(root, AUTHORED_DIR);
  const files = existsSync(directory) ? readdirSync(directory).filter((name) => name.endsWith(".json")).sort() : [];
  for (const file of files) {
    const entry = validateAuthoredClip(JSON.parse(readFileSync(join(directory, file), "utf8")), {
      file,
      rig,
      bandaiNamco: derivedClips,
    });
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

  return { manifest, rig, bandaiNamco, studies, authored, origins, clips: { ...bandaiNamco, ...authored } };
}

/**
 * Everything an authored clip has to say for itself before it ships.
 *
 * The key carries provenance: a `bnr` clip is still an adaptation of Bandai Namco material
 * and names the clip it came from, and a `lab` clip is authored here and claims no origin.
 * Nothing else in the lab can tell the difference once a clip is playing, so the file has to.
 */
export function validateAuthoredClip(
  value: unknown,
  context: { file?: string; rig?: Rig; bandaiNamco?: Readonly<Record<string, Clip>> } = {},
): AuthoredClip {
  const candidate = value as Partial<AuthoredClip> | null;
  const label = context.file ?? candidate?.key ?? "authored clip";
  function fail(message: string): never {
    throw new Error(`${label}: ${message}`);
  }

  if (!candidate || typeof candidate !== "object") fail("is not an object");
  if (typeof candidate.key !== "string" || !/^(bnr|lab)[A-Za-z0-9]+$/.test(candidate.key)) {
    fail("key must be a bnr* adaptation or a lab* original");
  }
  if (context.file !== undefined && context.file !== `${candidate.key}.json`) {
    fail(`key '${candidate.key}' does not match the file name`);
  }

  const derived = candidate.key.startsWith("bnr");
  if (derived && typeof candidate.derivedFrom !== "string") fail("a bnr* clip must name the clip it was derived from");
  if (!derived && candidate.derivedFrom !== null) fail("a lab* clip must set derivedFrom to null");
  if (derived && context.bandaiNamco && !(candidate.derivedFrom! in context.bandaiNamco)) {
    fail(`derivedFrom '${candidate.derivedFrom}' is not a manifest clip`);
  }

  if (typeof candidate.loop !== "boolean") fail("loop must be a boolean");
  if (!Number.isInteger(candidate.duration) || candidate.duration! <= 0) {
    fail("duration must be a positive whole number of ticks");
  }
  if (!EASINGS.includes(candidate.easing as Easing)) fail(`easing must be one of ${EASINGS.join(", ")}`);
  if (typeof candidate.note !== "string" || candidate.note.trim() === "") fail("note must say what this clip is");
  if (!Array.isArray(candidate.keyframes) || candidate.keyframes.length === 0) fail("has no keyframes");

  let previous = -1;
  for (const keyframe of candidate.keyframes) {
    if (!Number.isInteger(keyframe.frame)) fail("keyframe frames must be whole ticks");
    if (keyframe.frame <= previous) fail(`keyframe ${keyframe.frame} is out of order`);
    if (keyframe.frame < 0 || keyframe.frame > candidate.duration!) {
      fail(`keyframe ${keyframe.frame} is outside 0-${candidate.duration}`);
    }
    previous = keyframe.frame;
    if (!keyframe.bones || typeof keyframe.bones !== "object") fail(`keyframe ${keyframe.frame} has no bones`);
    for (const [bone, pose] of Object.entries(keyframe.bones)) {
      if (context.rig && !context.rig.byName.has(bone)) fail(`keyframe ${keyframe.frame} poses unknown bone '${bone}'`);
      for (const [property, propertyValue] of Object.entries(pose as Record<string, unknown>)) {
        if (!["x", "y", "rotation"].includes(property)) {
          fail(`keyframe ${keyframe.frame} sets unknown property '${property}'`);
        }
        if (!Number.isFinite(propertyValue)) {
          fail(`keyframe ${keyframe.frame} sets ${bone}.${property} to a non-finite value`);
        }
      }
    }
  }

  if (candidate.keyframes[0].frame !== 0) fail("must start at tick 0");
  if (candidate.loop) {
    const last = candidate.keyframes.at(-1)!;
    if (last.frame !== candidate.duration) fail("a looping clip must key its closing tick");
    if (JSON.stringify(last.bones) !== JSON.stringify(candidate.keyframes[0].bones)) fail("loop seam does not close");
  }
  return candidate as AuthoredClip;
}
