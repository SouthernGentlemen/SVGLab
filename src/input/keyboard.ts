import { InputBit } from "../combat/types";
import type { InputFrame } from "../combat/types";

export class KeyboardInput {
  private readonly held = new Set<string>();
  private queuedInput: InputFrame = 0;

  constructor(private readonly target: Window) {
    target.addEventListener("keydown", this.onKeyDown);
    target.addEventListener("keyup", this.onKeyUp);
    target.addEventListener("blur", this.onBlur);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyJ", "KeyK"].includes(event.code)) {
      this.held.add(event.code);
      if (event.code === "KeyW") this.queuedInput |= InputBit.Up;
      else if (event.code === "KeyA") this.queuedInput |= InputBit.Left;
      else if (event.code === "KeyS") this.queuedInput |= InputBit.Down;
      else if (event.code === "KeyD") this.queuedInput |= InputBit.Right;
      else if (event.code === "KeyJ") this.queuedInput |= InputBit.Attack;
      else if (event.code === "KeyK") this.queuedInput |= InputBit.Slash;
      event.preventDefault();
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.held.delete(event.code);
  };

  private readonly onBlur = (): void => {
    this.held.clear();
    this.queuedInput = 0;
  };

  pulseAttack(): void {
    this.queuedInput |= InputBit.Attack;
  }

  pulseSlash(): void {
    this.queuedInput |= InputBit.Slash;
  }

  sample(): InputFrame {
    let input = this.queuedInput;
    this.queuedInput = 0;
    if (this.held.has("KeyA")) input |= InputBit.Left;
    if (this.held.has("KeyD")) input |= InputBit.Right;
    if (this.held.has("KeyW")) input |= InputBit.Up;
    if (this.held.has("KeyS")) input |= InputBit.Down;
    if (this.held.has("KeyJ")) input |= InputBit.Attack;
    if (this.held.has("KeyK")) input |= InputBit.Slash;
    return input;
  }

  dispose(): void {
    this.target.removeEventListener("keydown", this.onKeyDown);
    this.target.removeEventListener("keyup", this.onKeyUp);
    this.target.removeEventListener("blur", this.onBlur);
  }
}
