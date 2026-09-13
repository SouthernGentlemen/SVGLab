import { hierarchyOrder } from "./contract.ts";
import type { Rig } from "./types.ts";
import type { Pose } from "../clips/types.ts";

/**
 * Where each bone ends up, in SVG units with y down and rotation clockwise-positive.
 *
 * This is the same composition a nested SVG transform performs, written out so something that
 * is not a browser can ask the question: `check:blender` compares Blender's joint positions
 * against it, and a contact sheet needs it to draw a skeleton. Keeping one implementation of
 * forward kinematics is the same argument as keeping one sampler.
 */

export interface Placed {
  readonly x: number;
  readonly y: number;
  /** Accumulated rotation in radians, so a tip or an anchor can be carried into world space. */
  readonly rotation: number;
}

export function forwardKinematics(rig: Rig, pose: Pose): Map<string, Placed> {
  const placed = new Map<string, Placed>();
  for (const bone of hierarchyOrder(rig)) {
    const local = pose[bone.name] ?? {};
    const x = bone.offset[0] + (local.x ?? 0);
    const y = bone.offset[1] + (local.y ?? 0);
    const rotation = ((local.rotation ?? 0) * Math.PI) / 180;
    const parent = bone.parent === null ? { x: 0, y: 0, rotation: 0 } : placed.get(bone.parent)!;
    const cos = Math.cos(parent.rotation);
    const sin = Math.sin(parent.rotation);
    placed.set(bone.name, {
      x: parent.x + x * cos - y * sin,
      y: parent.y + x * sin + y * cos,
      rotation: parent.rotation + rotation,
    });
  }
  return placed;
}

/** A point in a bone's own frame, carried into world space by that bone's placement. */
export function inBone(placed: Placed, point: readonly [number, number]): { x: number; y: number } {
  const cos = Math.cos(placed.rotation);
  const sin = Math.sin(placed.rotation);
  return {
    x: placed.x + point[0] * cos - point[1] * sin,
    y: placed.y + point[0] * sin + point[1] * cos,
  };
}
