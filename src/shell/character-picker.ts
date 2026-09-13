import type { FigureIndexEntry } from "../render/assemble.ts";

export interface CharacterPickerOptions {
  readonly disabled?: boolean;
  readonly label?: string;
}

function choice(entry: FigureIndexEntry, selected: string, disabled: boolean, onSelect: (id: string) => void): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "character-choice";
  button.dataset.figureChoice = entry.id;
  button.setAttribute("aria-pressed", String(entry.id === selected));
  button.disabled = disabled;

  const mark = document.createElement("span");
  mark.className = "character-choice__mark";
  mark.setAttribute("aria-hidden", "true");
  mark.textContent = entry.name.slice(0, 1).toUpperCase();
  const copy = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = entry.name;
  const id = document.createElement("small");
  id.textContent = entry.id;
  copy.appendChild(name);
  copy.appendChild(id);
  button.appendChild(mark);
  button.appendChild(copy);
  button.addEventListener("click", () => onSelect(entry.id));
  return button;
}

/** A button-based roster used anywhere a live figure is chosen. */
export function renderCharacterPicker(
  root: HTMLElement,
  figures: readonly FigureIndexEntry[],
  selected: string,
  onSelect: (id: string) => void,
  options: CharacterPickerOptions = {},
): void {
  root.setAttribute("role", "group");
  if (options.label) root.setAttribute("aria-label", options.label);
  root.replaceChildren(...figures.map((entry) => choice(entry, selected, options.disabled ?? false, onSelect)));
}
