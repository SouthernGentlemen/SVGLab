/**
 * Turning cut atlas parts into SVGLab's authored skeleton.
 *
 * The rig this produces is the one `src/svg/fighter.svg` already uses, because the point of
 * the pipeline is that a traced character drops into the existing renderer and the existing
 * clips without either of them learning anything new. So: eleven bones, nested groups, a
 * `data-x`/`data-y` rest offset per bone, and SVG-native coordinates throughout — y down,
 * rotation clockwise-positive. There is no second coordinate frame here and no flip anywhere.
 *
 * Every length below is measured off the art. The handful of numbers that cannot be measured
 * — how far a shoulder sits in from the edge of a torso, how much two segments overlap so a
 * bent joint shows no seam — are `PROPORTIONS`, and they are the only authored values.
 */

/** The atlas cuts fifteen parts. SVGLab's skeleton has eleven bones; these are the eleven. */
export const BONES = [
  "pelvis", "leg-back", "shin-back", "leg-front", "shin-front",
  "torso", "arm-back", "forearm-back", "head", "arm-front", "forearm-front",
];

/**
 * Which atlas slot draws each bone.
 *
 * SVGLab has no hand or foot bones, and these atlases draw the boot onto the shin, so the
 * feet need no mapping at all. The hands do exist as separate art, and they ride the forearm
 * that ends where they begin — a hand with no bone of its own is part of the forearm, which
 * is exactly what the authored fighter says by not having one.
 */
export const SLOT_FOR = {
  pelvis: "pelvis",
  "leg-back": "leg_upper_l",
  "shin-back": "leg_lower_l",
  "leg-front": "leg_upper_r",
  "shin-front": "leg_lower_r",
  torso: "torso",
  "arm-back": "arm_upper_l",
  "forearm-back": "arm_lower_l",
  head: "head",
  "arm-front": "arm_upper_r",
  "forearm-front": "arm_lower_r",
};

/** Hand art, and the forearm it is drawn onto. */
export const HAND_FOR = { "forearm-back": "hand_l", "forearm-front": "hand_r" };

/**
 * Document order inside each bone's group, which is also paint order.
 *
 * `SELF` is where the bone's own art goes. The back limbs are written before the torso draws
 * over them and the front limbs after, which is the whole of the depth cueing: there is no
 * z-index in SVG, only the order things are written down.
 */
export const SELF = Symbol("self");
export const LAYOUT = {
  pelvis: ["leg-back", "leg-front", SELF, "torso"],
  torso: ["arm-back", SELF, "head", "arm-front"],
  "leg-back": [SELF, "shin-back"],
  "leg-front": [SELF, "shin-front"],
  "arm-back": [SELF, "forearm-back"],
  "arm-front": [SELF, "forearm-front"],
  "shin-back": [SELF],
  "shin-front": [SELF],
  "forearm-back": [SELF],
  "forearm-front": [SELF],
  head: [SELF],
};

/** Where a part's pivot sits inside its own bounding box, as a fraction of width and height. */
const PIVOTS = {
  head: [0.5, 1],
  torso: [0.5, 1],
  pelvis: [0.5, 0.5],
  arm_upper_l: [0.5, 0], arm_lower_l: [0.5, 0], hand_l: [0.5, 0.1],
  arm_upper_r: [0.5, 0], arm_lower_r: [0.5, 0], hand_r: [0.5, 0.1],
  leg_upper_l: [0.5, 0], leg_lower_l: [0.5, 0],
  leg_upper_r: [0.5, 0], leg_lower_r: [0.5, 0],
};

/** The joints an atlas cannot tell you about, as fractions so they carry across builds. */
export const PROPORTIONS = {
  /** Shoulder inset from the torso's edge, as a fraction of torso width. */
  shoulderInset: 0.16,
  /** Shoulder drop below the top of the torso, as a fraction of torso height. */
  shoulderDrop: 0.17,
  /** Hip separation from centre, as a fraction of pelvis width. */
  hipSpread: 0.21,
  /** How far the head's pivot sinks into the torso, as a fraction of head height. */
  neckSink: 0.1,
  /** How far the torso's pivot sinks into the pelvis, as a fraction of pelvis height. */
  waistSink: 0.22,
  /** Overlap at elbow, wrist and knee, as a fraction of the parent segment. */
  jointOverlap: 0.14,
};

const round = (n) => Math.round(n * 1000) / 1000;

/** The pivot of a part inside its own crop, in atlas pixels. `override` is a [x, y] fraction. */
export function partPivot(slot, island, override) {
  const [fx, fy] = override ?? PIVOTS[slot] ?? [0.5, 0];
  return { x: island.w * fx, y: island.h * fy };
}

/**
 * Measures the skeleton.
 *
 * @returns `{ rest, height, scale }` — `rest` is the `data-x`/`data-y` per bone in SVG
 *   coordinates at the authored fighter's scale, `height` the standing height in atlas
 *   pixels, `scale` what the art has to be multiplied by to stand `targetHeight` tall.
 */
export function measureSkeleton(slots, tuning = {}, targetHeight = 104) {
  const p = { ...PROPORTIONS, ...tuning };
  const size = (slot) => {
    const island = slots.get(slot);
    if (!island) throw new Error(`the skeleton needs the ${slot} slot`);
    return island;
  };

  const torso = size("torso");
  const pelvis = size("pelvis");
  const head = size("head");
  const reach = (slot) => size(slot).h * (1 - p.jointOverlap);

  // Both feet have to reach the ground, and the two legs are never quite the same length —
  // the back limb is drawn a little shorter, which is how the art carries depth. The hips
  // therefore sit at the shorter leg's reach and the longer leg absorbs the difference by
  // overlapping its own knee further. Taking the taller leg instead leaves the other foot
  // hanging in the air, and no pose can fix a skeleton that floats.
  const legLength = (side) => size(`leg_upper_${side}`).h + size(`leg_lower_${side}`).h;
  const hipHeight = Math.min(legLength("l"), legLength("r")) * (1 - p.jointOverlap);
  const knee = (side) => size(`leg_upper_${side}`).h * (hipHeight / legLength(side));

  const shoulderY = torso.h * (1 - p.shoulderDrop);
  const shoulderX = torso.w * (0.5 - p.shoulderInset);
  const hipX = pelvis.w * p.hipSpread;
  const height = hipHeight + pelvis.h * (0.5 - p.waistSink) + torso.h + head.h * (1 - p.neckSink);
  const scale = targetHeight / height;

  // Written in SVG coordinates from here on: up is negative, and a limb hanging from its
  // parent is a positive y offset.
  const rest = {
    pelvis: { x: 0, y: -hipHeight },
    "leg-back": { x: -hipX, y: 0 },
    "shin-back": { x: 0, y: knee("l") },
    "leg-front": { x: hipX, y: 0 },
    "shin-front": { x: 0, y: knee("r") },
    torso: { x: 0, y: -pelvis.h * (0.5 - p.waistSink) },
    "arm-back": { x: -shoulderX, y: -shoulderY },
    "forearm-back": { x: 0, y: reach("arm_upper_l") },
    head: { x: 0, y: -(torso.h - head.h * p.neckSink) },
    "arm-front": { x: shoulderX, y: -shoulderY },
    "forearm-front": { x: 0, y: reach("arm_upper_r") },
  };

  /** Where the hand art hangs off its forearm, in the forearm's own frame. */
  const wrist = {
    "forearm-back": { x: 0, y: reach("arm_lower_l") },
    "forearm-front": { x: 0, y: reach("arm_lower_r") },
  };

  const scaled = (point) => ({ x: round(point.x * scale), y: round(point.y * scale) });
  return {
    rest: Object.fromEntries(Object.entries(rest).map(([bone, point]) => [bone, scaled(point)])),
    wrist: Object.fromEntries(Object.entries(wrist).map(([bone, point]) => [bone, scaled(point)])),
    height: round(height),
    scale: Math.round(scale * 10000) / 10000,
  };
}
