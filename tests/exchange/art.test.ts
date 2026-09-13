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
    const source = '<svg xmlns="http://www.w3.org/2000/svg" data-bone="head"><path d="M0 0L2 2" fill="none" stroke="#000"/><path d="M0 0L1 1" fill="#fff"/></svg>';
    const art = boneArtSvg("head", source, 7);
    expect(art.svg).toContain('id="svglab-calibration"');
    expect(art.svg).toContain('id="svglab-line-7"');
    expect(art.svg).toContain('id="svglab-part-8"');
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
    expect(ids).toHaveLength(280);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort((a, b) => a - b)).toEqual(Array.from({ length: ids.length }, (_, index) => index));
  });
});
