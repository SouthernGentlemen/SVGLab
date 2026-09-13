/** A pose value for one bone. Absent properties are unauthored, not zero. */
export interface BonePose {
  x?: number;
  y?: number;
  rotation?: number;
}

export interface Keyframe {
  frame: number;
  bones: Record<string, BonePose>;
}

export type Easing = "linear" | "smoothstep";

export interface Clip {
  name: string;
  loop: boolean;
  /** Whole ticks at 60 Hz. A looping clip keys its closing tick to match tick zero. */
  duration: number;
  easing: Easing;
  note: string;
  keyframes: readonly Keyframe[];
}

export type Pose = Record<string, BonePose>;
