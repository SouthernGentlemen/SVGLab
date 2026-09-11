import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const RASTER = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".avif", ".ico"];

describe("architecture guardrails", () => {
  it("keeps combat independent from presentation, the DOM, and Cloudflare", () => {
    const combatFiles = filesUnder(join(root, "src", "combat")).filter((path) => path.endsWith(".ts"));
    for (const path of combatFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/from ["'][^"']*(animation|svg|app|debug|worker)/);
      expect(source).not.toMatch(/\b(document|window)\.|\b(HTMLElement|SVGElement|Fetcher)\b/);
    }
  });

  it("keeps character preview on the presentation side of the combat boundary", () => {
    const source = readFileSync(join(root, "src", "app", "preview.ts"), "utf8");
    expect(source).not.toMatch(/from ["'][^"']*combat/);
    expect(source).not.toMatch(/\bCombatSimulation\b/);
    expect(source).not.toMatch(/\banimationSnapshot\b/);
    expect(source).toMatch(/\bsampleClip\b/);
    expect(source).toMatch(/\bapplyPose\b/);
  });

  it("has no npm deployment surface", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(Object.keys(pkg.scripts).some((name) => /deploy|publish/.test(name))).toBe(false);
    expect(readFileSync(join(root, "wrangler.local.jsonc"), "utf8")).not.toMatch(/"(account_id|routes|d1_databases|kv_namespaces|durable_objects)"\s*:/);
  });

  // Characters are traced from PNG atlases, and the atlases must never follow them into the
  // build. Everything the stage draws is vector, so it scales, it stays legible against the
  // debug overlay, and a fighter is a set of paths the rig can pose rather than a picture it
  // can only move. The atlases live outside src/ and are read by a build script; the moment
  // one is imported, pasted in as a data URI, or dropped next to the code, this fails.
  it("renders from vectors only — no raster reaches the bundle", () => {
    const bundled = [...filesUnder(join(root, "src")), join(root, "index.html"), join(root, "preview.html")];

    for (const path of bundled) {
      expect(RASTER, `${path} is a raster image inside src/`).not.toContain(extname(path).toLowerCase());
    }

    for (const path of bundled.filter((file) => /\.(ts|css|html|svg)$/.test(file))) {
      // Comments name the atlas a character was traced from, which is worth keeping and is
      // not a reference. Only syntax that actually loads something counts.
      const source = readFileSync(path, "utf8")
        .replace(/<!--[\s\S]*?-->/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/^\s*\*.*$/gm, "");
      expect(source, `${path} embeds a raster image`).not.toMatch(/data:image\/(?!svg)/i);
      expect(source, `${path} loads a raster image`)
        .not.toMatch(new RegExp(`(from\\s*["']|url\\(\\s*["']?|src=["']|href=["'])[^"')]*(${RASTER.join("|").replace(/\./g, "\\.")})`, "i"));
      if (path.endsWith(".svg")) {
        expect(source, `${path} contains a raster <image>`).not.toMatch(/<image\b/);
      }
    }
  });
});
