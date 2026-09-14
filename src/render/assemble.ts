import { validateRig } from "boneyard";
import type { Rig } from "boneyard";
import { cosmeticReference, figurePath, inspectPart, validateFigure } from "boneyard";
import type { FigureManifest } from "boneyard";
import { cosmeticFit, inspectCosmetic, placementTransform, resolveCosmeticPlacements, validateWardrobeSet } from "boneyard";
import type { CosmeticFit, CosmeticPiece, CosmeticPlacement, WardrobeIndex, WardrobeSet } from "boneyard";

export { inspectPart, validateFigure } from "boneyard";
export type { FigureManifest } from "boneyard";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface FigureIndexEntry {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}

export interface FigureIndex {
  readonly contract: 1;
  readonly figures: readonly FigureIndexEntry[];
}

export interface FigureNode {
  readonly figureId: string;
  readonly root: SVGGElement;
  readonly bones: Map<string, SVGGElement>;
  readonly art: Map<string, SVGGElement>;
  readonly depthLayers: Map<string, ReadonlyMap<string, SVGGElement>>;
  readonly sources: Map<string, string>;
  readonly cosmetics: Map<string, CosmeticNode>;
  readonly manifest: FigureManifest;
  readonly rig: Rig;
}

export interface CosmeticNode {
  readonly reference: string;
  readonly piece: CosmeticPiece;
  readonly placements: readonly CosmeticPlacement[];
  readonly elements: readonly SVGGElement[];
  enabled: boolean;
}

export type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** Cloudflare's HTMLRewriter Element hides DOM's variadic append overload. */
export function appendAll(parent: SVGElement, ...nodes: readonly SVGElement[]): void {
  for (const node of nodes) parent.appendChild(node);
}

function assetUrl(reference: string, baseUrl: string): string {
  return new URL(reference.replace(/^\//, ""), new URL("/", baseUrl)).toString();
}

async function fetchText(url: string, fetcher: Fetcher): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) throw new Error(`could not fetch ${new URL(url).pathname}: ${response.status}`);
  return response.text();
}

async function fetchJson(url: string, fetcher: Fetcher): Promise<unknown> {
  return JSON.parse(await fetchText(url, fetcher)) as unknown;
}

/** The hierarchy's actual paint order must be the explicit order C1 declares. */
export function assemblyPaintOrder(rig: Rig): string[] {
  const order: string[] = [];
  const visit = (name: string): void => {
    const entries = rig.contract.documentOrder[name];
    if (!entries) throw new Error(`rig documentOrder has no entry for '${name}'`);
    for (const entry of entries) {
      if (entry === "@part") order.push(name);
      else visit(entry);
    }
  };
  visit(rig.root);
  if (JSON.stringify(order) !== JSON.stringify(rig.contract.paintOrder)) {
    throw new Error("rig documentOrder does not produce paintOrder");
  }
  return order;
}

function partChildren(source: string, expectedBone: string, reference: string): SVGElement[] {
  inspectPart(source, expectedBone, reference);
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error(`${reference}: invalid SVG`);
  const svg = parsed.documentElement;
  return [...svg.children].map((child) => document.importNode(child, true) as SVGElement);
}

function cosmeticChildren(source: string, pieceId: string, reference: string): SVGElement[] {
  inspectCosmetic(source, pieceId, reference);
  const parsed = new DOMParser().parseFromString(source, "image/svg+xml");
  if (parsed.querySelector("parsererror")) throw new Error(`${reference}: invalid SVG`);
  return [...parsed.documentElement.children].map((child) => document.importNode(child, true) as SVGElement);
}

function replacePartArt(layer: SVGGElement, source: string, bone: string, reference: string): void {
  const guide = document.createElementNS(SVG_NS, "circle");
  guide.classList.add("joint-guide");
  guide.setAttribute("r", bone === "pelvis" || bone === "torso" ? "2.5" : "2.2");
  layer.replaceChildren(...partChildren(source, bone, reference), guide);
}

export async function loadFigureManifest(
  reference: string,
  baseUrl = document.baseURI,
  fetcher: Fetcher = fetch,
): Promise<FigureManifest> {
  const path = figurePath(reference);
  return validateFigure(await fetchJson(assetUrl(path, baseUrl), fetcher), path);
}

export async function loadFigureIndex(baseUrl = document.baseURI, fetcher: Fetcher = fetch): Promise<FigureIndex> {
  const value = await fetchJson(assetUrl("figures/index.json", baseUrl), fetcher) as FigureIndex;
  if (value.contract !== 1 || !Array.isArray(value.figures)) throw new Error("figure index has an unsupported shape");
  return value;
}

export async function loadWardrobeIndex(baseUrl = document.baseURI, fetcher: Fetcher = fetch): Promise<WardrobeIndex> {
  const development = await fetcher(assetUrl("dev/wardrobe", baseUrl));
  const response = development.ok
    ? development
    : await fetcher(assetUrl("cosmetics/index.json", baseUrl));
  if (!response.ok) throw new Error(`wardrobe index is unavailable (${response.status})`);
  const value = JSON.parse(await response.text()) as WardrobeIndex;
  if (value.contract !== 1 || !Array.isArray(value.sets)) throw new Error("wardrobe index has an unsupported shape");
  return value;
}

function rejectCosmeticFit(
  fit: Exclude<CosmeticFit, "ok">,
  rig: Rig,
  set: WardrobeSet,
  setPath: string,
  pieceId: string,
  reference: string,
  figureId: string,
): never {
  if (fit === "wrong rig") throw new Error(`${setPath}: targets rig '${set.rig}', not '${rig.contract.id}'`);
  if (fit === "unknown piece") throw new Error(`${reference}: is not declared in ${setPath}`);
  if (fit === "unknown kind") {
    throw new Error(`${set.name}/${pieceId}: names unknown kind '${set.pieces[pieceId]!.kind}'`);
  }
  throw new Error(`${reference}: is not fitted for figure '${figureId}'`);
}

function attachCosmetic(
  node: FigureNode,
  reference: string,
  piece: CosmeticPiece,
  placements: readonly CosmeticPlacement[],
  children: readonly SVGElement[],
): CosmeticNode {
  const layers = placements.map((placement) => {
    const layer = node.depthLayers.get(placement.bone)?.get(placement.layer);
    if (!layer) throw new Error(`${reference}: cannot resolve depth layer '${placement.bone}/${placement.layer}'`);
    return layer;
  });
  const elements = placements.map((placement, index) => {
    const element = document.createElementNS(SVG_NS, "g");
    element.dataset.cosmetic = reference;
    element.dataset.anchor = placement.anchor;
    element.setAttribute("transform", placementTransform(placement));
    appendAll(element, ...children.map((child) => child.cloneNode(true) as SVGElement));
    layers[index].appendChild(element);
    return element;
  });
  const cosmetic = { reference, piece, placements, elements, enabled: true };
  node.cosmetics.set(reference, cosmetic);
  return cosmetic;
}

export async function assembleFigure(
  reference: string,
  role: "player" | "dummy" = "player",
  baseUrl = document.baseURI,
  fetcher: Fetcher = fetch,
): Promise<FigureNode> {
  const manifestPath = figurePath(reference);
  const manifest = await loadFigureManifest(manifestPath, baseUrl, fetcher);
  const rigPath = `rigs/${manifest.rig}.rig.json`;
  const rig = validateRig(await fetchJson(assetUrl(rigPath, baseUrl), fetcher));
  assemblyPaintOrder(rig);

  const expectedSlots = rig.bones.map((bone) => bone.slot).sort();
  if (JSON.stringify(Object.keys(manifest.parts).sort()) !== JSON.stringify(expectedSlots)) {
    throw new Error(`${manifestPath}: parts are not the slots in ${rigPath}`);
  }

  const requests = rig.bones.map(async (bone) => {
    const part = manifest.parts[bone.slot];
    if (typeof part !== "string" || !part.endsWith(`/${bone.slot}.svg`)) {
      throw new Error(`${manifestPath}: invalid part for '${bone.slot}'`);
    }
    return [bone.name, { reference: part, source: await fetchText(assetUrl(part, baseUrl), fetcher) }] as const;
  });
  const parts = new Map(await Promise.all(requests));

  const root = document.createElementNS(SVG_NS, "g");
  root.classList.add("fighter", `fighter--${role}`);
  const figureId = reference.replace(/^.*\//, "").replace(/\.json$/, "");
  root.dataset.figure = figureId;
  const bones = new Map<string, SVGGElement>();
  const art = new Map<string, SVGGElement>();
  const depthLayers = new Map<string, ReadonlyMap<string, SVGGElement>>();
  const sources = new Map<string, string>();
  const cosmetics = new Map<string, CosmeticNode>();

  for (const bone of rig.bones) {
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset.bone = bone.name;
    group.dataset.paintOrder = String(rig.contract.paintOrder.indexOf(bone.name));
    const layers = new Map<string, SVGGElement>();
    for (const slot of rig.contract.depthSlots) {
      const depth = document.createElementNS(SVG_NS, "g");
      depth.dataset.depthSlot = slot;
      layers.set(slot, depth);
    }
    const layer = document.createElementNS(SVG_NS, "g");
    layer.dataset.part = bone.slot;
    const loaded = parts.get(bone.name)!;
    replacePartArt(layer, loaded.source, bone.name, loaded.reference);
    layers.get("part")!.appendChild(layer);
    bones.set(bone.name, group);
    art.set(bone.name, layer);
    depthLayers.set(bone.name, layers);
    sources.set(bone.name, loaded.reference);
  }

  for (const bone of rig.bones) {
    const group = bones.get(bone.name)!;
    for (const entry of rig.contract.documentOrder[bone.name]) {
      if (entry === "@part") {
        for (const slot of rig.contract.depthSlots) group.appendChild(depthLayers.get(bone.name)!.get(slot)!);
      } else group.appendChild(bones.get(entry)!);
    }
  }

  const node: FigureNode = { figureId, root, bones, art, depthLayers, sources, cosmetics, manifest, rig };
  const sets = new Map<string, Promise<WardrobeSet>>();
  await Promise.all(manifest.cosmetics.map(async (cosmeticPath) => {
    const { pieceId, setPath } = cosmeticReference(cosmeticPath);
    let setRequest = sets.get(setPath);
    if (!setRequest) {
      setRequest = fetchJson(assetUrl(setPath, baseUrl), fetcher)
        .then((value) => validateWardrobeSet(value, setPath));
      sets.set(setPath, setRequest);
    }
    const [set, source] = await Promise.all([
      setRequest,
      fetchText(assetUrl(cosmeticPath, baseUrl), fetcher),
    ]);
    const fit = cosmeticFit(rig, set, pieceId, figureId);
    if (fit !== "ok") rejectCosmeticFit(fit, rig, set, setPath, pieceId, cosmeticPath, figureId);
    const piece = set.pieces[pieceId]!;
    const asset = inspectCosmetic(source, pieceId, cosmeticPath);
    const placements = resolveCosmeticPlacements(rig, set, pieceId, asset.height);
    const children = cosmeticChildren(source, pieceId, cosmeticPath);
    attachCosmetic(node, cosmeticPath, piece, placements, children);
  }));
  root.appendChild(bones.get(rig.root)!);
  refreshHiddenParts(node);
  return node;
}

export function hiddenPartSlots(cosmetics: Iterable<CosmeticNode>): Set<string> {
  return new Set([...cosmetics].filter((cosmetic) => cosmetic.enabled)
    .flatMap((cosmetic) => cosmetic.piece.hides ?? []));
}

function refreshHiddenParts(node: FigureNode): void {
  const hidden = hiddenPartSlots(node.cosmetics.values());
  for (const bone of node.rig.bones) {
    const layer = node.art.get(bone.name)!;
    const parent = node.depthLayers.get(bone.name)!.get("part")!;
    if (hidden.has(bone.slot)) layer.remove();
    else if (layer.parentNode !== parent) parent.appendChild(layer);
  }
}

/** Toggles already-fetched art; the figure hierarchy and current pose stay alive. */
export function setCosmeticEnabled(node: FigureNode, reference: string, enabled: boolean): void {
  const cosmetic = node.cosmetics.get(reference);
  if (!cosmetic) throw new Error(`figure has no cosmetic '${reference}'`);
  cosmetic.enabled = enabled;
  for (const element of cosmetic.elements) {
    if (enabled) element.removeAttribute("display");
    else element.setAttribute("display", "none");
  }
  refreshHiddenParts(node);
}

/** Fetches and attaches one compatible piece without replacing the live figure tree. */
export async function wearCosmetic(
  node: FigureNode,
  reference: string,
  baseUrl = document.baseURI,
  fetcher: Fetcher = fetch,
): Promise<CosmeticFit> {
  const current = node.cosmetics.get(reference);
  if (current) {
    if (!current.enabled) setCosmeticEnabled(node, reference, true);
    return "ok";
  }

  const { pieceId, setPath } = cosmeticReference(reference);
  const set = validateWardrobeSet(await fetchJson(assetUrl(setPath, baseUrl), fetcher), setPath);
  const fit = cosmeticFit(node.rig, set, pieceId, node.figureId);
  if (fit !== "ok") return fit;

  const source = await fetchText(assetUrl(reference, baseUrl), fetcher);
  const asset = inspectCosmetic(source, pieceId, reference);
  const placements = resolveCosmeticPlacements(node.rig, set, pieceId, asset.height);
  attachCosmetic(node, reference, set.pieces[pieceId]!, placements, cosmeticChildren(source, pieceId, reference));
  refreshHiddenParts(node);
  return "ok";
}

/** Detaches one piece without replacing the live figure tree. */
export function removeCosmetic(node: FigureNode, reference: string): void {
  const cosmetic = node.cosmetics.get(reference);
  if (!cosmetic) return;
  for (const element of cosmetic.elements) element.remove();
  node.cosmetics.delete(reference);
  refreshHiddenParts(node);
}

/** Re-fetches exactly one asset and keeps the posed hierarchy alive. */
export async function swapPart(
  node: FigureNode,
  boneName: string,
  reference: string,
  baseUrl = document.baseURI,
  fetcher: Fetcher = fetch,
): Promise<void> {
  const layer = node.art.get(boneName);
  if (!layer) throw new Error(`figure has no bone '${boneName}'`);
  const source = await fetchText(assetUrl(reference, baseUrl), fetcher);
  replacePartArt(layer, source, boneName, reference);
  node.sources.set(boneName, reference);
}
