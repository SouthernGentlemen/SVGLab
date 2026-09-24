# Contributing

Read [AGENTS.md](AGENTS.md) before changing a repository. It owns the repository's product boundaries, controlled change identity, validation details, and merge rules. Read the active implementation plan when present; its filename may be `implementation_plan.md` or `IMPLEMENTATION_PLAN.md`.

## Work queue and plan updates

The first open plan task is the default next implementation task unless the owner explicitly changes priority. Keep existing open tasks in place when appending future work. A separately requested portfolio plan maintenance change may append or clarify future tasks while another task or pull request is in progress. Once the shared policy is established, that maintenance change edits only the active plan file and does not claim to deliver a queued task. The last task deletes the plan only when no later task remains.

Before editing or merging, fetch current `main` and inspect open pull requests. Record the base commit and the plan's current contents. Immediately before merging, fetch again and compare the current `main` commit, exact pull request head, and plan against that recorded base. Rebase and reconcile any concurrent plan change rather than overwriting it. Merge only the current, mergeable head after required checks pass.

## Toolchain and commands

Use the exact Node version in `.node-version` and npm version in `package.json`'s `packageManager`; install from the committed lockfile with `npm ci`. `npm run check` is the canonical local repository acceptance command. Run the focused checks named by the active task and `git diff --check` as well. `build`, `test`, `typecheck`, and `dev` follow the repository's `package.json` and AGENTS.md; use only capabilities that repository actually has. Network dependency advisories, live GitHub settings verification, releases, and production deployment are separate operations with repository-specific prerequisites.

Shared dependencies and versioned vendor tooling should use one supported version across public repositories when those repositories consume them. GitHub Actions workflows and common npm script names should have equivalent behavior for equivalent capabilities. A library or local-only application does not acquire a hosted deployment merely for parity.

## Contribution and security boundaries

Keep changes scoped to one controlled delivery unless the owner requests portfolio plan maintenance. Record validation and provider actions truthfully. Follow the repository's AGENTS.md for branch, commit, pull request, exact-head CI, and squash-merge requirements. Use [SECURITY.md](SECURITY.md) for security reports. Ownership is defined by AGENTS.md and its linked ownership policy where present.
