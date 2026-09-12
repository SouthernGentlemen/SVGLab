import { describe, expect, it } from "vitest";
import {
  SWORD_SPECS,
  solveTwoBoneArm,
  swordGripTargets,
  swordPoseForClip,
} from "../src/svg/weapons";
import type { ClipName } from "../src/animation/clips";
import type { SwordId } from "../src/svg/weapons";

describe("rigid sword constraints", () => {
  it("keeps guard sword pointed up independent of torso lean", () => {
    const pose = swordPoseForClip("bnrSwordGuardNormal", 30, 17);
    expect(pose.rotation + 17).toBeCloseTo(0);
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

  it("rotates the whole rigid sword through a slash without resizing it", () => {
    const startup = swordPoseForClip("bnrSwordSlashNormal", 0);
    const contact = swordPoseForClip("bnrSwordSlashNormal", 21);

    expect(contact.rotation).toBeGreaterThan(startup.rotation);
    expect(SWORD_SPECS.longsword.bladeLength).toBe(56);
    expect(SWORD_SPECS.longsword.handleLength).toBe(15);
  });

  it("keeps both grips reachable across every sword preview frame and hard torso lean", () => {
    const clips: readonly [ClipName, number][] = [
      ["bnrCrouchNormal", 18],
      ["bnrWalkNormal", 60],
      ["bnrRunNormal", 46],
      ["bnrDashNormal", 38],
      ["bnrSwordGuardNormal", 118],
      ["bnrSwordSlashNormal", 30],
      ["bnrSwordCutNormal", 124],
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
