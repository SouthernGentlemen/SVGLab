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

type Matrix = readonly [number, number, number, number, number, number];

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function multiply(left: Matrix, right: Matrix): Matrix {
  const [a, b, c, d, e, f] = left;
  const [g, h, i, j, k, l] = right;
  return [a * g + c * h, b * g + d * h, a * i + c * j, b * i + d * j, a * k + c * l + e, b * k + d * l + f];
}

function transformMatrix(source: string | null): Matrix {
  if (source === null) return IDENTITY;
  let result = IDENTITY;
  let consumed = "";
  for (const match of source.matchAll(/([a-z]+)\s*\(([^)]*)\)/gi)) {
    consumed += match[0];
    const values = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    let next: Matrix;
    if (match[1] === "translate" && (values.length === 1 || values.length === 2)) {
      next = [1, 0, 0, 1, values[0], values[1] ?? 0];
    } else if (match[1] === "scale" && (values.length === 1 || values.length === 2)) {
      next = [values[0], 0, 0, values[1] ?? values[0], 0, 0];
    } else if (match[1] === "rotate" && values.length === 1) {
      const radians = values[0] * Math.PI / 180;
      const cosine = Math.cos(radians);
      const sine = Math.sin(radians);
      next = [cosine, sine, -sine, cosine, 0, 0];
    } else {
      throw new Error(`unsupported part transform '${source}'`);
    }
    if (values.some((value) => !Number.isFinite(value))) throw new Error(`invalid part transform '${source}'`);
    result = multiply(result, next);
  }
  if (consumed.replace(/\s/g, "") !== source.replace(/\s/g, "")) throw new Error(`unsupported part transform '${source}'`);
  return result;
}

function transformedBounds(documentBody: string): { x0: number; y0: number; x1: number; y1: number } {
  const xs = [0, CALIBRATION_SPAN];
  const ys = [0, CALIBRATION_SPAN];
  const transforms: Matrix[] = [IDENTITY];

  for (const token of documentBody.matchAll(/<g\b([^>]*?)(\/?)>|<\/g>|<path\b([^>]*)>/g)) {
    if (token[0] === "</g>") {
      if (transforms.length > 1) transforms.pop();
      continue;
    }
    if (token[1] !== undefined) {
      const next = multiply(transforms.at(-1)!, transformMatrix(attribute(token[1], "transform")));
      if (token[2] !== "/") transforms.push(next);
      continue;
    }

    const pathData = attribute(token[3] ?? "", "d") ?? "";
    const numbers = [...pathData.matchAll(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi)].map(([value]) => Number(value));
    const [a, b, c, d, e, f] = transforms.at(-1)!;
    for (let index = 0; index + 1 < numbers.length; index += 2) {
      const x = numbers[index];
      const y = numbers[index + 1];
      xs.push(a * x + c * y + e);
      ys.push(b * x + d * y + f);
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
  const box = transformedBounds(sourceBody);

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
