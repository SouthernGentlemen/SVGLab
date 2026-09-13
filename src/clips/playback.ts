import type { Clip } from "./types.ts";

/** Last distinct frame shown by the preview before repeating from frame zero. */
export function previewLastFrame(clip: Clip): number {
  if (clip.duration <= 0) return 0;
  return clip.loop ? Math.max(0, clip.duration - 1) : clip.duration;
}

/** Preview is intentionally cyclical even when the authored combat clip itself is one-shot. */
export function advancePreviewFrame(clip: Clip, frame: number): number {
  const last = previewLastFrame(clip);
  return frame >= last ? 0 : frame + 1;
}
