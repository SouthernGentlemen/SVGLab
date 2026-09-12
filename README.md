# SVGLab

SVGLab is a deliberately unsafe, local-only laboratory for deterministic fighting mechanics and readable SVG character animation. It extracts a small combat kernel from lessons in Hexframe without copying Hexframe's game, product architecture, content, or deployment model.

## Start from clean state

```bash
npm install
npm run dev
```

Every `npm run dev` performs:

```text
destructive teardown → reset → rebuild → local Cloudflare launch → browser
```

The teardown is intentionally aggressive. Before starting, SVGLab kills stale Wrangler processes from this repository and **any process listening on the selected local lab port** (`8787` by default), then confirms the port is free. This repository treats its local runtime as disposable development infrastructure; do not point `SVGLAB_PORT` at another local service you care about.

The command waits until the local runtime is reachable and then opens the lab in your default browser at <http://127.0.0.1:8787>. Set `SVGLAB_PORT` to use another local port; teardown and the browser follow that port automatically. Use `SVGLAB_NO_OPEN=1 npm run dev` only when you deliberately want the full dev lifecycle without opening a browser, such as in headless automation.

Generated output and disposable local runtime state are cleared on every dev run. Authored work under `src/` and `docs/` is never reset.

## Controls

- `W`: jump
- `A` / `D`: move
- `S`: crouch
- `J`: basic attack
- `K`: sword slash
- `R`: reset the combat state
- `P`: pause or resume
- `.`: advance one tick while paused
- `` ` ``: open or close the debug overlay

The stage is focus-first: controls, frame timing, state, events, and geometry tools float over the fight rather than reducing the play area. Open the debug overlay to inspect pushboxes, hurtboxes, hitboxes, fighter origins, bone pivots, and animation state.

## Characters

The fighter in `src/svg/fighter.svg` is hand-drawn and deliberately readable. Characters can
also be *traced*: drop a sheet of loose body parts at `characters/<id>/atlas.png`, run
`npm run build:characters`, and the build writes `src/svg/characters/<id>.svg` — the same
eleven-bone document shape with identical joint positions and proportions, so the same rig
reads it and the same clips play on it. Three traced characters ship as examples; switch
between them mid-fight in the debug overlay.

The atlases are build-time input only. Everything the stage draws is vector, and a guardrail
test fails if any raster ever reaches the bundle.

See [the character atlas guide](docs/CHARACTER_ATLAS.md).

Selected motion-capture studies can also be retargeted into the same eleven-bone rig with
`npm run build:motions`. The animation catalog now contains only Bandai Namco-derived clips,
including four two-handed sword motions, one of which drives a second authored move; combat
still owns fighter movement, move phases, and contact timing. See
[the motion import guide](docs/MOTION_IMPORT.md), including the CC BY-NC terms that apply to
the included Bandai Namco source subset.

## Useful commands

```bash
npm run teardown  # destructively clear the selected local port and stale repo Wrangler processes
npm run reset     # clear generated/disposable state
npm run build     # enforce local-only config, then build
npm run launch    # launch the already-built local runtime without opening a browser
npm run verify    # types, tests, local-only guard, production bundle
npm run build:characters  # re-trace every character atlas
npm run build:motions     # rebuild selected BVH motion studies
```

There is intentionally no deployment command, production environment, secret, remote route, account binding, database, or persistence contract.

## Boundaries

```text
Input → Combat simulation → State + events → Animation selection → SVG renderer
```

The combat kernel never imports from `animation`, `svg`, `app`, `debug`, or the Cloudflare worker. Animation timing can change without changing hit timing; combat frame data can change without redrawing the fighter.

See [the extraction audit](docs/HEXFRAME_COMBAT_AUDIT.md) and [the experiment guide](docs/EXPERIMENTS.md).
