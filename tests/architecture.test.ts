import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe("architecture guardrails", () => {
  it("keeps combat independent from presentation, the DOM, and Cloudflare", () => {
    const combatFiles = filesUnder(join(root, "src", "combat")).filter((path) => path.endsWith(".ts"));
    for (const path of combatFiles) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/from ["'][^"']*(animation|svg|app|debug|worker)/);
      expect(source).not.toMatch(/\b(document|window)\.|\b(HTMLElement|SVGElement|Fetcher)\b/);
    }
  });

  it("has no npm deployment surface", () => {
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    expect(Object.keys(pkg.scripts).some((name) => /deploy|publish/.test(name))).toBe(false);
    expect(readFileSync(join(root, "wrangler.local.jsonc"), "utf8")).not.toMatch(/"(account_id|routes|d1_databases|kv_namespaces|durable_objects)"\s*:/);
  });
});
