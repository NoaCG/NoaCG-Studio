# Opus growth-control and plan-run corrections

2026-10-30. Narrow implementation authorized conditionally by the owner and confirmed by the
[Opus opinion](opus-growth-review-2026-10-30.txt). The CI improvement run remains unstarted.

## Correction scope

Why: shared instructions circularly wait for Reviewed before its required stamp; numeric phase
IDs can be rejected against nonexistent rows. The prepared growth controls also need to work
with small samples and avoid noisy per-PR timing decisions.

Goal: fix the shared approval order and phase lookup, and reconcile the prepared spec/runbook
with Opus's operational corrections. Use existing queue/recovery/capacity machinery.

Non-goals: no CI improvement implementation, new scheduler, live project/worker/wake, resource
increase, altered merge requirements or migration of existing project IDs. Local Windows fixture
checks do not launch or qualify a live coordinator.

Observable acceptance for this correction:

- Build/fix/repair workers can return exact-head verification evidence without waiting for the
  coordinator's Reviewed stamp. Shared procedures agree on the gates, configured run identity,
  head-bound stamping, immediate auto-merge request and required-check enforcement by GitHub.
- Numeric IDs 51/52 in a two-phase project resolve correctly; real ID/row conflicts still refuse,
  valid matching numeric IDs and existing row-number fallback still work, and missing IDs refuse.
- ci01/ci18 and AC-9 reflect practical age controls, pooled timing reports, fixed-overhead costs,
  tier-sum calibration, post-landing slowdown detection, stale-duration alarms, exception repayment
  and measured concurrency. ci03 preserves checkout identity and targets dispatch attribution gaps.
- Eighteen phase titles/dependencies match runnable metadata; eight implementation criteria remain
  open, normalized hashes match, and no execution authority is introduced.

## Source and verification

Reconciled against main `a8e4fd446` (PR #1821), including #1820's unrelated SVG plan registration.
The Opus review used #1819; both reported defects remained at this newer base.
Verification results and disposition are recorded below before landing.

## Disposition

- B1/#1817: corrected the shared plan-run, queue-merge and known-traps procedures and all three
  worker templates. Reviewed is not a worker gate. Coordinator verifies configured head_sha and
  posts a pinned stamp before requesting auto-merge immediately; GitHub admission checks remain.
  Existing moved-head and stale-Reviewed recovery apply. The first real ci01 PR can prove the flow;
  no kit-local exception or dummy landing is required.
- #1818: ambiguity requires an actually existing conflicting row. Bare row-number fallback remains
  compatible; the optional broader restriction was not taken, and no live project was migrated.
- Growth items 1-3: per-item age acts immediately; sustained reports pool categories; aggregate
  becomes tier-sum calibration plus a weekly line; indirect slowdown is detected after landing
  and constrains subsequent additive growth. Fixed overhead includes build/factory/tooling.
- Items 4-6: ci01 measures account concurrency without inflating the existing cost ceiling, records
  duration age/refresh debt and observable clock starts. ci18 alarms on accepted weekly duration
  data older than eight days, and forbids same-scope exception renewal without repayment.
- Item 7: checkout already pins github.sha. ci03 targets intent-to-run-ID/head_sha attribution,
  schedule/main collision and pending same-branch supersession, preserving immutable checkout.
- Windows recovery: the required changed-file gates selected the complete recovery fixture suite.
  It progressed and finished in 526.5 seconds overall, rather than hanging indefinitely. Of 104
  tests, 103 passed; one failed because Git for Windows rejected Node's null-device path as
  GIT_CONFIG_GLOBAL. The contained fixture now uses an actual empty temporary config, preserves
  the same machine-identity assertion and restores the prior environment. Its exact failing case
  passed in 4.4 seconds after the fix. Earlier 240-second bounds were insufficient for this full
  local fixture run. Live bounded restoration still requires coordinator-home qualification; no
  cloud failure is inferred.

Current facts: duration table last changed at b2c04fdf2a84d4ec3048d31f9561d1be0b5ac284 on
2026-10-19; refresh PR #1503 is still open as read on 2026-10-30. The existing estimator reports
161.4/210.3 table-minutes (76.7%, 13-runner budget), with 231 measured durations for 241 files.
This is a stale-table estimate, not a fresh live measurement or proof of account concurrency.

## Checks

- The new numeric-ID regression failed before the guard correction and passed afterwards.
- 45 targeted plan-kit, continuing-project, cloud-queue and reviewed-status tests passed. They
  exercise IDs, independent actors, moved heads, missing stamps, stale Reviewed and bounded
  recovery with inert fixtures/fake GitHub, not a live plan worker/coordinator.

- Independent read-only forward review of the six shared procedure/template files found no
  contradiction for missing stamp, wrong configured SHA, moved head or stale Reviewed. Existing
  kits pinned to old source are not claimed to migrate automatically.
- In-memory preparation checks passed: 18 exact phase titles/IDs/dependencies, required environments,
  paused/expired refusal, eight open criteria, current hash, draft authority and no review receipt;
  convergence accepts only complete current evidence. All 19 relative document links resolve.
- Both skill wrappers pass quick_validate. Inline review and simplification found no additional
  defects or needed abstractions. The Windows fixture correction is separate from runner behavior.
- No local product build/browser run was needed. No live coordinator, multi-week wake, account
  concurrency measurement or CI improvement speedup is claimed. GitHub remains authoritative for
  full required checks.
- Final changed-file checks-only run passed all nine checks; git diff --check was clean. The full selected test run was 103/104 before the isolated Windows fixture fix, followed by the previously failing case passing. No failed test was skipped or weakened.
