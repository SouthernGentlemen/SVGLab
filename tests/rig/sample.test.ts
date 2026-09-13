import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { sampleClip } from "../../src/rig/sample.ts";
import type { Clip } from "../../src/clips/types.ts";

const STRIKE = {
  name: "labSampleProbe", loop: false, duration: 10, easing: "linear",
  note: "Fixture for the sampler.",
  keyframes: [
    { frame: 0, bones: { torso: { rotation: 0 }, "arm-front": { rotation: -20 } } },
    { frame: 5, bones: { "arm-front": { rotation: 60 } } },
    { frame: 10, bones: { torso: { rotation: 12 }, "arm-front": { rotation: 0 } } },
  ],
} as const satisfies Clip;

describe("the one sampler", () => {
  it("interpolates each property of each bone independently", () => {
    expect(sampleClip(STRIKE, 0)["arm-front"].rotation).toBe(-20);
    expect(sampleClip(STRIKE, 5)["arm-front"].rotation).toBe(60);
    expect(sampleClip(STRIKE, 10)["arm-front"].rotation).toBe(0);
    // torso is keyed only at 0 and 10, so it moves across the whole clip
    expect(sampleClip(STRIKE, 5).torso.rotation).toBe(6);
  });

  it("clamps a one-shot clip and wraps a looping one", () => {
    expect(sampleClip(STRIKE, -3).torso.rotation).toBe(0);
    expect(sampleClip(STRIKE, 99).torso.rotation).toBe(12);
    const loop = { ...STRIKE, loop: true } as Clip;
    expect(sampleClip(loop, 10).torso.rotation).toBe(sampleClip(loop, 0).torso.rotation);
    expect(sampleClip(loop, 12).torso.rotation).toBe(sampleClip(loop, 2).torso.rotation);
  });

  it("eases only when a clip asks for it, and treats an absent easing as linear", () => {
    const eased = { ...STRIKE, easing: "smoothstep" } as Clip;
    expect(sampleClip(eased, 2).torso.rotation).toBeCloseTo(1.248, 3);
    expect(sampleClip(STRIKE, 2).torso.rotation).toBeCloseTo(2.4, 3);
    // several call sites build clip-shaped objects with no easing field; a missing curve is not a curve
    const bare = { duration: 10, loop: false, keyframes: STRIKE.keyframes } as unknown as Clip;
    expect(sampleClip(bare, 2).torso.rotation).toBeCloseTo(2.4, 3);
  });

  it("holds a channel's first authored value instead of interpolating out of an implied zero", () => {
    const late = {
      name: "labLateChannel", loop: false, duration: 10, easing: "linear", note: "Late-channel probe.",
      keyframes: [
        { frame: 0, bones: { pelvis: { y: 0 } } },
        { frame: 4, bones: { torso: { rotation: 40 } } },
        { frame: 10, bones: { torso: { rotation: 40 } } },
      ],
    } as const satisfies Clip;
    // torso is authored as a constant 40 and never authored before tick 4. It must not swing.
    expect(sampleClip(late, 0).torso.rotation).toBe(40);
    expect(sampleClip(late, 2).torso.rotation).toBe(40);
    expect(sampleClip(late, 4).torso.rotation).toBe(40);
  });

  it("is reachable from a pipeline under plain node, with no build step in the way", () => {
    // C2 held by construction rather than asserted by a parity test: there is one function, and
    // this is the property that lets a pipeline bake an export through the code the page draws
    // with. If node ever stops running the TypeScript directly, this fails here and not in M3.
    const ticks = [0, 2, 5, 8, 10];
    const sampler = resolve("src/rig/sample.ts");
    const script = `import { sampleClip } from ${JSON.stringify(sampler)};
      const clip = ${JSON.stringify(STRIKE)};
      console.log(JSON.stringify(${JSON.stringify(ticks)}.map((t) => sampleClip(clip, t)["arm-front"].rotation)));`;
    const fromPipeline = JSON.parse(
      execFileSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" })) as number[];
    expect(fromPipeline).toEqual(ticks.map((tick) => sampleClip(STRIKE, tick)["arm-front"].rotation));
  });
});
