import { hierarchyOrder } from "./rig.mjs";
import { keyframesFromChannels, round, samplePose } from "./clip.mjs";
import { FRAME_TIME, rootRestHeight } from "./bvh-write.mjs";

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

  const ratios = ordered.slice(1)
    .map((bone) => ({ bone, node: nodes.get(bone.name) }))
    .filter(({ bone }) => Math.hypot(bone.x, bone.y) > 0.001)
    .map(({ bone, node }) => Math.hypot(node.offset[0], node.offset[1]) / Math.hypot(bone.x, bone.y));
  const scale = ratios.length === 0 ? 1 : ratios.sort((a, b) => a - b)[Math.floor(ratios.length / 2)];
  if (!Number.isFinite(scale) || scale <= 0) throw new Error("BVH offsets are not a scaled copy of this rig");
  for (const bone of ordered.slice(1)) {
    const node = nodes.get(bone.name);
    const expected = [bone.x * scale, -bone.y * scale];
    const drift = Math.hypot(node.offset[0] - expected[0], node.offset[1] - expected[1]);
    if (drift > 0.01 * Math.max(1, scale)) {
      throw new Error(`'${bone.name}' rest offset is ${node.offset.slice(0, 2).map((value) => value.toFixed(3)).join(", ")} but this rig authors ${expected.map((value) => value.toFixed(3)).join(", ")}`);
    }
  }

  const channelIndex = (node, channel) => {
    const offset = node.channels.indexOf(channel);
    return offset < 0 ? -1 : node.channelStart + offset;
  };
  const channels = {};
  const dropped = { outOfPlaneDegrees: 0, depthUnits: 0, horizontalUnits: 0, bones: new Set() };
  const frameCount = bvh.frames.length;
  const restHeight = rootRestHeight(rig);

  for (const bone of ordered) {
    const node = nodes.get(bone.name);
    const zRotation = channelIndex(node, "Zrotation");
    if (zRotation < 0) throw new Error(`'${bone.name}' has no Zrotation channel`);
    const rotation = [];
    for (let frame = 0; frame < frameCount; frame += 1) rotation.push(-bvh.frames[frame][zRotation]);

    for (const channel of ["Xrotation", "Yrotation"]) {
      const index = channelIndex(node, channel);
      if (index < 0) continue;
      for (let frame = 0; frame < frameCount; frame += 1) {
        const value = Math.abs(bvh.frames[frame][index]);
        if (value > 0.001) dropped.bones.add(bone.name);
        dropped.outOfPlaneDegrees = Math.max(dropped.outOfPlaneDegrees, value);
      }
    }

    const properties = { rotation };
    if (bone.parent === null) {
      const yIndex = channelIndex(node, "Yposition");
      if (yIndex >= 0) {
        const y = [];
        for (let frame = 0; frame < frameCount; frame += 1) y.push(restHeight - bvh.frames[frame][yIndex] / scale);
        properties.y = y;
      }
      for (const [channel, key] of [["Xposition", "horizontalUnits"], ["Zposition", "depthUnits"]]) {
        const index = channelIndex(node, channel);
        if (index < 0) continue;
        for (let frame = 0; frame < frameCount; frame += 1) {
          dropped[key] = Math.max(dropped[key], Math.abs(bvh.frames[frame][index] / scale));
        }
      }
    } else {
      for (const channel of ["Xposition", "Yposition", "Zposition"]) {
        const index = channelIndex(node, channel);
        if (index < 0) continue;
        for (let frame = 0; frame < frameCount; frame += 1) {
          dropped.depthUnits = Math.max(dropped.depthUnits, Math.abs(bvh.frames[frame][index] / scale));
        }
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
