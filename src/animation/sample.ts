import type { AnimationClip, BonePose, Pose } from "./types.ts";

const PROPERTIES = ["x", "y", "rotation"] as const satisfies readonly (keyof BonePose)[];

/** Linear unless a clip explicitly asks for smoothstep; an absent easing is not a curve. */
function ease(progress: number, easing: AnimationClip["easing"]): number {
  if (easing !== "smoothstep") return progress;
  return progress * progress * (3 - 2 * progress);
}

function clipFrame(clip: AnimationClip, frame: number): number {
  if (clip.duration <= 0) return 0;
  if (clip.loop) return ((frame % clip.duration) + clip.duration) % clip.duration;
  return Math.max(0, Math.min(frame, clip.duration));
}

/**
 * The one sampler. Sparse per-property interpolation keeps the authored keyframes readable.
 *
 * This module imports nothing but its own types, which is what lets a pipeline run it under
 * plain `node` and bake an export through the same code the page draws with. Anything that
 * needs the catalog or combat state belongs in `snapshot.ts`, not here.
 */
export function sampleClip(clip: AnimationClip, frame: number): Pose {
  const at = clipFrame(clip, frame);
  const bones = new Set<string>();
  for (const keyframe of clip.keyframes) Object.keys(keyframe.bones).forEach((bone) => bones.add(bone));
  const pose: Pose = {};

  for (const boneName of bones) {
    const bone: BonePose = {};
    for (const property of PROPERTIES) {
      let beforeFrame = -1;
      let beforeValue = 0;
      let afterFrame = -1;
      let afterValue = 0;
      for (const keyframe of clip.keyframes) {
        const value = keyframe.bones[boneName]?.[property];
        if (value === undefined) continue;
        if (keyframe.frame <= at && keyframe.frame > beforeFrame) {
          beforeFrame = keyframe.frame;
          beforeValue = value;
        } else if (keyframe.frame > at && (afterFrame < 0 || keyframe.frame < afterFrame)) {
          afterFrame = keyframe.frame;
          afterValue = value;
        }
      }
      // A channel first keyed after this tick holds its first authored value. Interpolating
      // towards it from an implied zero invents motion nobody wrote: a torso authored as a
      // constant 40 from tick 4 would swing 0 -> 40 across the ticks before it.
      if (beforeFrame < 0) bone[property] = afterFrame < 0 ? 0 : afterValue;
      else if (afterFrame < 0 || afterFrame === beforeFrame) bone[property] = beforeValue;
      else {
        const progress = ease((at - beforeFrame) / (afterFrame - beforeFrame), clip.easing);
        bone[property] = beforeValue + (afterValue - beforeValue) * progress;
      }
    }
    pose[boneName] = bone;
  }
  return pose;
}
