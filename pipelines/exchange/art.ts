const CALIBRATION_ID = "svglab-calibration";
const CALIBRATION_SPAN = 4;

export const CALIBRATION = { id: CALIBRATION_ID, span: CALIBRATION_SPAN } as const;

export interface BoneArt {
  readonly svg: string;
  readonly paths: number;
  readonly nextOrder: number;
}

const attribute = (attributes: string, name: string): string | null => {
  const match = new RegExp(`\\b${name}\\s*=\\s*(["'])([^"']*)\\1`).exec(attributes);
  return match ? match[2] : null;
};

function sourceBone(document: string): string | null {
  const root = /<svg\b([^>]*)>/.exec(document);
  return root ? attribute(root[1], "data-bone") : null;
}

function body(document: string): string {
  const match = /<svg\b[^>]*>([\s\S]*)<\/svg>/.exec(document);
  if (!match) throw new Error("part is not an SVG document");
  return match[1];
}

function translatedBounds(documentBody: string): { x0: number; y0: number; x1: number; y1: number } {
  const xs = [0, CALIBRATION_SPAN];
  const ys = [0, CALIBRATION_SPAN];
  const translations: Array<readonly [number, number]> = [[0, 0]];

  for (const token of documentBody.matchAll(/<g\b([^>]*?)(\/?)>|<\/g>|<path\b([^>]*)>/g)) {
    if (token[0] === "</g>") {
      if (translations.length > 1) translations.pop();
      continue;
    }
    if (token[1] !== undefined) {
      const parent = translations.at(-1)!;
      const transform = attribute(token[1], "transform");
      const translated = transform ? /^translate\(\s*([^\s,)]+)[,\s]+([^\s,)]+)\s*\)$/.exec(transform) : null;
      if (transform && !translated) throw new Error(`unsupported part transform '${transform}'`);
      const next = translated
        ? [parent[0] + Number(translated[1]), parent[1] + Number(translated[2])] as const
        : parent;
      if (token[2] !== "/") translations.push(next);
      continue;
    }

    const pathData = attribute(token[3] ?? "", "d") ?? "";
    const numbers = [...pathData.matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)].map(([value]) => Number(value));
    const [tx, ty] = translations.at(-1)!;
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      xs.push(numbers[index] + tx);
      ys.push(numbers[index + 1] + ty);
    }
  }

  return {
    x0: Math.min(...xs) - CALIBRATION_SPAN,
    y0: Math.min(...ys) - CALIBRATION_SPAN,
    x1: Math.max(...xs) + CALIBRATION_SPAN,
    y1: Math.max(...ys) + CALIBRATION_SPAN,
  };
}

/**
 * Turn one already-painted M1 part into the standalone SVG Blender consumes for one bone.
 *
 * The first path is a calibration corner at the bone's origin. An importer may scale, flip or
 * offset the document; setup.py reads the corner back and inverts the measured frame. Path ids
 * preserve global paint order, while `line` marks fill-less strokes that Blender must bevel.
 */
export function boneArtSvg(bone: string, part: string, startingOrder = 0): BoneArt {
  if (sourceBone(part) !== bone) throw new Error(`part names bone '${sourceBone(part) ?? "nothing"}', expected '${bone}'`);
  if (/\bclass\s*=|\bcolor-mix\(|\bvar\(/.test(part)) {
    throw new Error(`${bone}: part paint is not literal; rebuild the M1 part instead of resolving CSS here`);
  }

  const sourceBody = body(part);
  let order = startingOrder;
  const painted = sourceBody.replace(/<path\b([^>]*?)(\/?)>/g, (_match, rawAttributes: string, slash: string) => {
    const attributes = rawAttributes.replace(/\s+id\s*=\s*(["'])[^"']*\1/g, "");
    const kind = attribute(attributes, "fill") === "none" ? "line" : "part";
    return `<path id="svglab-${kind}-${order++}"${attributes}${slash}>`;
  });
  const box = translatedBounds(sourceBody);

  return {
    paths: order - startingOrder,
    nextOrder: order,
    svg: [
      `<svg xmlns="http://www.w3.org/2000/svg" data-bone="${bone}"`,
      `     viewBox="${box.x0} ${box.y0} ${box.x1 - box.x0} ${box.y1 - box.y0}">`,
      `  <path id="${CALIBRATION_ID}" fill="none" stroke="#ff00ff" stroke-width="0.2"`,
      `        d="M0 0 L${CALIBRATION_SPAN} 0 M0 0 L0 ${CALIBRATION_SPAN}"/>`,
      painted,
      "</svg>",
      "",
    ].join("\n"),
  };
}
