import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { characterIds, loadBuildRig, outputPath, renderParts, sidecarFor } from "../../pipelines/sprite/build.ts";
import {
  checkInvariants,
  compareFootprint,
  measureFootprint,
  readFigure,
} from "../../pipelines/guards/footprint.ts";
import type { FootprintMeasurements } from "../../pipelines/guards/footprint.ts";

const IDS = ["barst", "kiran", "yuliya"] as const;

describe("atlas-built body parts and figure manifests", () => {
  it("ships the measured per-slot trace profile on every atlas", () => {
    for (const id of IDS) {
      expect(sidecarFor(id).trace).toEqual({
        default: { colours: 3, epsilon: 3, places: 1, minRegionArea: 48 },
        bySlot: { head: { colours: 12, epsilon: 1.2, places: 1, minRegionArea: 12 } },
      });
    }
  });

  it("emits exactly one generated SVG per rig slot, with a bone id and no skeleton", () => {
    const rig = loadBuildRig();
    const expectedSlots = rig.bones.map((bone) => bone.slot).sort();
    for (const id of IDS) {
      const { files } = renderParts(id, rig);
      expect([...files.keys()].sort()).toEqual(expectedSlots);
      for (const bone of rig.bones) {
        const svg = files.get(bone.slot)!;
        expect(svg.startsWith("<!-- Generated -->\n<svg ")).toBe(true);
        expect(svg).toContain(`data-bone="${bone.name}"`);
        expect(svg).not.toMatch(/data-[xy]=|<image\b|data:image|\.png\b|NaN|Infinity|undefined/);
        expect(readFileSync(outputPath(id, bone.slot), "utf8")).toBe(svg);
      }
    }
  });

  it("runs the strip-only TypeScript pipeline under plain node and rebuilds byte-identically", () => {
    expect(() => execFileSync(process.execPath, ["pipelines/sprite/build.ts", "--check"], {
      cwd: process.cwd(),
      stdio: "pipe",
    })).not.toThrow();
  }, 60_000);

  it("gives each shipped character a complete figure manifest targeting the fighter rig", () => {
    const rig = loadBuildRig();
    for (const id of IDS) {
      const figure = readFigure(`figures/${id}.json`);
      expect(figure.rig).toBe("fighter");
      expect(Object.keys(figure.parts).sort()).toEqual(rig.bones.map((bone) => bone.slot).sort());
      expect(figure.cosmetics).toEqual([
        "cosmetics/royal-guard/hood.svg",
        "cosmetics/royal-guard/pauldron.svg",
        "cosmetics/royal-guard/skirt.svg",
      ]);
    }
  });

  it("records every part and assembled figure in the footprint ratchet", () => {
    const actual = measureFootprint();
    const baseline = JSON.parse(readFileSync("rigs/footprint.baseline.json", "utf8")) as FootprintMeasurements;
    expect(Object.keys(actual.parts)).toHaveLength((IDS.length + 1) * 11);
    expect(Object.keys(actual.cosmetics ?? {})).toHaveLength(3);
    expect(Object.keys(actual.figures)).toHaveLength(IDS.length + 1);
    expect(compareFootprint(actual, baseline)).toEqual([]);
    expect(actual.figures["figures/yuliya.json"].raw).toBe(100_132);
    expect(actual.parts["characters/yuliya/parts/head.svg"].raw).toBe(44_558);
    expect(checkInvariants()).toEqual([]);
  });

  it("fails growth but allows the ratchet to shrink", () => {
    const actual: FootprintMeasurements = {
      contract: 1,
      parts: { "characters/a/parts/head.svg": { raw: 10, gzip: 5 } },
      figures: { "figures/a.json": { raw: 10, gzip: 5 } },
    };
    expect(compareFootprint(actual, {
      contract: 1,
      parts: { "characters/a/parts/head.svg": { raw: 11, gzip: 6 } },
      figures: { "figures/a.json": { raw: 11, gzip: 6 } },
    })).toEqual([]);
    expect(compareFootprint(actual, {
      contract: 1,
      parts: { "characters/a/parts/head.svg": { raw: 9, gzip: 4 } },
      figures: { "figures/a.json": { raw: 9, gzip: 4 } },
    }).map((item) => item.kind)).toEqual(["raw", "gzip", "raw", "gzip"]);
  });

  it("discovers exactly the three shipped sheets", () => {
    expect(characterIds()).toEqual(IDS);
  });
});
