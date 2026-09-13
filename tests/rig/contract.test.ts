import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { SUPPORTED_CONTRACT, hierarchyOrder, validateRig } from "../../src/rig/contract.ts";

const RAW = readFileSync("rigs/fighter.rig.json", "utf8");
const fresh = () => JSON.parse(RAW) as Record<string, any>;

describe("the rig contract", () => {
  it("parses, and the tree is a tree", () => {
    const rig = validateRig(fresh());
    expect(rig.root).toBe("pelvis");
    expect(rig.bones).toHaveLength(11);
    const ordered = hierarchyOrder(rig);
    // a parent always precedes its children, which is also the BVH channel order
    const seen = new Set<string>();
    for (const bone of ordered) {
      if (bone.parent !== null) expect(seen.has(bone.parent)).toBe(true);
      seen.add(bone.name);
    }
    expect(seen.size).toBe(11);
  });

  it("gives every leaf a tip, because BVH has nothing to draw one with otherwise", () => {
    const rig = validateRig(fresh());
    const leaves = hierarchyOrder(rig).filter((bone) => bone.children.length === 0);
    expect(leaves.map((bone) => bone.name).sort()).toEqual(
      ["forearm-back", "forearm-front", "head", "shin-back", "shin-front"]);
    for (const leaf of leaves) expect(leaf.tip).not.toBeNull();
  });

  it("orders paint as a permutation of the bones", () => {
    const rig = validateRig(fresh());
    expect([...rig.contract.paintOrder].sort()).toEqual(rig.bones.map((bone) => bone.name).sort());
  });

  // Each of these is a way the contract has actually been wrong, or would be. The message has to
  // name the thing that is wrong: "the rig is invalid" costs the reader the same search twice.
  const mutations: Array<[string, (rig: Record<string, any>) => void, RegExp]> = [
    ["duplicate bone", (r) => r.bones.push({ ...r.bones[3] }), /duplicate bone 'leg-back'/],
    ["unknown parent", (r) => { r.bones[4].parent = "spine"; }, /'shin-back' hangs off unknown bone 'spine'/],
    ["two roots", (r) => { r.bones[5].parent = null; }, /exactly one parentless bone, found 2/],
    ["no root", (r) => { r.bones[0].parent = "head"; }, /found 0|cycle|cannot be reached/],
    ["leaf with no tip", (r) => { r.bones.at(-1).tip = null; }, /leaf bone '[a-z-]+' has no tip/],
    ["illegal name", (r) => { r.bones[2].name = "Shin_Front"; }, /'Shin_Front' is not a lowercase ASCII/],
    ["name too long", (r) => { r.bones[2].name = "a".repeat(64); }, /longer than 63 characters/],
    ["non-finite offset", (r) => { r.bones[2].offset = [0, null]; }, /'shin-front' offset is not a finite/],
    ["root disagreement", (r) => { r.root = "torso"; }, /declares root 'torso' but 'pelvis' is the parentless/],
    ["paint order short", (r) => { r.paintOrder.pop(); }, /paintOrder is not a permutation/],
    ["paint order duplicated", (r) => { r.paintOrder[0] = r.paintOrder[1]; }, /paintOrder is not a permutation/],
    ["anchor on unknown bone", (r) => { r.anchors.spine = { tip: { at: [0, 0] } }; }, /anchors name unknown bone 'spine'/],
    ["anchor that is not a point", (r) => { r.anchors.torso.neck.at = [0]; }, /anchor 'torso.neck' is not a finite/],
    ["undeclared depth slot", (r) => { r.wardrobe.kinds.hat.layer = "midground"; }, /kind 'hat' uses depth slot 'midground', which is not declared/],
    ["cosmetic kind on a missing anchor", (r) => { r.wardrobe.kinds.hat.anchor = "head.antenna"; }, /kind 'hat' names anchor 'head.antenna', which does not exist/],
    ["a contract from the future", (r) => { r.contract = SUPPORTED_CONTRACT + 1; }, /this build understands 1/],
  ];

  for (const [label, mutate, message] of mutations) {
    it(`rejects ${label}`, () => {
      const rig = fresh();
      mutate(rig);
      expect(() => validateRig(rig)).toThrow(message);
    });
  }
});
