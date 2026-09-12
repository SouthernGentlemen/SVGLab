# Motion import

SVGLab can turn selected 3D BVH captures into readable clips for its eleven-bone SVG rig.
The raw capture remains build-time input; the browser receives only generated TypeScript
keyframes, and combat remains authoritative for world movement and move timing.

## Bandai Namco source

The checked-in source subset comes from Bandai-Namco-Research-Motiondataset-1 at the pinned
revision recorded in `motions/bandai-namco-motiondataset-1.json`. It is licensed CC BY-NC 4.0.
Read `third_party/bandai-namco-motiondataset-1/NOTICE.md` and `LICENSE` before adding source
material or distributing an adaptation.

The upstream collection process smoothed capture noise, normalized actor proportions,
trimmed non-acting material, annotated content and style, and published BVH at 30 FPS. Its
published Blender script is a visualization aid, not a retargeter. SVGLab follows the same
clean-source, explicit-retarget, inspect-output shape with a deterministic local build.

## Pipeline

`npm run build:motions` performs these steps:

1. Parse each file's hierarchy and declared channel order instead of assuming fixed columns.
2. Resolve full 3D joint positions with forward kinematics. For joints with translation
   channels, reproduce Blender's reference-import behavior by treating the channel position
   as the animated local position relative to the rest skeleton; adding it to `OFFSET` would
   double Bandai Namco's limb lengths.
3. Project the selected captures' acting direction (`+Z`) and vertical axis (`+Y`) into SVG's
   right-facing, Y-down side view. The direction is verified from the punch hand trajectory;
   Blender's BVH importer axis labels describe its target scene convention, not this 2D view.
4. Collapse hips, spine, neck, limbs, hands, and feet into the SVG rig's eleven bones.
5. Convert world segment directions back into local rotations so nested SVG transforms remain correct.
6. Remove horizontal root travel while retaining proportionally scaled pelvis bob.
7. Resample 30 FPS capture time into the lab's 60 Hz tick domain.
8. Unwrap angles, close approved loop seams, and reduce channels under manifest tolerances.

The manifest is the authored record of source files, frame ranges, loop decisions, projection,
and tolerances. `src/animation/generated/bandai-namco.ts` is reproducible output and must not be
edited by hand. Run `npm run check:motions` to detect drift.

Bandai Namco-derived clips are the entire animation catalog. A guarded lead-in presents idle,
the walk presents ground movement, a grounded bow descent presents the compact stance, the
dash presents airborne and hit-reaction states, the selected punch presents the basic attack,
and a trimmed sword cut presents the sword slash. The run, dash, sword guard, full sword cut,
and both attack studies also remain directly inspectable in the preview.

For the strike, source frames 24–44 select the first punch, its 30 FPS timing is warped to the
existing 20-tick move, and source frame 30 maps to tick 6 inside the authoritative active
window at ticks 5–7. Combat still owns movement, that window, the hitbox, damage, hitstop, and
whether contact succeeds.

## Sword material

`slash` (content label 14) is the only armed-combat content in either published Bandai Namco
dataset. Dataset 2 holds locomotion, turning, waving, and raise-up material only, and dataset 1
carries slash in two takes, both in the `normal` style, so there are no sword style variants to
choose between.

Nothing in the capture holds a prop and SVGLab draws none, but the grip is measurable: the two
hands stay between 5 cm and 12 cm apart in every frame of take 001, and the retargeted arms
sweep together from about -9 to -130 degrees. The capture is a two-handed sword hold.

Take 001 is three overhead cuts from a near-stationary guard. Take 002 travels 126 cm and cuts
while stepping, which step 6 of the pipeline would flatten into a slash in place, so only take
001 is vendored.

The take yields four clips, each from its own window:

| Clip | Source frames | Role |
| --- | --- | --- |
| `bnrSwordGuardNormal` | 250–309 | The ready stance held between cuts, loop-closed into a sword guard. |
| `bnrSwordSlashNormal` | 60–84 | The first cut's descent, warped onto the 30-tick sword slash move. |
| `bnrSwordCutNormal` | 304–366 | The third cut at source timing: guard, raise, cut, step-through settle. |
| `bnrSlashStudyNormal` | 0–401 | The whole take, for selecting and re-selecting windows. |

`bnrSwordSlashNormal` is the only one combat consumes. Its window starts at the top of the
swing rather than at the guard, because 54 source frames of wind-up cannot be read inside a
move that has to answer a button: trimming to the descent puts the deepest forward hand reach
at source frame 72 on tick 15, inside the move's active window at ticks 14–17. The manifest
records that mapping and the build fails if it drifts.

The loop seam is a search result, not a guess. Scanning every window in the two stretches
between cuts for a seam under the manifest's 8 degree tolerance leaves 469 candidates;
frames 250–309 is the longest, so the guard loop is the full two seconds of settled stance.

## The sword slash move

`SWORD_SLASH` in `src/combat/content.ts` is the second authored move, and it is authored as
combat data rather than derived from the clip: 14 ticks of startup, 4 active, 12 of recovery,
with a blade hitbox reaching further than the fist for more damage, hitstun, and hitstop. `K`
commits to it, `J` still commits to the basic strike, and both land in the same `attack` state,
so the simulation only has to look up which frame data is running.

Presentation follows the committed move rather than the button: `animationSnapshot` reads
`fighter.move` and picks the sword clip for `sword`. The clip is warped onto the move's ticks,
never the other way around — combat still owns movement, the active window, the hitbox,
damage, hitstop, and whether contact succeeds.

`bnrSwordGuardNormal` and `bnrSwordCutNormal` remain preview-only. No combat state models a
drawn sword or a heavier committed swing yet, and adding one is a combat-content change with
its own frame data.
