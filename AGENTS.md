# Working in SVGLab

This repository is an intentionally unsafe, local-only combat and SVG animation sandbox.

## Scope

- Keep combat simulation independent from DOM, SVG, wall clocks, Cloudflare APIs, and persistence.
- Keep authored SVG and animation definitions understandable by hand.
- Do not add accounts, production authentication, databases, analytics, campaign systems, inventory, economy, matchmaking, or deployment infrastructure.
- Cloudflare is a local runtime only. Do not add a deploy/publish script, production environment, account id, route, persistent binding, or deployment workflow.
- Reset scripts may delete only generated output and disposable runtime state; never authored files under `src/` or `docs/`.

## Change workflow

Use the lightweight RealEstate-style merge loop:

1. Start a small, focused branch from `main`.
2. Make one coherent change and run `npm run verify`.
3. Merge the finished change back to `main` promptly.
4. Push `main` when a remote exists, then delete the short-lived branch locally and remotely.
5. Do not leave completed work parked in an open branch or pull request.

Release trains, change IDs, release tags, and deployments are deliberately absent.
