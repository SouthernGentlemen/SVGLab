/**
 * Cutting a character atlas into named rig parts.
 *
 * The atlases are authored to a fixed layout: every part is an isolated island of opaque
 * pixels, and the islands sit in horizontal bands whose reading order is the same for
 * every character. That makes slot assignment a matter of finding the islands and sorting
 * them, with no per-character table to maintain — which is the whole point of the
 * pipeline. `assignSlots` fails loudly when a band does not hold what the layout promises,
 * because a silently mis-assigned limb is far more expensive to notice later.
 */

/** y of the band boundaries, in atlas pixels. Bands below the last one are costume props. */
const BAND_EDGES = [128, 224, 292];

/** Band 1, left to right. Two segments per limb, far limb before near limb. */
const LIMB_SLOTS = [
  "arm_upper_l", "arm_lower_l", "arm_upper_r", "arm_lower_r",
  "leg_upper_l", "leg_lower_l", "leg_upper_r", "leg_lower_r",
];

/** Band 2, left to right. Beyond the first pair the atlas carries unposed alternates. */
const HAND_SLOTS = ["hand_l", "hand_r", "hand_l_alt", "hand_r_alt", "hand_l_alt2", "hand_r_alt2"];

const ALPHA_FLOOR = 8;
const MIN_AREA = 40;

/** Eight-connected islands of opaque pixels, as bounding boxes plus a membership mask. */
export function findIslands({ width, height, data }) {
  const labels = new Int32Array(width * height).fill(-1);
  const islands = [];
  const queue = new Int32Array(width * height);

  for (let start = 0; start < width * height; start++) {
    if (labels[start] !== -1 || data[start * 4 + 3] <= ALPHA_FLOOR) continue;
    const id = islands.length;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = id;
    let minX = width, minY = height, maxX = -1, maxY = -1, area = 0;

    while (head < tail) {
      const index = queue[head++];
      const x = index % width;
      const y = (index - x) / width;
      area++;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (labels[next] !== -1 || data[next * 4 + 3] <= ALPHA_FLOOR) continue;
          labels[next] = id;
          queue[tail++] = next;
        }
      }
    }
    islands.push({ id, x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area });
  }

  return { labels, islands: islands.filter((island) => island.area >= MIN_AREA) };
}

function band(island) {
  const centreY = island.y + island.h / 2;
  return BAND_EDGES.findIndex((edge) => centreY < edge);
}

const byX = (a, b) => (a.x + a.w / 2) - (b.x + b.w / 2);

/**
 * Names every island the rig can use.
 *
 * @returns {Map<string, object>} slot name to island. Costume islands below the hand band
 *   are named `prop_NN` in reading order; the rig ignores them and the model keeps them so
 *   a character can grow a cape without re-cutting the atlas.
 */
export function assignSlots(islands, { source }) {
  const bands = [[], [], [], []];
  for (const island of islands) {
    const index = band(island);
    bands[index === -1 ? 3 : index].push(island);
  }

  const slots = new Map();
  const fail = (message) => { throw new Error(`${source}: ${message}`); };

  // Band 0 — three expressions, then the torso and the hips stacked in the last column.
  const head = [...bands[0]].sort((a, b) => b.area - a.area).slice(0, 3).sort(byX);
  if (head.length !== 3) fail(`expected 3 face islands in the head band, found ${head.length}`);
  const body = bands[0].filter((island) => !head.includes(island)).sort((a, b) => a.y - b.y);
  if (body.length < 2) fail(`expected a torso and a hips island beside the faces, found ${body.length}`);
  slots.set("head", head[0]);
  slots.set("head_alt", head[1]);
  slots.set("head_alt2", head[2]);
  slots.set("torso", body[0]);
  slots.set("pelvis", body[1]);

  // Band 1 — the eight limb segments, far limb before near limb within each pair.
  const limbs = [...bands[1]].sort(byX);
  if (limbs.length !== LIMB_SLOTS.length) {
    fail(`expected ${LIMB_SLOTS.length} limb islands, found ${limbs.length}`);
  }
  LIMB_SLOTS.forEach((name, index) => slots.set(name, limbs[index]));

  // Band 2 — hands. The band can also catch a duplicated hips, which sits far right.
  const hands = bands[2].filter((island) => island.x + island.w / 2 < 384).sort(byX);
  if (hands.length < 2) fail(`expected at least 2 hand islands, found ${hands.length}`);
  hands.slice(0, HAND_SLOTS.length).forEach((island, index) => slots.set(HAND_SLOTS[index], island));

  bands[3]
    .sort((a, b) => a.y - b.y || byX(a, b))
    .forEach((island, index) => slots.set(`prop_${String(index + 1).padStart(2, "0")}`, island));

  return slots;
}
