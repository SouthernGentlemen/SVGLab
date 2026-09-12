import { BANDAI_NAMCO_CLIPS } from "./generated/bandai-namco";

/** All shipped animation is generated from the pinned Bandai Namco source subset. */
export const CLIPS = BANDAI_NAMCO_CLIPS;

export type ClipName = keyof typeof CLIPS;
