import type { FighterState } from "../combat/types";
import { CLIPS } from "./clips";
import type { AnimationClip, BonePose, Pose } from "./types";

const PROPERTIES = ["x", "y", "rotation"] as const satisfies readonly (keyof BonePose)[];

function ease(progress: number, easing: AnimationClip["easing"]): number {
  if (easing === "linear") return progress;
  return progress * progress * (3 - 2 * progress);
}

function clipFrame(clip: AnimationClip, frame: number): number {
  if (clip.duration <= 0) return 0;
  if (clip.loop) return ((frame % clip.duration) + clip.duration) % clip.duration;
  return Math.max(0, Math.min(frame, clip.duration));
}

/** Sparse per-property interpolation keeps the authored keyframes readable. */
export function sampleClip(clip: AnimationClip, frame: number): Pose {
  const at = clipFrame(clip, frame);
  const bones = new Set<string>();
  for (const keyframe of clip.keyframes) Object.keys(keyframe.bones).forEach((bone) => bones.add(bone));
  const pose: Pose = {};

  for (const boneName of bones) {
    const bone: BonePose = {};
    for (const property of PROPERTIES) {
      let beforeFrame = 0;
      let beforeValue = 0;
      let afterFrame = -1;
      let afterValue = 0;
      for (const keyframe of clip.keyframes) {
        const value = keyframe.bones[boneName]?.[property];
        if (value === undefined) continue;
        if (keyframe.frame <= at && keyframe.frame >= beforeFrame) {
          beforeFrame = keyframe.frame;
          beforeValue = value;
        } else if (keyframe.frame > at && (afterFrame < 0 || keyframe.frame < afterFrame)) {
          afterFrame = keyframe.frame;
          afterValue = value;
        }
      }
      if (afterFrame < 0 || afterFrame === beforeFrame) bone[property] = beforeValue;
      else {
        const progress = ease((at - beforeFrame) / (afterFrame - beforeFrame), clip.easing);
        bone[property] = beforeValue + (afterValue - beforeValue) * progress;
      }
    }
    pose[boneName] = bone;
  }
  return pose;
}

export interface AnimationSnapshot {
  clip: keyof typeof CLIPS;
  frame: number;
  duration: number;
  loop: boolean;
  easing: AnimationClip["easing"];
  note: string;
  pose: Pose;
}

/** Presentation chooses a clip from combat state but never writes back to it. */
export function animationSnapshot(fighter: FighterState): AnimationSnapshot {
  const clipName = fighter.mode === "attack"
    ? "bnrStrikeNormal"
    : fighter.mode === "walk"
      ? "bnrWalkNormal"
      : fighter.mode === "crouch"
        ? "crouch"
        : fighter.mode === "jump"
          ? "jump"
      : fighter.mode === "hitstun" || fighter.mode === "defeated"
        ? "hit"
        : "idle";
  const clip = CLIPS[clipName];
  const frame = fighter.mode === "attack" ? fighter.moveFrame : fighter.stateFrame;
  return { clip: clipName, frame, duration: clip.duration, loop: clip.loop, easing: clip.easing, note: clip.note, pose: sampleClip(clip, frame) };
}
