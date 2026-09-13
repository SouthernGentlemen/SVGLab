import { hierarchyOrder } from "../../src/rig/contract.ts";
import { sampleClip } from "../../src/rig/sample.ts";
import type { Clip } from "../../src/clips/types.ts";
import type { Rig, RigBone } from "../../src/rig/types.ts";

/**
 * SVGLab's 2D rig as a BVH skeleton an external tool can open.
 *
 * SVG points y down and turns clockwise-positive; the exchange layout in the rig contract
 * declares how those values enter BVH. Depth stays empty on purpose: this rig has no third
 * axis, and an editor that moves one is told so on the way back in.
 *
 * The root writes absolute local position rather than a delta, and carries the contract's
 * zero OFFSET so readers that add OFFSET and readers that replace it land in the same place.
 */

function fixed(value: number, places: number): string {
  return (Object.is(value, -0) ? 0 : value).toFixed(places);
}

function hierarchy(rig: Rig): string[] {
  const layout = rig.contract.exchange.bvh;
  const lines: string[] = [];
  const write = (bone: RigBone, depth: number): void => {
    const pad = "  ".repeat(depth);
    const isRoot = bone.parent === null;
    const offset = isRoot
      ? layout.rootOffset
      : [bone.offset[0], -bone.offset[1], 0] as const;
    const channels = isRoot ? layout.rootChannels : layout.jointChannels;
    lines.push(`${pad}${isRoot ? "ROOT" : "JOINT"} ${bone.name}`);
    lines.push(`${pad}{`);
    lines.push(`${pad}  OFFSET ${offset.map((value) => fixed(value, layout.decimals)).join(" ")}`);
    lines.push(`${pad}  CHANNELS ${channels.length} ${channels.join(" ")}`);
    for (const child of bone.children) write(rig.byName.get(child)!, depth + 1);
    if (bone.tip) {
      lines.push(`${pad}  End Site`);
      lines.push(`${pad}  {`);
      lines.push(`${pad}    OFFSET ${fixed(bone.tip[0], layout.decimals)} ${fixed(-bone.tip[1], layout.decimals)} ${fixed(0, layout.decimals)}`);
      lines.push(`${pad}  }`);
    }
    lines.push(`${pad}}`);
  };
  write(rig.byName.get(rig.root)!, 0);
  return lines;
}

function rootChannel(name: string, pose: { x?: number; y?: number; rotation?: number }, rig: Rig): number {
  const layout = rig.contract.exchange.bvh;
  if (name === "Xposition") return pose.x ?? 0;
  if (name === "Yposition") return layout.rootRestHeight - (pose.y ?? 0);
  if (name === "Zposition") return 0;
  if (name === layout.planarRotationChannel) return layout.rotationSign * (pose.rotation ?? 0);
  return 0;
}

/** Bake one frame per tick through the runtime's one sampler. */
export function clipToBvh(clip: Clip, rig: Rig): string {
  const ordered = hierarchyOrder(rig);
  const root = ordered[0];
  const layout = rig.contract.exchange.bvh;
  const frames: string[] = [];

  for (let frame = 0; frame <= clip.duration; frame += 1) {
    const pose = sampleClip(clip, frame);
    const rootPose = pose[root.name] ?? {};
    const values = layout.rootChannels.map((channel) => rootChannel(channel, rootPose, rig));
    for (const bone of ordered.slice(1)) {
      const rotation = pose[bone.name]?.rotation ?? 0;
      values.push(...layout.jointChannels.map((channel) => (
        channel === layout.planarRotationChannel ? layout.rotationSign * rotation : 0
      )));
    }
    frames.push(values.map((value) => fixed(value, layout.decimals)).join(" "));
  }

  return [
    "HIERARCHY",
    ...hierarchy(rig),
    "MOTION",
    `Frames: ${frames.length}`,
    `Frame Time: ${layout.frameTime.toFixed(7)}`,
    ...frames,
    "",
  ].join("\n");
}
