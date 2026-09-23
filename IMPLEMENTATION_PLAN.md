# Active implementation plan

This is SVGLab's current/future process-adoption queue under WG-ARCH-001 §27. The GitHub repository is `SouthernGentlemen/SVGLab`; the local checkout may be named `CombatLab`. `SVG-001` is the first prospective controlled change; earlier unnumbered commits remain immutable history. On `do needful`, fetch `main`, open PRs and CI; finish a current green authoritative PR first, then deliver only the first task. A blocked first task is reported, not skipped. The delivering PR removes its task and updates later blocks; delete this file with the final task. Do not implement later work in the same turn.

The laboratory remains deliberately local-only and unsafe as a product capability: no hosted production environment, cloud deploy or release train is implied. That is not an exemption from controlled changes, policy, CI, `check`, settings verification or truthful provider blockers. Preserve deterministic generated assets, Blender/visual evidence, footprint/cruft guards, source attribution and checkout-owned dev cleanup. GitHub reports this repository as public with active `main` and release-tag rulesets, strict `verify` status checks, zero bypass actors, squash-only PR merges and automatic completed-branch deletion. Tasks target one narrow outcome each.

## Open tasks

### SVG-014 — [BUILD] Define immutable release identity

- Dependency: SVG-012 merged and live settings verified.
- Why: SVGLab has no GitHub Release line, but organization-wide release parity requires a deterministic identity for any intentionally published source release.
- Scope: Tie `package.json` version, annotated semantic tag `vX.Y.Z`, exact tagged commit and repository content together. Keep the package private and make GitHub Releases, not npm, the publication authority.
- Non-goals: No npm registry publication, production Cloudflare deployment or automatic version bump.
- Acceptance: A release candidate can be proven from immutable repository inputs and fails clearly on tag/version/commit mismatch.
- Validation: Release-identity cases; `npm run check`; `git diff --check`.
- Authorities: `package.json`, Git annotated tags, release identity scripts/tests.

### SVG-015 — [TEST] Guard annotated tag and package identity

- Dependency: SVG-014 merged.
- Why: Release publication must depend on deterministic failure cases rather than assumptions about how a tag was created.
- Scope: Add disposable Git cases proving lightweight tags fail, malformed semantic tags fail, package/tag version mismatch fails, wrong-commit tags fail, and a correct annotated exact-head tag succeeds.
- Non-goals: No GitHub Release creation, provider mutation or deployment.
- Acceptance: Canonical `npm run check` exercises positive and negative release-identity behavior without network access or credentials.
- Validation: Release identity test suite; `npm run check`; `git diff --check`.
- Authorities: Release identity implementation and Git semantics.

### SVG-016 — [OPS] Publish GitHub Releases from verified tags

- Dependency: SVG-015 merged.
- Why: The shared release path is reviewed commit -> annotated immutable tag -> exact identity verification -> canonical acceptance -> GitHub Release.
- Scope: Add the provider workflow/CLI path that accepts only a verified annotated `vX.Y.Z` tag, resolves the exact tagged revision, runs the pinned toolchain, `npm ci`, canonical `npm run check`, verifies package/tag/commit identity, then publishes with `gh release create --verify-tag`. Existing releases must be handled idempotently or fail safely.
- Non-goals: No npm registry publication, production Wrangler deployment or automatic version mutation.
- Acceptance: Only a correctly annotated, correctly versioned and fully validated immutable tag can create a GitHub Release; arbitrary `main` state cannot publish.
- Validation: Workflow/CLI structure tests; tag acceptance evidence; GitHub Release provider evidence when exercised; `git diff --check`.
- Authorities: Release workflow, GitHub CLI, annotated tag, package version.

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
