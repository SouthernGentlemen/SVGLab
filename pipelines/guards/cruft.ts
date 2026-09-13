#!/usr/bin/env node
/**
 * check:cruft — prove that every tracked path has a live reason to exist.
 *
 * Imports, asset references and documentation links form the graph. Files discovered by a
 * tool instead of named by another file are roots below, each with the reason it cannot be
 * reached statically. Adding a broad silent skip is deliberately not an option.
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, normalize, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export interface DeclaredEntryRule {
  readonly pattern: string;
  readonly reason: string;
}

/** Inputs discovered by Git, npm, Vite or a build pipeline rather than by a literal import. */
export const DECLARED_ENTRY_RULES: readonly DeclaredEntryRule[] = [
  { pattern: ".gitattributes", reason: "Git applies the vendored BVH whitespace policy" },
  { pattern: ".gitignore", reason: "Git keeps generated and disposable state untracked" },
  { pattern: "AGENTS.md", reason: "repository contract" },
  { pattern: "README.md", reason: "documentation root" },
  { pattern: "package.json", reason: "npm command and dependency manifest" },
  { pattern: "package-lock.json", reason: "reproducible development-tool lock" },
  { pattern: "tsconfig.json", reason: "TypeScript dialect input" },
  { pattern: "vite.config.ts", reason: "Vite build configuration" },
  { pattern: "vitest.config.ts", reason: "Vitest discovery configuration" },
  { pattern: "wrangler.local.jsonc", reason: "local Worker entry and runtime configuration" },
  { pattern: "index.html", reason: "Vite stage entry point" },
  { pattern: "preview.html", reason: "Vite animation-preview entry point" },
  { pattern: "tests/**/*.test.ts", reason: "Vitest-discovered test entry point" },
  { pattern: "characters/*/atlas.png", reason: "sprite pipeline raster input discovered by sheet id" },
  { pattern: "characters/*/atlas.json", reason: "sprite pipeline authored sidecar discovered by sheet id" },
  { pattern: "cosmetics/*/atlas.png", reason: "wardrobe pipeline raster input discovered by set id" },
  { pattern: "cosmetics/*/set.json", reason: "wardrobe build and runtime manifest discovered by set id" },
  { pattern: "figures/*.json", reason: "runtime and render-pipeline figure manifest discovered by id" },
  { pattern: "motions/*.json", reason: "motion build manifest discovered by the catalog builder" },
  { pattern: "motions/authored/*.json", reason: "authored motion source discovered by clip key" },
  { pattern: "rigs/*.rig.json", reason: "versioned rig contract discovered by rig id" },
  { pattern: "rigs/*.schema.json", reason: "committed agent-authoring schema checked by check:rig" },
  { pattern: "rigs/footprint.baseline.json", reason: "committed C7 byte ratchet input" },
  { pattern: "third_party/**", reason: "pinned vendored source, annotations, licence and notice required by C8" },
];

interface PackageManifest {
  readonly scripts?: Readonly<Record<string, string>>;
  readonly dependencies?: Readonly<Record<string, string>>;
}

export interface DeclaredEntry {
  readonly path: string;
  readonly reason: string;
}

export interface DocumentationIssue {
  readonly document: string;
  readonly reference: string;
  readonly message: string;
}

export interface DeadScript {
  readonly script: string;
  readonly entry: string;
  readonly message: string;
}

export interface CruftAudit {
  readonly trackedFiles: number;
  readonly reachableFiles: number;
  readonly references: number;
  readonly declaredEntries: readonly DeclaredEntry[];
  readonly documents: number;
  readonly linkedDocuments: number;
  readonly scripts: number;
  readonly pipelines: number;
  readonly runtimeDependencies: readonly string[];
  readonly unreachable: readonly string[];
  readonly orphanDocuments: readonly string[];
  readonly documentationIssues: readonly DocumentationIssue[];
  readonly deadScripts: readonly DeadScript[];
  readonly deadPipelines: readonly string[];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function globExpression(pattern: string): RegExp {
  let expression = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index];
    if (character === "*" && pattern[index + 1] === "*") {
      if (pattern[index + 2] === "/") {
        expression += "(?:.*/)?";
        index += 2;
      } else {
        expression += ".*";
        index += 1;
      }
    } else if (character === "*") expression += "[^/]*";
    else if (character === "?") expression += "[^/]";
    else expression += escapeRegExp(character);
  }
  return new RegExp(`${expression}$`);
}

function trackedPaths(root: string): string[] {
  return execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" })
    .split("\n").filter(Boolean).map((path) => path.split(sep).join("/")).sort();
}

function textOf(root: string, path: string): string | null {
  const data = readFileSync(resolve(root, path), "utf8");
  return data.includes("\0") ? null : data;
}

function resolveReference(sourcePath: string, reference: string, tracked: ReadonlySet<string>): string | null {
  let value = reference.trim().replace(/^<|>$/g, "").split(/[?#]/, 1)[0];
  if (!value || /^(?:[a-z]+:|#)/i.test(value)) return null;
  try { value = decodeURIComponent(value); } catch { return null; }
  const base = value.startsWith("/") ? value.slice(1) : value.startsWith(".")
    ? relative(ROOT, resolve(ROOT, dirname(sourcePath), value)).split(sep).join("/") : value;
  const candidate = normalize(base).split(sep).join("/").replace(/^\.\//, "");
  if (candidate.startsWith("../")) return null;
  if (tracked.has(candidate)) return candidate;
  for (const suffix of [".ts", ".js", ".py", ".json", ".css", ".html", ".md"]) {
    if (tracked.has(`${candidate}${suffix}`)) return `${candidate}${suffix}`;
  }
  return null;
}

function markdownLinks(source: string): string[] {
  const links: string[] = [];
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) links.push(match[1]);
  return links;
}

function referencesFrom(
  sourcePath: string,
  source: string,
  trackedPathsList: readonly string[],
  tracked: ReadonlySet<string>,
): Set<string> {
  const references = new Set<string>();
  const add = (value: string): void => {
    const target = resolveReference(sourcePath, value, tracked);
    if (target && target !== sourcePath) references.add(target);
  };

  for (const target of trackedPathsList) {
    if (target !== sourcePath && source.includes(target)) references.add(target);
  }
  for (const match of source.matchAll(/["'`]((?:\.\.?\/|\/)[^"'`\r\n]+)["'`]/g)) add(match[1]);
  for (const call of source.matchAll(/\b(?:join|resolve)\(([^)\r\n]+)\)/g)) {
    const components = [...call[1].matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
    if (components.length > 1) add(components.join("/"));
  }
  for (const match of source.matchAll(/(?:src|href)=["']([^"']+)["']/g)) add(match[1]);
  if (extname(sourcePath) === ".md") for (const link of markdownLinks(source)) add(link);
  if (extname(sourcePath) === ".py") {
    for (const match of source.matchAll(/^from\s+([A-Za-z_][\w.]*)\s+import\s+/gm)) {
      add(`./${match[1].replaceAll(".", "/")}.py`);
    }
  }
  return references;
}

function walk(roots: readonly string[], graph: ReadonlyMap<string, ReadonlySet<string>>): Set<string> {
  const reached = new Set<string>();
  const pending = [...roots];
  while (pending.length > 0) {
    const path = pending.pop()!;
    if (reached.has(path)) continue;
    reached.add(path);
    for (const target of graph.get(path) ?? []) if (!reached.has(target)) pending.push(target);
  }
  return reached;
}

function expandBraces(pattern: string): string[] {
  const match = pattern.match(/\{([^{}]+)\}/);
  if (!match || match.index === undefined) return [pattern];
  return match[1].split(",").flatMap((choice) => expandBraces(
    `${pattern.slice(0, match.index)}${choice}${pattern.slice(match.index! + match[0].length)}`,
  ));
}

function documentedPathExists(reference: string, trackedPathsList: readonly string[]): boolean {
  const cleaned = reference.trim().replace(/^["']|["'.,;:]$/g, "").replace(/^\.\//, "")
    .replace(/:\d+(?:-\d+)?$/, "");
  if (!cleaned || /\s/.test(cleaned) || cleaned.startsWith("/") || /^(?:https?:|data:)/.test(cleaned)) return true;
  if (/^(?:out|dist|node_modules|\.runtime|\.wrangler)(?:\/|$)/.test(cleaned)) return true;
  const topLevels = new Set(trackedPathsList.map((path) => path.split("/")[0]));
  if (!cleaned.includes("/") && !topLevels.has(cleaned)) return true;
  if (cleaned.includes("/") && !topLevels.has(cleaned.split("/")[0])) return true;
  if (trackedPathsList.some((path) => path.startsWith(`${cleaned.replace(/\/$/, "")}/`))) return true;
  if (cleaned.endsWith("/")) return trackedPathsList.some((path) => path.startsWith(cleaned));
  const templated = cleaned.replace(/<[^/>]+>/g, "*");
  return expandBraces(templated).some((pattern) => {
    const expression = globExpression(pattern);
    return trackedPathsList.some((path) => expression.test(path));
  });
}

function documentationAudit(
  root: string,
  trackedPathsList: readonly string[],
  tracked: ReadonlySet<string>,
): { orphanDocuments: string[]; issues: DocumentationIssue[]; linkedDocuments: number } {
  const documents = trackedPathsList.filter((path) => path.endsWith(".md"));
  const incoming = new Set<string>(["README.md", "AGENTS.md"]);
  const issues: DocumentationIssue[] = [];
  for (const document of documents) {
    const source = textOf(root, document)!;
    for (const link of markdownLinks(source)) {
      if (/^(?:[a-z]+:|#)/i.test(link)) continue;
      const target = resolveReference(document, link, tracked);
      if (!target) {
        issues.push({ document, reference: link, message: "Markdown link target does not exist" });
      } else if (target.endsWith(".md")) incoming.add(target);
    }
    const prose = source.replace(/```[\s\S]*?```/g, "");
    for (const match of prose.matchAll(/`([^`\r\n]+)`/g)) {
      const reference = match[1];
      if (!documentedPathExists(reference, trackedPathsList)) {
        issues.push({ document, reference, message: "documented repository path does not exist" });
      }
    }
  }
  return {
    orphanDocuments: documents.filter((path) => !incoming.has(path)),
    issues,
    linkedDocuments: incoming.size,
  };
}

function scriptAudit(
  root: string,
  manifest: PackageManifest,
  tracked: ReadonlySet<string>,
): { deadScripts: DeadScript[]; entries: string[] } {
  const scripts = manifest.scripts ?? {};
  const deadScripts: DeadScript[] = [];
  const entries = new Set<string>();
  for (const [name, command] of Object.entries(scripts)) {
    for (const match of command.matchAll(/\bnode\s+(?:--[^\s]+\s+)*(?:"([^"]+)"|'([^']+)'|([^\s;&|]+))/g)) {
      const entry = match[1] ?? match[2] ?? match[3];
      if (!entry || entry.startsWith("-")) continue;
      const portableEntry = entry.replace(/^\.\//, "").split(sep).join("/");
      if (!existsSync(resolve(root, portableEntry))) {
        deadScripts.push({ script: name, entry: portableEntry, message: "entry point does not exist" });
      } else if (!tracked.has(portableEntry)) {
        deadScripts.push({ script: name, entry: portableEntry, message: "entry point is not tracked" });
      } else entries.add(portableEntry);
    }
    for (const match of command.matchAll(/(?:^|&&|\|\||;)\s*([A-Za-z][A-Za-z0-9._-]*)/g)) {
      const entry = match[1];
      if (entry === "node" || entry === "npm") continue;
      if (!existsSync(resolve(root, "node_modules", ".bin", entry))) {
        deadScripts.push({ script: name, entry, message: "command is unavailable from node_modules/.bin" });
      }
    }
    for (const match of command.matchAll(/\bnpm\s+(?:run\s+)?([A-Za-z0-9:_-]+)/g)) {
      const entry = match[1];
      if (!(entry in scripts)) deadScripts.push({ script: name, entry, message: "referenced npm script does not exist" });
    }
  }
  return { deadScripts, entries: [...entries].sort() };
}

export function auditCruft(root = ROOT): CruftAudit {
  const trackedPathsList = trackedPaths(root);
  const tracked = new Set(trackedPathsList);
  const sources = new Map<string, string>();
  for (const path of trackedPathsList) {
    const source = textOf(root, path);
    if (source !== null) sources.set(path, source);
  }
  const graph = new Map<string, ReadonlySet<string>>();
  for (const [path, source] of sources) graph.set(path, referencesFrom(path, source, trackedPathsList, tracked));

  const declaredEntries: DeclaredEntry[] = [];
  for (const path of trackedPathsList) {
    const rule = DECLARED_ENTRY_RULES.find((candidate) => globExpression(candidate.pattern).test(path));
    if (rule) declaredEntries.push({ path, reason: rule.reason });
  }

  const manifest = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as PackageManifest;
  const scripts = scriptAudit(root, manifest, tracked);
  const roots = [...declaredEntries.map((entry) => entry.path), ...scripts.entries];
  const reached = walk(roots, graph);
  const pipelineReached = walk(scripts.entries, graph);
  const pipelineFiles = trackedPathsList.filter((path) => /^pipelines\/.*\.(?:ts|py)$/.test(path));
  const docs = documentationAudit(root, trackedPathsList, tracked);
  const unreachable = trackedPathsList.filter((path) => !reached.has(path));

  return {
    trackedFiles: trackedPathsList.length,
    reachableFiles: reached.size,
    references: [...graph.values()].reduce((sum, references) => sum + references.size, 0),
    declaredEntries,
    documents: trackedPathsList.filter((path) => path.endsWith(".md")).length,
    linkedDocuments: docs.linkedDocuments,
    scripts: Object.keys(manifest.scripts ?? {}).length,
    pipelines: pipelineFiles.length,
    runtimeDependencies: Object.keys(manifest.dependencies ?? {}).sort(),
    unreachable,
    orphanDocuments: docs.orphanDocuments,
    documentationIssues: docs.issues,
    deadScripts: scripts.deadScripts,
    deadPipelines: pipelineFiles.filter((path) => !pipelineReached.has(path)),
  };
}

function ok(audit: CruftAudit): boolean {
  return audit.runtimeDependencies.length === 0
    && audit.unreachable.length === 0
    && audit.orphanDocuments.length === 0
    && audit.documentationIssues.length === 0
    && audit.deadScripts.length === 0
    && audit.deadPipelines.length === 0;
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  try {
    const audit = auditCruft();
    const passed = ok(audit);
    if (asJson) console.log(JSON.stringify({ ok: passed, ...audit }, null, 2));
    else {
      for (const path of audit.unreachable) console.error(`check:cruft: ${path} is unreachable from every declared entry point`);
      for (const path of audit.orphanDocuments) console.error(`check:cruft: ${path} is an orphan document; link it from a live Markdown file`);
      for (const issue of audit.documentationIssues) {
        console.error(`check:cruft: ${issue.document} names '${issue.reference}': ${issue.message}`);
      }
      for (const script of audit.deadScripts) console.error(`check:cruft: npm script '${script.script}' names '${script.entry}': ${script.message}`);
      for (const path of audit.deadPipelines) console.error(`check:cruft: ${path} is not reached by any npm script or pipeline import`);
      if (audit.runtimeDependencies.length > 0) {
        console.error(`check:cruft: ${audit.runtimeDependencies.length} runtime dependencies found: ${audit.runtimeDependencies.join(", ")}; C7 requires zero`);
      }
      console.log(`check:cruft: ${audit.reachableFiles}/${audit.trackedFiles} tracked paths reachable through ${audit.references} references and `
        + `${audit.declaredEntries.length} reasoned entries; ${audit.linkedDocuments}/${audit.documents} docs linked, `
        + `${audit.scripts - audit.deadScripts.length}/${audit.scripts} scripts live, `
        + `${audit.pipelines - audit.deadPipelines.length}/${audit.pipelines} pipeline files reached, `
        + `${audit.runtimeDependencies.length} runtime dependencies`);
    }
    return passed ? 0 : 1;
  } catch (error) {
    if (asJson) console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
    else console.error(`check:cruft: ${(error as Error).message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
