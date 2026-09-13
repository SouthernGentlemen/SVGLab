#!/usr/bin/env node
/**
 * check:rig — the contract parses, the tree is a tree, and every cross-reference resolves.
 *
 *   node pipelines/guards/rig.ts                 # check every rig in rigs/
 *   node pipelines/guards/rig.ts rigs/x.rig.json # check one
 *   node pipelines/guards/rig.ts --json          # machine-readable summary
 *
 * Exits non-zero with the fix in the message. There is no --check mode because checking is all
 * this does.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { hierarchyOrder, validateRig } from "../../src/rig/contract.ts";
import { syncSchemas } from "../render/schemas.ts";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const named = args.filter((value) => !value.startsWith("--"));

function rigPaths(): string[] {
  if (named.length > 0) return named;
  try {
    return readdirSync("rigs").filter((name) => name.endsWith(".rig.json")).sort().map((name) => join("rigs", name));
  } catch {
    return [];
  }
}

const paths = rigPaths();
if (paths.length === 0) {
  console.error("check:rig: no rigs found. Expected at least one rigs/<name>.rig.json.");
  process.exit(2);
}

const reports: Array<Record<string, unknown>> = [];
let failed = false;

for (const path of paths) {
  try {
    const rig = validateRig(JSON.parse(readFileSync(path, "utf8")));
    const ordered = hierarchyOrder(rig);
    const anchors = Object.entries(rig.contract.anchors ?? {})
      .flatMap(([bone, points]) => Object.keys(points).map((name) => `${bone}.${name}`));
    reports.push({
      path,
      id: rig.contract.id,
      contract: rig.contract.contract,
      ok: true,
      bones: ordered.length,
      root: rig.root,
      leaves: ordered.filter((bone) => bone.children.length === 0).map((bone) => bone.name),
      anchors,
      depthSlots: rig.contract.depthSlots,
      cosmeticKinds: Object.keys(rig.contract.wardrobe?.kinds ?? {}),
      paintOrder: rig.contract.paintOrder,
    });
  } catch (error) {
    failed = true;
    reports.push({ path, ok: false, error: (error as Error).message });
  }
}

const schemas = syncSchemas(process.cwd(), true);
const staleSchemas = schemas.filter((schema) => schema.changed);
failed ||= staleSchemas.length > 0;

if (asJson) {
  console.log(JSON.stringify({ ok: !failed, rigs: reports, schemas, staleSchemas: staleSchemas.length }, null, 2));
} else {
  for (const report of reports) {
    if (report.ok) {
      console.log(`${report.path}  contract ${report.contract}  ${report.bones} bones, root ${report.root}, `
        + `${(report.anchors as string[]).length} anchors, ${(report.cosmeticKinds as string[]).length} cosmetic kinds`);
    } else {
      console.error(`${report.path}  ${report.error}`);
    }
  }
  for (const schema of staleSchemas) {
    console.error(`${schema.path} is stale (${schema.byteDelta >= 0 ? "+" : ""}${schema.byteDelta} bytes) — `
      + "run node pipelines/render/schemas.ts and review the schema diff");
  }
  if (staleSchemas.length === 0) console.log(`check:rig: ${schemas.length} authored schemas match the validator rules`);
}

process.exit(failed ? 1 : 0);
