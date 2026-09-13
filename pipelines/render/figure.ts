#!/usr/bin/env node
/** Render a figure's assembled wardrobe plus every selected part and cosmetic as SVG. */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Pose } from "../../src/clips/types.ts";
import { depthProfileName } from "../../src/render/place.ts";
import { sampleClip } from "../../src/rig/sample.ts";
import { buildCatalog } from "../motion/catalog.ts";
import { loadFigure, outputDelta, outputPath, renderSheet } from "./sheet.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALUE_FLAGS = new Set(["figure", "columns", "clip", "tick", "out"]);
const BOOLEAN_FLAGS = new Set(["check", "json"]);

interface Arguments {
  readonly figure: string;
  readonly columns: number;
  readonly clip: string | null;
  readonly tick: number;
  readonly out: string | null;
  readonly check: boolean;
  readonly json: boolean;
}

function integer(value: string | undefined, name: string, fallback: number, positive: boolean): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || (positive ? number <= 0 : number < 0)) {
    throw new Error(`--${name} must be a ${positive ? "positive" : "non-negative"} whole number`);
  }
  return number;
}

function parseArguments(argv: readonly string[]): Arguments {
  const values = new Map<string, string>();
  const booleans = new Set<string>();
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument '${token}'; use named flags`);
    const name = token.slice(2);
    if (VALUE_FLAGS.has(name)) {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`--${name} needs a value`);
      values.set(name, value);
    } else if (BOOLEAN_FLAGS.has(name)) booleans.add(name);
    else throw new Error(`unknown option --${name}`);
  }
  const figure = values.get("figure");
  if (!figure) throw new Error("pass --figure <id-or-path>");
  if (values.has("tick") && !values.has("clip")) throw new Error("--tick needs --clip <key>");
  return {
    figure,
    columns: integer(values.get("columns"), "columns", 4, true),
    clip: values.get("clip") ?? null,
    tick: integer(values.get("tick"), "tick", 0, false),
    out: values.get("out") ?? null,
    check: booleans.has("check"),
    json: booleans.has("json"),
  };
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function main(argv: readonly string[]): number {
  const wantsJson = argv.includes("--json");
  try {
    const args = parseArguments(argv);
    const figure = loadFigure(ROOT, args.figure);
    let pose: Pose = {};
    let profile = figure.rig.contract.depthProfiles.default;
    if (args.clip !== null) {
      const catalog = buildCatalog(ROOT);
      const available = { ...catalog.clips, ...catalog.studies };
      const clip = available[args.clip];
      if (!clip) throw new Error(`unknown clip '${args.clip}'; run npm run build:motions after authoring it`);
      if (args.tick > clip.duration) throw new Error(`--tick must be between 0 and ${clip.duration} for '${args.clip}'`);
      if (figure.rig.contract.id !== catalog.rig.contract.id) {
        throw new Error(`clip '${args.clip}' targets rig '${catalog.rig.contract.id}', not '${figure.rig.contract.id}'`);
      }
      const origin = catalog.origins[args.clip] ?? (args.clip in catalog.bandaiNamco || args.clip in catalog.studies ? args.clip : null);
      pose = sampleClip(clip, args.tick);
      profile = depthProfileName(figure.rig, args.clip, origin);
    }

    const noCosmetics = new Set<string>();
    const cells = [
      { label: "assembled", pose, profile },
      ...figure.rig.bones.map((bone) => ({
        label: `part · ${bone.slot}`,
        pose,
        profile,
        parts: new Set([bone.slot]),
        cosmetics: noCosmetics,
      })),
      ...figure.cosmetics.map((cosmetic) => ({
        label: `cosmetic · ${basename(cosmetic.reference, ".svg")}`,
        pose,
        profile,
        cosmetics: new Set([cosmetic.reference]),
      })),
    ];
    const poseLabel = args.clip === null ? "rest pose" : `${args.clip} · tick ${args.tick}`;
    const contents = renderSheet(
      figure,
      `${figure.manifest.name} · figure sheet`,
      `1 assembled · ${figure.rig.bones.length} parts · ${figure.cosmetics.length} cosmetics · ${poseLabel}`,
      args.columns,
      cells,
    );
    const path = outputPath(ROOT, args.out, `${figure.id}-figure.svg`);
    const delta = outputDelta(ROOT, path, contents);
    if (!args.check && delta.changed) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, contents);
    }
    const ok = !args.check || !delta.changed;
    const report = {
      ok,
      checked: args.check,
      figure: figure.id,
      pose: { clip: args.clip, tick: args.tick, profile },
      columns: args.columns,
      rows: Math.ceil(cells.length / args.columns),
      panels: cells.length,
      parts: figure.rig.bones.length,
      cosmetics: figure.cosmetics.length,
      ...delta,
      ...(ok ? {} : { fix: `run npm run render:figure -- --figure ${args.figure}` }),
    };
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else if (!ok) console.error(`render:figure: ${delta.output} is stale (${signed(delta.byteDelta)} bytes) — ${report.fix}`);
    else console.log(`render:figure: ${report.parts} parts and ${report.cosmetics} cosmetics in ${report.panels} panels; `
      + `${delta.bytes} bytes (${delta.changed ? `${signed(delta.byteDelta)} changed` : "unchanged"}) -> ${delta.output}`);
    return ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (wantsJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`render:figure: ${message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
