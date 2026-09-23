# Working in SVGLab

SVGLab is a local, deliberately unsafe 2D character animation laboratory. It fetches a rig, its
art and its clips from [Boneyard](../Boneyard/AGENTS.md), assembles a figure in the DOM, plays
it against a sealed deterministic combat kernel, and serves the whole thing from a local
Cloudflare Worker with a disk-owning dev sidecar behind it.

This file is the contract. It describes the repository as it exists. When code and this file
disagree, one of them is a bug — say which.


[`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) is the active current/future queue for
adopting the WizardGang development process. Its first open task has priority over new lab
features unless the owner explicitly changes priority; completed tasks belong in Git/GitHub.

## Controlled changes

`SVG-001` begins the prospective controlled-change sequence. Earlier published commits keep
their existing identities; do not rewrite history to retrofit SVG IDs. Every queued delivery
uses exactly one `SVG-NNN` ID from `IMPLEMENTATION_PLAN.md`.

The owner-directed `[OPS] Restore self-service controlled delivery` prerequisite is a singular
out-of-band repair between controlled SVG deliveries. It does not consume an SVG ID and must not
be generalized into permission for future unnumbered work; normal controlled delivery resumes
from the active queue.

- Branch: lowercase `svg-nnn-short-kebab-summary`, using the selected task ID.
- Commit and PR title: `[SVG-NNN] [TYPE] Imperative summary`, with the task's one primary type.
- Commit and PR bodies name the same SVG ID and state the delivered scope, validation actually
  run, current CI/provider truth, and any release or deployment effect. Never claim a check,
  setting change, merge, release, or deployment that did not happen.

`check:history` validates this contract prospectively. Published controlled IDs and current
queued task IDs form one contiguous namespace beginning at `SVG-001`; duplicates and gaps in
that published-plus-queued namespace fail. A new controlled `HEAD` normally matches the parent
revision's first queued ID and primary type. An explicitly owner-directed portfolio process task
uses the first unassigned ID after the current queue. `SVG-001` remains the immutable published boundary
and keeps its original pre-contract body; from `SVG-002` onward controlled bodies must name the
ID and state scope, validation, CI/provider truth, and release/deployment effect.

### Do needful and task selection

`do needful` means re-fetch authoritative `main`, open PRs, CI/checks and relevant live
repository settings before changing anything. Finish a current authoritative PR for the first
queued task when it is already complete, current, green where CI exists and mergeable; otherwise
start from fresh `main` and select exactly the first open task in the active queue. If that
task's dependency or required provider state is blocked, report the blocker and stop. Never skip
a blocked first task, substitute a later task, or bundle more than one queued SVG task.

### Complete one delivery

1. Create the task branch from the freshly fetched `main` and implement only that task.
2. Run the task's focused validation, the complete applicable local acceptance gate and
   `git diff --check` when an executable checkout is available; inspect the resulting diff and
   preserve the local-only product boundary. When GitHub exact-head acceptance is configured, its
   result is authoritative for merge. A web agent that lacks a shell must not ask the owner to
   rerun the same acceptance locally merely because the agent cannot execute repository commands.
3. Push the controlled change and open a PR whose branch, title and body all identify the same
   SVG task.
4. Inspect the PR's exact head, current `main`, mergeability, reviews/checks and relevant live
   provider rules. Required exact-head GitHub acceptance must be present and green; an absent,
   pending or failing required check blocks merge and is never reported as green or waived.
5. If the head moved, `main` advanced, validation failed or provider state blocks delivery,
   correct the same task and revalidate rather than starting another task.
6. Merge only when the exact controlled head is current, green and mergeable under the live
   provider rules, then re-fetch `main` and confirm that the delivered change is present.
   Finished controlled branches are removed automatically by native provider cleanup; verify that
   cleanup occurred rather than asking the owner to delete the branch.

The delivering PR removes its own task from `IMPLEMENTATION_PLAN.md`; do not leave completed
checkboxes or historical task prose in the active queue. Update later dependency text only when
needed to keep future work truthful. When the final queued task is delivered, delete
`IMPLEMENTATION_PLAN.md` in that same PR. An absent/exhausted queue means fresh planning mode:
inspect current repository and provider drift and publish the next small current/future wave
before implementing any newly discovered work.

End each delivery after exactly one task. Return a complete kickoff prompt for the new first
open task, including repository, confirmed `main`, task ID/title, branch/title, scope,
non-goals, validation and current provider/CI facts; do not start that task in the same turn.
If the queue is exhausted, hand off the fresh-planning pass instead.

These process controls do not turn SVGLab into a hosted product. Accounts, production
authentication, persistent cloud state and a production Cloudflare release/deployment surface
remain out of scope unless an explicit future authority changes that boundary.

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

**Out of scope as product capabilities**: anything Boneyard owns — the rig contract, art
generation, motion retargeting, the BVH exchange. Also accounts, production authentication,
databases, analytics, campaign or progression systems, inventory, economy, matchmaking, hosted
production deployment automation and release trains. The development-process adoption queue
covers repository CI and controlled change IDs; laboratory status is not an exemption from those
controls. Cloudflare is a local runtime plus a dev deploy target and nothing more: no production
environment, account id, route, or persistent binding.

Reset and teardown scripts may delete generated output and disposable runtime state only.
Never authored source, never a `.blend` someone is editing.

## Contracts

Each one is testable, and something in `check` tests it.

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

Frame data stays integer ticks. A clip does not: Boneyard normalises every clip to thirteen
poses on phases, so a move's duration and its animation's shape are independent numbers. A
contact tick that does not land on a pose is interpolated, which costs 1.7° on the strike;
choosing a duration that puts contact on a pose is the fix, and is this repository's choice to
make because the duration is combat data.

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

The tested repository toolchain is Node 26.9.0 with npm 11.19.1. `.node-version`,
`packageManager`, `engines`, `.npmrc`, and the locked `allowScripts` list govern clean installs.

## Commands

```
npm run teardown          stop only local SVGLab processes
npm run reset             clear disposable runtime/build output, never out/
npm run launch            start the built local Worker and sidecar
npm run dev               reset, build and launch the local lab
npm run build             production Vite build; prebuild runs assert-local-only
npm run build:motions     boneyard catalog → typed clip modules
npm run check:history     validate prospective controlled commits and queued IDs
npm run test:history      run disposable-Git positive/negative history cases
npm run verify:release-identity -- --tag vX.Y.Z --commit <40-char-sha>
                         prove an immutable source-release identity
npm run test:release-identity
                         run focused release-identity decision cases
npm run check:motions     byte-identical clip modules against the catalog
npm run check:footprint   runtime invariants and committed byte ratchet
npm run check:cruft       reachability, docs, scripts and runtime dependencies
npm run assert-local-only reject production Cloudflare/deployment configuration
npm run typecheck         validate the strip-only TypeScript dialect
npm run test              run the complete Vitest suite
npm run test:watch        run Vitest in watch mode
npm run check             canonical complete acceptance: every gate, typecheck, tests and build
npm run verify            temporary compatibility alias for npm run check
```

Anything about the rig, the art or the clips themselves is a command in Boneyard —
`check:rig`, `build:parts`, `check:sockets`, `render:figure`, `import:motions`, `check:blender`.

## Verification gates

`config/github-repository-settings.json` defines the current squash-only GitHub policy.
`npm run test:github-settings` checks it without credentials. `npm run verify:github-settings`
reads live repository settings and both rulesets with `GH_ADMIN_TOKEN` or an authorized
`GH_TOKEN`; it never changes GitHub. Keep tokens in the process environment only, never in
files, documentation examples, logs, or `npm run check`.
`npm run apply:github-settings` is the explicit repository-owned administration command;
it applies only the committed repository/ruleset policy and independently re-reads the result.

`npm run verify:release-identity -- --tag vX.Y.Z --commit <40-char-sha>` is the read-only
source-release identity gate. It requires an annotated stable semantic tag, resolves that tag
to the exact requested commit and tree, reads `package.json` from that immutable commit, and
requires the package version to equal the tag while `private` remains true. Its machine-readable
proof names the package blob and `github-release` as the publication authority. It does not
create a tag, GitHub Release, npm publication, or Cloudflare deployment.

`npm run check` is the canonical complete credential-free local acceptance command. `npm run
verify` remains a temporary compatibility alias that delegates to `check`. Pull requests are
also checked by `.github/workflows/controlled-delivery.yml`: it checks out the exact PR head and
the pinned publicly readable Boneyard sibling in a clean runner, installs from the committed
lockfile with `npm ci`, invokes `npm run check`, then runs
committed-range `git diff --check` for pull requests. Merged `main` runs the same canonical gate. The pinned
Boneyard commit was confirmed anonymously readable on 2026-09-22; a failed sibling checkout
fails acceptance rather than skipping the dependency.

Required exact-head GitHub acceptance is authoritative for merge. Local commands remain the
developer feedback path, but a web agent without a shell does not need an owner-terminal replay
of a green exact-head workflow. `check` runs in this order, with one explicit production build
before footprint; its complete Vitest invocation disables npm lifecycle scripts so the standalone
`pretest` build is not repeated inside the umbrella command.

1. `check:history` — `SVG-001` onward obeys the prospective controlled identity/body contract,
   the published-plus-queued namespace is contiguous, and a new controlled head consumes the
   parent queue's first task or an explicitly owner-directed portfolio process ID after the
   queue; earlier published commits remain accepted legacy history.
2. `check:motions` — the generated clip modules are Boneyard's catalog, lane for lane and clip
   for clip, and rebuild byte for byte.
3. `check:cruft` — every tracked path is reached by an import, reference or reasoned entry;
   every Markdown guide is linked and names live paths; npm scripts and pipeline files are live;
   the only runtime dependency is a `file:`-linked boneyard.
4. `build` — the production Vite build, which also copies Boneyard's servable art into `dist/`
   and fails if Boneyard has no built catalog.
5. `check:footprint` — C4: the invariants hold and nothing grew against the baseline.
6. `typecheck` and `test`.
7. `assert-local-only` — the Worker has no account, binding, deployment or persistence surface.

A change that touches the rig, the art or a clip needs Boneyard's `verify` too. Run it there.

## Working rules

- Small branches off `main`. `check` before merge. Merge promptly, then delete the branch.
  Never leave finished work parked in an open branch.
- Never edit a file that has uncommitted changes in it. Use a separate worktree — a branch
  alone does not isolate anything.
- Comments explain *why*. No narration of what the code plainly does.
- When a tool surprises you, measure its behaviour and write the measurement into the code as a
  calibration step. Never encode a guess.
- Verify visually where the output is visual: render the scene or the page, and look at it,
  before calling anything done.
  Documentation and process-only changes with no visual-output surface do not invent a visual
  validation claim.
