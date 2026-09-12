import { describe, expect, it } from "vitest";
import { swordPoseFromHands } from "../src/svg/weapons";

describe("two-hand sword alignment", () => {
  it("points the blade from the rear hand through the front hand", () => {
    const pose = swordPoseFromHands({ x: 40, y: -40 }, { x: 19, y: -44 });
    expect(pose.x).toBe(40);
    expect(pose.y).toBe(-40);
    expect(pose.gripLength).toBeCloseTo(Math.hypot(21, 4));
    expect(pose.rotation).toBeCloseTo(Math.atan2(4, 21) * 180 / Math.PI + 90);
  });

  it("keeps the handle spanning both hands for an overhead grip", () => {
    const pose = swordPoseFromHands({ x: 27, y: -103 }, { x: -3, y: -102 });
    expect(pose.gripLength).toBeCloseTo(Math.hypot(30, -1));
    expect(pose.rotation).toBeCloseTo(Math.atan2(-1, 30) * 180 / Math.PI + 90);
  });
});
