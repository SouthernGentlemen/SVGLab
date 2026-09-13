#!/usr/bin/env node
/** Assert that the lab has no deployment or persistent Cloudflare surface. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface LocalOnlyReport {
  readonly ok: boolean;
  readonly scripts: number;
  readonly configKeys: number;
  readonly workflowFiles: number;
  readonly forbiddenScripts: readonly string[];
  readonly forbiddenConfigKeys: readonly string[];
  readonly deploymentWorkflows: readonly string[];
}

const FORBIDDEN_KEYS = [
  "account_id",
  "routes",
  "custom_domain",
  "d1_databases",
  "kv_namespaces",
  "durable_objects",
  "r2_buckets",
  "queues",
  "analytics_engine_datasets",
] as const;

export function checkLocalOnly(root = ROOT): LocalOnlyReport {
  const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts?: Record<string, string> };
  const scripts = Object.keys(pkg.scripts ?? {});
  const forbiddenScripts = scripts.filter((name) => name.includes("deploy") || name.includes("publish"));
  const config = readFileSync(join(root, "wrangler.local.jsonc"), "utf8");
  const forbiddenConfigKeys = FORBIDDEN_KEYS.filter((key) => new RegExp(`\\"${key}\\"\\s*:`).test(config));
  const workflows = join(root, ".github", "workflows");
  const workflowFiles = existsSync(workflows) ? readdirSync(workflows).sort() : [];
  const deploymentWorkflows = workflowFiles.filter((name) => /deploy|publish|release/i.test(name));
  return {
    ok: forbiddenScripts.length === 0 && forbiddenConfigKeys.length === 0 && deploymentWorkflows.length === 0,
    scripts: scripts.length,
    configKeys: FORBIDDEN_KEYS.length,
    workflowFiles: workflowFiles.length,
    forbiddenScripts,
    forbiddenConfigKeys,
    deploymentWorkflows,
  };
}

function fix(report: LocalOnlyReport): string {
  const actions: string[] = [];
  if (report.forbiddenScripts.length > 0) actions.push(`remove npm scripts: ${report.forbiddenScripts.join(", ")}`);
  if (report.forbiddenConfigKeys.length > 0) actions.push(`remove wrangler.local.jsonc keys: ${report.forbiddenConfigKeys.join(", ")}`);
  if (report.deploymentWorkflows.length > 0) actions.push(`remove deployment workflows: ${report.deploymentWorkflows.join(", ")}`);
  return actions.join("; ");
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  const unknown = argv.filter((argument) => argument !== "--json");
  try {
    if (unknown.length > 0) throw new Error(`unknown option ${unknown[0]}`);
    const report = checkLocalOnly();
    const result = report.ok ? report : { ...report, fix: fix(report) };
    if (asJson) console.log(JSON.stringify(result, null, 2));
    else if (!report.ok) console.error(`assert-local-only: ${fix(report)}`);
    else console.log(`local-only guard: checked ${report.scripts} scripts, ${report.configKeys} forbidden config keys, `
      + `${report.workflowFiles} workflow files; 0 deploy surfaces`);
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (asJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`assert-local-only: ${message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
