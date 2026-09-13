#!/usr/bin/env node
/** Gate Blender's actual pose evaluation and BVH exporter against SVGLab's rig math. */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";

import type { Clip } from "../../src/clips/types.ts";
import { forwardKinematics } from "../../src/rig/fk.ts";
import { sampleClip } from "../../src/rig/sample.ts";
import { findBlender, blenderFix } from "../dev/find-blender.ts";
import { bvhToClip } from "../exchange/bvh-read.ts";
import { clipToBvh } from "../exchange/bvh-write.ts";
import { buildCatalog } from "../motion/catalog.ts";
import { parseBvh } from "../motion/bvh-parse.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const LIMIT = 0.001;
const ROUND_TRIP_CLIP = "bnrStrikeNormal";

interface Point {
  readonly [bone: string]: readonly [number, number];
}

type BlenderJoints = Readonly<Record<string, readonly Point[]>>;

interface Worst {
  deviation: number;
  clip: string;
  tick: number;
  bone: string;
}

interface BlenderReport {
  readonly ok: boolean;
  readonly skipped: false;
  readonly blender: string;
  readonly version: string;
  readonly clips: number;
  readonly comparisons: number;
  readonly worst: Worst;
  readonly roundTrip: {
    readonly clip: string;
    readonly rotation: number;
    readonly position: number;
    readonly dropped: ReturnType<typeof bvhToClip>["dropped"];
  };
  readonly seconds: number;
}

function roundTripDeviation(original: Clip, returned: ReturnType<typeof bvhToClip>): { rotation: number; position: number } {
  const clip: Clip = {
    name: `${original.name}-blender-return`,
    loop: original.loop,
    duration: returned.duration,
    easing: original.easing,
    note: "real Blender export",
    keyframes: returned.keyframes,
  };
  let rotation = 0;
  let position = 0;
  for (let tick = 0; tick <= original.duration; tick += 1) {
    const before = sampleClip(original, tick);
    const after = sampleClip(clip, tick);
    for (const bone of new Set([...Object.keys(before), ...Object.keys(after)])) {
      rotation = Math.max(rotation, Math.abs((after[bone]?.rotation ?? 0) - (before[bone]?.rotation ?? 0)));
      position = Math.max(position, Math.hypot(
        (after[bone]?.x ?? 0) - (before[bone]?.x ?? 0),
        (after[bone]?.y ?? 0) - (before[bone]?.y ?? 0),
      ));
    }
  }
  return { rotation, position };
}

function runBlender(executable: string): BlenderReport {
  const started = performance.now();
  const catalog = buildCatalog(ROOT);
  const clips: Record<string, Clip> = { ...catalog.clips, ...catalog.studies };
  const directory = mkdtempSync(join(tmpdir(), "svglab-blender-gate-"));
  try {
    for (const [key, clip] of Object.entries(clips)) {
      writeFileSync(join(directory, `${key}.bvh`), clipToBvh(clip, catalog.rig));
    }
    const jointsPath = join(directory, "joints.json");
    const returnedPath = join(directory, `${ROUND_TRIP_CLIP}-blender.bvh`);
    const blenderOutput = execFileSync(executable, [
      "--factory-startup",
      "--background",
      "--python", join(ROOT, "pipelines", "blender", "joints.py"),
      "--",
      "--directory", directory,
      "--output", jointsPath,
      "--round-trip", ROUND_TRIP_CLIP,
      "--round-trip-output", returnedPath,
    ], { cwd: ROOT, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
    const version = blenderOutput.match(/Blender\s+([^\r\n]+)/m)?.[1] ?? "unknown";

    const actual = JSON.parse(readFileSync(jointsPath, "utf8")) as BlenderJoints;
    const worst: Worst = { deviation: 0, clip: "", tick: 0, bone: "" };
    let comparisons = 0;
    for (const [key, clip] of Object.entries(clips)) {
      const frames = actual[key];
      if (!frames || frames.length !== clip.duration + 1) {
        throw new Error(`${key}: Blender returned ${frames?.length ?? 0} frames, expected ${clip.duration + 1}`);
      }
      for (let tick = 0; tick <= clip.duration; tick += 1) {
        const expected = forwardKinematics(catalog.rig, sampleClip(clip, tick));
        const points = frames[tick];
        for (const bone of catalog.rig.bones) {
          const point = points[bone.name];
          if (!point) throw new Error(`${key} tick ${tick}: Blender returned no '${bone.name}' joint`);
          const target = expected.get(bone.name)!;
          const deviation = Math.hypot(point[0] - target.x, point[1] - target.y);
          comparisons += 1;
          if (deviation > worst.deviation) Object.assign(worst, { deviation, clip: key, tick, bone: bone.name });
        }
      }
    }
    if (worst.deviation > LIMIT) {
      throw new Error(`${worst.clip} tick ${worst.tick} ${worst.bone}: Blender joint drift ${worst.deviation} exceeds ${LIMIT}`);
    }

    const original = clips[ROUND_TRIP_CLIP];
    const returned = bvhToClip(parseBvh(readFileSync(returnedPath, "utf8"), "real Blender export"), catalog.rig, {
      loop: original.loop,
      easing: original.easing,
      tolerances: catalog.manifest.defaults,
    });
    const delta = roundTripDeviation(original, returned);
    if (returned.duration !== original.duration) {
      throw new Error(`real Blender export duration ${returned.duration}, expected ${original.duration}`);
    }
    if (delta.rotation > 0.00005 || delta.position > 0.00005) {
      throw new Error(`real Blender export changed the clip by ${delta.rotation.toFixed(4)}° and ${delta.position.toFixed(4)} units`);
    }
    if (returned.dropped.outOfPlaneDegrees > LIMIT || returned.dropped.depthUnits > LIMIT
      || returned.dropped.horizontalUnits > LIMIT) {
      throw new Error(`real Blender export reported dropped work: ${JSON.stringify(returned.dropped)}`);
    }

    return {
      ok: true,
      skipped: false,
      blender: executable,
      version,
      clips: Object.keys(clips).length,
      comparisons,
      worst,
      roundTrip: { clip: ROUND_TRIP_CLIP, ...delta, dropped: returned.dropped },
      seconds: (performance.now() - started) / 1000,
    };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  try {
    const found = findBlender();
    if (!found.executable) {
      const skipped = {
        ok: false,
        skipped: true,
        looked: found.looked,
        fix: blenderFix(found.suggested),
        required: process.env.SVGLAB_REQUIRE_BLENDER === "1",
      };
      if (asJson) console.log(JSON.stringify(skipped, null, 2));
      else {
        console.log("check:blender: Blender was not found. Looked at:");
        for (const path of found.looked) console.log(`- ${path}`);
        console.log(`Run this exact command once Blender is installed: ${skipped.fix}`);
        console.log("This gate did NOT pass. It was not run.");
      }
      return skipped.required ? 1 : 0;
    }

    const report = runBlender(found.executable);
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`check:blender: Blender ${report.version}; ${report.comparisons.toLocaleString("en-US")} joint comparisons across ${report.clips} clips`);
      console.log(`check:blender: worst ${report.worst.deviation.toExponential(3)} units at ${report.worst.clip} tick ${report.worst.tick}, ${report.worst.bone} (limit ${LIMIT})`);
      console.log(`check:blender: real BVH export ${report.roundTrip.rotation.toFixed(4)}° / ${report.roundTrip.position.toFixed(4)} units; ${report.seconds.toFixed(2)} s`);
    }
    return 0;
  } catch (error) {
    const message = (error as Error).message;
    if (asJson) console.log(JSON.stringify({ ok: false, skipped: false, error: message }, null, 2));
    else console.error(`check:blender: ${message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
