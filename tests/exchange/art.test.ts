import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { boneArtSvg } from "../../pipelines/exchange/art.ts";
import { main as exportMotions } from "../../pipelines/exchange/export.ts";

const directories: string[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("figure art export", () => {
  it("adds a measurable corner and distinguishes fill-less strokes", () => {
    const source = '<svg xmlns="http://www.w3.org/2000/svg" data-bone="head"><g transform="translate(3 4) rotate(20) scale(-0.5 0.5)"><path d="M0 0L2 2" fill="none" stroke="#000"/></g><path d="M0 0L1 1" fill="#fff"/></svg>';
    const art = boneArtSvg("head", source, 7);
    expect(art.svg).toContain('id="svglab-calibration"');
    expect(art.svg).toContain('id="svglab-line-7"');
    expect(art.svg).toContain('id="svglab-part-8"');
    expect(art.svg.indexOf('id="svglab-calibration"')).toBeLessThan(art.svg.indexOf('id="svglab-line-7"'));
    expect(art.nextOrder).toBe(9);
  });

  it("exports the default figure, shipped clips and study clips as Blender inputs", () => {
    const directory = mkdtempSync(join(tmpdir(), "svglab-art-test-"));
    directories.push(directory);
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    expect(exportMotions(["--out", directory, "--json"])).toBe(0);

    expect(existsSync(join(directory, "bnrSwordCutNormal.bvh"))).toBe(true);
    expect(existsSync(join(directory, "bnrSlashStudyNormal.bvh"))).toBe(true);
    expect(existsSync(join(directory, "bnrPunchStudyNormal.bvh"))).toBe(true);
    expect(existsSync(join(directory, "setup.py"))).toBe(true);
    expect(readFileSync(join(directory, "README.md"), "utf8")).toContain("figure `barst`");

    const files = readdirSync(join(directory, "art")).sort();
    expect(files).toHaveLength(11);
    const ids = files.flatMap((file) => [
      ...readFileSync(join(directory, "art", file), "utf8").matchAll(/id="svglab-(?:part|line)-(\d+)"/g),
    ].map((match) => Number(match[1])));
    expect(ids.length).toBeGreaterThan(280);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(Array.from({ length: ids.length }, (_, index) => index));

    const head = readFileSync(join(directory, "art", "head.svg"), "utf8");
    const pelvis = readFileSync(join(directory, "art", "pelvis.svg"), "utf8");
    const torso = readFileSync(join(directory, "art", "torso.svg"), "utf8");
    expect(head).toContain('data-cosmetic="cosmetics/royal-guard/hood.svg"');
    expect(pelvis).toContain('data-cosmetic="cosmetics/royal-guard/skirt.svg"');
    expect(torso.match(/data-cosmetic="cosmetics\/royal-guard\/pauldron.svg"/g)).toHaveLength(2);
    expect(head.indexOf('data-depth="under"')).toBeLessThan(head.indexOf('data-depth="part"'));
    expect(head.indexOf('data-depth="part"')).toBeLessThan(head.indexOf('data-depth="over"'));
  });
});
