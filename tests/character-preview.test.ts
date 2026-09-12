import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CLIPS } from "../src/animation/clips";
import { SKINS } from "../src/svg/characters";
import { armDepth, fighterPlacement, inspectFighterModel, legDepth } from "../src/svg/rig";

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
