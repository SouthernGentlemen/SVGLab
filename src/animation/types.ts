export interface BonePose {
  x?: number;
  y?: number;
  rotation?: number;
}

export interface AnimationKeyframe {
  frame: number;
  bones: Record<string, BonePose>;
}

export interface AnimationClip {
  name: string;
  loop: boolean;
  duration: number;
  easing: "linear" | "smoothstep";
  note: string;
  keyframes: readonly AnimationKeyframe[];
}

export type Pose = Record<string, BonePose>;
