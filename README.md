# SVGLab

A deliberately unsafe, local-only laboratory for deterministic fighting mechanics and readable
SVG character animation.

**[`AGENTS.md`](AGENTS.md) is the contract** — what this repository is, what it is not, and the
eight contracts every path is held to. Read it first.

The rig, the character art, the wardrobe and the clip catalog are not here. They live in
[Boneyard](../Boneyard/README.md) and are consumed from it, so a second tool can key a pose on
the same skeleton without a second copy of it — and, more to the point, without a second
sampler. Boneyard decides what the data is; this decides how it looks and plays.

## Run the lab

```bash
npm install
npm run dev      # build, start the sidecar and local Worker, open the stage
npm run verify   # every gate, typecheck, tests and production build
```

`npm install` links Boneyard from the sibling checkout. Clone it beside this repository and run
its `npm run build` once; the Vite build refuses to run against a Boneyard with no catalog.

The Worker is deliberately local-only. There is no account id, route, persistent binding,
deployment script or production authentication surface.

Generated art names a bone but carries no skeleton. The rig owns joints, anchors, depth slots,
socket expectations, paint order and exchange axes; a figure is only a manifest of choices. The
browser fetches those choices, so raster atlases and SVG part payloads never enter a shell chunk.

## Guides

- [Active implementation plan](IMPLEMENTATION_PLAN.md) — current and future baseline work while the queue is open.
- [Contributing](CONTRIBUTING.md) — controlled SVG delivery, command roles, generated-output
  rules, visual review, and the local-only boundary.
- [Security](SECURITY.md) — private vulnerability reporting, local/private data handling and
  the local-only Cloudflare security boundary.
- [Hexframe extraction audit](docs/HEXFRAME_COMBAT_AUDIT.md) — what the combat kernel retained
  and deliberately left behind.
- [Licence and attribution](LICENSE.md) — what this repository distributes and under what terms.
- Authoring a clip, drawing a character sheet, or importing motion is Boneyard's loop:
  [authoring](../Boneyard/docs/AUTHORING.md), [atlases](../Boneyard/docs/CHARACTER_ATLAS.md),
  [motion import](../Boneyard/docs/MOTION_IMPORT.md).

## Footprint

- 74 tracked files, zero third-party runtime dependencies.
- Under the pinned Node 26.9.0 toolchain, 94,263 raw / 25,341 gzip bytes across three production shell chunks,
  plus 41,491 raw / 5,385 gzip of baked clip modules. Art remains fetched and is not part of
  those chunks.
- Six verification steps in `verify`, plus 54 tests across 14 files and the production build.

These are measured totals, not budgets. Per-asset raw and gzip sizes remain ratcheted in
`pipelines/guards/footprint.baseline.json`; a decrease passes and an increase must be accepted in
that file's diff. What the art weighs is ratcheted in Boneyard.
