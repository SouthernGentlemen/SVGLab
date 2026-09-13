import { describe, expect, it } from "vitest";

import { blenderFix, findBlender } from "../../pipelines/dev/find-blender.ts";

describe("Blender detection", () => {
  it("honors an executable SVGLAB_BLENDER before every fallback", () => {
    const result = findBlender({
      env: { SVGLAB_BLENDER: "/chosen/blender", PATH: "/path" },
      executable: (path) => path === "/chosen/blender",
    });
    expect(result).toMatchObject({ executable: "/chosen/blender", source: "environment" });
    expect(result.looked).toEqual(["/chosen/blender"]);
  });

  it("rejects a broken explicit choice without falling back", () => {
    expect(() => findBlender({
      env: { SVGLAB_BLENDER: "/broken/blender", PATH: "/working" },
      executable: (path) => path === "/working/blender",
    })).toThrow(/not executable; refusing to fall back/);
  });

  it("reports every attempted path and an exact verification fix when absent", () => {
    const result = findBlender({ env: { PATH: "/one:/two" }, platform: "linux", executable: () => false });
    expect(result.executable).toBeNull();
    expect(result.looked).toEqual([
      "/one/blender", "/two/blender", "/usr/bin/blender", "/usr/local/bin/blender", "/snap/bin/blender",
    ]);
    expect(blenderFix(result.suggested)).toBe("SVGLAB_BLENDER=/usr/bin/blender npm run verify");
  });
});
