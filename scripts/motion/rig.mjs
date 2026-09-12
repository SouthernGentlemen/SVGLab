/**
 * The authored skeleton, read from the fighter document instead of restated here.
 *
 * `src/svg/fighter.svg` already owns the rest pose: nested `data-bone` groups with
 * `data-x`/`data-y` offsets in SVG coordinates — y down, rotation clockwise-positive. Every
 * exchange with an external tool needs the same tree, so it is parsed rather than duplicated:
 * a second copy of these numbers is a second rig that drifts.
 */

/**
 * End Site offsets for the bones that carry no child.
 *
 * BVH needs a tip to draw a leaf bone. These offsets carry no channels and no pose data, so
 * they change what a skeleton looks like in Blender and nothing about the motion. They follow
 * each bone's own art: shins and forearms reach down their length, the head reaches up.
 */
const LEAF_TIPS = {
  "shin-front": { x: 0, y: 21 },
  "shin-back": { x: 0, y: 21 },
  "forearm-front": { x: 0, y: 23 },
  "forearm-back": { x: 0, y: 23 },
  head: { x: 0, y: -16 },
};

const attribute = (attributes, name) => {
  const match = new RegExp(`\\bdata-${name}\\s*=\\s*(["'])([^"']*)\\1`).exec(attributes);
  return match ? match[2] : null;
};

/** Parses the authored fighter into an ordered bone tree with rest offsets and leaf tips. */
export function readRig(document) {
  const bones = [];
  const open = [];
  for (const match of document.matchAll(/<g\b([^>]*?)(\/?)>|<\/g>/g)) {
    if (match[0] === "</g>") {
      open.pop();
      continue;
    }
    const name = attribute(match[1], "bone");
    if (name !== null) {
      bones.push({
        name,
        parent: [...open].reverse().find((entry) => entry !== null) ?? null,
        x: Number(attribute(match[1], "x") ?? 0),
        y: Number(attribute(match[1], "y") ?? 0),
      });
    }
    if (match[2] !== "/") open.push(name);
  }

  if (bones.length === 0) throw new Error("Authored fighter SVG has no data-bone groups");
  const roots = bones.filter((bone) => bone.parent === null);
  if (roots.length !== 1) throw new Error(`Authored fighter SVG needs one root bone, found ${roots.length}`);
  for (const bone of bones) {
    if (!Number.isFinite(bone.x) || !Number.isFinite(bone.y)) throw new Error(`${bone.name}: non-numeric rest offset`);
  }

  const children = new Map(bones.map((bone) => [bone.name, []]));
  for (const bone of bones) if (bone.parent !== null) children.get(bone.parent).push(bone.name);
  for (const bone of bones) {
    bone.children = children.get(bone.name);
    if (bone.children.length === 0) {
      const tip = LEAF_TIPS[bone.name];
      if (!tip) throw new Error(`${bone.name}: leaf bone has no End Site offset`);
      bone.tip = tip;
    }
  }

  return { root: roots[0].name, bones, byName: new Map(bones.map((bone) => [bone.name, bone])) };
}

/** Bones in hierarchy order: a parent always precedes its children, matching BVH channel order. */
export function hierarchyOrder(rig) {
  const ordered = [];
  const visit = (name) => {
    const bone = rig.byName.get(name);
    ordered.push(bone);
    for (const child of bone.children) visit(child);
  };
  visit(rig.root);
  return ordered;
}
