# Overnight preparation, 2026-10-05

The owner authorized unattended preparation while sleeping. Production, studio services,
configuration, deployment and merging remain outside this run. Branch CI is allowed only after
verifying the existing preview opt-in guard. No commit may contain the preview opt-in marker;
do not request a preview, create a pull request, enter the merge queue or push `main`.

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
  No distro, service or studio process was started.
- No existing Supabase development branch is available. Production is the sole default branch.
  Only read-only catalog metadata was queried. No hosted migration or data write was executed.
- The pinned Vercel Sandbox SDK is installed, but no local Sandbox token or saved CLI auth is
  available. Do not initiate an interactive sign-in or change deployment configuration overnight.
- The repository's existing `vercel-ignore-build.mjs` skips every non-main branch without the
  preview opt-in marker. A child-process check returned exit 0 (skip). Production migration,
  release and alarm workflows are main/tag guarded. Branch CI is offline. The manual
  `configured-suite.yml` workflow starts a disposable Docker Supabase stack on Ubuntu, uses
  local test accounts and no hosted credentials, and never files/closes main's alarm on a branch.
  This supplies the missing SQL/API/Realtime and Linux runtime without creating cloud resources
  or changing studio configuration. Push only this feature branch after committing preparation,
  then dispatch configured-suite and rerecord-screenshots on its exact tip. Download and inspect
  Linux frames before committing them. Never substitute Windows frames for Linux baselines.

## Job receipts

- `j-3431`: required integration run after reconciliation; queued behind another checkout's work.
- `j-3432`: clean build, dependent on `j-3431` succeeding.
- Local SQL behavior: 14 checks passed on each of PostgreSQL 17.5 and 18.3 through pinned PGlite
  runtimes, no hosted connection. The read-only catalog reports production uses PostgreSQL 17.6.
- Build and SQL receipts will be added to [verification](verification.md) when they complete.

## Continuation without a schedule

Resume this same checkout and branch. Read this file, `verification.md`, and compact job state.
Inspect existing job receipts before starting anything; never duplicate an owned or waiting job.
Complete independent preparation while jobs wait. Continue only finishable work above. A missing
runtime, physical equipment or source file is an honest boundary, not a reason to loosen the hold.

No scheduled follow-up was created. Automatic approval review refused the proposed heartbeat
because it would create recurring work beyond the preparation request. Preparation continues
in the active run. A later manual continuation can resume the recorded jobs safely.

The run ends when preparation is complete or at 2026-10-06 06:00 UTC, whichever is first.
If all remaining work needs unavailable infrastructure or the owner, write the report and stop.
Report completed checks, actionable failures or a required next step. Do not
start a schedule or keep an idle run waiting for tomorrow's files.
