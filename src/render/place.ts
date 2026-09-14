import type { Pose } from "boneyard";
import type { Rig } from "boneyard";
import type { DepthSide } from "boneyard";
import type { FigureNode } from "./assemble.ts";

export type VisualFacing = -1 | 1;

function boneTransform(node: FigureNode, name: string, pose: Pose): string {
  const bone = node.rig.byName.get(name)!;
  const posed = pose[name] ?? {};
  const x = bone.offset[0] + (posed.x ?? 0);
  const y = bone.offset[1] + (posed.y ?? 0);
  return `translate(${x.toFixed(3)} ${y.toFixed(3)}) rotate(${(posed.rotation ?? 0).toFixed(3)})`;
}

export function applyPose(node: FigureNode, pose: Pose): void {
  for (const [name, bone] of node.bones) bone.setAttribute("transform", boneTransform(node, name, pose));
}

function restoreDocumentOrder(node: FigureNode): void {
  for (const bone of node.rig.bones) {
    const group = node.bones.get(bone.name)!;
    for (const entry of node.rig.contract.documentOrder[bone.name]) {
      if (entry === "@part") {
        for (const slot of node.rig.contract.depthSlots) group.appendChild(node.depthLayers.get(bone.name)!.get(slot)!);
      } else group.appendChild(node.bones.get(entry)!);
    }
  }
}

export function depthProfileName(rig: Rig, clip: string, origin: string | null = clip): string {
  const profiles = rig.contract.depthProfiles;
  return profiles.byClip[clip] ?? (origin === null ? profiles.default : profiles.byClip[origin] ?? profiles.default);
}

export function depthProfileFor(node: FigureNode, clip: string, origin: string | null = clip): string {
  return depthProfileName(node.rig, clip, origin);
}

function sideBone(value: DepthSide, side: { readonly far: string; readonly near: string }): string {
  return side[value];
}

function arrangeDepth(node: FigureNode, facing: VisualFacing, profileName: string): void {
  restoreDocumentOrder(node);
  const rules = node.rig.contract.depthProfiles;
  const profile = rules.profiles[profileName];
  if (!profile) throw new Error(`rig has no depth profile '${profileName}'`);
  const sides = facing === 1 ? rules.sides.facingRight : rules.sides.facingLeft;
  const pelvis = node.bones.get("pelvis");
  const torso = node.bones.get("torso");
  const head = node.bones.get("head");
  if (!pelvis || !torso || !head) throw new Error("fighter rig is missing pelvis, torso or head");

  const torsoArt = node.art.get("torso")!;
  const torsoPart = node.depthLayers.get("torso")!.get("part")!;
  torsoArt.toggleAttribute("transform", false);
  if (facing === -1) torsoArt.setAttribute("transform", "scale(-1 1)");

  const oldUnderlay = [...pelvis.children].find((child) => child instanceof SVGGElement && child.dataset.depthLayer === "arm-underlay");
  oldUnderlay?.remove();
  if (profile.underLowerBody) {
    const underlay = document.createElementNS("http://www.w3.org/2000/svg", "g");
    underlay.dataset.depthLayer = "arm-underlay";
    underlay.setAttribute("transform", torso.getAttribute("transform") ?? "");
    underlay.appendChild(node.bones.get(sideBone(profile.underLowerBody, sides.arms))!);
    pelvis.insertBefore(underlay, pelvis.firstChild);
  }
  if (profile.behindTorso) {
    torso.insertBefore(node.bones.get(sideBone(profile.behindTorso, sides.arms))!, torsoPart);
  }
  if (profile.head === "below-arms") torso.appendChild(head);
  for (const side of profile.foreground) torso.appendChild(node.bones.get(sideBone(side, sides.arms))!);
  if (profile.head === "above-arms") torso.appendChild(head);

  const farLeg = node.bones.get(sides.legs.far)!;
  const nearLeg = node.bones.get(sides.legs.near)!;
  pelvis.insertBefore(farLeg, pelvis.firstChild);
  pelvis.insertBefore(nearLeg, farLeg.nextSibling);
}

export function placeFigure(
  node: FigureNode,
  x: number,
  y: number,
  scale: number,
  facing: VisualFacing,
  profile: string,
): void {
  arrangeDepth(node, facing, profile);
  node.root.setAttribute("transform", `translate(${x} ${y}) scale(${facing * scale} ${scale})`);
}
