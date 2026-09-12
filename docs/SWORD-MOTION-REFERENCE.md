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

`bnrSwordGuardNormal`, `bnrSwordSlashNormal`, `bnrSwordCutNormal`, and `bnrSlashStudyNormal` are all trimmed/retargeted windows of that same captured two-handed slash session.

## Weapon reconstruction

The BVH records the performer, not a deformable game sword. SVGLab therefore reconstructs the weapon from the captured two-hand pose while keeping weapon geometry rigid:

1. Sample the captured body clip normally.
2. Resolve the two retargeted hand endpoints from shoulder, elbow, and forearm rotations.
3. Treat the source right hand (`arm-back` after retargeting) as the guard-side hand.
4. Treat the source left hand (`arm-front`) as the pommel-side hand.
5. Use those two points only to recover the handle axis and center.
6. Place the selected fixed-size sword on that line. Blade length, handle length, and grip spacing never change.
7. Re-solve both arms onto the selected sword's fixed handle grip points.
8. The blade extends away from the pommel through the guard. A hand may never lie on the blade.

Generic walk/run/crouch/dash captures were not recorded with a sword, so sword-equipped locomotion retains the fixed upright guard instead of pretending those hand tracks are weapon data.

## Rejected approach

The deleted `src/animation/sword-reference.ts` sequence was fabricated by hand. It produced exactly the failure this lab is supposed to expose: plausible-looking keyframes that did not reproduce a real swing, bad recovery arcs, and ambiguous hand/blade placement. It is not an animation source and must not be recreated under another name.

Do not:

- hand-author a sword attack trajectory in `weapons.ts`;
- stretch blade or handle geometry to reach hands;
- infer follow-through from a decorative arc;
- put a grip point above the guard on the blade;
- add a new attack until its recorded source can be inspected frame by frame.

## External real-motion references

These are preferred candidates for future capture imports, not current runtime dependencies:

- University of Bath / Ninja Theory — Touché: Data-Driven Interactive Sword Fighting in Virtual Reality
  - https://researchdata.bath.ac.uk/754/
  - Vicon Bonita sword-fighting animation data stored as per-frame skeletal CSV.
  - `animation_data.zip` is CC BY 4.0.
- Simon Fraser University Motion Capture Database — Kendo
  - https://mocap.cs.sfu.ca/
  - `0015_BasicKendo001.bvh`, `0015_Kirikaeshi001.bvh`, and `0015_KendoKata001.bvh` provide real skeleton animation suitable for frame-by-frame inspection.
  - SFU states the dataset is free for research purposes and not for commercial products/resale.

When one of these sources is vendored, keep the original file and license/attribution beside it, add a manifest entry, and generate the SVGLab representation from that source. Do not trace a GIF or manually imitate screenshots.

## Review requirement

Every new sword capture must be reviewable in wireframe form before character art is trusted. The review should show, frame by frame:

- shoulders, elbows, hands, hips, knees, and feet;
- sword guard, handle, and blade as one rigid object;
- explicit guard-side and pommel-side hand markers;
- the original capture frame number or source timestamp.

A rendered character is not proof that the rig is correct. The wireframe is the acceptance surface.
