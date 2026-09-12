import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIPS } from "../src/animation/clips";
import { SKINS } from "../src/svg/characters";
import {
  armDepth,
  armLayerPlan,
  armLayerProfile,
  fighterPlacement,
  inspectFighterModel,
  legDepth,
  torsoArtTransform,
} from "../src/svg/rig";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function clipBones(): Map<string, Set<string>> {
  return new Map(Object.entries(CLIPS).map(([name, clip]) => {
    const bones = new Set<string>();
    for (const keyframe of clip.keyframes) {
      for (const bone of Object.keys(keyframe.bones)) bones.add(bone);
    }
    return [name, bones];
  }));
}

describe("character preview rig contract", () => {
  it("mirrors the complete rig at the placement boundary", () => {
    expect(fighterPlacement(120, 224, 1.55, 1)).toBe("translate(120 224) scale(1.55 1.55)");
    expect(fighterPlacement(120, 224, 1.55, -1)).toBe("translate(120 224) scale(-1.55 1.55)");
    expect(armDepth(1)).toEqual({ far: "arm-front", near: "arm-back" });
    expect(armDepth(-1)).toEqual({ far: "arm-back", near: "arm-front" });
    expect(legDepth(1)).toEqual({ far: "leg-front", near: "leg-back" });
    expect(legDepth(-1)).toEqual({ far: "leg-back", near: "leg-front" });
  });

  it("selects motion-aware arm layering for every Bandai Namco clip family", () => {
    for (const clip of ["bnrWalkNormal", "bnrRunNormal", "bnrDashNormal"] as const) {
      expect(armLayerProfile(clip)).toBe("locomotion");
    }
    expect(armLayerProfile("bnrIdleNormal")).toBe("both-front");
    for (const clip of
      ["bnrStrikeNormal", "bnrSwordSlashNormal", "bnrSwordCutNormal", "bnrSlashStudyNormal",
        "bnrPunchStudyNormal"] as const) {
      expect(armLayerProfile(clip)).toBe("punch");
    }
    // The guard never lifts the blade across the head, so the arms stay anatomically layered.
    expect(armLayerProfile("bnrSwordGuardNormal")).toBe("both-front");
    expect(armLayerProfile("bnrCrouchNormal")).toBe("anatomical");

    expect(armLayerPlan(1, "bnrWalkNormal")).toEqual({
      underLowerBody: "arm-front", behindTorso: null, foreground: ["arm-back"], head: "above-arms",
    });
    expect(armLayerPlan(-1, "bnrWalkNormal")).toEqual({
      underLowerBody: "arm-back", behindTorso: null, foreground: ["arm-front"], head: "above-arms",
    });
    expect(armLayerPlan(1, "bnrStrikeNormal")).toEqual({
      underLowerBody: null, behindTorso: null, foreground: ["arm-front", "arm-back"], head: "below-arms",
    });
    expect(armLayerPlan(-1, "bnrStrikeNormal")).toEqual({
      underLowerBody: null, behindTorso: null, foreground: ["arm-back", "arm-front"], head: "below-arms",
    });
  });

  it("counter-mirrors chest artwork while the left-facing skeleton remains mirrored", () => {
    expect(torsoArtTransform(1)).toBeNull();
    expect(torsoArtTransform(-1)).toBe("scale(-1 1)");
  });

  it("exposes both facings in the visual clip preview", () => {
    const html = readFileSync(join(root, "preview.html"), "utf8");
    expect(html).toContain('id="face-left"');
    expect(html).toContain('<kbd>F</kbd> facing');
  });

  it("every SKINS entry resolves to a fighter model the rig accepts", () => {
    expect(new Set(SKINS.map((entry) => entry.id)).size).toBe(SKINS.length);

    for (const entry of SKINS) {
      const facts = inspectFighterModel(entry.model);
      expect(facts.bones.length, `${entry.id} has no rig bones`).toBeGreaterThan(0);
    }
  });

  it("every clip-referenced bone exists in every skin", () => {
    for (const entry of SKINS) {
      const modelBones = new Set(inspectFighterModel(entry.model).bones);
      for (const [clipName, referenced] of clipBones()) {
        const missing = [...referenced].filter((bone) => !modelBones.has(bone));
        expect(missing, `${entry.id} is missing bones required by ${clipName}`).toEqual([]);
      }
    }
  });
});
