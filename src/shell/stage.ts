import "./styles.css";
import "../render/skeleton-overlay.css";
import { TICK_MS } from "../kernel/constants.ts";
import { CombatSimulation } from "../kernel/simulation.ts";
import { activeMove, attackPhase } from "../kernel/state/machine.ts";
import type { CombatEvent, FrameReport, MoveDefinition } from "../kernel/types.ts";
import { fetchRuntimeCatalog, watchRuntimeCatalog } from "../clips/runtime.ts";
import type { RuntimeCatalog } from "../clips/runtime.ts";
import { loadFigureIndex } from "../render/assemble.ts";
import { ArenaRenderer } from "../render/arena.ts";
import type { DebugToggles } from "../render/arena.ts";
import { renderAnimationPanel, renderEvents, renderSimulationPanel } from "./debug-panel.ts";
import { KeyboardInput } from "./keyboard.ts";

function required<T>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`missing required UI node: ${selector}`);
  return node as T;
}

const [catalogInitial, figures] = await Promise.all([fetchRuntimeCatalog(), loadFigureIndex()]);
let catalog: RuntimeCatalog = catalogInitial;
const simulation = new CombatSimulation();
const keyboard = new KeyboardInput(window);
const renderer = await ArenaRenderer.create(required<SVGSVGElement>("#arena"), simulation.config.definitions);
const simulationPanel = required<HTMLElement>("#simulation-state");
const animationPanel = required<HTMLElement>("#animation-state");
const animationNote = required<HTMLElement>("#animation-note");
const eventLog = required<HTMLOListElement>("#event-log");
const pauseButton = required<HTMLButtonElement>("#pause");
const stepButton = required<HTMLButtonElement>("#step");
const dummyInvulnerable = required<HTMLInputElement>("#dummy-invulnerable");
const timelineCursor = required<HTMLElement>("#timeline-cursor");
const timelineTrack = required<HTMLElement>("#timeline-track");
const timelineMove = required<HTMLElement>("#timeline-move");
const timelineLast = required<HTMLElement>("#timeline-last");
const runState = required<HTMLElement>("#run-state");
const debugOverlay = required<HTMLElement>("#debug-overlay");
const playerFigure = required<HTMLSelectElement>("#player-skin");
const dummyFigure = required<HTMLSelectElement>("#dummy-skin");

let paused = false;
let lastTime = performance.now();
let accumulator = 0;
let latestReport: FrameReport | null = null;
let eventHistory: CombatEvent[] = [];

function toggles(): DebugToggles {
  const enabled = (name: keyof DebugToggles): boolean => required<HTMLInputElement>(`[data-toggle='${name}']`).checked;
  return { pushboxes: enabled("pushboxes"), hurtboxes: enabled("hurtboxes"), hitboxes: enabled("hitboxes"),
    origins: enabled("origins"), rig: enabled("rig"), skeleton: enabled("skeleton") };
}

function updateHealth(id: "player" | "dummy", health: number): void {
  required<HTMLElement>(`#${id}-health`).textContent = String(health);
  required<HTMLElement>(`#${id}-health-bar`).style.width = `${health}%`;
}

function drawTimeline(move: MoveDefinition): void {
  if (timelineMove.textContent === move.name.toLowerCase()) return;
  timelineMove.textContent = move.name.toLowerCase(); timelineLast.textContent = String(move.duration - 1);
  const segments = ([ ["startup", move.startup], ["active", move.active], ["recovery", move.recovery] ] as const).map(([phase, span]) => {
    const segment = document.createElement("span"); segment.className = phase; segment.style.setProperty("--span", String(span));
    const label = document.createElement("i"); label.textContent = `${phase} ${span}`; segment.appendChild(label); return segment;
  });
  timelineTrack.replaceChildren(...segments, timelineCursor);
}

function render(): void {
  const state = simulation.getState();
  const animations = renderer.render(state, latestReport, toggles(), catalog);
  required<HTMLElement>("#tick").textContent = String(state.tick);
  updateHealth("player", state.fighters[0].health); updateHealth("dummy", state.fighters[1].health);
  required<HTMLElement>("#player-state").textContent = state.fighters[0].mode;
  required<HTMLElement>("#dummy-state").textContent = state.fighters[1].mode;
  renderSimulationPanel(simulationPanel, state, simulation.config.definitions); renderAnimationPanel(animationPanel, animations);
  renderEvents(eventLog, eventHistory); animationNote.textContent = animations[0].note;
  const player = state.fighters[0]; const move = activeMove(player, simulation.config.definitions[0]); const phase = attackPhase(player, move);
  drawTimeline(move); required<HTMLElement>("#phase").textContent = phase ?? "neutral";
  required<HTMLElement>("#move-frame").textContent = phase ? String(player.moveFrame) : "—"; timelineCursor.hidden = phase === null;
  if (phase) timelineCursor.style.left = `${((player.moveFrame + 0.5) / move.duration) * 100}%`;
}

function step(): void {
  latestReport = simulation.step([keyboard.sample(), 0]);
  if (latestReport.events.length) eventHistory = [...latestReport.events].reverse().concat(eventHistory).slice(0, 14);
  render();
}

function setPaused(next: boolean): void {
  paused = next; pauseButton.firstChild!.textContent = paused ? "Resume " : "Pause "; stepButton.disabled = !paused;
  runState.textContent = paused ? "paused" : "running"; runState.classList.toggle("is-paused", paused);
  accumulator = 0; lastTime = performance.now();
}

function reset(): void { simulation.reset(); simulation.setDummyInvulnerable(dummyInvulnerable.checked); eventHistory = []; latestReport = null; accumulator = 0; render(); }

function frame(now: number): void {
  const elapsed = Math.min(250, now - lastTime); lastTime = now;
  if (!paused) { accumulator += elapsed; while (accumulator >= TICK_MS) { step(); accumulator -= TICK_MS; } }
  requestAnimationFrame(frame);
}

for (const select of [playerFigure, dummyFigure]) {
  select.replaceChildren(...figures.figures.map((entry) => {
    const option = document.createElement("option"); option.value = entry.id; option.textContent = entry.name; return option;
  }));
}
playerFigure.value = "fighter"; dummyFigure.value = "barst";
const swapFigures = async (): Promise<void> => { await renderer.setFigures([playerFigure.value, dummyFigure.value]); render(); };
playerFigure.addEventListener("change", () => void swapFigures()); dummyFigure.addEventListener("change", () => void swapFigures());
required<HTMLButtonElement>("#attack").addEventListener("click", () => keyboard.pulseAttack());
required<HTMLButtonElement>("#slash").addEventListener("click", () => keyboard.pulseSlash());
pauseButton.addEventListener("click", () => setPaused(!paused)); stepButton.addEventListener("click", () => { if (paused) step(); });
required<HTMLButtonElement>("#reset").addEventListener("click", reset);
required<HTMLButtonElement>("#debug-toggle").addEventListener("click", () => { debugOverlay.hidden = !debugOverlay.hidden; });
required<HTMLButtonElement>("#debug-close").addEventListener("click", () => { debugOverlay.hidden = true; });
dummyInvulnerable.addEventListener("change", () => { simulation.setDummyInvulnerable(dummyInvulnerable.checked); render(); });
for (const toggle of document.querySelectorAll<HTMLInputElement>("[data-toggle]")) toggle.addEventListener("change", render);
window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code === "KeyP") setPaused(!paused); else if (event.code === "Period" && paused) step();
  else if (event.code === "KeyR") reset(); else if (event.code === "Backquote") debugOverlay.hidden = !debugOverlay.hidden; else return;
  event.preventDefault();
});
watchRuntimeCatalog((next) => { catalog = next; required<HTMLElement>("#dev-status").textContent = "catalog updated"; render(); },
  (message) => { required<HTMLElement>("#dev-status").textContent = message; });
render(); requestAnimationFrame(frame);
if (import.meta.hot) import.meta.hot.dispose(() => keyboard.dispose());
