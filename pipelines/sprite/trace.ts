/**
 * Raster part to layered SVG paths.
 *
 * The obvious way to trace colour art is to stack unions — layer k holds every colour from k
 * onward, so each layer buries the one below and no background can show between them. That
 * reproduces the source exactly, and it falls apart the moment you simplify: a union layer
 * carries every finer detail inside it, so a one-pixel hair strand belongs to six boundaries
 * at once and the curve fitter dissolves it.
 *
 * So: one flat silhouette underneath in the colour that rings the part, then one path per
 * connected patch of flat colour on top, ordered by how deeply each patch is nested inside
 * another. Every boundary a path carries is its own, so simplification error stays local to
 * the shape that caused it, and the seams two simplified neighbours would leave between them
 * are closed by stroking each patch with a hairline of its own fill.
 *
 * Every stage is deterministic — median cut and Lloyd relaxation both are — so the same
 * atlas always yields the same bytes, and a rebuild that changes a file means the art
 * changed rather than that the tracer wandered.
 */

export const ALPHA_FLOOR = 96;

/** Weighted colour distance above which a small region is detail worth keeping, not noise. */
const CONTRAST_FLOOR = 190;

/** A region no larger than this is facial detail or trim, and is always drawn last. */
const DETAIL_AREA = 30;

type Rgb = [number, number, number];
type GridPoint = [number, number];

export interface RasterPart {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8Array;
}

export interface TraceOrigin {
  readonly x: number;
  readonly y: number;
}

export interface TraceOptions {
  readonly colours?: number;
  readonly epsilon?: number;
  readonly smoothing?: number;
  readonly cornerAngle?: number;
  readonly minRegionArea?: number;
  readonly seam?: number;
  readonly scale?: number;
  readonly places?: number;
}

export interface TracedPath {
  readonly d: string;
  readonly fill: string;
  readonly seam: number;
}

export interface TracedPart {
  readonly paths: readonly TracedPath[];
  readonly palette: readonly string[];
}

/* -------------------------------------------------------------- quantisation */

function medianCut(pixels: Rgb[], count: number): Rgb[] {
  let boxes: Rgb[][] = [pixels];
  while (boxes.length < count) {
    let target = -1;
    let bestSpread = 0;
    let bestChannel = 0;
    boxes.forEach((box, index) => {
      if (box.length < 2) return;
      for (let channel = 0; channel < 3; channel++) {
        let low = 255, high = 0;
        for (const pixel of box) {
          if (pixel[channel] < low) low = pixel[channel];
          if (pixel[channel] > high) high = pixel[channel];
        }
        const spread = (high - low) * box.length ** 0.2;
        if (spread > bestSpread) { bestSpread = spread; target = index; bestChannel = channel; }
      }
    });
    if (target === -1) break;
    const box = boxes[target].slice().sort((a, b) => a[bestChannel] - b[bestChannel]);
    const middle = box.length >> 1;
    boxes = boxes.filter((_, index) => index !== target).concat([box.slice(0, middle), box.slice(middle)]);
  }
  return boxes.filter((box) => box.length > 0).map((box) => {
    const total = [0, 0, 0];
    for (const pixel of box) { total[0] += pixel[0]; total[1] += pixel[1]; total[2] += pixel[2]; }
    return total.map((sum) => Math.round(sum / box.length)) as Rgb;
  });
}

/**
 * Lloyd relaxation over the median-cut seeds.
 *
 * Median cut alone places a colour at the middle of a box, which is fine for flat art and
 * poor for the long smooth gradients these atlases use — a hood lit from one side lands
 * three or four palette entries that all sit slightly off the colours actually present, and
 * the error shows up as muddy banding. Re-averaging each cluster over the pixels assigned to
 * it, weighted by how often each colour occurs, pulls every entry onto real art colour.
 * Seeding stays unweighted, so a rare colour keeps the slot median cut gave it.
 */
function refine(palette: Rgb[], distinct: ReadonlyMap<number, number>, rounds = 8): Rgb[] {
  const entries = [...distinct].map(([key, count]) => (
    [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff, count] as const
  ));
  let current = palette;
  for (let round = 0; round < rounds; round++) {
    const totals: Array<[number, number, number, number]> = current.map(() => [0, 0, 0, 0]);
    for (const [r, g, b, count] of entries) {
      const slot = totals[nearest(current, r, g, b)];
      slot[0] += r * count;
      slot[1] += g * count;
      slot[2] += b * count;
      slot[3] += count;
    }
    const next = totals.map((slot, index) => (slot[3] === 0
      ? current[index]
      : [Math.round(slot[0] / slot[3]), Math.round(slot[1] / slot[3]), Math.round(slot[2] / slot[3])] as Rgb));
    if (next.every((colour, index) => colour.every((channel, i) => channel === current[index][i]))) return next;
    current = next;
  }
  return current;
}

function nearest(palette: readonly Rgb[], r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const [pr, pg, pb] = palette[i];
    // Weighted to match perceived difference; keeps shading steps where the eye sees them.
    const distance = 2 * (pr - r) ** 2 + 4 * (pg - g) ** 2 + 3 * (pb - b) ** 2;
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  return best;
}

/** Colour index per pixel, or -1 outside the part. Speckles are folded into their surround. */
function quantise(part: RasterPart, colours: number, minRegionArea: number): { palette: Rgb[]; indices: Int16Array } {
  const { width, height, rgba } = part;
  // Median cut runs over *distinct* colours, not over pixels. Pixel-weighted cutting spends
  // its whole budget on whatever covers the most area — every slot goes to hair — and
  // the eyebrows and mouth, a couple of dozen pixels each, get folded into skin. The parts
  // that carry a character's face are small by nature, so every colour gets one vote.
  const distinct = new Map<number, number>();
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < ALPHA_FLOOR) continue;
    const key = (rgba[i * 4] << 16) | (rgba[i * 4 + 1] << 8) | rgba[i * 4 + 2];
    distinct.set(key, (distinct.get(key) ?? 0) + 1);
  }
  const samples = [...distinct.keys()].map((key) => (
    [(key >> 16) & 0xff, (key >> 8) & 0xff, key & 0xff] as Rgb
  ));
  if (samples.length === 0) return { palette: [], indices: new Int16Array(0) };

  const palette = refine(medianCut(samples, colours), distinct);
  const indices = new Int16Array(width * height).fill(-1);
  for (let i = 0; i < width * height; i++) {
    if (rgba[i * 4 + 3] < ALPHA_FLOOR) continue;
    indices[i] = nearest(palette, rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]);
  }

  denoise(indices, width, height);
  despeckle(indices, width, height, minRegionArea, palette);
  return { palette, indices };
}

/**
 * Clears salt-and-pepper left by quantising a soft gradient.
 *
 * A pixel is rewritten to the majority of its four neighbours only when it has no
 * neighbour of its own colour. That is the difference between noise and a one-pixel line:
 * a stray pixel is isolated, whereas a pixel on an eyebrow has the rest of the eyebrow on
 * either side of it, so the strokes that carry a face survive.
 */
function denoise(indices: Int16Array, width: number, height: number): void {
  const source = Int16Array.from(indices);
  for (let i = 0; i < source.length; i++) {
    if (source[i] < 0) continue;
    const x = i % width;
    const y = (i - x) / width;
    const votes = new Map<number, number>();
    let own = 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighbour = source[ny * width + nx];
      if (neighbour < 0) continue;
      if (neighbour === source[i]) own++;
      else votes.set(neighbour, (votes.get(neighbour) ?? 0) + 1);
    }
    if (own > 0 || votes.size === 0) continue;
    indices[i] = [...votes].sort((a, b) => b[1] - a[1])[0][0];
  }
}

/**
 * Folds quantisation noise back into its surroundings.
 *
 * Only low-contrast specks are absorbed. Banding noise is by definition a near-neighbour of
 * the colour around it, whereas the handful of pixels that make an eyebrow, a pupil or a
 * mouth are the sharpest contrast on the part — merging those by size alone is what wipes a
 * character's face off while leaving the hair looking fine.
 */
function despeckle(indices: Int16Array, width: number, height: number, minArea: number, palette: readonly Rgb[]): void {
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  for (let start = 0; start < indices.length; start++) {
    if (seen[start] || indices[start] < 0) continue;
    const colour = indices[start];
    const members: number[] = [];
    const border = new Map<number, number>();
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const index = stack.pop()!;
      members.push(index);
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (indices[next] === colour) {
          if (!seen[next]) { seen[next] = 1; stack.push(next); }
        } else if (indices[next] >= 0) {
          border.set(indices[next], (border.get(indices[next]) ?? 0) + 1);
        }
      }
    }
    if (members.length >= minArea || border.size === 0) continue;
    const [winner] = [...border].sort((a, b) => b[1] - a[1])[0];
    const [r, g, b] = palette[colour];
    const [wr, wg, wb] = palette[winner];
    const contrast = Math.sqrt(2 * (wr - r) ** 2 + 4 * (wg - g) ** 2 + 3 * (wb - b) ** 2);
    if (contrast > CONTRAST_FLOOR) continue;
    for (const index of members) indices[index] = winner;
  }
}

/* ------------------------------------------------------------------ contours */

const KEY = (x: number, y: number): number => x * 4096 + y;

/**
 * Closed boundary loops of a binary mask, on the pixel grid.
 *
 * Every inside cell contributes one unit edge per outside neighbour, wound so the filled
 * side is on the right. Chaining those edges recovers outer boundaries and hole boundaries
 * alike with no special cases, and picking the sharpest available right turn at a shared
 * corner keeps two diagonally-touching regions apart instead of fusing them.
 */
function traceLoops(mask: Uint8Array, width: number, height: number): GridPoint[][] {
  const outgoing = new Map<number, GridPoint[]>();
  const add = (x1: number, y1: number, x2: number, y2: number): void => {
    const key = KEY(x1, y1);
    const list = outgoing.get(key);
    if (list) list.push([x2, y2]); else outgoing.set(key, [[x2, y2]]);
  };

  const inside = (x: number, y: number): boolean => (
    x >= 0 && y >= 0 && x < width && y < height && mask[y * width + x] === 1
  );
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x, y - 1)) add(x, y, x + 1, y);
      if (!inside(x + 1, y)) add(x + 1, y, x + 1, y + 1);
      if (!inside(x, y + 1)) add(x + 1, y + 1, x, y + 1);
      if (!inside(x - 1, y)) add(x, y + 1, x, y);
    }
  }

  const loops: GridPoint[][] = [];
  for (const [startKey, startList] of outgoing) {
    while (startList.length) {
      const startX = Math.floor(startKey / 4096);
      const startY = startKey % 4096;
      const loop: GridPoint[] = [[startX, startY]];
      let [x, y] = startList.pop()!;
      let direction: GridPoint = [x - startX, y - startY];
      let guard = 0;
      while ((x !== startX || y !== startY) && guard++ < width * height * 8) {
        loop.push([x, y]);
        const options = outgoing.get(KEY(x, y));
        if (!options || options.length === 0) break;
        // Sharpest right turn first: right, straight, left, reverse.
        const rank = ([nx, ny]: GridPoint): number => {
          const dx = nx - x;
          const dy = ny - y;
          const cross = direction[0] * dy - direction[1] * dx;
          const dot = direction[0] * dx + direction[1] * dy;
          if (cross > 0) return 0;
          if (dot > 0) return 1;
          if (cross < 0) return 2;
          return 3;
        };
        let choice = 0;
        for (let i = 1; i < options.length; i++) if (rank(options[i]) < rank(options[choice])) choice = i;
        const [nx, ny] = options.splice(choice, 1)[0];
        direction = [nx - x, ny - y];
        x = nx;
        y = ny;
      }
      if (loop.length >= 4) loops.push(loop);
    }
  }
  return loops;
}

/* ---------------------------------------------------------------- simplifying */

function collinear(points: GridPoint[]): GridPoint[] {
  const out: GridPoint[] = [];
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const [px, py] = points[(i - 1 + n) % n];
    const [x, y] = points[i];
    const [nx, ny] = points[(i + 1) % n];
    if ((x - px) * (ny - y) - (y - py) * (nx - x) !== 0) out.push([x, y]);
  }
  return out.length >= 3 ? out : points;
}

function douglasPeucker(points: GridPoint[], epsilon: number): GridPoint[] {
  if (points.length < 3) return points;
  const [ax, ay] = points[0];
  const [bx, by] = points[points.length - 1];
  let index = 0;
  let worst = -1;
  const dx = bx - ax;
  const dy = by - ay;
  const length = Math.hypot(dx, dy) || 1;
  for (let i = 1; i < points.length - 1; i++) {
    const distance = Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / length;
    if (distance > worst) { worst = distance; index = i; }
  }
  if (worst <= epsilon) return [points[0], points[points.length - 1]];
  return [
    ...douglasPeucker(points.slice(0, index + 1), epsilon).slice(0, -1),
    ...douglasPeucker(points.slice(index), epsilon),
  ];
}

/**
 * Douglas-Peucker on a closed ring.
 *
 * A ring cannot be simplified as one polyline: its first and last points coincide, every
 * vertex is zero distance from that degenerate chord, and the whole outline collapses. So
 * the ring is cut at two far-apart vertices — its topmost point and whichever point lies
 * furthest from it — and the two open halves are simplified independently. Anchoring on an
 * extreme point also keeps the cut in the same place between runs, which is what makes a
 * rebuild byte-identical when the art has not changed.
 */
function simplifyLoop(loop: GridPoint[], epsilon: number): GridPoint[] {
  const points = collinear(loop);
  if (points.length < 6) return points;

  let anchor = 0;
  for (let i = 1; i < points.length; i++) {
    if (points[i][1] < points[anchor][1] || (points[i][1] === points[anchor][1] && points[i][0] < points[anchor][0])) anchor = i;
  }
  const rotated = [...points.slice(anchor), ...points.slice(0, anchor)];

  let opposite = 1;
  let best = -1;
  for (let i = 1; i < rotated.length; i++) {
    const distance = Math.hypot(rotated[i][0] - rotated[0][0], rotated[i][1] - rotated[0][1]);
    if (distance > best) { best = distance; opposite = i; }
  }

  const front = douglasPeucker(rotated.slice(0, opposite + 1), epsilon);
  const back = douglasPeucker([...rotated.slice(opposite), rotated[0]], epsilon);
  const simplified = [...front.slice(0, -1), ...back.slice(0, -1)];
  return simplified.length >= 3 ? simplified : points;
}

/* -------------------------------------------------------------------- output */

const round = (n: number, places = 2): number => {
  const value = Math.round(n * 10 ** places) / 10 ** places;
  return Object.is(value, -0) ? 0 : value;
};

/**
 * A closed path with rounded corners.
 *
 * Shallow turns become quadratic curves so the pixel staircase disappears; turns past
 * `cornerAngle` stay sharp, which is what keeps a chin, a belt buckle and a boot heel from
 * melting into blobs.
 */
function loopToPath(
  loop: GridPoint[],
  { smoothing, cornerAngle, originX, originY, scale, places }: {
    readonly smoothing: number;
    readonly cornerAngle: number;
    readonly originX: number;
    readonly originY: number;
    readonly scale: number;
    readonly places: number;
  },
): string {
  const n = loop.length;
  const at = (i: number): GridPoint => loop[(i % n + n) % n];
  const parts: string[] = [];
  const cosLimit = Math.cos((180 - cornerAngle) * Math.PI / 180);

  const pointFor = (i: number, towards: number): GridPoint => {
    const [x, y] = at(i);
    const [tx, ty] = at(towards);
    const length = Math.hypot(tx - x, ty - y) || 1;
    const shift = Math.min(length / 2, smoothing);
    return [x + (tx - x) * shift / length, y + (ty - y) * shift / length];
  };

  const sharp = (i: number): boolean => {
    const [px, py] = at(i - 1);
    const [x, y] = at(i);
    const [nx, ny] = at(i + 1);
    const ax = x - px, ay = y - py, bx = nx - x, by = ny - y;
    const cosine = (ax * bx + ay * by) / ((Math.hypot(ax, ay) || 1) * (Math.hypot(bx, by) || 1));
    return cosine < cosLimit;
  };

  const pair = (x: number, y: number): string => (
    `${round((x - originX) * scale, places)} ${round((y - originY) * scale, places)}`.replace(" -", "-")
  );
  const emit = (command: string, [x, y]: GridPoint, control?: GridPoint): void => {
    parts.push(control ? `${command}${pair(control[0], control[1])} ${pair(x, y)}`.replace(" -", "-") : `${command}${pair(x, y)}`);
  };

  const start = sharp(0) ? at(0) : pointFor(0, 1);
  emit("M", sharp(0) ? at(0) : start);
  for (let i = 1; i <= n; i++) {
    if (i === n) break;
    if (sharp(i)) emit("L", at(i));
    else {
      emit("L", pointFor(i, i - 1));
      emit("Q", pointFor(i, i + 1), at(i));
    }
  }
  if (!sharp(0)) {
    emit("L", pointFor(0, -1));
    emit("Q", start, at(0));
  }
  parts.push("Z");
  return parts.join("");
}

const hex = ([r, g, b]: Rgb): string => `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;

/**
 * Traces one part into layered `<path>` markup, back to front.
 *
 * @param part   `{ width, height, rgba }` cropped to the part, other parts masked away.
 * @param origin the part's pivot inside that crop; every coordinate is emitted relative to
 *               it, because the rig rotates each part about its own origin.
 */
export function tracePart(part: RasterPart, origin: TraceOrigin, options: TraceOptions = {}): TracedPart {
  const {
    colours = 22,
    epsilon = 0.7,
    smoothing = 0.9,
    cornerAngle = 62,
    minRegionArea = 12,
    seam = 0.5,
    // Art is traced on the atlas pixel grid and emitted at whatever size the character is
    // authored at. Simplification stays in atlas pixels, where a pixel is a pixel; only the
    // coordinates that reach the file are scaled.
    scale = 1,
    places = 2,
  } = options;

  const { palette, indices } = quantise(part, colours, minRegionArea);
  if (palette.length === 0) return { paths: [], palette: [] };

  const { width, height } = part;
  // Simplification is scaled to the size of the thing being simplified. A tolerance that
  // reads as a clean curve across a shoulder is most of an eye, so small shapes get a
  // proportionally tighter epsilon and less corner rounding, and the smallest get neither.
  const toPath = (mask: Uint8Array, area = Infinity): string => {
    const detail = Math.min(1, Math.sqrt(area) / 8);
    return traceLoops(mask, width, height)
      .map((loop) => simplifyLoop(loop, epsilon * detail))
      .filter((loop) => loop.length >= 3)
      .map((loop) => loopToPath(loop, {
        smoothing: smoothing * detail,
        cornerAngle,
        originX: origin.x,
        originY: origin.y,
        scale,
        places,
      }))
      .join("");
  };

  const areas = palette.map(() => 0);
  for (const index of indices) if (index >= 0) areas[index]++;

  // The silhouette is painted in whichever colour rings the part, so any sliver the layers
  // above fail to cover reads as outline rather than as a hole.
  const edgeVotes = new Map<number, number>();
  const silhouette = new Uint8Array(width * height);
  for (let i = 0; i < indices.length; i++) {
    if (indices[i] < 0) continue;
    silhouette[i] = 1;
    const x = i % width;
    const y = (i - x) / width;
    const exposed = x === 0 || y === 0 || x === width - 1 || y === height - 1
      || indices[i - 1] < 0 || indices[i + 1] < 0 || indices[i - width] < 0 || indices[i + width] < 0;
    if (exposed) edgeVotes.set(indices[i], (edgeVotes.get(indices[i]) ?? 0) + 1);
  }
  const rim = [...edgeVotes].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;

  const paths: TracedPath[] = [{ d: toPath(silhouette), fill: hex(palette[rim]), seam: 0 }];

  // Painted per connected blob, ordered by how deeply each is nested inside another.
  //
  // Area alone is not enough. It gets the easy case right — a two-pixel pupil lands on top
  // of the face it sits in — and the hard one wrong, because two large neighbours that
  // merely touch have no depth relationship at all, and sorting them by size paints one
  // across the other. So each blob is assigned the neighbour that encloses it, and a blob is
  // drawn after whatever contains it and before whatever it contains. Size only breaks ties
  // between blobs at the same depth, where the order does not matter anyway.
  interface Blob {
    readonly id: number;
    readonly colour: number;
    readonly members: number[];
    parent: number;
    depth: number;
  }
  const blobs: Blob[] = [];
  const owner = new Int32Array(width * height).fill(-1);
  const stack: number[] = [];
  for (let start = 0; start < indices.length; start++) {
    if (owner[start] !== -1 || indices[start] < 0) continue;
    const colour = indices[start];
    const id = blobs.length;
    const members: number[] = [];
    stack.push(start);
    owner[start] = id;
    while (stack.length) {
      const index = stack.pop()!;
      members.push(index);
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (owner[next] === -1 && indices[next] === colour) { owner[next] = id; stack.push(next); }
      }
    }
    blobs.push({ id, colour, members, parent: -1, depth: 0 });
  }

  // A blob's container is whichever neighbour holds the clear majority of its border. A blob
  // that merely abuts its neighbours — the two halves of a sleeve, say — has no majority and
  // stays at the depth of whatever contains them both.
  for (const blob of blobs) {
    const border = new Map<number, number>();
    let edge = 0;
    for (const index of blob.members) {
      const x = index % width;
      const y = (index - x) / width;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const next = ny * width + nx;
        if (owner[next] === blob.id) continue;
        edge++;
        if (owner[next] === -1) continue;
        border.set(owner[next], (border.get(owner[next]) ?? 0) + 1);
      }
    }
    const [best, share] = [...border].sort((a, b) => b[1] - a[1])[0] ?? [-1, 0];
    if (best !== -1 && share > edge * 0.7 && blobs[best].members.length > blob.members.length) blob.parent = best;
  }

  const depthOf = (blob: Blob): number => {
    let depth = 0;
    for (let node = blob; node.parent !== -1; node = blobs[node.parent]) {
      if (++depth > blobs.length) break;
    }
    return depth;
  };
  for (const blob of blobs) blob.depth = depthOf(blob);
  // Detail smaller than a few pixels always goes last, whatever the nesting says. An eye or a
  // mouth is a handful of pixels sitting on a face, and if the containment test misreads one
  // — it takes only a stray neighbour to lose the majority — the feature disappears under
  // the next large blob. Nothing that small is ever something another shape sits on top of.
  const rank = (blob: Blob): number => (blob.members.length <= DETAIL_AREA ? Number.MAX_SAFE_INTEGER : blob.depth);
  blobs.sort((a, b) => rank(a) - rank(b) || b.members.length - a.members.length || a.members[0] - b.members[0]);

  const mask = new Uint8Array(width * height);
  for (const blob of blobs) {
    mask.fill(0);
    for (const index of blob.members) mask[index] = 1;
    const d = toPath(mask, blob.members.length);
    // The seam weld is only for shapes big enough to have a seam. Dilating a three-pixel
    // pupil by a quarter of a pixel is a tenth of its width, and the neighbours it would
    // have to fight are dilating too.
    if (d) paths.push({ d, fill: hex(palette[blob.colour]), seam: blob.members.length > DETAIL_AREA ? round(seam * scale, 3) : 0 });
  }

  return { paths, palette: [...new Set(paths.map((path) => path.fill))] };
}
