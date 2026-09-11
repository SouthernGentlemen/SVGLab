import { px } from "./constants";
import type { FighterDefinition, MoveDefinition } from "./types";

/** The first extraction slice: one transparent frame-data contract, not a move catalog. */
export const BASIC_STRIKE: MoveDefinition = {
  id: "basic-strike",
  name: "Basic strike",
  animation: "strike",
  startup: 5,
  active: 3,
  recovery: 12,
  duration: 20,
  hitboxes: [
    {
      id: "hand",
      startFrame: 5,
      endFrame: 7,
      box: { x: px(24), y: px(44), w: px(52), h: px(26) },
      damage: 12,
      hitstun: 16,
      hitstopAttacker: 6,
      hitstopDefender: 8,
      pushbackAttacker: px(-0.8),
      pushbackDefender: px(3.2),
    },
  ],
};

export const LAB_FIGHTER: FighterDefinition = {
  id: "lab-fighter",
  name: "Study rig",
  maxHealth: 100,
  walkSpeed: px(1.8),
  jumpVelocity: px(7.4),
  gravity: px(0.42),
  groundFriction: px(0.35),
  pushboxStand: { x: px(-15), y: 0, w: px(30), h: px(78) },
  pushboxCrouch: { x: px(-17), y: 0, w: px(34), h: px(52) },
  pushboxAir: { x: px(-14), y: px(4), w: px(28), h: px(68) },
  hurtboxesStand: [
    { x: px(-16), y: 0, w: px(32), h: px(48) },
    { x: px(-18), y: px(48), w: px(36), h: px(42) },
  ],
  hurtboxesCrouch: [
    { x: px(-19), y: 0, w: px(38), h: px(35) },
    { x: px(-15), y: px(35), w: px(30), h: px(24) },
  ],
  hurtboxesAir: [
    { x: px(-15), y: px(3), w: px(30), h: px(42) },
    { x: px(-16), y: px(45), w: px(32), h: px(34) },
  ],
  move: BASIC_STRIKE,
};

export function validateContent(definition: FighterDefinition): void {
  const move = definition.move;
  if (move.duration !== move.startup + move.active + move.recovery) {
    throw new Error(`${move.id}: duration must equal startup + active + recovery`);
  }
  for (const hitbox of move.hitboxes) {
    if (hitbox.startFrame < move.startup) throw new Error(`${move.id}/${hitbox.id}: hitbox begins during startup`);
    if (hitbox.endFrame >= move.startup + move.active) throw new Error(`${move.id}/${hitbox.id}: hitbox extends beyond active frames`);
    if (hitbox.startFrame > hitbox.endFrame) throw new Error(`${move.id}/${hitbox.id}: inverted frame window`);
  }
}
