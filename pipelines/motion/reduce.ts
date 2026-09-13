import type { BonePose, Keyframe } from "../../src/clips/types.ts";
import { sampleClip } from "../../src/rig/sample.ts";

/**
 * Clip arithmetic shared by every motion pipeline.
 *
 * The sampler itself is not here. `src/rig/sample.ts` is what the lab plays, so a pipeline
 * that writes a clip out for an external tool interpolates through that exact function rather
 * than a copy of it — node runs the TypeScript directly. The copy that used to live here was
 * linear-only and silently disagreed with the runtime by 8.6 degrees on a smoothstep clip,
 * which is the failure a parity test is supposed to prevent and cannot.
 */
export { sampleClip };

export const roundRotation = (value: number, places = 1): number => (
  Math.round(value * 10 ** places) / 10 ** places
);

export const roundPosition = (value: number, places = 2): number => (
  Math.round(value * 10 ** places) / 10 ** places
);

export const PROPERTIES = ["x", "y", "rotation"] as const satisfies readonly (keyof BonePose)[];

/** Douglas-Peucker over one channel: keep only the samples a linear reading would miss. */
export function simplify(values: readonly number[], tolerance: number): number[] {
  const keep = new Set([0, values.length - 1]);
  const visit = (start: number, end: number): void => {
    if (end - start < 2) return;
    let largestError = -1;
    let largestIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const progress = (index - start) / (end - start);
      const interpolated = values[start] + (values[end] - values[start]) * progress;
      const error = Math.abs(values[index] - interpolated);
      if (error > largestError) {
        largestError = error;
        largestIndex = index;
      }
    }
    if (largestError > tolerance) {
      keep.add(largestIndex);
      visit(start, largestIndex);
      visit(largestIndex, end);
    }
  };
  visit(0, values.length - 1);
  return [...keep].sort((a, b) => a - b);
}

export type Channels = Readonly<Record<string, Partial<Record<keyof BonePose, readonly number[]>>>>;

export interface ReductionOptions {
  readonly angleTolerance: number;
  readonly positionTolerance: number;
  readonly rotationPrecision: number;
  readonly positionPrecision: number;
}

/**
 * Turns dense per-frame channels back into the sparse keyframes the lab ships.
 *
 * `channels` is `{ [bone]: { [property]: number[] } }` with one value per frame. Channels that
 * never move keep their first sample only, so a clip that touches four bones stays a clip that
 * touches four bones after a round trip through a tool that writes every bone every frame.
 */
export function keyframesFromChannels(channels: Channels, tolerances: ReductionOptions): Keyframe[] {
  const byFrame = new Map<number, Keyframe>();
  const put = (frame: number, bone: string, property: keyof BonePose, value: number): void => {
    const keyframe = byFrame.get(frame) ?? { frame, bones: {} };
    const rounded = property === "rotation"
      ? roundRotation(value, tolerances.rotationPrecision)
      : roundPosition(value, tolerances.positionPrecision);
    keyframe.bones[bone] = { ...keyframe.bones[bone], [property]: rounded };
    byFrame.set(frame, keyframe);
  };

  for (const [bone, properties] of Object.entries(channels)) {
    for (const [propertyName, values] of Object.entries(properties)) {
      const property = propertyName as keyof BonePose;
      const tolerance = property === "rotation" ? tolerances.angleTolerance : tolerances.positionTolerance;
      const span = Math.max(...values) - Math.min(...values);
      if (span <= tolerance) {
        const nonzero = values.some((value) => property === "rotation"
          ? roundRotation(value, tolerances.rotationPrecision) !== 0
          : roundPosition(value, tolerances.positionPrecision) !== 0);
        if (nonzero) put(0, bone, property, values[0]);
        continue;
      }
      for (const index of simplify(values, tolerance)) put(index, bone, property, values[index]);
    }
  }

  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}
