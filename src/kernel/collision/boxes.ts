import type { Aabb, DebugBoxes, FighterDefinition, FighterState, MoveDefinition, SimulationState } from "../types.ts";
import { boxToWorld } from "./aabb.ts";
import { activeMove } from "../state/machine.ts";

export function pushboxOf(fighter: FighterState, definition: FighterDefinition): Aabb {
  const box = fighter.y > 0
    ? definition.pushboxAir
    : fighter.mode === "crouch"
      ? definition.pushboxCrouch
      : definition.pushboxStand;
  return boxToWorld(box, fighter.x, fighter.y, fighter.facing);
}

export function hurtboxesOf(fighter: FighterState, definition: FighterDefinition): Aabb[] {
  if (fighter.mode === "defeated") return [];
  const boxes = fighter.y > 0
    ? definition.hurtboxesAir
    : fighter.mode === "crouch"
      ? definition.hurtboxesCrouch
      : definition.hurtboxesStand;
  return boxes.map((box) => boxToWorld(box, fighter.x, fighter.y, fighter.facing));
}

export function activeHitboxesOf(
  fighter: FighterState,
  definition: FighterDefinition,
): Array<{ id: string; aabb: Aabb; definition: MoveDefinition["hitboxes"][number] }> {
  if (fighter.mode !== "attack") return [];
  return activeMove(fighter, definition).hitboxes
    .filter((hitbox) => fighter.moveFrame >= hitbox.startFrame && fighter.moveFrame <= hitbox.endFrame)
    .map((hitbox) => ({
      id: hitbox.id,
      aabb: boxToWorld(hitbox.box, fighter.x, fighter.y, fighter.facing),
      definition: hitbox,
    }));
}

export function debugBoxes(state: SimulationState, definitions: readonly FighterDefinition[]): DebugBoxes {
  return {
    origins: state.fighters.map(({ x, y }) => ({ x, y })),
    pushboxes: state.fighters.map((fighter, index) => pushboxOf(fighter, definitions[index])),
    hurtboxes: state.fighters.map((fighter, index) => hurtboxesOf(fighter, definitions[index])),
    hitboxes: state.fighters.map((fighter, index) => activeHitboxesOf(fighter, definitions[index]).map(({ aabb }) => aabb)),
  };
}
