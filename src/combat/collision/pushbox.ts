import { STAGE_MAX_X, STAGE_MIN_X } from "../constants";
import type { FighterDefinition, FighterState, SimulationState } from "../types";
import { overlaps } from "./aabb";
import { pushboxOf } from "./boxes";

function clamp(fighter: FighterState, definition: FighterDefinition): void {
  const box = pushboxOf(fighter, definition);
  if (box.x0 < STAGE_MIN_X) fighter.x += STAGE_MIN_X - box.x0;
  else if (box.x1 > STAGE_MAX_X) fighter.x -= box.x1 - STAGE_MAX_X;
}

export function resolvePushboxes(state: SimulationState, definitions: readonly FighterDefinition[]): void {
  const [leftCandidate, rightCandidate] = state.fighters;
  const firstBox = pushboxOf(leftCandidate, definitions[0]);
  const secondBox = pushboxOf(rightCandidate, definitions[1]);
  if (overlaps(firstBox, secondBox)) {
    const overlap = Math.min(firstBox.x1, secondBox.x1) - Math.max(firstBox.x0, secondBox.x0);
    const firstIsLeft = leftCandidate.x <= rightCandidate.x;
    const left = firstIsLeft ? leftCandidate : rightCandidate;
    const right = firstIsLeft ? rightCandidate : leftCandidate;
    const half = Math.trunc(overlap / 2);
    left.x -= half;
    right.x += overlap - half;
  }
  clamp(state.fighters[0], definitions[0]);
  clamp(state.fighters[1], definitions[1]);
}
