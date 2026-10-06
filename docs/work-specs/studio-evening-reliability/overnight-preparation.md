# Overnight preparation, 2026-10-05

The owner authorized unattended preparation while sleeping. Production, studio services,
configuration, deployment and merging remain outside this run. On 2026-10-06 the owner explicitly
approved the feature-branch push and existing test workflows. The existing preview opt-in guard
returned exit 0 (skip) for the published commit `cc2d27fb1`.
No commit may contain the preview opt-in marker;
do not request a preview, create a pull request, enter the merge queue or push `main`.
The earlier automatic approval rejection was resolved by that explicit authorization. The branch
was pushed directly to the existing origin; no indirect upload or alternate remote was used.

## Finishable work

1. Reconcile the local feature branch with current `origin/main` and run integration checks.
   Main `7878a4ef4` merged without conflicts at local tip `20715d255`.
2. Exercise the exact panel relay SQL in an isolated in-memory Postgres engine. Record its
   limitations: dependency fixtures and captured sends do not prove hosted Realtime delivery,
   PostgREST, production schema compatibility or concurrent lock behavior.
3. Prepare a short off-air rehearsal checklist and inspect its steps against the implemented UI.
4. Review the new evidence, run the required build, commit verified preparation and refresh the
   check stamp with a failing release verdict while acceptance remains incomplete.

Do not modify executable product code under a running browser job. Follow the repository queue.
Do not cancel another checkout's jobs or reclaim its processes. No new agent delegation.

## Runtime findings

- WSL has only a stopped `docker-desktop` distribution. No Docker/Postgres executable is on PATH.
  No WSL, database, container or studio service was started.
- No existing Supabase development branch is available. Production is the sole default branch.
  Only read-only catalog metadata was queried. No hosted migration or data write was executed.
- The pinned Vercel Sandbox SDK is installed, but no local Sandbox token or saved CLI auth is
  available. Do not initiate an interactive sign-in or change deployment configuration overnight.
- The repository's existing `vercel-ignore-build.mjs` skips every non-main branch without the
  preview opt-in marker. A child-process check returned exit 0 (skip). Production migration,
  release and alarm workflows are main/tag guarded. Automatic branch CI is offline. The manual
  `configured-suite.yml` workflow starts a disposable Docker Supabase stack on Ubuntu, uses
  local test accounts and no hosted credentials, and never files/closes main's alarm on a branch.
  This would supply the missing SQL/API/Realtime and Linux runtime without creating cloud resources
  or changing studio configuration. Push only this feature branch after committing preparation.
  Configured-suite and rerecord-screenshots were dispatched on its exact published tip. Download and inspect
  Linux frames before committing them. Never substitute Windows frames for Linux baselines.

## Job receipts

- `j-3431`: passed, 1,202 active browser tests / 416 skipped, plus 35/35 catalog checks.
- Rendered review found false preview-only wording beside a native CasparCG Take. The copy is
  now scoped to browser graphics; no transport logic changed. Status tests pass 9/9 and focused
  studio/output browser checks `j-3438` pass 15/15. The corrected diagnostic frame was inspected.
- `j-3441`: final affected browser run passed after that correction, on frozen product sources:
  1,202 active tests / 416 skipped, plus 35/35 catalog checks. Generated research artifacts were
  retained separately and restored before the clean build.
- `j-3432`: cancelled while waiting so test-generated research captures can be retained separately
  and restored before a replacement clean build. No running build was interrupted.
- `j-3446`: replacement clean build passed, exit 0. 2,457 active gate tests / 3 skipped; the
  separate 321-test suite, TypeScript, lint, architecture, bundle, prerender and final checks pass.
- Local SQL behavior: 14 checks passed on each of PostgreSQL 17.5 and 18.3 through pinned PGlite
  runtimes, no hosted connection. The read-only catalog reports production uses PostgreSQL 17.6.
- Remote push: the first attempt was rejected before execution. After explicit owner approval,
  `cc2d27fb1` was pushed successfully. CI run `37387066039`, configured backend run `37387084551`
  and Linux screenshot run `37387085907` are the initial verification receipts.
- Linux screenshots: `37387085907` passed all 6 captures. Every Ubuntu-generated frame was
  downloaded into the ignored evidence folder, visually inspected and copied to its exact Linux
  baseline path. No product source or Windows baseline changed during this recording.
- Initial branch CI: 1,196 active browser checks passed, 416 skipped, 6 failed solely on the
  old Linux baselines. Build, 317 factory candidates and 35 catalog checks passed. Publish the
  inspected replacements and verify the resulting CI gate. Replacement CI `37391651702` passed
  all ten browser shards, Build, Factory and catalog calibration on `ff6bcf7a1`. This verifies the
  six Linux baseline replacements. Vercel confirmed the preview was cancelled by its existing
  ignored-build step.
- Initial configured backend run `37387084551` reached its 40-minute cap. Schema, grants and
  all seven private relay cases passed, including actual Realtime delivery of both cue verbs,
  but the full suite did not finish. Do not treat this partial run as a clean backend verdict.
- Focused diagnosis `37391668621`, with unchanged product/test sources, completed: 9 passed,
  6 failed, 2 skipped. The errors identify two clicks intercepted by AccountSaveNotice, the
  removed automatic expiry modal, two removed Publish selectors and the obsolete expectation
  that a cue-field edit invalidates readiness. The full-suite guard intentionally remains red
  for this subset. The temporary workflow command has been restored exactly; no timeout,
  minimum count or skip allowance changed.
- Notice overlap reproduced locally (`j-3459`, two failures) and corrected by reserving its
  measured height. Mobile scroll pages reserve bottom space, the wizard and desktop playout
  shell fit above it, and corner notices move above it. Phone recovery text gets its own row.
  Rendered desktop and phone frames inspected. `j-3463` passes all 11 focused regressions,
  including measured spacing, cloud acknowledgement cleanup and preserved expiry recovery.
  `j-3464` is the required affected-browser run on these frozen corrected sources. Configured
  expectations now exercise the unified readiness button, preserved metadata readiness and
  version adoption without an output navigation. Publish this correction and rerun the normal
  full guarded backend suite and branch CI before treating agent verification as complete.
- Build, browser and SQL receipts are recorded in [verification](verification.md).
- Local Companion prerelease archive prepared without installation/publication:
  `companion-module/noacg-studio-rehearsal-b76d238.tgz` (ignored output, 81,189 bytes).
  SHA-256 `B7124D78628A1DA81D2F1D359B99089D9A7E7EA2409DE701A931F6F756642FCD`.
  Package manifest, archive paths and bundled-JavaScript syntax checked. This does not establish
  Companion runtime behavior. The isolated backend relay delivery cases passed in the partial
  run; the complete guarded backend suite is still required.

## Continuation without a schedule

Resume this same checkout and branch. Read this file, `verification.md`, and compact job state.
Inspect existing job receipts before starting anything; never duplicate an owned or waiting job.
Complete independent preparation while jobs wait. Continue only finishable work above. A missing
runtime, physical equipment or source file is an honest boundary, not a reason to loosen the hold.

No scheduled follow-up was created. Automatic approval review refused the proposed heartbeat
because it would create recurring work beyond the preparation request. Preparation continues
in the active run. A later manual continuation can resume the recorded jobs safely.
Automatic approval review also initially rejected the feature-branch push, citing the export of
source and external CI without explicit authorization. The owner subsequently authorized that
exact branch and test path; the approved direct push succeeded. Merge and deployment remain held.

The run ends when preparation is complete or at 2026-10-06 06:00 UTC, whichever is first.
If all remaining work needs unavailable infrastructure or the owner, write the report and stop.
Report completed checks, actionable failures or a required next step. Do not
start a schedule or keep an idle run waiting for tomorrow's files.
