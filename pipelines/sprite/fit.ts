/**
 * Turning cut atlas parts into SVGLab's authored skeleton.
 *
 * The rig this produces is the one `rigs/fighter.rig.json` declares, because the point of
 * the pipeline is that a traced character drops into the shared renderer and every clip
 * plays on it without either learning anything new. So: eleven bones, SVG-native coordinates
 * throughout — y down, rotation clockwise-positive. There is no second coordinate frame here
 * and no flip anywhere.
 *
 * Every skin uses one canonical set of joints. Atlas art is fitted to those joints instead of
 * moving the joints to suit each drawing: that is what makes a clip read as the same movement
 * on every fighter. The target art heights keep elbows, knees, neck and waist overlapped while
 * preserving each drawing's width and silhouette.
 *
 * The old module restated the bone tree, offsets and display heights as constants. C1 makes the
 * rig contract the single source of truth, so the fitting arithmetic survives here while those
 * values are read from the validated rig.
 */

import type { Rig } from "../../src/rig/types.ts";
import type { Island } from "./segment.ts";

export interface PartPoint {
  readonly x: number;
  readonly y: number;
}

export interface FitMeasurements {
  readonly scales: Readonly<Record<string, number>>;
  readonly wrist: Readonly<Record<string, PartPoint>>;
}

/** Where a part's pivot sits inside its own bounding box, as a fraction of width and height. */
const PIVOTS: Readonly<Record<string, readonly [number, number]>> = {
  // A face pivots around the neck, not the bottom of its hair crop. Keeping a little art
  // below the pivot lets the head overlap the collar through turns and mirrored poses.
  head: [0.5, 0.72],
  torso: [0.5, 1],
  pelvis: [0.5, 0.5],
  arm_upper_l: [0.5, 0], arm_lower_l: [0.5, 0], hand_l: [0.5, 0.1],
  arm_upper_r: [0.5, 0], arm_lower_r: [0.5, 0], hand_r: [0.5, 0.1],
  leg_upper_l: [0.5, 0], leg_lower_l: [0.5, 0],
  leg_upper_r: [0.5, 0], leg_lower_r: [0.5, 0],
};

/** Hands are separate cuts drawn into forearms; ten rig units is their authored display height. */
const HAND_ART_HEIGHT = 10;

const round = (n: number): number => Math.round(n * 1000) / 1000;

/** The pivot of a part inside its own crop, in atlas pixels. `override` is a [x, y] fraction. */
export function partPivot(
  slot: string,
  island: Island,
  override?: readonly [number, number],
): PartPoint {
  const [fx, fy] = override ?? PIVOTS[slot] ?? [0.5, 0];
  return { x: island.w * fx, y: island.h * fy };
}

/** Fit an atlas to the shared rig while retaining each part's source aspect ratio. */
export function measureFit(slots: ReadonlyMap<string, Island>, rig: Rig): FitMeasurements {
  const size = (slot: string): Island => {
    const island = slots.get(slot);
    if (!island) throw new Error(`the skeleton needs the ${slot} slot`);
    return island;
  };

  const scales: Record<string, number> = {};
  for (const bone of rig.bones) scales[bone.slot] = round(bone.artHeight / size(bone.slot).h);

  const wrist: Record<string, PartPoint> = {};
  for (const bone of rig.bones) {
    if (!bone.hand) continue;
    scales[bone.hand] = round(HAND_ART_HEIGHT / size(bone.hand).h);
    const grip = rig.contract.anchors[bone.name]?.grip;
    if (!grip) throw new Error(`the skeleton needs the ${bone.name}.grip anchor for ${bone.hand}`);
    wrist[bone.name] = { x: grip.at[0], y: grip.at[1] };
  }

  return { scales, wrist };
}
