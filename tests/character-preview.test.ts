import { describe, expect, it } from "vitest";
import { CLIPS } from "../src/animation/clips";
import { SKINS } from "../src/svg/characters";
import { inspectFighterModel } from "../src/svg/rig";

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
