import type { TraceOptions } from "../sprite/trace.ts";

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

export interface CosmeticTraceProfile {
  readonly default?: TraceOptions;
  readonly byPiece?: Readonly<Record<string, TraceOptions>>;
}

export interface WardrobeSet {
  readonly contract: 1;
  readonly name: string;
  readonly rig: string;
  /** Piece ids in the atlas's row-major island order. */
  readonly islands: readonly string[];
  readonly trace?: CosmeticTraceProfile;
  readonly pieces: Readonly<Record<string, CosmeticPiece>>;
}

const identifier = /^[a-z][a-z0-9-]*$/;

function fail(id: string, message: string): never {
  throw new Error(`${id}: ${message}`);
}

export function validateWardrobeSet(value: unknown, id = "wardrobe"): WardrobeSet {
  if (typeof value !== "object" || value === null) fail(id, "manifest is not an object");
  const set = value as Partial<WardrobeSet>;
  if (set.contract !== 1) fail(id, `unsupported contract ${String(set.contract)}`);
  if (typeof set.name !== "string" || !set.name) fail(id, "manifest has no name");
  if (typeof set.rig !== "string" || !set.rig) fail(id, "manifest has no rig");
  if (!Array.isArray(set.islands) || set.islands.length === 0) fail(id, "manifest has no atlas island order");
  if (typeof set.pieces !== "object" || set.pieces === null || Array.isArray(set.pieces)) {
    fail(id, "manifest has no pieces map");
  }

  const pieceIds = Object.keys(set.pieces);
  if (pieceIds.length === 0) fail(id, "manifest has no pieces");
  for (const pieceId of pieceIds) {
    if (!identifier.test(pieceId)) fail(id, `piece id '${pieceId}' is not lowercase ASCII hyphen-separated`);
  }
  if (set.islands.length !== pieceIds.length || new Set(set.islands).size !== pieceIds.length
    || set.islands.some((pieceId) => !pieceIds.includes(pieceId))) {
    fail(id, "islands is not a permutation of the piece ids");
  }

  for (const [pieceId, raw] of Object.entries(set.pieces)) {
    if (typeof raw !== "object" || raw === null) fail(id, `piece '${pieceId}' is not an object`);
    const piece = raw as CosmeticPiece;
    const allowed = new Set(["kind", "height", "anchor", "layer", "align", "rotate", "hides", "fitted", "mirror"]);
    const unknown = Object.keys(raw).filter((field) => !allowed.has(field));
    if (unknown.length > 0) fail(id, `piece '${pieceId}' has unknown fields: ${unknown.join(", ")}`);
    if (typeof piece.kind !== "string" || !piece.kind) fail(id, `piece '${pieceId}' has no kind`);
    if (typeof piece.height !== "number" || !Number.isFinite(piece.height) || piece.height <= 0) {
      fail(id, `piece '${pieceId}' height must be a positive finite rig-unit value`);
    }
    if (piece.anchor !== undefined && (typeof piece.anchor !== "string" || !piece.anchor)) {
      fail(id, `piece '${pieceId}' has an invalid anchor`);
    }
    if (piece.layer !== undefined && (typeof piece.layer !== "string" || !piece.layer)) {
      fail(id, `piece '${pieceId}' has an invalid layer`);
    }
    if (piece.align !== undefined && !(["centre", "top", "bottom"] as const).includes(piece.align)) {
      fail(id, `piece '${pieceId}' has unknown align '${String(piece.align)}'`);
    }
    if (piece.rotate !== undefined && (typeof piece.rotate !== "number" || !Number.isFinite(piece.rotate))) {
      fail(id, `piece '${pieceId}' rotate must be finite`);
    }
    for (const [field, values] of [["hides", piece.hides], ["fitted", piece.fitted]] as const) {
      if (values !== undefined && (!Array.isArray(values) || values.length === 0
        || values.some((entry) => typeof entry !== "string" || !entry)
        || new Set(values).size !== values.length)) {
        fail(id, `piece '${pieceId}' ${field} must be a non-empty list of unique names`);
      }
    }
    if (piece.mirror !== undefined && typeof piece.mirror !== "boolean" && typeof piece.mirror !== "string") {
      fail(id, `piece '${pieceId}' mirror must be boolean or an anchor name`);
    }
  }
  return set as WardrobeSet;
}
