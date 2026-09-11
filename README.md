# SVGLab

SVGLab is a deliberately unsafe, local-only laboratory for deterministic fighting mechanics and readable SVG character animation. It extracts a small combat kernel from lessons in Hexframe without copying Hexframe's game, product architecture, content, or deployment model.

## Start from clean state

```bash
npm install
npm run dev
```

Every `npm run dev` performs:

```text
teardown → reset → rebuild → local Cloudflare launch → browser
```

The command waits until the local runtime is reachable and then opens the lab in your default browser at <http://127.0.0.1:8787>. Set `SVGLAB_PORT` to use another local port; the browser follows that port automatically. Use `SVGLAB_NO_OPEN=1 npm run dev` only when you deliberately want the full dev lifecycle without opening a browser, such as in headless automation.

Re-running the command stops only the prior Wrangler process recorded and verified as belonging to this repository, clears generated output and disposable local runtime state, rebuilds, and launches again.

Authored work under `src/` and `docs/` is never reset.

## Controls

- `W`: jump
- `A` / `D`: move
- `S`: crouch
- `J`: basic attack
- `R`: reset the combat state
- `P`: pause or resume
- `.`: advance one tick while paused
- `` ` ``: open or close the debug overlay

The stage is focus-first: controls, frame timing, state, events, and geometry tools float over the fight rather than reducing the play area. Open the debug overlay to inspect pushboxes, hurtboxes, hitboxes, fighter origins, bone pivots, and animation state.

## Characters

The fighter in `src/svg/fighter.svg` is hand-drawn and deliberately readable. Characters can
also be *traced*: drop a sheet of loose body parts at `characters/<id>/atlas.png`, run
`npm run build:characters`, and the build writes `src/svg/characters/<id>.svg` — the same
eleven-bone document shape, so the same rig reads it and the same clips play on it. Three
traced characters ship as examples; switch between them mid-fight in the debug overlay.

The atlases are build-time input only. Everything the stage draws is vector, and a guardrail
test fails if any raster ever reaches the bundle.

See [the character atlas guide](docs/CHARACTER_ATLAS.md).

## Useful commands

```bash
npm run teardown  # stop the recorded local runtime
npm run reset     # clear generated/disposable state
npm run build     # enforce local-only config, then build
npm run launch    # launch the already-built local runtime without opening a browser
npm run verify    # types, tests, local-only guard, production bundle
npm run build:characters  # re-trace every character atlas
```

There is intentionally no deployment command, production environment, secret, remote route, account binding, database, or persistence contract.

## Boundaries

```text
Input → Combat simulation → State + events → Animation selection → SVG renderer
```

The combat kernel never imports from `animation`, `svg`, `app`, `debug`, or the Cloudflare worker. Animation timing can change without changing hit timing; combat frame data can change without redrawing the fighter.

See [the extraction audit](docs/HEXFRAME_COMBAT_AUDIT.md) and [the experiment guide](docs/EXPERIMENTS.md).
