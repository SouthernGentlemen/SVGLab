import type { AnimationClip, AnimationKeyframe } from "./types";

export interface SwordReferenceWeaponPose {
  readonly x: number;
  readonly y: number;
  /** Fighter-space blade angle in SVG degrees. Zero is straight up. */
  readonly angle: number;
}

export interface SwordReferenceFrame {
  readonly frame: number;
  readonly label: string;
  readonly sword: SwordReferenceWeaponPose;
  /** Body-only pose. The two arm chains are solved onto the rigid sword at render time. */
  readonly bones: AnimationKeyframe["bones"];
}

interface SwordReferenceSequence {
  readonly duration: number;
  readonly loop: boolean;
  readonly note: string;
  readonly frames: readonly SwordReferenceFrame[];
}

function body(
  pelvisX: number,
  pelvisY: number,
  torso: number,
  head: number,
  legFront: number,
  shinFront: number,
  legBack: number,
  shinBack: number,
): AnimationKeyframe["bones"] {
  return {
    pelvis: { x: pelvisX, y: pelvisY },
    torso: { rotation: torso },
    head: { rotation: head },
    "leg-front": { rotation: legFront },
    "shin-front": { rotation: shinFront },
    "leg-back": { rotation: legBack },
    "shin-back": { rotation: shinBack },
  };
}

/**
 * Original SVGLab stick-figure reference.
 *
 * The public references in docs/SWORD-MOTION-REFERENCE.md are study material only. These
 * coordinates are authored here rather than copied from any external sprite sheet. The weapon
 * is the invariant: its geometry and two grip points stay fixed while the body and arm joints
 * conform to it.
 */
const GUARD_FRAMES: readonly SwordReferenceFrame[] = [
  {
    frame: 0,
    label: "upright guard",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0, -2, 2, -15, 28, 22, 18),
  },
  {
    frame: 30,
    label: "guard settle",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0.6, 0, 0, -14, 27, 21, 19),
  },
  {
    frame: 60,
    label: "upright guard",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0, -2, 2, -15, 28, 22, 18),
  },
];

/**
 * A compact, committed descending cut based on real longsword mechanics.
 *
 * The fighter coils into a high guard, then the rear side drives the pelvis and chest through
 * the strike. The sword accelerates sharply into longpoint and then BRAKES while the body keeps
 * travelling underneath it. That body-after-blade timing is the follow-through: contact is not
 * a stop, but neither is it an excuse to spin the weapon around the fighter. Recovery begins
 * only after the forward finish has settled, then the hands withdraw and re-chamber to guard.
 */
const OBERHAU_FRAMES: readonly SwordReferenceFrame[] = [
  {
    frame: 0,
    label: "guard",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0, -2, 2, -15, 28, 22, 18),
  },
  {
    frame: 4,
    label: "coil",
    sword: { x: 0, y: -19, angle: -18 },
    bones: body(-4, 2, -22, 12, -3, 38, 34, 28),
  },
  {
    frame: 7,
    label: "loaded",
    sword: { x: -2, y: -24, angle: -20 },
    bones: body(-5, 3, -28, 16, 4, 46, 42, 32),
  },
  {
    frame: 9,
    label: "release",
    sword: { x: 2, y: -20, angle: 5 },
    bones: body(0, 1, -12, 8, -10, 32, 30, 22),
  },
  {
    frame: 11,
    label: "drive",
    sword: { x: 6, y: -15, angle: 35 },
    bones: body(4, 0, 8, -6, -26, 20, 16, 28),
  },
  {
    frame: 13,
    label: "cut",
    sword: { x: 10, y: -9, angle: 68 },
    bones: body(8, -1, 22, -14, -36, 15, 6, 34),
  },
  {
    frame: 14,
    label: "impact",
    sword: { x: 12, y: -5, angle: 88 },
    bones: body(10, -1, 32, -20, -42, 14, 2, 36),
  },
  {
    frame: 16,
    label: "longpoint",
    sword: { x: 13, y: 0, angle: 103 },
    bones: body(11, 0, 40, -24, -46, 14, -4, 40),
  },
  {
    frame: 18,
    label: "body follows",
    sword: { x: 13, y: 3, angle: 110 },
    bones: body(14, 2, 47, -28, -48, 16, -8, 44),
  },
  {
    frame: 21,
    label: "braked finish",
    sword: { x: 12, y: 4, angle: 112 },
    bones: body(15, 3, 43, -26, -46, 18, -6, 42),
  },
  {
    frame: 24,
    label: "settle",
    sword: { x: 11, y: 2, angle: 108 },
    bones: body(14, 2, 36, -20, -42, 20, 0, 38),
  },
  {
    frame: 29,
    label: "withdraw",
    sword: { x: 8, y: -2, angle: 75 },
    bones: body(10, 1, 24, -12, -32, 24, 10, 30),
  },
  {
    frame: 35,
    label: "re-chamber",
    sword: { x: 5, y: -10, angle: 28 },
    bones: body(5, 1, 8, -5, -24, 26, 18, 24),
  },
  {
    frame: 42,
    label: "guard",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0, -2, 2, -15, 28, 22, 18),
  },
];

function slowed(frames: readonly SwordReferenceFrame[], factor: number): SwordReferenceFrame[] {
  return frames.map((entry) => ({ ...entry, frame: entry.frame * factor }));
}

export const SWORD_REFERENCE_SEQUENCES = {
  swordGuardReference: {
    duration: 60,
    loop: true,
    note: "SVGLab upright two-hand guard. The rigid blade stays vertical while the stance settles underneath it.",
    frames: GUARD_FRAMES,
  },
  swordOberhauReference: {
    duration: 42,
    loop: false,
    note: "SVGLab reference-driven oberhau: high-guard load, hip-driven cut, longpoint, blade braking, body follow-through, then controlled withdrawal and re-chamber.",
    frames: OBERHAU_FRAMES,
  },
  swordOberhauStudyReference: {
    duration: 84,
    loop: false,
    note: "The authored SVGLab oberhau at half speed for frame-by-frame joint, braking, and body-follow-through inspection.",
    frames: slowed(OBERHAU_FRAMES, 2),
  },
} as const satisfies Record<string, SwordReferenceSequence>;

export type SwordReferenceClipName = keyof typeof SWORD_REFERENCE_SEQUENCES;

function clip(name: SwordReferenceClipName): AnimationClip {
  const sequence = SWORD_REFERENCE_SEQUENCES[name];
  return {
    name,
    loop: sequence.loop,
    duration: sequence.duration,
    easing: "linear",
    note: sequence.note,
    keyframes: sequence.frames.map((entry) => ({ frame: entry.frame, bones: entry.bones })),
  };
}

export const AUTHORED_SWORD_CLIPS = {
  swordGuardReference: clip("swordGuardReference"),
  swordOberhauReference: clip("swordOberhauReference"),
  swordOberhauStudyReference: clip("swordOberhauStudyReference"),
} as const satisfies Record<SwordReferenceClipName, AnimationClip>;

export function isSwordReferenceClip(name: string): name is SwordReferenceClipName {
  return Object.prototype.hasOwnProperty.call(SWORD_REFERENCE_SEQUENCES, name);
}

export function swordReferenceFrames(name: string): readonly SwordReferenceFrame[] | null {
  if (!isSwordReferenceClip(name)) return null;
  return SWORD_REFERENCE_SEQUENCES[name].frames;
}
