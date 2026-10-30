# Growth controls and PR #1816 reconciliation

Reviewed 2026-10-29. Planning only; no implementation project or worker launched.

## Scope and source

The owner asked for backend, graphics and total PR landing-time growth controls, and a check of
[PR #1816](https://github.com/NoaCG/NoaCG-Studio/pull/1816) against this prepared run.
Read its diff and review comments, then the landed source at
`96bb45612f2a183b3d3e18f4287552c1f3e41802`. Earlier preparation is PR #1814 at
`5987f05375cef937d22fc1c79de2c5d4a3be089e`. This receipt supersedes earlier readiness claims
where they differ; historical research/opinions remain unchanged.

## Landed improvements and remaining work

| Evidence at reviewed source | Effect on this plan |
| --- | --- |
| `.agent-workflows/plan-create.md`, `scripts/plan-kit.mjs`, canonical templates and known-traps | Reuse the persistent kit, rendered briefs/heartbeat, adaptive check-in and checkpoint recovery; no second coordinator prompt or ledger. Preparation must not call the setup command. |
| `project-authorization.mjs`, plan-run and supervisor changes | Canonical phase IDs and explicit standing block-renewal permission are part of launch metadata. This preparation supplies ci IDs, CA environments and spec paths; it grants no renewal. |
| `configured-suite.yml` concurrency expression | Branch dispatches now have their own groups. Pushes retain per-SHA groups and cancellation remains false. Schedules and main dispatches still share a group; pending same-branch supersession remains possible. ci03 verifies landed isolation and implements only remaining identity/scheduling gaps. |
| Configured-suite checkout steps and dispatch inputs | No immutable requested-SHA check was added by this PR. Branch grouping alone cannot prove the tested source; ci03 remains necessary. |
| Plan-run build/repair/fix guidance and known-traps | Full manual backend dispatch is still required for phase PRs. ci06 must reconcile these callers with the selected required PR gate and explicit no-trigger exemption after replacement proof; otherwise the advertised PR saving never reaches plan runs. Full backend per landing remains. |
| CI diff from PR #1814 through PR #1816 | Only configured-suite concurrency changed among workflows. `ci.yml` did not change in this interval. Its existing Build/Factory bounded rerun and E2E retry/quarantine are not new #1816 improvements; no new retries are proposed. PR #1815's intervening graphic-harness work is not evidence that cross-suite CI budgets landed. |

No selected-backend required PR gate, cross-suite growth controller or newly qualified critical
black-box set is established by #1816. The existing capabilities and proposed work stay distinct.

## Confirmed procedure hazards

1. **Approval dependency cycle, launch-relevant.** Tracked in [#1817](https://github.com/NoaCG/NoaCG-Studio/issues/1817). `plan-run.md` Boundaries and known-traps require
   Reviewed green before the coordinator posts `noacg/reviewed`. `ci.yml`'s Reviewed job runs
   `reviewed-status.mjs`, which requires that status on the exact head. A fresh unstamped PR cannot
   satisfy both instructions. The corrected plan order is worker verification and independent
   review receipts, coordinator checking those and independent gates, coordinator posting the
   stamp, Reviewed passing/recovering its earlier timeout, then auto-merge. No required gate is
   bypassed and workers still cannot self-approve. The runbook makes this a pre-ci01 launch
   qualification, not a repair stranded behind the first phase. Shared procedure/template
   reconciliation remains needed before claiming generic run readiness; no shared code or
   procedure was changed in this planning PR.
2. **Numeric IDs outside the row range are incorrectly called ambiguous.** Tracked in [#1818](https://github.com/NoaCG/NoaCG-Studio/issues/1818). The exported
   `phaseRow([{id:'51'},{id:'52'}], '51')` throws that ID 51 also names row 51, although there are
   only two rows. This confirms the PR review's concern. Our nonnumeric ci IDs resolve correctly,
   including ci18 inserted before ci07, so this does not block this phase array. Recheck the defect
   before constructing a successor with retained numeric IDs. Do not rename live identities or
   pretend the generic bug was fixed here.

This was a focused operational/CI review, not proof that every scheduler or provider interaction
is flawless. Real native wake, permission, approval and multi-week reliability remain launch checks.

## Changes to preparation

- D7 and AC-9 cover offline, backend, graphics, aggregate cost and both delivery clocks. Budgets
  are frozen after measured, independent calibration; no rolling ceiling increases or hidden
  full-suite debt. Admission, exception expiry, indirect slowdowns, incomplete evidence and owned
  corrective action are explicit. No fixed test-count quota forces a loss of protection.
- New ci18 follows ci06 and precedes ci07. It must implement and verify controls before the audit
  and maintenance trial. Existing IDs stay stable; all 18 spec titles exactly match runnable
  metadata. ci17 requires live evidence and reports insufficient samples honestly.
- ci02 reuses canonical kit guidance; ci03 acknowledges isolation already landed; ci06 includes
  worker/coordinator policy reconciliation. The runbook uses plan-create/plan-kit with explicit
  authority, bounded blocks and preserved failure history, not copied production-page authority.
- The review prompt now challenges the full revised run. `work.json` remains draft, review null,
  with eight future criteria open. No runtime, wake, run issue or CI implementation is created.

## Verification and limits

- In-memory preparation probe: PASS for 18 exact titles, unique canonical IDs, serial dependencies,
  ci18 insertion, CA/spec metadata, paused/expired refusals, eight acceptance IDs and normalized
  hash. Draft has zero structural problems and eight open criteria. In-memory convergence accepts
  complete current evidence, refuses pending/failed AC-9 and invalidates a stale review. No state
  was opened for these probes.
- `node --test --test-timeout=30000 scripts/plan-kit.test.mjs scripts/continuing-project.test.mjs`:
  21/21 passed. Temporary inert fixtures cover briefs, heartbeat/check-in, permission-bound renewal,
  independent actors, pause/expiry, recovery/admission identity and phase lookup cases.
- `run-recovery.test.mjs` did not complete: the local probe stalled in a child git operation before
  reporting its first test, including a separately bounded elevated attempt. Those identified
  probe processes were stopped. No passing recovery-suite verdict is claimed; the stall's cause
  was not established. Live checkpoint restoration still needs qualification.
- Capacity-gate behavior, weekly reports, fixed numeric budgets and delivery gains are future
  implementation acceptance, not results of this documentation review. No graphics or site
  behavior changed and no product build/browser suite was run for these documents.

- Final documentation checks: all five targeted repository gates passed (contract freshness,
  citations, docs index, client-secret scan and copy); relative links and git diff whitespace
  checked. Inline review corrected a historical phase-reference conversion, made the sustained
  breach rule explicit, and kept measured over-budget maintenance possible without approving
  added growth. Simplification reused canonical kit procedures and stable-ID references.
