import { BANDAI_NAMCO_CLIPS } from "./generated/bandai-namco";

/** All active preview motion is generated from pinned source capture. */
export const CLIPS = BANDAI_NAMCO_CLIPS;

export type ClipName = keyof typeof CLIPS;
