import { AUTHORED_SKIN } from "./characters";
import type { ClipName } from "../animation/clips";
import type { Pose } from "../animation/types";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface FighterNode {
  root: SVGGElement;
  bones: Map<string, SVGGElement>;
}

export interface FighterModelFacts {
  readonly bones: readonly string[];
}

export type VisualFacing = -1 | 1;

export interface ArmDepth {
  readonly far: "arm-front" | "arm-back";
  readonly near: "arm-front" | "arm-back";
}

type ArmBone = ArmDepth["far"];

export interface ArmLayerPlan {
  readonly underLowerBody: ArmBone | null;
  readonly behindTorso: ArmBone | null;
  readonly foreground: readonly ArmBone[];
  readonly head: "above-arms" | "below-arms";
}

export interface LegDepth {
  readonly far: "leg-front" | "leg-back";
  readonly near: "leg-front" | "leg-back";
}

export type ArmLayerProfile = "anatomical" | "locomotion" | "both-front" | "punch";

const ARM_LAYER_PROFILES = {
  bnrIdleNormal: "both-front",
  bnrCrouchNormal: "anatomical",
  bnrWalkNormal: "locomotion",
  bnrRunNormal: "locomotion",
  bnrDashNormal: "locomotion",
  bnrStrikeNormal: "punch",
  bnrSwordGuardNormal: "both-front",
  bnrSwordSlashNormal: "punch",
  bnrSwordCutNormal: "punch",
  bnrSlashStudyNormal: "punch",
  bnrPunchStudyNormal: "punch",
  swordGuardReference: "both-front",
  swordOberhauReference: "punch",
  swordOberhauStudyReference: "punch",
} as const satisfies Record<ClipName, ArmLayerProfile>;

export function armLayerProfile(clip: ClipName): ArmLayerProfile {
  return ARM_LAYER_PROFILES[clip];
}

/** The imported source-left arm is far when facing right and near after a turn to the left. */
export function armDepth(facing: VisualFacing): ArmDepth {
  return facing === 1
    ? { far: "arm-front", near: "arm-back" }
    : { far: "arm-back", near: "arm-front" };
}

export function armLayerPlan(facing: VisualFacing, clip: ClipName): ArmLayerPlan {
  const { far, near } = armDepth(facing);
  const profile = armLayerProfile(clip);
  if (profile === "locomotion") {
    return { underLowerBody: far, behindTorso: null, foreground: [near], head: "above-arms" };
  }
  if (profile === "both-front" || profile === "punch") {
    return {
      underLowerBody: null,
      behindTorso: null,
      foreground: [far, near],
      head: profile === "punch" ? "below-arms" : "above-arms",
    };
  }
  return { underLowerBody: null, behindTorso: far, foreground: [near], head: "above-arms" };
}

/** Keep front-facing chest art anatomically consistent when the posed skeleton is mirrored. */
export function torsoArtTransform(facing: VisualFacing): string | null {
  return facing === -1 ? "scale(-1 1)" : null;
}

export function legDepth(facing: VisualFacing): LegDepth {
  return facing === 1
    ? { far: "leg-front", near: "leg-back" }
    : { far: "leg-back", near: "leg-front" };
}

/**
 * Places the whole posed rig and mirrors it at one outer boundary.
 *
 * Bone rotations and local x offsets stay authored for a right-facing fighter. A negative
 * horizontal scale mirrors the completed hierarchy, so the same clip reaches and recoils in
 * the correct direction. `placeFighter` also applies the clip- and facing-aware limb layers.
 */
export function fighterPlacement(x: number, y: number, scale: number, facing: VisualFacing): string {
  return `translate(${x} ${y}) scale(${facing * scale} ${scale})`;
}

/**
 * Reads the small structural contract the rig requires without needing the DOM.
 *
 * Keeping this pure lets tests validate every generated skin in Node, while buildFighterNode
 * still performs the browser's XML parse before anything is drawn. The same check therefore
 * guards both the preview gallery and the fight renderer instead of inventing a second model
 * registry or a test-only interpretation of what a fighter is.
 */
export function inspectFighterModel(model: string): FighterModelFacts {
  if (!/\bdata-model\s*=\s*(["'])fighter\1/.test(model)) {
    throw new Error("Authored fighter SVG has no data-model='fighter' group");
  }

  const bones = [...model.matchAll(/\bdata-bone\s*=\s*(["'])([^"']+)\1/g)].map((match) => match[2]);
  if (bones.length === 0) throw new Error("Authored fighter SVG has no data-bone groups");

  const seen = new Set<string>();
  for (const name of bones) {
    if (seen.has(name)) throw new Error(`Authored fighter SVG has duplicate bone '${name}'`);
    seen.add(name);
  }
  return { bones };
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
  inspectFighterModel(model);
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

const layeredPose = new WeakMap<FighterNode, string>();
const armUnderlays = new WeakMap<FighterNode, SVGGElement>();
const torsoArtLayers = new WeakMap<FighterNode, SVGGElement>();

function armUnderlay(node: FighterNode, pelvis: SVGGElement, torso: SVGGElement): SVGGElement {
  let layer = armUnderlays.get(node);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g");
    layer.dataset.depthLayer = "arm-underlay";
    const firstPelvisArt = [...pelvis.children]
      .find((child) => !child.hasAttribute("data-bone"));
    pelvis.insertBefore(layer, firstPelvisArt ?? torso);
    armUnderlays.set(node, layer);
  }
  // This layer is a sibling of the torso so the pelvis can paint over it. Mirroring the
  // torso transform preserves the arm's original shoulder-space motion after reparenting.
  layer.setAttribute("transform", torso.getAttribute("transform") ?? "");
  return layer;
}

function torsoArtLayer(node: FighterNode, torso: SVGGElement, facing: VisualFacing): SVGGElement {
  let layer = torsoArtLayers.get(node);
  if (!layer) {
    layer = document.createElementNS(SVG_NS, "g");
    layer.dataset.depthLayer = "torso-art";
    const bodyArt = [...torso.children].filter((child) => !child.hasAttribute("data-bone"));
    torso.insertBefore(layer, bodyArt[0] ?? null);
    for (const child of bodyArt) layer.appendChild(child);
    torsoArtLayers.set(node, layer);
  }
  const facingTransform = torsoArtTransform(facing);
  if (facingTransform) layer.setAttribute("transform", facingTransform);
  else layer.removeAttribute("transform");
  return layer;
}

function arrangeLimbDepth(node: FighterNode, facing: VisualFacing, clip: ClipName): void {
  const torso = node.bones.get("torso");
  const head = node.bones.get("head");
  const plan = armLayerPlan(facing, clip);
  const underArm = plan.underLowerBody ? node.bones.get(plan.underLowerBody) : null;
  const behindArm = plan.behindTorso ? node.bones.get(plan.behindTorso) : null;
  const foregroundArms = plan.foreground.map((name) => node.bones.get(name));
  if (!torso || !head || (plan.underLowerBody && !underArm) || (plan.behindTorso && !behindArm)
    || foregroundArms.some((arm) => !arm)) {
    throw new Error("Fighter model is missing upper-body depth bones");
  }

  const pelvis = node.bones.get("pelvis");
  const { far: farLegName, near: nearLegName } = legDepth(facing);
  const farLeg = node.bones.get(farLegName);
  const nearLeg = node.bones.get(nearLegName);
  if (!pelvis || !farLeg || !nearLeg) throw new Error("Fighter model is missing lower-body depth bones");

  const underlay = armUnderlay(node, pelvis, torso);
  const bodyArt = torsoArtLayer(node, torso, facing);
  const profile = armLayerProfile(clip);
  const layerKey = `${facing}:${profile}`;
  if (layeredPose.get(node) === layerKey) return;

  if (underArm) {
    // The screen-leading/far arm is the one that crosses the hip in the imported walk, run
    // and dash. Move it into torso space below the pelvis artwork so the hip occludes it.
    underlay.appendChild(underArm);
  }
  if (behindArm) torso.insertBefore(behindArm, bodyArt);
  if (plan.head === "below-arms") torso.appendChild(head);
  // Guard and punch silhouettes put both arms here. Punches deliberately paint their raised
  // hand over the chin; other clips paint the head last and retain ordinary face occlusion.
  for (const arm of foregroundArms) torso.appendChild(arm!);
  if (plan.head === "above-arms") torso.appendChild(head);

  // Both legs stay behind the pelvis and costume art, but their crossing order follows the
  // same anatomical near/far side as the arms.
  pelvis.insertBefore(farLeg, pelvis.firstChild);
  pelvis.insertBefore(nearLeg, farLeg.nextSibling);
  // The locomotion arm underlay belongs behind the whole lower body, not merely the hip art.
  pelvis.insertBefore(underlay, pelvis.firstChild);
  layeredPose.set(node, layerKey);
}

export function placeFighter(
  node: FighterNode,
  x: number,
  y: number,
  scale: number,
  facing: VisualFacing,
  clip: ClipName,
): void {
  arrangeLimbDepth(node, facing, clip);
  node.root.setAttribute("transform", fighterPlacement(x, y, scale, facing));
}
