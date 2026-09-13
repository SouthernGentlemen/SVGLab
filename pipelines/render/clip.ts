#!/usr/bin/env node
/** Render sampled ticks from one clip as a deterministic SVG contact sheet. */

import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { depthProfileName } from "../../src/render/place.ts";
import { sampleClip } from "../../src/rig/sample.ts";
import { buildCatalog } from "../motion/catalog.ts";
import { loadFigure, outputDelta, outputPath, renderSheet, sampleTicks } from "./sheet.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const VALUE_FLAGS = new Set(["figure", "clip", "columns", "from", "to", "samples", "weapon", "facing", "out"]);
const BOOLEAN_FLAGS = new Set(["check", "json"]);

interface Arguments {
  readonly figure: string;
  readonly clip: string;
  readonly columns: number;
  readonly from: number;
  readonly to: number | null;
  readonly samples: number;
  readonly weapon: string | null;
  readonly facing: "right" | "left" | "both";
  readonly out: string | null;
  readonly check: boolean;
  readonly json: boolean;
}

function positiveInteger(value: string | undefined, name: string, fallback: number): number {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`--${name} must be a positive whole number`);
  return number;
}

function wholeTick(value: string | undefined, name: string, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) throw new Error(`--${name} must be a non-negative whole tick`);
  return number;
}

function facing(value: string | undefined): Arguments["facing"] {
  if (value === undefined) return "right";
  if (value === "right" || value === "left" || value === "both") return value;
  throw new Error("--facing must be right, left, or both");
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
  const clip = values.get("clip");
  if (!figure) throw new Error("pass --figure <id-or-path>");
  if (!clip) throw new Error("pass --clip <key>");
  return {
    figure,
    clip,
    columns: positiveInteger(values.get("columns"), "columns", 4),
    from: wholeTick(values.get("from"), "from", 0)!,
    to: wholeTick(values.get("to"), "to", null),
    samples: positiveInteger(values.get("samples"), "samples", 12),
    weapon: values.get("weapon") ?? null,
    facing: facing(values.get("facing")),
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
    const catalog = buildCatalog(ROOT);
    const available = { ...catalog.clips, ...catalog.studies };
    const clip = available[args.clip];
    if (!clip) throw new Error(`unknown clip '${args.clip}'; run npm run build:motions after authoring it`);
    const to = args.to ?? clip.duration;
    if (args.from > to || to > clip.duration) {
      throw new Error(`tick range must satisfy 0 <= --from <= --to <= ${clip.duration}`);
    }
    const figure = loadFigure(ROOT, args.figure, args.weapon === null ? [] : [args.weapon]);
    if (args.weapon !== null && figure.cosmetics.find((piece) => piece.reference === args.weapon)?.piece.kind !== "weapon") {
      throw new Error(`--weapon '${args.weapon}' does not name a wardrobe piece of kind 'weapon'`);
    }
    if (figure.rig.contract.id !== catalog.rig.contract.id) {
      throw new Error(`clip '${args.clip}' targets rig '${catalog.rig.contract.id}', not '${figure.rig.contract.id}'`);
    }
    const origin = catalog.origins[args.clip] ?? (args.clip in catalog.bandaiNamco || args.clip in catalog.studies ? args.clip : null);
    const profile = depthProfileName(figure.rig, args.clip, origin);
    const ticks = sampleTicks(args.from, to, args.samples);
    const facings = args.facing === "both" ? [-1, 1] as const : [args.facing === "left" ? -1 : 1] as const;
    const cells = ticks.flatMap((tick) => facings.map((direction) => ({
      label: `tick ${tick}${args.facing === "both" ? ` · ${direction === -1 ? "left" : "right"}` : ""}`,
      pose: sampleClip(clip, tick),
      profile,
      facing: direction,
    })));
    const contents = renderSheet(
      figure,
      `${figure.manifest.name} · ${args.clip}`,
      `${ticks.length} samples · ${args.facing} facing · ticks ${args.from}–${to} of ${clip.duration} · ${profile} depth`,
      args.columns,
      cells,
    );
    const weaponName = args.weapon === null ? "" : `-${basename(args.weapon, ".svg")}`;
    const facingName = args.facing === "right" ? "" : `-${args.facing}`;
    const path = outputPath(ROOT, args.out, `${figure.id}-${args.clip}${weaponName}${facingName}.svg`);
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
      clip: args.clip,
      duration: clip.duration,
      range: { from: args.from, to },
      columns: args.columns,
      rows: Math.ceil(cells.length / args.columns),
      samples: ticks.length,
      ticks,
      weapon: args.weapon,
      facing: args.facing,
      profile,
      ...delta,
      ...(ok ? {} : { fix: `run npm run render:clip -- --figure ${args.figure} --clip ${args.clip}`
        + (args.weapon === null ? "" : ` --weapon ${args.weapon}`) + (args.facing === "right" ? "" : ` --facing ${args.facing}`) }),
    };
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else if (!ok) console.error(`render:clip: ${delta.output} is stale (${signed(delta.byteDelta)} bytes) — ${report.fix}`);
    else console.log(`render:clip: ${ticks.length} samples (${args.facing} facing) across ${report.rows} rows; ${delta.bytes} bytes `
      + `(${delta.changed ? `${signed(delta.byteDelta)} changed` : "unchanged"}) -> ${delta.output}`);
    return ok ? 0 : 1;
  } catch (error) {
    const message = (error as Error).message;
    if (wantsJson) console.log(JSON.stringify({ ok: false, error: message }, null, 2));
    else console.error(`render:clip: ${message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
