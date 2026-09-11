import type { FighterDefinition, FrameReport, SimulationState } from "./types";
import { intersection } from "./collision/aabb";
import { activeHitboxesOf, hurtboxesOf } from "./collision/boxes";
import { enterMode } from "./state/machine";

export function resolveContacts(
  state: SimulationState,
  definitions: readonly FighterDefinition[],
  report: FrameReport,
): void {
  for (let attackerIndex = 0; attackerIndex < state.fighters.length; attackerIndex++) {
    const defenderIndex = attackerIndex === 0 ? 1 : 0;
    const attacker = state.fighters[attackerIndex];
    const defender = state.fighters[defenderIndex];
    const active = activeHitboxesOf(attacker, definitions[attackerIndex]);
    const hurtboxes = hurtboxesOf(defender, definitions[defenderIndex]);

    for (const hitbox of active) {
      const gate = `${defender.id}:${hitbox.id}`;
      if (attacker.hitTargets.includes(gate)) continue;
      for (const hurtbox of hurtboxes) {
        const overlap = intersection(hitbox.aabb, hurtbox);
        if (overlap === null) continue;
        attacker.hitTargets.push(gate);

        if (defender.invulnerable) {
          report.contacts.push({ source: attacker.id, target: defender.id, hitboxId: hitbox.id, overlap, damage: 0, ignored: true });
          report.events.push({
            frame: state.tick,
            kind: "invulnerable",
            source: attacker.id,
            target: defender.id,
            detail: `${defender.id} ignored ${hitbox.id}`,
          });
          break;
        }

        const hit = hitbox.definition;
        defender.health = Math.max(0, defender.health - hit.damage);
        attacker.hitstop = Math.max(attacker.hitstop, hit.hitstopAttacker);
        defender.hitstop = Math.max(defender.hitstop, hit.hitstopDefender);
        attacker.vx = hit.pushbackAttacker * attacker.facing;
        defender.vx = hit.pushbackDefender * attacker.facing;
        defender.stun = hit.hitstun;
        enterMode(defender, defender.health === 0 ? "defeated" : "hitstun");

        report.contacts.push({ source: attacker.id, target: defender.id, hitboxId: hitbox.id, overlap, damage: hit.damage, ignored: false });
        report.events.push(
          {
            frame: state.tick,
            kind: "hit",
            source: attacker.id,
            target: defender.id,
            detail: `${hitbox.id} connected`,
          },
          {
            frame: state.tick,
            kind: "damage-received",
            fighter: defender.id,
            detail: `-${hit.damage} health`,
          },
        );
        break;
      }
    }
  }
}
