# Security policy

SVGLab is a public, deliberately local-only animation and combat laboratory. It has no hosted
production service, but ordinary vulnerability reporting, secret handling and private-data rules
still apply.

## Report vulnerabilities privately

GitHub private vulnerability reporting is enabled for this repository. Open
<https://github.com/SouthernGentlemen/SVGLab/security/advisories> and select
**Report a vulnerability** to send details privately to the maintainers. GitHub confirmed this
setting was enabled on 2026-09-22.

Do not disclose a vulnerability through a public issue or discussion elsewhere, a pull request,
commit message, public paste, screenshot, log upload or external forum. Issues in this repository
are public and must not contain vulnerability details.

If the reporting button is unavailable, contact an authorized maintainer through an
already-established private channel. Do not send vulnerability details until the channel is
confirmed private.

A useful report normally includes the affected path, command or behavior; the security impact;
minimal reproduction steps using synthetic or redacted data; the relevant commit or version when
known; expected versus actual behavior; and an optional mitigation or fix. Do not include real
credentials, tokens, private account data or other sensitive material just to make a report
complete.

## Keep local and generated data private

Local development state is not a publication surface merely because it exists during a build,
preview or investigation. In particular:

- local clips, generated exports, `.blend` files and other visual work remain developer-local
  unless an explicit authority says otherwise;
- private filesystem paths, logs, environment values, credentials, tokens, account identifiers
  and other private data must not be committed or copied into reports;
- prefer synthetic values, redaction and repository-relative paths over real secrets, user data
  or absolute machine paths;
- `out/`, `.runtime/`, `.wrangler/`, `dist/`, logs and other generated or disposable
  state are not publication surfaces.

The current `.gitignore` also keeps `node_modules/`, `dist/`, `.runtime/`,
`.wrangler/`, `*.log`, `__pycache__/`, `*.pyc`, `.DS_Store` and `out/` untracked.
Being ignored does not make a file safe to disclose, redistributable or appropriate to attach to
a report.

Credentials, tokens, account identifiers, local absolute paths and private data must never be
committed. If evidence contains them, replace them with placeholders before sharing the evidence.

## Cloudflare remains local-only

The Worker/Cloudflare surface is deliberately a local development/runtime target. SVGLab has no
production account id, route, persistent binding, production authentication surface or deployment
train. That local-only design reduces exposed product surface; it does not remove ordinary
secret-handling, private-data or vulnerability-reporting obligations.

## Source material, attribution and redistribution

Authoritative attribution and redistribution guidance remains in root
[`LICENSE.md`](LICENSE.md), which points to Boneyard's provenance index for upstream material.
This security policy does not change source licensing, Bandai Namco CC BY-NC 4.0 attribution,
upstream provenance, redistribution conclusions or unresolved art-rights statements.

Do not copy unresolved or non-redistributable upstream material into a vulnerability report
unless it is strictly necessary. Prefer a repository-relative path, asset identifier and concise
description over reproducing the material itself.
