# Active implementation plan

This is SVGLab's current/future process-adoption queue under WG-ARCH-001 §27. The GitHub repository is `SouthernGentlemen/SVGLab`; the local checkout may be named `CombatLab`. `SVG-001` is the first prospective controlled change; earlier unnumbered commits remain immutable history. On `do needful`, fetch `main`, open PRs and CI; finish a current green authoritative PR first, then deliver only the first task. A blocked first task is reported, not skipped. The delivering PR removes its task and updates later blocks; delete this file with the final task. Do not implement later work in the same turn.

The laboratory remains deliberately local-only and unsafe as a product capability: no hosted production environment, cloud deploy or release train is implied. That is not an exemption from controlled changes, policy, CI, `check`, settings verification or truthful provider blockers. Preserve deterministic generated assets, Blender/visual evidence, footprint/cruft guards, source attribution and checkout-owned dev cleanup. GitHub currently returns a private-repository ruleset plan/tier 403; do not call that N/A. Tasks target one narrow outcome each.

## Open tasks

### SVG-004 — [SEC] Add private vulnerability reporting and data rules

- Dependency: SVG-003 merged.
- Why: No root `SECURITY.md` defines reporting or forbids disclosure of local clips, exports, private paths and credentials.
- Scope: Add a reporting path and current local-only security boundary; retain `LICENSE.md` attribution and the no-production Cloudflare guard.
- Non-goals: No new hosted service, certification claim or source-license change.
- Acceptance: A reporter has a private route; developer-only data and secret handling are explicit.
- Validation: Link/policy review; `npm run verify`; `git diff --check`.
- Authorities: `SECURITY.md`, `.gitignore`, `LICENSE.md`.

### SVG-005 — [TEST] Validate prospective SVG controlled history

- Dependency: SVG-004 merged.
- Why: The repository has no permanent change-ID validation, and published unnumbered commits must not be rewritten to create it.
- Scope: Validate SVG-001 onward for sequential unique IDs, one primary type and structured body; test malformed and valid prospective commits.
- Non-goals: No retroactive renumbering or forced merge-method change.
- Acceptance: New controlled changes fail on duplicate/gap/invalid identity; old history remains intact.
- Validation: Focused history tests; `npm run verify`; `git diff --check`.
- Authorities: `AGENTS.md`, new history validator.

### SVG-006 — [BUILD] Expose complete acceptance as `npm run check`

- Dependency: SVG-005 merged.
- Why: `verify` currently owns rig, generated assets, sockets, motions, wardrobe, exchange, footprint, cruft, Blender, typecheck, tests and build; `check` is absent.
- Scope: Make `check` own the same credential-free applicable gates plus prospective history, with `verify` a documented compatibility alias; avoid duplicate build/test within one invocation.
- Non-goals: No weakening of deterministic/visual checks or addition of hosted deploy.
- Acceptance: `npm run check` is the single complete local gate; `verify` callers remain valid temporarily.
- Validation: `npm run check`; `npm run verify`; `git diff --check`.
- Authorities: `package.json`, `CONTRIBUTING.md`.

### SVG-007 — [BUILD] Pin the tested Node/npm pipeline toolchain

- Dependency: SVG-006 merged.
- Why: `AGENTS.md` assumes Node 26, but package metadata has no exact Node/npm pin or engine policy for reproducible pipelines.
- Scope: Pin a tested Node/npm pair and locked-install policy without importing unrelated architecture browser/application dependencies.
- Non-goals: No dependency upgrade or product behavior change.
- Acceptance: Clean local and later CI setup use the same supported toolchain and committed lockfile.
- Validation: `npm ci` under the pin; `npm run check`; `git diff --check`.
- Authorities: `package.json`, package lock, `.node-version`, `.npmrc`.

### SVG-008 — [BUILD] Run locked acceptance in PR and `main` CI

- Dependency: SVG-007 merged.
- Why: The owner-directed self-service prerequisite adds exact-head PR acceptance early using the current `verify`/Node authority; after SVG-006 and SVG-007, CI still needs to converge on the canonical `check` command and pinned toolchain and validate merged `main`.
- Scope: Update the existing controlled-delivery CI to the pinned toolchain and `npm run check`, retain exact-head PR coverage, add `main` acceptance, and preserve the private pinned Boneyard sibling plus local-only Cloudflare safety.
- Non-goals: No production deployment, release workflow or visual-artifact fabrication.
- Acceptance: The same canonical gate runs locally, on exact PR head and on merged `main`; a missing required tool or private sibling is an explicit failure rather than a silent skip.
- Validation: `npm run check`; workflow review; exact-head and merged-main CI; `git diff --check`.
- Authorities: `.github/workflows/controlled-delivery.yml`, `package.json`, `AGENTS.md`.

### SVG-009 — [TEST] Commit and test expected GitHub protections

- Dependency: SVG-008 merged.
- Why: No settings-as-code authority or pure comparison cases define protected `main` and immutable published tags.
- Scope: Add expected repository settings and credential-free comparison tests; mark release publication currently N/A, but require immutable `v*` protection before a release is published.
- Non-goals: No provider mutation or paid-tier assumption.
- Acceptance: Pure tests catch material settings drift without claiming live protection.
- Validation: Focused settings tests; `npm run check`; `git diff --check`.
- Authorities: `config/github-repository-settings.json`, new tests, WG-ARCH-001 §27.

### SVG-010 — [OPS] Verify live protections or surface the tier blocker

- Dependency: SVG-009 merged.
- Why: The live private-repository ruleset API currently returns a plan/tier 403; that blocks provider parity, not the process obligation.
- Scope: Add a read-only live verifier and explicit failure guidance. If GitHub still disallows rulesets, leave the task open and request owner/provider action; do not mark it complete from pure tests.
- Non-goals: No visibility change, purchase, provider bypass or production workflow. Delete this plan only after this task genuinely completes.
- Acceptance: Live settings match committed expectations, or the exact unresolved 403 remains a reported blocker.
- Validation: Pure settings tests; `npm run check`; live verifier when permitted; `git diff --check`.
- Authorities: settings baseline, GitHub repository rules, `SECURITY.md`.

## Recheck after this wave

Review current source and provider state for further process drift. `npm run dev` already has teardown/reset/build/start/readiness/browser behavior; test safety before changing it. A local-only lab never needs a fictional production deployment, but any future published release must use immutable annotated tags and GitHub Releases.
