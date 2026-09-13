# SVGLab

A deliberately unsafe, local-only laboratory for deterministic fighting mechanics and readable
SVG character animation.

**[`AGENTS.md`](AGENTS.md) is the contract** — what this repository is, what it is not, and the
ten contracts every path is held to. Read it first.

The contract-first rewrite is complete. Sprite atlases become interchangeable SVG parts,
figures select parts and fitted cosmetics, captured and authored motion share one 60 Hz sampler,
Blender round trips are measured, the combat kernel is sealed from presentation, and the local
Worker preview reloads edits through a disk-owning sidecar. Ten verification gates keep that
shape from drifting.

## Run the lab

```bash
npm install
npm run dev                              # build, start the sidecar and local Worker, open the stage
npm run render:figure -- --figure yuliya # write an assembled review sheet to out/render/
npm run render:clip -- --clip labWave    # write a motion contact sheet to out/render/
npm run verify                           # all gates, typecheck, tests and production build
```

The Worker is deliberately local-only. There is no account id, route, persistent binding,
deployment script or production authentication surface.

## Repository map

```
characters/<id>/       source atlas + trace sidecar; generated one-SVG-per-slot parts
cosmetics/<set>/       source wardrobe atlas + manifest; generated SVG pieces
docs/                  atlas, motion and authoring guides; Hexframe provenance record
figures/               authored manifests selecting a rig, parts and fitted cosmetics
motions/               capture manifest and tracked hand-authored clip source
pipelines/blender/     thin Python armature, export and joint-probe scripts
pipelines/dev/         local process lifecycle and disk-owning live-reload sidecar
pipelines/exchange/    measured BVH/art export and import
pipelines/guards/      rig, socket, exchange, wardrobe, footprint, cruft and local-only gates
pipelines/motion/      BVH parse, planar retarget, reduction and deterministic catalog build
pipelines/render/      agent-readable clip and figure review sheets plus schemas
pipelines/sprite/      in-project PNG decode, segmentation, fitting and flat-colour tracing
pipelines/wardrobe/    cosmetic atlas tracing and authored trace profiles
rigs/                  rig contract, generated authoring schemas and footprint ratchet
src/clips/             clip types, generated catalogs, movesets, playback and runtime loading
src/kernel/            sealed deterministic state, movement, collision and hit resolution
src/render/            fetched figure assembly, placement, arena and skeleton overlay
src/rig/               rig validation, forward kinematics and the one sampler
src/shell/             stage, animation preview, controls, styles and local Worker
tests/                 Vitest suites arranged by the same concerns
third_party/           pinned Bandai Namco capture subset, annotations, licence and notice
dist/                  untracked production build; disposable
out/                   untracked render, study and Blender work; never removed by reset
```

Generated art names a bone but carries no skeleton. The rig owns joints, anchors, depth slots,
socket expectations, paint order and exchange axes; a figure is only a manifest of choices.
The browser fetches those choices, so raster atlases and SVG part payloads never enter a shell
chunk.

## Guides

- [Agent authoring loop](docs/AUTHORING.md) — write a clip or figure against the committed
  schemas, validate it, render a sheet and iterate.
- [Character atlases](docs/CHARACTER_ATLAS.md) — draw a body-part sheet and trace it into fitted,
  swappable SVG parts.
- [Motion import](docs/MOTION_IMPORT.md) — source provenance, planar retargeting, catalog lanes,
  and the measured Blender round trip.
- [Hexframe extraction audit](docs/HEXFRAME_COMBAT_AUDIT.md) — what the combat kernel retained
  and deliberately left behind.

## Final footprint

- 199 tracked files; 183 outside the pinned `third_party/` subset.
- 10,538 lines of TypeScript and 452 lines of Blender Python.
- Zero runtime dependencies. Development uses only `@cloudflare/workers-types`, `@types/node`,
  `typescript`, `vite`, `vitest` and `wrangler`.
- 43,158 raw / 15,617 gzip bytes across three production shell chunks. Art remains
  fetched and is not part of those chunks.
- Ten gates in `verify`, plus typecheck, 119 tests across 27 files, and the production build.

These are measured repository and `dist/assets` totals, not budgets. Per-asset raw and gzip
sizes remain ratcheted in `rigs/footprint.baseline.json`; a decrease passes and an increase must
be accepted in that file's diff.
