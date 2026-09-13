import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { outputPath, renderWardrobe, wardrobeIds } from "../../pipelines/wardrobe/build.ts";

describe("wardrobe build", () => {
  it("traces one generated vector file per authored island", () => {
    const expected = {
      "field-kit": ["full-helm", "field-belt", "trail-cloak", "long-hair"],
      "royal-guard": ["hood", "pauldron", "skirt"],
    } as const;
    expect(wardrobeIds()).toEqual(Object.keys(expected));
    for (const [setId, pieceIds] of Object.entries(expected)) {
      const rendered = renderWardrobe(setId);
      expect([...rendered.pieces.keys()]).toEqual(pieceIds);
      for (const [pieceId, piece] of rendered.pieces) {
        expect(readFileSync(outputPath(setId, pieceId), "utf8")).toBe(piece.svg);
        expect(piece.svg).toContain(`data-cosmetic="${pieceId}"`);
        expect(piece.svg).not.toMatch(/data-bone|data-[xy]=|<image\b|data:image|\.png\b|NaN|Infinity|undefined/);
      }
    }
  });

  it("runs under strip-only node and rebuilds byte-identically", () => {
    expect(() => execFileSync(process.execPath, ["pipelines/wardrobe/build.ts", "--check"], {
      cwd: process.cwd(),
      stdio: "pipe",
    })).not.toThrow();
  }, 60_000);
});
