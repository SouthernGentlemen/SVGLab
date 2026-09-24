import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { checkLocalOnly } from "../../pipelines/guards/local-only";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));

interface Fixture {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly config?: string;
  readonly workflows?: Readonly<Record<string, string>>;
  readonly sources?: Readonly<Record<string, string>>;
}

const SAFE_CONFIG = `{
  "name": "fixture-local-only",
  "main": "src/worker.ts",
  "workers_dev": false,
  "dev": { "ip": "127.0.0.1", "port": 8787 }
}\n`;

function fixture(input: Fixture): string {
  const root = mkdtempSync(join(tmpdir(), "svglab-local-only-"));
  writeFileSync(join(root, "package.json"), JSON.stringify({
    private: true,
    scripts: input.scripts ?? {},
    dependencies: input.dependencies ?? {},
  }, null, 2));
  writeFileSync(join(root, "wrangler.local.jsonc"), input.config ?? SAFE_CONFIG);
  for (const [name, source] of Object.entries(input.workflows ?? {})) {
    const path = join(root, ".github", "workflows", name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  for (const [name, source] of Object.entries(input.sources ?? {})) {
    const path = join(root, name);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, source);
  }
  return root;
}

function withFixture(input: Fixture, assertion: (root: string) => void): void {
  const root = fixture(input);
  try {
    assertion(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

describe("local-only post-release guard", () => {
  it("allows immutable GitHub source publication without opening a deploy surface", () => {
    const workflow = readFileSync(join(ROOT, ".github", "workflows", "source-publication.yml"), "utf8");
    expect(workflow).toContain("gh release create");
    expect(workflow).toContain("--verify-tag");
    expect(checkLocalOnly(ROOT)).toMatchObject({
      ok: true,
      forbiddenScripts: [],
      forbiddenConfigKeys: [],
      deploymentWorkflows: [],
      authenticationSurfaces: [],
    });
  });

  it("rejects production Worker or Pages deploys and npm publication while allowing GitHub Releases", () => {
    withFixture({
      scripts: {
        "source-release": "gh release create v0.1.0 --verify-tag",
        "worker-deploy": "wrangler deploy",
        "package-publish": "npm publish",
      },
      workflows: {
        "source-publication.yml": "run: gh release create v0.1.0 --verify-tag\n",
        "pages.yml": "run: npx wrangler pages deploy dist\n",
      },
    }, (root) => {
      const report = checkLocalOnly(root);
      expect(report.ok).toBe(false);
      expect(report.forbiddenScripts).toEqual(["package-publish", "worker-deploy"]);
      expect(report.deploymentWorkflows).toEqual(["pages.yml"]);
    });
  });

  it("rejects production Cloudflare identity, routes and persistent bindings", () => {
    withFixture({
      config: `{
        "name": "hosted",
        "main": "src/worker.ts",
        "workers_dev": true,
        "account_id": "production-account",
        "routes": ["example.com/*"],
        "r2_buckets": [{ "binding": "DATA", "bucket_name": "production" }]
      }\n`,
      workflows: {
        "ship.yml": "env:\n  CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}\nrun: npm run build\n",
      },
    }, (root) => {
      const report = checkLocalOnly(root);
      expect(report.forbiddenConfigKeys).toEqual(expect.arrayContaining(["account_id", "r2_buckets", "routes", "workers_dev=true"]));
      expect(report.deploymentWorkflows).toEqual(["ship.yml"]);
      expect(report.ok).toBe(false);
    });
  });

  it("rejects production authentication and account surfaces", () => {
    withFixture({
      dependencies: { passport: "1.0.0" },
      sources: {
        "src/shell/account.ts": "export const login = '/login';\nexport const header = 'Authorization';\n",
      },
    }, (root) => {
      const report = checkLocalOnly(root);
      expect(report.authenticationSurfaces).toEqual(["dependency:passport", "src/shell/account.ts"]);
      expect(report.ok).toBe(false);
    });
  });
});
