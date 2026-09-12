import { AUTHORED_CLIPS, AUTHORED_ORIGINS } from "./generated/authored";
import { BANDAI_NAMCO_CLIPS } from "./generated/bandai-namco";

/**
 * Everything the lab can play, in two lanes.
 *
 * Manifest clips are rebuilt from the pinned Bandai Namco source on every build. Authored
 * clips come back from an external tool through `npm run import:motions` and win when they
 * carry a manifest clip's key, so a hand-tweaked version of a clip replaces what plays while
 * the manifest keeps deriving the untouched original to compare against.
 */
export const CLIPS = { ...BANDAI_NAMCO_CLIPS, ...AUTHORED_CLIPS };

export type ClipName = keyof typeof CLIPS;
export type BnrClipName = keyof typeof BANDAI_NAMCO_CLIPS;

/** Where an authored clip came from: a manifest clip's key, or null when authored here. */
export function clipOrigin(clip: ClipName): BnrClipName | null {
  const origin = (AUTHORED_ORIGINS as Record<string, string | null>)[clip];
  if (origin === undefined) return clip in BANDAI_NAMCO_CLIPS ? clip as BnrClipName : null;
  return origin === null ? null : origin as BnrClipName;
}
