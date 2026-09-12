import { describe, expect, it } from "vitest";
import type { ClipName } from "../src/animation/clips";
import { SWORD_REFERENCE_SEQUENCES } from "../src/animation/sword-reference";
import {
  SWORD_SPECS,
  solveTwoBoneArm,
  swordGripTargets,
  swordPoseForClip,
} from "../src/svg/weapons";
import type { SwordId } from "../src/svg/weapons";

function rotate(point: { x: number; y: number }, degrees: number) {
  const radians = degrees * Math.PI / 180;
  return {
    x: point.x * Math.cos(radians) - point.y * Math.sin(radians),
    y: point.x * Math.sin(radians) + point.y * Math.cos(radians),
  };
}

describe("rigid sword constraints", () => {
  it("keeps the canonical guard sword pointed up and in place independent of torso lean", () => {
    const torsoRotation = 17;
    const pose = swordPoseForClip("swordGuardReference", 30, torsoRotation);
    const fighterSpace = rotate(pose, torsoRotation);

    expect(pose.rotation + torsoRotation).toBeCloseTo(0);
    expect(fighterSpace.x).toBeCloseTo(4);
    expect(fighterSpace.y).toBeCloseTo(-8);
  });

  it("keeps each sword's grip spacing fixed", () => {
    for (const [id, spec] of Object.entries(SWORD_SPECS)) {
      const targets = swordGripTargets(id as SwordId, { x: 5, y: -7, rotation: 63 });
      const spacing = Math.hypot(
        targets.lower.x - targets.upper.x,
        targets.lower.y - targets.upper.y,
      );
      expect(spacing).toBeCloseTo(spec.lowerGripY - spec.upperGripY);
    }
  });

  it("solves the arm onto a fixed hand target without changing link lengths", () => {
    const shoulder = { x: 11, y: -22 };
    const target = { x: 2, y: 8 };
    const solution = solveTwoBoneArm(shoulder, target, 21, 22, -1);

    expect(solution.clamped).toBe(false);
    expect(solution.hand).toEqual(target);
    expect(Math.hypot(solution.elbow.x - shoulder.x, solution.elbow.y - shoulder.y)).toBeCloseTo(21);
    expect(Math.hypot(target.x - solution.elbow.x, target.y - solution.elbow.y)).toBeCloseTo(22);
  });

  it("authors the primary cut as blade braking with continued body follow-through", () => {
    const frames = SWORD_REFERENCE_SEQUENCES.swordOberhauReference.frames;
    expect(frames.map((entry) => entry.label)).toEqual([
      "guard",
      "coil",
      "loaded",
      "release",
      "drive",
      "cut",
      "impact",
      "longpoint",
      "body follows",
      "braked finish",
      "settle",
      "withdraw",
      "re-chamber",
      "guard",
    ]);

    const impact = frames.find((entry) => entry.label === "impact")!;
    const longpoint = frames.find((entry) => entry.label === "longpoint")!;
    const bodyFollows = frames.find((entry) => entry.label === "body follows")!;
    const braked = frames.find((entry) => entry.label === "braked finish")!;

    expect(longpoint.sword.angle).toBeGreaterThan(impact.sword.angle);
    expect(bodyFollows.sword.angle - longpoint.sword.angle).toBeLessThan(10);
    expect(braked.sword.angle - bodyFollows.sword.angle).toBeLessThan(5);
    expect(bodyFollows.bones.torso?.rotation ?? 0).toBeGreaterThan(longpoint.bones.torso?.rotation ?? 0);
    expect(bodyFollows.bones.pelvis?.x ?? 0).toBeGreaterThan(longpoint.bones.pelvis?.x ?? 0);
    expect(Math.max(...frames.map((entry) => entry.sword.angle))).toBeLessThanOrEqual(112);
    expect(frames.at(-1)?.sword).toEqual(frames[0].sword);
  });

  it("keeps the rigid sword compact through impact and controlled recovery", () => {
    const startup = swordPoseForClip("swordOberhauReference", 0);
    const contact = swordPoseForClip("swordOberhauReference", 14);
    const finish = swordPoseForClip("swordOberhauReference", 21);
    const recovery = swordPoseForClip("swordOberhauReference", 29);

    expect(startup.rotation).toBeCloseTo(0);
    expect(contact.rotation).toBeLessThan(finish.rotation);
    expect(finish.rotation).toBeLessThanOrEqual(112);
    expect(recovery.rotation).toBeLessThan(finish.rotation);
    expect(SWORD_SPECS.longsword.bladeLength).toBe(56);
    expect(SWORD_SPECS.longsword.handleLength).toBe(15);
  });

  it("keeps both grips reachable across every sword preview frame and hard torso lean", () => {
    const clips: readonly [ClipName, number][] = [
      ["bnrCrouchNormal", 18],
      ["bnrWalkNormal", 60],
      ["bnrRunNormal", 46],
      ["bnrDashNormal", 38],
      ["swordGuardReference", 60],
      ["swordOberhauReference", 42],
      ["swordOberhauStudyReference", 84],
      ["bnrSlashStudyNormal", 802],
    ];
    const torsoRotations = [-45, -30, -15, 0, 15, 30, 45];

    for (const id of Object.keys(SWORD_SPECS) as SwordId[]) {
      for (const [clip, duration] of clips) {
        for (let frame = 0; frame <= duration; frame += 1) {
          for (const torsoRotation of torsoRotations) {
            const grips = swordGripTargets(id, swordPoseForClip(clip, frame, torsoRotation));
            const front = solveTwoBoneArm({ x: 11, y: -22 }, grips.upper, 21, 22, -1);
            const back = solveTwoBoneArm({ x: -11, y: -22 }, grips.lower, 21, 22, 1);
            expect(front.clamped, `${id} ${clip} frame ${frame} front`).toBe(false);
            expect(back.clamped, `${id} ${clip} frame ${frame} back`).toBe(false);
          }
        }
      }
    }
  });
});
