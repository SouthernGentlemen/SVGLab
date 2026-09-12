import { describe, expect, it } from "vitest";
import { CLIPS } from "../src/animation/clips";
import { animationSnapshot, sampleClip } from "../src/animation/sample";
import { CombatSimulation } from "../src/combat/simulation";
import { InputBit } from "../src/combat/types";

describe("SVG animation boundary", () => {
  it("interpolates sparse bone properties without simulation knowledge", () => {
    const pose = sampleClip(CLIPS.strike, 4);
    expect(pose.torso.rotation).toBeGreaterThan(-12);
    expect(pose.torso.rotation).toBeLessThan(17);
    expect(pose["arm-front"].rotation).toBeLessThan(46);
  });

  it("derives attack playback from the authoritative move frame", () => {
    const simulation = new CombatSimulation();
    simulation.step([InputBit.Attack, 0]);
    for (let frame = 0; frame < 5; frame++) simulation.step([0, 0]);
    const snapshot = animationSnapshot(simulation.getState().fighters[0]);
    expect(snapshot.clip).toBe("bnrStrikeNormal");
    expect(snapshot.frame).toBe(5);
    expect(snapshot.duration).toBe(20);
  });

  it("uses the imported walk while preserving the simulation-owned state frame", () => {
    const simulation = new CombatSimulation();
    simulation.step([InputBit.Right, 0]);
    const fighter = simulation.getState().fighters[0];
    const snapshot = animationSnapshot(fighter);
    expect(snapshot.clip).toBe("bnrWalkNormal");
    expect(snapshot.frame).toBe(fighter.stateFrame);
    expect(snapshot.duration).toBe(60);
  });
});
