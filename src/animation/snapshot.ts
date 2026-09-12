import type { FighterState } from "../combat/types";
import { CLIPS } from "./clips";
import { sampleClip } from "./sample";
import type { AnimationClip, Pose } from "./types";

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
    ? fighter.move === "sword" ? "bnrSwordSlashNormal" : "bnrStrikeNormal"
    : fighter.mode === "walk"
      ? "bnrWalkNormal"
      : fighter.mode === "crouch"
        ? "bnrCrouchNormal"
        : fighter.mode === "jump"
          ? "bnrDashNormal"
      : fighter.mode === "hitstun" || fighter.mode === "defeated"
        ? "bnrCrouchNormal"
        : "bnrIdleNormal";
  const clip = CLIPS[clipName];
  const frame = fighter.mode === "attack" ? fighter.moveFrame : fighter.stateFrame;
  return { clip: clipName, frame, duration: clip.duration, loop: clip.loop, easing: clip.easing, note: clip.note, pose: sampleClip(clip, frame) };
}
