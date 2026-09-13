import { validateRig } from "../rig/contract.ts";
import type { Rig } from "../rig/types.ts";

const SVG_NS = "http://www.w3.org/2000/svg";

export interface FigureManifest {
  readonly contract: number;
  readonly name: string;
  readonly rig: string;
  readonly parts: Readonly<Record<string, string>>;
  readonly cosmetics?: readonly unknown[];
}

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
  readonly root: SVGGElement;
  readonly bones: Map<string, SVGGElement>;
  readonly art: Map<string, SVGGElement>;
  readonly sources: Map<string, string>;
  readonly manifest: FigureManifest;
  readonly rig: Rig;
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

export function validateFigure(value: unknown, id = "figure"): FigureManifest {
  if (typeof value !== "object" || value === null) throw new Error(`${id}: manifest is not an object`);
  const figure = value as FigureManifest;
  if (figure.contract !== 1) throw new Error(`${id}: unsupported figure contract ${figure.contract}`);
  if (typeof figure.name !== "string" || !figure.name) throw new Error(`${id}: manifest has no name`);
  if (typeof figure.rig !== "string" || !figure.rig) throw new Error(`${id}: manifest has no rig`);
  if (typeof figure.parts !== "object" || figure.parts === null || Array.isArray(figure.parts)) {
    throw new Error(`${id}: manifest has no parts map`);
  }
  return figure;
}

export function inspectPart(source: string, expectedBone: string, reference: string): void {
  const names = [...source.matchAll(/\bdata-bone\s*=\s*(["'])([^"']+)\1/g)].map((match) => match[2]);
  if (names.length !== 1 || names[0] !== expectedBone) {
    throw new Error(`${reference}: expected exactly data-bone="${expectedBone}"`);
  }
  if (/\bdata-[xy]\s*=/.test(source)) {
    throw new Error(`${reference}: carries a skeleton offset; offsets belong only to the rig`);
  }
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

function replacePartArt(layer: SVGGElement, source: string, bone: string, reference: string): void {
  const guide = document.createElementNS(SVG_NS, "circle");
  guide.classList.add("joint-guide");
  guide.setAttribute("r", bone === "pelvis" || bone === "torso" ? "2.5" : "2.2");
  layer.replaceChildren(...partChildren(source, bone, reference), guide);
}

function figurePath(reference: string): string {
  return reference.endsWith(".json") || reference.includes("/") ? reference : `figures/${reference}.json`;
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
  root.dataset.figure = reference.replace(/^.*\//, "").replace(/\.json$/, "");
  const bones = new Map<string, SVGGElement>();
  const art = new Map<string, SVGGElement>();
  const sources = new Map<string, string>();

  for (const bone of rig.bones) {
    const group = document.createElementNS(SVG_NS, "g");
    group.dataset.bone = bone.name;
    group.dataset.paintOrder = String(rig.contract.paintOrder.indexOf(bone.name));
    const layer = document.createElementNS(SVG_NS, "g");
    layer.dataset.part = bone.slot;
    const loaded = parts.get(bone.name)!;
    replacePartArt(layer, loaded.source, bone.name, loaded.reference);
    bones.set(bone.name, group);
    art.set(bone.name, layer);
    sources.set(bone.name, loaded.reference);
  }

  for (const bone of rig.bones) {
    const group = bones.get(bone.name)!;
    for (const entry of rig.contract.documentOrder[bone.name]) {
      group.appendChild(entry === "@part" ? art.get(bone.name)! : bones.get(entry)!);
    }
  }
  root.appendChild(bones.get(rig.root)!);
  return { root, bones, art, sources, manifest, rig };
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
