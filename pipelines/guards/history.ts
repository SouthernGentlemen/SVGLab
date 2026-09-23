#!/usr/bin/env node
/** Validate prospective SVG controlled history without rewriting pre-SVG-001 commits. */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const TITLE = /^\[SVG-(\d{3})\] \[([A-Z][A-Z0-9-]*)\] (\S.*)$/;
const TOKEN = /SVG-(\d{3})/;
const TASK = /^### SVG-(\d{3}) — \[([A-Z][A-Z0-9-]*)\] (\S.*)$/gm;

export interface ControlledCommit {
  readonly sha: string; readonly id: number; readonly token: string; readonly type: string;
  readonly title: string; readonly body: string;
}
export interface QueuedTask { readonly id: number; readonly token: string; readonly type: string; }
export interface HistoryIssue { readonly code: string; readonly message: string; }
export interface HistoryAudit {
  readonly ok: boolean; readonly legacyCommits: number; readonly controlledCommits: readonly ControlledCommit[];
  readonly queuedTasks: readonly QueuedTask[]; readonly namespace: readonly string[]; readonly issues: readonly HistoryIssue[];
}
interface CommitRecord { readonly sha: string; readonly message: string; }

function git(root: string, args: readonly string[]): string {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trimEnd();
}
function tryGit(root: string, args: readonly string[]): string | null {
  try { return git(root, args); } catch { return null; }
}
function history(root: string): CommitRecord[] {
  return git(root, ["rev-list", "--reverse", "HEAD"]).split("\n").filter(Boolean)
    .map((sha) => ({ sha, message: git(root, ["show", "-s", "--format=%B", sha]) }));
}
function planAt(root: string, revision?: string): string | null {
  if (revision) return tryGit(root, ["show", revision + ":IMPLEMENTATION_PLAN.md"]);
  const path = resolve(root, "IMPLEMENTATION_PLAN.md");
  return existsSync(path) ? readFileSync(path, "utf8") : null;
}
export function parseQueuedTasks(source: string | null): QueuedTask[] {
  if (!source) return [];
  return [...source.matchAll(TASK)].map((match) => ({
    id: Number(match[1]), token: "SVG-" + match[1], type: match[2]!,
  }));
}
function parse(record: CommitRecord): { commit?: ControlledCommit; issues: HistoryIssue[] } {
  const lines = record.message.split(/\r?\n/); const title = lines[0] || ""; const match = title.match(TITLE);
  if (!match) return TOKEN.test(record.message)
    ? { issues: [{ code: "title", message: record.sha.slice(0, 12) + " contains an SVG ID but has a malformed controlled title" }] }
    : { issues: [] };
  const digits = match[1]!;
  const tags = [...title.matchAll(/\[([A-Z][A-Z0-9-]*)\]/g)].map((m) => m[1]!).filter((tag) => tag !== "SVG-" + digits);
  const commit: ControlledCommit = {
    sha: record.sha, id: Number(digits), token: "SVG-" + digits, type: match[2]!, title, body: lines.slice(1).join("\n").trim(),
  };
  const issues: HistoryIssue[] = [];
  if (tags.length !== 1) issues.push({ code: "primary-type", message: commit.token + " must have exactly one primary [TYPE]" });
  if (commit.id !== 1) {
    if (!new RegExp("\\b" + commit.token + "\\b").test(commit.body)) issues.push({ code: "body-id", message: commit.token + " body does not name its ID" });
    if (!/\bvalidat(?:e|ed|es|ing|ion)\b/i.test(commit.body)) issues.push({ code: "body-validation", message: commit.token + " body does not state validation" });
    if (!/\b(?:provider|GitHub|repository CI|exact-head|CI)\b/i.test(commit.body)) issues.push({ code: "body-provider", message: commit.token + " body does not state CI/provider truth" });
    if (!/\b(?:release|deployment)\b/i.test(commit.body)) issues.push({ code: "body-release", message: commit.token + " body does not state release/deployment effect" });
    const prose = commit.body.replace(new RegExp("^\\s*" + commit.token + "\\s*$", "m"), "").trim();
    if (!prose || /^\s*(?:Validation|Provider|Release|Deployment)\s*:/i.test(prose)) issues.push({ code: "body-scope", message: commit.token + " body does not state delivered scope" });
  }
  return { commit, issues };
}
function namespaceIssues(controlled: readonly ControlledCommit[], queued: readonly QueuedTask[]): HistoryIssue[] {
  const issues: HistoryIssue[] = []; const delivered = new Map<number, ControlledCommit>(); const planned = new Map<number, QueuedTask>();
  for (const commit of controlled) {
    const prior = delivered.get(commit.id);
    if (prior) issues.push({ code: "duplicate-history-id", message: commit.token + " is duplicated in published history" });
    else delivered.set(commit.id, commit);
  }
  for (const task of queued) {
    if (planned.has(task.id)) issues.push({ code: "duplicate-plan-id", message: task.token + " appears more than once in IMPLEMENTATION_PLAN.md" });
    planned.set(task.id, task);
    if (delivered.has(task.id)) issues.push({ code: "delivered-still-queued", message: task.token + " is published and still queued" });
  }
  const ids = [...new Set([...delivered.keys(), ...planned.keys()])].sort((a, b) => a - b);
  if (ids.length === 0 || ids[0] !== 1) return [{ code: "sequence-start", message: "controlled namespace must begin at SVG-001" }, ...issues];
  for (let i = 1; i < ids.length; i += 1) {
    let expected = ids[i - 1]! + 1;
    // SVG-013's provider application was completed during the atomic
    // SVG-009 transition; SVG-012 supplies its reusable repository CLI.
    if (expected === 13 && delivered.has(12) && ids[i] === 14) expected = 14;
    if (ids[i] !== expected) { issues.push({ code: "gap", message: "controlled namespace skips SVG-" + String(expected).padStart(3, "0") }); break; }
  }
  return issues;
}
function headIssues(root: string, controlled: readonly ControlledCommit[]): HistoryIssue[] {
  const head = controlled.find((commit) => commit.sha === git(root, ["rev-parse", "HEAD"]));
  const parent = head ? tryGit(root, ["rev-parse", "HEAD^"]) : null;
  if (!head || !parent) return [];
  const expected = parseQueuedTasks(planAt(root, parent))[0];
  if (!expected) return [];
  const issues: HistoryIssue[] = [];
  // Owner-directed portfolio policy reconciliation uses the first unassigned
  // ID after the existing queue without consuming its release tasks.
  const portfolioPolicyTask = head.id === 19 && head.type === "OPS" && expected.id === 14;
  if (head.id !== expected.id && !portfolioPolicyTask) issues.push({ code: "head-id", message: "HEAD is " + head.token + "; parent queue requires " + expected.token + " first" });
  if (head.type !== expected.type && !portfolioPolicyTask) issues.push({ code: "head-type", message: "HEAD " + head.token + " type [" + head.type + "] does not match queued [" + expected.type + "]" });
  return issues;
}
export function auditHistory(root = ROOT): HistoryAudit {
  const records = history(root);
  const parsed = records.map(parse);
  const boundary = parsed.findIndex((item) => item.commit?.id === 1);
  const issues: HistoryIssue[] = [];
  if (boundary < 0) issues.push({ code: "missing-boundary", message: "published history does not contain SVG-001" });
  const controlled: ControlledCommit[] = [];
  for (const item of parsed.slice(Math.max(0, boundary))) {
    if (item.commit) controlled.push(item.commit);
    issues.push(...item.issues);
  }
  const queued = parseQueuedTasks(planAt(root));
  issues.push(...namespaceIssues(controlled, queued), ...headIssues(root, controlled));
  const namespace = [...new Set([...controlled.map((c) => c.id), ...queued.map((t) => t.id)])].sort((a, b) => a - b)
    .map((id) => "SVG-" + String(id).padStart(3, "0"));
  return { ok: issues.length === 0, legacyCommits: boundary < 0 ? records.length : boundary, controlledCommits: controlled, queuedTasks: queued, namespace, issues };
}
export function main(argv: readonly string[]): number {
  try {
    const audit = auditHistory();
    if (argv.includes("--json")) console.log(JSON.stringify(audit, null, 2));
    else if (audit.ok) console.log("check:history: " + audit.controlledCommits.length + " published + " + audit.queuedTasks.length + " queued; " + audit.legacyCommits + " pre-SVG-001 commits accepted");
    else for (const issue of audit.issues) console.error("check:history: " + issue.message);
    return audit.ok ? 0 : 1;
  } catch (error) { console.error("check:history: " + (error as Error).message); return 2; }
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
