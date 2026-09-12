import { hierarchyOrder } from "./rig.mjs";
import { samplePose } from "./clip.mjs";

/**
 * SVGLab's 2D rig as a BVH skeleton an external tool can open.
 *
 * SVG points y down and turns clockwise-positive; BVH points y up, so the rig is written into
 * the XY plane with `(x, -y)` and every bone turns about Z with the sign flipped. Depth stays
 * empty on purpose: this rig has no third axis, and an editor that moves one is told so on the
 * way back in.
 *
 * The root writes absolute local position rather than a delta, and carries a zero OFFSET so a
 * reader that adds OFFSET to the channels and a reader that lets the channels replace it both
 * land in the same place.
 */
const CHANNEL_NAMES = {
  root: ["Xposition", "Yposition", "Zposition", "Zrotation", "Xrotation", "Yrotation"],
  joint: ["Zrotation", "Xrotation", "Yrotation"],
};

export const FRAME_TIME = 1 / 60;
export const ROOT_CHANNELS = CHANNEL_NAMES.root;
export const JOINT_CHANNELS = CHANNEL_NAMES.joint;

const fixed = (value) => (Object.is(value, -0) ? 0 : value).toFixed(6);

function hierarchy(rig) {
  const lines = [];
  const write = (bone, depth) => {
    const pad = "  ".repeat(depth);
    const isRoot = bone.parent === null;
    lines.push(`${pad}${isRoot ? "ROOT" : "JOINT"} ${bone.name}`);
    lines.push(`${pad}{`);
    lines.push(`${pad}  OFFSET ${isRoot ? "0.000000 0.000000 0.000000" : `${fixed(bone.x)} ${fixed(-bone.y)} ${fixed(0)}`}`);
    const channels = isRoot ? CHANNEL_NAMES.root : CHANNEL_NAMES.joint;
    lines.push(`${pad}  CHANNELS ${channels.length} ${channels.join(" ")}`);
    for (const child of bone.children) write(rig.byName.get(child), depth + 1);
    if (bone.tip) {
      lines.push(`${pad}  End Site`);
      lines.push(`${pad}  {`);
      lines.push(`${pad}    OFFSET ${fixed(bone.tip.x)} ${fixed(-bone.tip.y)} ${fixed(0)}`);
      lines.push(`${pad}  }`);
    }
    lines.push(`${pad}}`);
  };
  write(rig.byName.get(rig.root), 0);
  return lines;
}

/** The rest height of the root joint in BVH's y-up frame. */
export function rootRestHeight(rig) {
  return -rig.byName.get(rig.root).y;
}

export function clipToBvh(clip, rig) {
  const ordered = hierarchyOrder(rig);
  const root = ordered[0];
  const restHeight = rootRestHeight(rig);
  const frames = [];

  for (let frame = 0; frame <= clip.duration; frame += 1) {
    const pose = samplePose(clip, frame);
    const values = [];
    const rootPose = pose[root.name] ?? {};
    values.push(fixed(rootPose.x ?? 0), fixed(restHeight - (rootPose.y ?? 0)), fixed(0));
    values.push(fixed(-(rootPose.rotation ?? 0)), fixed(0), fixed(0));
    for (const bone of ordered.slice(1)) {
      values.push(fixed(-(pose[bone.name]?.rotation ?? 0)), fixed(0), fixed(0));
    }
    frames.push(values.join(" "));
  }

  return [
    "HIERARCHY",
    ...hierarchy(rig),
    "MOTION",
    `Frames: ${frames.length}`,
    `Frame Time: ${FRAME_TIME.toFixed(7)}`,
    ...frames,
    "",
  ].join("\n");
}
