import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { assemblyPaintOrder, inspectPart, validateFigure } from "../../src/render/assemble.ts";
import { validateRig } from "../../src/rig/contract.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("fetched figure assembly", () => {
  const rig = validateRig(JSON.parse(readFileSync(join(ROOT, "rigs", "fighter.rig.json"), "utf8")));

  it("derives the exact paint order from the rig document order", () => {
    expect(assemblyPaintOrder(rig)).toEqual(rig.contract.paintOrder);
  });

  it("keeps the restored reference fighter in eleven independently fetched parts", () => {
    const figure = validateFigure(JSON.parse(readFileSync(join(ROOT, "figures", "fighter.json"), "utf8")), "fighter");
    expect(Object.keys(figure.parts)).toHaveLength(11);
    for (const bone of rig.bones) {
      const reference = figure.parts[bone.slot];
      const source = readFileSync(join(ROOT, reference), "utf8");
      expect(() => inspectPart(source, bone.name, reference)).not.toThrow();
      expect(source).not.toMatch(/\bdata-[xy]=/);
    }
  });

  it("rejects a part that tries to carry its own rest offset", () => {
    expect(() => inspectPart('<svg data-bone="head" data-x="2"><path/></svg>', "head", "bad.svg"))
      .toThrow(/offsets belong only to the rig/);
  });
});
