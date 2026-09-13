# Motion import

The deterministic retarget/catalog build and Blender round trip described here are live in
M2/M3. The combat section describes the M4 target.

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
and tolerances. `src/clips/generated/bandai-namco.ts` is reproducible output and must not be
edited by hand. Run `npm run check:motions` to detect drift.

Bandai Namco-derived clips are the entire animation catalog. A guarded lead-in presents idle,
the walk presents ground movement, a grounded bow descent presents the compact stance, the
dash presents airborne and hit-reaction states, the selected punch presents the basic attack,
and a trimmed sword cut presents the sword slash. The run, dash, sword guard, and full sword
cut remain shipped; the two attack studies rebuild into `out/` for authoring and never enter
shipped source.

For the strike, source frames 24–44 select the first punch, its 30 FPS timing is warped to the
existing 20-tick move, and source frame 30 maps to tick 6 inside the authoritative active
window at ticks 5–7. Combat still owns movement, that window, the hitbox, damage, hitstop, and
whether contact succeeds.

## Sword material

**Motion comes from a recording or it does not ship.** An earlier hand-authored swing sequence
produced exactly the failure this lab exists to expose: plausible-looking keyframes that did not
reproduce a real swing, with bad recovery arcs and ambiguous hand placement. Do not hand-author
an attack trajectory, do not stretch limb or blade geometry to reach a pose, do not infer
follow-through from a decorative arc, and do not call an inferred weapon axis "captured sword
motion" when the source only recorded the body. AI-generated sprite sheets and stick-figure
animation assets are ideation, not joint data: limb lengths drift and grips move between frames.

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

### Sources worth vendoring next

Neither capture holds a prop, so the blade is reconstructed from the body rather than recorded.
These record sword motion directly and are the preferred candidates for the next import. Keep
the original file and its licence beside it, add a manifest entry, and generate from that source.

- **Touché** (University of Bath / Ninja Theory) — <https://researchdata.bath.ac.uk/754/>.
  Vicon Bonita, ~26,000 frames at 30 fps, 24 joints, and **the position of both sword tips**.
  `animation_data.zip` is CC BY 4.0. The only candidate that records the weapon itself.
- **SFU Motion Capture Database — Kendo** — <https://mocap.cs.sfu.ca/>.
  `0015_BasicKendo001.bvh`, `0015_Kirikaeshi001.bvh`, `0015_KendoKata001.bvh`. Free for
  research; not for commercial products or resale.

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

## Round trip through an external tool

Clips are 2D nested-SVG rotations, which no animation tool reads. Two commands translate in
each direction, and a guard (`npm run check:exchange`) asserts that an untouched round trip
changes nothing.

```bash
npm run export:motions                      # every clip -> out/blender/<clip>.bvh
npm run export:motions -- bnrSwordCutNormal # or just one
npm run import:motions -- out/blender/bnrSwordCutNormal.bvh
npm run build:motions                       # fold the result into the catalog
```

### What the export contains

One BVH per clip, baked at one frame per 60 Hz tick through the same sampler
`src/rig/sample.ts` uses, so the file plays exactly what the lab plays rather than an
approximation of it. The skeleton is read from `rigs/fighter.rig.json`, never restated: same
eleven bones, same parents, same rest offsets. Beside the clips, `art/<bone>.svg` carries each
bone's literal-painted M1 part selected by a figure manifest, and `setup.py` puts the two
together. Export defaults to `figures/barst.json` and prints the choice; pass `--figure kiran`
(or another manifest) to select a different figure.

SVG points y down and turns clockwise-positive, so the rig is written into the XY plane as
`(x, -y)` with every bone turning about Z with the sign flipped. The root carries a zero
`OFFSET` and absolute local position channels, which keeps readers that add `OFFSET` to the
channels and readers that let the channels replace it in agreement. Every joint also carries
unused X and Y rotation channels so an editor has somewhere to put a mistake that this rig can
then report.

Import at scale 1 and set the scene to **60 FPS** before exporting anything back.

### Opening a clip in Blender

```bash
blender --python out/blender/setup.py -- bnrSwordCutNormal
```

Or inside Blender: Scripting tab, open `setup.py`, Run.

A BVH carries bones and animation and no character, so the script also imports every bone's
artwork and parents it to that bone. Without it a clip is eleven sticks in an empty plane,
which is not something anyone can review.

The script builds the armature itself rather than handing the file to Blender's BVH importer.
That importer rebuilds a skeleton with conventions of its own: on this rig it welds the head to
the chest's averaged tail and moves that joint six units, so the head would turn about a pivot
the lab never uses. The file's offsets are the rig, so they are read and applied directly, and
the scene was checked against the lab's own kinematics — every joint of every sampled tick
lands within 0.0001 units of where `sampleClip` puts it.

Two details the script handles because the rig is flat. Artwork is placed by measuring, not
assuming: each art file opens with a calibration corner at the bone's own origin, so whatever
an importer does to scale, offset or flip a document, the frame it produced can be read back
and inverted. And SVG has no z-index — document order is paint order — so each part is offset
a hair in depth along that order, which keeps the head over the collar and the near arm over
the chest instead of leaving a renderer to break the tie.

The fighter stands in Blender's XZ plane, about 110 units tall, at 60 FPS. Numpad 1 is the
view that matters; the depth axis carries nothing.

### What the import accepts

The rig is the contract. A file whose joints are renamed, reparented, added to, or whose rest
offsets no longer match is refused, because its numbers would describe a different skeleton and
mean something else on this one. A uniform scale is allowed and divided back out; a frame rate
other than 60 is refused with the fix in the message.

Which way the file draws the rig is measured rather than assumed. SVGLab writes its exports
y-up, Blender's BVH exporter writes the same skeleton z-up with its rotation channels in its
own order, and both are the same rig. So the drawing's own axes are read out of the offsets —
bones that move along one authored axis alone give it away — and the planar rotation is taken
from whichever channel turns about the depth those two axes imply, with the sign they imply.
`File → Export → Motion Capture (.bvh)` at 60 FPS therefore round trips as a table of zeros.

Everything the rig cannot hold is measured and reported rather than quietly dropped:
out-of-plane rotation (and which bones it came from), depth translation, and horizontal root
travel, which step 6 of the pipeline removes on purpose. The importer then reduces the dense
frames back to sparse keyframes under the manifest's own tolerances, so a round trip is lossless
to within 1 degree and 0.15 units — the same tolerances the retarget already reduces under.

### Where imported clips live

`motions/authored/<clip>.json` is tracked source, not build output: it is the one place a hand
edit survives. `npm run build:motions` turns the directory into
`src/clips/generated/authored.ts`, and `npm run check:motions` fails when the two disagree.

The key carries provenance. A `bnr*` clip is still an adaptation of Bandai Namco material under
CC BY-NC 4.0 and names the manifest clip it came from; a `lab*` clip was authored here on
SVGLab's rig and claims no other origin. An authored clip that keeps a manifest clip's key
replaces what the lab plays while the manifest keeps deriving the untouched original to compare
against — which is what `npm run import:motions -- out/blender/bnrSwordCutNormal.bvh` does by
default. Pass `--key` to land a tweak beside the original instead.

Imported clips inherit the presentation decisions made for the clip they came from: arm
layering and the rigid weapon track both fall back to the origin, and the preview lists any
clip no moveset slot claims in an `authored` group labelled with its origin. So a tweak is
watchable immediately, with the right limb depth and the blade still in both hands.

### Reviewing a change

`npm run import:motions` prints, and writes beside the BVH as `<clip>.review.md`, what the
import did: duration and keyframe counts against the origin, the loop seam, everything dropped,
and a per-bone table of the largest rotation and position change with the tick it happened on.
An untouched export imports as a table of zeros, so anything non-zero is a real edit.
