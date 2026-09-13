#!/usr/bin/env node
/**
 * check:sockets — exhaustively prove that every inline limb part joins every matching part.
 *
 *   node pipelines/guards/sockets.ts          # human-readable sweep
 *   node pipelines/guards/sockets.ts --json   # machine-readable sweep
 *
 * Three sheets make nine parent/child combinations at each of the four knees and elbows:
 * 36 assemblies today. A width step is reported but does not fail; overlap below the rig's
 * declared minimum does fail. The guard measures source pixels in the exact fitted frame the
 * tracer uses, and check:sprites runs before it so those pixels and the committed SVGs agree.
 */

import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { Rig, RigBone } from "../../src/rig/types.ts";
import { characterIds, loadBuildRig, sidecarFor } from "../sprite/build.ts";
import { measureFit, partPivot } from "../sprite/fit.ts";
import type { PartPoint } from "../sprite/fit.ts";
import { decodePng } from "../sprite/png.ts";
import { assignSlots, findIslands } from "../sprite/segment.ts";
import type { Island } from "../sprite/segment.ts";
import { cutIsland } from "../sprite/part.ts";
import type { RasterPart } from "../sprite/trace.ts";
import { ALPHA_FLOOR } from "../sprite/trace.ts";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

interface PartGeometry {
  readonly raster: RasterPart;
  readonly pivot: PartPoint;
  readonly scale: number;
  readonly firstRow: number;
  readonly lastRow: number;
}

interface SocketSheet {
  readonly id: string;
  readonly parts: ReadonlyMap<string, PartGeometry>;
}

export interface SocketPairing {
  readonly joint: string;
  readonly parent: string;
  readonly child: string;
  readonly overlap: number;
  readonly parentWidth: number;
  readonly childWidth: number;
  readonly widthStep: number;
}

export interface SocketSweep {
  readonly pairings: readonly SocketPairing[];
  readonly joints: readonly string[];
  readonly minimumOverlap: number;
  readonly worstWidthStep: number;
  readonly overlapFailures: readonly SocketPairing[];
  readonly widthWarnings: readonly SocketPairing[];
}

function opaqueRows(part: RasterPart): { firstRow: number; lastRow: number } {
  let firstRow = part.height;
  let lastRow = -1;
  for (let index = 0; index < part.width * part.height; index++) {
    if (part.rgba[index * 4 + 3] < ALPHA_FLOOR) continue;
    const row = Math.floor(index / part.width);
    firstRow = Math.min(firstRow, row);
    lastRow = Math.max(lastRow, row);
  }
  if (lastRow === -1) throw new Error("socket geometry: traced part has no opaque pixels");
  return { firstRow, lastRow };
}

function geometryFor(
  island: Island,
  slot: string,
  raster: RasterPart,
  scale: number,
  pivotOverride?: readonly [number, number],
): PartGeometry {
  return { raster, pivot: partPivot(slot, island, pivotOverride), scale, ...opaqueRows(raster) };
}

function loadSheet(id: string, rig: Rig): SocketSheet {
  const atlas = decodePng(join(ROOT, "characters", id, "atlas.png"));
  const { labels, islands } = findIslands(atlas);
  const slots = assignSlots(islands, { source: id });
  const { scales } = measureFit(slots, rig);
  const pivots = sidecarFor(id).pivots ?? {};
  const parts = new Map<string, PartGeometry>();
  for (const bone of rig.bones) {
    const island = slots.get(bone.slot);
    if (!island) throw new Error(`${id}: no ${bone.slot} for socket ${bone.name}`);
    parts.set(bone.name, geometryFor(
      island,
      bone.slot,
      cutIsland(atlas, labels, island),
      scales[bone.slot],
      pivots[bone.slot],
    ));
  }
  return { id, parts };
}

/** The four in-line joints: knees and elbows. Branch joints have no single shared seam axis. */
export function inlineJoints(rig: Rig): readonly RigBone[] {
  return rig.bones.filter((bone) => bone.parent !== null && bone.offset[0] === 0 && bone.offset[1] > 0);
}

function reachPastJoint(parent: PartGeometry, jointY: number): number {
  const bottom = (parent.lastRow + 1 - parent.pivot.y) * parent.scale;
  return bottom - jointY;
}

function startsBelowJoint(child: PartGeometry): number {
  return (child.firstRow - child.pivot.y) * child.scale;
}

/** Widest opaque cross-section in a minimum-overlap band centred on the joint. */
function socketWidth(part: PartGeometry, from: number, to: number): number {
  let widest = 0;
  for (let row = 0; row < part.raster.height; row++) {
    const top = (row - part.pivot.y) * part.scale;
    const bottom = (row + 1 - part.pivot.y) * part.scale;
    if (bottom < from || top > to) continue;
    let first = part.raster.width;
    let last = -1;
    for (let x = 0; x < part.raster.width; x++) {
      if (part.raster.rgba[(row * part.raster.width + x) * 4 + 3] < ALPHA_FLOOR) continue;
      first = Math.min(first, x);
      last = Math.max(last, x);
    }
    if (last !== -1) widest = Math.max(widest, (last - first + 1) * part.scale);
  }
  return widest;
}

export function sweepSockets(rig = loadBuildRig(), ids = characterIds()): SocketSweep {
  const sheets = ids.map((id) => loadSheet(id, rig));
  const joints = inlineJoints(rig);
  if (sheets.length === 0) throw new Error("no character atlases found for the socket sweep");
  if (joints.length === 0) throw new Error("the rig declares no in-line joints for the socket sweep");
  const minimum = rig.contract.sockets.minimumOverlap;
  const maximumStep = rig.contract.sockets.maximumWidthStep;
  const pairings: SocketPairing[] = [];

  for (const childBone of joints) {
    const parentBone = rig.byName.get(childBone.parent!)!;
    for (const parentSheet of sheets) {
      for (const childSheet of sheets) {
        const parent = parentSheet.parts.get(parentBone.name)!;
        const child = childSheet.parts.get(childBone.name)!;
        const overlap = reachPastJoint(parent, childBone.offset[1]) - startsBelowJoint(child);
        const parentWidth = socketWidth(
          parent,
          childBone.offset[1] - minimum,
          childBone.offset[1] + minimum,
        );
        const childWidth = socketWidth(child, -minimum, minimum);
        pairings.push({
          joint: `${parentBone.name}/${childBone.name}`,
          parent: parentSheet.id,
          child: childSheet.id,
          overlap,
          parentWidth,
          childWidth,
          widthStep: Math.abs(parentWidth - childWidth),
        });
      }
    }
  }

  return {
    pairings,
    joints: joints.map((bone) => `${bone.parent}/${bone.name}`),
    minimumOverlap: Math.min(...pairings.map((pairing) => pairing.overlap)),
    worstWidthStep: Math.max(...pairings.map((pairing) => pairing.widthStep)),
    overlapFailures: pairings.filter((pairing) => pairing.overlap < minimum),
    widthWarnings: pairings.filter((pairing) => pairing.widthStep > maximumStep),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export function main(argv: readonly string[]): number {
  const asJson = argv.includes("--json");
  try {
    const rig = loadBuildRig();
    const sweep = sweepSockets(rig);
    const ok = sweep.overlapFailures.length === 0;
    if (asJson) {
      console.log(JSON.stringify({
        ok,
        sheets: characterIds(),
        joints: sweep.joints,
        pairings: sweep.pairings.length,
        requiredOverlap: rig.contract.sockets.minimumOverlap,
        minimumOverlap: round(sweep.minimumOverlap),
        allowedWidthStep: rig.contract.sockets.maximumWidthStep,
        worstWidthStep: round(sweep.worstWidthStep),
        overlapFailures: sweep.overlapFailures,
        widthWarnings: sweep.widthWarnings,
      }, null, 2));
    } else {
      for (const pairing of sweep.overlapFailures) {
        console.error(`${pairing.joint}: ${pairing.parent} -> ${pairing.child} overlaps ${round(pairing.overlap)}, `
          + `below ${rig.contract.sockets.minimumOverlap}`);
      }
      for (const pairing of sweep.widthWarnings) {
        console.warn(`${pairing.joint}: ${pairing.parent} -> ${pairing.child} width step ${round(pairing.widthStep)}, `
          + `past ${rig.contract.sockets.maximumWidthStep} (reported, not failed)`);
      }
      console.log(`check:sockets: ${sweep.pairings.length} pairings across ${sweep.joints.length} joints; `
        + `minimum overlap ${round(sweep.minimumOverlap)}, worst width step ${round(sweep.worstWidthStep)}`);
    }
    return ok ? 0 : 1;
  } catch (error) {
    if (asJson) console.log(JSON.stringify({ ok: false, error: (error as Error).message }, null, 2));
    else console.error(`check:sockets: ${(error as Error).message}`);
    return 2;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(main(process.argv.slice(2)));
}
