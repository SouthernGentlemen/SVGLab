# Active implementation plan

**Portfolio plan maintenance notice.** The owner may direct an additive update to this active queue while another task or pull request is in progress. Keep every existing open task and its order; a plan amendment neither implements nor retires it. After the shared policy setup, a routine amendment changes only this plan file. Before merging, re-fetch authoritative `main` and open pull requests, compare the current plan and exact head with the recorded base, and rebase/reconcile if either moved. Require current exact-head checks and mergeability so concurrent work is not overwritten. Any earlier “final task” or “no queue remains” wording applies to its original wave; it keeps this plan while appended tasks remain, and only the actual last task deletes it.

This is SVGLab's current/future process-adoption queue under WG-ARCH-001 §27. The GitHub repository is `SouthernGentlemen/SVGLab`; the local checkout may be named `CombatLab`. `SVG-001` is the first prospective controlled change; earlier unnumbered commits remain immutable history. On `do needful`, fetch `main`, open PRs and CI; finish a current green authoritative PR first, then deliver only the first task. A blocked first task is reported, not skipped. The delivering PR removes its task and updates later blocks; delete this file with the final task. Do not implement later work in the same turn.

The laboratory remains deliberately local-only and unsafe as a product capability: no hosted production environment, cloud deploy or release train is implied. That is not an exemption from controlled changes, policy, CI, `check`, settings verification or truthful provider blockers. Preserve deterministic generated assets, Blender/visual evidence, footprint/cruft guards, source attribution and checkout-owned dev cleanup. GitHub reports this repository as public with active `main` and release-tag rulesets, strict `verify` status checks, zero bypass actors, squash-only PR merges and automatic completed-branch deletion. Tasks target one narrow outcome each.

## Open tasks

### SVG-021 — [OPS] Normalize shared package, workflow, and npm command contracts

- Dependency: SVG-018 delivered; portfolio planning policy SVG-020 merged. Coordinate with the same normalization task in every public sibling repository.
- Why: Shared versioned tooling, workflow behavior, and npm command meanings have drifted across the public repositories.
- Scope: Inventory every public repository's direct and transitive shared npm packages, package manager, Node pin, lockfile, versioned vendor code, GitHub Action pins, workflow triggers/permissions/toolchain/install/check/advisory/identity/release/deploy steps, and npm scripts. Select one supported version for each shared vendor dependency or document a concrete compatibility exception. Align common scripts and YAML workflows to the same behavior for equivalent capabilities. Keep product-specific commands and explicit local-only/library/no-deploy boundaries. Reconcile AGENTS.md and the byte-identical CONTRIBUTING.md contract across the public set.
- Non-goals: Do not add unused packages, a hosted runtime to a local-only product, or production deployment merely for parity. Do not rewrite published history or unrelated product behavior.
- Acceptance: A fresh cross-repository matrix shows the same version for every shared versioned package/vendor tool where compatible, identical CONTRIBUTING.md bytes, equivalent workflow and npm-script semantics for applicable capabilities, and recorded exceptions with technical reasons. No workflow invokes a missing script; every package lock matches its manifest.
- Validation: Install each public repository with its pinned toolchain and `npm ci`; run `npm run check`, focused workflow/script contract tests, `git diff --check`, exact-head CI, and the separate network/provider gates where applicable. Re-fetch every target's base and this documentation commit before merging to preserve concurrent work.

## Target process

Normal controlled delivery after this queue converges:

`branch -> controlled SVG commit -> PR -> npm ci -> npm run check -> exact-head CI -> squash merge -> merged-main CI -> completed-branch cleanup`

Intentional source release:

`reviewed main -> package version -> annotated vX.Y.Z tag -> verify exact tag/package/commit identity -> npm ci -> npm run check -> gh release create --verify-tag`

Then stop. SVGLab has no production deploy stage. That absence is an architectural requirement, not missing release automation.

## Recheck after this wave

Review current source and provider state for fresh drift only after SVG-021. Preserve the local-only product boundary, deterministic generated assets, Boneyard ownership line, visual evidence requirements, provenance rules, footprint/cruft guards and checkout-owned dev cleanup.
