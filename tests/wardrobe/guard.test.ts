import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { validateWardrobe } from "../../pipelines/guards/wardrobe.ts";
import type { WardrobeFigure } from "../../pipelines/guards/wardrobe.ts";
import { loadBuildRig } from "../../pipelines/sprite/build.ts";
import { loadWardrobeSet } from "../../pipelines/wardrobe/build.ts";
import type { WardrobeSet } from "../../pipelines/wardrobe/types.ts";

const rig = loadBuildRig();
const original = loadWardrobeSet("royal-guard");
const fieldKit = loadWardrobeSet("field-kit");
const armory = loadWardrobeSet("armory");
const figures = Object.fromEntries(["barst", "fighter", "kiran", "yuliya"].map((id) => [
  id,
  JSON.parse(readFileSync(`figures/${id}.json`, "utf8")) as WardrobeFigure,
]));
const readAsset = (reference: string): string => readFileSync(reference, "utf8");
const mutate = (change: (set: WardrobeSet) => void): WardrobeSet => {
  const set = JSON.parse(JSON.stringify(original)) as WardrobeSet;
  change(set);
  return set;
};

describe("wardrobe guard", () => {
  it("reports every figure each piece honestly claims", () => {
    const reports = validateWardrobe("royal-guard", original, rig, figures, readAsset);
    expect(reports).toHaveLength(3);
    expect(reports.every((report) => report.fitted.join(",") === "barst,fighter,kiran,yuliya")).toBe(true);
  });

  it("ships a full helm whose drawn extent covers every fitted head it hides", () => {
    const reports = validateWardrobe("field-kit", fieldKit, rig, figures, readAsset);
    expect(reports.find((report) => report.piece === "full-helm")).toMatchObject({
      kind: "mask",
      fitted: ["barst", "fighter", "kiran", "yuliya"],
      hides: ["head"],
    });
  });

  it("fits the one-handed weapon to every figure without claiming to hide body art", () => {
    expect(validateWardrobe("armory", armory, rig, figures, readAsset)).toEqual([{
      piece: "longsword",
      kind: "weapon",
      fitted: ["barst", "fighter", "kiran", "yuliya"],
      hides: [],
    }]);
  });

  it("accepts a replacement whose drawn extent really covers the hidden art", () => {
    const set = mutate((candidate) => {
      (candidate.pieces.hood as { height: number; hides?: string[] }).height = 80;
      (candidate.pieces.hood as { hides?: string[] }).hides = ["head"];
    });
    expect(() => validateWardrobe("royal-guard", set, rig, figures, readAsset)).not.toThrow();
  });

  it.each([
    ["unknown kind", (set: WardrobeSet) => { (set.pieces.hood as { kind: string }).kind = "tiara"; }, /unknown kind 'tiara'/],
    ["unknown anchor", (set: WardrobeSet) => { (set.pieces.hood as { anchor?: string }).anchor = "head.antenna"; }, /unknown anchor 'head.antenna'/],
    ["undeclared depth slot", (set: WardrobeSet) => { (set.pieces.hood as { layer?: string }).layer = "middle"; }, /undeclared depth slot 'middle'/],
    ["a hidden slot absent from a fitted figure", (set: WardrobeSet) => { (set.pieces.hood as { hides?: string[] }).hides = ["tail"]; }, /hides names slot 'tail'.*figure 'barst'/],
    ["a cosmetic smaller than what it hides", (set: WardrobeSet) => { (set.pieces.hood as { hides?: string[] }).hides = ["head"]; }, /drawn extent does not cover 'head'/],
  ])("rejects %s", (_name, change, message) => {
    expect(() => validateWardrobe("royal-guard", mutate(change), rig, figures, readAsset)).toThrow(message);
  });
});
