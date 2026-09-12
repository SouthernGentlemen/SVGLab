# Working in SVGLab

SVGLab is a local, deliberately unsafe 2D character animation laboratory. A PNG sprite sheet
becomes a rigged SVG character; motion capture and hand edits become sparse keyframes on that
rig; Blender is a peer surface for tweaking those keyframes; a Cloudflare Worker serves the
preview and the deployable game logic; and every pipeline is shaped so an agent can drive it
without a human in the loop.

This file is the contract. It describes the repository as it is meant to be, and the plan at
the end is how it gets there. When code and this file disagree, one of them is a bug — say
which.

## The six concerns

1. **Sprite sheet → rigged SVG.** `characters/<id>/atlas.png` is build-time input. The
   pipeline decodes it in-project, cuts each part out as an island of opaque pixels, assigns
   parts to rig slots by band and reading order, traces each part into layered flat-colour
   paths, and fits them to the rig's canonical joints.
2. **A Blender-native 2D rig.** Eleven bones, one plane, one rotation each, declared once as
   data and consumed by the runtime, the pipelines, and Blender.
3. **Clips.** Motion-capture BVH and hand-authored edits reduce to sparse linear keyframes in
   an integer 60 Hz tick domain.
4. **Blender ⇄ preview loop.** Any clip opens in Blender as a posed character; a saved edit
   lands back in the catalog and the preview picks it up. Two surfaces, one source of truth.
5. **Frame data.** The Hexframe-derived move kernel — startup, active, recovery, hitbox frame
   windows, hitstop, hitstun, single-hit gating — deterministic and independent of
   presentation. This is first class, not scaffolding.
6. **Agent-drivable pipelines.** Every stage is a deterministic CLI with machine-readable
   output, a `--check` mode, and a visual artefact to look at. An agent authoring a clip is a
   supported workflow, not a side effect.

## Scope

**In scope**: the six concerns, the local Worker that serves them, and the guards that keep
them honest.

**Out of scope**: accounts, production authentication, databases, analytics, campaign or
progression systems, inventory, economy, matchmaking, CI/CD, release trains, and change IDs.
Cloudflare is a local runtime plus a dev deploy target and nothing more: no production
environment, account id, route, or persistent binding. Rigid props (weapons) are deliberately
absent; the rig carries a named attachment point so they can return without reshaping it.

Reset and teardown scripts may delete generated output and disposable runtime state only.
Never authored source, never a `.blend` someone is editing.

## Contracts

Each one is testable, and something in `verify` tests it.

**C1 — The rig is data.** `rigs/fighter.rig.json` is the single source of truth: bones as
`{ name, parent, offset: [x, y], tip }` in SVG units with y down, pivots at bone heads, tails
declared so every build produces a byte-identical armature, roll zero, paint order, per-profile
depth layers, named attachment points, the SVG↔Blender axis mapping (SVG `+x` → `+X`,
SVG `+y` → `−Z`, unused depth → `+Y`, one SVG unit to one Blender unit), and the BVH channel
layout. Bone names are ASCII, hyphen-separated, unique, and at most 63 characters, because that
is Blender's limit and a name must never change crossing the boundary. Art references bones by
id and carries no skeleton of its own.

**C2 — One tick domain, one sampler.** Integer ticks at 60 Hz. Source at 30 fps is resampled.
The runtime sampler and every pipeline are the same code; there is never a second
implementation held together by a parity test. A clip is warped onto a move's ticks, never the
reverse, and a clip's contact tick is asserted against the move's active window.

**C3 — Generated output versus authored source.** Generated files carry a header saying so,
rebuild byte-identically, contain no timestamps or machine paths, and have a `--check` mode
that fails when stale. `motions/authored/<key>.json` is tracked source and the only place a
hand edit survives; an authored clip may carry a derived clip's key, which overrides what plays
while the manifest keeps deriving the original to compare against.

**C4 — The exchange is measured, not assumed.** Export bakes one BVH frame per tick through
the runtime sampler, so a file plays what the lab plays. Import measures what it is given: the
drawing's axes come out of the file's own offsets, the planar rotation from whichever channel
turns about the depth those axes imply, and a uniform scale is divided back out. An untouched
round trip changes nothing. Anything the rig cannot hold — out-of-plane rotation, depth
translation, horizontal root travel — is measured, attributed to the bones it came from, and
reported. Reduction is Douglas–Peucker per channel at 1° and 0.15 units, and no value is stored
to more precision than that justifies.

**C5 — Blender's importers are not trusted with this rig.** Its BVH importer rebuilds
skeletons with conventions of its own: on eleven bones it welds the head to the chest's
averaged tail and moves that joint six units. So the armature is built in Python from C1 and
the channels are applied directly. Its SVG importer works at 90 DPI, flips y, names objects
after the SVG `id`, makes one curve per `<path>`, and leaves `fill:none` invisible until it has
a bevel — so art is placed by measuring a calibration corner written into every art file and
inverting the frame it reports. Never hardcode an importer's numbers; measure them.

**C6 — The kernel is sealed.** `src/kernel/**` never imports animation, SVG, the shell, or the
Worker, and never touches the DOM or a wall clock. Presentation reads kernel state and never
writes back to it. Combat owns movement, move phases, and contact timing; animation owns how
that reads.

**C7 — Footprint is a gate.** Zero runtime dependencies. Shell chunk ≤ 150 KB raw and ≤ 50 KB
gzip. One character, fetched on demand, ≤ 120 KB raw and ≤ 35 KB gzip. Generated clip catalog
≤ 60 KB. Tracked source outside `third_party/` ≤ 1 MB. Art is never inlined into the bundle,
and no raster ever reaches the shipped page.

**C8 — Provenance is in the name.** `bnr*` clips are CC BY-NC 4.0 adaptations of Bandai Namco
material and record the clip they derive from; `lab*` clips are original to this repository and
claim no origin. The vendored `LICENSE` and `NOTICE.md` stay beside the source subset. No
commercial use, ever.

**C9 — Determinism.** Same input, same bytes, every stage, every run. A changed output file
means the input changed.

**C10 — The agent surface.** Every pipeline is a CLI that takes paths and flags, prints a
machine-readable summary, exits non-zero on failure with the fix in the message, and offers a
`--check` mode. Anything an agent is expected to judge visually has a command that renders it:
a contact sheet of a clip, a page screenshot, a Blender still. Reports name what changed and by
how much — a diff an agent can act on, not prose.

## Layout

```
rigs/                  the rig contract
characters/<id>/       atlas.png + atlas.json — build-time input only
motions/               dataset manifest + authored/ clip source
third_party/           vendored capture subset, LICENSE, NOTICE
pipelines/             TypeScript: sprite/, motion/, exchange/, guards
pipelines/blender/     setup.py, export.py — Python only because Blender's API is
src/rig/               bone tree, pose types, the one sampler
src/clips/             generated catalog + authored lane
src/kernel/            frame data: states, phases, hitboxes, resolution
src/render/            SVG renderer and placement
src/shell/             the page and the Worker
out/                   untracked exchange output; never wiped by reset
```

## Language

TypeScript everywhere: runtime, pipelines, guards, tests. Node runs the pipelines with native
type stripping, so tooling needs no build step. Blender's scripts are the one exception and are
Python because that is the API Blender exposes — keep them thin and push logic to the
TypeScript side.

## Commands

```
npm run dev            build and serve the local Worker
npm run build:characters   atlas → rigged SVG            (--check)
npm run build:motions      manifest + authored → catalog (--check)
npm run export:motions     catalog → out/ for Blender
npm run import:motions     an edited file → authored clip
npm run blender            build a .blend per clip when Blender is installed
npm run render:clip        contact sheet for review, agent or human
npm run verify             every gate below, in order
```

## Verification gates

No CI runs these. The loop is branch, verify, merge, pull, build.

1. `check:rig` — contract parses, tree is a tree, offsets and tips finite, names Blender-legal
   and unique, paint order a permutation of the bones.
2. `check:sprites` — re-tracing every atlas reproduces the committed SVG byte for byte, inside
   its size budget.
3. `check:motions` — re-deriving every clip reproduces the catalog byte for byte, contact ticks
   land in their move's active window, loop seams close.
4. `check:exchange` — untouched round trip changes nothing; a file in another tool's axis
   convention reads back identically; dropped work is reported; authored-clip validation
   rejects bad provenance, unknown bones, unordered frames, open seams.
5. `check:footprint` — C7.
6. `typecheck` · `test` · `assert-local-only` · production build.
7. `check:blender` — with Blender present: every joint of every sampled tick lands within
   0.001 units of the sampler's own forward kinematics, and an export back reports zero deltas.
   Skips loudly when Blender is absent; never silently passes.

## Implementation plan

One commit per milestone, `verify` green before merge, no starting the next until the previous
is in.

- **M0 — clean head.** Orphan branch; this file; rig contract; the one sampler; clip types;
  `check:rig`; typecheck; tests. Done when an empty catalog builds and the contract has a test.
- **M1 — sprite sheets.** Port the tracer to TypeScript with its reasoning intact: flat
  silhouette, one path per nested patch of flat colour, hairline strokes closing seams,
  deterministic quantisation. Coordinate precision and simplification tolerance are declared
  knobs. Done when a rebuild reproduces a committed character inside budget.
- **M2 — clips.** Both lanes, the retarget (project to the plane, collapse to eleven bones,
  drop horizontal root travel, resample, reduce), the generated catalog. Done when every kept
  clip is reproduced with contact ticks asserted.
- **M3 — Blender exchange.** Export with per-bone art and the calibration corner; `setup.py`
  building the armature from C1; `export.py`; the axis-measuring reader; `check:exchange` and
  `check:blender`. Done when a clip opens as a posed character, an edit lands in
  `motions/authored/`, and an untouched round trip is a table of zeros.
- **M4 — frame data.** Port the kernel: states, move phases, hitbox windows, hitstop, hitstun,
  single-hit gating, deterministic stepping, the boundary test. Done when a move's active
  window and its clip's contact tick are asserted against each other.
- **M5 — preview loop.** The Worker and one page: pick a character, pick a clip, play, scrub,
  inspect the skeleton, drive the kernel. In dev only, the Worker serves the exchange — a clip
  as BVH, the bone art, and a write-back endpoint that lands an edit in `motions/authored/` —
  so Blender and the preview are two views of one source. Done when an edit saved in Blender
  shows up in the browser without a hand-run command.
- **M6 — agent surface.** `render:clip` contact sheets, machine-readable reports from every
  pipeline, an authored-clip schema an agent can write against, and a documented loop: author,
  validate, render, look, iterate. Done when a clip can be authored end to end without opening
  an editor.
- **M7 — cruft gate.** No orphan docs, no unreferenced files, no dead scripts, zero runtime
  dependencies. State the final line count, the shipped byte count, and what each directory is
  for.

## Working rules

- Small branches off `main`. `verify` before merge. Merge promptly, then delete the branch.
  Never leave finished work parked in an open branch.
- Never edit a file that has uncommitted changes in it. Use a separate worktree — a branch
  alone does not isolate anything.
- Comments explain *why*. No narration of what the code plainly does.
- When a tool surprises you, measure its behaviour and write the measurement into the code as a
  calibration step. Never encode a guess.
- Verify visually where the output is visual: render the scene, the sheet, or the page, and
  look at it, before calling anything done.
