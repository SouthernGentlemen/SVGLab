import { describe, expect, it } from "vitest";

import { traceOptionsFor } from "../../pipelines/sprite/part.ts";
import { tracePart } from "../../pipelines/sprite/trace.ts";
import type { RasterPart } from "../../pipelines/sprite/trace.ts";

function flatPart(width: number, height: number, colour: readonly [number, number, number]): RasterPart {
  const rgba = Buffer.alloc(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel++) {
    rgba.set([...colour, 255], pixel * 4);
  }
  return { width, height, rgba };
}

describe("the historical flat-colour tracer", () => {
  it("is byte-deterministic", () => {
    const part = flatPart(7, 5, [30, 80, 120]);
    const options = { colours: 3, epsilon: 1.2, places: 1, minRegionArea: 2 };
    expect(tracePart(part, { x: 3.25, y: 1.75 }, options))
      .toEqual(tracePart(part, { x: 3.25, y: 1.75 }, options));
  });

  it("defaults coordinates to two places and honours the threaded places knob", () => {
    const part = flatPart(4, 4, [80, 120, 160]);
    const origin = { x: 1 / 3, y: 1 / 3 };
    const defaults = tracePart(part, origin, { colours: 1, epsilon: 0, smoothing: 0 });
    const explicit = tracePart(part, origin, { colours: 1, epsilon: 0, smoothing: 0, places: 2 });
    const compact = tracePart(part, origin, { colours: 1, epsilon: 0, smoothing: 0, places: 1 });
    expect(defaults).toEqual(explicit);
    expect(defaults.paths[0].d).toContain("-0.33");
    expect(compact.paths[0].d).toContain("-0.3");
    expect(compact.paths[0].d).not.toContain("-0.33");
  });

  it("keeps a silhouette below connected colour patches and welds only substantial seams", () => {
    const part = flatPart(7, 7, [210, 160, 100]);
    // A high-contrast nested detail survives despeckling even though it is small.
    const centre = (3 * part.width + 3) * 4;
    part.rgba.set([10, 20, 30, 255], centre);
    part.rgba.set([10, 20, 30, 255], centre + 4);
    const traced = tracePart(part, { x: 3.5, y: 3.5 }, {
      colours: 2,
      epsilon: 0,
      smoothing: 0,
      minRegionArea: 12,
    });
    expect(traced.paths.length).toBeGreaterThanOrEqual(3);
    expect(traced.paths[0].seam).toBe(0);
    expect(traced.paths.some((path) => path.seam > 0)).toBe(true);
    expect(traced.paths.at(-1)?.seam).toBe(0);
    expect(traced.paths.at(-1)?.fill).not.toBe(traced.paths[0].fill);
  });

  it("resolves a slot override on top of the atlas default", () => {
    const profile = {
      default: { colours: 3, epsilon: 3, places: 1, minRegionArea: 48 },
      bySlot: { head: { colours: 12, epsilon: 1.2, minRegionArea: 12 } },
    };
    expect(traceOptionsFor(profile, "torso")).toEqual(profile.default);
    expect(traceOptionsFor(profile, "head")).toEqual({
      colours: 12,
      epsilon: 1.2,
      places: 1,
      minRegionArea: 12,
    });
  });
});
