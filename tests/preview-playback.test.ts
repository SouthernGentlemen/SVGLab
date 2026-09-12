import { describe, expect, it } from "vitest";
import { CLIPS } from "../src/animation/clips";
import { advancePreviewFrame, previewLastFrame } from "../src/animation/preview-playback";
import { SWORDS } from "../src/svg/weapons";

describe("preview playback", () => {
  it("repeats every clip even when combat metadata marks it one-shot", () => {
    for (const clip of Object.values(CLIPS)) {
      const last = previewLastFrame(clip);
      expect(advancePreviewFrame(clip, last)).toBe(0);
    }
  });

  it("preserves the terminal frame of one-shot studies before repeating", () => {
    const strike = CLIPS.bnrStrikeNormal;
    expect(strike.loop).toBe(false);
    expect(previewLastFrame(strike)).toBe(strike.duration);
    expect(advancePreviewFrame(strike, strike.duration - 1)).toBe(strike.duration);
    expect(advancePreviewFrame(strike, strike.duration)).toBe(0);
  });

  it("avoids duplicating frame zero at the seam of authored loops", () => {
    const idle = CLIPS.bnrIdleNormal;
    expect(idle.loop).toBe(true);
    expect(previewLastFrame(idle)).toBe(idle.duration - 1);
    expect(advancePreviewFrame(idle, idle.duration - 1)).toBe(0);
  });
});

describe("preview sword catalog", () => {
  it("ships multiple distinct sword models for cycling", () => {
    expect(SWORDS.map((sword) => sword.id)).toEqual(["longsword", "katana", "greatsword"]);
    expect(new Set(SWORDS.map((sword) => sword.id)).size).toBe(SWORDS.length);
  });
});
