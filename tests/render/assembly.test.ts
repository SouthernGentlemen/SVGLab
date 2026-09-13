import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { assembleFigureBones, loadFigure, renderSheet } from "../../pipelines/render/sheet.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

describe("headless figure assembly", () => {
  it("places every part and cosmetic by the rig contract, including hidden art", () => {
    const figureIds = readdirSync(`${ROOT}/figures`).filter((name) => name.endsWith(".json")).sort();
    const hiddenSlots = new Set<string>();

    for (const figureId of figureIds) {
      const figure = loadFigure(ROOT, `figures/${figureId}`);
      const assembly = assembleFigureBones(figure);
      const source = renderSheet(figure, "assembly probe", figureId, 1, [{
        label: figureId,
        pose: {},
        profile: figure.rig.contract.depthProfiles.default,
      }]);

      expect(source.match(/<g data-bone=/g)).toHaveLength(figure.rig.bones.length);
      expect([...assembly.keys()]).toEqual(figure.rig.bones.map((bone) => bone.name));

      for (const cosmetic of figure.cosmetics) {
        const kind = figure.rig.contract.wardrobe.kinds[cosmetic.piece.kind];
        const anchor = cosmetic.piece.anchor ?? kind.anchor;
        const mirror = cosmetic.piece.mirror === false ? undefined
          : typeof cosmetic.piece.mirror === "string" ? cosmetic.piece.mirror
          : kind.mirror;
        const expected = [anchor, ...(mirror ? [mirror] : [])].map((name) => ({
          anchor: name,
          bone: name.slice(0, name.indexOf(".")),
          layer: cosmetic.piece.layer ?? kind.layer,
        }));
        expect(cosmetic.placements.map(({ anchor: name, bone, layer }) => ({ anchor: name, bone, layer }))).toEqual(expected);

        for (const { bone, layer } of expected) {
          const marker = `data-cosmetic="${cosmetic.reference}"`;
          const expectedCopies = expected.filter((placement) => placement.bone === bone && placement.layer === layer).length;
          const contents = assembly.get(bone)?.layers.get(layer) ?? "";
          expect(contents.split(marker).length - 1, `${figureId}: ${cosmetic.reference} in ${bone}/${layer}`).toBe(expectedCopies);
        }
        for (const slot of cosmetic.piece.hides ?? []) hiddenSlots.add(slot);
      }

      for (const bone of figure.rig.bones) {
        const assembled = assembly.get(bone.name)!;
        expect([...assembled.layers.keys()]).toEqual(figure.rig.contract.depthSlots);
        const part = figure.parts.get(bone.name)!.contents;
        const hidden = figure.cosmetics.some((cosmetic) => cosmetic.piece.hides?.includes(bone.slot));
        if (hidden) expect([...assembled.layers.values()].join("")).not.toContain(part);
        else expect(assembled.layers.get("part")).toContain(part);
      }
    }

    expect([...hiddenSlots]).toContain("head");
  });
});
