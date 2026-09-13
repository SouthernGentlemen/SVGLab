import { describe, expect, it } from "vitest";

import { keyframesFromChannels, sampleClip, simplify } from "../../pipelines/motion/reduce.ts";
import type { Clip } from "../../src/clips/types.ts";

const OPTIONS = {
  angleTolerance: 1,
  positionTolerance: 0.15,
  rotationPrecision: 1,
  positionPrecision: 2,
} as const;

describe("motion channel reduction", () => {
  it("keeps only samples a linear reading would miss", () => {
    expect(simplify([0, 1, 2, 8, 4], 1)).toEqual([0, 2, 3, 4]);
    expect(simplify([0, 1, 2, 3, 4], 0.01)).toEqual([0, 4]);
  });

  it("rounds rotation and position with separate measured precision", () => {
    const frames = keyframesFromChannels({
      pelvis: { y: [0.126, 1.236] },
      torso: { rotation: [0.126, 12.36] },
    }, OPTIONS);
    expect(frames).toEqual([
      { frame: 0, bones: { pelvis: { y: 0.13 }, torso: { rotation: 0.1 } } },
      { frame: 1, bones: { pelvis: { y: 1.24 }, torso: { rotation: 12.4 } } },
    ]);
  });

  it("re-exports the one runtime sampler instead of carrying a linear copy", () => {
    const eased = {
      name: "labEasingProbe",
      loop: false,
      duration: 10,
      easing: "smoothstep",
      note: "Easing parity probe.",
      keyframes: [
        { frame: 0, bones: { torso: { rotation: 0 } } },
        { frame: 10, bones: { torso: { rotation: 90 } } },
      ],
    } as const satisfies Clip;
    expect(sampleClip(eased, 2).torso.rotation).toBeCloseTo(9.36, 2);
  });
});
