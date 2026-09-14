import { describe, expect, it } from "vitest";

import { startDevSidecar } from "../../pipelines/dev/sidecar.ts";
import { buildWardrobeIndex } from "boneyard/wardrobe/index";
import type { RuntimeCatalog } from "../../src/clips/runtime.ts";
import { loadWardrobeIndex } from "../../src/render/assemble.ts";
import type { Fetcher } from "../../src/render/assemble.ts";
import worker from "../../src/shell/worker.ts";
import { BONEYARD_ROOT } from "boneyard/paths";

const ROOT = BONEYARD_ROOT;
const emptyCatalog = (): RuntimeCatalog => ({ contract: 1, clips: {}, origins: {}, lanes: {} });

describe("wardrobe discovery index", () => {
  it("projects every shipped set and piece with browser-facing metadata", () => {
    const index = buildWardrobeIndex(ROOT);
    expect(index.sets.map((set) => set.id)).toEqual(["armory", "field-kit", "royal-guard"]);
    expect(index.sets.flatMap((set) => set.pieces)).toHaveLength(8);
    expect(index.sets[0]).toMatchObject({ id: "armory", name: "Armory", rig: "fighter" });
    expect(index.sets[0].pieces).toEqual([{
      id: "longsword",
      reference: "cosmetics/armory/longsword.svg",
      kind: "weapon",
      height: 73,
      fitted: ["barst", "fighter", "kiran", "yuliya"],
      hides: [],
    }]);
    expect(index.sets[1].pieces.find((piece) => piece.id === "full-helm")).toEqual({
      id: "full-helm",
      reference: "cosmetics/field-kit/full-helm.svg",
      kind: "mask",
      height: 56,
      fitted: ["barst", "fighter", "kiran", "yuliya"],
      hides: ["head"],
    });
    expect(index.sets[2].pieces.find((piece) => piece.id === "hood")?.hides).toEqual([]);
  });

  it("serves the identical live projection through the dev Worker", async () => {
    const sidecar = await startDevSidecar({ root: ROOT, port: 0, watchFiles: false, rebuild: emptyCatalog });
    try {
      const response = await worker.fetch(new Request("http://lab/dev/wardrobe") as never, {
        SIDECAR_ORIGIN: `http://127.0.0.1:${sidecar.port}`,
        ASSETS: { fetch },
      } as never);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual(buildWardrobeIndex(ROOT));
    } finally {
      await sidecar.close();
    }
  });

  it("falls back to the built index when the dev sidecar is absent", async () => {
    const index = buildWardrobeIndex(ROOT);
    const requests: string[] = [];
    const fetcher: Fetcher = async (input) => {
      const pathname = new URL(String(input)).pathname;
      requests.push(pathname);
      return pathname === "/dev/wardrobe"
        ? new Response("missing", { status: 404 })
        : new Response(JSON.stringify(index), { status: 200 });
    };
    await expect(loadWardrobeIndex("http://lab/", fetcher)).resolves.toEqual(index);
    expect(requests).toEqual(["/dev/wardrobe", "/cosmetics/index.json"]);
  });
});
