# Active implementation plan

This is SVGLab's current/future process-adoption queue under WG-ARCH-001 §27. The GitHub repository is `SouthernGentlemen/SVGLab`; the local checkout may be named `CombatLab`. `SVG-001` is the first prospective controlled change; earlier unnumbered commits remain immutable history. On `do needful`, fetch `main`, open PRs and CI; finish a current green authoritative PR first, then deliver only the first task. A blocked first task is reported, not skipped. The delivering PR removes its task and updates later blocks; delete this file with the final task. Do not implement later work in the same turn.

The laboratory remains deliberately local-only and unsafe as a product capability: no hosted production environment, cloud deploy or release train is implied. That is not an exemption from controlled changes, policy, CI, `check`, settings verification or truthful provider blockers. Preserve deterministic generated assets, Blender/visual evidence, footprint/cruft guards, source attribution and checkout-owned dev cleanup. GitHub reports this repository as public with active `main` and release-tag rulesets, strict `verify` status checks, zero bypass actors, squash-only PR merges and automatic completed-branch deletion. Tasks target one narrow outcome each.

## Open tasks

### SVG-017 — [TEST] Guard the local-only post-release boundary

- Dependency: SVG-016 merged.
- Why: Cross-repository release parity must not accidentally turn SVGLab into a hosted production product.
- Scope: Extend local-only guards so legitimate release identity, annotated tags and GitHub Release publication are allowed while production Wrangler deploy commands, production Cloudflare account/route configuration, persistent production bindings, Pages/Worker production deployment workflows, npm publication and production authentication/account surfaces remain rejected.
- Non-goals: No production environment or new application feature.
- Acceptance: Canonical acceptance proves SVGLab can publish immutable source releases while remaining incapable of production deployment.
- Validation: Local-only positive/negative cases; `npm run check`; `git diff --check`.
- Authorities: `assert-local-only`, `AGENTS.md`, `CONTRIBUTING.md`, `package.json`, workflows.

### SVG-018 — [DOCS] Complete process-parity acceptance

- Dependency: SVG-017 merged.
- Why: The wave should finish with a fresh comparison against the active organization baseline instead of trusting assumptions accumulated during the individual tasks.
- Scope: Re-audit Node/npm toolchain, `npm ci`, canonical `npm run check`, controlled history, exact-head and merged-main CI, squash-only merge behavior, provider settings CLI, live rules/rulesets, branch cleanup, annotated tag identity, GitHub Release publication and the explicit no-production-deploy boundary. Reconcile only current-state docs and delete `IMPLEMENTATION_PLAN.md` when all applicable evidence is green.
- Non-goals: No feature work, product deployment or unrelated refactor.
- Acceptance: Fresh repository and provider evidence show SVGLab follows the shared development/release process everywhere applicable, production deployment is explicitly and testably N/A, and no implementation queue remains.
- Validation: `npm ci`; `npm run check`; `npm run verify:github-settings`; live provider verification; release/tag evidence; exact-head CI; post-merge CI; `git diff --check`.
- Authorities: Current repository state, current GitHub provider state and organization baseline.

## Target process

Normal controlled delivery after this queue converges:

`branch -> controlled SVG commit -> PR -> npm ci -> npm run check -> exact-head CI -> squash merge -> merged-main CI -> completed-branch cleanup`

Intentional source release:

`reviewed main -> package version -> annotated vX.Y.Z tag -> verify exact tag/package/commit identity -> npm ci -> npm run check -> gh release create --verify-tag`

Then stop. SVGLab has no production deploy stage. That absence is an architectural requirement, not missing release automation.

## Recheck after this wave

Review current source and provider state for fresh drift only after SVG-018. Preserve the local-only product boundary, deterministic generated assets, Boneyard ownership line, visual evidence requirements, provenance rules, footprint/cruft guards and checkout-owned dev cleanup.
