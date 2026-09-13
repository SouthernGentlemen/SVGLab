import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { anchorPoint, hasAnchor, validateRig } from "../../src/rig/contract.ts";
import { forwardKinematics, inBone } from "../../src/rig/fk.ts";

const rig = validateRig(JSON.parse(readFileSync("rigs/fighter.rig.json", "utf8")));

describe("anchors, depth slots and cosmetic kinds", () => {
  it("resolves every anchor a cosmetic kind names", () => {
    const kinds = rig.contract.wardrobe.kinds;
    expect(Object.keys(kinds).length).toBeGreaterThan(0);
    for (const [kind, rules] of Object.entries(kinds)) {
      expect(hasAnchor(rig.contract, rules.anchor), `${kind} anchor`).toBe(true);
      if (rules.mirror) expect(hasAnchor(rig.contract, rules.mirror), `${kind} mirror`).toBe(true);
      expect(rig.contract.depthSlots).toContain(rules.layer);
    }
  });

  it("puts a joint anchor exactly on the joint, so nothing restates an offset", () => {
    // An anchor that names a joint IS the child bone's offset. If these ever disagree the rig is
    // stating the same number twice, which is the drift C1 exists to prevent.
    const pairs: Array<[string, string]> = [
      ["torso.neck", "head"],
      ["torso.shoulder-front", "arm-front"],
      ["torso.shoulder-back", "arm-back"],
      ["pelvis.hip-front", "leg-front"],
      ["pelvis.hip-back", "leg-back"],
      ["arm-front.elbow", "forearm-front"],
      ["leg-front.knee", "shin-front"],
    ];
    for (const [anchor, bone] of pairs) {
      expect(anchorPoint(rig, anchor), anchor).toEqual(rig.byName.get(bone)!.offset);
    }
  });

  it("keeps the grip separate from the bone tip, because they are different questions", () => {
    // The tip is how far the forearm reaches and is what BVH draws the bone with. The grip is
    // where a hand closes on a prop. These were 23 and 18 in two different files, with a third
    // number hardcoded in the weapon IK; naming both is what stops that happening again.
    const forearm = rig.byName.get("forearm-front")!;
    expect(forearm.tip).toEqual([0, 23]);
    expect(anchorPoint(rig, "forearm-front.grip")).toEqual([0, 18]);
    expect(anchorPoint(rig, "forearm-front.grip")).not.toEqual(forearm.tip);
    expect(anchorPoint(rig, "forearm-back.grip")).toEqual(anchorPoint(rig, "forearm-front.grip"));
  });

  it("carries an anchor into world space through the pose", () => {
    const rest = forwardKinematics(rig, {});
    const neck = inBone(rest.get("torso")!, anchorPoint(rig, "torso.neck"));
    const head = rest.get("head")!;
    // at rest the neck anchor and the head's own origin are the same place
    expect(neck.x).toBeCloseTo(head.x, 10);
    expect(neck.y).toBeCloseTo(head.y, 10);

    // and it follows the bone it belongs to: turn the torso and the neck travels with it
    const turned = forwardKinematics(rig, { torso: { rotation: 90 } });
    const movedNeck = inBone(turned.get("torso")!, anchorPoint(rig, "torso.neck"));
    expect(movedNeck.x).toBeCloseTo(turned.get("head")!.x, 10);
    expect(movedNeck.y).toBeCloseTo(turned.get("head")!.y, 10);
    expect(movedNeck.x).not.toBeCloseTo(neck.x, 3);
  });

  it("places the rest pose where the space says it does", () => {
    const rest = forwardKinematics(rig, {});
    expect(rest.get("pelvis")).toMatchObject({ x: 0, y: -42 });
    // the head sits a head's height above the pelvis, inside the declared viewBox
    const [, minY, , boxHeight] = rig.contract.space.viewBox;
    const head = rest.get("head")!;
    expect(head.y).toBeGreaterThan(minY);
    expect(head.y).toBeLessThan(minY + boxHeight);
  });
});
