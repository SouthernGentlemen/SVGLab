#!/usr/bin/env node
/** Guard the lossless, measured exchange with tools that do not share SVGLab's axes. */

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Clip } from "../../src/clips/types.ts";
import { sampleClip } from "../../src/rig/sample.ts";
import { bvhToClip } from "../exchange/bvh-read.ts";
import { clipToBvh } from "../exchange/bvh-write.ts";
import { buildCatalog, validateAuthoredClip } from "../motion/catalog.ts";
import { parseBvh } from "../motion/bvh-parse.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface ExchangeReport {
  readonly ok: boolean;
  readonly clips: number;
  readonly failures: readonly string[];
}

export function checkExchange(): ExchangeReport {
  const catalog = buildCatalog(ROOT);
  const tolerances = catalog.manifest.defaults;
  const clips: Record<string, Clip> = { ...catalog.clips, ...catalog.studies };
  const failures: string[] = [];
  const check = (condition: boolean, message: string): void => {
    if (!condition) failures.push(message);
  };
  const rejects = (label: string, act: () => unknown): void => {
    try {
      act();
      failures.push(`${label}: accepted input it should refuse`);
    } catch {
      // Refusing is the expected outcome.
    }
  };

  for (const [key, clip] of Object.entries(clips)) {
    const text = clipToBvh(clip, catalog.rig);
    const read = bvhToClip(parseBvh(text, key), catalog.rig, {
      loop: clip.loop,
      easing: clip.easing,
      tolerances,
    });
    check(read.duration === clip.duration, `${key}: duration ${read.duration}, expected ${clip.duration}`);
    check(read.dropped.outOfPlaneDegrees === 0, `${key}: reported out-of-plane rotation in its own export`);
    check(read.dropped.depthUnits === 0, `${key}: reported depth translation in its own export`);
    check(read.dropped.horizontalUnits === 0, `${key}: reported horizontal travel in its own export`);

    let worstRotation = 0;
    let worstPosition = 0;
    const returned: Clip = {
      name: key,
      duration: read.duration,
      loop: clip.loop,
      easing: clip.easing,
      note: "round-trip guard",
      keyframes: read.keyframes,
    };
    for (let frame = 0; frame <= clip.duration; frame += 1) {
      const before = sampleClip(clip, frame);
      const after = sampleClip(returned, frame);
      for (const bone of new Set([...Object.keys(before), ...Object.keys(after)])) {
        worstRotation = Math.max(worstRotation, Math.abs(
          (after[bone]?.rotation ?? 0) - (before[bone]?.rotation ?? 0),
        ));
        worstPosition = Math.max(worstPosition, Math.hypot(
          (after[bone]?.x ?? 0) - (before[bone]?.x ?? 0),
          (after[bone]?.y ?? 0) - (before[bone]?.y ?? 0),
        ));
      }
    }
    check(worstRotation <= tolerances.angleTolerance,
      `${key}: round trip moved a bone ${worstRotation.toFixed(3)}°, past ${tolerances.angleTolerance}°`);
    check(worstPosition <= tolerances.positionTolerance,
      `${key}: round trip moved a bone ${worstPosition.toFixed(3)} units, past ${tolerances.positionTolerance}`);
  }

  const sample = clipToBvh(clips.bnrStrikeNormal, catalog.rig);
  const readOptions = { loop: false, easing: "linear" as const, tolerances };
  rejects("foreign skeleton", () => bvhToClip(
    parseBvh(sample.replace(/\btorso\b/, "chest"), "renamed"), catalog.rig, readOptions,
  ));
  rejects("extra joint", () => bvhToClip(
    parseBvh(sample.replace("JOINT head", "JOINT tail"), "extra"), catalog.rig, readOptions,
  ));
  rejects("wrong frame rate", () => bvhToClip(
    parseBvh(sample.replace(/Frame Time: [\d.]+/, "Frame Time: 0.0333333"), "30fps"), catalog.rig, readOptions,
  ));
  rejects("rest offset drift", () => bvhToClip(
    parseBvh(sample.replace("OFFSET 11.000000 22.000000", "OFFSET 11.000000 30.000000"), "drift"),
    catalog.rig,
    readOptions,
  ));

  function reframe(text: string): string {
    const lines = text.split("\n");
    const motionStart = lines.findIndex((line) => line.startsWith("Frame Time:")) + 1;
    const header = lines.slice(0, motionStart).map((line) => {
      if (!line.trim().startsWith("OFFSET")) return line;
      const [x, y, z] = line.trim().split(/\s+/).slice(1).map(Number);
      return line.replace(/OFFSET.*/, `OFFSET ${x.toFixed(6)} ${(-z).toFixed(6)} ${y.toFixed(6)}`);
    });
    const motion = lines.slice(motionStart).map((line) => {
      if (line.trim() === "") return line;
      const values = line.split(" ").map(Number);
      const turned = [values[0], -values[2], values[1], 0, 0, -values[3]];
      for (let index = 6; index < values.length; index += 3) turned.push(0, 0, -values[index]);
      return turned.map((value) => value.toFixed(6)).join(" ");
    });
    return [...header, ...motion].join("\n");
  }

  const reframed = bvhToClip(parseBvh(reframe(sample), "reframed"), catalog.rig, readOptions);
  const native = bvhToClip(parseBvh(sample, "native"), catalog.rig, readOptions);
  check(JSON.stringify(reframed.keyframes) === JSON.stringify(native.keyframes),
    "the same clip in another tool's frame did not read back identically");
  check(reframed.dropped.outOfPlaneDegrees === 0, "a reframed export reported out-of-plane rotation");

  function withJointPositions(text: string): string {
    const parsed = parseBvh(text, "source");
    const lines = text.split("\n");
    const motionStart = lines.findIndex((line) => line.startsWith("Frame Time:")) + 1;
    const header = lines.slice(0, motionStart).map((line) => (
      line.trim().startsWith("CHANNELS 3")
        ? line.replace("CHANNELS 3 Zrotation Xrotation Yrotation",
          "CHANNELS 6 Xposition Yposition Zposition Zrotation Xrotation Yrotation")
        : line
    ));
    const motion = parsed.frames.map((frame) => {
      const values: number[] = [];
      for (const node of parsed.nodes) {
        const own = frame.slice(node.channelStart, node.channelStart + node.channels.length);
        if (node.parent >= 0) values.push(...node.offset);
        values.push(...own);
      }
      return values.map((value) => value.toFixed(6)).join(" ");
    });
    return [...header, ...motion, ""].join("\n");
  }

  const positioned = bvhToClip(parseBvh(withJointPositions(sample), "positioned"), catalog.rig, readOptions);
  check(positioned.dropped.depthUnits === 0,
    `a joint at its own OFFSET was reported as ${positioned.dropped.depthUnits.toFixed(3)} units of dropped translation`);
  check(JSON.stringify(positioned.keyframes) === JSON.stringify(native.keyframes),
    "position channels holding the rest pose changed the imported clip");

  const lines = sample.split("\n");
  const motionStart = lines.findIndex((line) => line.startsWith("Frame Time:")) + 1;
  const tilted = lines.map((line, index) => {
    if (index < motionStart || line.trim() === "") return line;
    const values = line.split(" ");
    values[4] = "7.500000";
    return values.join(" ");
  }).join("\n");
  const tiltedRead = bvhToClip(parseBvh(tilted, "tilted"), catalog.rig, readOptions);
  check(Math.abs(tiltedRead.dropped.outOfPlaneDegrees - 7.5) < 0.001,
    "out-of-plane rotation was not measured");
  check(tiltedRead.dropped.bones.includes("pelvis"),
    "out-of-plane rotation did not name the bone it came from");
  check(JSON.stringify(tiltedRead.keyframes) === JSON.stringify(native.keyframes),
    "out-of-plane rotation changed the imported pose");

  const translated = lines.map((line, index) => {
    if (index < motionStart || line.trim() === "") return line;
    const values = line.split(" ");
    values[0] = "2.500000";
    values[2] = "3.250000";
    return values.join(" ");
  }).join("\n");
  const translatedRead = bvhToClip(parseBvh(translated, "translated"), catalog.rig, readOptions);
  check(Math.abs(translatedRead.dropped.horizontalUnits - 2.5) < 0.001,
    "horizontal root travel was not measured");
  check(Math.abs(translatedRead.dropped.depthUnits - 3.25) < 0.001,
    "root depth travel was not measured");
  check(translatedRead.dropped.horizontalBones.includes("pelvis"),
    "horizontal root travel did not name the bone it came from");
  check(translatedRead.dropped.depthBones.includes("pelvis"),
    "root depth travel did not name the bone it came from");

  const rig = catalog.rig;
  const bandaiNamco = catalog.bandaiNamco;
  const good = {
    key: "labProbe",
    derivedFrom: null,
    loop: false,
    duration: 4,
    easing: "linear",
    note: "Exchange guard fixture.",
    keyframes: [
      { frame: 0, bones: { torso: { rotation: 0 } } },
      { frame: 4, bones: { torso: { rotation: 9 } } },
    ],
  };
  validateAuthoredClip(structuredClone(good), { rig, bandaiNamco });
  rejects("unprefixed key", () => validateAuthoredClip({ ...structuredClone(good), key: "probe" }, { rig, bandaiNamco }));
  rejects("adaptation with no origin", () => validateAuthoredClip(
    { ...structuredClone(good), key: "bnrProbe", derivedFrom: null }, { rig, bandaiNamco },
  ));
  rejects("origin outside the manifest", () => validateAuthoredClip(
    { ...structuredClone(good), key: "bnrProbe", derivedFrom: "bnrNotAClip" }, { rig, bandaiNamco },
  ));
  rejects("original claiming an origin", () => validateAuthoredClip(
    { ...structuredClone(good), derivedFrom: "bnrStrikeNormal" }, { rig, bandaiNamco },
  ));
  rejects("unknown bone", () => validateAuthoredClip({
    ...structuredClone(good),
    keyframes: [{ frame: 0, bones: { tail: { rotation: 0 } } }],
  }, { rig, bandaiNamco }));
  rejects("unordered keyframes", () => validateAuthoredClip({
    ...structuredClone(good),
    keyframes: [
      { frame: 4, bones: { torso: { rotation: 0 } } },
      { frame: 0, bones: { torso: { rotation: 9 } } },
    ],
  }, { rig, bandaiNamco }));
  rejects("keyframe past duration", () => validateAuthoredClip({
    ...structuredClone(good),
    keyframes: [...structuredClone(good).keyframes, { frame: 9, bones: { torso: { rotation: 1 } } }],
  }, { rig, bandaiNamco }));
  rejects("open loop seam", () => validateAuthoredClip({ ...structuredClone(good), loop: true }, { rig, bandaiNamco }));
  rejects("file name mismatch", () => validateAuthoredClip(
    structuredClone(good), { file: "somethingElse.json", rig, bandaiNamco },
  ));

  return { ok: failures.length === 0, clips: Object.keys(clips).length, failures };
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  try {
    const report = checkExchange();
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else if (!report.ok) for (const failure of report.failures) console.error(`check:exchange: ${failure}`);
    else console.log(`check:exchange: ${report.clips} clips round trip inside the reduction tolerances`);
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (asJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`check:exchange: ${message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
