import type { AnimationClip } from "./types";

export const CLIPS = {
  idle: {
    name: "idle",
    loop: true,
    duration: 60,
    easing: "smoothstep",
    note: "A slow nested-group breathing cycle.",
    keyframes: [
      { frame: 0, bones: { pelvis: { y: 0 }, torso: { rotation: -1 }, head: { rotation: 1 }, "arm-front": { rotation: 8 }, "arm-back": { rotation: -8 } } },
      { frame: 30, bones: { pelvis: { y: -1.5 }, torso: { rotation: 1 }, head: { rotation: -1 }, "arm-front": { rotation: 5 }, "arm-back": { rotation: -5 } } },
      { frame: 60, bones: { pelvis: { y: 0 }, torso: { rotation: -1 }, head: { rotation: 1 }, "arm-front": { rotation: 8 }, "arm-back": { rotation: -8 } } },
    ],
  },
  walk: {
    name: "walk",
    loop: true,
    duration: 24,
    easing: "smoothstep",
    note: "Opposed limb arcs demonstrate inherited rotation.",
    keyframes: [
      { frame: 0, bones: { pelvis: { y: 0 }, "leg-front": { rotation: -24 }, "shin-front": { rotation: 16 }, "leg-back": { rotation: 22 }, "shin-back": { rotation: -4 }, "arm-front": { rotation: 22 }, "arm-back": { rotation: -22 } } },
      { frame: 6, bones: { pelvis: { y: -2 }, "leg-front": { rotation: 0 }, "shin-front": { rotation: 24 }, "leg-back": { rotation: 0 }, "shin-back": { rotation: 18 }, "arm-front": { rotation: 0 }, "arm-back": { rotation: 0 } } },
      { frame: 12, bones: { pelvis: { y: 0 }, "leg-front": { rotation: 22 }, "shin-front": { rotation: -4 }, "leg-back": { rotation: -24 }, "shin-back": { rotation: 16 }, "arm-front": { rotation: -22 }, "arm-back": { rotation: 22 } } },
      { frame: 18, bones: { pelvis: { y: -2 }, "leg-front": { rotation: 0 }, "shin-front": { rotation: 18 }, "leg-back": { rotation: 0 }, "shin-back": { rotation: 24 }, "arm-front": { rotation: 0 }, "arm-back": { rotation: 0 } } },
      { frame: 24, bones: { pelvis: { y: 0 }, "leg-front": { rotation: -24 }, "shin-front": { rotation: 16 }, "leg-back": { rotation: 22 }, "shin-back": { rotation: -4 }, "arm-front": { rotation: 22 }, "arm-back": { rotation: -22 } } },
    ],
  },
  crouch: {
    name: "crouch",
    loop: true,
    duration: 36,
    easing: "smoothstep",
    note: "A low stance with compressed leg chains and a guarded upper body.",
    keyframes: [
      { frame: 0, bones: { pelvis: { y: 14 }, torso: { rotation: 7 }, "leg-front": { rotation: -34 }, "shin-front": { rotation: 62 }, "leg-back": { rotation: 32 }, "shin-back": { rotation: -56 }, "arm-front": { rotation: -14 }, "forearm-front": { rotation: 42 } } },
      { frame: 18, bones: { pelvis: { y: 15 }, torso: { rotation: 5 }, "leg-front": { rotation: -31 }, "shin-front": { rotation: 59 }, "leg-back": { rotation: 30 }, "shin-back": { rotation: -53 }, "arm-front": { rotation: -10 }, "forearm-front": { rotation: 38 } } },
      { frame: 36, bones: { pelvis: { y: 14 }, torso: { rotation: 7 }, "leg-front": { rotation: -34 }, "shin-front": { rotation: 62 }, "leg-back": { rotation: 32 }, "shin-back": { rotation: -56 }, "arm-front": { rotation: -14 }, "forearm-front": { rotation: 42 } } },
    ],
  },
  jump: {
    name: "jump",
    loop: false,
    duration: 28,
    easing: "smoothstep",
    note: "The vertical arc belongs to combat physics; this clip only tucks the SVG rig.",
    keyframes: [
      { frame: 0, bones: { pelvis: { y: 5 }, torso: { rotation: -3 }, "leg-front": { rotation: -18 }, "shin-front": { rotation: 38 }, "leg-back": { rotation: 18 }, "shin-back": { rotation: -34 }, "arm-front": { rotation: 25 }, "arm-back": { rotation: -25 } } },
      { frame: 12, bones: { pelvis: { y: 1 }, torso: { rotation: 3 }, "leg-front": { rotation: -28 }, "shin-front": { rotation: 52 }, "leg-back": { rotation: 28 }, "shin-back": { rotation: -48 }, "arm-front": { rotation: 12 }, "arm-back": { rotation: -12 } } },
      { frame: 28, bones: { pelvis: { y: 5 }, torso: { rotation: -3 }, "leg-front": { rotation: -18 }, "shin-front": { rotation: 38 }, "leg-back": { rotation: 18 }, "shin-back": { rotation: -34 }, "arm-front": { rotation: 25 }, "arm-back": { rotation: -25 } } },
    ],
  },
  strike: {
    name: "strike",
    loop: false,
    duration: 20,
    easing: "smoothstep",
    note: "Anticipation, active-frame extension, then recovery; combat owns the phase boundaries.",
    keyframes: [
      { frame: 0, bones: { pelvis: { x: 0 }, torso: { rotation: 0 }, head: { rotation: 0 }, "arm-front": { rotation: 8 }, "forearm-front": { rotation: -8 } } },
      { frame: 3, bones: { pelvis: { x: -2 }, torso: { rotation: -12 }, head: { rotation: 8 }, "arm-front": { rotation: 46 }, "forearm-front": { rotation: -72 } } },
      { frame: 5, bones: { pelvis: { x: 3 }, torso: { rotation: 17 }, head: { rotation: -8 }, "arm-front": { rotation: -82 }, "forearm-front": { rotation: 78 } } },
      { frame: 7, bones: { pelvis: { x: 4 }, torso: { rotation: 19 }, head: { rotation: -9 }, "arm-front": { rotation: -88 }, "forearm-front": { rotation: 86 } } },
      { frame: 11, bones: { pelvis: { x: 1 }, torso: { rotation: 5 }, head: { rotation: -2 }, "arm-front": { rotation: -18 }, "forearm-front": { rotation: 12 } } },
      { frame: 20, bones: { pelvis: { x: 0 }, torso: { rotation: 0 }, head: { rotation: 0 }, "arm-front": { rotation: 8 }, "forearm-front": { rotation: -8 } } },
    ],
  },
  hit: {
    name: "hit",
    loop: false,
    duration: 16,
    easing: "smoothstep",
    note: "A one-shot reaction whose playback freezes with authoritative hitstop.",
    keyframes: [
      { frame: 0, bones: { pelvis: { x: 0 }, torso: { rotation: 0 }, head: { rotation: 0 }, "arm-front": { rotation: 8 }, "arm-back": { rotation: -8 } } },
      { frame: 2, bones: { pelvis: { x: 3 }, torso: { rotation: -18 }, head: { rotation: 17 }, "arm-front": { rotation: 34 }, "arm-back": { rotation: -36 } } },
      { frame: 7, bones: { pelvis: { x: 1 }, torso: { rotation: -9 }, head: { rotation: 7 }, "arm-front": { rotation: 20 }, "arm-back": { rotation: -20 } } },
      { frame: 16, bones: { pelvis: { x: 0 }, torso: { rotation: 0 }, head: { rotation: 0 }, "arm-front": { rotation: 8 }, "arm-back": { rotation: -8 } } },
    ],
  },
} as const satisfies Record<string, AnimationClip>;

export type ClipName = keyof typeof CLIPS;
