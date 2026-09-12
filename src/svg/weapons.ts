import type { FighterNode } from "./rig";

const SVG_NS = "http://www.w3.org/2000/svg";

export const SWORDS = [
  { id: "longsword", name: "Longsword" },
  { id: "katana", name: "Katana" },
  { id: "greatsword", name: "Greatsword" },
] as const;

export type SwordId = (typeof SWORDS)[number]["id"];

export interface GripPoint {
  readonly x: number;
  readonly y: number;
}

export interface SwordPose {
  readonly x: number;
  readonly y: number;
  readonly rotation: number;
  readonly gripLength: number;
}

interface Matrix2d {
  readonly a: number;
  readonly b: number;
  readonly c: number;
  readonly d: number;
  readonly e: number;
  readonly f: number;
}

const IDENTITY: Matrix2d = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

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

function grip(width: number, guardWidth: number): SVGGElement {
  const group = svg("g");

  const guard = svg("rect");
  guard.setAttribute("x", String(-guardWidth / 2));
  guard.setAttribute("y", "-1.5");
  guard.setAttribute("width", String(guardWidth));
  guard.setAttribute("height", "3");
  guard.setAttribute("rx", "0.8");
  guard.setAttribute("fill", "#c99a55");

  const handle = svg("rect");
  handle.dataset.swordHandle = "true";
  handle.setAttribute("x", String(-width / 2));
  handle.setAttribute("y", "1");
  handle.setAttribute("width", String(width));
  handle.setAttribute("height", "12");
  handle.setAttribute("rx", "1.3");
  handle.setAttribute("fill", "#49362d");
  handle.setAttribute("stroke", "#b88c55");
  handle.setAttribute("stroke-width", "0.65");
  handle.setAttribute("vector-effect", "non-scaling-stroke");

  const pommel = svg("circle");
  pommel.dataset.swordPommel = "true";
  pommel.setAttribute("cx", "0");
  pommel.setAttribute("cy", "15");
  pommel.setAttribute("r", "2.1");
  pommel.setAttribute("fill", "#c99a55");

  group.append(guard, handle, pommel);
  return group;
}

function buildSword(id: SwordId): SVGGElement {
  const group = svg("g");
  group.dataset.equippedSword = id;
  group.setAttribute("pointer-events", "none");

  if (id === "longsword") {
    group.append(
      bladePath("M-2 0 L-1.5 -48 L0 -56 L1.5 -48 L2 0 Z"),
      detailPath("M0 -3 L0 -48"),
      grip(4.5, 17),
    );
  } else if (id === "katana") {
    group.append(
      bladePath("M-1.8 0 C-1 -18 0 -38 6 -53 L8 -57 L6 -51 C2 -35 1 -17 1.7 0 Z"),
      detailPath("M0 -3 C0 -21 1.5 -38 6 -51"),
      grip(4, 12),
    );
  } else {
    group.append(
      bladePath("M-3.2 0 L-2.7 -55 L0 -70 L2.7 -55 L3.2 0 Z"),
      detailPath("M0 -4 L0 -59"),
      grip(5.5, 22),
    );
  }

  return group;
}

function multiply(left: Matrix2d, right: Matrix2d): Matrix2d {
  return {
    a: left.a * right.a + left.c * right.b,
    b: left.b * right.a + left.d * right.b,
    c: left.a * right.c + left.c * right.d,
    d: left.b * right.c + left.d * right.d,
    e: left.a * right.e + left.c * right.f + left.e,
    f: left.b * right.e + left.d * right.f + left.f,
  };
}

function localMatrix(element: SVGGElement): Matrix2d {
  const matrix = element.transform.baseVal.consolidate()?.matrix;
  if (!matrix) return IDENTITY;
  return { a: matrix.a, b: matrix.b, c: matrix.c, d: matrix.d, e: matrix.e, f: matrix.f };
}

function pointInFighter(node: FighterNode, bone: SVGGElement, point: GripPoint): GripPoint {
  const chain: SVGGElement[] = [];
  let current: SVGGElement | null = bone;
  while (current && current !== node.root) {
    chain.push(current);
    current = current.parentElement as SVGGElement | null;
  }
  if (current !== node.root) throw new Error("Sword hand bone is outside fighter root");

  let matrix = IDENTITY;
  for (let index = chain.length - 1; index >= 0; index--) matrix = multiply(matrix, localMatrix(chain[index]));
  return {
    x: matrix.a * point.x + matrix.c * point.y + matrix.e,
    y: matrix.b * point.x + matrix.d * point.y + matrix.f,
  };
}

function localHandPoint(bone: SVGGElement, fallback: GripPoint): GripPoint {
  try {
    const box = bone.getBBox();
    if (box.width > 0 && box.height > 0) {
      return { x: box.x + box.width * 0.5, y: box.y + box.height * 0.9 };
    }
  } catch {
    // Detached/hidden SVGs may not expose a box in every browser. The authored rig fallback is stable.
  }
  return fallback;
}

export function swordPoseFromHands(front: GripPoint, back: GripPoint): SwordPose {
  const dx = front.x - back.x;
  const dy = front.y - back.y;
  const gripLength = Math.max(1, Math.hypot(dx, dy));
  const bladeAngle = Math.atan2(dy, dx) * 180 / Math.PI;
  // Sword art points up local -Y. Rotate that axis through the rear hand and out past the front hand.
  return { x: front.x, y: front.y, rotation: bladeAngle + 90, gripLength };
}

export function swordName(id: SwordId): string {
  return SWORDS.find((entry) => entry.id === id)?.name ?? SWORDS[0].name;
}

/** Equip one preview sword beneath fighter art. Passing null restores the rig to unarmed. */
export function equipSword(node: FighterNode, id: SwordId | null): void {
  for (const equipped of node.root.querySelectorAll<SVGGElement>("[data-equipped-sword]")) equipped.remove();
  if (id === null) return;

  const sword = buildSword(id);
  node.root.insertBefore(sword, node.root.firstChild);
}

/**
 * Re-aim the sword from the actual two-hand grip every rendered frame.
 *
 * Bandai Namco's sword capture is two-handed. Using the line from the rear hand through the
 * front hand keeps the blade direction independent from either forearm's bend, while adapting
 * the handle length to the current pose and to each skin's traced forearm geometry.
 */
export function updateSwordPose(node: FighterNode): void {
  const sword = node.root.querySelector<SVGGElement>("[data-equipped-sword]");
  if (!sword) return;

  const frontBone = node.bones.get("forearm-front");
  const backBone = node.bones.get("forearm-back");
  if (!frontBone || !backBone) throw new Error("Fighter model is missing forearms for sword attachment");

  const front = pointInFighter(node, frontBone, localHandPoint(frontBone, { x: 4, y: 21 }));
  const back = pointInFighter(node, backBone, localHandPoint(backBone, { x: 3, y: 20 }));
  const pose = swordPoseFromHands(front, back);
  sword.setAttribute("transform", `translate(${pose.x.toFixed(3)} ${pose.y.toFixed(3)}) rotate(${pose.rotation.toFixed(3)})`);

  const handle = sword.querySelector<SVGRectElement>("[data-sword-handle]");
  const pommel = sword.querySelector<SVGCircleElement>("[data-sword-pommel]");
  if (!handle || !pommel) throw new Error("Sword model is missing grip geometry");
  handle.setAttribute("height", (pose.gripLength + 2).toFixed(3));
  pommel.setAttribute("cy", (pose.gripLength + 3).toFixed(3));
}
