# Authoring loop

Start from [`rigs/authored-clip.schema.json`](../rigs/authored-clip.schema.json) for a clip or
[`rigs/figure.schema.json`](../rigs/figure.schema.json) for a figure. Keep authored clips in
`motions/authored/<key>.json` and figures in `figures/<id>.json`.

```bash
npm run build:motions -- --json
npm run render:clip -- --figure yuliya --clip labWave --columns 4 --from 0 --to 48 --json
npm run render:figure -- --figure yuliya --json
```

Open the reported SVG in `out/render/`, adjust the authored JSON, and repeat. `build:motions`
checks provenance, tick order, rig references, duration bounds, and loop closure; each renderer
validates the figure and its assets before drawing. Add `--check` to a renderer to compare an
existing sheet without rewriting it.

The committed schemas are generated from the validator's shared rule constants. `check:rig`
fails with the regeneration command if either schema drifts.
