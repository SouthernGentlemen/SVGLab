import type { FighterState, MoveDefinition } from "../types";
import { enterMode } from "../state/machine";

export function startAttack(fighter: FighterState): void {
  fighter.moveFrame = 0;
  fighter.hitTargets = [];
  fighter.vx = 0;
  enterMode(fighter, "attack");
}

/** Returns true exactly when the move completes on this tick. */
export function advanceAttack(fighter: FighterState, move: MoveDefinition): boolean {
  fighter.moveFrame++;
  if (fighter.moveFrame < move.duration) return false;
  fighter.moveFrame = 0;
  fighter.hitTargets = [];
  enterMode(fighter, "idle");
  return true;
}
