import { AUTHORED_CLIPS } from "./generated/authored";
import { clipOrigin } from "./clips";
import type { ClipName } from "./clips";

export const WEAPONS = [
  { id: "unarmed", name: "Unarmed" },
  { id: "sword", name: "Sword" },
] as const;

export type WeaponId = (typeof WEAPONS)[number]["id"];

export interface AnimationMoveSet {
  readonly id: string;
  readonly name: string;
  readonly clips: Readonly<Record<string, ClipName>>;
}

/** Locomotion shared by every class/loadout. Weapon sets layer their neutral and attacks on top. */
export const GENERIC_MOVESET = {
  id: "generic",
  name: "Generic",
  clips: {
    crouch: "bnrCrouchNormal",
    walk: "bnrWalkNormal",
    run: "bnrRunNormal",
    dash: "bnrDashNormal",
  },
} as const satisfies AnimationMoveSet;

export const UNARMED_MOVESET = {
  id: "unarmed",
  name: "Unarmed",
  clips: {
    neutral: "bnrIdleNormal",
    primary: "bnrStrikeNormal",
    study: "bnrPunchStudyNormal",
  },
} as const satisfies AnimationMoveSet;

export const SWORD_MOVESET = {
  id: "sword",
  name: "Sword",
  clips: {
    neutral: "bnrSwordGuardNormal",
    primary: "bnrSwordSlashNormal",
    secondary: "bnrSwordCutNormal",
    study: "bnrSlashStudyNormal",
  },
} as const satisfies AnimationMoveSet;

export const WEAPON_MOVESETS = {
  unarmed: UNARMED_MOVESET,
  sword: SWORD_MOVESET,
} as const satisfies Record<WeaponId, AnimationMoveSet>;

export interface PreviewClipOption {
  readonly clip: ClipName;
  readonly group: "generic" | WeaponId | "authored";
  readonly slot: string;
}

function clipOptions(group: PreviewClipOption["group"], moveset: AnimationMoveSet): PreviewClipOption[] {
  return Object.entries(moveset.clips).map(([slot, clip]) => ({ group, slot, clip }));
}

/**
 * Imported clips that no moveset slot claims yet.
 *
 * A clip that came back from an external tool has to be watchable, or a hand-tweaked pose
 * cannot be reviewed before anything adopts it. One that replaced a moveset clip outright is
 * already listed under that slot; the rest show up here against the loadout they belong to,
 * labelled with the clip they were tweaked from.
 */
function authoredReviewOptions(weapon: WeaponId, listed: readonly ClipName[]): PreviewClipOption[] {
  const loadout = new Set<string>([
    ...Object.values(GENERIC_MOVESET.clips),
    ...Object.values(WEAPON_MOVESETS[weapon].clips),
  ]);
  return (Object.keys(AUTHORED_CLIPS) as ClipName[])
    .filter((clip) => !listed.includes(clip))
    .filter((clip) => {
      const origin = clipOrigin(clip);
      return origin === null || loadout.has(origin);
    })
    .map((clip) => ({ group: "authored" as const, slot: clipOrigin(clip) ?? "new", clip }));
}

export function previewClipOptions(weapon: WeaponId): PreviewClipOption[] {
  const moveset = [
    ...clipOptions("generic", GENERIC_MOVESET),
    ...clipOptions(weapon, WEAPON_MOVESETS[weapon]),
  ];
  return [...moveset, ...authoredReviewOptions(weapon, moveset.map((entry) => entry.clip))];
}

export function previewClipNames(weapon: WeaponId): ClipName[] {
  return previewClipOptions(weapon).map((entry) => entry.clip);
}

export function defaultPreviewClip(weapon: WeaponId): ClipName {
  return WEAPON_MOVESETS[weapon].clips.neutral;
}

export function previewMovesetName(weapon: WeaponId): string {
  return `${GENERIC_MOVESET.name} + ${WEAPON_MOVESETS[weapon].name}`;
}
