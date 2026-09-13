import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadBuildRig } from "../../pipelines/sprite/build.ts";
import { loadWardrobeSet } from "../../pipelines/wardrobe/build.ts";
import { inspectCosmetic, resolveCosmetic, resolveCosmeticPlacements } from "../../pipelines/wardrobe/place.ts";
import { hiddenPartSlots } from "../../src/render/assemble.ts";
import type { CosmeticNode } from "../../src/render/assemble.ts";

describe("contract-based cosmetic placement", () => {
  const rig = loadBuildRig();
  const set = loadWardrobeSet("royal-guard");
  const asset = (piece: string) => inspectCosmetic(
    readFileSync(`cosmetics/royal-guard/${piece}.svg`, "utf8"),
    piece,
    `${piece}.svg`,
  );

  it("places and scales a hat from the rig, without a figure-specific input", () => {
    const placement = resolveCosmetic(rig, set, "hood", asset("hood").height);
    expect(placement).toMatchObject({ bone: "head", anchor: "head.crown", point: [0, -26], layer: "under" });
    expect(placement.scale).toBeCloseTo(28 / 59, 10);
  });

  it("hangs the skirt from the pelvis rather than either leg", () => {
    const placement = resolveCosmetic(rig, set, "skirt", asset("skirt").height);
    expect(placement).toMatchObject({ bone: "pelvis", anchor: "pelvis.waist", point: [0, -8], layer: "outer" });
    expect(placement.scale).toBeCloseTo(34 / 46, 10);
  });

  it("expands one pauldron file to mirrored front and back shoulders", () => {
    const placements = resolveCosmeticPlacements(rig, set, "pauldron", asset("pauldron").height);
    expect(placements.map(({ anchor, mirrored }) => ({ anchor, mirrored }))).toEqual([
      { anchor: "torso.shoulder-front", mirrored: false },
      { anchor: "torso.shoulder-back", mirrored: true },
    ]);
    expect(new Set(placements.map((placement) => placement.scale)).size).toBe(1);
  });

  it("drops hidden part slots only while the claiming cosmetic is enabled", () => {
    const cosmetic = {
      enabled: true,
      piece: { kind: "hat", height: 40, hides: ["head"] },
    } as unknown as CosmeticNode;
    expect([...hiddenPartSlots([cosmetic])]).toEqual(["head"]);
    cosmetic.enabled = false;
    expect([...hiddenPartSlots([cosmetic])]).toEqual([]);
  });
});
