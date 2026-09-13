import { activeMove, attackPhase } from "../kernel/state/machine.ts";
import { toPixels } from "../kernel/constants.ts";
import type { CombatEvent, FighterDefinition, SimulationState } from "../kernel/types.ts";
import type { AnimationSnapshot } from "../render/arena.ts";

const row = (label: string, value: string | number): string => `<div><dt>${label}</dt><dd>${value}</dd></div>`;

function fighterRows(label: string, fighter: SimulationState["fighters"][number], definition: FighterDefinition): string {
  const move = activeMove(fighter, definition);
  return [
    `<h3>${label}</h3>`, row("state", fighter.mode), row("move", fighter.mode === "attack" ? move.name : "—"),
    row("phase", attackPhase(fighter, move) ?? "—"), row("state frame", fighter.stateFrame),
    row("move frame", fighter.mode === "attack" ? fighter.moveFrame : "—"), row("position", `${toPixels(fighter.x).toFixed(2)} px`),
    row("height", `${toPixels(fighter.y).toFixed(2)} px`), row("facing", fighter.facing === 1 ? "right (+1)" : "left (−1)"),
    row("health", fighter.health), row("hitstop", fighter.hitstop), row("stun", fighter.stun),
  ].join("");
}

export function renderSimulationPanel(root: HTMLElement, state: SimulationState, definitions: readonly FighterDefinition[]): void {
  root.innerHTML = `<dl>${fighterRows("PLAYER", state.fighters[0], definitions[0])}${fighterRows("DUMMY", state.fighters[1], definitions[1])}</dl>`;
}

export function renderAnimationPanel(root: HTMLElement, animations: readonly AnimationSnapshot[]): void {
  root.innerHTML = `<dl>${animations.map((animation, index) => [
    `<h3>${index === 0 ? "PLAYER" : "DUMMY"}</h3>`, row("clip", animation.clip),
    row("clip frame", `${animation.frame} / ${animation.duration}`), row("playback", animation.loop ? "loop" : "one-shot"),
    row("easing", animation.easing),
  ].join("")).join("")}</dl>`;
}

export function renderEvents(root: HTMLOListElement, events: readonly CombatEvent[]): void {
  root.replaceChildren();
  if (events.length === 0) {
    const empty = document.createElement("li"); empty.className = "empty"; empty.textContent = "Waiting for input."; root.appendChild(empty); return;
  }
  for (const event of events.slice(0, 14)) {
    const item = document.createElement("li");
    const frame = document.createElement("span"); frame.textContent = String(event.frame).padStart(4, "0");
    const copy = document.createElement("p"); const kind = document.createElement("strong"); kind.textContent = event.kind;
    copy.appendChild(kind); copy.appendChild(document.createTextNode(event.detail)); item.appendChild(frame); item.appendChild(copy); root.appendChild(item);
  }
}
