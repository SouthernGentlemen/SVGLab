import { hierarchyOrder } from "../../src/rig/contract.ts";
import type { DepthSide, Rig } from "../../src/rig/types.ts";

type VisualFacing = -1 | 1;

function sideBone(value: DepthSide, side: { readonly far: string; readonly near: string }): string {
  return side[value];
}

/** Flatten the browser's nested depth arrangement for independent world-space SVG groups. */
export function visualPaintOrder(rig: Rig, facing: VisualFacing, profileName: string): readonly string[] {
  const rules = rig.contract.depthProfiles;
  const profile = rules.profiles[profileName];
  if (!profile) throw new Error(`rig has no depth profile '${profileName}'`);
  const sides = facing === 1 ? rules.sides.facingRight : rules.sides.facingLeft;
  const descendants = (root: string): string[] => hierarchyOrder(rig)
    .filter((bone) => {
      let current = bone.name;
      while (current !== root) {
        const parent = rig.byName.get(current)?.parent;
        if (parent === null || parent === undefined) return false;
        current = parent;
      }
      return true;
    })
    .map((bone) => bone.name);
  const order: string[] = [];
  if (profile.underLowerBody) order.push(...descendants(sideBone(profile.underLowerBody, sides.arms)));
  order.push(...descendants(sides.legs.far), ...descendants(sides.legs.near), "pelvis");
  if (profile.behindTorso) order.push(...descendants(sideBone(profile.behindTorso, sides.arms)));
  order.push("torso");
  if (profile.head === "below-arms") order.push(...descendants("head"));
  for (const side of profile.foreground) order.push(...descendants(sideBone(side, sides.arms)));
  if (profile.head === "above-arms") order.push(...descendants("head"));
  if (order.length !== rig.bones.length || new Set(order).size !== rig.bones.length) {
    throw new Error(`depth profile '${profileName}' does not paint every bone exactly once`);
  }
  return order;
}
