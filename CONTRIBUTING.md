# Contributing to SVGLab

SVGLab is a deliberately local-only animation and combat laboratory. Read
[`AGENTS.md`](AGENTS.md) first: it is the repository contract. The active current/future work
queue is [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md), and its first open task is the
next-work authority unless the owner explicitly changes priority.

The rig, character art, wardrobe, motion source and asset-generation pipelines live in the
sibling Boneyard repository. SVGLab consumes them; it does not keep a second copy. A change to
what a bone, cosmetic or clip *means* belongs in Boneyard.

Security vulnerabilities and sensitive local-data handling follow [`SECURITY.md`](SECURITY.md).
Use its private vulnerability reporting route rather than disclosing security details publicly.

## Controlled SVG changes

Prospective work uses one queued `SVG-NNN` ID per delivery.

1. On `do needful`, re-fetch authoritative `main`, open PRs, checks and relevant provider
   state. Finish a current authoritative PR for the first open task before starting duplicate
   work. Never skip a blocked first task.
2. Branch from current `main` as `svg-nnn-short-kebab-summary`.
3. Use `[SVG-NNN] [TYPE] Imperative summary` for the controlled commit and PR title. The
   commit and PR bodies name the same SVG ID and report only validation/provider facts actually
   observed.
4. Implement only that task. In a developer checkout, run its focused checks,
   `npm run check`, and `git diff --check`; inspect the complete diff. GitHub exact-head CI
   runs the canonical acceptance and committed-range whitespace check for merge. A web agent that
   lacks a shell must use that exact-head result instead of requiring the owner to rerun it.
5. Re-fetch the exact PR head, current `main`, mergeability, reviews/checks and live provider
   rules. Required exact-head CI must be present and green; absent, pending or failing CI blocks
   merge.
6. Merge only when the exact head is current, validated and mergeable. The same delivery removes
   its own task from `IMPLEMENTATION_PLAN.md`, confirms merged `main`, verifies automatic
   finished-branch cleanup, and stops with the next-task handoff.

`npm run check:history` enforces the published-plus-queued SVG namespace and verifies that a
new controlled head consumes the parent queue's first ID and primary type. Published commits
before SVG-001 remain legacy history and are not retrofitted.

Do not bundle a later SVG task into the same delivery.

## Command roles

Install dependencies with `npm install`. The `boneyard` dependency is a `file:../Boneyard`
link, so the sibling checkout must exist and have a built catalog before SVGLab can build.

### Local development

- `npm run dev` is the normal local lifecycle. It tears down checkout-owned local processes,
  resets disposable `dist/`, Wrangler and runtime state while preserving `out/`, rebuilds,
  starts the disk-owning sidecar and local Cloudflare runtime, waits for readiness, then opens
  the browser.
- `npm run teardown` stops only the checkout's local runtime/sidecar processes.
- `npm run reset` clears only disposable build/runtime state and preserves `out/`.
- `npm run launch` starts the already-built local Worker and sidecar without doing the reset
  and build performed by `npm run dev`.

These commands are local development tools. They do not publish a hosted product.

### Builds and deterministic generated output

- `npm run build` runs the Vite production build; its `prebuild` hook runs
  `assert-local-only`.
- `npm run build:motions` regenerates `src/clips/generated/*.ts` from
  `boneyard/catalog/clips.json`.
- `npm run check:motions` runs that generator in `--check` mode and fails when tracked
  generated clip modules are stale.

Do not hand-edit deterministic generated output. Change the applicable authored/upstream input,
run its generator, then run the matching `--check`/guard command.

### Focused checks and tests

- `npm run check:history` validates the prospective controlled history and active queue.
- `npm run test:history` runs deterministic disposable-Git positive and negative history cases.
- `npm run check:cruft` checks reachability, documentation/script references and dependency
  boundaries.
- `npm run check:footprint` enforces the committed byte ratchet and runtime invariants.
- `npm run assert-local-only` rejects production Cloudflare/deployment configuration.
- `npm run typecheck` runs TypeScript without emitting files.
- `npm run test` runs the Vitest suite; npm's `pretest` lifecycle runs `npm run build`
  first.
- `npm run test:watch` is the interactive Vitest loop.

### Complete acceptance

`npm run check` is SVGLab's canonical complete credential-free acceptance umbrella. It runs,
in order, `check:history`, `check:motions`, `check:cruft`, the production build,
`check:footprint`, `typecheck`, the complete Vitest suite, and `assert-local-only`. The umbrella
invokes the tests with npm lifecycle scripts disabled after its explicit build, so the standalone
`pretest` build is not repeated. `npm test` itself still keeps that pretest build when run on its
own. `npm run verify` remains a temporary compatibility alias to `npm run check`.

Pull requests exercise the same gate in `.github/workflows/controlled-delivery.yml`. The workflow
uses a clean exact-head checkout, a pinned publicly readable Boneyard sibling at `../Boneyard`,
`npm ci`, `npm run check`, and pull-request committed-range
`git diff --check <base>...<head>`. Merged `main` runs the same canonical check. The pinned commit was
confirmed anonymously readable on 2026-09-22, so no cross-repository Actions secret is needed.
If that access changes, the sibling checkout fails acceptance and requires a read-only credential
before merge.

The exact PR-head workflow result is authoritative for merge. Local commands remain useful for
developer feedback, but a web agent that cannot execute a shell must not make the owner's terminal
a second mandatory copy of an already-green exact-head gate.

## Visual review and Boneyard-owned output

Use `npm run dev` to review SVGLab presentation and combat behavior in the local page. When a
change affects Boneyard-owned sprite, figure, clip or Blender output, make that data change in
Boneyard and use its current visual/guard commands there, including `render:figure`,
`render:clip`, `check:sprites`, `check:motions`, `blender` and `check:blender` as
applicable. Run Boneyard's complete acceptance for a change that touches its data.

Visual output is part of validation: inspect the rendered page, sheet, clip or Blender result
when the change can affect it.
Do not fabricate visual validation for documentation or process-only work that cannot affect
visual output.

## Cloudflare boundary

Cloudflare is a local runtime and development target only. SVGLab intentionally has no
production account id, route, persistent binding, deployment script, production authentication
surface or release/deployment train. Do not introduce or imply one as part of ordinary
contribution work.

## Licensing and attribution

The authoritative root [`LICENSE.md`](LICENSE.md) explains what SVGLab distributes and the
terms that follow that material; it points to Boneyard's provenance index for the upstream
assets. Presence in this repository or in `dist/` is not a permission grant. In particular,
the Bandai Namco-derived motion is CC BY-NC 4.0 and other served art has unresolved or
non-redistributable provenance described in the licence index.

Do not change source licensing, attribution or third-party provenance terms casually. Treat
`LICENSE.md` as the repository authority for those questions.
