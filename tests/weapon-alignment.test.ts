import { describe, expect, it } from "vitest";
import { CLIPS } from "../src/animation/clips";
import { sampleClip } from "../src/animation/sample";
import {
  SWORD_SPECS,
  armHandPoint,
  fitSwordPoseToArmReach,
  solveTwoBoneArm,
  swordGripTargets,
  swordGuardPose,
  swordPoseFromGripPoints,
} from "../src/svg/weapons";
import type { SwordId } from "../src/svg/weapons";

const FRONT_REACH = { shoulder: { x: 11, y: -22 }, upperLength: 21, lowerLength: 22 } as const;
const BACK_REACH = { shoulder: { x: -11, y: -22 }, upperLength: 21, lowerLength: 22 } as const;

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

function captureHands(frame: number) {
  const body = sampleClip(CLIPS.bnrSwordSlashNormal, frame);
  return {
    front: armHandPoint(
      FRONT_REACH.shoulder,
      body["arm-front"]?.rotation ?? 0,
      body["forearm-front"]?.rotation ?? 0,
      FRONT_REACH.upperLength,
      FRONT_REACH.lowerLength,
    ),
    back: armHandPoint(
      BACK_REACH.shoulder,
      body["arm-back"]?.rotation ?? 0,
      body["forearm-back"]?.rotation ?? 0,
      BACK_REACH.upperLength,
      BACK_REACH.lowerLength,
    ),
  };
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
  });

  it("uses source-L/front at the guard so the captured contact blade points forward", () => {
    const hands = captureHands(14);
    const raw = swordPoseFromGripPoints("longsword", hands.front, hands.back);
    expect(raw).not.toBeNull();
    const pose = fitSwordPoseToArmReach("longsword", raw!, FRONT_REACH, BACK_REACH);
    const grips = swordGripTargets("longsword", pose);
    const tipOffset = rotate({ x: 0, y: -SWORD_SPECS.longsword.bladeLength }, pose.rotation);
    const tipX = pose.x + tipOffset.x;

    expect(tipX).toBeGreaterThan(Math.max(grips.upper.x, grips.lower.x));
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

  it("keeps every captured slash frame reachable for every fixed sword size", () => {
    for (const id of Object.keys(SWORD_SPECS) as SwordId[]) {
      for (let frame = 0; frame <= CLIPS.bnrSwordSlashNormal.duration; frame += 1) {
        const hands = captureHands(frame);
        const raw = swordPoseFromGripPoints(id, hands.front, hands.back);
        expect(raw, `${id} frame ${frame} has degenerate captured hands`).not.toBeNull();
        const pose = fitSwordPoseToArmReach(id, raw!, FRONT_REACH, BACK_REACH);
        const grips = swordGripTargets(id, pose);
        const front = solveTwoBoneArm(FRONT_REACH.shoulder, grips.upper, 21, 22, -1);
        const back = solveTwoBoneArm(BACK_REACH.shoulder, grips.lower, 21, 22, 1);
        const translation = Math.hypot(pose.x - raw!.x, pose.y - raw!.y);

        expect(front.clamped, `${id} frame ${frame} guard-side hand`).toBe(false);
        expect(back.clamped, `${id} frame ${frame} pommel-side hand`).toBe(false);
        expect(translation, `${id} frame ${frame} retarget drift`).toBeLessThan(6);
      }
    }
  });
});
