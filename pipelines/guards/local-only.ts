#!/usr/bin/env node
/** Assert that source releases cannot grow into a hosted production surface. */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
}

export interface LocalOnlyReport {
  readonly ok: boolean;
  readonly scripts: number;
  readonly configKeys: number;
  readonly workflowFiles: number;
  readonly runtimeFiles: number;
  readonly forbiddenScripts: readonly string[];
  readonly forbiddenConfigKeys: readonly string[];
  readonly deploymentWorkflows: readonly string[];
  readonly authenticationSurfaces: readonly string[];
}

const FORBIDDEN_KEYS = [
  "account_id",
  "routes",
  "route",
  "custom_domain",
  "custom_domains",
  "zone_id",
  "d1_databases",
  "kv_namespaces",
  "durable_objects",
  "r2_buckets",
  "queues",
  "analytics_engine_datasets",
  "dispatch_namespaces",
  "hyperdrive",
  "vectorize",
] as const;

const FORBIDDEN_COMMANDS: readonly RegExp[] = [
  /\b(?:npx\s+|npm\s+exec\s+)?wrangler\s+(?:deploy|publish)\b/i,
  /\b(?:npx\s+|npm\s+exec\s+)?wrangler\s+pages\s+deploy\b/i,
  /\bnpm\s+publish\b/i,
];

const FORBIDDEN_WORKFLOW_PATTERNS: readonly RegExp[] = [
  /uses:\s*cloudflare\/(?:wrangler-action|pages-action)@/i,
  /\bCLOUDFLARE_(?:API_TOKEN|ACCOUNT_ID|API_KEY|EMAIL)\b/i,
  /^\s*environment:\s*["']?production["']?\s*$/im,
];

const AUTHENTICATION_PATH = /(?:^|\/)(?:auth|account|login|logout|signin|signup|register|session|oauth|saml)(?:[./_-]|$)/i;
const AUTHENTICATION_SOURCE: readonly RegExp[] = [
  /\b(?:Authorization|Set-Cookie)\b/i,
  /\b(?:OAuth|OpenID|SAML)\b/i,
  /["'`]\/(?:login|logout|signin|sign-in|signup|sign-up|register|account)(?:[/?#"'`]|$)/i,
];
const AUTHENTICATION_DEPENDENCY = /auth0|better-auth|clerk|next-auth|passport|supertokens|lucia/i;

function filesUnder(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(path) : [path];
  });
}

function portable(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

function matchesAny(value: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}

export function checkLocalOnly(root = ROOT): LocalOnlyReport {
  const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as PackageManifest;
  const scriptEntries = Object.entries(manifest.scripts ?? {});
  const forbiddenScripts = scriptEntries
    .filter(([, command]) => matchesAny(command, FORBIDDEN_COMMANDS))
    .map(([name]) => name)
    .sort();

  const config = readFileSync(join(root, "wrangler.local.jsonc"), "utf8");
  const forbiddenConfigKeys = FORBIDDEN_KEYS
    .filter((key) => new RegExp("\\\"" + key + "\\\"\\s*:").test(config))
    .map(String);
  if (/"workers_dev"\s*:\s*true\b/.test(config)) forbiddenConfigKeys.push("workers_dev=true");
  forbiddenConfigKeys.sort();

  const workflows = join(root, ".github", "workflows");
  const workflowFiles = existsSync(workflows)
    ? readdirSync(workflows).filter((name) => /\.ya?ml$/i.test(name)).sort()
    : [];
  const deploymentWorkflows = workflowFiles.filter((name) => {
    const source = readFileSync(join(workflows, name), "utf8");
    return matchesAny(source, FORBIDDEN_COMMANDS) || matchesAny(source, FORBIDDEN_WORKFLOW_PATTERNS);
  });

  const runtimeFiles = filesUnder(join(root, "src"))
    .filter((path) => [".ts", ".tsx", ".js", ".jsx", ".html"].includes(extname(path).toLowerCase()));
  const authenticationSurfaces = Object.keys(manifest.dependencies ?? {})
    .filter((name) => AUTHENTICATION_DEPENDENCY.test(name))
    .map((name) => "dependency:" + name);
  for (const path of runtimeFiles) {
    const relativePath = portable(root, path);
    const source = readFileSync(path, "utf8");
    if (AUTHENTICATION_PATH.test(relativePath) || matchesAny(source, AUTHENTICATION_SOURCE)) {
      authenticationSurfaces.push(relativePath);
    }
  }
  authenticationSurfaces.sort();

  return {
    ok: forbiddenScripts.length === 0
      && forbiddenConfigKeys.length === 0
      && deploymentWorkflows.length === 0
      && authenticationSurfaces.length === 0,
    scripts: scriptEntries.length,
    configKeys: FORBIDDEN_KEYS.length + 1,
    workflowFiles: workflowFiles.length,
    runtimeFiles: runtimeFiles.length,
    forbiddenScripts,
    forbiddenConfigKeys,
    deploymentWorkflows,
    authenticationSurfaces,
  };
}

function fix(report: LocalOnlyReport): string {
  const actions: string[] = [];
  if (report.forbiddenScripts.length > 0) actions.push("remove production/package scripts: " + report.forbiddenScripts.join(", "));
  if (report.forbiddenConfigKeys.length > 0) actions.push("remove wrangler.local.jsonc production keys: " + report.forbiddenConfigKeys.join(", "));
  if (report.deploymentWorkflows.length > 0) actions.push("remove production deployment workflows: " + report.deploymentWorkflows.join(", "));
  if (report.authenticationSurfaces.length > 0) actions.push("remove production authentication/account surfaces: " + report.authenticationSurfaces.join(", "));
  return actions.join("; ");
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  const unknown = argv.filter((argument) => argument !== "--json");
  try {
    if (unknown.length > 0) throw new Error("unknown option " + unknown[0]);
    const report = checkLocalOnly();
    const result = report.ok ? report : { ...report, fix: fix(report) };
    if (asJson) console.log(JSON.stringify(result, null, 2));
    else if (!report.ok) console.error("assert-local-only: " + fix(report));
    else console.log("local-only guard: checked " + report.scripts + " scripts, " + report.configKeys
      + " forbidden config surfaces, " + report.workflowFiles + " workflow files and " + report.runtimeFiles
      + " runtime files; 0 production surfaces");
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (asJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error("assert-local-only: " + message);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
