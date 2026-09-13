import { existsSync, readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const forbiddenScripts = Object.keys(pkg.scripts ?? {}).filter((name) => name.includes("deploy") || name.includes("publish"));
if (forbiddenScripts.length > 0) {
  throw new Error(`Local-only invariant failed: forbidden npm scripts: ${forbiddenScripts.join(", ")}`);
}

const config = readFileSync(join(root, "wrangler.local.jsonc"), "utf8");
const forbiddenCloudflareKeys = [
  "account_id",
  "routes",
  "custom_domain",
  "d1_databases",
  "kv_namespaces",
  "durable_objects",
  "r2_buckets",
  "queues",
  "analytics_engine_datasets",
];
for (const key of forbiddenCloudflareKeys) {
  if (new RegExp(`\\"${key}\\"\\s*:`).test(config)) {
    throw new Error(`Local-only invariant failed: wrangler.local.jsonc contains ${key}`);
  }
}

const workflows = join(root, ".github", "workflows");
if (existsSync(workflows) && readdirSync(workflows).some((name) => /deploy|publish|release/i.test(name))) {
  throw new Error("Local-only invariant failed: deployment workflow detected");
}

console.log("local-only guard: no deploy scripts, routes, accounts, or persistent bindings");
