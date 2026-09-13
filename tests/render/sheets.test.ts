import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { checkLocalOnly } from "../../pipelines/guards/local-only.ts";
import { buildCatalog } from "../../pipelines/motion/catalog.ts";
import { generatedSchemas } from "../../pipelines/render/schemas.ts";
import { loadFigure, renderSheet, sampleTicks } from "../../pipelines/render/sheet.ts";
import { visualPaintOrder } from "../../pipelines/render/depth.ts";
import { depthProfileName } from "../../src/render/place.ts";
import { sampleClip } from "../../src/rig/sample.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("agent review sheets", () => {
  it("samples a requested range evenly, including both endpoints", () => {
    expect(sampleTicks(3, 21, 6)).toEqual([3, 7, 10, 14, 17, 21]);
    expect(sampleTicks(4, 5, 12)).toEqual([4, 5]);
  });

  it("renders one world-space group per bone without a DOM", () => {
    const catalog = buildCatalog(ROOT);
    const figure = loadFigure(ROOT, "yuliya");
    const clip = catalog.clips.labWave;
    const profile = depthProfileName(figure.rig, "labWave", null);
    const source = renderSheet(figure, "probe", "two ticks", 2, [
      { label: "tick 0", pose: sampleClip(clip, 0), profile },
      { label: "tick 16", pose: sampleClip(clip, 16), profile },
    ]);

    expect(source.match(/data-bone=/g)).toHaveLength(figure.rig.bones.length * 2);
    expect(source.match(/data-cosmetic=/g)).toHaveLength(figure.cosmetics.reduce(
      (sum, cosmetic) => sum + cosmetic.placements.length, 0,
    ) * 2);
    expect(source).toContain('data-bone="arm-front" transform="translate(10.226 -70.37) rotate(-117)"');
    expect(source).not.toContain("<image");
  });

  it("flattens every depth profile to each bone exactly once", () => {
    const figure = loadFigure(ROOT, "fighter");
    for (const profile of Object.keys(figure.rig.contract.depthProfiles.profiles)) {
      const order = visualPaintOrder(figure.rig, 1, profile);
      expect(order).toHaveLength(figure.rig.bones.length);
      expect(new Set(order).size).toBe(figure.rig.bones.length);
    }
  });

  it("keeps committed schemas byte-identical to validator-derived output", () => {
    for (const [path, expected] of Object.entries(generatedSchemas(ROOT))) {
      expect(readFileSync(join(ROOT, path), "utf8"), path).toBe(expected);
    }
  });

  it("offers the local-only guard as a machine-readable report", () => {
    expect(checkLocalOnly(ROOT)).toMatchObject({ ok: true, forbiddenScripts: [], forbiddenConfigKeys: [] });
    const output = execFileSync(process.execPath, [join(ROOT, "pipelines", "guards", "local-only.ts"), "--json"], {
      cwd: ROOT,
      encoding: "utf8",
    });
    expect(JSON.parse(output)).toMatchObject({ ok: true, deploymentWorkflows: [] });
  });
});
