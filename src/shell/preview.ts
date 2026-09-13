import "./styles.css";
import "./preview.css";
import "../render/skeleton-overlay.css";
import { sampleClip } from "../rig/sample.ts";
import { advancePreviewFrame, previewLastFrame } from "../clips/playback.ts";
import { fetchRuntimeCatalog, watchRuntimeCatalog } from "../clips/runtime.ts";
import type { RuntimeCatalog } from "../clips/runtime.ts";
import { assembleFigure, loadFigureIndex } from "../render/assemble.ts";
import type { FigureIndex, FigureNode } from "../render/assemble.ts";
import { applyPose, depthProfileFor, placeFigure } from "../render/place.ts";
import { nextPartLabelMode, updateSkeletonOverlay } from "../render/skeleton-overlay.ts";
import type { PartLabelMode } from "../render/skeleton-overlay.ts";
import { keybindAction, renderKeybindHelp } from "./keybinds.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const FRAME_MS = 1000 / 60;

function required<T>(selector: string): T {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`missing required UI node: ${selector}`);
  return node as T;
}

interface GalleryEntry { readonly id: string; readonly node: FigureNode; readonly svg: SVGSVGElement; readonly facts: HTMLElement }

let [catalog, figureIndex]: [RuntimeCatalog, FigureIndex] = await Promise.all([fetchRuntimeCatalog(), loadFigureIndex()]);

const figureSelect = required<HTMLSelectElement>("#figure");
const clipSelect = required<HTMLSelectElement>("#clip");
const compareToggle = required<HTMLInputElement>("#compare");
const facingToggle = required<HTMLInputElement>("#face-left");
const rigToggle = required<HTMLInputElement>("#show-rig");
const skeletonToggle = required<HTMLInputElement>("#show-skeleton");
const scrub = required<HTMLInputElement>("#frame-scrub");
const singleView = required<HTMLElement>("#single-view");
const compareView = required<HTMLElement>("#compare-view");
const singleSvg = required<SVGSVGElement>("#single-svg");
const singleLayer = required<SVGGElement>("#single-rig");
const playPause = required<HTMLButtonElement>("#play-pause");
let singleNode: FigureNode;
let gallery: GalleryEntry[] = [];
let frame = 0;
let playing = true;
let accumulator = 0;
let lastTime = performance.now();
let labelMode: PartLabelMode = "off";

renderKeybindHelp(required<HTMLElement>("#keybind-list"), "preview");

const facing = (): -1 | 1 => facingToggle.checked ? -1 : 1;
const currentClip = () => catalog.clips[clipSelect.value] ?? Object.values(catalog.clips)[0];

function option(value: string, label: string): HTMLOptionElement {
  const node = document.createElement("option"); node.value = value; node.textContent = label; return node;
}

function populateFigureOptions(): void {
  figureSelect.replaceChildren(...figureIndex.figures.map((entry) => option(entry.id, entry.name)));
  figureSelect.value = figureIndex.figures.some((entry) => entry.id === "fighter") ? "fighter" : figureIndex.figures[0].id;
}

function populateClipOptions(preferred?: string): void {
  const names = Object.keys(catalog.clips).sort((a, b) => {
    const lane = { shipped: 0, authored: 1, study: 2 };
    return lane[catalog.lanes[a]] - lane[catalog.lanes[b]] || a.localeCompare(b);
  });
  clipSelect.replaceChildren(...names.map((name) => option(name, `${catalog.lanes[name]} — ${name}`)));
  clipSelect.value = preferred && names.includes(preferred) ? preferred : names.includes("bnrIdleNormal") ? "bnrIdleNormal" : names[0];
}

function makeFloor(width: number, y: number): SVGPathElement {
  const floor = document.createElementNS(SVG_NS, "path"); floor.setAttribute("class", "preview-floor"); floor.setAttribute("d", `M24 ${y}H${width - 24}`); return floor;
}

async function buildSingle(): Promise<void> {
  singleNode = await assembleFigure(figureSelect.value);
  singleLayer.replaceChildren(singleNode.root);
}

async function buildGallery(): Promise<void> {
  gallery = await Promise.all(figureIndex.figures.map(async (entry) => {
    const card = document.createElement("article"); card.className = "compare-card";
    const header = document.createElement("header"); const name = document.createElement("strong"); name.textContent = entry.name;
    const facts = document.createElement("span"); header.appendChild(name); header.appendChild(facts);
    const svg = document.createElementNS(SVG_NS, "svg"); svg.setAttribute("viewBox", "0 0 240 270");
    svg.setAttribute("role", "img"); svg.setAttribute("aria-label", `${entry.name} animation comparison`); svg.appendChild(makeFloor(240, 226));
    const node = await assembleFigure(entry.path); svg.appendChild(node.root); card.appendChild(header); card.appendChild(svg);
    return { id: entry.id, node, svg, facts };
  }));
  compareView.replaceChildren(...gallery.map((entry) => entry.svg.parentElement!));
}

function referencedBones(): Set<string> {
  const bones = new Set<string>(); for (const keyframe of currentClip().keyframes) for (const name of Object.keys(keyframe.bones)) bones.add(name); return bones;
}

function missingBones(node: FigureNode): string[] { return [...referencedBones()].filter((name) => !node.bones.has(name)).sort(); }

function renderFacts(): void {
  const clip = currentClip(); const missing = missingBones(singleNode);
  required<HTMLElement>("#clip-lane").textContent = catalog.lanes[clipSelect.value];
  required<HTMLElement>("#clip-loop").textContent = clip.loop ? "yes" : "no";
  const note = required<HTMLElement>("#missing-bones");
  note.hidden = missing.length === 0;
  note.textContent = missing.length ? `Missing clip bones: ${missing.join(", ")}` : "";
}

function render(): void {
  const clip = currentClip(); frame = Math.min(frame, previewLastFrame(clip)); const pose = sampleClip(clip, frame);
  applyPose(singleNode, pose); placeFigure(singleNode, 180, 260, 2.2, facing(), depthProfileFor(singleNode, clip.name, catalog.origins[clip.name] ?? clip.name));
  updateSkeletonOverlay(singleNode, skeletonToggle.checked, labelMode); singleSvg.classList.toggle("show-rig", rigToggle.checked);
  for (const entry of gallery) {
    applyPose(entry.node, pose); placeFigure(entry.node, 120, 224, 1.55, facing(), depthProfileFor(entry.node, clip.name, catalog.origins[clip.name] ?? clip.name));
    updateSkeletonOverlay(entry.node, skeletonToggle.checked, labelMode); entry.svg.classList.toggle("show-rig", rigToggle.checked);
    const missing = missingBones(entry.node); entry.facts.textContent = `${entry.node.bones.size} bones · ${missing.length ? `missing ${missing.join(", ")}` : "clip complete"}`;
    entry.facts.classList.toggle("has-warning", missing.length > 0);
  }
  singleView.hidden = compareToggle.checked; compareView.hidden = !compareToggle.checked;
  const title = compareToggle.checked ? `Compare all ${gallery.length} figures` : singleNode.manifest.name;
  required<HTMLElement>("#stage-title").textContent = `${title} · ${clip.name}`;
  const last = previewLastFrame(clip); scrub.max = String(last); scrub.value = String(frame); required<HTMLOutputElement>("#frame-output").value = `${frame} / ${last}`;
  playPause.firstChild!.textContent = playing ? "Pause " : "Resume "; const state = required<HTMLElement>("#playback-state");
  state.textContent = playing ? "playing" : "paused"; state.classList.toggle("is-paused", !playing); renderFacts();
}

function resetPlayback(): void { frame = 0; playing = true; accumulator = 0; lastTime = performance.now(); }
function setClipOffset(offset: number): void {
  const names = [...clipSelect.options].map((entry) => entry.value); const index = Math.max(0, names.indexOf(clipSelect.value));
  clipSelect.value = names[(index + offset + names.length) % names.length]; resetPlayback(); render();
}
function togglePlayback(): void { playing = !playing; accumulator = 0; lastTime = performance.now(); render(); }
function step(): void { playing = false; frame = advancePreviewFrame(currentClip(), frame); render(); }

populateFigureOptions(); populateClipOptions(); await Promise.all([buildSingle(), buildGallery()]); render();
figureSelect.addEventListener("change", () => void buildSingle().then(() => { resetPlayback(); render(); }));
clipSelect.addEventListener("change", () => { resetPlayback(); render(); });
compareToggle.addEventListener("change", render); facingToggle.addEventListener("change", render); rigToggle.addEventListener("change", render); skeletonToggle.addEventListener("change", render);
required<HTMLButtonElement>("#previous-clip").addEventListener("click", () => setClipOffset(-1));
required<HTMLButtonElement>("#next-clip").addEventListener("click", () => setClipOffset(1)); playPause.addEventListener("click", togglePlayback);
required<HTMLButtonElement>("#step-frame").addEventListener("click", step); required<HTMLButtonElement>("#replay").addEventListener("click", () => { resetPlayback(); render(); });
scrub.addEventListener("input", () => { frame = Number(scrub.value); playing = false; accumulator = 0; render(); });
window.addEventListener("keydown", (event) => {
  if (event.repeat || event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;
  const action = keybindAction("preview", event.code);
  if (action === "togglePlayback") togglePlayback();
  else if (action === "previousClip") setClipOffset(-1);
  else if (action === "nextClip") setClipOffset(1);
  else if (action === "step") step();
  else if (action === "replay") { resetPlayback(); render(); }
  else if (action === "compare") { compareToggle.checked = !compareToggle.checked; render(); }
  else if (action === "facing") { facingToggle.checked = !facingToggle.checked; render(); }
  else if (action === "pivots") { rigToggle.checked = !rigToggle.checked; render(); }
  else if (action === "skeleton") { skeletonToggle.checked = !skeletonToggle.checked; render(); }
  else if (action === "labels") { labelMode = nextPartLabelMode(labelMode); render(); }
  else return;
  event.preventDefault();
});
watchRuntimeCatalog((next) => { const selected = clipSelect.value; catalog = next; populateClipOptions(selected); required<HTMLElement>("#dev-status").textContent = "catalog updated live"; render(); },
  (message) => { required<HTMLElement>("#dev-status").textContent = message; });

function animationFrame(now: number): void {
  const elapsed = Math.min(250, now - lastTime); lastTime = now;
  if (playing) { accumulator += elapsed; let changed = false; while (accumulator >= FRAME_MS) { frame = advancePreviewFrame(currentClip(), frame); accumulator -= FRAME_MS; changed = true; } if (changed) render(); }
  requestAnimationFrame(animationFrame);
}
requestAnimationFrame(animationFrame);
