import { hiddenPartSlots } from "../render/assemble.ts";
import type { FigureIndex, FigureNode } from "../render/assemble.ts";
import type { FigureManifest } from "boneyard";
import type { Loadout } from "../render/loadout.ts";
import { cosmeticFit } from "boneyard";
import type { WardrobeIndex, WardrobeIndexPiece, WardrobeIndexSet, WardrobeSet } from "boneyard";
import { renderCharacterPicker } from "./character-picker.ts";

const KIND_ORDER = ["hat", "mask", "hair", "cloak", "pauldron", "skirt", "belt"] as const;

export interface LoadoutPanelElements {
  readonly root: HTMLElement;
  readonly characters: HTMLElement;
  readonly body: HTMLElement;
  readonly wardrobe: HTMLElement;
  readonly weapon: HTMLElement;
}

export interface LoadoutPanelLibrary {
  readonly figures: FigureIndex;
  readonly manifests: ReadonlyMap<string, FigureManifest>;
  readonly wardrobe: WardrobeIndex;
}

export interface LoadoutPanelState {
  readonly node: FigureNode;
  readonly loadout: Loadout;
  readonly selectedSlot: string | null;
  readonly busy: boolean;
}

export interface LoadoutPanelActions {
  readonly chooseFigure: (figureId: string) => void;
  readonly choosePart: (slot: string, reference: string) => void;
  readonly toggleCosmetic: (reference: string, enabled: boolean) => void;
  readonly chooseWeapon: (reference: string | null) => void;
  readonly selectSlot: (slot: string) => void;
}

function words(value: string): string {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/^./, (letter) => letter.toUpperCase());
}

function indexedSet(set: WardrobeIndexSet): WardrobeSet {
  return {
    contract: 1,
    name: set.name,
    rig: set.rig,
    islands: set.pieces.map((piece) => piece.id),
    pieces: Object.fromEntries(set.pieces.map((piece) => [piece.id, {
      kind: piece.kind,
      height: piece.height,
      fitted: piece.fitted,
      hides: piece.hides.length > 0 ? piece.hides : undefined,
    }])),
  };
}

function sourceFor(
  library: LoadoutPanelLibrary,
  slot: string,
  reference: string,
): { readonly id: string; readonly name: string } | null {
  for (const entry of library.figures.figures) {
    if (library.manifests.get(entry.id)?.parts[slot] === reference) return entry;
  }
  return null;
}

function sourceButton(
  slot: string,
  entry: FigureIndex["figures"][number],
  manifest: FigureManifest,
  selectedReference: string,
  busy: boolean,
  choosePart: LoadoutPanelActions["choosePart"],
): HTMLButtonElement {
  const reference = manifest.parts[slot];
  const button = document.createElement("button");
  button.type = "button";
  button.className = "part-source-choice";
  button.textContent = entry.name;
  button.setAttribute("aria-pressed", String(reference === selectedReference));
  button.disabled = busy;
  button.addEventListener("click", () => choosePart(slot, reference));
  return button;
}

function renderBody(
  root: HTMLElement,
  library: LoadoutPanelLibrary,
  state: LoadoutPanelState,
  actions: LoadoutPanelActions,
): void {
  const covered = hiddenPartSlots(state.node.cosmetics.values());
  const rows = state.node.rig.contract.paintOrder.map((boneName) => {
    const bone = state.node.rig.byName.get(boneName)!;
    const slot = bone.slot;
    const selected = slot === state.selectedSlot;
    const currentReference = state.loadout.parts[slot];
    const currentSource = sourceFor(library, slot, currentReference);
    const item = document.createElement("div");
    item.className = "body-slot";
    item.dataset.slot = slot;
    item.classList.toggle("is-selected", selected);
    item.classList.toggle("is-covered", covered.has(slot));

    const row = document.createElement("button");
    row.type = "button";
    row.className = "body-slot__row";
    row.setAttribute("aria-expanded", String(selected));
    row.disabled = state.busy;
    const identity = document.createElement("span");
    const order = document.createElement("small");
    order.textContent = String(state.node.rig.contract.paintOrder.indexOf(boneName) + 1).padStart(2, "0");
    const name = document.createElement("strong");
    name.textContent = words(slot);
    identity.appendChild(order);
    identity.appendChild(name);
    const source = document.createElement("span");
    source.className = "body-slot__source";
    source.textContent = currentSource?.name ?? words(currentReference.split("/").at(-3) ?? "custom");
    if (covered.has(slot)) {
      const badge = document.createElement("em");
      badge.textContent = "covered";
      source.appendChild(badge);
    }
    row.appendChild(identity);
    row.appendChild(source);
    row.addEventListener("click", () => actions.selectSlot(slot));
    item.appendChild(row);

    if (selected) {
      const choices = document.createElement("div");
      choices.className = "part-source-choices";
      choices.setAttribute("aria-label", `${words(slot)} art source`);
      for (const entry of library.figures.figures) {
        const manifest = library.manifests.get(entry.id);
        if (manifest) choices.appendChild(sourceButton(slot, entry, manifest, currentReference, state.busy, actions.choosePart));
      }
      item.appendChild(choices);
    }
    return item;
  });
  root.replaceChildren(...rows);
}

function cosmeticButton(
  set: WardrobeIndexSet,
  piece: WardrobeIndexPiece,
  state: LoadoutPanelState,
  action: LoadoutPanelActions["toggleCosmetic"],
): HTMLButtonElement {
  const fit = cosmeticFit(state.node.rig, indexedSet(set), piece.id, state.node.figureId);
  const worn = state.loadout.cosmetics.includes(piece.reference);
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wardrobe-piece";
  button.setAttribute("aria-pressed", String(worn));
  button.disabled = state.busy || fit !== "ok";
  button.dataset.cosmetic = piece.reference;
  const copy = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = words(piece.id);
  const setName = document.createElement("small");
  setName.textContent = set.name;
  copy.appendChild(name);
  copy.appendChild(setName);
  const stateLabel = document.createElement("span");
  stateLabel.className = "wardrobe-piece__state";
  stateLabel.textContent = fit === "ok" ? (worn ? "worn" : "stored") : fit;
  button.appendChild(copy);
  button.appendChild(stateLabel);
  if (fit !== "ok") {
    const reason = `Unavailable: ${fit} for ${state.node.manifest.name}`;
    button.title = reason;
    button.setAttribute("aria-label", `${words(piece.id)}, ${reason}`);
  }
  button.addEventListener("click", () => action(piece.reference, !worn));
  return button;
}

function renderWardrobe(
  root: HTMLElement,
  library: LoadoutPanelLibrary,
  state: LoadoutPanelState,
  actions: LoadoutPanelActions,
): void {
  const sections = KIND_ORDER.flatMap((kind) => {
    const pieces = library.wardrobe.sets.flatMap((set) => set.pieces
      .filter((piece) => piece.kind === kind)
      .map((piece) => ({ set, piece })));
    if (pieces.length === 0) return [];
    const section = document.createElement("section");
    section.className = "wardrobe-kind";
    const heading = document.createElement("h4");
    heading.textContent = kind;
    const choices = document.createElement("div");
    for (const { set, piece } of pieces) choices.appendChild(cosmeticButton(set, piece, state, actions.toggleCosmetic));
    section.appendChild(heading);
    section.appendChild(choices);
    return [section];
  });
  root.replaceChildren(...sections);
}

function weaponButton(
  name: string,
  detail: string,
  reference: string | null,
  selected: boolean,
  disabled: boolean,
  stateLabel: string,
  chooseWeapon: LoadoutPanelActions["chooseWeapon"],
): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "wardrobe-piece weapon-choice";
  button.setAttribute("aria-pressed", String(selected));
  button.disabled = disabled;
  const copy = document.createElement("span");
  const title = document.createElement("strong");
  title.textContent = name;
  const source = document.createElement("small");
  source.textContent = detail;
  copy.appendChild(title);
  copy.appendChild(source);
  const state = document.createElement("span");
  state.className = "wardrobe-piece__state";
  state.textContent = stateLabel;
  button.appendChild(copy);
  button.appendChild(state);
  button.addEventListener("click", () => chooseWeapon(reference));
  return button;
}

function renderWeapon(
  root: HTMLElement,
  library: LoadoutPanelLibrary,
  state: LoadoutPanelState,
  actions: LoadoutPanelActions,
): void {
  const choices = [weaponButton(
    "Unarmed",
    "No weapon",
    null,
    state.loadout.weapon === null,
    state.busy,
    state.loadout.weapon === null ? "equipped" : "available",
    actions.chooseWeapon,
  )];
  for (const set of library.wardrobe.sets) {
    for (const piece of set.pieces.filter((candidate) => candidate.kind === "weapon")) {
      const fit = cosmeticFit(state.node.rig, indexedSet(set), piece.id, state.node.figureId);
      const selected = state.loadout.weapon === piece.reference;
      const button = weaponButton(
        words(piece.id),
        set.name,
        piece.reference,
        selected,
        state.busy || fit !== "ok",
        fit === "ok" ? (selected ? "equipped" : "stored") : fit,
        actions.chooseWeapon,
      );
      if (fit !== "ok") button.title = `Unavailable: ${fit} for ${state.node.manifest.name}`;
      choices.push(button);
    }
  }
  root.replaceChildren(...choices);
}

export function renderLoadoutPanel(
  elements: LoadoutPanelElements,
  library: LoadoutPanelLibrary,
  state: LoadoutPanelState,
  actions: LoadoutPanelActions,
): void {
  elements.root.setAttribute("aria-busy", String(state.busy));
  renderCharacterPicker(elements.characters, library.figures.figures, state.loadout.figure, actions.chooseFigure, {
    disabled: state.busy,
    label: "Base character",
  });
  renderBody(elements.body, library, state, actions);
  renderWardrobe(elements.wardrobe, library, state, actions);
  renderWeapon(elements.weapon, library, state, actions);
}
