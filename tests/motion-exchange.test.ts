import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

import { CLIPS, clipOrigin } from "../src/animation/clips";
import type { ClipName } from "../src/animation/clips";
import { previewClipOptions } from "../src/animation/movesets";
import { sampleClip } from "../src/animation/sample";
import { resolveArmLayerProfile } from "../src/svg/rig";
import { swordTrackFor } from "../src/svg/weapons";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const exported = mkdtempSync(join(tmpdir(), "svglab-exchange-"));

afterAll(() => rmSync(exported, { recursive: true, force: true }));

/** A deliberately separate reader: if the writer and this disagree, one of them is wrong. */
function readBvh(text: string): { joints: string[]; frameTime: number; frames: number[][] } {
  const joints = [...text.matchAll(/(?:ROOT|JOINT)\s+(\S+)/g)].map((match) => match[1]);
  const motion = text.slice(text.indexOf("MOTION")).split("\n");
  const frameTime = Number(motion.find((line) => line.startsWith("Frame Time:"))?.split(":")[1]);
  const frames = motion
    .slice(motion.findIndex((line) => line.startsWith("Frame Time:")) + 1)
    .filter((line) => line.trim() !== "")
    .map((line) => line.trim().split(/\s+/).map(Number));
  return { joints, frameTime, frames };
}

describe("motion exchange with external tools", () => {
  it("round trips every clip inside the reduction tolerance", () => {
    expect(() => execFileSync(process.execPath, ["scripts/check-motion-exchange.mjs"], {
      cwd: root,
      stdio: "pipe",
    })).not.toThrow();
  });

  it("writes exactly what the lab plays, one BVH frame per tick", () => {
    execFileSync(process.execPath, ["scripts/export-motions.mjs", "--out", exported], { cwd: root, stdio: "pipe" });

    for (const name of Object.keys(CLIPS) as ClipName[]) {
      const clip = CLIPS[name];
      const { joints, frameTime, frames } = readBvh(readFileSync(join(exported, `${name}.bvh`), "utf8"));
      expect(joints[0]).toBe("pelvis");
      expect(joints).toHaveLength(11);
      expect(frameTime).toBeCloseTo(1 / 60, 6);
      expect(frames).toHaveLength(clip.duration + 1);

      for (let frame = 0; frame <= clip.duration; frame += 1) {
        const pose = sampleClip(clip, frame);
        const row = frames[frame];
        // The root carries six channels; every other joint carries three.
        expect(row).toHaveLength(6 + (joints.length - 1) * 3);
        expect(row[1]).toBeCloseTo(42 - (pose.pelvis?.y ?? 0), 5);
        joints.forEach((joint, index) => {
          const rotation = index === 0 ? row[3] : row[6 + (index - 1) * 3];
          expect(-rotation, `${name} ${joint} at tick ${frame}`).toBeCloseTo(pose[joint]?.rotation ?? 0, 5);
        });
      }
    }
  });

  it("hands an imported clip the presentation decisions made for its origin", () => {
    const cut = swordTrackFor("bnrSwordCutNormal", null);
    expect(swordTrackFor("bnrSwordCutTweak", "bnrSwordCutNormal")).toBe(cut);
    expect(swordTrackFor("labFromScratch", null)).not.toBe(cut);

    expect(resolveArmLayerProfile("bnrSwordCutTweak", "bnrSwordCutNormal"))
      .toBe(resolveArmLayerProfile("bnrSwordCutNormal", null));
    expect(resolveArmLayerProfile("labFromScratch", null)).toBe("anatomical");
  });

  it("reviews imported clips in the preview without a moveset adopting them", () => {
    // Nothing is imported in a clean checkout, so every option comes from a moveset slot.
    for (const weapon of ["unarmed", "sword"] as const) {
      for (const option of previewClipOptions(weapon)) {
        expect(option.group).not.toBe("authored");
        expect(CLIPS[option.clip]).toBeDefined();
      }
    }
  });

  it("writes the fighter's own artwork beside the bones, ready to be placed", () => {
    execFileSync(process.execPath, ["scripts/export-motions.mjs", "--out", exported], { cwd: root, stdio: "pipe" });
    const bones = [
      "pelvis", "torso", "head", "arm-front", "forearm-front", "arm-back", "forearm-back",
      "leg-front", "shin-front", "leg-back", "shin-back",
    ];
    const art = readdirSync(join(exported, "art"));
    expect(art.sort()).toEqual(bones.map((bone) => `${bone}.svg`).sort());

    // A BVH carries no geometry, so the setup script places these against the rest pose.
    expect(existsSync(join(exported, "setup.py"))).toBe(true);
    const order: number[] = [];
    for (const bone of bones) {
      const svg = readFileSync(join(exported, "art", `${bone}.svg`), "utf8");
      expect(svg).toContain('id="svglab-calibration"');
      const ids = [...svg.matchAll(/id="svglab-(part|line)-(\d+)"/g)];
      expect(ids.length).toBeGreaterThan(0);
      order.push(...ids.map((id) => Number(id[2])));
    }
    // Paint order is document order, and it has to stay unique across the whole fighter for
    // an importer to rebuild the depth the lab draws in.
    expect(new Set(order).size).toBe(order.length);
  });

  it("keeps provenance readable from the clip name alone", () => {
    for (const name of Object.keys(CLIPS)) {
      expect(name).toMatch(/^(bnr|lab)/);
      if (name.startsWith("lab")) expect(clipOrigin(name as ClipName)).toBeNull();
      else expect(clipOrigin(name as ClipName)).toMatch(/^bnr/);
    }
  });
});
