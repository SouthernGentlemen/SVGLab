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
 * A committed descending cut with an actual body consequence.
 *
 * The fighter coils away from the target, compresses the rear side, then drives pelvis and
 * chest through the cut. Contact is only the midpoint: the sword, shoulders and hips continue
 * into a low finish. Recovery follows the blade's remaining momentum in a circle around the
 * body instead of reversing the attack path like a rewound clip. Only after that circle does
 * the stance unwind and return to the upright guard.
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
    bones: body(-4, 2, -20, 12, -3, 38, 34, 28),
  },
  {
    frame: 8,
    label: "loaded",
    sword: { x: -3, y: -23, angle: -15 },
    bones: body(-5, 3, -28, 16, 4, 46, 42, 32),
  },
  {
    frame: 10,
    label: "release",
    sword: { x: 1, y: -19, angle: 12 },
    bones: body(0, 1, -12, 8, -10, 32, 30, 22),
  },
  {
    frame: 12,
    label: "drive",
    sword: { x: 8, y: -13, angle: 48 },
    bones: body(7, 0, 12, -10, -28, 18, 14, 28),
  },
  {
    frame: 14,
    label: "impact / longpoint",
    sword: { x: 16, y: -6, angle: 86 },
    bones: body(13, -1, 30, -20, -42, 14, 2, 36),
  },
  {
    frame: 16,
    label: "follow through",
    sword: { x: 21, y: 2, angle: 120 },
    bones: body(18, 1, 46, -30, -52, 12, -10, 46),
  },
  {
    frame: 19,
    label: "overshoot",
    sword: { x: 20, y: 10, angle: 152 },
    bones: body(22, 4, 56, -34, -56, 16, -18, 52),
  },
  {
    frame: 23,
    label: "low finish",
    sword: { x: 14, y: 15, angle: 178 },
    bones: body(23, 5, 50, -30, -50, 22, -12, 46),
  },
  {
    frame: 28,
    label: "circle recover",
    sword: { x: 6, y: 12, angle: 220 },
    bones: body(20, 4, 34, -20, -40, 26, 0, 36),
  },
  {
    frame: 34,
    label: "return",
    sword: { x: -1, y: 2, angle: 300 },
    bones: body(12, 2, 14, -8, -28, 28, 12, 28),
  },
  {
    frame: 40,
    label: "guard",
    sword: { x: 4, y: -8, angle: 360 },
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
    note: "SVGLab committed descending cut: coil, drive, impact, continued body rotation, low finish, circular recovery, and guard reset.",
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
