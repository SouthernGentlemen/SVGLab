# Working in SVGLab

SVGLab is a local, deliberately unsafe 2D character animation laboratory. It fetches a rig, its
art and its clips from [Boneyard](../Boneyard/AGENTS.md), assembles a figure in the DOM, plays
it against a sealed deterministic combat kernel, and serves the whole thing from a local
Cloudflare Worker with a disk-owning dev sidecar behind it.

This file is the contract. It describes the repository as it exists. When code and this file
disagree, one of them is a bug — say which.

## What this repository is not

The skeleton, the traced character art, the wardrobe, the motion capture, the clip catalog and
the pipelines that generate all of it live in Boneyard and are consumed from it. That repository
has its own contract; read it before changing anything about what a bone, a cosmetic or a clip
*means*. Here, they are inputs.

The line is worth stating in one sentence, because every future "where does this go?" reduces
to it: **Boneyard decides what the data is, this decides how it looks and plays.**

## The four concerns

1. **Assembly.** A figure manifest names parts and cosmetics; the browser fetches them and
   builds one nested SVG hierarchy per bone, with depth layers, so a pose is a transform and
   never a re-render. Art is fetched, never bundled.
2. **Frame data.** The Hexframe-derived move kernel — startup, active, recovery, hitbox frame
   windows, hitstop, hitstun, single-hit gating — deterministic and independent of
   presentation. This is first class, not scaffolding.
3. **The preview loop.** A clip edited anywhere — by hand in Boneyard, through its Blender round
   trip, or by a keyframe tool — reaches the running page without a build. Under
   `nodejs_compat` the Worker's filesystem is in-memory: a write can report success and still be
   invisible to the host. The measured localhost proxy reaches real disk and carries
   server-sent events, so the sidecar is the only write owner. Two surfaces, one source of truth.
4. **Agent-drivable commands.** Every stage is a deterministic CLI with machine-readable output,
   a `--check` mode, and something to look at.

## Scope

**In scope**: the four concerns, the local Worker that serves them, and the guards that keep
them honest.

**Out of scope**: anything Boneyard owns — the rig contract, art generation, motion retargeting,
the BVH exchange. Also accounts, production authentication, databases, analytics, campaign or
progression systems, inventory, economy, matchmaking, CI/CD, release trains, and change IDs.
Cloudflare is a local runtime plus a dev deploy target and nothing more: no production
environment, account id, route, or persistent binding.

Reset and teardown scripts may delete generated output and disposable runtime state only.
Never authored source, never a `.blend` someone is editing.

## Contracts

Each one is testable, and something in `verify` tests it.

**C1 — Boneyard is upstream, and there is one of it.** The rig, the art, the clips and the pure
functions that interpret them arrive through the `boneyard` package. This repository never forks
the rig contract, never copies art into its own tree, and above all never writes a second
sampler or a second forward-kinematics implementation — a pose that reads correctly in one tool
and plays differently in another is the exact failure the split exists to prevent. `boneyard` is
the only permitted runtime dependency and must stay a `file:` link to the sibling checkout;
`check:cruft` and `check:footprint` both enforce that, and the second also asserts Boneyard's own
dependency list is empty, so "zero third-party code in the bundle" still holds transitively.

If a change here needs the rig to be different, the change belongs in Boneyard.

**C2 — The kernel is sealed.** `src/kernel/**` never imports animation, SVG, the shell, or the
Worker, and never touches the DOM or a wall clock. `src/kernel/index.ts` is its explicit public
surface. Presentation reads kernel state and never writes back to it. Combat owns movement,
move phases, and contact timing; animation owns how that reads. A clip is warped onto a move's
ticks, never the reverse, and a clip's contact tick is asserted against the move's active
window — across the repository line, against Boneyard's own record of how it was retargeted.

**C3 — Generated output versus authored source.** `src/clips/generated/*.ts` is baked out of
`boneyard/catalog/clips.json` by `build:motions`. It carries a header saying so, rebuilds
byte-identically, contains no timestamps or machine paths, and has a `--check` mode that fails
when stale. It exists so a move naming a clip that does not exist fails `tsc` rather than the
browser; the lane split in it is the catalog's, not this repository's opinion.

**C4 — Footprint is a gate, and the gate is "it did not get bigger".** Three invariants are
absolute: no third-party runtime dependency; art is never inlined into the bundle; no raster
ever reaches the shipped page. Those are architectural, a number cannot express them, and they
are what actually matters — not inlining art took the shell chunk from 1,497,551 bytes to
44,427.

The byte counts are a ratchet, not a threshold. `check:footprint` records what each clip module
and shell chunk weighs, raw and gzip, and fails when a number **grows** against the committed
baseline. Accepting growth means committing the new baseline, which puts the increase in a diff
where someone has to look at it. What the *art* weighs is Boneyard's ratchet against Boneyard's
baseline; this repository cannot make a part SVG heavier, so it does not claim to measure one.

**C5 — Determinism.** Same input, same bytes, every stage, every run. A changed output file
means the input changed.

**C6 — The agent surface.** Every pipeline is a CLI that takes paths and flags, prints a
machine-readable summary, exits non-zero on failure with the fix in the message, and offers a
`--check` mode. Reports name what changed and by how much — a diff an agent can act on, not
prose.

**C7 — Local only.** The Worker has no account id, route, persistent binding, deployment script
or production authentication surface, and `assert-local-only` fails if one appears.

**C8 — Provenance follows what is distributed.** This repository bakes CC BY-NC 4.0 Bandai
Namco adaptations into `src/clips/generated/bandai-namco.ts` and serves Boneyard's art from
`dist/`. `LICENSE.md` names what that means for the material this repository distributes and
points at Boneyard's index for everything upstream of it. Per-file licence copies are forbidden.

## Layout

```
docs/                  the Hexframe provenance audit
LICENSE.md             what this repository distributes, and under what terms
pipelines/dev/         lifecycle and the disk-owning sidecar
pipelines/guards/      cruft, footprint and local-only, with the committed byte baseline
pipelines/motion/      bakes Boneyard's catalog into typed clip modules
src/clips/             generated catalogs, movesets, playback and runtime loading
src/kernel/            sealed frame data, state, movement, collision and hit resolution
src/render/            fetched figure assembly, placement, arena and skeleton overlay
src/shell/             stage, preview, controls, styles and the local Worker
tests/                 Vitest coverage arranged by the same concerns
out/                   untracked output; never reset
```

## Language

TypeScript everywhere: runtime, pipelines, guards, tests. Node 26 runs the pipelines with native
strip-only TypeScript, so tooling needs no build step. Every relative import has an explicit
`.ts`; `enum`, `namespace`, constructor parameter properties and `?raw` are outside the dialect.

## Commands

```
npm run teardown          stop only local SVGLab processes
npm run reset             clear disposable runtime/build output, never out/
npm run launch            start the built local Worker and sidecar
npm run dev               reset, build and launch the local lab
npm run build             production Vite build; prebuild runs assert-local-only
npm run build:motions     boneyard catalog → typed clip modules
npm run check:motions     byte-identical clip modules against the catalog
npm run check:footprint   runtime invariants and committed byte ratchet
npm run check:cruft       reachability, docs, scripts and runtime dependencies
npm run assert-local-only reject production Cloudflare/deployment configuration
npm run typecheck         validate the strip-only TypeScript dialect
npm run test              run 53 tests across 14 files
npm run test:watch        run Vitest in watch mode
npm run verify            every gate, typecheck, tests and production build
```

Anything about the rig, the art or the clips themselves is a command in Boneyard —
`check:rig`, `build:parts`, `check:sockets`, `render:figure`, `import:motions`, `check:blender`.

## Verification gates

No CI runs these. The loop is branch, verify, merge, pull, build. `verify` runs in this order,
with the production build before footprint and typecheck plus tests before the closing gate.

1. `check:motions` — the generated clip modules are Boneyard's catalog, lane for lane and clip
   for clip, and rebuild byte for byte.
2. `check:cruft` — every tracked path is reached by an import, reference or reasoned entry;
   every Markdown guide is linked and names live paths; npm scripts and pipeline files are live;
   the only runtime dependency is a `file:`-linked boneyard.
3. `build` — the production Vite build, which also copies Boneyard's servable art into `dist/`
   and fails if Boneyard has no built catalog.
4. `check:footprint` — C4: the invariants hold and nothing grew against the baseline.
5. `typecheck` and `test`.
6. `assert-local-only` — the Worker has no account, binding, deployment or persistence surface.

A change that touches the rig, the art or a clip needs Boneyard's `verify` too. Run it there.

## Working rules

- Small branches off `main`. `verify` before merge. Merge promptly, then delete the branch.
  Never leave finished work parked in an open branch.
- Never edit a file that has uncommitted changes in it. Use a separate worktree — a branch
  alone does not isolate anything.
- Comments explain *why*. No narration of what the code plainly does.
- When a tool surprises you, measure its behaviour and write the measurement into the code as a
  calibration step. Never encode a guess.
- Verify visually where the output is visual: render the scene or the page, and look at it,
  before calling anything done.
