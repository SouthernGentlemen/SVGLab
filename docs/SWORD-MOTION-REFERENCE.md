# Sword motion reference

SVGLab sword attacks must come from recorded motion, not hand-authored stick-figure swings.

## Active source

The current sword preview uses the pinned Bandai Namco motion-capture source already vendored in the repository:

- repository: `BandaiNamcoResearchInc/Bandai-Namco-Research-Motiondataset`
- pinned revision: `74ead3ba1ae4696404e6086233779f60de8bf9ef`
- local source: `third_party/bandai-namco-motiondataset-1/data/dataset-1_slash_normal_001.bvh`
- manifest: `motions/bandai-namco-motiondataset-1.json`
- source rate: 30 fps
- license: CC BY-NC 4.0; see the vendored `LICENSE` and `NOTICE.md`

`bnrSwordGuardNormal`, `bnrSwordSlashNormal`, `bnrSwordCutNormal`, and `bnrSlashStudyNormal` are trimmed/retargeted windows of that same recorded slash motion. The BVH is authoritative for the body motion. It does **not** contain a sword-tip marker, so the current weapon axis is reconstructed from the captured arm/hand pose rather than claimed as a recorded sword trajectory.

## Weapon reconstruction

SVGLab keeps the weapon rigid while retargeting the captured motion to its smaller eleven-bone rig:

1. Sample the captured body clip normally.
2. Resolve the two retargeted hand endpoints from shoulder, elbow, and forearm rotations.
3. In the projected slash, source L (`arm-front`) is the guard-side hand. That ordering points the blade into the capture's +X attack direction at contact; reversing it points the blade backward.
4. Source R (`arm-back`) is the pommel-side hand.
5. Use the captured hand line to recover the handle angle and ideal center. Do not resize the sword to match captured hand spacing.
6. Place the selected fixed-size sword on that axis. Blade length, handle length, and grip spacing never change.
7. Because source and SVGLab proportions differ, translate the **whole rigid sword** to the nearest position where both fixed grip points are reachable by the fixed-length arms. The captured angle is preserved. The primary slash regression caps this retarget shift below 6 rig units for every frame and all three sword sizes.
8. Re-solve both arms onto the fixed handle grips. If either target still requires arm stretching, fail instead of silently clamping.
9. The blade extends away from the pommel through the guard. A hand may never lie on the blade.

Generic walk/run/crouch/dash captures were not recorded as sword attacks, so sword-equipped locomotion retains the fixed upright guard instead of pretending those hand tracks are weapon data.

## Rejected approach

The deleted `src/animation/sword-reference.ts` sequence was fabricated by hand. It produced exactly the failure this lab is supposed to expose: plausible-looking keyframes that did not reproduce a real swing, bad recovery arcs, and ambiguous hand/blade placement. It is not an animation source and must not be recreated under another name.

Do not:

- hand-author a sword attack trajectory in `weapons.ts`;
- stretch blade, handle, or limb geometry to reach a pose;
- infer follow-through from a decorative arc;
- put a grip point above the guard on the blade;
- call an inferred weapon axis "captured sword motion" when the source only recorded the body;
- add a new attack until its recorded source can be inspected frame by frame.

## Better real-motion sources

These are preferred candidates for future imports because they provide sword-specific martial motion; Touché is especially valuable because it records sword-tip positions directly.

- University of Bath / Ninja Theory — Touché: Data-Driven Interactive Sword Fighting in Virtual Reality
  - https://researchdata.bath.ac.uk/754/
  - Vicon Bonita data; the paper reports about 26,000 frames at 30 fps with a 24-joint skeleton and the position of both sword tips.
  - `animation_data.zip` is CC BY 4.0.
- Simon Fraser University Motion Capture Database — Kendo
  - https://mocap.cs.sfu.ca/
  - `0015_BasicKendo001.bvh`, `0015_Kirikaeshi001.bvh`, and `0015_KendoKata001.bvh` provide real Kendo skeleton motion suitable for frame-by-frame inspection.
  - SFU states the dataset is free for research purposes and not for commercial products/resale.

When one of these sources is vendored, keep the original file and license/attribution beside it, add a manifest entry, and generate the SVGLab representation from that source. Do not trace a GIF or manually imitate screenshots.

## Review requirement

Every new sword capture must be reviewable in wireframe form before character art is trusted. The review should show, frame by frame:

- shoulders, elbows, hands, hips, knees, and feet;
- sword guard, handle, and blade as one rigid object;
- explicit guard-side and pommel-side grip markers;
- whether the weapon itself was recorded or reconstructed;
- the original capture frame number or source timestamp.

A rendered character is not proof that the rig is correct. The wireframe is the acceptance surface.
