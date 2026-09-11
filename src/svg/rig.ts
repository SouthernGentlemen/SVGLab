import { AUTHORED_SKIN } from "./characters";
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

/**
 * Builds a posable fighter from an authored model.
 *
 * `model` defaults to the hand-drawn fighter and accepts any character built from an atlas:
 * both are the same document shape, so the rig has no idea which it was given and no reason
 * to care. That is the boundary worth keeping — a skin can be traced, redrawn or replaced
 * without this file changing.
 */
export function buildFighterNode(role: "player" | "dummy", model: string = AUTHORED_SKIN.model): FighterNode {
  const parsed = new DOMParser().parseFromString(model, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error("Authored fighter SVG is invalid");
  const found = parsed.querySelector<SVGGElement>("[data-model='fighter']");
  if (!found) throw new Error("Authored fighter SVG has no data-model='fighter' group");
  const root = document.createElementNS(SVG_NS, "g");
  root.classList.add("fighter", `fighter--${role}`);
  root.appendChild(document.importNode(found, true));
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
