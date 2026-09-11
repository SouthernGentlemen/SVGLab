/**
 * Atlas to an authored SVGLab character.
 *
 * The output is the same shape as `src/svg/fighter.svg`: a `data-model="fighter"` group
 * holding a nested `data-bone` tree with a `data-x`/`data-y` rest offset on each bone. That
 * is deliberate and is the whole point — `src/svg/rig.ts` reads a traced character with no
 * changes, and every clip in `src/animation/clips.ts` plays on it, because nothing about the
 * rig has moved.
 */

import { decodePng } from "./png.mjs";
import { findIslands, assignSlots } from "./segment.mjs";
import { tracePart } from "./trace.mjs";
import { BONES, HAND_FOR, LAYOUT, measureSkeleton, partPivot, SELF, SLOT_FOR } from "./skeleton.mjs";

/** Copies one island out of the atlas, dropping every pixel that belongs to another part. */
function cutIsland(atlas, labels, island) {
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

function renderPaths(paths) {
  return paths.map((path) => (path.seam
    // The hairline stroke dilates a region by a fraction of a pixel so two simplified
    // neighbours cannot leave a gap between them. It is a seam weld, not an outline.
    ? `<path d="${path.d}" fill="${path.fill}" stroke="${path.fill}" stroke-width="${path.seam}" stroke-linejoin="round"/>`
    : `<path d="${path.d}" fill="${path.fill}"/>`)).join("");
}

const escapeText = (value) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/-->/g, "--&gt;");

/**
 * Builds one character.
 *
 * @param atlasPath PNG cut to the standard layout.
 * @param options   the atlas sidecar: `trace` overrides, `proportions` overrides, `pivots`
 *                  for parts whose joint is not where the bounding box says, `props` binding
 *                  costume islands to bones, and `height`, the authored height in the same
 *                  units as `src/svg/fighter.svg`.
 */
export function buildCharacter(atlasPath, options = {}) {
  const {
    trace = {},
    proportions = {},
    pivots = {},
    props = [],
    height: targetHeight = 104,
    name = "",
  } = options;

  const atlas = decodePng(atlasPath);
  const { labels, islands } = findIslands(atlas);
  const slots = assignSlots(islands, { source: name || atlasPath });
  const { rest, wrist, height, scale } = measureSkeleton(slots, proportions, targetHeight);

  const traceIsland = (island, origin) => tracePart(cutIsland(atlas, labels, island), origin, { ...trace, scale });

  // A costume island is not a body part: a cape, a skirt or a hood has no joint of its own,
  // it rides a bone that does. The sidecar says which bone and where, and anything it does
  // not claim is left out of the file rather than shipped as dead weight.
  const bindings = new Map(props.map((prop) => [prop.slot, prop]));
  const over = {};
  const under = {};
  for (const [slot, prop] of bindings) {
    const island = slots.get(slot);
    if (!island) throw new Error(`${name}: the atlas has no ${slot} to bind`);
    if (!BONES.includes(prop.bone)) throw new Error(`${name}: ${slot} is bound to unknown bone ${prop.bone}`);
    const { paths } = traceIsland(island, { x: island.w / 2, y: island.h / 2 });
    // Offsets are written in atlas pixels, because that is the frame an author is looking at
    // when they line a cape up against a torso. The art around them is emitted at the
    // character's authored size, so the offset has to come along.
    const place = (value) => Math.round((value ?? 0) * scale * 100) / 100;
    const transform = `translate(${place(prop.x)} ${place(prop.y)})${prop.rotate ? ` rotate(${prop.rotate})` : ""}`;
    const markup = `<g transform="${transform}">${renderPaths(paths)}</g>`;
    const target = prop.under ? under : over;
    target[prop.bone] = (target[prop.bone] ?? "") + markup;
  }

  let palette = 0;
  const art = {};
  for (const bone of BONES) {
    const slot = SLOT_FOR[bone];
    const island = slots.get(slot);
    if (!island) throw new Error(`${name}: the atlas has no ${slot} for ${bone}`);
    const traced = traceIsland(island, partPivot(slot, island, pivots[slot]));
    palette = Math.max(palette, traced.palette.length);

    // A hand has no bone in this skeleton, so it is drawn into the forearm that ends where
    // the hand begins. It moves with the forearm, which is what a hand does.
    let hand = "";
    const handSlot = HAND_FOR[bone];
    if (handSlot && slots.get(handSlot)) {
      const handIsland = slots.get(handSlot);
      const { paths } = traceIsland(handIsland, partPivot(handSlot, handIsland, pivots[handSlot]));
      hand = `<g transform="translate(${wrist[bone].x} ${wrist[bone].y})">${renderPaths(paths)}</g>`;
    }

    art[bone] = `${under[bone] ?? ""}${renderPaths(traced.paths)}${hand}${over[bone] ?? ""}`;
  }

  const unused = [...slots.keys()].filter((slot) => !Object.values(SLOT_FOR).includes(slot)
    && !Object.values(HAND_FOR).includes(slot) && !bindings.has(slot));

  return { art, rest, height, scale, palette, props: bindings.size, unused, slots };
}

/** Serialises a built character as an authored SVG in `src/svg/fighter.svg`'s own shape. */
export function toCharacterSvg(character, { id, name, viewBox }) {
  const indent = (depth) => "  ".repeat(depth);
  const group = (bone, depth) => {
    const { x, y } = character.rest[bone];
    const children = LAYOUT[bone]
      .map((child) => (child === SELF ? `\n${indent(depth + 1)}${character.art[bone]}` : `\n${group(child, depth + 1)}`))
      .join("");
    return `${indent(depth)}<g data-bone="${bone}" data-x="${x}" data-y="${y}">${children}\n${indent(depth)}</g>`;
  };

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}">
  <!--
    ${escapeText(name)} — generated by scripts/build-characters.mjs from characters/${escapeText(id)}/atlas.png.
    Do not hand-edit: change the atlas or its sidecar and rebuild, or the next build discards it.

    Same shape as the hand-authored fighter, on purpose. Every group owns a local pivot, child
    groups inherit parent transforms, and data-x/data-y are the readable rest-pose offsets
    src/svg/rig.ts reads. Coordinates are SVG-native throughout: y down, rotation clockwise.

    Colours are literal rather than classed. Traced art carries its own shading, and a
    character whose hair takes the stylesheet's fill reads as a bug rather than a feature.
  -->
  <g data-model="fighter">
${group("pelvis", 2)}
  </g>
</svg>
`;
}
