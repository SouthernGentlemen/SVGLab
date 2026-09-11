import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { CLIPS } from "../src/animation/clips";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const IDS = ["barst", "kiran", "yuliya"] as const;

const authored = readFileSync(join(root, "src", "svg", "fighter.svg"), "utf8");
const traced = (id: string) => readFileSync(join(root, "src", "svg", "characters", `${id}.svg`), "utf8");

/**
 * The bone tree of an authored fighter, as `bone -> parent`.
 *
 * Regex rather than a DOM because this suite runs in plain node, and a scan is enough: the
 * documents are generated or hand-written to one shape, and anything that is not that shape
 * should fail here rather than be parsed around.
 */
function boneTree(svg: string): Map<string, string | null> {
  const tree = new Map<string, string | null>();
  // Groups that are not bones — the model wrapper, a costume piece, a hand — occupy a level
  // without being anyone's parent, so they go on the stack as null and are skipped when
  // looking upward for a parent.
  const stack: (string | null)[] = [];
  for (const token of svg.matchAll(/<g data-bone="([a-z-]+)"|<\/g>|<g /g)) {
    if (token[1]) {
      tree.set(token[1], [...stack].reverse().find((entry) => entry !== null) ?? null);
      stack.push(token[1]);
    } else if (token[0] === "</g>") {
      stack.pop();
    } else {
      stack.push(null);
    }
  }
  return tree;
}

describe("atlas-built characters", () => {
  const reference = boneTree(authored);

  it("the authored fighter still has the skeleton everything else is measured against", () => {
    expect(reference.get("pelvis")).toBe(null);
    expect([...reference.keys()].sort()).toEqual([
      "arm-back", "arm-front", "forearm-back", "forearm-front", "head",
      "leg-back", "leg-front", "pelvis", "shin-back", "shin-front", "torso",
    ]);
  });

  it.each(IDS)("%s has the same bone tree as the authored fighter", (id) => {
    // Not merely the same bone names: the same parents. A forearm that ends up under the
    // torso instead of under its arm still renders, and then swings from the wrong joint.
    expect(boneTree(traced(id))).toEqual(reference);
  });

  it.each(IDS)("%s is a document the rig can read", (id) => {
    const svg = traced(id);
    expect(svg).toMatch(/<g data-model="fighter">/);
    expect(svg.match(/<g /g)?.length).toBe(svg.match(/<\/g>/g)?.length);
    // data-x/data-y are what rig.ts turns into transforms; a bone without them silently
    // collapses onto its parent's origin.
    for (const bone of reference.keys()) {
      expect(svg, `${id} is missing a rest offset for ${bone}`)
        .toMatch(new RegExp(`<g data-bone="${bone}" data-x="-?[\\d.]+" data-y="-?[\\d.]+">`));
    }
    expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  });

  it.each(IDS)("%s can be posed by every authored clip", (id) => {
    const bones = boneTree(traced(id));
    for (const clip of Object.values(CLIPS)) {
      for (const keyframe of clip.keyframes) {
        for (const bone of Object.keys(keyframe.bones)) {
          expect(bones.has(bone), `${id} has no ${bone} for clip ${clip.name}`).toBe(true);
        }
      }
    }
  });

  it.each(IDS)("%s stands on the ground with its head under the ceiling", (id) => {
    const svg = traced(id);
    const viewBox = svg.match(/viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/);
    expect(viewBox).not.toBeNull();
    const [, , top, , height] = viewBox!.map(Number);
    const pelvis = Number(svg.match(/<g data-bone="pelvis" data-x="-?[\d.]+" data-y="(-?[\d.]+)"/)![1]);
    // The pelvis hangs above the floor line at y = 0, and well inside the frame. A pelvis at
    // the wrong height means the legs were measured wrong, which no pose recovers from.
    expect(pelvis).toBeLessThan(0);
    expect(pelvis).toBeGreaterThan(top);
    expect(Math.abs(pelvis)).toBeLessThan(height);
  });

  // The generated SVGs are only trustworthy while they still match the atlas they came from.
  // A stale file drifts silently until a character quietly changes shape, so the build's own
  // check is part of verification rather than a chore someone remembers to run.
  it("every checked-in character matches a fresh build of its atlas", () => {
    expect(() => execFileSync(process.execPath, ["scripts/build-characters.mjs", "--check"], {
      cwd: root,
      stdio: "pipe",
    })).not.toThrow();
  }, 60_000);
});
