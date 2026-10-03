# Phase 1 verification

Local packaging work only. No editor/application source changed, no directory account used,
no listing submitted and no remote distribution branch pushed during this verification.

## Scope and review

`/check` runs inline: review, simplify, verify. Review base is
`5b91be155a1439e4b7d36f578f43b5a69eb047f8`, obtained by `review-request.mjs` after a successful
fetch of `origin/main`. The scope is the 29 added/changed/deleted paths in this branch: release
workflow, root package scripts, toolkit notice, plugin manifests/READMEs/licences, canonical and
generated setup/skill, skill/distribution/branch generators, package/branch tests, submission
drafts, update procedure, account checklist and this spec/evidence. Generated licences were
compared to the canonical Apache text; the deleted launcher registry-check copy has no callers.

Review corrected three cases: explicit development override must be a file, not a directory;
Codex publisher-name validation uses the current 80-character limit and allows long-description
line breaks; archive reproducibility records the Node/zlib toolchain. All have scoped checks.
Simplification removed the obsolete MCP latest-version lookup/copy and reuses the existing
version/skill generator for pins and licence copies. Git diagnostic output is captured by the
branch generator. No speculative portable manifest overlay or second maintained toolkit added.

## Package checks

- `npm run check:skill` checks maintained/generated skill parity, README pins, manifest versions
  and Apache licence/notice copies. `npm run check:toolkit` validates 76 file occurrences across
  Claude main/MCP, Codex main/local MCP and the repository package.
- Twenty package/launcher/branch tests pass. Independent JSZip extraction verifies CRC and every
  file's bytes. Tests reject missing licence/reference, stale or floating pins, manifest/path/file
  errors, count/size limits and generated drift. Branch tests exercise initial root, generated
  parents, no-op updates, stale source refusal and canonical-remote restriction using a local bare
  remote. No GitHub push is part of those tests.
- `npm run toolkit:dist` runs twice from clean commit `2036628c1` with identical ZIP SHA-256 values.
  Its repository ZIP was 396,897 compressed bytes, 484,379 unpacked bytes, 30 files/44 entries.
  `publish-toolkit-distribution.mjs` dry-run created a root commit containing only that tree;
  the prefixed Git archive was 403,031 bytes. Final-tip measurements are generated alongside
  the final ZIPs; they are authoritative for that artifact's source commit.
- `claude plugin validate` passes independently for generated Claude main and MCP packages.
  The Codex-only package, excluding Claude manifest/command and MCP, installs independently
  using the native Codex CLI. These are local checks, not portal/security scan outcomes.
- Scoped ESLint, workflow validation, gate coverage, copy, docs index, owner queue and diff checks
  pass. CLI typecheck/build pass after installing its own locked dependencies.

## Installed workflow

See [the structured receipt](installed-workflow.json). Claude Code 2.1.287 and Codex CLI
0.162.0-alpha.9 install both generated plugins into isolated profiles under ignored
`cli/dist/toolkit-profiles`. A second Codex profile installs the standalone Codex package.
Claude's filesystem check failed inside the sandbox and passed outside it with the same local
source. Profiles have no copied account credentials. The CLI runtime is a separate clean npm
installation of public `@noacg/cli@0.8.1`; its integrity is recorded in the receipt.

Queued browser rehearsal uses that runtime and the installed skill's existing file workflow:
doctor, scaffold a neutral Aurora handball scoreboard, inspect, change its accent in CSS,
validate with captures, capture on-air and write an offline pack. The hosted `/bridge` reports
protocol v1 at `main@5b91be155a`. Static validation and the runtime bench pass, with one existing
neutral-scoreboard `bench-stress` warning about a score extending past its backing surface.
The settled stress capture was inspected and its text fits; this is recorded rather than
changing application/template code in the packaging task. The on-air capture
was inspected: two aligned score rows, legible HOME/AWAY text and a blue accent; the ordinary
scaffold was tested, not a new graphic engine. The complete package and captures remain local
in `cli/dist/toolkit-profiles/authoring` and are excluded from distribution.

Save with no login refuses; save with an explicitly supplied invalid synthetic key reaches the
server after static validation and is refused. No real account is written. Missing-browser and
unreachable-deployment doctor checks return exit 2 and setup instructions. The rehearsal initially
expected exit 1 for a missing browser; correcting that expectation lets the diagnostic checks pass.
The public CLI's login/cancellation/revoked-key unit tests also run in the CLI suite.

The installed optional MCP launcher, with no installed CLI discoverable on PATH and a clean npm
cache, announces its exact 0.8.1 fallback, initializes over stdio and lists the `noacg` tool. It
exits cleanly. Older/newer/unknown installations and explicit override paths are covered by the
launcher tests. Codex registers the local stdio configuration; no authenticated model-driven host
session was run, so host interaction beyond installation/registration is not claimed.

Fresh public CLI installation: npm audit reports zero advisories. The unchanged source CLI
lockfile has one high and three moderate transitive advisories (fast-uri, hono, ip-address, qs).
The fresh npm installation resolves patched versions. Direct dependencies and the CLI pin are
exact; transitive packages still resolve at install time. That distinction remains a Claude
reviewer qualification, not a claim of a fully locked external dependency graph.

## Full repository and remaining checks

The first full-build attempt inside the sandbox failed Windows fixture termination/cleanup in
`claude-run.test.mjs` and stalled with fixture processes alive. Those exact processes were stopped.
The unsandboxed full build then exited 0: 2,435 tests, 2,432 passed, three skipped, no failures,
followed by typechecks, lint, dependency checks, Vite, prerender and after-build checks. The
research branch's SSH-probe fixture passes in this run. The final full build also exited 0:
2,436 tests, 2,433 passed, three skipped and no failures, followed by all build and after-build
checks. Its log is kept in ignored `cli/dist/toolkit-build-final.log`.
CLI tests exited 0: 249 tests, 231 passed and 18 bridge-dependent skips. The queued installed
workflow above covers the authoring path independently of those skipped local-bridge tests.

Still separate: Node/browser installation on a genuinely fresh machine, Node 20/macOS/Linux
qualification, a working real self-hosted deployment, managed-organization policy denial,
real consent and successful account-backed save, authenticated host-agent use, portal scans,
publisher compliance, actual release job/GitHub authentication and push, submission, approval,
publication and post-publication discovery/update checks. These are not claimed as passing.
The release job's branch/pin behavior is rehearsed locally; its first successful real release
creates `agent-toolkit-dist`. Use the updated account checklist after that branch exists.
