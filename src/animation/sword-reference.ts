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
    bones: body(0, 0, 0, 0, -18, 28, 24, 18),
  },
  {
    frame: 30,
    label: "guard settle",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0.6, 1.2, -1.2, -17, 27, 23, 19),
  },
  {
    frame: 60,
    label: "upright guard",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0, 0, 0, -18, 28, 24, 18),
  },
];

const OBERHAU_FRAMES: readonly SwordReferenceFrame[] = [
  {
    frame: 0,
    label: "guard",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0, 0, 0, -18, 28, 24, 18),
  },
  {
    frame: 4,
    label: "load",
    sword: { x: 1, y: -15, angle: -4 },
    bones: body(-1, 0, -7, 7, -16, 30, 26, 20),
  },
  {
    frame: 8,
    label: "point leads",
    sword: { x: 1, y: -18, angle: 8 },
    bones: body(0, -1, -5, 5, -18, 27, 25, 18),
  },
  {
    frame: 11,
    label: "hips turn",
    sword: { x: 4, y: -14, angle: 34 },
    bones: body(1, 0, 2, -2, -22, 24, 21, 20),
  },
  {
    frame: 13,
    label: "impact",
    sword: { x: 8, y: -8, angle: 70 },
    bones: body(2, 1, 8, -7, -26, 22, 17, 22),
  },
  {
    frame: 15,
    label: "longpoint",
    sword: { x: 11, y: -4, angle: 90 },
    bones: body(2, 1, 9, -7, -28, 20, 15, 24),
  },
  {
    frame: 19,
    label: "recover",
    sword: { x: 8, y: -5, angle: 58 },
    bones: body(1, 0, 5, -4, -24, 22, 18, 22),
  },
  {
    frame: 24,
    label: "guard",
    sword: { x: 4, y: -8, angle: 0 },
    bones: body(0, 0, 0, 0, -18, 28, 24, 18),
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
    duration: 24,
    loop: false,
    note: "SVGLab descending sword cut: guard, load, point-first acceleration, impact, longpoint, and controlled recovery.",
    frames: OBERHAU_FRAMES,
  },
  swordOberhauStudyReference: {
    duration: 48,
    loop: false,
    note: "The authored SVGLab oberhau key poses at half speed for frame-by-frame joint inspection.",
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
