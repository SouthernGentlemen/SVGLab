import { describe, expect, it } from "vitest";

import { inlineJoints, sweepSockets } from "../../pipelines/guards/sockets.ts";
import { loadBuildRig } from "../../pipelines/sprite/build.ts";

const IDS = ["barst", "kiran", "yuliya"];

describe("the exhaustive interchangeable-part socket sweep", () => {
  const rig = loadBuildRig();
  const sweep = sweepSockets(rig, IDS);

  it("covers every sheet against every sheet at both knees and both elbows", () => {
    expect(inlineJoints(rig).map((bone) => bone.name)).toEqual([
      "shin-front", "shin-back", "forearm-front", "forearm-back",
    ]);
    expect(sweep.pairings).toHaveLength(4 * IDS.length * IDS.length);
    for (const joint of sweep.joints) {
      const pairings = sweep.pairings.filter((pairing) => pairing.joint === joint);
      expect(pairings).toHaveLength(9);
      expect(new Set(pairings.map((pairing) => `${pairing.parent}/${pairing.child}`))).toEqual(
        new Set(IDS.flatMap((parent) => IDS.map((child) => `${parent}/${child}`))),
      );
    }
  });

  it("keeps every cross-sheet joint above the declared overlap", () => {
    expect(sweep.overlapFailures).toEqual([]);
    expect(sweep.minimumOverlap).toBeGreaterThanOrEqual(rig.contract.sockets.minimumOverlap);
    expect(sweep.minimumOverlap).toBeCloseTo(1.746, 3);
  });

  it("reports the measured width step without resizing art", () => {
    expect(sweep.widthWarnings).toEqual([]);
    expect(sweep.worstWidthStep).toBeLessThanOrEqual(rig.contract.sockets.maximumWidthStep);
    expect(sweep.worstWidthStep).toBeCloseTo(5.579, 3);
  });
});
