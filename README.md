# SVGLab

A deliberately unsafe, local-only laboratory for deterministic fighting mechanics and readable
SVG character animation.

**[`AGENTS.md`](AGENTS.md) is the contract** — what this repository is, what it is not, and the
ten contracts everything here is held to. Read it first. This file is only how to run the thing.

```bash
npm install
npm run dev
```

`npm run dev` is `teardown → reset → build → local Cloudflare launch → browser`, and the
teardown is aggressive: it kills stale Wrangler processes from this repository and **any
process listening on the lab port** (`8787`, or `SVGLAB_PORT`). Do not point `SVGLAB_PORT` at a
local service you care about. `SVGLAB_NO_OPEN=1` skips opening the browser.

Reset clears `dist/`, Wrangler state and `.runtime/`. It leaves `out/` alone, because that is
where `export:motions` puts the clips a Blender project is pointed at.

## Controls

`W` jump · `A`/`D` move · `S` crouch · `J` basic attack · `K` sword slash · `R` reset ·
`P` pause · `.` step one tick · `` ` `` debug overlay.

The overlay inspects pushboxes, hurtboxes, hitboxes, fighter origins, bone pivots and animation
state, and switches between traced characters mid-fight.

## Commands

```bash
npm run verify            # every gate, in order — run before merging
npm run build:characters  # atlas → traced character        (--check)
npm run build:motions     # manifest + authored → catalog   (--check)
npm run export:motions    # every clip + bone art → out/blender
npm run import:motions    # an edited BVH → motions/authored/
npm run check:exchange    # assert an untouched round trip changes nothing
npm run teardown          # clear the lab port and stale repo Wrangler processes
npm run reset             # clear generated and disposable state
```

There is deliberately no deploy command, production environment, secret, remote route, account
binding, database, or persistence contract.

## Guides

- [Character atlases](docs/CHARACTER_ATLAS.md) — drawing a sheet of body parts and tracing it
  onto the eleven-bone rig.
- [Motion import](docs/MOTION_IMPORT.md) — the BVH retarget, the CC BY-NC terms on the vendored
  Bandai Namco subset, and the round trip out to Blender and back.
- [Rewrite plan](docs/REWRITE_PLAN.md) — the milestones, the purge manifest, and what six
  spikes measured.
- [Hexframe extraction audit](docs/HEXFRAME_COMBAT_AUDIT.md) — what the combat kernel was taken
  from and what was deliberately left behind.
