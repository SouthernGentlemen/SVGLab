import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { readCatalog } from "../../pipelines/motion/generate.ts";
import { AUTHORED_CLIPS, AUTHORED_ORIGINS } from "../../src/clips/generated/authored.ts";
import { BANDAI_NAMCO_CLIPS } from "../../src/clips/generated/bandai-namco.ts";

/**
 * What Boneyard's clips weigh, how they were retargeted and whether they round trip is
 * Boneyard's business and Boneyard's test suite. This asserts the one thing that is this lab's:
 * that the modules it compiles are the catalog it was handed, unaltered.
 */
describe("generated clip modules", () => {
  const catalog = readCatalog();
  const lane = (wanted: string): string[] =>
    Object.keys(catalog.clips).filter((key) => catalog.lanes[key] === wanted);

  it("rebuilds byte-identically from the catalog under plain node", () => {
    expect(() => execFileSync(process.execPath, ["pipelines/motion/generate.ts", "--check"], {
      cwd: process.cwd(),
      stdio: "pipe",
    })).not.toThrow();
  }, 30_000);

  it("bakes each lane into its own module and invents nothing", () => {
    expect(Object.keys(BANDAI_NAMCO_CLIPS)).toEqual(lane("shipped"));
    expect(Object.keys(AUTHORED_CLIPS)).toEqual(lane("authored"));
    for (const [key, clip] of Object.entries({ ...BANDAI_NAMCO_CLIPS, ...AUTHORED_CLIPS })) {
      expect(clip, key).toEqual(catalog.clips[key]);
    }
    expect(AUTHORED_ORIGINS).toEqual(
      Object.fromEntries(lane("authored").map((key) => [key, catalog.origins[key] ?? null])),
    );
  });

  it("keeps study clips out of the shell, where they cost 97% of the catalog", () => {
    const source = readFileSync("src/clips/generated/bandai-namco.ts", "utf8");
    for (const key of ["bnrSlashStudyNormal", "bnrPunchStudyNormal"]) {
      expect(key in BANDAI_NAMCO_CLIPS).toBe(false);
      expect(source).not.toContain(key);
    }
  });

  it("holds the contact poses the kernel's active windows were bound to", () => {
    expect(BANDAI_NAMCO_CLIPS.bnrStrikeNormal.keyframes.find((frame) => frame.frame === 6)?.bones["arm-front"]?.rotation)
      .toBe(-84.8);
    expect(BANDAI_NAMCO_CLIPS.bnrSwordSlashNormal.keyframes.find((frame) => frame.frame === 15)?.bones["arm-front"]?.rotation)
      .toBe(-51.2);
  });

  it("names the licence that follows the adapted clips into this repository", () => {
    const license = readFileSync("LICENSE.md", "utf8");
    expect(license).toContain("Creative Commons Attribution-NonCommercial 4.0 International");
    expect(license).toContain("https://creativecommons.org/licenses/by-nc/4.0/legalcode");
    expect(license).toContain("74ead3ba1ae4696404e6086233779f60de8bf9ef");
    expect(license).toContain("src/clips/generated/bandai-namco.ts");
  });
});
