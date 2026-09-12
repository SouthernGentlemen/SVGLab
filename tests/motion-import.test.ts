import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { BANDAI_NAMCO_CLIPS } from "../src/animation/generated/bandai-namco";
import type { AnimationKeyframe } from "../src/animation/types";
import { SWORD_SLASH } from "../src/combat/content";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

describe("Bandai Namco motion import", () => {
  it("keeps generated motion synchronized with its pinned source and manifest", () => {
    expect(() => execFileSync(process.execPath, ["scripts/build-motions.mjs", "--check"], {
      cwd: root,
      stdio: "pipe",
    })).not.toThrow();
  });

  it("preserves source time in the 60 Hz animation domain", () => {
    expect(BANDAI_NAMCO_CLIPS.bnrIdleNormal.duration).toBe(60);
    expect(BANDAI_NAMCO_CLIPS.bnrCrouchNormal.duration).toBe(18);
    expect(BANDAI_NAMCO_CLIPS.bnrWalkNormal.duration).toBe(60);
    expect(BANDAI_NAMCO_CLIPS.bnrRunNormal.duration).toBe(46);
    expect(BANDAI_NAMCO_CLIPS.bnrDashNormal.duration).toBe(38);
    expect(BANDAI_NAMCO_CLIPS.bnrStrikeNormal.duration).toBe(20);
    expect(BANDAI_NAMCO_CLIPS.bnrSwordGuardNormal.duration).toBe(118);
    expect(BANDAI_NAMCO_CLIPS.bnrSwordSlashNormal.duration).toBe(30);
    expect(BANDAI_NAMCO_CLIPS.bnrSwordCutNormal.duration).toBe(124);
    expect(BANDAI_NAMCO_CLIPS.bnrSlashStudyNormal.duration).toBe(802);
    expect(BANDAI_NAMCO_CLIPS.bnrPunchStudyNormal.duration).toBe(446);
  });

  it("places the selected punch extension inside the authoritative active window", () => {
    const atContact = BANDAI_NAMCO_CLIPS.bnrStrikeNormal.keyframes
      .find((keyframe) => keyframe.frame === 6);
    expect(atContact).toBeDefined();
    expect(atContact?.bones["arm-front"]?.rotation).toBeDefined();
    expect(atContact?.bones["forearm-front"]?.rotation).toBeDefined();
  });

  it("keeps the two-handed cut arms together through the overhead sweep", () => {
    const arms = (clip: { keyframes: readonly AnimationKeyframe[] }): number[] => clip.keyframes
      .flatMap((keyframe) => Object.entries(keyframe.bones))
      .filter(([bone]) => bone === "arm-front" || bone === "arm-back")
      .map(([, pose]) => pose.rotation)
      .filter((rotation): rotation is number => rotation !== undefined);

    // The source holds a sword in both hands, so both arms sweep from guard to overhead.
    const sweep = arms(BANDAI_NAMCO_CLIPS.bnrSwordCutNormal);
    expect(Math.min(...sweep)).toBeLessThan(-100);
    expect(Math.max(...sweep)).toBeGreaterThan(-30);
  });

  it("lands the warped sword cut inside the authoritative active window", () => {
    const atContact = BANDAI_NAMCO_CLIPS.bnrSwordSlashNormal.keyframes
      .find((keyframe) => keyframe.frame === SWORD_SLASH.startup + 1);
    expect(atContact).toBeDefined();
    expect(SWORD_SLASH.animation).toBe("bnrSwordSlashNormal");
    for (const hitbox of SWORD_SLASH.hitboxes) {
      expect(15).toBeGreaterThanOrEqual(hitbox.startFrame);
      expect(15).toBeLessThanOrEqual(hitbox.endFrame);
    }
  });

  it("closes locomotion loops and emits only finite SVG poses", () => {
    for (const clip of [
      BANDAI_NAMCO_CLIPS.bnrWalkNormal,
      BANDAI_NAMCO_CLIPS.bnrRunNormal,
      BANDAI_NAMCO_CLIPS.bnrSwordGuardNormal,
    ]) {
      expect(clip.keyframes[0].frame).toBe(0);
      expect(clip.keyframes.at(-1)?.frame).toBe(clip.duration);
      const first = clip.keyframes[0].bones;
      const last = clip.keyframes.at(-1)!.bones;
      for (const [bone, pose] of Object.entries(first)) {
        expect(last[bone as keyof typeof last]).toEqual(pose);
      }
    }

    for (const clip of Object.values(BANDAI_NAMCO_CLIPS)) {
      for (const keyframe of clip.keyframes) {
        expect(keyframe.frame).toBeGreaterThanOrEqual(0);
        expect(keyframe.frame).toBeLessThanOrEqual(clip.duration);
        for (const pose of Object.values(keyframe.bones)) {
          for (const value of Object.values(pose)) expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  it("retains attribution and noncommercial terms beside the vendored source", () => {
    const notice = readFileSync(join(root, "third_party/bandai-namco-motiondataset-1/NOTICE.md"), "utf8");
    const license = readFileSync(join(root, "third_party/bandai-namco-motiondataset-1/LICENSE"), "utf8");
    expect(notice).toContain("74ead3ba1ae4696404e6086233779f60de8bf9ef");
    expect(notice).toContain("CC BY-NC 4.0");
    expect(license).toContain("Attribution-NonCommercial 4.0 International");
  });
});
