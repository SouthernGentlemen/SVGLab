import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { loadBuildRig } from "../../pipelines/sprite/build.ts";
import { loadWardrobeSet } from "../../pipelines/wardrobe/build.ts";
import { hiddenPartSlots } from "../../src/render/assemble.ts";
import type { CosmeticNode } from "../../src/render/assemble.ts";
import { cosmeticFit, inspectCosmetic, resolveCosmetic, resolveCosmeticPlacements } from "../../src/render/wardrobe.ts";
import type { WardrobeSet } from "../../src/render/wardrobe.ts";

describe("contract-based cosmetic placement", () => {
  const rig = loadBuildRig();
  const set = loadWardrobeSet("royal-guard");
  const armory = loadWardrobeSet("armory");
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

  it("binds one sword to the front grip without invoking cosmetic mirroring", () => {
    const source = readFileSync("cosmetics/armory/longsword.svg", "utf8");
    const sword = inspectCosmetic(source, "longsword", "longsword.svg");
    const placements = resolveCosmeticPlacements(rig, armory, "longsword", sword.height);
    expect(placements).toMatchObject([{
      bone: "forearm-front",
      anchor: "forearm-front.grip",
      point: [0, 18],
      layer: "under",
      mirrored: false,
    }]);
    expect(placements[0].scale).toBeCloseTo(73 / 74, 10);
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

  it("reports fit as a pure value", () => {
    expect(cosmeticFit(rig, set, "hood", "barst")).toBe("ok");
    const unfitted = structuredClone(set) as WardrobeSet;
    (unfitted.pieces.hood as { fitted?: string[] }).fitted = ["kiran"];
    expect(cosmeticFit(rig, unfitted, "hood", "barst")).toBe("not fitted");
    expect(cosmeticFit(rig, set, "missing", "barst")).toBe("unknown piece");
    const wrongRig = { ...set, rig: "other" };
    expect(cosmeticFit(rig, wrongRig, "hood", "barst")).toBe("wrong rig");
    const unknownKind = structuredClone(set) as WardrobeSet;
    (unknownKind.pieces.hood as { kind: string }).kind = "tiara";
    expect(cosmeticFit(rig, unknownKind, "hood", "barst")).toBe("unknown kind");
  });
});
