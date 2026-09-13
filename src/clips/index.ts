import type { Clip } from "./types.ts";

/**
 * Everything the lab can play.
 *
 * Empty until M2 builds it. The catalog is generated from `motions/` and is not edited here;
 * this file exists so that what reads a clip does not have to know which lane it came from.
 */
export const CLIPS = {} as const satisfies Record<string, Clip>;

export type ClipName = keyof typeof CLIPS;

export function clip(name: string): Clip {
  const found = (CLIPS as Record<string, Clip>)[name];
  if (!found) throw new Error(`unknown clip '${name}'`);
  return found;
}
