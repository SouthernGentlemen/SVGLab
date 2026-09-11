import "./styles.css";
import "./preview.css";
import { CLIPS } from "../animation/clips";
import type { ClipName } from "../animation/clips";
import { sampleClip } from "../animation/sample";
import type { AnimationClip } from "../animation/types";
import { SKINS } from "../svg/characters";
import type { CharacterSkin } from "../svg/characters";
import { applyPose, buildFighterNode } from "../svg/rig";
import type { FighterNode } from "../svg/rig";

const SVG_NS = "http://www.w3.org/2000/svg";
const FRAME_MS = 1000 / 60;
const CLIP_NAMES = Object.keys(CLIPS) as ClipName[];

function required<T extends Element>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required UI node: ${selector}`);
  return node;
}

// See main.ts: Cloudflare's Element type collides with HTMLSelectElement's remove overload.
function requiredSelect(selector: string): HTMLSelectElement {
  const node = document.querySelector(selector);
  if (!(node instanceof HTMLSelectElement)) throw new Error(`Missing required <select>: ${selector}`);
  return node;
}

interface GalleryRig {
  skin: CharacterSkin;
  node: FighterNode;
  svg: SVGSVGElement;
  facts: HTMLElement;
}

const skinSelect = requiredSelect("#skin");
const clipSelect = requiredSelect("#clip");
const compareToggle = required<HTMLInputElement>("#compare");
const rigToggle = required<HTMLInputElement>("#show-rig");
const previousButton = required<HTMLButtonElement>("#previous-clip");
const playPauseButton = required<HTMLButtonElement>("#play-pause");
const nextButton = required<HTMLButtonElement>("#next-clip");
const stepButton = required<HTMLButtonElement>("#step-frame");
const replayButton = required<HTMLButtonElement>("#replay");
const scrub = required<HTMLInputElement>("#frame-scrub");
const frameOutput = required<HTMLOutputElement>("#frame-output");
const singleView = required<HTMLElement>("#single-view");
const compareView = required<HTMLElement>("#compare-view");
const singleSvg = required<SVGSVGElement>("#single-svg");
const singleLayer = required<SVGGElement>("#single-rig");
const stageTitle = required<HTMLElement>("#stage-title");
const playbackState = required<HTMLElement>("#playback-state");

let frame = 0;
let playing = true;
let accumulator = 0;
let lastTime = performance.now();
let singleNode: FighterNode;
const gallery: GalleryRig[] = [];

function populateSelects(): void {
  skinSelect.replaceChildren(...SKINS.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    return option;
  }));

  clipSelect.replaceChildren(...CLIP_NAMES.map((name) => {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    return option;
  }));
}

function currentSkin(): CharacterSkin {
  return SKINS.find((entry) => entry.id === skinSelect.value) ?? SKINS[0];
}

function currentClipName(): ClipName {
  return CLIP_NAMES.includes(clipSelect.value as ClipName) ? clipSelect.value as ClipName : CLIP_NAMES[0];
}

function currentClip(): AnimationClip {
  return CLIPS[currentClipName()];
}

function referencedBones(clip: AnimationClip): Set<string> {
  const bones = new Set<string>();
  for (const keyframe of clip.keyframes) {
    for (const name of Object.keys(keyframe.bones)) bones.add(name);
  }
  return bones;
}

function missingBones(node: FighterNode, clip: AnimationClip): string[] {
  return [...referencedBones(clip)].filter((name) => !node.bones.has(name)).sort();
}

function rigFacts(node: FighterNode, clip: AnimationClip): string {
  const missing = missingBones(node, clip);
  return `${node.bones.size} bones · ${missing.length === 0 ? "clip complete" : `missing ${missing.join(", ")}`}`;
}

function makeFloor(width: number, y: number): SVGPathElement {
  const floor = document.createElementNS(SVG_NS, "path");
  floor.setAttribute("class", "preview-floor");
  floor.setAttribute("d", `M24 ${y}H${width - 24}`);
  return floor;
}

function buildGallery(): void {
  gallery.length = 0;
  compareView.replaceChildren(...SKINS.map((entry) => {
    const card = document.createElement("article");
    card.className = "compare-card";

    const header = document.createElement("header");
    const name = document.createElement("strong");
    name.textContent = entry.name;
    const facts = document.createElement("span");
    header.appendChild(name);
    header.appendChild(facts);

    const svg = document.createElementNS(SVG_NS, "svg");
    svg.setAttribute("viewBox", "0 0 240 270");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${entry.name} animation comparison`);
    svg.appendChild(makeFloor(240, 226));

    const node = buildFighterNode("player", entry.model);
    node.root.setAttribute("transform", "translate(120 224) scale(1.55)");
    svg.appendChild(node.root);
    card.appendChild(header);
    card.appendChild(svg);
    gallery.push({ skin: entry, node, svg, facts });
    return card;
  }));
}

function rebuildSingle(): void {
  const entry = currentSkin();
  singleNode = buildFighterNode("player", entry.model);
  singleNode.root.setAttribute("transform", "translate(180 260) scale(2.2)");
  singleLayer.replaceChildren(singleNode.root);
  stageTitle.textContent = entry.name;
}

function setRigOverlay(show: boolean): void {
  singleSvg.classList.toggle("show-rig", show);
  for (const entry of gallery) entry.svg.classList.toggle("show-rig", show);
}

function setCompare(compare: boolean): void {
  singleView.hidden = compare;
  compareView.hidden = !compare;
  stageTitle.textContent = compare ? `Compare all ${SKINS.length} skins` : currentSkin().name;
}

function setClipByOffset(offset: number): void {
  const currentIndex = Math.max(0, CLIP_NAMES.indexOf(currentClipName()));
  const nextIndex = (currentIndex + offset + CLIP_NAMES.length) % CLIP_NAMES.length;
  clipSelect.value = CLIP_NAMES[nextIndex];
  frame = 0;
  playing = true;
  accumulator = 0;
  lastTime = performance.now();
  render();
}

function replay(): void {
  frame = 0;
  playing = true;
  accumulator = 0;
  lastTime = performance.now();
  render();
}

function togglePlayback(): void {
  const clip = currentClip();
  if (!clip.loop && frame >= clip.duration && !playing) frame = 0;
  playing = !playing;
  accumulator = 0;
  lastTime = performance.now();
  render();
}

function advanceOneFrame(): void {
  const clip = currentClip();
  if (clip.loop) {
    frame = frame + 1 >= clip.duration ? 0 : frame + 1;
  } else if (frame < clip.duration) {
    frame += 1;
    if (frame >= clip.duration) playing = false;
  } else {
    playing = false;
  }
}

function stepOneFrame(): void {
  playing = false;
  advanceOneFrame();
  render();
}

function renderFacts(clip: AnimationClip): void {
  const skin = currentSkin();
  const missing = missingBones(singleNode, clip);
  required<HTMLElement>("#clip-name").textContent = clip.name;
  required<HTMLElement>("#clip-frame").textContent = String(frame);
  required<HTMLElement>("#clip-duration").textContent = String(clip.duration);
  required<HTMLElement>("#clip-loop").textContent = clip.loop ? "yes" : "no";
  required<HTMLElement>("#clip-easing").textContent = clip.easing;
  required<HTMLElement>("#clip-note").textContent = clip.note;
  required<HTMLElement>("#rig-name").textContent = skin.name;
  required<HTMLElement>("#bone-count").textContent = String(singleNode.bones.size);
  required<HTMLElement>("#missing-count").textContent = String(missing.length);
  const missingCopy = required<HTMLElement>("#missing-bones");
  missingCopy.textContent = missing.length === 0 ? "All referenced bones are present." : `Missing: ${missing.join(", ")}`;
  missingCopy.classList.toggle("has-warning", missing.length > 0);
}

function render(): void {
  const clip = currentClip();
  const pose = sampleClip(clip, frame);
  applyPose(singleNode, pose);
  for (const entry of gallery) {
    applyPose(entry.node, pose);
    entry.facts.textContent = rigFacts(entry.node, clip);
    entry.facts.classList.toggle("has-warning", missingBones(entry.node, clip).length > 0);
  }

  scrub.max = String(clip.duration);
  scrub.value = String(Math.min(frame, clip.duration));
  frameOutput.value = `${frame} / ${clip.duration}`;

  const held = !clip.loop && frame >= clip.duration && !playing;
  playPauseButton.firstChild!.textContent = playing ? "Pause " : held ? "Play again " : "Play ";
  playbackState.textContent = held ? "held on last frame" : playing ? "playing" : "paused";
  playbackState.classList.toggle("is-paused", !playing);
  replayButton.classList.toggle("replay-ready", held);

  renderFacts(clip);
  setRigOverlay(rigToggle.checked);
  setCompare(compareToggle.checked);
}

function animationFrame(now: number): void {
  const elapsed = Math.min(250, now - lastTime);
  lastTime = now;
  if (playing) {
    accumulator += elapsed;
    let changed = false;
    while (accumulator >= FRAME_MS && playing) {
      advanceOneFrame();
      accumulator -= FRAME_MS;
      changed = true;
    }
    if (changed) render();
  }
  requestAnimationFrame(animationFrame);
}

populateSelects();
buildGallery();
rebuildSingle();

skinSelect.addEventListener("change", () => {
  rebuildSingle();
  render();
});
clipSelect.addEventListener("change", () => {
  frame = 0;
  playing = true;
  accumulator = 0;
  lastTime = performance.now();
  render();
});
compareToggle.addEventListener("change", render);
rigToggle.addEventListener("change", render);
previousButton.addEventListener("click", () => setClipByOffset(-1));
nextButton.addEventListener("click", () => setClipByOffset(1));
playPauseButton.addEventListener("click", togglePlayback);
stepButton.addEventListener("click", stepOneFrame);
replayButton.addEventListener("click", replay);
scrub.addEventListener("input", () => {
  frame = Number(scrub.value);
  playing = false;
  accumulator = 0;
  render();
});

window.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) return;

  if (event.code === "Space") togglePlayback();
  else if (event.code === "BracketLeft") setClipByOffset(-1);
  else if (event.code === "BracketRight") setClipByOffset(1);
  else if (event.code === "Period") stepOneFrame();
  else if (event.code === "KeyR") replay();
  else if (event.code === "KeyC") {
    compareToggle.checked = !compareToggle.checked;
    render();
  } else if (event.code === "KeyG") {
    rigToggle.checked = !rigToggle.checked;
    render();
  } else return;
  event.preventDefault();
});

render();
requestAnimationFrame(animationFrame);
