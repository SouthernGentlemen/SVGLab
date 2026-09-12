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
 * A committed descending cut, not a weapon-only swipe.
 *
 * The body first coils away from the target, then the rear side drives the pelvis and torso
 * through contact. Momentum continues after the blade crosses longpoint: the chest, hips and
 * stance overshoot before the fighter can gather the sword and return to guard. The asymmetric
 * recovery is intentional; immediately snapping back to frame zero makes the strike read like
 * the sword merely tapped something.
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
    sword: { x: -1, y: -18, angle: -10 },
    bones: body(-3, 2, -18, 12, -5, 36, 32, 28),
  },
  {
    frame: 8,
    label: "loaded",
    sword: { x: -2, y: -22, angle: -12 },
    bones: body(-4, 2, -24, 15, 2, 42, 38, 30),
  },
  {
    frame: 10,
    label: "release",
    sword: { x: 2, y: -18, angle: 15 },
    bones: body(0, 0, -8, 6, -10, 30, 28, 20),
  },
  {
    frame: 12,
    label: "drive",
    sword: { x: 8, y: -13, angle: 50 },
    bones: body(5, -1, 12, -8, -26, 20, 16, 25),
  },
  {
    frame: 14,
    label: "impact / longpoint",
    sword: { x: 15, y: -6, angle: 88 },
    bones: body(10, -1, 28, -18, -38, 16, 5, 32),
  },
  {
    frame: 16,
    label: "follow through",
    sword: { x: 20, y: 2, angle: 122 },
    bones: body(14, 1, 42, -26, -46, 14, -6, 40),
  },
  {
    frame: 19,
    label: "overshoot",
    sword: { x: 18, y: 8, angle: 148 },
    bones: body(16, 3, 48, -30, -50, 18, -12, 44),
  },
  {
    frame: 23,
    label: "settle",
    sword: { x: 14, y: 6, angle: 126 },
    bones: body(14, 3, 32, -20, -42, 22, -4, 38),
  },
  {
    frame: 28,
    label: "recover",
    sword: { x: 10, y: 1, angle: 84 },
    bones: body(9, 2, 18, -10, -30, 24, 10, 28),
  },
  {
    frame: 34,
    label: "return",
    sword: { x: 5, y: -5, angle: 25 },
    bones: body(4, 1, 6, -4, -22, 26, 18, 22),
  },
  {
    frame: 40,
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
    duration: 40,
    loop: false,
    note: "SVGLab committed descending cut: coil, drive, impact, full-body follow-through, overshoot, and asymmetric recovery.",
    frames: OBERHAU_FRAMES,
  },
  swordOberhauStudyReference: {
    duration: 80,
    loop: false,
    note: "The authored SVGLab committed oberhau at half speed for frame-by-frame joint and follow-through inspection.",
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
