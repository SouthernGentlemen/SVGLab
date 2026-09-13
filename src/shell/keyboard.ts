import { InputBit } from "../kernel/types.ts";
import type { InputFrame } from "../kernel/types.ts";
import { keybindAction } from "./keybinds.ts";

const INPUT_BITS = {
  jump: InputBit.Up,
  moveLeft: InputBit.Left,
  crouch: InputBit.Down,
  moveRight: InputBit.Right,
  attack: InputBit.Attack,
  slash: InputBit.Slash,
} as const;

type InputAction = keyof typeof INPUT_BITS;

function isInputAction(action: string | null): action is InputAction {
  return action !== null && Object.hasOwn(INPUT_BITS, action);
}

export class KeyboardInput {
  private readonly held = new Set<InputAction>();
  private queuedInput: InputFrame = 0;
  private readonly target: Window;

  constructor(target: Window) {
    this.target = target;
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    const action = keybindAction("stage", event.code);
    if (!isInputAction(action)) return;
    this.held.add(action);
    this.queuedInput |= INPUT_BITS[action];
    event.preventDefault();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    const action = keybindAction("stage", event.code);
    if (isInputAction(action)) this.held.delete(action);
  };
  private readonly onBlur = (): void => { this.held.clear(); this.queuedInput = 0; };

  sample(): InputFrame {
    let input = this.queuedInput;
    this.queuedInput = 0;
    for (const action of this.held) input |= INPUT_BITS[action];
    return input;
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
  }
}
