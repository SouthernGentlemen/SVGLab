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
  /** Grip nearest the guard/blade. */
  readonly upperGripY: number;
  /** Grip nearest the pommel. */
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

/** These clips all come from the same real two-handed Bandai Namco slash capture. */
const CAPTURED_SWORD_CLIPS = new Set<ClipName>([
  "bnrSwordGuardNormal",
  "bnrSwordSlashNormal",
  "bnrSwordCutNormal",
  "bnrSlashStudyNormal",
]);

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

function rotateLocal(point: Point, rotation: number): Point {
  const radians = rotation / DEG;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return { x: point.x * cos - point.y * sin, y: point.x * sin + point.y * cos };
}

/**
 * Reconstruct one fixed-size sword from the two captured grip locations.
 *
 * The points only define the handle axis and its center. They never resize the weapon. The
 * guard-side hand is the source right hand (`arm-back` after retargeting); the source left hand
 * (`arm-front`) sits toward the pommel. This ordering is what keeps both captured hands on the
 * handle instead of accidentally extending the blade through one of them.
 */
export function swordPoseFromGripPoints(
  id: SwordId,
  guardHand: Point,
  pommelHand: Point,
): SwordPose | null {
  const dx = pommelHand.x - guardHand.x;
  const dy = pommelHand.y - guardHand.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) return null;

  const axis = { x: dx / distance, y: dy / distance };
  const midpoint = {
    x: (guardHand.x + pommelHand.x) / 2,
    y: (guardHand.y + pommelHand.y) / 2,
  };
  const spec = SWORD_SPECS[id];
  const gripCenterY = (spec.upperGripY + spec.lowerGripY) / 2;
  return {
    x: midpoint.x - axis.x * gripCenterY,
    y: midpoint.y - axis.y * gripCenterY,
    // Local +Y follows guard -> pommel, so local -Y (the blade) points out past the guard hand.
    rotation: Math.atan2(-axis.x, axis.y) * DEG,
  };
}

/** Fixed upright guard for generic locomotion, where the source motion was not holding a sword. */
export function swordGuardPose(torsoRotation = 0): SwordPose {
  const local = rotateLocal({ x: 4, y: -8 }, -torsoRotation);
  return { x: local.x, y: local.y, rotation: -torsoRotation };
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

/** Forward-kinematics endpoint for the same two-link arm convention used by the SVG rig. */
export function armHandPoint(
  shoulder: Point,
  upperRotation: number,
  lowerRotation: number,
  upperLength: number,
  lowerLength: number,
): Point {
  const upperRadians = (upperRotation + 90) / DEG;
  const elbow = {
    x: shoulder.x + Math.cos(upperRadians) * upperLength,
    y: shoulder.y + Math.sin(upperRadians) * upperLength,
  };
  const lowerRadians = (upperRotation + lowerRotation + 90) / DEG;
  return {
    x: elbow.x + Math.cos(lowerRadians) * lowerLength,
    y: elbow.y + Math.sin(lowerRadians) * lowerLength,
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

function rotationNumber(node: Element): number {
  const match = /rotate\(([-+\d.eE]+)\)/.exec(node.getAttribute("transform") ?? "");
  return match ? Number(match[1]) : 0;
}

function capturedHand(upper: SVGGElement, lower: SVGGElement): Point {
  const shoulder = { x: baseNumber(upper, "x"), y: baseNumber(upper, "y") };
  const upperLength = Math.abs(baseNumber(lower, "y")) || 21;
  return armHandPoint(shoulder, rotationNumber(upper), rotationNumber(lower), upperLength, 22);
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
 * Apply the rigid weapon after the captured body clip has been sampled.
 *
 * Sword-specific capture uses the recorded two-hand pose to reconstruct a rigid handle line,
 * then fits both arms back onto the selected sword's fixed grip points. Generic locomotion uses
 * an upright guard because those source clips were never holding a sword.
 */
export function applySwordConstraint(
  node: FighterNode,
  clip: ClipName,
  _frame: number,
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

  // The retarget manifest maps source L -> arm-front and source R -> arm-back. In this
  // two-handed slash capture the source right hand is nearest the guard and the left hand is
  // nearest the pommel. Capture the endpoints before IK overwrites either arm.
  const pose = CAPTURED_SWORD_CLIPS.has(clip)
    ? swordPoseFromGripPoints(id, capturedHand(backArm, backForearm), capturedHand(frontArm, frontForearm))
      ?? swordGuardPose(torsoRotation)
    : swordGuardPose(torsoRotation);

  sword.setAttribute("transform", `translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)}) rotate(${pose.rotation.toFixed(3)})`);

  const grips = swordGripTargets(id, pose);
  // Source R/back stays on the guard-side grip; source L/front stays toward the pommel.
  constrainArm(backArm, backForearm, grips.upper, 1);
  constrainArm(frontArm, frontForearm, grips.lower, -1);
}
