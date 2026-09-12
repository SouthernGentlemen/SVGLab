import { describe, expect, it } from "vitest";
import { CLIPS } from "../src/animation/clips";
import { sampleClip } from "../src/animation/sample";
import {
  SWORD_SPECS,
  armHandPoint,
  solveTwoBoneArm,
  swordGripTargets,
  swordGuardPose,
  swordPoseFromGripPoints,
} from "../src/svg/weapons";
import type { SwordId } from "../src/svg/weapons";

function rotate(point: { x: number; y: number }, degrees: number) {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

function dot(a: { x: number; y: number }, b: { x: number; y: number }) {
  return a.x * b.x + a.y * b.y;
}

describe("rigid sword constraints", () => {
  it("keeps generic guard pointed up and in place independent of torso lean", () => {
    const torsoRotation = 17;
    const pose = swordGuardPose(torsoRotation);
    const fighterSpace = rotate(pose, torsoRotation);

    expect(pose.rotation + torsoRotation).toBeCloseTo(0);
    expect(fighterSpace.x).toBeCloseTo(4);
    expect(fighterSpace.y).toBeCloseTo(-8);
  });

  it("keeps each sword's fixed grip points on its handle", () => {
    for (const [id, spec] of Object.entries(SWORD_SPECS)) {
      const targets = swordGripTargets(id as SwordId, { x: 5, y: -7, rotation: 63 });
      const spacing = Math.hypot(
        targets.lower.x - targets.upper.x,
        targets.lower.y - targets.upper.y,
      );
      expect(spec.upperGripY).toBeGreaterThan(0);
      expect(spec.lowerGripY).toBeGreaterThan(spec.upperGripY);
      expect(spec.lowerGripY).toBeLessThan(spec.handleLength);
      expect(spacing).toBeCloseTo(spec.lowerGripY - spec.upperGripY);
    }
  });

  it("reconstructs the blade away from both captured hands instead of through either hand", () => {
    const capturedGuardHand = { x: 10, y: 2 };
    const capturedPommelHand = { x: 2, y: 2 };
    const pose = swordPoseFromGripPoints("longsword", capturedGuardHand, capturedPommelHand);
    expect(pose).not.toBeNull();

    const fixed = swordGripTargets("longsword", pose!);
    const handleDirection = {
      x: fixed.lower.x - fixed.upper.x,
      y: fixed.lower.y - fixed.upper.y,
    };
    const capturedDirection = {
      x: capturedPommelHand.x - capturedGuardHand.x,
      y: capturedPommelHand.y - capturedGuardHand.y,
    };
    expect(dot(handleDirection, capturedDirection)).toBeGreaterThan(0);

    const bladeTipOffset = rotate({ x: 0, y: -SWORD_SPECS.longsword.bladeLength }, pose!.rotation);
    expect(dot(bladeTipOffset, handleDirection)).toBeLessThan(0);

    const fixedMidpoint = {
      x: (fixed.upper.x + fixed.lower.x) / 2,
      y: (fixed.upper.y + fixed.lower.y) / 2,
    };
    expect(fixedMidpoint.x).toBeCloseTo((capturedGuardHand.x + capturedPommelHand.x) / 2);
    expect(fixedMidpoint.y).toBeCloseTo((capturedGuardHand.y + capturedPommelHand.y) / 2);
  });

  it("uses the capture's source-L/front hand at the guard so the contact blade points forward", () => {
    const body = sampleClip(CLIPS.bnrSwordSlashNormal, 14);
    const frontHand = armHandPoint(
      { x: 11, y: -22 },
      body["arm-front"]?.rotation ?? 0,
      body["forearm-front"]?.rotation ?? 0,
      21,
      22,
    );
    const backHand = armHandPoint(
      { x: -11, y: -22 },
      body["arm-back"]?.rotation ?? 0,
      body["forearm-back"]?.rotation ?? 0,
      21,
      22,
    );
    const pose = swordPoseFromGripPoints("longsword", frontHand, backHand);
    expect(pose).not.toBeNull();

    const grips = swordGripTargets("longsword", pose!);
    const tipOffset = rotate({ x: 0, y: -SWORD_SPECS.longsword.bladeLength }, pose!.rotation);
    const tipX = pose!.x + tipOffset.x;
    expect(tipX).toBeGreaterThan(Math.max(grips.upper.x, grips.lower.x));
  });

  it("preserves captured guard/pommel ordering for a vertical two-hand grip", () => {
    const pose = swordPoseFromGripPoints("longsword", { x: 0, y: 4 }, { x: 0, y: 12 });
    expect(pose).not.toBeNull();
    expect(pose!.rotation).toBeCloseTo(0);
    const grips = swordGripTargets("longsword", pose!);
    expect(grips.upper).toEqual({ x: 0, y: 4 });
    expect(grips.lower).toEqual({ x: 0, y: 12 });
  });

  it("returns the original hand endpoint from forward kinematics", () => {
    const shoulder = { x: 11, y: -22 };
    const target = { x: 2, y: 8 };
    const solution = solveTwoBoneArm(shoulder, target, 21, 22, -1);
    const reconstructed = armHandPoint(
      shoulder,
      solution.upperRotation,
      solution.lowerRotation,
      21,
      22,
    );

    expect(solution.clamped).toBe(false);
    expect(reconstructed.x).toBeCloseTo(target.x);
    expect(reconstructed.y).toBeCloseTo(target.y);
    expect(Math.hypot(solution.elbow.x - shoulder.x, solution.elbow.y - shoulder.y)).toBeCloseTo(21);
    expect(Math.hypot(target.x - solution.elbow.x, target.y - solution.elbow.y)).toBeCloseTo(22);
  });

  it("keeps fixed reconstructed grips reachable for every sword size", () => {
    const guardHand = { x: 4, y: -4 };
    const pommelHand = { x: -3, y: 2 };

    for (const id of Object.keys(SWORD_SPECS) as SwordId[]) {
      const pose = swordPoseFromGripPoints(id, guardHand, pommelHand);
      expect(pose).not.toBeNull();
      const grips = swordGripTargets(id, pose!);
      const front = solveTwoBoneArm({ x: 11, y: -22 }, grips.upper, 21, 22, -1);
      const back = solveTwoBoneArm({ x: -11, y: -22 }, grips.lower, 21, 22, 1);
      expect(front.clamped, `${id} guard-side hand`).toBe(false);
      expect(back.clamped, `${id} pommel-side hand`).toBe(false);
    }
  });
});
