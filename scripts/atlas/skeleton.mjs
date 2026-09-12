/**
 * Turning cut atlas parts into SVGLab's authored skeleton.
 *
 * The rig this produces is the one `src/svg/fighter.svg` already uses, because the point of
 * the pipeline is that a traced character drops into the existing renderer and the existing
 * clips without either of them learning anything new. So: eleven bones, nested groups, a
 * `data-x`/`data-y` rest offset per bone, and SVG-native coordinates throughout — y down,
 * rotation clockwise-positive. There is no second coordinate frame here and no flip anywhere.
 *
 * Every skin uses one canonical set of joints. Atlas art is fitted to those joints instead of
 * moving the joints to suit each drawing: that is what makes a clip read as the same movement
 * on every fighter. The target art heights keep elbows, knees, neck and waist overlapped while
 * preserving each drawing's width and silhouette.
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
 * `SELF` is where the bone's own art goes. The default order is the right-facing depth order:
 * source-left/front-named limbs behind their source-right/back-named partners, the far arm
 * behind the body, the near arm in front, then the head above both. `rig.ts` reverses the two
 * anatomical sides when the fighter faces left.
 * There is no z-index in SVG, only the order things are written down.
 */
export const SELF = Symbol("self");
export const LAYOUT = {
  pelvis: ["leg-front", "leg-back", SELF, "torso"],
  torso: ["arm-front", SELF, "arm-back", "head"],
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
  // A face pivots around the neck, not the bottom of its hair crop. Keeping a little art
  // below the pivot lets the head overlap the collar through turns and mirrored poses.
  head: [0.5, 0.72],
  torso: [0.5, 1],
  pelvis: [0.5, 0.5],
  arm_upper_l: [0.5, 0], arm_lower_l: [0.5, 0], hand_l: [0.5, 0.1],
  arm_upper_r: [0.5, 0], arm_lower_r: [0.5, 0], hand_r: [0.5, 0.1],
  leg_upper_l: [0.5, 0], leg_lower_l: [0.5, 0],
  leg_upper_r: [0.5, 0], leg_lower_r: [0.5, 0],
};

/**
 * The shared eleven-joint rest pose, in the same 104-unit frame as `src/svg/fighter.svg`.
 * This is intentionally literal and readable: animations, debug bones and every skin agree
 * on these exact pivots instead of merely agreeing on their names.
 */
export const CANONICAL_REST = {
  pelvis: { x: 0, y: -42 },
  "leg-back": { x: -6, y: 0 },
  "shin-back": { x: 0, y: 22 },
  "leg-front": { x: 6, y: 0 },
  "shin-front": { x: 0, y: 22 },
  torso: { x: 0, y: -6 },
  "arm-back": { x: -11, y: -22 },
  "forearm-back": { x: 0, y: 21 },
  head: { x: 0, y: -31 },
  "arm-front": { x: 11, y: -22 },
  "forearm-front": { x: 0, y: 21 },
};

/** Display height for each cut atlas part. Width keeps the source aspect ratio. */
export const CANONICAL_ART_HEIGHT = {
  head: 36,
  torso: 28,
  pelvis: 16,
  arm_upper_l: 24, arm_lower_l: 20, hand_l: 10,
  arm_upper_r: 24, arm_lower_r: 20, hand_r: 10,
  leg_upper_l: 25, leg_lower_l: 20,
  leg_upper_r: 25, leg_lower_r: 20,
};

/** Hands overlap the end of the 20-unit forearm art by two units. */
export const CANONICAL_WRIST = {
  "forearm-back": { x: 0, y: 18 },
  "forearm-front": { x: 0, y: 18 },
};

const round = (n) => Math.round(n * 1000) / 1000;

/** The pivot of a part inside its own crop, in atlas pixels. `override` is a [x, y] fraction. */
export function partPivot(slot, island, override) {
  const [fx, fy] = override ?? PIVOTS[slot] ?? [0.5, 0];
  return { x: island.w * fx, y: island.h * fy };
}

/** Fit an atlas to the shared rig while retaining each part's source aspect ratio. */
export function measureSkeleton(slots) {
  const size = (slot) => {
    const island = slots.get(slot);
    if (!island) throw new Error(`the skeleton needs the ${slot} slot`);
    return island;
  };

  const scales = {};
  for (const [slot, targetHeight] of Object.entries(CANONICAL_ART_HEIGHT)) {
    scales[slot] = round(targetHeight / size(slot).h);
  }

  const copyPoints = (points) => Object.fromEntries(Object.entries(points)
    .map(([bone, point]) => [bone, { ...point }]));
  return {
    rest: copyPoints(CANONICAL_REST),
    wrist: copyPoints(CANONICAL_WRIST),
    scales,
    height: 104,
  };
}
