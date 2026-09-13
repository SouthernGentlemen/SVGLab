import type { BonePose, Clip, Keyframe } from "../../src/clips/types.ts";
import { jointPositions } from "./bvh-parse.ts";
import type { Bvh, JointPoint } from "./bvh-parse.ts";
import { roundPosition, roundRotation, simplify } from "./reduce.ts";

const ROTATION_BONES = [
  "torso", "head", "arm-back", "forearm-back", "arm-front", "forearm-front",
  "leg-back", "shin-back", "leg-front", "shin-front",
] as const;

const SOURCE_SEGMENTS = {
  torso: ["Hips", "Neck", -90],
  head: ["Neck", "Head", -90],
  armL: ["UpperArm_L", "LowerArm_L", 90],
  forearmL: ["LowerArm_L", "Hand_L", 90],
  armR: ["UpperArm_R", "LowerArm_R", 90],
  forearmR: ["LowerArm_R", "Hand_R", 90],
  legL: ["UpperLeg_L", "LowerLeg_L", 90],
  shinL: ["LowerLeg_L", "Foot_L", 90],
  legR: ["UpperLeg_R", "LowerLeg_R", 90],
  shinR: ["LowerLeg_R", "Foot_R", 90],
} as const satisfies Record<string, readonly [string, string, number]>;

export interface RetargetDefinition {
  readonly key: string;
  readonly sourceStart: number;
  readonly sourceEnd: number;
  readonly targetDuration?: number;
  readonly targetFps: number;
  readonly targetLegLength: number;
  readonly frontSourceSide: "L" | "R";
  readonly angleTolerance: number;
  readonly positionTolerance: number;
  readonly rotationPrecision: number;
  readonly positionPrecision: number;
  readonly maxLoopSeamDegrees: number;
  readonly contactSourceFrame?: number;
  readonly contactTargetFrame?: number;
  readonly activeWindow?: readonly [number, number];
  readonly loop: boolean;
  readonly note: string;
}

type DensePose = Record<string, BonePose> & { pelvis: { y: number } };

function required(positions: ReadonlyMap<string, JointPoint>, name: string): JointPoint {
  const point = positions.get(name);
  if (!point) throw new Error(`BVH skeleton has no '${name}' joint`);
  return point;
}

function project(point: JointPoint): { x: number; y: number } {
  // The selected captures act toward +Z. SVGLab faces right and SVG's vertical axis points down.
  return { x: point.z, y: -point.y };
}

function distance(a: JointPoint, b: JointPoint): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function projectedAngle(
  positions: ReadonlyMap<string, JointPoint>,
  segment: readonly [string, string, number],
  previous: number | undefined,
): number {
  const [fromName, toName, fallback] = segment;
  const from = project(required(positions, fromName));
  const to = project(required(positions, toName));
  if (Math.hypot(to.x - from.x, to.y - from.y) < 0.5) return previous ?? fallback;
  return Math.atan2(to.y - from.y, to.x - from.x) * 180 / Math.PI;
}

function wrap(degrees: number): number {
  return ((degrees + 180) % 360 + 360) % 360 - 180;
}

function unwrapSeries(values: readonly number[]): number[] {
  const result = [values[0]];
  for (let index = 1; index < values.length; index += 1) {
    let value = values[index];
    while (value - result[index - 1] > 180) value -= 360;
    while (value - result[index - 1] < -180) value += 360;
    result.push(value);
  }
  return result;
}


/** Project and collapse the 21-joint source skeleton into SVGLab's eleven-bone 2D rig. */
export function retargetClip(bvh: Bvh, definition: RetargetDefinition): Clip {
  const start = definition.sourceStart;
  const end = definition.sourceEnd;
  if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end >= bvh.frames.length || start >= end) {
    throw new Error(`${definition.key}: invalid source range ${start}-${end}`);
  }

  const firstPositions = jointPositions(bvh, start);
  const firstHips = required(firstPositions, "Hips");
  const sourceLegLength = ["L", "R"].reduce((sum, side) => sum
    + distance(required(firstPositions, `UpperLeg_${side}`), required(firstPositions, `LowerLeg_${side}`))
    + distance(required(firstPositions, `LowerLeg_${side}`), required(firstPositions, `Foot_${side}`)), 0) / 2;
  const positionScale = definition.targetLegLength / sourceLegLength;
  const front = definition.frontSourceSide;
  const back = front === "L" ? "R" : "L";
  const poses: DensePose[] = [];
  const previousAngles: Record<string, number | undefined> = {};

  for (let frame = start; frame <= end; frame += 1) {
    const positions = jointPositions(bvh, frame);
    const angles: Record<string, number> = {};
    for (const [name, segment] of Object.entries(SOURCE_SEGMENTS)) {
      angles[name] = projectedAngle(positions, segment, previousAngles[name]);
      previousAngles[name] = angles[name];
    }
    const torsoRotation = wrap(angles.torso + 90);
    const hips = required(positions, "Hips");
    poses.push({
      pelvis: { y: -(hips.y - firstHips.y) * positionScale },
      torso: { rotation: torsoRotation },
      head: { rotation: wrap(angles.head - angles.torso) },
      "arm-back": { rotation: wrap(angles[`arm${back}`] - torsoRotation - 90) },
      "forearm-back": { rotation: wrap(angles[`forearm${back}`] - angles[`arm${back}`]) },
      "arm-front": { rotation: wrap(angles[`arm${front}`] - torsoRotation - 90) },
      "forearm-front": { rotation: wrap(angles[`forearm${front}`] - angles[`arm${front}`]) },
      "leg-back": { rotation: wrap(angles[`leg${back}`] - 90) },
      "shin-back": { rotation: wrap(angles[`shin${back}`] - angles[`leg${back}`]) },
      "leg-front": { rotation: wrap(angles[`leg${front}`] - 90) },
      "shin-front": { rotation: wrap(angles[`shin${front}`] - angles[`leg${front}`]) },
    });
  }

  for (const bone of ROTATION_BONES) {
    const unwrapped = unwrapSeries(poses.map((pose) => pose[bone].rotation!));
    unwrapped.forEach((value, index) => { poses[index][bone].rotation = value; });
  }

  if (definition.loop) {
    const seam = Math.max(...ROTATION_BONES.map((bone) =>
      Math.abs(poses.at(-1)![bone].rotation! - poses[0][bone].rotation!)));
    if (seam > definition.maxLoopSeamDegrees) {
      throw new Error(`${definition.key}: ${roundRotation(seam)} degree loop seam exceeds ${definition.maxLoopSeamDegrees}`);
    }
    poses.at(-1)!.pelvis.y = poses[0].pelvis.y;
    for (const bone of ROTATION_BONES) poses.at(-1)![bone].rotation = poses[0][bone].rotation;
  }

  const sourceDuration = Math.round((end - start) * bvh.frameTime * definition.targetFps);
  const duration = definition.targetDuration ?? sourceDuration;
  if (!Number.isInteger(duration) || duration <= 0) throw new Error(`${definition.key}: invalid target duration`);
  const targetFrame = (sampleIndex: number): number => Math.round(sampleIndex / (poses.length - 1) * duration);
  if (definition.contactSourceFrame !== undefined) {
    if (definition.contactSourceFrame < start || definition.contactSourceFrame > end) {
      throw new Error(`${definition.key}: contact source frame is outside the selected range`);
    }
    const contactFrame = targetFrame(definition.contactSourceFrame - start);
    if (contactFrame !== definition.contactTargetFrame) {
      throw new Error(`${definition.key}: contact maps to tick ${contactFrame}, expected ${definition.contactTargetFrame}`);
    }
    const active = definition.activeWindow;
    if (!active || !Number.isInteger(active[0]) || !Number.isInteger(active[1]) || active[0] > active[1]) {
      throw new Error(`${definition.key}: contact clip has no valid active window`);
    }
    if (contactFrame < active[0] || contactFrame > active[1]) {
      throw new Error(`${definition.key}: contact tick ${contactFrame} is outside active window ${active[0]}-${active[1]}`);
    }
  }
  const keyframesByFrame = new Map<number, Keyframe>();
  const put = (sampleIndex: number, bone: string, property: keyof BonePose, value: number): void => {
    const frame = targetFrame(sampleIndex);
    const keyframe = keyframesByFrame.get(frame) ?? { frame, bones: {} };
    const target = keyframe.bones[bone] ?? {};
    target[property] = property === "rotation"
      ? roundRotation(value, definition.rotationPrecision)
      : roundPosition(value, definition.positionPrecision);
    keyframe.bones[bone] = target;
    keyframesByFrame.set(frame, keyframe);
  };

  const yValues = poses.map((pose) => pose.pelvis.y);
  for (const index of simplify(yValues, definition.positionTolerance)) put(index, "pelvis", "y", yValues[index]);
  for (const bone of ROTATION_BONES) {
    const values = poses.map((pose) => pose[bone].rotation!);
    for (const index of simplify(values, definition.angleTolerance)) put(index, bone, "rotation", values[index]);
  }

  return {
    name: definition.key,
    loop: definition.loop,
    duration,
    easing: "linear",
    note: definition.note,
    keyframes: [...keyframesByFrame.values()].sort((a, b) => a.frame - b.frame),
  };
}
