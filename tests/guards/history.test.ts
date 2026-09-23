import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { auditHistory } from "../../pipelines/guards/history.ts";

const ROOT = dirname(dirname(dirname(fileURLToPath(import.meta.url))));
const roots: string[] = []; let serial = 0;
function git(root: string, args: readonly string[]): string { return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim(); }
function sandbox(): string {
  const root = mkdtempSync(join(tmpdir(), "svglab-history-")); roots.push(root); git(root, ["init", "-b", "main"]);
  git(root, ["config", "user.name", "history fixture"]); git(root, ["config", "user.email", "history@example.invalid"]); return root;
}
function body(id: string): string { return id + "\n\nScope: fixture delivery.\n\nValidation: fixture validation passed.\n\nProvider: fixture CI unavailable.\n\nRelease/deployment: none."; }
function task(id: string, type: string): string { return "### " + id + " — [" + type + "] Fixture task"; }
function plan(...tasks: readonly string[]): string { return "# Active implementation plan\n\n## Open tasks\n\n" + tasks.join("\n\n") + "\n"; }
function commit(root: string, title: string, messageBody: string, queue?: string | null): void {
  serial += 1; writeFileSync(join(root, "fixture-" + serial + ".txt"), title + "\n");
  if (queue === null) {
    if (existsSync(join(root, "IMPLEMENTATION_PLAN.md"))) rmSync(join(root, "IMPLEMENTATION_PLAN.md"));
  } else if (queue !== undefined) writeFileSync(join(root, "IMPLEMENTATION_PLAN.md"), queue);
  git(root, ["add", "-A"]); git(root, ["commit", "-m", title, "-m", messageBody]);
}
afterEach(() => { while (roots.length) rmSync(roots.pop()!, { recursive: true, force: true }); });

describe("prospective SVG controlled history", () => {
  it("accepts the repository controlled history and queue", () => { const audit = auditHistory(ROOT); expect(audit.issues).toEqual([]); expect(audit.namespace[0]).toBe("SVG-001"); });
  it("accepts legacy commits before SVG-001", () => { const root = sandbox(); commit(root, "Legacy commit", "old"); commit(root, "[SVG-001] [DOCS] Start queue", "planning"); const audit = auditHistory(root); expect(audit.ok).toBe(true); expect(audit.legacyCommits).toBe(1); });
  it("rejects duplicate IDs", () => { const root = sandbox(); commit(root, "[SVG-001] [DOCS] Start queue", "planning"); commit(root, "[SVG-001] [TEST] Reuse ID", body("SVG-001")); expect(auditHistory(root).issues.map((i) => i.code)).toContain("duplicate-history-id"); });
  it("rejects gaps", () => { const root = sandbox(); commit(root, "[SVG-001] [DOCS] Start queue", "planning"); commit(root, "[SVG-003] [TEST] Skip ID", body("SVG-003")); expect(auditHistory(root).issues.map((i) => i.code)).toContain("gap"); });
  it("rejects malformed titles", () => { const root = sandbox(); commit(root, "[SVG-001] [DOCS] Start queue", "planning"); commit(root, "SVG-002 [TEST] Bad title", body("SVG-002")); expect(auditHistory(root).issues.map((i) => i.code)).toContain("title"); });
  it("rejects conflicting primary types", () => { const root = sandbox(); commit(root, "[SVG-001] [DOCS] Start queue", "planning"); commit(root, "[SVG-002] [TEST] [DOCS] Conflict", body("SVG-002")); expect(auditHistory(root).issues.map((i) => i.code)).toContain("primary-type"); });
  it("rejects malformed structured bodies", () => { const root = sandbox(); commit(root, "[SVG-001] [DOCS] Start queue", "planning"); commit(root, "[SVG-002] [TEST] Missing facts", "SVG-002\n\nScope: incomplete."); const codes = auditHistory(root).issues.map((i) => i.code); expect(codes).toContain("body-validation"); expect(codes).toContain("body-provider"); expect(codes).toContain("body-release"); });
  it("rejects a HEAD that skips its parent queue", () => { const root = sandbox(); commit(root, "[SVG-001] [DOCS] Start queue", "planning", plan(task("SVG-002", "TEST"), task("SVG-003", "BUILD"))); commit(root, "[SVG-003] [BUILD] Skip queue", body("SVG-003"), plan(task("SVG-002", "TEST"))); expect(auditHistory(root).issues.map((i) => i.code)).toContain("head-id"); });
  it("accepts a valid new controlled sequence", () => { const root = sandbox(); commit(root, "[SVG-001] [DOCS] Start queue", "planning", plan(task("SVG-002", "TEST"), task("SVG-003", "BUILD"))); commit(root, "[SVG-002] [TEST] Consume queue", body("SVG-002"), plan(task("SVG-003", "BUILD"))); expect(auditHistory(root).issues).toEqual([]); });
});
