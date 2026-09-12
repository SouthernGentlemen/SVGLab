import "./styles.css";
import "./preview.css";
import { CLIPS } from "../animation/clips";
import type { ClipName } from "../animation/clips";
import {
  WEAPONS,
  defaultPreviewClip,
  previewClipNames,
  previewClipOptions,
  previewMovesetName,
} from "../animation/movesets";
import type { WeaponId } from "../animation/movesets";
import { advancePreviewFrame, previewLastFrame } from "../animation/preview-playback";
import { sampleClip } from "../animation/sample";
import type { AnimationClip } from "../animation/types";
import { SKINS } from "../svg/characters";
import type { CharacterSkin } from "../svg/characters";
import { appendAll, applyPose, buildFighterNode, placeFighter } from "../svg/rig";
import type { FighterNode } from "../svg/rig";
import { SWORDS, applySwordConstraint, equipSword, swordName } from "../svg/weapons";
import type { SwordId } from "../svg/weapons";

const SVG_NS = "http://www.w3.org/2000/svg";
const FRAME_MS = 1000 / 60;
const AUTHORED_SWORD_CLIPS = new Set<ClipName>([
  "bnrSwordGuardNormal",
  "bnrSwordSlashNormal",
  "bnrSwordCutNormal",
  "bnrSlashStudyNormal",
]);

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
const weaponSelect = requiredSelect("#weapon");
const swordSelect = requiredSelect("#sword");
const clipSelect = requiredSelect("#clip");
const compareToggle = required<HTMLInputElement>("#compare");
const facingToggle = required<HTMLInputElement>("#face-left");
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

const facing = () => facingToggle.checked ? -1 : 1;

function currentWeapon(): WeaponId {
  return WEAPONS.some((entry) => entry.id === weaponSelect.value) ? weaponSelect.value as WeaponId : "unarmed";
}

function currentWeaponName(): string {
  return WEAPONS.find((entry) => entry.id === currentWeapon())?.name ?? WEAPONS[0].name;
}

function currentSword(): SwordId {
  return SWORDS.some((entry) => entry.id === swordSelect.value) ? swordSelect.value as SwordId : SWORDS[0].id;
}

function equippedSword(): SwordId | null {
  return currentWeapon() === "sword" ? currentSword() : null;
}

function equipmentLabel(): string {
  return currentWeapon() === "sword" ? `${currentWeaponName()} · ${swordName(currentSword())}` : currentWeaponName();
}

function availableClipNames(): ClipName[] {
  return previewClipNames(currentWeapon());
}

function refreshClipOptions(preferred?: ClipName): void {
  const weapon = currentWeapon();
  const options = previewClipOptions(weapon);
  const names = options.map((entry) => entry.clip);
  const selected = preferred ?? (names.includes(clipSelect.value as ClipName)
    ? clipSelect.value as ClipName
    : defaultPreviewClip(weapon));

  clipSelect.replaceChildren(...options.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.clip;
    option.textContent = `${entry.group} / ${entry.slot} — ${entry.clip}`;
    return option;
  }));
  clipSelect.value = names.includes(selected) ? selected : defaultPreviewClip(weapon);
}

function refreshSwordAvailability(): void {
  const armed = currentWeapon() === "sword";
  swordSelect.disabled = !armed;
  swordSelect.title = armed ? "Cycle the equipped sword model" : "Equip Sword to choose a sword model";
}

function applyEquipment(): void {
  const sword = equippedSword();
  equipSword(singleNode, sword);
  for (const entry of gallery) equipSword(entry.node, sword);
}

function foregroundSwordArms(node: FighterNode, clip: ClipName): void {
  if (currentWeapon() !== "sword" || AUTHORED_SWORD_CLIPS.has(clip)) return;
  const torso = node.bones.get("torso");
  const head = node.bones.get("head");
  const front = node.bones.get("arm-front");
  const back = node.bones.get("arm-back");
  if (!torso || !head || !front || !back) throw new Error("Fighter model is missing sword layering bones");

  // Generic locomotion normally sends one arm behind the body. A two-handed weapon cannot
  // allow that reparenting: both constrained arms stay in torso space and the face paints last.
  if (facing() === 1) appendAll(torso, front, back, head);
  else appendAll(torso, back, front, head);
}

function placePreviewFighters(torsoRotation: number): void {
  const clip = currentClipName();
  placeFighter(singleNode, 180, 260, 2.2, facing(), clip);
  foregroundSwordArms(singleNode, clip);
  applySwordConstraint(singleNode, clip, frame, torsoRotation);
  for (const entry of gallery) {
    placeFighter(entry.node, 120, 224, 1.55, facing(), clip);
    foregroundSwordArms(entry.node, clip);
    applySwordConstraint(entry.node, clip, frame, torsoRotation);
  }
}

function populateSelects(): void {
  skinSelect.replaceChildren(...SKINS.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    return option;
  }));

  weaponSelect.replaceChildren(...WEAPONS.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    return option;
  }));

  swordSelect.replaceChildren(...SWORDS.map((entry) => {
    const option = document.createElement("option");
    option.value = entry.id;
    option.textContent = entry.name;
    return option;
  }));

  refreshSwordAvailability();
  refreshClipOptions();
}

function currentSkin(): CharacterSkin {
  return SKINS.find((entry) => entry.id === skinSelect.value) ?? SKINS[0];
}

function currentClipName(): ClipName {
  const available = availableClipNames();
  return available.includes(clipSelect.value as ClipName) ? clipSelect.value as ClipName : defaultPreviewClip(currentWeapon());
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
    equipSword(node, equippedSword());
    placeFighter(node, 120, 224, 1.55, facing(), currentClipName());
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
  equipSword(singleNode, equippedSword());
  placeFighter(singleNode, 180, 260, 2.2, facing(), currentClipName());
  singleLayer.replaceChildren(singleNode.root);
  stageTitle.textContent = `${entry.name} · ${equipmentLabel()}`;
}

function rebuildPreviewRigs(): void {
  buildGallery();
  rebuildSingle();
}

function setRigOverlay(show: boolean): void {
  singleSvg.classList.toggle("show-rig", show);
  for (const entry of gallery) entry.svg.classList.toggle("show-rig", show);
}

function setCompare(compare: boolean): void {
  singleView.hidden = compare;
  compareView.hidden = !compare;
  stageTitle.textContent = compare
    ? `Compare all ${SKINS.length} skins · ${equipmentLabel()}`
    : `${currentSkin().name} · ${equipmentLabel()}`;
}

function resetPlayback(): void {
  frame = 0;
  playing = true;
  accumulator = 0;
  lastTime = performance.now();
}

function setClipByOffset(offset: number): void {
  const names = availableClipNames();
  const currentIndex = Math.max(0, names.indexOf(currentClipName()));
  const nextIndex = (currentIndex + offset + names.length) % names.length;
  clipSelect.value = names[nextIndex];
  resetPlayback();
  render();
}

function setWeaponByOffset(offset: number): void {
  const currentIndex = Math.max(0, WEAPONS.findIndex((entry) => entry.id === currentWeapon()));
  const nextIndex = (currentIndex + offset + WEAPONS.length) % WEAPONS.length;
  weaponSelect.value = WEAPONS[nextIndex].id;
  refreshSwordAvailability();
  refreshClipOptions();
  rebuildPreviewRigs();
  resetPlayback();
  render();
}

function setSwordByOffset(offset: number): void {
  if (currentWeapon() !== "sword") return;
  const currentIndex = Math.max(0, SWORDS.findIndex((entry) => entry.id === currentSword()));
  const nextIndex = (currentIndex + offset + SWORDS.length) % SWORDS.length;
  swordSelect.value = SWORDS[nextIndex].id;
  applyEquipment();
  render();
}

function replay(): void {
  resetPlayback();
  render();
}

function togglePlayback(): void {
  playing = !playing;
  accumulator = 0;
  lastTime = performance.now();
  render();
}

function advanceOneFrame(): void {
  frame = advancePreviewFrame(currentClip(), frame);
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
  required<HTMLElement>("#weapon-name").textContent = currentWeaponName();
  required<HTMLElement>("#sword-name").textContent = equippedSword() ? swordName(currentSword()) : "—";
  required<HTMLElement>("#moveset-name").textContent = previewMovesetName(currentWeapon());
  required<HTMLElement>("#clip-frame").textContent = String(frame);
  required<HTMLElement>("#clip-duration").textContent = String(clip.duration);
  required<HTMLElement>("#clip-loop").textContent = clip.loop ? "yes" : "no";
  required<HTMLElement>("#preview-repeat").textContent = "yes";
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

  placePreviewFighters(pose.torso?.rotation ?? 0);

  const lastFrame = previewLastFrame(clip);
  scrub.max = String(lastFrame);
  scrub.value = String(Math.min(frame, lastFrame));
  frameOutput.value = `${frame} / ${lastFrame}`;

  playPauseButton.firstChild!.textContent = playing ? "Pause " : "Resume ";
  playbackState.textContent = playing ? "playing" : "paused";
  playbackState.classList.toggle("is-paused", !playing);
  replayButton.classList.remove("replay-ready");

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
weaponSelect.addEventListener("change", () => {
  refreshSwordAvailability();
  refreshClipOptions();
  rebuildPreviewRigs();
  resetPlayback();
  render();
});
swordSelect.addEventListener("change", () => {
  applyEquipment();
  render();
});
clipSelect.addEventListener("change", () => {
  resetPlayback();
  render();
});
compareToggle.addEventListener("change", render);
facingToggle.addEventListener("change", render);
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
  else if (event.code === "KeyW") setWeaponByOffset(1);
  else if (event.code === "KeyQ") setSwordByOffset(1);
  else if (event.code === "Period") stepOneFrame();
  else if (event.code === "KeyR") replay();
  else if (event.code === "KeyC") {
    compareToggle.checked = !compareToggle.checked;
    render();
  } else if (event.code === "KeyF") {
    facingToggle.checked = !facingToggle.checked;
    render();
  } else if (event.code === "KeyG") {
    rigToggle.checked = !rigToggle.checked;
    render();
  } else return;
  event.preventDefault();
});

render();
requestAnimationFrame(animationFrame);
