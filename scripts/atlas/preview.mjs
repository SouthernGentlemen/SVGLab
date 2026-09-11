/**
 * A posed preview of an authored character, for looking at during authoring.
 *
 * An authored SVG carries `data-x`/`data-y` and no transforms — `src/svg/rig.ts` turns those
 * into transforms when it builds the fighter — so opening one in a browser stacks every bone
 * on the origin. That is fine for the engine and useless for judging whether a shoulder
 * landed in the right place, which is what an atlas sidecar is actually tuned against.
 *
 * The transform below is the same expression as `rig.ts`, deliberately duplicated rather than
 * imported: that module is TypeScript compiled by Vite and this is a plain build script. The
 * two agreeing is asserted in `tests/characters.test.ts`, so the duplication cannot rot.
 */

const number = (n) => (Math.round(n * 1000) / 1000).toString();

function transform(rest, pose = {}) {
  const x = rest.x + (pose.x ?? 0);
  const y = rest.y + (pose.y ?? 0);
  return `translate(${number(x)} ${number(y)}) rotate(${number(pose.rotation ?? 0)})`;
}

/** Rewrites an authored character's `data-bone` groups with the transforms `rig.ts` would set. */
export function poseCharacterSvg(svg, pose = {}) {
  return svg.replace(/<g data-bone="([a-z-]+)" data-x="(-?[\d.]+)" data-y="(-?[\d.]+)">/g,
    (_, bone, x, y) => `<g data-bone="${bone}" transform="${transform({ x: Number(x), y: Number(y) }, pose[bone])}">`);
}
