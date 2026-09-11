import "./styles.css";
import { TICK_MS } from "../combat/constants";
import { CombatSimulation } from "../combat/simulation";
import { attackPhase } from "../combat/state/machine";
import type { CombatEvent, FrameReport } from "../combat/types";
import { renderAnimationPanel, renderEvents, renderSimulationPanel } from "../debug/panel";
import { KeyboardInput } from "../input/keyboard";
import { ArenaRenderer } from "../svg/renderer";
import type { DebugToggles } from "../svg/renderer";

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required UI node: ${selector}`);
  return node;
}

const simulation = new CombatSimulation();
const keyboard = new KeyboardInput(window);
const renderer = new ArenaRenderer(required<SVGSVGElement>("#arena"), simulation.config.definitions);
const simulationPanel = required<HTMLElement>("#simulation-state");
const animationPanel = required<HTMLElement>("#animation-state");
const animationNote = required<HTMLElement>("#animation-note");
const eventLog = required<HTMLOListElement>("#event-log");
const pauseButton = required<HTMLButtonElement>("#pause");
const stepButton = required<HTMLButtonElement>("#step");
const dummyInvulnerable = required<HTMLInputElement>("#dummy-invulnerable");
const timelineCursor = required<HTMLElement>("#timeline-cursor");
const runState = required<HTMLElement>("#run-state");
const debugOverlay = required<HTMLElement>("#debug-overlay");
const debugToggle = required<HTMLButtonElement>("#debug-toggle");

let paused = false;
let lastTime = performance.now();
let accumulator = 0;
let latestReport: FrameReport | null = null;
let eventHistory: CombatEvent[] = [];

function toggles(): DebugToggles {
  const enabled = (name: keyof DebugToggles): boolean => required<HTMLInputElement>(`[data-toggle='${name}']`).checked;
  return {
    pushboxes: enabled("pushboxes"),
    hurtboxes: enabled("hurtboxes"),
    hitboxes: enabled("hitboxes"),
    origins: enabled("origins"),
    rig: enabled("rig"),
  };
}

function updateHealth(id: "player" | "dummy", health: number): void {
  required<HTMLElement>(`#${id}-health`).textContent = String(health);
  required<HTMLElement>(`#${id}-health-bar`).style.width = `${health}%`;
}

function setDebugOpen(open: boolean): void {
  debugOverlay.hidden = !open;
  debugToggle.setAttribute("aria-expanded", String(open));
}

function render(): void {
  const state = simulation.getState();
  const animations = renderer.render(state, latestReport, toggles());
  required<HTMLElement>("#tick").textContent = String(state.tick);
  updateHealth("player", state.fighters[0].health);
  updateHealth("dummy", state.fighters[1].health);
  required<HTMLElement>("#player-state").textContent = state.fighters[0].mode;
  required<HTMLElement>("#dummy-state").textContent = state.fighters[1].mode;
  renderSimulationPanel(simulationPanel, state, simulation.config.definitions);
  renderAnimationPanel(animationPanel, animations);
  renderEvents(eventLog, eventHistory);
  animationNote.textContent = animations[0].note;

  const player = state.fighters[0];
  const phase = attackPhase(player, simulation.config.definitions[0].move);
  required<HTMLElement>("#phase").textContent = phase ?? "neutral";
  required<HTMLElement>("#move-frame").textContent = phase ? String(player.moveFrame) : "—";
  timelineCursor.hidden = phase === null;
  if (phase) timelineCursor.style.left = `${((player.moveFrame + 0.5) / simulation.config.definitions[0].move.duration) * 100}%`;
}

function step(): void {
  latestReport = simulation.step([keyboard.sample(), 0]);
  if (latestReport.events.length > 0) eventHistory = [...latestReport.events].reverse().concat(eventHistory).slice(0, 14);
  render();
}

function setPaused(next: boolean): void {
  paused = next;
  pauseButton.firstChild!.textContent = paused ? "Resume " : "Pause ";
  stepButton.disabled = !paused;
  runState.textContent = paused ? "paused" : "running";
  runState.classList.toggle("is-paused", paused);
  accumulator = 0;
  lastTime = performance.now();
}

function reset(): void {
  simulation.reset();
  simulation.setDummyInvulnerable(dummyInvulnerable.checked);
  eventHistory = [];
  latestReport = null;
  accumulator = 0;
  render();
}

function frame(now: number): void {
  const elapsed = Math.min(250, now - lastTime);
  lastTime = now;
  if (!paused) {
    accumulator += elapsed;
    while (accumulator >= TICK_MS) {
      step();
      accumulator -= TICK_MS;
    }
  }
  requestAnimationFrame(frame);
}

required<HTMLButtonElement>("#attack").addEventListener("click", () => keyboard.pulseAttack());
pauseButton.addEventListener("click", () => setPaused(!paused));
stepButton.addEventListener("click", () => {
  if (paused) step();
});
required<HTMLButtonElement>("#reset").addEventListener("click", reset);
debugToggle.addEventListener("click", () => setDebugOpen(debugOverlay.hidden));
required<HTMLButtonElement>("#debug-close").addEventListener("click", () => setDebugOpen(false));
dummyInvulnerable.addEventListener("change", () => {
  simulation.setDummyInvulnerable(dummyInvulnerable.checked);
  render();
});
for (const toggle of document.querySelectorAll<HTMLInputElement>("[data-toggle]")) toggle.addEventListener("change", render);

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyP") {
    setPaused(!paused);
    event.preventDefault();
  } else if (event.code === "Period" && paused) {
    step();
    event.preventDefault();
  } else if (event.code === "KeyR") {
    reset();
    event.preventDefault();
  } else if (event.code === "Backquote") {
    setDebugOpen(debugOverlay.hidden);
    event.preventDefault();
  }
});

render();
requestAnimationFrame(frame);

if (import.meta.hot) import.meta.hot.dispose(() => keyboard.dispose());
