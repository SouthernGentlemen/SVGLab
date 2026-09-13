# SVGLab

A deliberately unsafe, local-only laboratory for deterministic fighting mechanics and readable
SVG character animation.

**[`AGENTS.md`](AGENTS.md) is the contract** — what this repository is, what it is not, and the
ten contracts everything here is held to. Read it first.

## Where this is

The repository is being rebuilt from the contract outwards. **M0 through M3 are in: the rig,
sampler, swappable traced parts, figure manifests, clip lanes, Blender exchange, and the gates
that check them.**
Everything else is listed in
[`docs/REWRITE_PLAN.md`](docs/REWRITE_PLAN.md) with the files it creates, the gate it turns on
and what it defers — and every port comes out of git history, which is why nothing was lost
when the old tree went.

There is no page to open yet. That is M5.

```bash
npm install
npm run build:parts
npm run build:motions
npm run export:motions -- bnrSwordCutNormal # default figure: barst
npm run verify     # includes measured exchange and Blender gates
```

## What exists

```
rigs/fighter.rig.json   the rig: eleven bones, 19 anchors, four depth slots, seven cosmetic
                        kinds, sockets, paint order, the Blender axis map, the BVH layout
src/rig/                the contract loader, forward kinematics, and the one sampler
src/clips/              clip types, generated and authored catalogs, playback and movesets
pipelines/guards/rig.ts check:rig
pipelines/sprite/       deterministic atlas decoder, cutter, tracer and part builder
characters/<id>/        atlas.png + atlas.json source; generated parts/<slot>.svg output
figures/                 manifests selecting a rig and one file for every part slot
motions/                dataset manifest with shipped/study lanes + authored clip source
pipelines/motion/       BVH parser, measured retarget, reducer and deterministic catalog build
pipelines/exchange/     BVH/art export, measured-axis import and authored review reports
pipelines/blender/      contract-built armature, calibrated art attachment and joint probe
third_party/            the vendored Bandai Namco subset, CC BY-NC 4.0
```

The rig is data and everything reads it: art references bones by id and carries no skeleton of
its own, a cosmetic binds to a named anchor rather than a pixel offset, and a figure is a
manifest of which part fills each slot rather than a document. That is what makes every piece
of every character interchangeable with every piece of every other.

## Guides

- [Character atlases](docs/CHARACTER_ATLAS.md) — drawing a sheet of body parts and tracing it
  into swappable parts on the rig.
- [Motion import](docs/MOTION_IMPORT.md) — the BVH retarget, the CC BY-NC terms on the vendored
  Bandai Namco subset, and the round trip out to Blender and back. Describes M2 and M3.
- [Rewrite plan](docs/REWRITE_PLAN.md) — the milestones, the purge manifest, and what seven
  spikes measured.
- [Hexframe extraction audit](docs/HEXFRAME_COMBAT_AUDIT.md) — what the combat kernel was taken
  from and what was deliberately left behind.
