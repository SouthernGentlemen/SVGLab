import { describe, expect, it } from "vitest";
import { boxToWorld, intersection, overlaps } from "../../src/kernel/collision/aabb.ts";

describe("AABB combat geometry", () => {
  it("does not treat touching edges as contact", () => {
    const left = { x0: 0, y0: 0, x1: 10, y1: 10 };
    const right = { x0: 10, y0: 0, x1: 20, y1: 10 };
    expect(overlaps(left, right)).toBe(false);
    expect(intersection(left, right)).toBeNull();
  });

  it("authors one forward-facing box and mirrors it at one boundary", () => {
    const local = { x: 20, y: 5, w: 30, h: 10 };
    expect(boxToWorld(local, 100, 0, 1)).toEqual({ x0: 120, y0: 5, x1: 150, y1: 15 });
    expect(boxToWorld(local, 100, 0, -1)).toEqual({ x0: 50, y0: 5, x1: 80, y1: 15 });
  });
});
