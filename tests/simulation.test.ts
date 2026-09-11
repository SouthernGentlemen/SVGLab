import { describe, expect, it } from "vitest";
import { px } from "../src/combat/constants";
import { LAB_FIGHTER } from "../src/combat/content";
import { CombatSimulation } from "../src/combat/simulation";
import { attackPhase } from "../src/combat/state/machine";
import { InputBit } from "../src/combat/types";

function contactSimulation(): CombatSimulation {
  return new CombatSimulation({ definitions: [LAB_FIGHTER, LAB_FIGHTER], startX: [px(-18), px(18)] });
}

function reachFirstActiveFrame(simulation: CombatSimulation) {
  simulation.step([InputBit.Attack, 0]);
  for (let frame = 0; frame < 5; frame++) simulation.step([0, 0]);
}

describe("minimal combat vertical slice", () => {
  it("maps W to deterministic jump physics and lands without wall-clock input", () => {
    const simulation = new CombatSimulation();
    simulation.step([InputBit.Up, 0]);
    const player = simulation.getState().fighters[0];
    expect(player.mode).toBe("jump");
    expect(player.y).toBeGreaterThan(0);
    expect(player.vy).toBeLessThan(LAB_FIGHTER.jumpVelocity);
    for (let frame = 0; frame < 90 && player.mode === "jump"; frame++) simulation.step([0, 0]);
    expect(player).toMatchObject({ mode: "idle", y: 0, vy: 0 });
  });

  it("maps S to a crouch state with compact collision geometry", async () => {
    const simulation = new CombatSimulation();
    simulation.step([InputBit.Down, 0]);
    const player = simulation.getState().fighters[0];
    expect(player.mode).toBe("crouch");
    const { pushboxOf, hurtboxesOf } = await import("../src/combat/collision/boxes");
    const crouchPush = pushboxOf(player, LAB_FIGHTER);
    const crouchHurt = hurtboxesOf(player, LAB_FIGHTER);
    expect(crouchPush.y1 - crouchPush.y0).toBe(LAB_FIGHTER.pushboxCrouch.h);
    expect(crouchHurt[1].y1).toBeLessThan(LAB_FIGHTER.hurtboxesStand[1].y + LAB_FIGHTER.hurtboxesStand[1].h);
    simulation.step([0, 0]);
    expect(player.mode).toBe("idle");
  });

  it("moves through exact startup, active, and recovery boundaries", () => {
    const simulation = new CombatSimulation({ definitions: [LAB_FIGHTER, LAB_FIGHTER], startX: [px(-100), px(100)] });
    simulation.step([InputBit.Attack, 0]);
    const player = simulation.getState().fighters[0];
    expect(player.moveFrame).toBe(0);
    expect(attackPhase(player, LAB_FIGHTER.move)).toBe("startup");

    for (let frame = 0; frame < 4; frame++) simulation.step([0, 0]);
    expect(player.moveFrame).toBe(4);
    expect(attackPhase(player, LAB_FIGHTER.move)).toBe("startup");
    simulation.step([0, 0]);
    expect(player.moveFrame).toBe(5);
    expect(attackPhase(player, LAB_FIGHTER.move)).toBe("active");
    simulation.step([0, 0]);
    simulation.step([0, 0]);
    simulation.step([0, 0]);
    expect(player.moveFrame).toBe(8);
    expect(attackPhase(player, LAB_FIGHTER.move)).toBe("recovery");
  });

  it("connects once, applies damage, hitstop, hitstun, and knockback, then recovers", () => {
    const simulation = contactSimulation();
    reachFirstActiveFrame(simulation);
    const state = simulation.getState();
    expect(state.fighters[1].health).toBe(88);
    expect(state.fighters[1].mode).toBe("hitstun");
    expect(state.fighters[0].hitstop).toBe(6);
    expect(state.fighters[1].hitstop).toBe(8);
    expect(state.fighters[1].vx).toBeGreaterThan(0);

    for (let frame = 0; frame < 60; frame++) simulation.step([0, 0]);
    expect(state.fighters[1].health).toBe(88);
    expect(state.fighters[1].mode).toBe("idle");
    expect(state.fighters[0].mode).toBe("idle");
  });

  it("reports invulnerability without applying damage", () => {
    const simulation = contactSimulation();
    simulation.setDummyInvulnerable(true);
    reachFirstActiveFrame(simulation);
    expect(simulation.getState().fighters[1].health).toBe(100);
    expect(simulation.getState().fighters[1].mode).toBe("idle");
  });

  it("resets every disposable combat field", () => {
    const simulation = contactSimulation();
    reachFirstActiveFrame(simulation);
    simulation.setDummyInvulnerable(true);
    const reset = simulation.reset();
    expect(reset.tick).toBe(0);
    expect(reset.fighters[0]).toMatchObject({ health: 100, mode: "idle", moveFrame: 0, hitstop: 0 });
    expect(reset.fighters[1]).toMatchObject({ health: 100, mode: "idle", stun: 0, invulnerable: false });
  });
});
