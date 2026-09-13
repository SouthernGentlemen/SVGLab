#!/usr/bin/env node
/** Generate the authored JSON Schemas from the same constants the validators consume. */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

import {
  COSMETIC_REFERENCE_PATTERN_SOURCE,
  FIGURE_CONTRACT,
  FIGURE_ID_PATTERN_SOURCE,
  PART_REFERENCE_PATTERN_SOURCE,
} from "../../src/render/manifest.ts";
import { validateRig } from "../../src/rig/contract.ts";
import type { Rig } from "../../src/rig/types.ts";
import {
  AUTHORED_CLIP_FIELDS,
  AUTHORED_KEY_PATTERN_SOURCE,
  EASINGS,
  KEYFRAME_FIELDS,
  POSE_PROPERTIES,
} from "../motion/catalog.ts";
import { FIGURE_FIELDS } from "./manifest.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const SCHEMA_PATHS = ["rigs/authored-clip.schema.json", "rigs/figure.schema.json"] as const;
type Schema = Record<string, unknown>;

function authoredClipSchema(rig: Rig): Schema {
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://svglab.local/rigs/authored-clip.schema.json",
    title: "SVGLab authored clip",
    description: "Authored source at 60 Hz. build:motions also checks frame order, duration bounds, loop closure, file-name agreement, provenance, and rig references.",
    type: "object",
    additionalProperties: false,
    required: [...AUTHORED_CLIP_FIELDS],
    properties: {
      key: { type: "string", pattern: AUTHORED_KEY_PATTERN_SOURCE },
      derivedFrom: { type: ["string", "null"] },
      loop: { type: "boolean" },
      duration: { type: "integer", minimum: 1, description: "Duration in integer 60 Hz ticks." },
      easing: { enum: [...EASINGS] },
      note: { type: "string", minLength: 1, pattern: "\\S" },
      keyframes: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          additionalProperties: false,
          required: [...KEYFRAME_FIELDS],
          properties: {
            frame: { type: "integer", minimum: 0 },
            bones: {
              type: "object",
              propertyNames: { enum: rig.bones.map((bone) => bone.name).sort() },
              additionalProperties: { $ref: "#/$defs/bonePose" },
            },
          },
        },
      },
    },
    allOf: [
      {
        if: { properties: { key: { pattern: "^lab" } }, required: ["key"] },
        then: { properties: { derivedFrom: { type: "null" } } },
      },
      {
        if: { properties: { key: { pattern: "^bnr" } }, required: ["key"] },
        then: { properties: { derivedFrom: { type: "string", minLength: 1 } } },
      },
    ],
    $defs: {
      bonePose: {
        type: "object",
        additionalProperties: false,
        properties: Object.fromEntries(POSE_PROPERTIES.map((property) => [property, { type: "number" }])),
      },
    },
  };
}

function figureSchema(rig: Rig): Schema {
  const slots = rig.bones.map((bone) => bone.slot).sort();
  return {
    $schema: "https://json-schema.org/draft/2020-12/schema",
    $id: "https://svglab.local/rigs/figure.schema.json",
    title: "SVGLab figure manifest",
    description: "A complete selection of rig parts and fitted cosmetics. render:figure validates referenced files, bone ids, wardrobe declarations, and fit.",
    type: "object",
    additionalProperties: false,
    required: [...FIGURE_FIELDS],
    properties: {
      contract: { const: FIGURE_CONTRACT },
      name: { type: "string", minLength: 1, pattern: "\\S" },
      rig: { const: rig.contract.id, pattern: FIGURE_ID_PATTERN_SOURCE },
      parts: {
        type: "object",
        additionalProperties: false,
        required: slots,
        properties: Object.fromEntries(slots.map((slot) => [slot, {
          type: "string",
          pattern: PART_REFERENCE_PATTERN_SOURCE.replace("[a-z][a-z0-9_]*", slot),
        }])),
      },
      cosmetics: {
        type: "array",
        uniqueItems: true,
        items: { type: "string", pattern: COSMETIC_REFERENCE_PATTERN_SOURCE },
      },
    },
  };
}

export function generatedSchemas(root = ROOT): Readonly<Record<(typeof SCHEMA_PATHS)[number], string>> {
  const rig = validateRig(JSON.parse(readFileSync(join(root, "rigs", "fighter.rig.json"), "utf8")) as unknown);
  return {
    "rigs/authored-clip.schema.json": `${JSON.stringify(authoredClipSchema(rig), null, 2)}\n`,
    "rigs/figure.schema.json": `${JSON.stringify(figureSchema(rig), null, 2)}\n`,
  };
}

function portable(root: string, path: string): string {
  return relative(root, path).split(sep).join("/");
}

export function syncSchemas(root = ROOT, check = false): readonly {
  path: string;
  changed: boolean;
  bytes: number;
  previousBytes: number;
  byteDelta: number;
}[] {
  return Object.entries(generatedSchemas(root)).map(([reference, contents]) => {
    const path = join(root, reference);
    const previous = existsSync(path) ? readFileSync(path, "utf8") : "";
    if (!check && previous !== contents) writeFileSync(path, contents);
    return {
      path: portable(root, path),
      changed: previous !== contents,
      bytes: Buffer.byteLength(contents),
      previousBytes: Buffer.byteLength(previous),
      byteDelta: Buffer.byteLength(contents) - Buffer.byteLength(previous),
    };
  });
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  const check = argv.includes("--check");
  const unknown = argv.filter((argument) => argument !== "--json" && argument !== "--check");
  try {
    if (unknown.length > 0) throw new Error(`unknown option ${unknown[0]}`);
    const schemas = syncSchemas(ROOT, check);
    const changed = schemas.filter((schema) => schema.changed);
    const ok = !check || changed.length === 0;
    const report = {
      ok,
      checked: check,
      schemas,
      changed: changed.length,
      bytes: schemas.reduce((sum, schema) => sum + schema.bytes, 0),
      ...(ok ? {} : { fix: "run node pipelines/render/schemas.ts and review the schema diff" }),
    };
    if (asJson) console.log(JSON.stringify(report, null, 2));
    else if (!ok) {
      for (const schema of changed) console.error(`${schema.path} is stale (${schema.byteDelta >= 0 ? "+" : ""}${schema.byteDelta} bytes)`);
      console.error(report.fix);
    } else console.log(`${check ? "checked" : "generated"} ${schemas.length} schemas; ${report.bytes} bytes, ${changed.length} changed`);
    return ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (asJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`schemas: ${message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
