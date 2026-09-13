import { anchorPoint, hasAnchor } from "../rig/contract.ts";
import type { Point, Rig } from "../rig/types.ts";

export type CosmeticAlign = "centre" | "top" | "bottom";

export interface CosmeticPiece {
  readonly kind: string;
  readonly height: number;
  readonly anchor?: string;
  readonly layer?: string;
  readonly align?: CosmeticAlign;
  readonly rotate?: number;
  readonly hides?: readonly string[];
  readonly fitted?: readonly string[];
  readonly mirror?: boolean | string;
}

export interface WardrobeSet {
  readonly contract: 1;
  readonly name: string;
  readonly rig: string;
  /** Piece ids in the atlas's row-major island order. */
  readonly islands: readonly string[];
  readonly pieces: Readonly<Record<string, CosmeticPiece>>;
}

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

const identifier = /^[a-z][a-z0-9-]*$/;

function invalid(id: string, message: string): never {
  throw new Error(`${id}: ${message}`);
}

/** Validate the wardrobe fields shared by authored pipelines and fetched browser assembly. */
export function validateWardrobeSet(value: unknown, id = "wardrobe"): WardrobeSet {
  if (typeof value !== "object" || value === null) invalid(id, "manifest is not an object");
  const set = value as Partial<WardrobeSet>;
  if (set.contract !== 1) invalid(id, `unsupported contract ${String(set.contract)}`);
  if (typeof set.name !== "string" || !set.name) invalid(id, "manifest has no name");
  if (typeof set.rig !== "string" || !set.rig) invalid(id, "manifest has no rig");
  if (!Array.isArray(set.islands) || set.islands.length === 0) invalid(id, "manifest has no atlas island order");
  if (typeof set.pieces !== "object" || set.pieces === null || Array.isArray(set.pieces)) {
    invalid(id, "manifest has no pieces map");
  }

  const pieceIds = Object.keys(set.pieces);
  if (pieceIds.length === 0) invalid(id, "manifest has no pieces");
  for (const pieceId of pieceIds) {
    if (!identifier.test(pieceId)) invalid(id, `piece id '${pieceId}' is not lowercase ASCII hyphen-separated`);
  }
  if (set.islands.length !== pieceIds.length || new Set(set.islands).size !== pieceIds.length
    || set.islands.some((pieceId) => !pieceIds.includes(pieceId))) {
    invalid(id, "islands is not a permutation of the piece ids");
  }

  for (const [pieceId, raw] of Object.entries(set.pieces)) {
    if (typeof raw !== "object" || raw === null) invalid(id, `piece '${pieceId}' is not an object`);
    const piece = raw as CosmeticPiece;
    const allowed = new Set(["kind", "height", "anchor", "layer", "align", "rotate", "hides", "fitted", "mirror"]);
    const unknown = Object.keys(raw).filter((field) => !allowed.has(field));
    if (unknown.length > 0) invalid(id, `piece '${pieceId}' has unknown fields: ${unknown.join(", ")}`);
    if (typeof piece.kind !== "string" || !piece.kind) invalid(id, `piece '${pieceId}' has no kind`);
    if (typeof piece.height !== "number" || !Number.isFinite(piece.height) || piece.height <= 0) {
      invalid(id, `piece '${pieceId}' height must be a positive finite rig-unit value`);
    }
    if (piece.anchor !== undefined && (typeof piece.anchor !== "string" || !piece.anchor)) {
      invalid(id, `piece '${pieceId}' has an invalid anchor`);
    }
    if (piece.layer !== undefined && (typeof piece.layer !== "string" || !piece.layer)) {
      invalid(id, `piece '${pieceId}' has an invalid layer`);
    }
    if (piece.align !== undefined && !(["centre", "top", "bottom"] as const).includes(piece.align)) {
      invalid(id, `piece '${pieceId}' has unknown align '${String(piece.align)}'`);
    }
    if (piece.rotate !== undefined && (typeof piece.rotate !== "number" || !Number.isFinite(piece.rotate))) {
      invalid(id, `piece '${pieceId}' rotate must be finite`);
    }
    for (const [field, values] of [["hides", piece.hides], ["fitted", piece.fitted]] as const) {
      if (values !== undefined && (!Array.isArray(values) || values.length === 0
        || values.some((entry) => typeof entry !== "string" || !entry)
        || new Set(values).size !== values.length)) {
        invalid(id, `piece '${pieceId}' ${field} must be a non-empty list of unique names`);
      }
    }
    if (piece.mirror !== undefined && typeof piece.mirror !== "boolean" && typeof piece.mirror !== "string") {
      invalid(id, `piece '${pieceId}' mirror must be boolean or an anchor name`);
    }
  }
  return set as WardrobeSet;
}

function placementFailure(set: WardrobeSet, pieceId: string, message: string): never {
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
  if (!piece) placementFailure(set, pieceId, "is not declared by the wardrobe");
  const kind = rig.contract.wardrobe.kinds[piece.kind];
  if (!kind) placementFailure(set, pieceId, `names unknown kind '${piece.kind}'`);
  const anchor = piece.anchor ?? kind.anchor;
  if (!hasAnchor(rig.contract, anchor)) placementFailure(set, pieceId, `names unknown anchor '${anchor}'`);
  const layer = piece.layer ?? kind.layer;
  if (!rig.contract.depthSlots.includes(layer)) placementFailure(set, pieceId, `names undeclared depth slot '${layer}'`);
  if (!Number.isFinite(sourceHeight) || sourceHeight <= 0) placementFailure(set, pieceId, "has no positive drawn height");
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

/** A pauldron becomes two placements here; renderers remain ignorant of cosmetic kinds. */
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
  if (!second) placementFailure(set, pieceId, "requests mirroring but its kind has no mirror anchor");
  if (!hasAnchor(rig.contract, second)) placementFailure(set, pieceId, `names unknown mirror anchor '${second}'`);
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
