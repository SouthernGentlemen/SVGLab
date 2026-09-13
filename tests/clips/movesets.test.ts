import { describe, expect, it } from "vitest";

import { CLIPS } from "../../src/clips/index.ts";
import {
  GENERIC_MOVESET,
  SWORD_MOVESET,
  UNARMED_MOVESET,
  defaultPreviewClip,
  previewClipNames,
} from "../../src/clips/movesets.ts";

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
    expect(unarmed).not.toContain(SWORD_MOVESET.clips.primary);
    expect(sword).toContain(SWORD_MOVESET.clips.primary);
    expect(sword).toContain(SWORD_MOVESET.clips.secondary);
    expect(sword).not.toContain(UNARMED_MOVESET.clips.primary);
  });

  it("removes study slots and references only shipped clips", () => {
    expect(UNARMED_MOVESET.clips).not.toHaveProperty("study");
    expect(SWORD_MOVESET.clips).not.toHaveProperty("study");
    expect(defaultPreviewClip("unarmed")).toBe(UNARMED_MOVESET.clips.neutral);
    expect(defaultPreviewClip("sword")).toBe(SWORD_MOVESET.clips.neutral);
    for (const clip of new Set([...unarmed, ...sword])) expect(CLIPS[clip]).toBeDefined();
  });
});
