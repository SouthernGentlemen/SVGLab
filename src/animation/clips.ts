import { BANDAI_NAMCO_CLIPS } from "./generated/bandai-namco";
import { AUTHORED_SWORD_CLIPS } from "./sword-reference";

/** Imported motion studies plus the small hand-authored sword reference set. */
export const CLIPS = {
  ...BANDAI_NAMCO_CLIPS,
  ...AUTHORED_SWORD_CLIPS,
} as const;

export type ClipName = keyof typeof CLIPS;
