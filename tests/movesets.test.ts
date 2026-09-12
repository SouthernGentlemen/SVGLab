import { describe, expect, it } from "vitest";
import { CLIPS } from "../src/animation/clips";
import {
  GENERIC_MOVESET,
  SWORD_MOVESET,
  UNARMED_MOVESET,
  defaultPreviewClip,
  previewClipNames,
} from "../src/animation/movesets";

const generic = Object.values(GENERIC_MOVESET.clips);
const unarmed = previewClipNames("unarmed");
const sword = previewClipNames("sword");

describe("weapon-aware animation movesets", () => {
  it("keeps the generic locomotion set available to every loadout", () => {
    for (const clip of generic) {
      expect(unarmed).toContain(clip);
      expect(sword).toContain(clip);
    }
  });

  it("keeps punch clips unarmed and sword clips armed", () => {
    expect(unarmed).toContain(UNARMED_MOVESET.clips.primary);
    expect(unarmed).toContain(UNARMED_MOVESET.clips.study);
    expect(unarmed).not.toContain(SWORD_MOVESET.clips.primary);
    expect(unarmed).not.toContain(SWORD_MOVESET.clips.study);

    expect(sword).toContain(SWORD_MOVESET.clips.primary);
    expect(sword).toContain(SWORD_MOVESET.clips.study);
    expect(sword).toContain(SWORD_MOVESET.clips.sourceCapture);
    expect(sword).not.toContain(UNARMED_MOVESET.clips.primary);
    expect(sword).not.toContain(UNARMED_MOVESET.clips.study);
  });

  it("uses the authored reference guard and attack as the active sword moveset", () => {
    expect(SWORD_MOVESET.clips.neutral).toBe("swordGuardReference");
    expect(SWORD_MOVESET.clips.primary).toBe("swordOberhauReference");
    expect(SWORD_MOVESET.clips.study).toBe("swordOberhauStudyReference");
  });

  it("uses weapon-specific neutral clips and only references shipped animation", () => {
    expect(defaultPreviewClip("unarmed")).toBe(UNARMED_MOVESET.clips.neutral);
    expect(defaultPreviewClip("sword")).toBe(SWORD_MOVESET.clips.neutral);

    for (const clip of new Set([...unarmed, ...sword])) expect(CLIPS[clip]).toBeDefined();
  });
});
