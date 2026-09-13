import { anchorPoint, hasAnchor } from "../../src/rig/contract.ts";
import type { Point, Rig } from "../../src/rig/types.ts";
import type { CosmeticPiece, WardrobeSet } from "./types.ts";

export interface CosmeticPlacement {
  readonly bone: string;
  readonly anchor: string;
  readonly point: Point;
  readonly layer: string;
  readonly scale: number;
  readonly rotate: number;
  readonly mirrored: boolean;
}

export interface CosmeticAsset {
  readonly width: number;
  readonly height: number;
}

function fail(set: WardrobeSet, pieceId: string, message: string): never {
  throw new Error(`${set.name}/${pieceId}: ${message}`);
}

function anchorBone(reference: string): string {
  return reference.slice(0, reference.indexOf("."));
}

function mirrorAnchor(piece: CosmeticPiece, inherited?: string): string | undefined {
  if (piece.mirror === false) return undefined;
  if (typeof piece.mirror === "string") return piece.mirror;
  if (piece.mirror === true && !inherited) return "";
  return inherited;
}

export function inspectCosmetic(source: string, pieceId: string, reference: string): CosmeticAsset {
  const ids = [...source.matchAll(/\bdata-cosmetic\s*=\s*(["'])([^"']+)\1/g)].map((match) => match[2]);
  if (ids.length !== 1 || ids[0] !== pieceId) {
    throw new Error(`${reference}: expected exactly data-cosmetic="${pieceId}"`);
  }
  const readDimension = (name: string): number => {
    const match = source.match(new RegExp(`\\bdata-${name}\\s*=\\s*["']([^"']+)["']`));
    const value = Number(match?.[1]);
    if (!Number.isFinite(value) || value <= 0) throw new Error(`${reference}: has no positive data-${name}`);
    return value;
  };
  return { width: readDimension("width"), height: readDimension("height") };
}

/** Resolve the primary instance without consulting a figure or any DOM state. */
export function resolveCosmetic(
  rig: Rig,
  set: WardrobeSet,
  pieceId: string,
  sourceHeight: number,
): CosmeticPlacement {
  const piece = set.pieces[pieceId];
  if (!piece) fail(set, pieceId, "is not declared by the wardrobe");
  const kind = rig.contract.wardrobe.kinds[piece.kind];
  if (!kind) fail(set, pieceId, `names unknown kind '${piece.kind}'`);
  const anchor = piece.anchor ?? kind.anchor;
  if (!hasAnchor(rig.contract, anchor)) fail(set, pieceId, `names unknown anchor '${anchor}'`);
  const layer = piece.layer ?? kind.layer;
  if (!rig.contract.depthSlots.includes(layer)) fail(set, pieceId, `names undeclared depth slot '${layer}'`);
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) fail(set, pieceId, "has no positive drawn height");
  return {
    bone: anchorBone(anchor),
    anchor,
    point: anchorPoint(rig, anchor),
    layer,
    scale: piece.height / sourceHeight,
    rotate: piece.rotate ?? 0,
    mirrored: false,
  };
}

/** A pauldron becomes two placements here; the renderer remains ignorant of cosmetic kinds. */
export function resolveCosmeticPlacements(
  rig: Rig,
  set: WardrobeSet,
  pieceId: string,
  sourceHeight: number,
): readonly CosmeticPlacement[] {
  const primary = resolveCosmetic(rig, set, pieceId, sourceHeight);
  const piece = set.pieces[pieceId];
  const kind = rig.contract.wardrobe.kinds[piece.kind];
  const second = mirrorAnchor(piece, kind.mirror);
  if (second === undefined) return [primary];
  if (!second) fail(set, pieceId, "requests mirroring but its kind has no mirror anchor");
  if (!hasAnchor(rig.contract, second)) fail(set, pieceId, `names unknown mirror anchor '${second}'`);
  return [primary, {
    bone: anchorBone(second),
    anchor: second,
    point: anchorPoint(rig, second),
    layer: primary.layer,
    scale: primary.scale,
    rotate: -primary.rotate,
    mirrored: true,
  }];
}

export function placementTransform(placement: CosmeticPlacement): string {
  const horizontal = placement.mirrored ? -placement.scale : placement.scale;
  return `translate(${placement.point[0]} ${placement.point[1]}) rotate(${placement.rotate}) scale(${horizontal} ${placement.scale})`;
}
