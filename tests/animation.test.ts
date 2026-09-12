import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CLIPS } from "../src/animation/clips";
import { sampleClip } from "../src/animation/sample";
import { animationSnapshot } from "../src/animation/snapshot";
import { px } from "../src/combat/constants";
import { LAB_FIGHTER } from "../src/combat/content";
import { CombatSimulation } from "../src/combat/simulation";
import { InputBit } from "../src/combat/types";
import type { AnimationClip } from "../src/animation/types";

describe("SVG animation boundary", () => {
  it("interpolates sparse bone properties without simulation knowledge", () => {
    const pose = sampleClip(CLIPS.bnrStrikeNormal, 3.5);
    expect(pose["arm-front"].rotation).toBeGreaterThan(-85.086);
    expect(pose["arm-front"].rotation).toBeLessThan(-84.669);
  });

  it("ships and selects only Bandai Namco-derived clips", () => {
    expect(Object.keys(CLIPS).every((name) => name.startsWith("bnr"))).toBe(true);
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

  it("selects the sword clip from the committed move, not from the button", () => {
    // Out of reach, so no hitstop interrupts the clip's own tick count.
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

  it("is the one sampler: the motion pipeline runs it under plain node and agrees", () => {
    // The pipeline used to keep a linear-only copy of this function. On a smoothstep clip the
    // two disagreed by 8.64 degrees at tick 2, so an exported BVH would have played something
    // the lab never drew — and validateAuthoredClip accepts smoothstep. The copy is gone; this
    // asserts the pipeline still reaches the real sampler with no build step in the way.
    const eased = {
      name: "labEasingProbe", loop: false, duration: 10, easing: "smoothstep", note: "Easing parity probe.",
      keyframes: [
        { frame: 0, bones: { torso: { rotation: 0 } } },
        { frame: 10, bones: { torso: { rotation: 90 } } },
      ],
    } as const satisfies AnimationClip;
    const ticks = [1, 2, 5, 8, 9];
    const root = dirname(dirname(fileURLToPath(import.meta.url)));
    const script = `import { samplePose } from ${JSON.stringify(join(root, "scripts", "motion", "clip.mjs"))};
      const clip = ${JSON.stringify(eased)};
      console.log(JSON.stringify(${JSON.stringify(ticks)}.map((t) => samplePose(clip, t).torso.rotation)));`;
    const pipeline = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" })) as number[];
    expect(pipeline).toEqual(ticks.map((tick) => sampleClip(eased, tick).torso.rotation));
    expect(sampleClip(eased, 2).torso.rotation).toBeCloseTo(9.36, 2);
  });

  it("treats a clip with no easing as linear rather than as a curve", () => {
    const bare = { duration: 10, loop: false, keyframes: [
      { frame: 0, bones: { torso: { rotation: 0 } } },
      { frame: 10, bones: { torso: { rotation: 100 } } },
    ] } as unknown as AnimationClip;
    expect(sampleClip(bare, 2).torso.rotation).toBe(20);
  });

  it("holds a channel's first authored value instead of interpolating out of an implied zero", () => {
    const late = {
      name: "labLateChannel", loop: false, duration: 10, easing: "linear", note: "Late-channel probe.",
      keyframes: [
        { frame: 0, bones: { pelvis: { y: 0 } } },
        { frame: 4, bones: { torso: { rotation: 40 } } },
        { frame: 10, bones: { torso: { rotation: 40 } } },
      ],
    } as const satisfies AnimationClip;
    // torso is authored as a constant 40 and never authored before tick 4. It must not swing.
    expect(sampleClip(late, 0).torso.rotation).toBe(40);
    expect(sampleClip(late, 2).torso.rotation).toBe(40);
    expect(sampleClip(late, 4).torso.rotation).toBe(40);
  });
});
