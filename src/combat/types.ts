export type InputFrame = number;

export const InputBit = {
  Left: 1 << 0,
  Right: 1 << 1,
  Up: 1 << 2,
  Down: 1 << 3,
  Attack: 1 << 4,
  Slash: 1 << 5,
} as const;

export type Facing = -1 | 1;
export type FighterMode = "idle" | "walk" | "crouch" | "jump" | "attack" | "hitstun" | "defeated";
export type AttackPhase = "startup" | "active" | "recovery";
/** Which authored move an attack is executing. Combat reads frame data through this key. */
export type MoveId = "basic" | "sword";

/** Fighter-local geometry. X points forward and Y points up from the ground origin. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Aabb {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface HitboxDefinition {
  id: string;
  box: Box;
  startFrame: number;
  endFrame: number;
  damage: number;
  hitstun: number;
  hitstopAttacker: number;
  hitstopDefender: number;
  pushbackAttacker: number;
  pushbackDefender: number;
}

export interface MoveDefinition {
  id: string;
  name: string;
  animation: string;
  startup: number;
  active: number;
  recovery: number;
  duration: number;
  hitboxes: readonly HitboxDefinition[];
}

export interface FighterDefinition {
  id: string;
  name: string;
  maxHealth: number;
  walkSpeed: number;
  jumpVelocity: number;
  gravity: number;
  groundFriction: number;
  pushboxStand: Box;
  pushboxCrouch: Box;
  pushboxAir: Box;
  hurtboxesStand: readonly Box[];
  hurtboxesCrouch: readonly Box[];
  hurtboxesAir: readonly Box[];
  moves: { readonly [K in MoveId]: MoveDefinition };
}

export interface FighterState {
  id: "player" | "dummy";
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: Facing;
  mode: FighterMode;
  stateFrame: number;
  move: MoveId;
  moveFrame: number;
  health: number;
  hitstop: number;
  stun: number;
  invulnerable: boolean;
  hitTargets: string[];
  previousInput: InputFrame;
}

export interface SimulationState {
  tick: number;
  fighters: [FighterState, FighterState];
}

export type CombatEventKind =
  | "attack-started"
  | "phase-changed"
  | "attack-ended"
  | "hit"
  | "damage-received"
  | "invulnerable"
  | "state-changed"
  | "recovered";

export interface CombatEvent {
  frame: number;
  kind: CombatEventKind;
  fighter?: FighterState["id"];
  source?: FighterState["id"];
  target?: FighterState["id"];
  detail: string;
}

export interface ContactEvent {
  source: FighterState["id"];
  target: FighterState["id"];
  hitboxId: string;
  overlap: Aabb;
  damage: number;
  ignored: boolean;
}

export interface FrameReport {
  frame: number;
  phase: AttackPhase | null;
  contacts: ContactEvent[];
  events: CombatEvent[];
}

export interface DebugBoxes {
  origins: Array<{ x: number; y: number }>;
  pushboxes: Aabb[];
  hurtboxes: Aabb[][];
  hitboxes: Aabb[][];
}

export interface SimulationConfig {
  definitions: [FighterDefinition, FighterDefinition];
  startX: [number, number];
}
