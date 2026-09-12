import type { FighterNode } from "./rig";

const SVG_NS = "http://www.w3.org/2000/svg";

export const SWORDS = [
  { id: "longsword", name: "Longsword" },
  { id: "katana", name: "Katana" },
  { id: "greatsword", name: "Greatsword" },
] as const;

export type SwordId = (typeof SWORDS)[number]["id"];

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
  guard.setAttribute("y", "-2");
  guard.setAttribute("width", String(guardWidth));
  guard.setAttribute("height", "3");
  guard.setAttribute("rx", "0.8");
  guard.setAttribute("fill", "#c99a55");

  const handle = svg("rect");
  handle.setAttribute("x", String(-width / 2));
  handle.setAttribute("y", "-12");
  handle.setAttribute("width", String(width));
  handle.setAttribute("height", "11");
  handle.setAttribute("rx", "1.3");
  handle.setAttribute("fill", "#49362d");
  handle.setAttribute("stroke", "#b88c55");
  handle.setAttribute("stroke-width", "0.65");
  handle.setAttribute("vector-effect", "non-scaling-stroke");

  const pommel = svg("circle");
  pommel.setAttribute("cx", "0");
  pommel.setAttribute("cy", "-13.5");
  pommel.setAttribute("r", "2.1");
  pommel.setAttribute("fill", "#c99a55");

  group.append(guard, handle, pommel);
  return group;
}

function buildSword(id: SwordId): SVGGElement {
  const group = svg("g");
  group.dataset.equippedSword = id;
  // The front forearm ends around local y=21. The sword continues along that hand axis so
  // imported guard/cut rotations carry the blade naturally instead of screen-space faking it.
  group.setAttribute("transform", "translate(5 21)");
  group.setAttribute("pointer-events", "none");

  if (id === "longsword") {
    group.append(
      bladePath("M-2 0 L-1.5 48 L0 56 L1.5 48 L2 0 Z"),
      detailPath("M0 3 L0 48"),
      grip(4.5, 17),
    );
  } else if (id === "katana") {
    group.append(
      bladePath("M-1.8 0 C-1 18 0 38 6 53 L8 57 L6 51 C2 35 1 17 1.7 0 Z"),
      detailPath("M0 3 C0 21 1.5 38 6 51"),
      grip(4, 12),
    );
  } else {
    group.append(
      bladePath("M-3.2 0 L-2.7 55 L0 70 L2.7 55 L3.2 0 Z"),
      detailPath("M0 4 L0 59"),
      grip(5.5, 22),
    );
  }

  return group;
}

export function swordName(id: SwordId): string {
  return SWORDS.find((entry) => entry.id === id)?.name ?? SWORDS[0].name;
}

/** Equip one preview sword on the front hand. Passing null restores the rig to unarmed. */
export function equipSword(node: FighterNode, id: SwordId | null): void {
  for (const equipped of node.root.querySelectorAll<SVGGElement>("[data-equipped-sword]")) equipped.remove();
  if (id === null) return;

  const hand = node.bones.get("forearm-front");
  if (!hand) throw new Error("Fighter model is missing forearm-front for sword attachment");
  hand.appendChild(buildSword(id));
}
