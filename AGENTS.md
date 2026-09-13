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
4. **Blender ⇄ preview loop.** Any clip opens in Blender as a posed figure; a saved edit
   lands back in the catalog and the preview picks it up, through a dev sidecar that owns disk
   because the Worker's filesystem is virtual. Two surfaces, one source of truth.
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

**C1 — The rig is data.** `rigs/<name>.rig.json` is the single source of truth: a `contract`
version a loader refuses to guess at; bones as `{ name, parent, offset: [x, y], tip, slot,
artHeight }` in SVG units with y down, pivots at bone heads, tails declared so every build
produces a byte-identical armature, roll zero; paint order; per-profile depth layers; the
SVG↔Blender axis mapping (SVG `+x` → `+X`, SVG `+y` → `−Z`, unused depth → `+Y`, one SVG unit
to one Blender unit); and the BVH channel layout. Bone names are ASCII, hyphen-separated,
unique, and at most 63 characters, because that is Blender's limit and a name must never change
crossing the boundary. Art references bones by id and carries no skeleton of its own.

It also carries the four things that make every piece interchangeable:

- **Anchors** — named points on a bone, in that bone's frame, in rig units: `torso.neck`,
  `head.crown`, `forearm-front.grip`. A cosmetic binds to an anchor. Nothing binds to a pixel
  offset in the sheet it was drawn on, because that offset is multiplied by the target's own
  part scale and lands somewhere different on every figure. An anchor on a joint *is* the child
  bone's offset; a `grip` is where a hand closes, which is a different question from a `tip`.
- **Depth slots** — `under`, `part`, `over`, `outer`, ordered, inside each bone's group. A
  cosmetic names one. A boolean cannot say that a cloak goes outside a pauldron.
- **Sockets** — the overlap a part must provide at each joint and the width step allowed there.
  The guard assembles every part with every other part in its slot and reports; it never
  resizes art.
- **Cosmetic kinds** — a hat behaves like every other hat and a skirt like every other skirt,
  and no one set of rules suits both. A kind is a named bundle of defaults; a piece overrides
  what it needs, and lists in `fitted` the figures it actually suits rather than pretending to
  suit all of them. A piece may `hide` a slot, which drops that part's art instead of painting
  over it.

**A figure is a manifest, not a document.** `figures/<name>.json` names which part fills each
slot, which cosmetics are worn and which rig it targets. The art it names may come from any
number of sheets. A character is one possible figure, not the unit of assembly.

**C2 — One tick domain, one sampler.** Integer ticks at 60 Hz. Source at 30 fps is resampled.
The runtime sampler and every pipeline are the same code; there is never a second
implementation held together by a parity test. A clip is warped onto a move's ticks, never the
reverse, and a clip's contact tick is asserted against the move's active window.

**C3 — Generated output versus authored source.** Generated files carry a header saying so,
rebuild byte-identically, contain no timestamps or machine paths, and have a `--check` mode
that fails when stale. `motions/authored/<key>.json` is tracked source and the only place a
hand edit survives; an authored clip may carry a derived clip's key, which overrides what plays
while the manifest keeps deriving the original to compare against.

There is a third category: **derived and not shipped.** A study clip rebuilds deterministically
like any generated clip and is written to `out/` on every build, where a Blender project is
pointed at it and where the dev surface can reach it, but it is not in the catalog C7 measures.
The manifest declares which lane a clip is in.

**C4 — The exchange is measured, not assumed.** Export bakes one BVH frame per tick through
the runtime sampler, so a file plays what the lab plays. Import measures what it is given: the
drawing's axes come out of the file's own offsets, the planar rotation from whichever channel
turns about the depth those axes imply, and a uniform scale is divided back out. An untouched
round trip changes nothing. Anything the rig cannot hold — out-of-plane rotation, depth
translation, horizontal root travel — is measured, attributed to the bones it came from, and
reported — measured against the bone's own rest offset, because a tool that writes position
channels on every joint initialises them at `OFFSET` and reading the raw magnitude reports a
skeleton at rest as work that was thrown away. Reduction is Douglas–Peucker per channel at 1°
and 0.15 units, and no value is stored to more precision than that justifies: rotation to one
decimal, position to two. One rounding rule cannot express two tolerances.

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

**C7 — Footprint is a gate, and the gate is "it did not get bigger".** Three invariants are
absolute: zero runtime dependencies; art is never inlined into the bundle; no raster ever
reaches the shipped page. Those are architectural, a number cannot express them, and they are
what actually matters — not inlining art took the shell chunk from 1,497,551 bytes to 44,427.

The byte counts are a ratchet, not a threshold. `check:footprint` records what every figure,
part, catalog and chunk weighs, raw and gzip, and fails when a number **grows** against the
committed baseline. Accepting growth means committing the new baseline, which puts the increase
in a diff where someone has to look at it. Minimal is enforced as a direction while the shape is
still moving; thresholds go in when there is something to base them on rather than a number
picked before anything was measured.

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
rigs/                  the rig contract, and the footprint baseline
figures/               a figure: which part fills each slot, which cosmetics are worn
characters/<id>/       atlas.png + atlas.json — build-time input; parts/ once built
cosmetics/<set>/       atlas.png + set.json — build-time input; pieces once built
motions/               dataset manifest + authored/ clip source
third_party/           vendored capture subset, LICENSE, NOTICE
pipelines/             TypeScript: sprite/, motion/, exchange/, wardrobe/, dev/, guards/
pipelines/blender/     setup.py, export.py — Python only because Blender's API is
src/rig/               contract, bone tree, anchors, forward kinematics, the one sampler
src/clips/             generated catalog + authored lane
src/kernel/            frame data: states, phases, hitboxes, resolution
src/render/            assembly from a figure, SVG renderer and placement
src/shell/             the page and the Worker
out/                   untracked exchange output and derived-not-shipped clips.
                       NEVER wiped by reset: a Blender project is pointed at it.
```

## Language

TypeScript everywhere: runtime, pipelines, guards, tests. Node runs the pipelines with native
type stripping, so tooling needs no build step. Blender's scripts are the one exception and are
Python because that is the API Blender exposes — keep them thin and push logic to the
TypeScript side.

## Commands

```
npm run dev            build and serve the local Worker, with the dev sidecar watching
npm run build:parts        atlas → one SVG per part       (--check)
npm run build:cosmetics    atlas → one SVG per piece      (--check)
npm run build:motions      manifest + authored → catalog  (--check)
npm run export:motions     catalog + studies → out/ for Blender
npm run import:motions     an edited file → authored clip
npm run blender            build a .blend per clip when Blender is installed
npm run render:clip        contact sheet for review, agent or human
npm run render:figure      every part and cosmetic of a figure, assembled and posed
npm run verify             every gate below, in order
```

A command that does not exist yet is listed here because it is what the milestone it belongs to
has to produce. `npm run verify` runs the gates that exist.

## Verification gates

No CI runs these. The loop is branch, verify, merge, pull, build.

1. `check:rig` — contract parses at a version this build understands, tree is a tree, offsets
   and tips finite, names Blender-legal and unique, paint order a permutation of the bones,
   every anchor on a bone that exists, every cosmetic kind on an anchor and a depth slot that
   exist.
2. `check:sprites` — re-tracing every atlas reproduces every committed part byte for byte.
3. `check:sockets` — every part assembled with every other part in its slot, across every
   sheet, overlaps at each joint by at least the declared minimum. Exhaustive on purpose: a
   slow check that proves the claim beats a fast one that approximates it.
4. `check:motions` — re-deriving every clip reproduces the catalog byte for byte, contact ticks
   land in their move's active window, loop seams close.
5. `check:exchange` — untouched round trip changes nothing; a file in another tool's axis
   convention reads back identically; dropped work is reported and a rest pose is not mistaken
   for it; authored-clip validation rejects bad provenance, unknown bones, unordered frames,
   open seams.
6. `check:wardrobe` — every cosmetic names a kind, an anchor and a depth slot that exist,
   covers what it claims to hide, and reports which figures it is fitted for.
7. `check:footprint` — C7: the invariants hold and nothing grew against the baseline.
8. `typecheck` · `test` · `assert-local-only` · production build.
9. `check:blender` — with Blender present: every joint of every sampled tick lands within
   0.001 units of the sampler's own forward kinematics, and an export back reports zero deltas.
   Skips loudly when Blender is absent; never silently passes.

## Implementation plan

One commit per milestone, `verify` green before merge, no starting the next until the previous
is in. `docs/REWRITE_PLAN.md` expands each of these into the files it creates, the gate it turns
on, its definition of done, and what it defers — along with what the spikes measured and a
verdict on every path the old tree carried.

- **M0 — clean head.** *Done.* This file; the rig contract with anchors, depth slots, sockets
  and cosmetic kinds; the one sampler; forward kinematics; clip types; an empty catalog;
  `check:rig`; typecheck; tests. The old tree is gone and every port comes from history.
- **M1 — parts and figures.** *Done.* Port the tracer with its reasoning intact: flat silhouette, one
  path per nested patch of flat colour, hairline strokes closing seams, deterministic
  quantisation. Colour cap, coordinate precision, simplification tolerance and minimum region
  area are declared knobs, **per slot**, in the atlas sidecar. Emit one file per part. Done
  when a rebuild reproduces every committed part byte for byte and `check:sockets` assembles
  every part with every other.
- **M2 — clips.** Both lanes, the retarget (project to the plane, collapse to eleven bones,
  drop horizontal root travel, resample, reduce), the generated catalog, and the studies
  written to `out/`. Done when every kept clip is reproduced with contact ticks asserted.
- **M3 — Blender exchange.** *Done.* Export with per-bone art and the calibration corner; `setup.py`
  building the armature from C1; `export.py`; the axis-measuring reader; `check:exchange` and
  `check:blender`. Done when a clip opens as a posed figure, an edit lands in
  `motions/authored/`, and an untouched round trip is a table of zeros.
- **M4 — frame data.** Port the kernel: states, move phases, hitbox windows, hitstop, hitstun,
  single-hit gating, deterministic stepping, the boundary test. Done when a move's active
  window and its clip's contact tick are asserted against each other.
- **M5 — preview loop.** The Worker and one page: pick a figure, pick a clip, play, scrub,
  inspect the skeleton, drive the kernel, swap a part without a reload. In dev only the Worker
  proxies `/dev/*` to a sidecar that owns disk — the Worker's own filesystem is virtual and a
  write through it is silently lost — and the sidecar watches `motions/authored/` and `out/`,
  rebuilds, and pushes. Done when an edit saved in Blender shows up in the browser without a
  hand-run command.
- **M6 — wardrobe.** Cosmetics as their own production line: kinds, anchors, depth slots,
  `hides`, `fitted`. Done when a hat, a skirt and a pauldron each render on every figure they
  claim, with no per-figure tuning inside the renderer.
- **M7 — agent surface.** `render:clip` contact sheets, `render:figure` sheets,
  machine-readable reports from every pipeline, schemas an agent can write against, and a
  documented loop: author, validate, render, look, iterate. Done when a clip and a figure can
  be authored end to end without opening an editor.
- **M8 — cruft gate.** No orphan docs, no unreferenced files, no dead scripts, zero runtime
  dependencies. State the final line count, the shipped byte count, and what each directory is
  for. `docs/REWRITE_PLAN.md` is deleted here: the milestones are done and this file plus the
  commit log say everything it said.

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
