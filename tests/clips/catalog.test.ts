import { copyFileSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { buildCatalog, validateAuthoredClip } from "../../pipelines/motion/catalog.ts";

const loop = {
  key: "labProbe",
  derivedFrom: null,
  loop: true,
  duration: 2,
  easing: "linear",
  note: "Authored validation probe.",
  keyframes: [
    { frame: 0, bones: { torso: { rotation: 1 } } },
    { frame: 2, bones: { torso: { rotation: 1 } } },
  ],
} as const;

describe("authored clip lane", () => {
  it("validates provenance, bone names, frame order and loop seams", () => {
    const catalog = buildCatalog(process.cwd());
    expect(validateAuthoredClip(loop, { rig: catalog.rig })).toEqual(loop);
    expect(() => validateAuthoredClip({ ...loop, key: "bnrProbe", derivedFrom: null }))
      .toThrow("a bnr* clip must name the clip it was derived from");
    expect(() => validateAuthoredClip({ ...loop, keyframes: [
      { frame: 0, bones: { unknown: { rotation: 1 } } },
      { frame: 2, bones: { unknown: { rotation: 1 } } },
    ] }, { rig: catalog.rig })).toThrow("poses unknown bone 'unknown'");
    expect(() => validateAuthoredClip({ ...loop, keyframes: [...loop.keyframes].reverse() }))
      .toThrow("out of order");
    expect(() => validateAuthoredClip({ ...loop, keyframes: [
      loop.keyframes[0],
      { frame: 2, bones: { torso: { rotation: 2 } } },
    ] })).toThrow("loop seam does not close");
  });

  it("lets authored source override a shipped key without replacing its derivation", () => {
    const root = mkdtempSync(join(tmpdir(), "svglab-m2-"));
    try {
      mkdirSync(join(root, "motions", "authored"), { recursive: true });
      copyFileSync("motions/bandai-namco-motiondataset-1.json", join(root, "motions", "bandai-namco-motiondataset-1.json"));
      symlinkSync(join(process.cwd(), "rigs"), join(root, "rigs"), "dir");
      symlinkSync(join(process.cwd(), "third_party"), join(root, "third_party"), "dir");
      writeFileSync(join(root, "motions", "authored", "bnrIdleNormal.json"), JSON.stringify({
        key: "bnrIdleNormal",
        derivedFrom: "bnrIdleNormal",
        loop: true,
        duration: 60,
        easing: "linear",
        note: "Authored override probe.",
        keyframes: [
          { frame: 0, bones: { torso: { rotation: 1 } } },
          { frame: 60, bones: { torso: { rotation: 1 } } },
        ],
      }));

      const catalog = buildCatalog(root);
      expect(catalog.bandaiNamco.bnrIdleNormal.note).not.toBe("Authored override probe.");
      expect(catalog.clips.bnrIdleNormal.note).toBe("Authored override probe.");
      expect(catalog.origins.bnrIdleNormal).toBe("bnrIdleNormal");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
