# Combat Lab

Combat Lab is a deliberately unsafe, local-only laboratory for deterministic fighting mechanics and readable SVG character animation. It extracts a small combat kernel from lessons in Hexframe without copying Hexframe's game, product architecture, content, or deployment model.

## Start from clean state

```bash
npm install
npm run dev
```

Every `npm run dev` performs:

```text
teardown → reset → rebuild → local Cloudflare launch
```

The lab opens at <http://127.0.0.1:8787>. Set `COMBAT_LAB_PORT` to use another local port. Re-running the command stops only the prior Wrangler process recorded and verified as belonging to this repository, clears generated output and disposable local runtime state, rebuilds, and launches again.

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

## Useful commands

```bash
npm run teardown  # stop the recorded local runtime
npm run reset     # clear generated/disposable state
npm run build     # enforce local-only config, then build
npm run launch    # launch the already-built local runtime
npm run verify    # types, tests, local-only guard, production bundle
```

There is intentionally no deployment command, production environment, secret, remote route, account binding, database, or persistence contract.

## Boundaries

```text
Input → Combat simulation → State + events → Animation selection → SVG renderer
```

The combat kernel never imports from `animation`, `svg`, `app`, `debug`, or the Cloudflare worker. Animation timing can change without changing hit timing; combat frame data can change without redrawing the fighter.

See [the extraction audit](docs/HEXFRAME_COMBAT_AUDIT.md) and [the experiment guide](docs/EXPERIMENTS.md).
