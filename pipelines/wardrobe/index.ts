import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";

import { validateFigure } from "../../src/render/manifest.ts";
import { validateWardrobeSet } from "../../src/render/wardrobe.ts";
import type { WardrobeIndex } from "../../src/render/wardrobe.ts";

/** One projection feeds the built asset and the live sidecar. */
export function buildWardrobeIndex(root: string): WardrobeIndex {
  const directory = join(root, "cosmetics");
  const figuresByRig = new Map<string, string[]>();
  for (const file of readdirSync(join(root, "figures")).filter((name) => name.endsWith(".json")).sort()) {
    const figure = validateFigure(JSON.parse(readFileSync(join(root, "figures", file), "utf8")) as unknown, `figures/${file}`);
    const figures = figuresByRig.get(figure.rig) ?? [];
    figures.push(basename(file, ".json"));
    figuresByRig.set(figure.rig, figures);
  }
  const sets = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(directory, entry.name, "set.json")))
    .map((entry) => entry.name)
    .sort()
    .map((id) => {
      const path = join(directory, id, "set.json");
      const set = validateWardrobeSet(JSON.parse(readFileSync(path, "utf8")) as unknown, `cosmetics/${id}/set.json`);
      const pieces = Object.keys(set.pieces).sort().map((pieceId) => {
        const piece = set.pieces[pieceId];
        return {
          id: pieceId,
          reference: `cosmetics/${id}/${pieceId}.svg`,
          kind: piece.kind,
          height: piece.height,
          fitted: piece.fitted ?? figuresByRig.get(set.rig) ?? [],
          hides: piece.hides ?? [],
        };
      });
      return { id, name: set.name, rig: set.rig, pieces };
    });
  return { contract: 1, sets };
}
