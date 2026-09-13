import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { assembleFigure } from "../../src/render/assemble.ts";
import { applyLoadout } from "../../src/render/loadout.ts";
import type { Loadout } from "../../src/render/loadout.ts";
import { installTestDom, repositoryFetcher } from "./dom.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
let restoreDom: () => void;

beforeEach(() => { restoreDom = installTestDom(); });
afterEach(() => { restoreDom(); });

describe("loadouts", () => {
  it("fetches only changed parts and newly worn cosmetics, and preserves the pose", async () => {
    const { fetcher, requests } = repositoryFetcher(ROOT);
    const node = await assembleFigure("barst", "player", "http://lab/", fetcher);
    const torso = node.bones.get("torso")!;
    torso.setAttribute("transform", "translate(2 3) rotate(-9)");
    const loadout: Loadout = {
      figure: "barst",
      parts: { ...node.manifest.parts, head: "characters/fighter/parts/head.svg" },
      cosmetics: ["cosmetics/royal-guard/hood.svg", "cosmetics/royal-guard/pauldron.svg"],
      weapon: "weapons/iron-axe.svg",
    };
    requests.length = 0;

    await applyLoadout(node, loadout, "http://lab/", fetcher);

    expect(requests).toEqual([
      "characters/fighter/parts/head.svg",
      "cosmetics/royal-guard/set.json",
      "cosmetics/royal-guard/pauldron.svg",
    ]);
    expect([...node.cosmetics.keys()].sort()).toEqual([
      "cosmetics/royal-guard/hood.svg",
      "cosmetics/royal-guard/pauldron.svg",
    ]);
    expect(node.sources.get("head")).toBe("characters/fighter/parts/head.svg");
    expect(torso.getAttribute("transform")).toBe("translate(2 3) rotate(-9)");

    requests.length = 0;
    await applyLoadout(node, loadout, "http://lab/", fetcher);
    expect(requests).toEqual([]);
  });

  it("refuses to apply another figure's value without rebuilding the node", async () => {
    const { fetcher, requests } = repositoryFetcher(ROOT);
    const node = await assembleFigure("barst", "player", "http://lab/", fetcher);
    requests.length = 0;
    await expect(applyLoadout(node, {
      figure: "kiran",
      parts: node.manifest.parts,
      cosmetics: [],
      weapon: null,
    }, "http://lab/", fetcher)).rejects.toThrow(/targets figure 'kiran'/);
    expect(requests).toEqual([]);
  });
});
