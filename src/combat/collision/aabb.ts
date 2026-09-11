import type { Aabb, Box, Facing } from "../types";

/** Touching edges are not an overlap. This keeps flush boxes stable. */
export function overlaps(a: Aabb, b: Aabb): boolean {
  return a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
}

export function intersection(a: Aabb, b: Aabb): Aabb | null {
  if (!overlaps(a, b)) return null;
  return {
    x0: Math.max(a.x0, b.x0),
    y0: Math.max(a.y0, b.y0),
    x1: Math.min(a.x1, b.x1),
    y1: Math.min(a.y1, b.y1),
  };
}

/** The one place a forward-authored local box is mirrored into world space. */
export function boxToWorld(box: Box, originX: number, originY: number, facing: Facing): Aabb {
  const x0 = facing === 1 ? originX + box.x : originX - box.x - box.w;
  const y0 = originY + box.y;
  return { x0, y0, x1: x0 + box.w, y1: y0 + box.h };
}
