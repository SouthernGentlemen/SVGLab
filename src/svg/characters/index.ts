/**
 * Characters traced from an atlas.
 *
 * Each entry is an authored fighter SVG in exactly the shape `../fighter.svg` has — a
 * `data-model="fighter"` group of nested `data-bone` groups — produced by
 * `scripts/build-characters.mjs` from `characters/<id>/atlas.png`. They are generated files:
 * editing one is pointless because the next build overwrites it, and `npm run verify` fails
 * the moment a checked-in SVG stops matching its atlas.
 *
 * Nothing here knows anything about combat. A character is a skin, the rig underneath it is
 * the same eleven bones for everybody, and every clip in `../../animation/clips.ts` plays on
 * all of them without alteration — which is the whole reason the tracer emits this shape
 * rather than one of its own.
 */

import barst from "./barst.svg?raw";
import kiran from "./kiran.svg?raw";
import yuliya from "./yuliya.svg?raw";

import authored from "../fighter.svg?raw";

export interface CharacterSkin {
  readonly id: string;
  readonly name: string;
  readonly model: string;
}

/** The hand-drawn fighter. Kept first: it is the readable reference the rig is explained by. */
export const AUTHORED_SKIN: CharacterSkin = { id: "authored", name: "Authored fighter", model: authored };

export const SKINS: readonly CharacterSkin[] = [
  AUTHORED_SKIN,
  { id: "barst", name: "Barst", model: barst },
  { id: "kiran", name: "Kiran", model: kiran },
  { id: "yuliya", name: "Yuliya", model: yuliya },
];

export function skin(id: string): CharacterSkin {
  const found = SKINS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Unknown character skin ${id}`);
  return found;
}
