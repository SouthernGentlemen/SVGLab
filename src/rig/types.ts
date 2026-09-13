/** The shapes `rigs/<name>.rig.json` is read into. Nothing here is derived; it is the file. */

export type Point = readonly [number, number];

export interface Bone {
  readonly name: string;
  readonly parent: string | null;
  readonly offset: Point;
  /** End Site for a bone with no child: how far it reaches, and nothing about how it moves. */
  readonly tip: Point | null;
  readonly slot: string;
  readonly artHeight: number;
  readonly hand: string | null;
}

export interface Anchor {
  readonly at: Point;
  readonly note?: string;
}

export interface Sockets {
  readonly minimumOverlap: number;
  readonly maximumWidthStep: number;
}

export interface CosmeticKind {
  readonly anchor: string;
  readonly layer: string;
  readonly follows: string;
  readonly mirror?: string;
  readonly note?: string;
}

export interface Wardrobe {
  readonly required: readonly string[];
  readonly optional: readonly string[];
  readonly alignDefault: string;
  readonly kinds: Readonly<Record<string, CosmeticKind>>;
}

export interface Space {
  readonly units: string;
  readonly x: string;
  readonly y: string;
  readonly rotation: string;
  readonly height: number;
  readonly viewBox: readonly [number, number, number, number];
}

export interface BvhLayout {
  readonly frameRate: number;
  readonly frameTime: number;
  readonly rootChannels: readonly string[];
  readonly jointChannels: readonly string[];
  readonly planarRotationChannel: string;
  readonly rotationSign: number;
  readonly rootOffset: readonly [number, number, number];
  readonly rootRestHeight: number;
  readonly decimals: number;
}

export interface Exchange {
  readonly blender: {
    readonly axes: Readonly<Record<string, string>>;
    readonly unitScale: number;
    readonly boneRoll: number;
  };
  readonly bvh: BvhLayout;
}

export interface Naming {
  readonly charset: string;
  readonly separator: string;
  readonly maxLength: number;
}

export type DepthSide = "far" | "near";

export interface DepthProfile {
  readonly underLowerBody: DepthSide | null;
  readonly behindTorso: DepthSide | null;
  readonly foreground: readonly DepthSide[];
  readonly head: "above-arms" | "below-arms";
}

export interface DepthSides {
  readonly arms: { readonly far: string; readonly near: string };
  readonly legs: { readonly far: string; readonly near: string };
}

export interface DepthProfiles {
  readonly profiles: Readonly<Record<string, DepthProfile>>;
  readonly sides: {
    readonly facingRight: DepthSides;
    readonly facingLeft: DepthSides;
  };
  readonly byClip: Readonly<Record<string, string>>;
  readonly default: string;
}

export interface RigContract {
  readonly contract: number;
  readonly id: string;
  readonly space: Space;
  readonly root: string;
  readonly bones: readonly Bone[];
  readonly anchors: Readonly<Record<string, Readonly<Record<string, Anchor>>>>;
  readonly depthSlots: readonly string[];
  readonly paintOrder: readonly string[];
  readonly documentOrder: Readonly<Record<string, readonly string[]>>;
  readonly depthProfiles: DepthProfiles;
  readonly sockets: Sockets;
  readonly wardrobe: Wardrobe;
  readonly footprint: { readonly mode: string; readonly invariants: readonly string[]; readonly baseline: string };
  readonly exchange: Exchange;
  readonly naming: Naming;
}

/** A bone with its children resolved, which the file does not store because it is derivable. */
export interface RigBone extends Bone {
  readonly children: readonly string[];
}

export interface Rig {
  readonly contract: RigContract;
  readonly root: string;
  readonly bones: readonly RigBone[];
  readonly byName: ReadonlyMap<string, RigBone>;
}
