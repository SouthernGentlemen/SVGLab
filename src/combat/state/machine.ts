import type { AttackPhase, FighterMode, FighterState, MoveDefinition } from "../types";

export function isActionable(fighter: FighterState): boolean {
  return fighter.mode === "idle" || fighter.mode === "walk" || fighter.mode === "crouch";
}

export function enterMode(fighter: FighterState, mode: FighterMode): FighterMode | null {
  if (fighter.mode === mode) return null;
  const previous = fighter.mode;
  fighter.mode = mode;
  fighter.stateFrame = 0;
  return previous;
}

export function attackPhase(fighter: FighterState, move: MoveDefinition): AttackPhase | null {
  if (fighter.mode !== "attack") return null;
  if (fighter.moveFrame < move.startup) return "startup";
  if (fighter.moveFrame < move.startup + move.active) return "active";
  return "recovery";
}
