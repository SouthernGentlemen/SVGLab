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
dash presents airborne and hit-reaction states, and the selected punch presents the basic
attack. The run, dash, and full punch study also remain directly inspectable in the preview.

For the strike, source frames 24–44 select the first punch, its 30 FPS timing is warped to the
existing 20-tick move, and source frame 30 maps to tick 6 inside the authoritative active
window at ticks 5–7. Combat still owns movement, that window, the hitbox, damage, hitstop, and
whether contact succeeds.
