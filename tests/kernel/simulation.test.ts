import { describe, expect, it } from "vitest";
import { px } from "../../src/kernel/constants.ts";
import { LAB_FIGHTER } from "../../src/kernel/content.ts";
import { CombatSimulation } from "../../src/kernel/simulation.ts";
import { attackPhase } from "../../src/kernel/state/machine.ts";
import { InputBit } from "../../src/kernel/types.ts";

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
    const { pushboxOf, hurtboxesOf } = await import("../../src/kernel/collision/boxes.ts");
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
    expect(attackPhase(player, LAB_FIGHTER.moves.basic)).toBe("startup");

    for (let frame = 0; frame < 4; frame++) simulation.step([0, 0]);
    expect(player.moveFrame).toBe(4);
    expect(attackPhase(player, LAB_FIGHTER.moves.basic)).toBe("startup");
    simulation.step([0, 0]);
    expect(player.moveFrame).toBe(5);
    expect(attackPhase(player, LAB_FIGHTER.moves.basic)).toBe("active");
    simulation.step([0, 0]);
    simulation.step([0, 0]);
    simulation.step([0, 0]);
    expect(player.moveFrame).toBe(8);
    expect(attackPhase(player, LAB_FIGHTER.moves.basic)).toBe("recovery");
  });

  it("runs the sword slash on its own frame data and reach", () => {
    const simulation = new CombatSimulation({ definitions: [LAB_FIGHTER, LAB_FIGHTER], startX: [px(-100), px(100)] });
    simulation.step([InputBit.Slash, 0]);
    const player = simulation.getState().fighters[0];
    expect(player.move).toBe("sword");
    expect(attackPhase(player, LAB_FIGHTER.moves.sword)).toBe("startup");

    for (let frame = 0; frame < 13; frame++) simulation.step([0, 0]);
    expect(player.moveFrame).toBe(13);
    expect(attackPhase(player, LAB_FIGHTER.moves.sword)).toBe("startup");
    simulation.step([0, 0]);
    expect(attackPhase(player, LAB_FIGHTER.moves.sword)).toBe("active");

    for (let frame = 0; frame < 4; frame++) simulation.step([0, 0]);
    expect(attackPhase(player, LAB_FIGHTER.moves.sword)).toBe("recovery");
    for (let frame = 0; frame < 12; frame++) simulation.step([0, 0]);
    expect(player).toMatchObject({ mode: "idle", moveFrame: 0 });
  });

  it("hits harder and further with the sword than with the fist", () => {
    // One spacing past the fist's reach but inside the blade's: only frame data separates them.
    const swing = (bit: number, frames: number) => {
      const simulation = new CombatSimulation({ definitions: [LAB_FIGHTER, LAB_FIGHTER], startX: [px(-52), px(53)] });
      simulation.step([bit, 0]);
      for (let frame = 0; frame < frames; frame++) simulation.step([0, 0]);
      return simulation.getState().fighters[1];
    };
    const punched = swing(InputBit.Attack, 6);
    const cut = swing(InputBit.Slash, 15);
    expect(punched.health).toBe(100);
    expect(cut.health).toBe(82);
    expect(cut.mode).toBe("hitstun");
  });

  it("keeps the committed move running while its button is held or swapped", () => {
    const simulation = new CombatSimulation({ definitions: [LAB_FIGHTER, LAB_FIGHTER], startX: [px(-100), px(100)] });
    simulation.step([InputBit.Slash, 0]);
    const player = simulation.getState().fighters[0];
    for (let frame = 0; frame < 5; frame++) simulation.step([InputBit.Attack, 0]);
    expect(player.move).toBe("sword");
    expect(player.moveFrame).toBe(5);
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
