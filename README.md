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

Generated art names a bone but carries no skeleton. The rig owns joints, anchors, depth slots,
socket expectations, paint order and exchange axes; a figure is only a manifest of choices.
The browser fetches those choices, so raster atlases and SVG part payloads never enter a shell
chunk. The authoritative repository layout lives in `AGENTS.md`; dataset provenance and path
coverage live in [`LICENSE.md`](LICENSE.md).

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

- 198 tracked files, including six pinned BVH inputs under `motions/capture/`.
- 10,863 lines of TypeScript and 452 lines of Blender Python.
- Zero runtime dependencies. Development uses only `@cloudflare/workers-types`, `@types/node`,
  `typescript`, `vite`, `vitest` and `wrangler`.
- 45,183 raw / 16,242 gzip bytes across three production shell chunks. Art remains
  fetched and is not part of those chunks.
- Ten gates in `verify`, plus typecheck, 119 tests across 27 files, and the production build.

These are measured repository and `dist/assets` totals, not budgets. Per-asset raw and gzip
sizes remain ratcheted in `rigs/footprint.baseline.json`; a decrease passes and an increase must
be accepted in that file's diff.
