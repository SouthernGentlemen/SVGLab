import { describe, expect, it } from "vitest";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const RASTER = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".ico"];

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name); return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("architecture guardrails", () => {
  it("keeps browser source independent from build pipelines", () => {
    for (const path of filesUnder(join(ROOT, "src")).filter((file) => file.endsWith(".ts"))) {
      expect(readFileSync(path, "utf8"), `${path} imports a build pipeline`).not.toMatch(/from\s+["'][^"']*pipelines\//);
    }
  });

  it("keeps the clip preview on the presentation side of the kernel boundary", () => {
    const source = readFileSync(join(ROOT, "src", "shell", "preview.ts"), "utf8");
    expect(source).not.toMatch(/from ["'][^"']*kernel/); expect(source).not.toMatch(/\bCombatSimulation\b/);
    expect(source).toMatch(/\bsampleClip\b/); expect(source).toMatch(/\bapplyPose\b/);
  });

  it("keeps loadout application on the presentation side of the kernel boundary", () => {
    const source = readFileSync(join(ROOT, "src", "render", "loadout.ts"), "utf8");
    expect(source).not.toMatch(/from ["'][^"']*kernel/); expect(source).not.toMatch(/\bCombatSimulation\b/);
  });

  it("has no npm deployment surface", () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as { scripts: Record<string, string> };
    expect(Object.keys(pkg.scripts).some((name) => /deploy|publish/.test(name))).toBe(false);
    expect(readFileSync(join(ROOT, "wrangler.local.jsonc"), "utf8")).not.toMatch(/"(account_id|routes|d1_databases|kv_namespaces|durable_objects)"\s*:/);
  });

  it("renders from vectors only — no raster reaches the bundle", () => {
    const bundled = [...filesUnder(join(ROOT, "src")), join(ROOT, "index.html"), join(ROOT, "preview.html")];
    for (const path of bundled) expect(RASTER, `${path} is raster inside src`).not.toContain(extname(path).toLowerCase());
    for (const path of bundled.filter((file) => /\.(?:ts|css|html|svg)$/.test(file))) {
      const source = readFileSync(path, "utf8").replace(/<!--[\s\S]*?-->/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(source, `${path} embeds raster`).not.toMatch(/data:image\/(?!svg)/i);
      expect(source, `${path} loads raster`).not.toMatch(new RegExp(`(from\\s*["']|url\\(\\s*["']?|src=["']|href=["'])[^"')]*(${RASTER.join("|").replace(/\./g, "\\.")})`, "i"));
      if (path.endsWith(".svg")) expect(source, `${path} contains image`).not.toMatch(/<image\b/);
    }
  });

  it("never lets reset delete out/, where a Blender project is pointed", () => {
    const sandbox = mkdtempSync(join(tmpdir(), "svglab-reset-"));
    try {
      mkdirSync(join(sandbox, "pipelines", "dev"), { recursive: true });
      copyFileSync(join(ROOT, "pipelines", "dev", "lifecycle.ts"), join(sandbox, "pipelines", "dev", "lifecycle.ts"));
      mkdirSync(join(sandbox, "out", "blender"), { recursive: true }); mkdirSync(join(sandbox, "dist"), { recursive: true });
      writeFileSync(join(sandbox, "out", "blender", "in-progress.blend"), "editing"); writeFileSync(join(sandbox, "dist", "bundle.js"), "generated");
      execFileSync(process.execPath, [join(sandbox, "pipelines", "dev", "lifecycle.ts"), "reset"], { stdio: "pipe" });
      expect(existsSync(join(sandbox, "out", "blender", "in-progress.blend"))).toBe(true); expect(existsSync(join(sandbox, "dist"))).toBe(false);
    } finally { rmSync(sandbox, { recursive: true, force: true }); }
  });
});
