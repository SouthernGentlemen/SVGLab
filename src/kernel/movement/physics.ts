import { GROUND_Y } from "../constants.ts";
import { InputBit } from "../types.ts";
import type { FighterDefinition, FighterState, InputFrame } from "../types.ts";
import { enterMode, isActionable } from "../state/machine.ts";

export function applyGroundInput(fighter: FighterState, definition: FighterDefinition, input: InputFrame): void {
  if (fighter.y !== GROUND_Y) return;
  if (!isActionable(fighter)) return;
  if ((input & InputBit.Up) !== 0) {
    fighter.vy = definition.jumpVelocity;
    fighter.vx = 0;
    enterMode(fighter, "jump");
    return;
  }
  if ((input & InputBit.Down) !== 0) {
    fighter.vx = 0;
    enterMode(fighter, "crouch");
    return;
  }
  const left = (input & InputBit.Left) !== 0;
  const right = (input & InputBit.Right) !== 0;
  if (left === right) {
    fighter.vx = 0;
    enterMode(fighter, "idle");
    return;
  }
  fighter.vx = left ? -definition.walkSpeed : definition.walkSpeed;
  enterMode(fighter, "walk");
}

export function applyMovement(fighter: FighterState, definition: FighterDefinition): void {
  fighter.x += fighter.vx;
  fighter.y += fighter.vy;
  if (fighter.y > GROUND_Y || fighter.vy > 0) fighter.vy -= definition.gravity;
  if (fighter.y <= GROUND_Y) {
    const landed = fighter.y !== GROUND_Y || fighter.vy !== 0;
    fighter.y = GROUND_Y;
    fighter.vy = 0;
    if (landed && fighter.mode === "jump") enterMode(fighter, "idle");
  }
  if (fighter.mode === "walk" || fighter.vx === 0) return;
  if (Math.abs(fighter.vx) <= definition.groundFriction) fighter.vx = 0;
  else fighter.vx -= Math.sign(fighter.vx) * definition.groundFriction;
}
