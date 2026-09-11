import fighterSource from "./fighter.svg?raw";
import type { Pose } from "../animation/types";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface FighterNode {
  root: SVGGElement;
  bones: Map<string, SVGGElement>;
}

function baseNumber(node: Element, name: "x" | "y"): number {
  return Number(node.getAttribute(`data-${name}`) ?? 0);
}

function transform(node: Element, pose = {} as NonNullable<Pose[string]>): string {
  const x = baseNumber(node, "x") + (pose.x ?? 0);
  const y = baseNumber(node, "y") + (pose.y ?? 0);
  return `translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${(pose.rotation ?? 0).toFixed(3)})`;
}

export function buildFighterNode(role: "player" | "dummy"): FighterNode {
  const parsed = new DOMParser().parseFromString(fighterSource, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error("Authored fighter SVG is invalid");
  const model = parsed.querySelector<SVGGElement>("[data-model='fighter']");
  if (!model) throw new Error("Authored fighter SVG has no data-model='fighter' group");
  const root = document.createElementNS(SVG_NS, "g");
  root.classList.add("fighter", `fighter--${role}`);
  root.appendChild(document.importNode(model, true));
  const bones = new Map<string, SVGGElement>();
  for (const bone of root.querySelectorAll<SVGGElement>("[data-bone]")) {
    const name = bone.dataset.bone;
    if (!name) continue;
    bone.setAttribute("transform", transform(bone));
    bones.set(name, bone);
  }
  return { root, bones };
}

export function applyPose(node: FighterNode, pose: Pose): void {
  for (const [name, bone] of node.bones) bone.setAttribute("transform", transform(bone, pose[name]));
}
