/**
 * Clip arithmetic shared by every motion script.
 *
 * `src/animation/sample.ts` is what the lab plays, so a script that writes a clip out for an
 * external tool has to interpolate the same way or the tool shows something the lab never
 * renders. `samplePose` mirrors it, and a test samples every shipped clip through both.
 */

export const round = (value) => Math.round(value * 1000) / 1000;

export const PROPERTIES = ["x", "y", "rotation"];

/** Douglas-Peucker over one channel: keep only the samples a linear reading would miss. */
export function simplify(values, tolerance) {
  const keep = new Set([0, values.length - 1]);
  const visit = (start, end) => {
    if (end - start < 2) return;
    let largestError = -1;
    let largestIndex = -1;
    for (let index = start + 1; index < end; index += 1) {
      const progress = (index - start) / (end - start);
      const interpolated = values[start] + (values[end] - values[start]) * progress;
      const error = Math.abs(values[index] - interpolated);
      if (error > largestError) {
        largestError = error;
        largestIndex = index;
      }
    }
    if (largestError > tolerance) {
      keep.add(largestIndex);
      visit(start, largestIndex);
      visit(largestIndex, end);
    }
  };
  visit(0, values.length - 1);
  return [...keep].sort((a, b) => a - b);
}

function clipFrame(clip, frame) {
  if (clip.duration <= 0) return 0;
  if (clip.loop) return ((frame % clip.duration) + clip.duration) % clip.duration;
  return Math.max(0, Math.min(frame, clip.duration));
}

/** Sparse per-property linear interpolation, matching src/animation/sample.ts. */
export function samplePose(clip, frame) {
  const at = clipFrame(clip, frame);
  const bones = new Set();
  for (const keyframe of clip.keyframes) for (const bone of Object.keys(keyframe.bones)) bones.add(bone);
  const pose = {};

  for (const boneName of bones) {
    const bone = {};
    for (const property of PROPERTIES) {
      let beforeFrame = 0;
      let beforeValue = 0;
      let afterFrame = -1;
      let afterValue = 0;
      for (const keyframe of clip.keyframes) {
        const value = keyframe.bones[boneName]?.[property];
        if (value === undefined) continue;
        if (keyframe.frame <= at && keyframe.frame >= beforeFrame) {
          beforeFrame = keyframe.frame;
          beforeValue = value;
        } else if (keyframe.frame > at && (afterFrame < 0 || keyframe.frame < afterFrame)) {
          afterFrame = keyframe.frame;
          afterValue = value;
        }
      }
      if (afterFrame < 0 || afterFrame === beforeFrame) bone[property] = beforeValue;
      else bone[property] = beforeValue + (afterValue - beforeValue) * ((at - beforeFrame) / (afterFrame - beforeFrame));
    }
    pose[boneName] = bone;
  }
  return pose;
}

/**
 * Turns dense per-frame channels back into the sparse keyframes the lab ships.
 *
 * `channels` is `{ [bone]: { [property]: number[] } }` with one value per frame. Channels that
 * never move keep their first sample only, so a clip that touches four bones stays a clip that
 * touches four bones after a round trip through a tool that writes every bone every frame.
 */
export function keyframesFromChannels(channels, tolerances) {
  const byFrame = new Map();
  const put = (frame, bone, property, value) => {
    const keyframe = byFrame.get(frame) ?? { frame, bones: {} };
    keyframe.bones[bone] = { ...keyframe.bones[bone], [property]: round(value) };
    byFrame.set(frame, keyframe);
  };

  for (const [bone, properties] of Object.entries(channels)) {
    for (const [property, values] of Object.entries(properties)) {
      const tolerance = property === "rotation" ? tolerances.angleTolerance : tolerances.positionTolerance;
      const span = Math.max(...values) - Math.min(...values);
      if (span <= tolerance) {
        if (values.some((value) => round(value) !== 0)) put(0, bone, property, values[0]);
        continue;
      }
      for (const index of simplify(values, tolerance)) put(index, bone, property, values[index]);
    }
  }

  return [...byFrame.values()].sort((a, b) => a.frame - b.frame);
}
