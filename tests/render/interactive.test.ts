import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

import { assembleFigure, hiddenPartSlots, removeCosmetic, wearCosmetic } from "../../src/render/assemble.ts";
import type { CosmeticNode } from "../../src/render/assemble.ts";
import { installTestDom, repositoryFetcher, TestSvgElement } from "./dom.ts";
import { BONEYARD_ROOT } from "boneyard/paths";

const ROOT = BONEYARD_ROOT;
let restoreDom: () => void;

beforeEach(() => { restoreDom = installTestDom(); });
afterEach(() => { restoreDom(); });

describe("interactive cosmetics", () => {
  it("attaches and removes placements without rebuilding or resetting the posed hierarchy", async () => {
    const { fetcher } = repositoryFetcher(ROOT);
    const node = await assembleFigure("barst", "player", "http://lab/", fetcher);
    const root = node.root;
    const torso = node.bones.get("torso")!;
    torso.setAttribute("transform", "translate(4 5) rotate(17)");

    await expect(wearCosmetic(node, "cosmetics/royal-guard/pauldron.svg", "http://lab/", fetcher)).resolves.toBe("ok");
    const worn = node.cosmetics.get("cosmetics/royal-guard/pauldron.svg")!;
    expect(worn.elements).toHaveLength(2);
    expect(worn.elements.every((element) => element.parentNode === node.depthLayers.get("torso")!.get("over"))).toBe(true);
    expect(node.root).toBe(root);
    expect(node.bones.get("torso")).toBe(torso);
    expect(torso.getAttribute("transform")).toBe("translate(4 5) rotate(17)");

    removeCosmetic(node, worn.reference);
    expect(node.cosmetics.has(worn.reference)).toBe(false);
    expect(worn.elements.every((element) => element.parentNode === null)).toBe(true);
    expect(torso.getAttribute("transform")).toBe("translate(4 5) rotate(17)");
  });

  it("refreshes hidden part art when a piece is worn and removed", async () => {
    const { fetcher } = repositoryFetcher(ROOT);
    const node = await assembleFigure("barst", "player", "http://lab/", fetcher);
    const head = node.art.get("head") as unknown as TestSvgElement;
    const partLayer = node.depthLayers.get("head")!.get("part")!;

    expect(head.parentNode).toBe(partLayer);
    expect(await wearCosmetic(node, "cosmetics/field-kit/full-helm.svg", "http://lab/", fetcher)).toBe("ok");
    expect(head.parentNode).toBe(null);
    removeCosmetic(node, "cosmetics/field-kit/full-helm.svg");
    expect(head.parentNode).toBe(partLayer);
  });

  it("reports unfitted, unknown, and wrong-rig selections without fetching their art", async () => {
    const wrongSet = JSON.stringify({
      contract: 1,
      name: "Other rig",
      rig: "other",
      islands: ["visor"],
      pieces: { visor: { kind: "hat", height: 12, fitted: ["barst"] } },
    });
    const { fetcher, requests } = repositoryFetcher(ROOT, { "cosmetics/other/set.json": wrongSet });
    const node = await assembleFigure("barst", "player", "http://lab/", fetcher);
    requests.length = 0;

    expect(await wearCosmetic(node, "cosmetics/field-kit/trail-cloak.svg", "http://lab/", fetcher)).toBe("not fitted");
    expect(await wearCosmetic(node, "cosmetics/royal-guard/missing.svg", "http://lab/", fetcher)).toBe("unknown piece");
    expect(await wearCosmetic(node, "cosmetics/other/visor.svg", "http://lab/", fetcher)).toBe("wrong rig");
    expect(requests.filter((path) => path.endsWith(".svg"))).toEqual([]);
    expect(node.cosmetics.has("cosmetics/field-kit/trail-cloak.svg")).toBe(false);
  });

  it("keeps bad figure manifests fatal", async () => {
    const raw = JSON.parse(readFileSync(`${ROOT}/figures/barst.json`, "utf8")) as { cosmetics: string[] };
    raw.cosmetics = ["cosmetics/field-kit/trail-cloak.svg"];
    const { fetcher } = repositoryFetcher(ROOT, { "figures/unfitted.json": JSON.stringify(raw) });
    await expect(assembleFigure("unfitted", "player", "http://lab/", fetcher)).rejects.toThrow(/not fitted/);
  });

  it("drops hidden part slots only while the claiming cosmetic is enabled", () => {
    const cosmetic = {
      enabled: true,
      piece: { kind: "hat", height: 40, hides: ["head"] },
    } as unknown as CosmeticNode;
    expect([...hiddenPartSlots([cosmetic])]).toEqual(["head"]);
    cosmetic.enabled = false;
    expect([...hiddenPartSlots([cosmetic])]).toEqual([]);
  });
});
