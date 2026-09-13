/**
 * Atlas to authored SVGLab parts.
 *
 * Each output is the swappable unit the renderer assembles: one SVG document carrying one
 * `data-bone`, with art in that bone's local frame. Rest offsets are deliberately absent.
 * They belong to `rigs/<name>.rig.json`; putting them here would give the art a second skeleton.
 */

import type { Rig } from "../../src/rig/types.ts";
import { decodePng } from "./png.ts";
import { findIslands, assignSlots } from "./segment.ts";
import type { Island } from "./segment.ts";
import { tracePart } from "./trace.ts";
import type { RasterPart, TraceOptions, TracedPath } from "./trace.ts";
import { measureFit, partPivot } from "./fit.ts";

export interface TraceProfile {
  readonly default?: TraceOptions;
  readonly bySlot?: Readonly<Record<string, TraceOptions>>;
}

export interface AtlasOptions {
  readonly name?: string;
  readonly trace?: TraceProfile;
  readonly pivots?: Readonly<Record<string, readonly [number, number]>>;
  readonly height?: unknown;
  readonly proportions?: unknown;
  readonly props?: readonly AtlasProp[];
}

export interface AtlasProp {
  readonly slot: string;
  readonly bone: string;
  readonly x?: number;
  readonly y?: number;
  readonly rotate?: number;
  readonly under?: boolean;
}

export interface BuiltPart {
  readonly bone: string;
  readonly slot: string;
  readonly art: string;
  readonly colours: number;
}

export interface BuiltAtlas {
  readonly parts: ReadonlyMap<string, BuiltPart>;
  readonly scales: Readonly<Record<string, number>>;
  readonly palette: number;
  readonly props: number;
  readonly unused: readonly string[];
  readonly slots: ReadonlyMap<string, Island>;
}

/** Copies one island out of the atlas, dropping every pixel that belongs to another part. */
export function cutIsland(
  atlas: { readonly width: number; readonly height: number; readonly data: Uint8Array },
  labels: Int32Array,
  island: Island,
): RasterPart {
  const rgba = Buffer.alloc(island.w * island.h * 4);
  for (let y = 0; y < island.h; y++) {
    for (let x = 0; x < island.w; x++) {
      const source = (island.y + y) * atlas.width + (island.x + x);
      if (labels[source] !== island.id) continue;
      rgba.set(atlas.data.subarray(source * 4, source * 4 + 4), (y * island.w + x) * 4);
    }
  }
  return { width: island.w, height: island.h, rgba };
}

export function renderPaths(paths: readonly TracedPath[]): string {
  return paths.map((path) => (path.seam
    // The hairline stroke dilates a region by a fraction of a pixel so two simplified
    // neighbours cannot leave a gap between them. It is a seam weld, not an outline.
    ? `<path d="${path.d}" fill="${path.fill}" stroke="${path.fill}" stroke-width="${path.seam}" stroke-linejoin="round"/>`
    : `<path d="${path.d}" fill="${path.fill}"/>`)).join("");
}

/** A slot inherits the default trace profile and overrides only the knobs it names. */
export function traceOptionsFor(profile: TraceProfile = {}, slot: string): TraceOptions {
  return { ...(profile.default ?? {}), ...(profile.bySlot?.[slot] ?? {}) };
}

/**
 * Builds one atlas.
 *
 * @param atlasPath PNG cut to the standard layout.
 * @param options   the atlas sidecar: per-slot `trace` overrides and `pivots` for parts whose
 *                  joint is not where the bounding box says. Proportions are deliberately not
 *                  configurable per skin.
 */
export function buildParts(atlasPath: string, options: AtlasOptions, rig: Rig): BuiltAtlas {
  if (options.height !== undefined || options.proportions !== undefined) {
    throw new Error(`${options.name || atlasPath}: height/proportions are shared by the canonical rig, not configurable per skin`);
  }
  const {
    trace = {},
    pivots = {},
    props = [],
    name = "",
  } = options;

  const atlas = decodePng(atlasPath);
  const { labels, islands } = findIslands(atlas);
  const slots = assignSlots(islands, { source: name || atlasPath });
  const { wrist, scales } = measureFit(slots, rig);
  const bodySlots = new Set(rig.bones.map((bone) => bone.slot));
  for (const slot of Object.keys(trace.bySlot ?? {})) {
    if (!bodySlots.has(slot)) throw new Error(`${name}: trace.bySlot names unknown body slot ${slot}`);
  }

  const traceIsland = (slot: string, island: Island, origin: { readonly x: number; readonly y: number }, scale: number) => (
    tracePart(cutIsland(atlas, labels, island), origin, { ...traceOptionsFor(trace, slot), scale })
  );

  // A costume island is not a body part: a cape, a skirt or a hood has no joint of its own,
  // it rides a bone that does. The sidecar says which bone and where, and anything it does
  // not claim is left out of the file rather than shipped as dead weight. M6 promotes these
  // bindings to independent cosmetics; until then they remain baked into their owner's part.
  const bindings = new Map(props.map((prop) => [prop.slot, prop]));
  const over: Record<string, string> = {};
  const under: Record<string, string> = {};
  for (const [slot, prop] of bindings) {
    const island = slots.get(slot);
    if (!island) throw new Error(`${name}: the atlas has no ${slot} to bind`);
    const bone = rig.byName.get(prop.bone);
    if (!bone) throw new Error(`${name}: ${slot} is bound to unknown bone ${prop.bone}`);
    const scale = scales[bone.slot];
    const { paths } = traceIsland(slot, island, { x: island.w / 2, y: island.h / 2 }, scale);
    // Offsets are written in atlas pixels, because that is the frame an author is looking at
    // when they line a cape up against a torso. The art around them is emitted at the
    // character's authored size, so the offset has to come along.
    const place = (value?: number): number => Math.round((value ?? 0) * scale * 100) / 100;
    const transform = `translate(${place(prop.x)} ${place(prop.y)})${prop.rotate ? ` rotate(${prop.rotate})` : ""}`;
    const markup = `<g transform="${transform}">${renderPaths(paths)}</g>`;
    const target = prop.under ? under : over;
    target[prop.bone] = (target[prop.bone] ?? "") + markup;
  }

  let palette = 0;
  const parts = new Map<string, BuiltPart>();
  for (const bone of rig.bones) {
    const slot = bone.slot;
    const island = slots.get(slot);
    if (!island) throw new Error(`${name}: the atlas has no ${slot} for ${bone.name}`);
    const traced = traceIsland(slot, island, partPivot(slot, island, pivots[slot]), scales[slot]);
    palette = Math.max(palette, traced.palette.length);

    // A hand has no bone in this skeleton, so it is drawn into the forearm that ends where
    // the hand begins. It moves with the forearm, which is what a hand does.
    let hand = "";
    if (bone.hand && slots.get(bone.hand)) {
      const handIsland = slots.get(bone.hand)!;
      const tracedHand = traceIsland(
        bone.hand,
        handIsland,
        partPivot(bone.hand, handIsland, pivots[bone.hand]),
        scales[bone.hand],
      );
      const at = wrist[bone.name];
      hand = `<g transform="translate(${at.x} ${at.y})">${renderPaths(tracedHand.paths)}</g>`;
    }

    parts.set(slot, {
      bone: bone.name,
      slot,
      art: `${under[bone.name] ?? ""}${renderPaths(traced.paths)}${hand}${over[bone.name] ?? ""}`,
      colours: traced.palette.length,
    });
  }

  const used = new Set([
    ...rig.bones.map((bone) => bone.slot),
    ...rig.bones.flatMap((bone) => bone.hand ? [bone.hand] : []),
    ...bindings.keys(),
  ]);
  const unused = [...slots.keys()].filter((slot) => !used.has(slot));

  return { parts, scales, palette, props: bindings.size, unused, slots };
}

/** Serialises one built part. The rig offset is absent on purpose: C1 owns it. */
export function toPartSvg(part: BuiltPart): string {
  return `<!-- Generated -->
<svg xmlns="http://www.w3.org/2000/svg" data-bone="${part.bone}">${part.art}</svg>
`;
}
