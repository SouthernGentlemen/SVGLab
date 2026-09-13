import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { buildCatalog } from "../../pipelines/motion/catalog.ts";
import type { StudyArtifact } from "../../pipelines/motion/build.ts";
import { BANDAI_NAMCO_CLIPS } from "../../src/clips/generated/bandai-namco.ts";

const SHIPPED = [
  "bnrIdleNormal",
  "bnrCrouchNormal",
  "bnrWalkNormal",
  "bnrRunNormal",
  "bnrDashNormal",
  "bnrStrikeNormal",
  "bnrSwordGuardNormal",
  "bnrSwordSlashNormal",
  "bnrSwordCutNormal",
] as const;

const STUDIES = ["bnrSlashStudyNormal", "bnrPunchStudyNormal"] as const;

describe("Bandai Namco motion catalog", () => {
  it("runs the strip-only pipeline under plain node and rebuilds byte-identically", () => {
    expect(() => execFileSync(process.execPath, ["pipelines/motion/build.ts", "--check"], {
      cwd: process.cwd(),
      stdio: "pipe",
    })).not.toThrow();
  }, 30_000);

  it("ships nine clips and writes both studies outside src", () => {
    expect(Object.keys(BANDAI_NAMCO_CLIPS)).toEqual(SHIPPED);
    for (const key of STUDIES) {
      expect(key in BANDAI_NAMCO_CLIPS).toBe(false);
      const artifact = JSON.parse(readFileSync(`out/${key}.json`, "utf8")) as StudyArtifact;
      expect(artifact.generatedBy).toBe("pipelines/motion/build.ts");
      expect(artifact.clip.name).toBe(key);
    }
    const source = readFileSync("src/clips/generated/bandai-namco.ts", "utf8");
    for (const key of STUDIES) expect(source).not.toContain(key);
  });

  it("lands at the measured compact footprint and channel precision", () => {
    expect(readFileSync("src/clips/generated/bandai-namco.ts").byteLength).toBeGreaterThan(37_600);
    expect(readFileSync("src/clips/generated/bandai-namco.ts").byteLength).toBeLessThan(37_800);
    const catalog = buildCatalog(process.cwd());
    expect(Buffer.byteLength(JSON.stringify(catalog.studies))).toBe(59_523);
    expect(catalog.manifest.defaults.rotationPrecision).toBe(1);
    expect(catalog.manifest.defaults.positionPrecision).toBe(2);
    expect(catalog.manifest.labels.content["12"]).toBe("punch");
    expect(catalog.manifest.labels.content["14"]).toBe("slash");
    expect(catalog.manifest.labels.style["0"]).toBe("normal");
    for (const clip of [...Object.values(catalog.bandaiNamco), ...Object.values(catalog.studies)]) {
      for (const keyframe of clip.keyframes) {
        for (const pose of Object.values(keyframe.bones)) {
          if (pose.rotation !== undefined) expect(Math.abs(Number(pose.rotation.toFixed(1)) - pose.rotation)).toBe(0);
          if (pose.x !== undefined) expect(Math.abs(Number(pose.x.toFixed(2)) - pose.x)).toBe(0);
          if (pose.y !== undefined) expect(Math.abs(Number(pose.y.toFixed(2)) - pose.y)).toBe(0);
        }
      }
    }
  });

  it("preserves source time in the 60 Hz tick domain", () => {
    const catalog = buildCatalog(process.cwd());
    expect(Object.fromEntries(Object.entries({ ...catalog.bandaiNamco, ...catalog.studies })
      .map(([key, clip]) => [key, clip.duration]))).toEqual({
      bnrIdleNormal: 60,
      bnrCrouchNormal: 18,
      bnrWalkNormal: 60,
      bnrRunNormal: 46,
      bnrDashNormal: 38,
      bnrStrikeNormal: 20,
      bnrSwordGuardNormal: 118,
      bnrSwordSlashNormal: 30,
      bnrSwordCutNormal: 124,
      bnrSlashStudyNormal: 802,
      bnrPunchStudyNormal: 446,
    });
  });

  it("loads the parent-before-child rig order and leaf tips from the contract", () => {
    const { rig } = buildCatalog(process.cwd());
    expect(rig.bones.map((bone) => bone.name)).toEqual([
      "pelvis", "leg-front", "shin-front", "leg-back", "shin-back", "torso",
      "arm-front", "forearm-front", "arm-back", "forearm-back", "head",
    ]);
    expect(rig.byName.get("pelvis")?.offset).toEqual([0, -42]);
    expect(rig.byName.get("shin-front")?.tip).toEqual([0, 21]);
  });

  it("asserts contact ticks inside their declared active windows", () => {
    const manifest = buildCatalog(process.cwd()).manifest;
    const strike = manifest.clips.find((clip) => clip.key === "bnrStrikeNormal")!;
    const slash = manifest.clips.find((clip) => clip.key === "bnrSwordSlashNormal")!;
    expect(strike.contactTargetFrame).toBe(6);
    expect(strike.activeWindow).toEqual([5, 7]);
    expect(slash.contactTargetFrame).toBe(15);
    expect(slash.activeWindow).toEqual([14, 17]);
    expect(BANDAI_NAMCO_CLIPS.bnrStrikeNormal.keyframes.find((frame) => frame.frame === 6)?.bones["arm-front"]?.rotation)
      .toBe(-84.8);
    expect(BANDAI_NAMCO_CLIPS.bnrSwordSlashNormal.keyframes.find((frame) => frame.frame === 15)?.bones["arm-front"]?.rotation)
      .toBe(-51.2);
  });

  it("closes every approved loop seam and emits only finite poses", () => {
    const catalog = buildCatalog(process.cwd());
    for (const clip of [...Object.values(catalog.bandaiNamco), ...Object.values(catalog.studies)]) {
      if (clip.loop) {
        expect(clip.keyframes[0].frame).toBe(0);
        expect(clip.keyframes.at(-1)?.frame).toBe(clip.duration);
        expect(clip.keyframes.at(-1)?.bones).toEqual(clip.keyframes[0].bones);
      }
      for (const keyframe of clip.keyframes) {
        expect(keyframe.frame).toBeGreaterThanOrEqual(0);
        expect(keyframe.frame).toBeLessThanOrEqual(clip.duration);
        for (const pose of Object.values(keyframe.bones)) {
          for (const value of Object.values(pose)) expect(Number.isFinite(value)).toBe(true);
        }
      }
    }
  });

  it("retains attribution and noncommercial terms in the root licence index", () => {
    const license = readFileSync("LICENSE.md", "utf8");
    expect(license).toContain("74ead3ba1ae4696404e6086233779f60de8bf9ef");
    expect(license).toContain("Creative Commons Attribution-NonCommercial 4.0 International");
    expect(license).toContain("https://creativecommons.org/licenses/by-nc/4.0/legalcode");
    expect(license).toContain("motions/capture/bandai-namco-motiondataset-1/*.bvh");
    expect(license).toContain("characters/{barst,kiran,yuliya}/atlas.png");
    expect(license).toContain("cosmetics/royal-guard/atlas.png");
    expect(license).toContain("cosmetics/field-kit/atlas.png");
    expect(existsSync("third_party")).toBe(false);
  });
});
