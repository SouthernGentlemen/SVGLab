import type { Anchor, Bone, Rig, RigBone, RigContract } from "./types.ts";

/**
 * Reading and checking `rigs/<name>.rig.json`.
 *
 * This takes parsed JSON rather than a path, because the same function has to run in a pipeline
 * under node and in the browser against a fetched document. Nothing here touches the filesystem
 * and nothing here touches the DOM.
 *
 * Every failure names the bone, the anchor or the kind it failed on. A contract that says "the
 * rig is invalid" costs the reader the same search twice.
 */

/** The major this code understands. A file from the future is refused, not guessed at. */
export const SUPPORTED_CONTRACT = 1;

const ascii = /^[a-z][a-z0-9-]*$/;

function fail(message: string): never {
  throw new Error(`rig contract: ${message}`);
}

function point(value: unknown, where: string): readonly [number, number] {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((n) => typeof n === "number" && Number.isFinite(n))) {
    fail(`${where} is not a finite [x, y] point`);
  }
  return value as [number, number];
}

function readBone(raw: unknown, index: number): Bone {
  if (typeof raw !== "object" || raw === null) fail(`bones[${index}] is not an object`);
  const bone = raw as Record<string, unknown>;
  const name = bone.name;
  if (typeof name !== "string" || name.length === 0) fail(`bones[${index}] has no name`);
  const parent = bone.parent;
  if (parent !== null && typeof parent !== "string") fail(`'${name}' has a non-string parent`);
  return {
    name,
    parent: parent as string | null,
    offset: point(bone.offset, `'${name}' offset`),
    tip: bone.tip === null || bone.tip === undefined ? null : point(bone.tip, `'${name}' tip`),
    slot: typeof bone.slot === "string" ? bone.slot : fail(`'${name}' has no slot`),
    artHeight: typeof bone.artHeight === "number" && Number.isFinite(bone.artHeight)
      ? bone.artHeight : fail(`'${name}' has no finite artHeight`),
    hand: bone.hand === null || bone.hand === undefined ? null
      : typeof bone.hand === "string" ? bone.hand : fail(`'${name}' has a non-string hand slot`),
  };
}

/**
 * Turns a parsed contract into a validated rig with the bone tree resolved.
 *
 * The checks are the ones `check:rig` exists to run, in the order a reader would want them: is
 * this a file we understand, is the tree a tree, are the names legal for Blender, and does every
 * cross-reference — paint order, anchors, cosmetic kinds — point at something that exists.
 */
export function validateRig(raw: unknown): Rig {
  if (typeof raw !== "object" || raw === null) fail("is not an object");
  const contract = raw as unknown as RigContract;

  if (typeof contract.contract !== "number" || !Number.isInteger(contract.contract)) {
    fail("has no integer `contract` version");
  }
  if (contract.contract > SUPPORTED_CONTRACT) {
    fail(`is version ${contract.contract}; this build understands ${SUPPORTED_CONTRACT}. Upgrade the code, do not edit the file down.`);
  }
  if (!Array.isArray(contract.bones) || contract.bones.length === 0) fail("has no bones");

  const bones = contract.bones.map(readBone);
  const children = new Map<string, string[]>();
  const byName = new Map<string, RigBone>();

  const maxLength = contract.naming?.maxLength ?? 63;
  for (const bone of bones) {
    if (byName.has(bone.name)) fail(`duplicate bone '${bone.name}'`);
    if (!ascii.test(bone.name)) fail(`'${bone.name}' is not a lowercase ASCII hyphen-separated name`);
    if (bone.name.length > maxLength) fail(`'${bone.name}' is longer than ${maxLength} characters, which Blender cannot hold`);
    children.set(bone.name, []);
    byName.set(bone.name, { ...bone, children: [] });
  }
  for (const bone of bones) {
    if (bone.parent === null) continue;
    const parent = children.get(bone.parent);
    if (!parent) fail(`'${bone.name}' hangs off unknown bone '${bone.parent}'`);
    parent.push(bone.name);
  }
  for (const bone of bones) {
    const resolved = byName.get(bone.name)!;
    byName.set(bone.name, { ...resolved, children: children.get(bone.name)! });
  }

  const roots = bones.filter((bone) => bone.parent === null);
  if (roots.length !== 1) fail(`needs exactly one parentless bone, found ${roots.length}`);
  if (roots[0].name !== contract.root) {
    fail(`declares root '${contract.root}' but '${roots[0].name}' is the parentless bone`);
  }

  // A tree, not merely a parent list: walking from the root has to reach everything exactly once.
  const seen = new Set<string>();
  const walk = (name: string): void => {
    if (seen.has(name)) fail(`'${name}' is reachable twice; the bone tree has a cycle`);
    seen.add(name);
    for (const child of byName.get(name)!.children) walk(child);
  };
  walk(contract.root);
  if (seen.size !== bones.length) {
    const orphans = bones.filter((bone) => !seen.has(bone.name)).map((bone) => bone.name);
    fail(`${orphans.join(", ")} cannot be reached from '${contract.root}'`);
  }

  for (const bone of byName.values()) {
    if (bone.children.length === 0 && bone.tip === null) {
      fail(`leaf bone '${bone.name}' has no tip; BVH has nothing to draw it with`);
    }
  }

  if (!Array.isArray(contract.paintOrder) || contract.paintOrder.length !== bones.length
    || new Set(contract.paintOrder).size !== bones.length
    || contract.paintOrder.some((name) => !byName.has(name))) {
    fail("paintOrder is not a permutation of the bones");
  }

  const documentPaint: string[] = [];
  const visitDocument = (name: string): void => {
    const entries = contract.documentOrder?.[name];
    if (!Array.isArray(entries)) fail(`documentOrder has no entry for '${name}'`);
    if (entries.filter((entry) => entry === "@part").length !== 1) {
      fail(`documentOrder '${name}' must contain @part exactly once`);
    }
    const childrenInDocument = entries.filter((entry) => entry !== "@part");
    const expectedChildren = byName.get(name)!.children;
    if (childrenInDocument.length !== expectedChildren.length
      || new Set(childrenInDocument).size !== childrenInDocument.length
      || childrenInDocument.some((entry) => !expectedChildren.includes(entry))) {
      fail(`documentOrder '${name}' is not its child list plus @part`);
    }
    for (const entry of entries) {
      if (entry === "@part") documentPaint.push(name);
      else visitDocument(entry);
    }
  };
  visitDocument(contract.root);
  if (JSON.stringify(documentPaint) !== JSON.stringify(contract.paintOrder)) {
    fail("documentOrder does not produce paintOrder");
  }

  const depthProfiles = contract.depthProfiles;
  if (!depthProfiles || !depthProfiles.profiles[depthProfiles.default]) fail("depthProfiles has no valid default");
  const sideNames = new Set(["far", "near"]);
  for (const [name, profile] of Object.entries(depthProfiles.profiles)) {
    for (const side of [profile.underLowerBody, profile.behindTorso, ...profile.foreground]) {
      if (side !== null && !sideNames.has(side)) fail(`depth profile '${name}' uses unknown side '${side}'`);
    }
    if (profile.head !== "above-arms" && profile.head !== "below-arms") fail(`depth profile '${name}' has invalid head order`);
  }
  for (const [clip, profile] of Object.entries(depthProfiles.byClip)) {
    if (!depthProfiles.profiles[profile]) fail(`clip '${clip}' names unknown depth profile '${profile}'`);
  }
  for (const [facing, sides] of Object.entries(depthProfiles.sides)) {
    for (const boneName of [sides.arms.far, sides.arms.near, sides.legs.far, sides.legs.near]) {
      if (!byName.has(boneName)) fail(`depth side '${facing}' names unknown bone '${boneName}'`);
    }
  }

  if (!Array.isArray(contract.depthSlots) || contract.depthSlots.length === 0) fail("has no depthSlots");
  const slots = new Set(contract.depthSlots);

  for (const [bone, points] of Object.entries(contract.anchors ?? {})) {
    if (!byName.has(bone)) fail(`anchors name unknown bone '${bone}'`);
    for (const [anchor, value] of Object.entries(points as Record<string, Anchor>)) {
      point(value?.at, `anchor '${bone}.${anchor}'`);
    }
  }

  for (const [kind, rules] of Object.entries(contract.wardrobe?.kinds ?? {})) {
    if (!slots.has(rules.layer)) fail(`cosmetic kind '${kind}' uses depth slot '${rules.layer}', which is not declared`);
    for (const reference of [rules.anchor, rules.mirror]) {
      if (reference === undefined) continue;
      if (!hasAnchor(contract, reference)) fail(`cosmetic kind '${kind}' names anchor '${reference}', which does not exist`);
    }
  }

  return { contract, root: contract.root, bones: [...byName.values()], byName };
}

/** `"torso.neck"` — the only form a cosmetic may use to say where it goes. */
export function hasAnchor(contract: RigContract, reference: string): boolean {
  const [bone, name] = reference.split(".");
  return Boolean(bone && name && contract.anchors?.[bone]?.[name]);
}

export function anchorPoint(rig: Rig, reference: string): readonly [number, number] {
  const [bone, name] = reference.split(".");
  const anchor = rig.contract.anchors?.[bone]?.[name];
  if (!anchor) fail(`no anchor '${reference}'`);
  return anchor.at;
}

/** Parent before child, which is also the order BVH channels appear in. */
export function hierarchyOrder(rig: Rig): readonly RigBone[] {
  const ordered: RigBone[] = [];
  const visit = (name: string): void => {
    const bone = rig.byName.get(name)!;
    ordered.push(bone);
    for (const child of bone.children) visit(child);
  };
  visit(rig.root);
  return ordered;
}
