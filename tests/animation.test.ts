import { describe, expect, it } from "vitest";
import { BANDAI_NAMCO_CLIPS } from "../src/animation/generated/bandai-namco";
import { CLIPS } from "../src/animation/clips";
import { AUTHORED_SWORD_CLIPS } from "../src/animation/sword-reference";
import { animationSnapshot, sampleClip } from "../src/animation/sample";
import { px } from "../src/combat/constants";
import { LAB_FIGHTER } from "../src/combat/content";
import { CombatSimulation } from "../src/combat/simulation";
import { InputBit } from "../src/combat/types";

describe("SVG animation boundary", () => {
  it("interpolates sparse bone properties without simulation knowledge", () => {
    const pose = sampleClip(CLIPS.bnrStrikeNormal, 3.5);
    expect(pose["arm-front"].rotation).toBeGreaterThan(-85.086);
    expect(pose["arm-front"].rotation).toBeLessThan(-84.669);
  });

  it("keeps imported capture and authored sword references explicit", () => {
    expect(Object.keys(BANDAI_NAMCO_CLIPS).every((name) => name.startsWith("bnr"))).toBe(true);
    expect(Object.keys(AUTHORED_SWORD_CLIPS)).toEqual([
      "swordGuardReference",
      "swordOberhauReference",
      "swordOberhauStudyReference",
    ]);
    for (const name of Object.keys(BANDAI_NAMCO_CLIPS)) expect(CLIPS[name as keyof typeof CLIPS]).toBeDefined();
    for (const name of Object.keys(AUTHORED_SWORD_CLIPS)) expect(CLIPS[name as keyof typeof CLIPS]).toBeDefined();

    const simulation = new CombatSimulation();
    expect(animationSnapshot(simulation.getState().fighters[0]).clip).toBe("bnrIdleNormal");
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

  it("selects the sword capture clip from the committed combat move", () => {
    // The fight renderer still has no equipment state; canonical rigid-sword references live in
    // the preview until the arena can render and constrain the weapon as part of its loadout.
    const simulation = new CombatSimulation({ definitions: [LAB_FIGHTER, LAB_FIGHTER], startX: [px(-100), px(100)] });
    simulation.step([InputBit.Slash, 0]);
    for (let frame = 0; frame < 15; frame++) simulation.step([0, 0]);
    const snapshot = animationSnapshot(simulation.getState().fighters[0]);
    expect(snapshot.clip).toBe("bnrSwordSlashNormal");
    expect(snapshot.frame).toBe(15);
    expect(snapshot.duration).toBe(30);
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
