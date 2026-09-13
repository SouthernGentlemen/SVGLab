export type KeybindScope = "stage" | "preview";

export interface Keybind {
  readonly code: string;
  readonly key: string;
  readonly label: string;
  readonly scope: KeybindScope;
}

export const KEYBINDS = {
  stage: {
    jump: { code: "KeyW", key: "W", label: "Jump", scope: "stage" },
    moveLeft: { code: "KeyA", key: "A", label: "Move left", scope: "stage" },
    crouch: { code: "KeyS", key: "S", label: "Crouch", scope: "stage" },
    moveRight: { code: "KeyD", key: "D", label: "Move right", scope: "stage" },
    attack: { code: "KeyJ", key: "J", label: "Strike", scope: "stage" },
    slash: { code: "KeyK", key: "K", label: "Sword", scope: "stage" },
    pause: { code: "KeyP", key: "P", label: "Pause / resume", scope: "stage" },
    step: { code: "Period", key: ".", label: "Step while paused", scope: "stage" },
    reset: { code: "KeyR", key: "R", label: "Reset fight", scope: "stage" },
    debug: { code: "Backquote", key: "`", label: "Debug overlay", scope: "stage" },
    labels: { code: "KeyL", key: "L", label: "Labels: parts / cosmetics / off", scope: "stage" },
  },
  preview: {
    togglePlayback: { code: "Space", key: "Space", label: "Play / pause", scope: "preview" },
    previousClip: { code: "BracketLeft", key: "[", label: "Previous clip", scope: "preview" },
    nextClip: { code: "BracketRight", key: "]", label: "Next clip", scope: "preview" },
    step: { code: "Period", key: ".", label: "Step frame", scope: "preview" },
    replay: { code: "KeyR", key: "R", label: "Replay", scope: "preview" },
    compare: { code: "KeyC", key: "C", label: "Compare figures", scope: "preview" },
    facing: { code: "KeyF", key: "F", label: "Flip facing", scope: "preview" },
    pivots: { code: "KeyG", key: "G", label: "Bone pivots", scope: "preview" },
    skeleton: { code: "KeyK", key: "K", label: "Skeleton", scope: "preview" },
    labels: { code: "KeyL", key: "L", label: "Labels: parts / cosmetics / off", scope: "preview" },
  },
} as const satisfies Record<KeybindScope, Record<string, Keybind>>;

export type KeybindAction<Scope extends KeybindScope> = keyof typeof KEYBINDS[Scope] & string;

export function keybindAction<Scope extends KeybindScope>(scope: Scope, code: string): KeybindAction<Scope> | null {
  const match = Object.entries(KEYBINDS[scope]).find(([, binding]) => binding.code === code);
  return match ? match[0] as KeybindAction<Scope> : null;
}

export function renderKeybindHelp(root: HTMLElement, scope: KeybindScope): void {
  root.replaceChildren(...Object.values(KEYBINDS[scope]).map((binding) => {
    const item = document.createElement("li");
    const key = document.createElement("kbd");
    key.textContent = binding.key;
    const label = document.createElement("span");
    label.textContent = binding.label;
    item.appendChild(key);
    item.appendChild(label);
    return item;
  }));
}
