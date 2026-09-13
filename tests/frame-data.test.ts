import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { CLIPS } from "../src/clips/index.ts";
import { BASIC_STRIKE, SWORD_SLASH } from "../src/kernel/content.ts";

interface ManifestClip {
  key: string;
  contactTargetFrame?: number;
}

interface MotionManifest {
  clips: ManifestClip[];
}

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(
  readFileSync(join(root, "motions", "bandai-namco-motiondataset-1.json"), "utf8"),
) as MotionManifest;

describe("move frame data and animation clips", () => {
  it("keeps each clip's contact tick inside its move's active window", () => {
    for (const move of [BASIC_STRIKE, SWORD_SLASH]) {
      expect(CLIPS, `${move.id} names missing clip ${move.animation}`).toHaveProperty(move.animation);

      const clip = manifest.clips.find(({ key }) => key === move.animation);
      expect(clip, `${move.id} has no motion manifest entry`).toBeDefined();
      expect(clip?.contactTargetFrame, `${move.animation} has no contactTargetFrame`).toEqual(expect.any(Number));
      expect(clip!.contactTargetFrame!).toBeGreaterThanOrEqual(move.startup);
      expect(clip!.contactTargetFrame!).toBeLessThan(move.startup + move.active);
    }
  });
});
