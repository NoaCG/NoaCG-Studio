# Completion-authorized plan runs

2026-10-30. Owner requests the runner changes here before starting the CI plan in Codex Cloud.

## Why and goal

A planning date currently expires a project even when the owner explicitly wants the agreed work
to continue until complete. Make that permission executable, keep the existing identity and
recovery ledger, and let the CI plan start through `$plan-run cicd-improvement`.

## Decisions and non-goals

- Explicit `authorization.standing.untilComplete` owner words opt a continuing plan into completion
  authority. Its immutable finite `deadline` remains its planning target, not a launch cutoff.
  This avoids repeatedly rewriting signed authorization or opening successor projects. Daily work
  blocks remain at most 24 hours and need their separate existing `blockRenewal` permission.
- Fixed-deadline plans and ordinary waves retain their limits. No live project is migrated.
- Pauses, cancellation, completion, blocked prerequisites, uncertain delivery, stale owners and
  spent repair attempts remain binding. A missed target never grants another attempt.
- Store the CI plan's owner-approved start policy in its runbook/launch receipt. Start before
  outstanding production studio acceptance is allowed; the studio tests stay pending. Compatible
  JEV work may overlap; shared infrastructure changes still serialize.
- No new scheduler, provider fallback, paid infrastructure or CI-plan implementation in this work.
  Native Codex Cloud launch/worker/wake capability needs actual provider evidence, not local tests.

## Acceptance

1. A completion-authorized plan runs and renews bounded blocks beyond its target without changing
   identity, authorization, phases, in-flight receipts or failure history. A fixed plan expires.
2. Admission, preflight, heartbeat, worker briefs, check-in, wake and checkpoint restoration agree
   about the target and block boundaries. Host-loss restoration finds the original project.
3. Missing permission and waves cannot obtain completion authority. Pause/cancel/finish/waits,
   stale ownership and uncertain delivery still refuse unauthorized work; recovery does not
   automatically resume an owner's pause. Exhausted attempts remain exhausted after the target.
4. Target crossing and restored owners have regression coverage, including real local Git-backed
   checkpoint transport. Shared workflow instructions get independent forward review.
5. A short CI plan command resolves the recorded owner policy without another deadline question.
   Its 18 phases and eight open implementation criteria remain intact. Cloud readiness reports
   distinguish actual worker/wake evidence from unavailable or unproved capabilities.
