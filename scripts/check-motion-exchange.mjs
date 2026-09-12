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

// A tool hands back the rig in whatever frame it uses itself — Blender writes this skeleton
// z-up with its rotation channels in its own order — so the same clip has to survive being
// re-expressed. This is our own export rotated into that frame, joint offsets and channel
// names together.
function reframe(text) {
  const lines = text.split("\n");
  const motionStart = lines.findIndex((line) => line.startsWith("Frame Time:")) + 1;
  // Stand the skeleton up along +Z instead of +Y, a quarter turn about X, and move the planar
  // rotation to the channel that now turns about the depth axis.
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

const reframed = bvhToClip(parseBvh(reframe(sample), "reframed"), catalog.rig, { loop: false, tolerances });
const native = bvhToClip(parseBvh(sample, "native"), catalog.rig, { loop: false, tolerances });
check(JSON.stringify(reframed.keyframes) === JSON.stringify(native.keyframes),
  "the same clip read in another tool's frame did not come back the same");
check(reframed.dropped.outOfPlaneDegrees === 0, "a reframed export reported out-of-plane rotation");

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
