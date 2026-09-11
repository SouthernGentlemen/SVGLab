import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = readFileSync(join(root, "src", "app", "skeleton-debug.ts"), "utf8");
const html = readFileSync(join(root, "preview.html"), "utf8");

describe("skeleton debug overlay", () => {
  it("stays presentation-only and derives the skeleton from the authored bone tree", () => {
    expect(source).not.toMatch(/from ["'][^"']*combat/);
    expect(source).not.toMatch(/\bCombatSimulation\b/);
    expect(source).toMatch(/querySelectorAll<SVGGElement>\(\"\[data-bone\]\"\)/);
    expect(source).toMatch(/parentBone\(child, fighter\)/);
    expect(source).toMatch(/fighter\.appendChild\(overlay\)/);
    expect(source).toMatch(/getCTM\(\)/);
  });

  it("exposes an independent preview toggle without hardcoding the fighter skeleton", () => {
    expect(html).toContain('id="show-skeleton"');
    expect(html).toContain('/src/app/skeleton-debug.ts');
    expect(html).toContain('<kbd>K</kbd> skeleton');

    for (const bone of ["pelvis", "torso", "head", "arm-front", "forearm-front", "leg-front", "shin-front"]) {
      expect(source, `skeleton debug hardcodes ${bone}`).not.toContain(`\"${bone}\"`);
    }
  });
});
