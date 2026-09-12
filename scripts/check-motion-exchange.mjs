/**
 * Guards the exchange with external tools, the way assert-local-only guards the runtime.
 *
 * The promise `npm run export:motions` makes is that an untouched round trip changes nothing
 * and that everything the rig cannot hold is reported rather than silently dropped. Both are
 * cheap to assert and expensive to discover by hand after an afternoon of animating.
 */
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { parseBvh } from "./motion/bvh.mjs";
import { bvhToClip } from "./motion/bvh-read.mjs";
import { clipToBvh } from "./motion/bvh-write.mjs";
import { buildCatalog, validateAuthoredClip } from "./motion/catalog.mjs";
import { samplePose } from "./motion/clip.mjs";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const catalog = buildCatalog(root);
const tolerances = catalog.manifest.defaults;
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

function rejects(label, act) {
  try {
    act();
    failures.push(`${label}: accepted input it should refuse`);
  } catch {
    /* refusing is the expected outcome */
  }
}

for (const [key, clip] of Object.entries(catalog.clips)) {
  const text = clipToBvh(clip, catalog.rig);
  const read = bvhToClip(parseBvh(text, key), catalog.rig, { loop: clip.loop, tolerances });
  check(read.duration === clip.duration, `${key}: duration ${read.duration} after a round trip, expected ${clip.duration}`);
  check(read.dropped.outOfPlaneDegrees === 0, `${key}: reported out-of-plane rotation in its own export`);
  check(read.dropped.horizontalUnits === 0, `${key}: reported horizontal travel in its own export`);

  let worstRotation = 0;
  let worstPosition = 0;
  const returned = { duration: read.duration, loop: clip.loop, keyframes: read.keyframes };
  for (let frame = 0; frame <= clip.duration; frame += 1) {
    const before = samplePose(clip, frame);
    const after = samplePose(returned, frame);
    for (const bone of Object.keys(before)) {
      worstRotation = Math.max(worstRotation, Math.abs((after[bone]?.rotation ?? 0) - (before[bone].rotation ?? 0)));
      worstPosition = Math.max(worstPosition, Math.abs((after[bone]?.y ?? 0) - (before[bone].y ?? 0)));
    }
  }
  check(worstRotation <= tolerances.angleTolerance,
    `${key}: round trip moved a bone ${worstRotation.toFixed(3)}°, past the ${tolerances.angleTolerance}° reduction tolerance`);
  check(worstPosition <= tolerances.positionTolerance,
    `${key}: round trip moved the pelvis ${worstPosition.toFixed(3)} units, past the ${tolerances.positionTolerance} tolerance`);
}

// A tool that hands back a different skeleton, or the same skeleton at the wrong rate, is a
// mistake worth stopping at the door: the numbers would mean something else on this rig.
const sample = clipToBvh(catalog.clips.bnrStrikeNormal, catalog.rig);
rejects("foreign skeleton", () =>
  bvhToClip(parseBvh(sample.replace(/\btorso\b/, "chest"), "renamed"), catalog.rig, { loop: false, tolerances }));
rejects("extra joint", () =>
  bvhToClip(parseBvh(sample.replace("JOINT head", "JOINT tail"), "extra"), catalog.rig, { loop: false, tolerances }));
rejects("wrong frame rate", () =>
  bvhToClip(parseBvh(sample.replace(/Frame Time: [\d.]+/, "Frame Time: 0.0333333"), "30fps"), catalog.rig, { loop: false, tolerances }));
rejects("rest offset drift", () =>
  bvhToClip(parseBvh(sample.replace("OFFSET 11.000000 22.000000", "OFFSET 11.000000 30.000000"), "drift"), catalog.rig, { loop: false, tolerances }));

// Out-of-plane work is measured and dropped, not quietly kept.
const lines = sample.split("\n");
const motionStart = lines.findIndex((line) => line.startsWith("Frame Time:")) + 1;
const tilted = lines.map((line, index) => {
  if (index < motionStart || line.trim() === "") return line;
  const values = line.split(" ");
  values[4] = "7.500000";
  return values.join(" ");
}).join("\n");
const tiltedRead = bvhToClip(parseBvh(tilted, "tilted"), catalog.rig, { loop: false, tolerances });
check(Math.abs(tiltedRead.dropped.outOfPlaneDegrees - 7.5) < 0.001, "out-of-plane rotation was not measured");
check(tiltedRead.dropped.bones.includes("pelvis"), "out-of-plane rotation did not name the bone it came from");
check(JSON.stringify(tiltedRead.keyframes)
  === JSON.stringify(bvhToClip(parseBvh(sample, "flat"), catalog.rig, { loop: false, tolerances }).keyframes),
  "out-of-plane rotation changed the imported pose");

// Authored clips have to say what they are before they ship.
const rig = catalog.rig;
const bandaiNamco = catalog.bandaiNamco;
const good = {
  key: "labProbe",
  derivedFrom: null,
  loop: false,
  duration: 4,
  easing: "linear",
  note: "Exchange guard fixture.",
  keyframes: [{ frame: 0, bones: { torso: { rotation: 0 } } }, { frame: 4, bones: { torso: { rotation: 9 } } }],
};
validateAuthoredClip(structuredClone(good), { rig, bandaiNamco });
rejects("unprefixed key", () => validateAuthoredClip({ ...structuredClone(good), key: "probe" }, { rig, bandaiNamco }));
rejects("adaptation with no origin", () =>
  validateAuthoredClip({ ...structuredClone(good), key: "bnrProbe", derivedFrom: null }, { rig, bandaiNamco }));
rejects("origin outside the manifest", () =>
  validateAuthoredClip({ ...structuredClone(good), key: "bnrProbe", derivedFrom: "bnrNotAClip" }, { rig, bandaiNamco }));
rejects("original claiming an origin", () =>
  validateAuthoredClip({ ...structuredClone(good), derivedFrom: "bnrStrikeNormal" }, { rig, bandaiNamco }));
rejects("unknown bone", () => validateAuthoredClip({
  ...structuredClone(good),
  keyframes: [{ frame: 0, bones: { tail: { rotation: 0 } } }],
}, { rig, bandaiNamco }));
rejects("unordered keyframes", () => validateAuthoredClip({
  ...structuredClone(good),
  keyframes: [{ frame: 4, bones: { torso: { rotation: 0 } } }, { frame: 0, bones: { torso: { rotation: 9 } } }],
}, { rig, bandaiNamco }));
rejects("keyframe past the duration", () => validateAuthoredClip({
  ...structuredClone(good),
  keyframes: [...structuredClone(good).keyframes, { frame: 9, bones: { torso: { rotation: 1 } } }],
}, { rig, bandaiNamco }));
rejects("open loop seam", () => validateAuthoredClip({ ...structuredClone(good), loop: true }, { rig, bandaiNamco }));
rejects("file name mismatch", () =>
  validateAuthoredClip(structuredClone(good), { file: "somethingElse.json", rig, bandaiNamco }));

if (failures.length > 0) {
  for (const failure of failures) console.error(`motion exchange: ${failure}`);
  throw new Error(`motion exchange: ${failures.length} check(s) failed`);
}

console.log(`motion exchange: ${Object.keys(catalog.clips).length} clips round trip inside the reduction tolerance`);
