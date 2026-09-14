import { AUTHORED_CLIPS, AUTHORED_ORIGINS } from "./generated/authored.ts";
import { BANDAI_NAMCO_CLIPS } from "./generated/bandai-namco.ts";
import type { Clip } from "boneyard";

/**
 * Everything the lab can play, in two lanes.
 *
 * Manifest clips are rebuilt from the pinned Bandai Namco source on every build. Authored
 * clips come back from an external tool through `npm run import:motions` and win when they
 * carry a manifest clip's key, so a hand-tweaked version of a clip replaces what plays while
 * the manifest keeps deriving the untouched original to compare against.
 */
export const CLIPS = { ...BANDAI_NAMCO_CLIPS, ...AUTHORED_CLIPS } satisfies Record<string, Clip>;

export type ClipName = keyof typeof CLIPS;
export type BnrClipName = keyof typeof BANDAI_NAMCO_CLIPS;

export function clip(name: string): Clip {
  const found = (CLIPS as Record<string, Clip>)[name];
  if (!found) throw new Error(`unknown clip '${name}'`);
  return found;
}

/** Where an authored clip came from: a manifest clip's key, or null when authored here. */
export function clipOrigin(name: ClipName): string | null {
  const origin = (AUTHORED_ORIGINS as Record<string, string | null>)[name];
  if (origin === undefined) return name in BANDAI_NAMCO_CLIPS ? name : null;
  return origin;
}
