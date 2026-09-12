import { clipOrigin } from "../animation/clips";
import type { ClipName } from "../animation/clips";
import type { FighterNode } from "./rig";

const SVG_NS = "http://www.w3.org/2000/svg";
const DEG = 180 / Math.PI;

export const SWORDS = [
  { id: "longsword", name: "Longsword" },
  { id: "katana", name: "Katana" },
  { id: "greatsword", name: "Greatsword" },
] as const;

export type SwordId = (typeof SWORDS)[number]["id"];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface SwordPose {
  readonly x: number;
  readonly y: number;
  /** Rotation in torso-local SVG degrees. Sword art itself always points up local -Y. */
  readonly rotation: number;
}

export interface SwordSpec {
  readonly bladeLength: number;
  readonly handleLength: number;
  readonly upperGripY: number;
  readonly lowerGripY: number;
}

export interface ArmSolution {
  readonly upperRotation: number;
  readonly lowerRotation: number;
  readonly elbow: Point;
  readonly hand: Point;
  readonly clamped: boolean;
}

export const SWORD_SPECS: Readonly<Record<SwordId, SwordSpec>> = {
  longsword: { bladeLength: 56, handleLength: 15, upperGripY: 4, lowerGripY: 12 },
  katana: { bladeLength: 57, handleLength: 14, upperGripY: 4, lowerGripY: 11 },
  greatsword: { bladeLength: 70, handleLength: 18, upperGripY: 5, lowerGripY: 13 },
};

interface SwordKeyframe {
  readonly frame: number;
  readonly x: number;
  readonly y: number;
  /** Desired blade angle in fighter space. Zero means straight up. */
  readonly angle: number;
}

const GUARD: readonly SwordKeyframe[] = [
  { frame: 0, x: 2, y: 4, angle: 0 },
];

const SLASH: readonly SwordKeyframe[] = [
  { frame: 0, x: 0, y: -11, angle: -18 },
  { frame: 7, x: 0, y: -13, angle: -8 },
  { frame: 12, x: 3, y: -9, angle: 22 },
  { frame: 16, x: 6, y: -5, angle: 58 },
  { frame: 21, x: 8, y: 2, angle: 96 },
  { frame: 30, x: 7, y: 5, angle: 108 },
];

const CUT: readonly SwordKeyframe[] = [
  { frame: 0, x: 2, y: 4, angle: 0 },
  { frame: 28, x: 2, y: 2, angle: -5 },
  { frame: 46, x: 0, y: -7, angle: -16 },
  { frame: 62, x: 0, y: -14, angle: -8 },
  { frame: 72, x: 2, y: -12, angle: 18 },
  { frame: 82, x: 6, y: -5, angle: 62 },
  { frame: 92, x: 9, y: 3, angle: 104 },
  { frame: 108, x: 7, y: 6, angle: 94 },
  { frame: 124, x: 4, y: 5, angle: 72 },
];

const STUDY: readonly SwordKeyframe[] = [
  { frame: 0, x: 2, y: 4, angle: 0 },
  { frame: 62, x: 2, y: 2, angle: -4 },
  { frame: 92, x: 0, y: -8, angle: -15 },
  { frame: 116, x: 0, y: -14, angle: -7 },
  { frame: 132, x: 3, y: -9, angle: 27 },
  { frame: 148, x: 7, y: -3, angle: 72 },
  { frame: 164, x: 9, y: 4, angle: 108 },
  { frame: 220, x: 3, y: 5, angle: 36 },
  { frame: 300, x: 2, y: 4, angle: 0 },
  { frame: 340, x: 2, y: 2, angle: -4 },
  { frame: 370, x: 0, y: -9, angle: -16 },
  { frame: 392, x: 0, y: -14, angle: -6 },
  { frame: 408, x: 4, y: -8, angle: 30 },
  { frame: 424, x: 8, y: -2, angle: 76 },
  { frame: 442, x: 9, y: 5, angle: 108 },
  { frame: 500, x: 2, y: 4, angle: 0 },
  { frame: 620, x: 2, y: 2, angle: -4 },
  { frame: 652, x: 0, y: -9, angle: -16 },
  { frame: 674, x: 0, y: -14, angle: -6 },
  { frame: 690, x: 4, y: -8, angle: 30 },
  { frame: 706, x: 8, y: -2, angle: 76 },
  { frame: 724, x: 9, y: 5, angle: 108 },
  { frame: 770, x: 4, y: 5, angle: 55 },
  { frame: 802, x: 2, y: 4, angle: 0 },
];

const SWORD_TRACKS: Partial<Record<ClipName, readonly SwordKeyframe[]>> = {
  bnrSwordGuardNormal: GUARD,
  bnrSwordSlashNormal: SLASH,
  bnrSwordCutNormal: CUT,
  bnrSlashStudyNormal: STUDY,
};

function svg<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function bladePath(d: string): SVGPathElement {
  const path = svg("path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "#d7e0ec");
  path.setAttribute("stroke", "#75839a");
  path.setAttribute("stroke-width", "0.8");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  return path;
}

function detailPath(d: string): SVGPathElement {
  const path = svg("path");
  path.setAttribute("d", d);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", "#f5f7fb");
  path.setAttribute("stroke-width", "0.7");
  path.setAttribute("vector-effect", "non-scaling-stroke");
  return path;
}

function grip(width: number, guardWidth: number, handleLength: number): SVGGElement {
  const group = svg("g");

  const guard = svg("rect");
  guard.setAttribute("x", String(-guardWidth / 2));
  guard.setAttribute("y", "-1.5");
  guard.setAttribute("width", String(guardWidth));
  guard.setAttribute("height", "3");
  guard.setAttribute("rx", "0.8");
  guard.setAttribute("fill", "#c99a55");

  const handle = svg("rect");
  handle.setAttribute("x", String(-width / 2));
  handle.setAttribute("y", "1");
  handle.setAttribute("width", String(width));
  handle.setAttribute("height", String(handleLength - 2));
  handle.setAttribute("rx", "1.3");
  handle.setAttribute("fill", "#49362d");
  handle.setAttribute("stroke", "#b88c55");
  handle.setAttribute("stroke-width", "0.65");
  handle.setAttribute("vector-effect", "non-scaling-stroke");

  const pommel = svg("circle");
  pommel.setAttribute("cx", "0");
  pommel.setAttribute("cy", String(handleLength));
  pommel.setAttribute("r", "2.1");
  pommel.setAttribute("fill", "#c99a55");

  group.append(guard, handle, pommel);
  return group;
}

function buildSword(id: SwordId): SVGGElement {
  const group = svg("g");
  const spec = SWORD_SPECS[id];
  group.dataset.equippedSword = id;
  group.setAttribute("pointer-events", "none");

  if (id === "longsword") {
    group.append(
      bladePath("M-2 0 L-1.5 -48 L0 -56 L1.5 -48 L2 0 Z"),
      detailPath("M0 -3 L0 -48"),
      grip(4.5, 17, spec.handleLength),
    );
  } else if (id === "katana") {
    group.append(
      bladePath("M-1.8 0 C-1 -18 0 -38 6 -53 L8 -57 L6 -51 C2 -35 1 -17 1.7 0 Z"),
      detailPath("M0 -3 C0 -21 1.5 -38 6 -51"),
      grip(4, 12, spec.handleLength),
    );
  } else {
    group.append(
      bladePath("M-3.2 0 L-2.7 -55 L0 -70 L2.7 -55 L3.2 0 Z"),
      detailPath("M0 -4 L0 -59"),
      grip(5.5, 22, spec.handleLength),
    );
  }

  return group;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function interpolateTrack(track: readonly SwordKeyframe[], frame: number): SwordKeyframe {
  if (track.length === 1 || frame <= track[0].frame) return track[0];
  for (let index = 1; index < track.length; index++) {
    const next = track[index];
    if (frame > next.frame) continue;
    const previous = track[index - 1];
    const span = next.frame - previous.frame;
    const t = span <= 0 ? 0 : (frame - previous.frame) / span;
    return {
      frame,
      x: previous.x + (next.x - previous.x) * t,
      y: previous.y + (next.y - previous.y) * t,
      angle: previous.angle + (next.angle - previous.angle) * t,
    };
  }
  return track[track.length - 1];
}

/**
 * The weapon owns its orientation. Generic locomotion keeps an upright guard; sword attacks
 * use a small authored rigid-body track. Torso rotation is cancelled so the blade does not
 * inherit a body lean and then force the hands to chase a bent-looking weapon.
 */
/**
 * An imported variant inherits its origin's weapon track: the hand that was tweaked is still
 * the hand the blade is bolted to. A clip nothing claims holds the guard.
 */
export function swordTrackFor(clip: string, origin: string | null): readonly SwordKeyframe[] {
  const tracks = SWORD_TRACKS as Record<string, readonly SwordKeyframe[] | undefined>;
  return tracks[clip] ?? (origin === null ? GUARD : tracks[origin] ?? GUARD);
}

export function swordPoseForClip(clip: ClipName, frame: number, torsoRotation = 0): SwordPose {
  const key = interpolateTrack(swordTrackFor(clip, clipOrigin(clip)), frame);
  return { x: key.x, y: key.y, rotation: key.angle - torsoRotation };
}

function rotateLocal(point: Point, rotation: number): Point {
  const radians = rotation / DEG;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

export function swordGripTargets(id: SwordId, pose: SwordPose): { upper: Point; lower: Point } {
  const spec = SWORD_SPECS[id];
  const upper = rotateLocal({ x: 0, y: spec.upperGripY }, pose.rotation);
  const lower = rotateLocal({ x: 0, y: spec.lowerGripY }, pose.rotation);
  return {
    upper: { x: pose.x + upper.x, y: pose.y + upper.y },
    lower: { x: pose.x + lower.x, y: pose.y + lower.y },
  };
}

/** Two-link IK in torso-local coordinates. Link lengths never change. */
export function solveTwoBoneArm(
  shoulder: Point,
  target: Point,
  upperLength: number,
  lowerLength: number,
  bend: -1 | 1,
): ArmSolution {
  const dx = target.x - shoulder.x;
  const dy = target.y - shoulder.y;
  const rawDistance = Math.hypot(dx, dy);
  const minDistance = Math.abs(upperLength - lowerLength) + 0.001;
  const maxDistance = upperLength + lowerLength - 0.001;
  const distance = clamp(rawDistance, minDistance, maxDistance);
  const base = Math.atan2(dy, dx);
  const shoulderOffset = Math.acos(clamp(
    (upperLength * upperLength + distance * distance - lowerLength * lowerLength)
      / (2 * upperLength * distance),
    -1,
    1,
  ));
  const upperWorld = base + bend * shoulderOffset;
  const elbow = {
    x: shoulder.x + Math.cos(upperWorld) * upperLength,
    y: shoulder.y + Math.sin(upperWorld) * upperLength,
  };
  const lowerWorld = Math.atan2(target.y - elbow.y, target.x - elbow.x);
  return {
    upperRotation: upperWorld * DEG - 90,
    lowerRotation: (lowerWorld - upperWorld) * DEG,
    elbow,
    hand: target,
    clamped: Math.abs(rawDistance - distance) > 0.01,
  };
}

function baseNumber(node: Element, name: "x" | "y"): number {
  return Number(node.getAttribute(`data-${name}`) ?? 0);
}

function setBoneRotation(bone: SVGGElement, rotation: number): void {
  bone.setAttribute(
    "transform",
    `translate(${baseNumber(bone, "x").toFixed(3)} ${baseNumber(bone, "y").toFixed(3)}) rotate(${rotation.toFixed(3)})`,
  );
}

function constrainArm(
  upper: SVGGElement,
  lower: SVGGElement,
  target: Point,
  bend: -1 | 1,
): void {
  const shoulder = { x: baseNumber(upper, "x"), y: baseNumber(upper, "y") };
  const upperLength = Math.abs(baseNumber(lower, "y")) || 21;
  const solution = solveTwoBoneArm(shoulder, target, upperLength, 22, bend);
  setBoneRotation(upper, solution.upperRotation);
  setBoneRotation(lower, solution.lowerRotation);
}

export function swordName(id: SwordId): string {
  return SWORDS.find((entry) => entry.id === id)?.name ?? SWORDS[0].name;
}

/** Equip one fixed-size preview sword beneath torso/arm art. */
export function equipSword(node: FighterNode, id: SwordId | null): void {
  for (const equipped of node.root.querySelectorAll<SVGGElement>("[data-equipped-sword]")) equipped.remove();
  if (id === null) return;

  const torso = node.bones.get("torso");
  if (!torso) throw new Error("Fighter model is missing torso for sword attachment");
  torso.insertBefore(buildSword(id), torso.firstChild);
}

/**
 * Apply the rigid weapon after the body clip has been sampled.
 *
 * The sword transform is authoritative. Both arm chains are then solved onto two fixed points
 * on its handle. Nothing in this function changes blade length, handle length, or grip spacing.
 */
export function applySwordConstraint(
  node: FighterNode,
  clip: ClipName,
  frame: number,
  torsoRotation = 0,
): void {
  const sword = node.root.querySelector<SVGGElement>("[data-equipped-sword]");
  if (!sword) return;

  const id = sword.dataset.equippedSword as SwordId | undefined;
  if (!id || !SWORD_SPECS[id]) throw new Error("Unknown equipped sword model");

  const torso = node.bones.get("torso");
  const frontArm = node.bones.get("arm-front");
  const frontForearm = node.bones.get("forearm-front");
  const backArm = node.bones.get("arm-back");
  const backForearm = node.bones.get("forearm-back");
  if (!torso || !frontArm || !frontForearm || !backArm || !backForearm) {
    throw new Error("Fighter model is missing upper-body bones for sword constraint");
  }

  if (sword.parentElement !== torso) torso.insertBefore(sword, torso.firstChild);
  const pose = swordPoseForClip(clip, frame, torsoRotation);
  sword.setAttribute("transform", `translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)}) rotate(${pose.rotation.toFixed(3)})`);

  const grips = swordGripTargets(id, pose);
  constrainArm(frontArm, frontForearm, grips.upper, -1);
  constrainArm(backArm, backForearm, grips.lower, 1);
}
