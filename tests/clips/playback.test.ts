import { describe, expect, it } from "vitest";

import { CLIPS } from "../../src/clips/index.ts";
import { advancePreviewFrame, previewLastFrame } from "../../src/clips/playback.ts";

describe("preview playback", () => {
  it("repeats every clip even when the clip itself is one-shot", () => {
    for (const clip of Object.values(CLIPS)) {
      const last = previewLastFrame(clip);
      expect(advancePreviewFrame(clip, last)).toBe(0);
    }
  });

  it("preserves the terminal frame of a one-shot before repeating", () => {
    const strike = CLIPS.bnrStrikeNormal;
    expect(previewLastFrame(strike)).toBe(strike.duration);
    expect(advancePreviewFrame(strike, strike.duration - 1)).toBe(strike.duration);
    expect(advancePreviewFrame(strike, strike.duration)).toBe(0);
  });

  it("avoids duplicating frame zero at a loop seam", () => {
    const idle = CLIPS.bnrIdleNormal;
    expect(previewLastFrame(idle)).toBe(idle.duration - 1);
    expect(advancePreviewFrame(idle, idle.duration - 1)).toBe(0);
  });
});
