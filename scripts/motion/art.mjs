/**
 * The fighter's own artwork, cut into one file per bone.
 *
 * `src/svg/fighter.svg` draws every bone's art in that bone's local frame and leaves the rest
 * offsets in `data-x`/`data-y` for the rig to apply, so the file on its own is a pile of parts
 * at the origin. An external tool has no rig, so each bone's art is written out separately and
 * placed against that bone's rest pose on the way in.
 *
 * Class names are resolved to explicit paint here. The lab styles the rig with CSS variables
 * that no importer will read, and art that arrives untinted is harder to review than art that
 * arrives in the colours the lab draws.
 */

const CALIBRATION_ID = "svglab-calibration";
const CALIBRATION_SPAN = 4;

export const CALIBRATION = { id: CALIBRATION_ID, span: CALIBRATION_SPAN };

function variable(styles, name) {
  const match = new RegExp(`\\.fighter\\s*\\{[^}]*--${name}:\\s*([^;]+);`).exec(styles);
  if (!match) throw new Error(`styles.css has no --${name} on .fighter`);
  return match[1].trim();
}

const channel = (color, index) => Number.parseInt(color.slice(1 + index * 2, 3 + index * 2), 16);

/** `color-mix(in srgb, var(--body) 68%, #111827)`, resolved so an importer sees a plain colour. */
function mix(from, to, weight) {
  const parts = [0, 1, 2].map((index) =>
    Math.round(channel(from, index) * weight + channel(to, index) * (1 - weight))
      .toString(16).padStart(2, "0"));
  return `#${parts.join("")}`;
}

/** The paint each authored class carries, in the order the classes are applied. */
export function readPalette(styles) {
  const body = variable(styles, "body");
  const paint = {
    part: { fill: body, stroke: "#06090f", "stroke-width": "1.2" },
    "part--accent": { fill: variable(styles, "accent") },
    "part--skin": { fill: variable(styles, "skin") },
    "part--back": { fill: mix(body, "#111827", 0.68) },
    detail: { fill: "none", stroke: "#101724", "stroke-width": "1.2", "stroke-linecap": "round" },
  };
  return paint;
}

const attribute = (attributes, name) => {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`).exec(attributes);
  return match ? match[2] : null;
};

/**
 * Splits the fighter into `{ bone: [element, ...] }`, each element already painted.
 *
 * Joint guides are left out: the lab hides them unless the skeleton overlay is on, and an
 * external tool already draws the skeleton it is given.
 */
export function readBoneArt(document, styles) {
  const palette = readPalette(styles);
  const art = new Map();
  const open = [];
  let order = 0;

  for (const match of document.matchAll(/<(\w+)\b([^>]*?)(\/?)>|<\/(\w+)>/g)) {
    const [, tag, attributes, selfClosing, closing] = match;
    if (closing) {
      if (closing === "g") open.pop();
      continue;
    }
    if (tag === "g") {
      const bone = attribute(attributes, "data-bone");
      if (selfClosing !== "/") open.push(bone);
      continue;
    }
    if (tag === "svg") continue;

    const bone = [...open].reverse().find((entry) => entry !== null && entry !== undefined) ?? null;
    if (bone === null) continue;
    const classes = (attribute(attributes, "class") ?? "").split(/\s+/).filter(Boolean);
    if (classes.includes("joint-guide")) continue;
    const paint = Object.assign({}, ...classes.map((name) => palette[name] ?? {}));
    if (Object.keys(paint).length === 0) continue;

    const geometry = Object.fromEntries([...attributes.matchAll(/\b([\w-]+)\s*=\s*(["'])([^"']*)\2/g)]
      .filter(([, name]) => name !== "class")
      .map(([, name, , value]) => [name, value]));
    const entries = art.get(bone) ?? [];
    entries.push({ tag, order: order++, line: paint.fill === "none", attributes: { ...geometry, ...paint } });
    art.set(bone, entries);
  }

  return art;
}

function bounds(elements) {
  const numbers = elements.flatMap((element) =>
    [...(element.attributes.d ?? "").matchAll(/-?\d*\.?\d+/g)].map(([value]) => Number(value)));
  if (numbers.length === 0) return { x0: -CALIBRATION_SPAN, y0: -CALIBRATION_SPAN, x1: CALIBRATION_SPAN, y1: CALIBRATION_SPAN };
  const xs = numbers.filter((_, index) => index % 2 === 0);
  const ys = numbers.filter((_, index) => index % 2 === 1);
  return {
    x0: Math.min(...xs, 0) - 4,
    y0: Math.min(...ys, 0) - 4,
    x1: Math.max(...xs, CALIBRATION_SPAN) + 4,
    y1: Math.max(...ys, CALIBRATION_SPAN) + 4,
  };
}

/**
 * One bone's art as a standalone document.
 *
 * The first path is a calibration corner at the bone's own origin, one unit along each axis.
 * An importer that scales, flips or offsets the document — and they all do — still hands back
 * a measurable frame, so the art can be placed exactly without guessing its conventions.
 */
export function boneArtSvg(bone, elements) {
  const box = bounds(elements);
  const paint = (attributes) => Object.entries(attributes)
    .map(([name, value]) => `${name}="${value}"`).join(" ");
  // SVG has no z-index: document order *is* paint order, and the authored order is the
  // right-facing depth order. The id carries it so an importer can separate coplanar art in
  // depth instead of letting a renderer pick a winner.
  const body = elements.map((element) =>
    `  <${element.tag} id="svglab-${element.line ? "line" : "part"}-${element.order}" ${paint(element.attributes)}/>`);
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" data-bone="${bone}"`,
    `     viewBox="${box.x0} ${box.y0} ${box.x1 - box.x0} ${box.y1 - box.y0}">`,
    `  <path id="${CALIBRATION_ID}" fill="none" stroke="#ff00ff" stroke-width="0.2"`,
    `        d="M0 0 L${CALIBRATION_SPAN} 0 M0 0 L0 ${CALIBRATION_SPAN}"/>`,
    ...body,
    "</svg>",
    "",
  ].join("\n");
}
