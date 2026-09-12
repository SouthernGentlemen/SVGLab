import { hierarchyOrder } from "./rig.mjs";
import { keyframesFromChannels, round, samplePose } from "./clip.mjs";
import { FRAME_TIME } from "./bvh-write.mjs";

/**
 * Reading an edited BVH back onto SVGLab's rig.
 *
 * The rig is the contract: same bones, same parents, same rest offsets, or the numbers in the
 * file describe a different skeleton and mean something else on this one. A uniform scale is
 * allowed because an importer may apply one, and rotations do not care; the root's travel is
 * divided back out by the measured factor.
 *
 * Everything the rig cannot hold — rotation off the plane, depth translation, horizontal root
 * travel the pipeline removes on purpose — is measured and returned so the caller can say what
 * it dropped instead of quietly discarding an editor's work.
 */

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const length = (v) => Math.hypot(...v);
const scaled = (v, factor) => v.map((value) => value * factor);
const AXES = [["Xrotation", [1, 0, 0]], ["Yrotation", [0, 1, 0]], ["Zrotation", [0, 0, 1]]];

/**
 * Which way this file draws the rig.
 *
 * SVGLab writes its own exports y-up with the drawing's y axis inverted, but a tool hands back
 * whatever it uses itself — Blender writes the same skeleton z-up — and a file is only worth
 * reading if it is the same rig however it is oriented. So the drawing's own axes are measured
 * from the offsets: bones that move purely along the authored x axis give one, bones that move
 * purely along the authored y axis give the other, and their cross product is the depth the rig
 * cannot use. Rotation then comes from whichever channel turns about that depth, with the sign
 * the two axes imply, and every bone's offset is checked against the result.
 */
function measureFrame(ordered, nodes) {
  const samples = { x: [], y: [] };
  for (const bone of ordered.slice(1)) {
    const offset = nodes.get(bone.name).offset;
    if (Math.abs(bone.x) > 0.001 && Math.abs(bone.y) < 0.001) samples.x.push(scaled(offset, 1 / bone.x));
    if (Math.abs(bone.y) > 0.001 && Math.abs(bone.x) < 0.001) samples.y.push(scaled(offset, 1 / bone.y));
  }
  if (samples.x.length === 0 || samples.y.length === 0) {
    throw new Error("cannot tell which way this file draws the rig: no bone moves along one axis alone");
  }

  const average = (rows) => [0, 1, 2].map((axis) => rows.reduce((sum, row) => sum + row[axis], 0) / rows.length);
  const xScaled = average(samples.x);
  const yScaled = average(samples.y);
  const scale = (length(xScaled) + length(yScaled)) / 2;
  if (!Number.isFinite(scale) || scale <= 0.0001) throw new Error("BVH offsets are not a copy of this rig");

  const xAxis = scaled(xScaled, 1 / length(xScaled));
  const yAxis = scaled(yScaled, 1 / length(yScaled));
  if (Math.abs(dot(xAxis, yAxis)) > 0.02) throw new Error("this file's rig axes are not square to each other");
  if (Math.abs(length(xScaled) - length(yScaled)) > 0.02 * scale) {
    throw new Error("this file scales the rig unevenly; the proportions are the contract");
  }

  const depth = cross(xAxis, yAxis);
  const [rotationChannel, axis] = AXES
    .map((entry) => [entry[0], entry[1], Math.abs(dot(depth, entry[1]))])
    .sort((a, b) => b[2] - a[2])[0];
  const rotationSign = Math.sign(dot(depth, axis));

  for (const bone of ordered.slice(1)) {
    const offset = nodes.get(bone.name).offset;
    const expected = [0, 1, 2].map((index) => (xAxis[index] * bone.x + yAxis[index] * bone.y) * scale);
    const drift = length([0, 1, 2].map((index) => offset[index] - expected[index]));
    if (drift > 0.01 * Math.max(1, scale)) {
      throw new Error(`'${bone.name}' rest offset is ${offset.map((value) => value.toFixed(3)).join(", ")} but this rig authors ${expected.map((value) => value.toFixed(3)).join(", ")}`);
    }
  }

  return { scale, x: xAxis, y: yAxis, depth, rotationChannel, rotationSign };
}

export function bvhToClip(bvh, rig, options) {
  const ordered = hierarchyOrder(rig);
  const nodes = new Map(bvh.nodes.map((node) => [node.name, node]));

  for (const bone of ordered) {
    const node = nodes.get(bone.name);
    if (!node) throw new Error(`BVH has no '${bone.name}' joint; the skeleton is not this rig`);
  }
  const extra = bvh.nodes.filter((node) => !rig.byName.has(node.name));
  if (extra.length > 0) throw new Error(`BVH has joints this rig does not: ${extra.map((node) => node.name).join(", ")}`);
  for (const bone of ordered.slice(1)) {
    const parent = bvh.nodes[nodes.get(bone.name).parent];
    if (parent?.name !== bone.parent) {
      throw new Error(`'${bone.name}' hangs off '${parent?.name ?? "nothing"}' but this rig parents it to '${bone.parent}'`);
    }
  }

  if (Math.abs(bvh.frameTime - FRAME_TIME) > 0.0001) {
    throw new Error(`expected 60 FPS (frame time ${FRAME_TIME.toFixed(7)}), found ${(1 / bvh.frameTime).toFixed(3)} FPS; set the scene to 60 and export again`);
  }

  const frame = measureFrame(ordered, nodes);
  const { scale, x: xAxis, y: yAxis, depth, rotationChannel, rotationSign } = frame;

  const channelIndex = (node, channel) => {
    const offset = node.channels.indexOf(channel);
    return offset < 0 ? -1 : node.channelStart + offset;
  };
  const channels = {};
  const dropped = { outOfPlaneDegrees: 0, depthUnits: 0, horizontalUnits: 0, bones: new Set() };
  const frameCount = bvh.frames.length;

  for (const bone of ordered) {
    const node = nodes.get(bone.name);
    const planar = channelIndex(node, rotationChannel);
    if (planar < 0) throw new Error(`'${bone.name}' has no ${rotationChannel} channel`);
    const rotation = [];
    for (let index = 0; index < frameCount; index += 1) rotation.push(rotationSign * bvh.frames[index][planar]);

    for (const channel of ["Xrotation", "Yrotation", "Zrotation"].filter((name) => name !== rotationChannel)) {
      const index = channelIndex(node, channel);
      if (index < 0) continue;
      for (let index2 = 0; index2 < frameCount; index2 += 1) {
        const value = Math.abs(bvh.frames[index2][index]);
        if (value > 0.001) dropped.bones.add(bone.name);
        dropped.outOfPlaneDegrees = Math.max(dropped.outOfPlaneDegrees, value);
      }
    }

    const properties = { rotation };
    const position = ["Xposition", "Yposition", "Zposition"].map((channel) => channelIndex(node, channel));
    if (bone.parent === null && position.some((index) => index >= 0)) {
      const vertical = [];
      for (let index = 0; index < frameCount; index += 1) {
        const point = position.map((column) => (column < 0 ? 0 : bvh.frames[index][column]));
        // The root's travel is read in the rig's own axes: along the drawing, down it, and
        // into the depth the rig has no room for.
        vertical.push(dot(point, yAxis) / scale - rig.byName.get(bone.name).y);
        dropped.horizontalUnits = Math.max(dropped.horizontalUnits, Math.abs(dot(point, xAxis) / scale));
        dropped.depthUnits = Math.max(dropped.depthUnits, Math.abs(dot(point, depth) / scale));
      }
      properties.y = vertical;
    } else if (position.some((index) => index >= 0)) {
      for (let index = 0; index < frameCount; index += 1) {
        const point = position.map((column) => (column < 0 ? 0 : bvh.frames[index][column]));
        dropped.depthUnits = Math.max(dropped.depthUnits, Math.hypot(...point) / scale);
      }
    }
    channels[bone.name] = properties;
  }

  const duration = frameCount - 1;
  if (duration <= 0) throw new Error("BVH has no animation to read");
  let keyframes = keyframesFromChannels(channels, options.tolerances);
  let seamDegrees = 0;

  if (options.loop) {
    const first = samplePose({ duration, loop: false, keyframes }, 0);
    const last = samplePose({ duration, loop: false, keyframes }, duration);
    for (const bone of Object.keys(first)) {
      seamDegrees = Math.max(seamDegrees, Math.abs((last[bone].rotation ?? 0) - (first[bone].rotation ?? 0)));
    }
    const closing = keyframes.find((keyframe) => keyframe.frame === duration);
    const opening = keyframes.find((keyframe) => keyframe.frame === 0);
    const bones = structuredClone(opening.bones);
    if (closing) closing.bones = bones;
    else keyframes = [...keyframes, { frame: duration, bones }].sort((a, b) => a.frame - b.frame);
  }

  return { duration, keyframes, scale: round(scale), dropped: { ...dropped, bones: [...dropped.bones].sort() }, seamDegrees };
}
