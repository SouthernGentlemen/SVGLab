import { GROUND_Y, px } from "./constants.ts";
import { LAB_FIGHTER, validateContent } from "./content.ts";
import { advanceAttack, startAttack } from "./commands/attack.ts";
import { resolvePushboxes } from "./collision/pushbox.ts";
import { resolveContacts } from "./hit-resolution.ts";
import { applyGroundInput, applyMovement } from "./movement/physics.ts";
import { activeMove, attackPhase, enterMode, isActionable } from "./state/machine.ts";
import { InputBit } from "./types.ts";
import type { AttackPhase, FighterState, FrameReport, InputFrame, SimulationConfig, SimulationState } from "./types.ts";

const DEFAULT_CONFIG: SimulationConfig = {
  definitions: [LAB_FIGHTER, LAB_FIGHTER],
  // Canonical contact setup: the basic strike can connect immediately after reset.
  startX: [px(-40), px(40)],
};

function fighter(id: FighterState["id"], x: number, health: number, facing: -1 | 1): FighterState {
  return {
    id,
    x,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing,
    mode: "idle",
    stateFrame: 0,
    move: "basic",
    moveFrame: 0,
    health,
    hitstop: 0,
    stun: 0,
    invulnerable: false,
    hitTargets: [],
    previousInput: 0,
  };
}

export class CombatSimulation {
  readonly config: SimulationConfig;
  private state: SimulationState;

  constructor(config: SimulationConfig = DEFAULT_CONFIG) {
    this.config = config;
    for (const definition of config.definitions) validateContent(definition);
    this.state = this.initialState();
  }

  private initialState(): SimulationState {
    return {
      tick: 0,
      fighters: [
        fighter("player", this.config.startX[0], this.config.definitions[0].maxHealth, 1),
        fighter("dummy", this.config.startX[1], this.config.definitions[1].maxHealth, -1),
      ],
    };
  }

  getState(): SimulationState {
    return this.state;
  }

  reset(): SimulationState {
    this.state = this.initialState();
    return this.state;
  }

  setDummyInvulnerable(invulnerable: boolean): void {
    this.state.fighters[1].invulnerable = invulnerable;
  }

  step(inputs: readonly InputFrame[]): FrameReport {
    const state = this.state;
    const beforeModes = state.fighters.map(({ mode }) => mode);
    const beforePhases = state.fighters.map((current, index) =>
      attackPhase(current, activeMove(current, this.config.definitions[index])));
    const frozen = [false, false];
    const report: FrameReport = { frame: state.tick, phase: beforePhases[0], contacts: [], events: [] };

    for (let index = 0; index < state.fighters.length; index++) {
      const current = state.fighters[index];
      const definition = this.config.definitions[index];
      const input = inputs[index] ?? 0;

      if (current.hitstop > 0) {
        current.hitstop--;
        frozen[index] = true;
        continue;
      }

      const running = activeMove(current, definition);
      if (current.mode === "attack" && advanceAttack(current, running)) {
        report.events.push({ frame: state.tick, kind: "attack-ended", fighter: current.id, detail: `${running.name} recovered` });
      } else if (current.mode === "hitstun") {
        if (current.stun === 0) {
          enterMode(current, current.y > GROUND_Y ? "jump" : "idle");
          report.events.push({ frame: state.tick, kind: "recovered", fighter: current.id, detail: `${current.id} recovered from hitstun` });
        } else {
          current.stun--;
        }
      }

      const pressed = (bit: number): boolean => (input & bit) !== 0 && (current.previousInput & bit) === 0;
      // Both buttons reach the same attack state; only the frame data behind it differs.
      const requested = pressed(InputBit.Slash) ? "sword" : pressed(InputBit.Attack) ? "basic" : null;
      applyGroundInput(current, definition, input);
      if (requested !== null && isActionable(current)) {
        startAttack(current, requested);
        report.events.push({ frame: state.tick, kind: "attack-started", fighter: current.id, detail: definition.moves[requested].name });
      }
    }

    for (let index = 0; index < state.fighters.length; index++) {
      if (!frozen[index]) applyMovement(state.fighters[index], this.config.definitions[index]);
    }

    const [player, dummy] = state.fighters;
    if (!frozen[0] && isActionable(player)) player.facing = player.x <= dummy.x ? 1 : -1;
    if (!frozen[1] && isActionable(dummy)) dummy.facing = dummy.x <= player.x ? 1 : -1;

    resolvePushboxes(state, this.config.definitions);
    resolveContacts(state, this.config.definitions, report);

    for (let index = 0; index < state.fighters.length; index++) {
      const current = state.fighters[index];
      const phase = attackPhase(current, activeMove(current, this.config.definitions[index]));
      if (phase !== beforePhases[index] && phase !== null) {
        report.events.push({ frame: state.tick, kind: "phase-changed", fighter: current.id, detail: phase });
      }
      if (current.mode !== beforeModes[index]) {
        report.events.push({
          frame: state.tick,
          kind: "state-changed",
          fighter: current.id,
          detail: `${beforeModes[index]} → ${current.mode}`,
        });
      }
      if (!frozen[index]) current.stateFrame++;
      current.previousInput = inputs[index] ?? 0;
    }

    report.phase = attackPhase(player, activeMove(player, this.config.definitions[0]));
    state.tick++;
    return report;
  }
}
