# Land-2: the capacity gate cannot refuse a landing (Rules)

Owner, 2026-11-12 (run issue #1967): "Landing work is now the goal that outranks every other
cicd-followup goal. A cost ceiling must never be able to block a landing." Step 2 asks for three
changes, each its own pull request: (a) spec edits, (b) weak evidence, (c) repayment instead of
refusal. These are the observable rules each one makes true. (a) was coded before this file was
written; (b) and (c) are written here before their code.

## What refused #2408 (measured)

CI run 43155577709 (pull request, head 046a7078, base 417e7a05), plan job capacity step at
04:33:52Z, printed again by the CI gate at 08:35Z: "this change adds 0.4 offline minute(s), 1.9
runner-minutes per landing and 0.4 per day, taking the offline tier to 123% of its ceiling (the
95% line)". The table line read 83%.

- The 0.4 minutes were `e2e/production-data.spec.ts`, which existed at the base (21 lines edited)
  but had no durations row, so it was priced at the median and counted as new.
- The offline tier read 122% before the change, from weekly-audit run 43014542120 (week to
  2026-11-11), whose offline evidence was complete. The line was 95%. No stop was involved.
- The 43% / 90% figures are run 43178093121 (07:49Z, partial, a lower bound), published after the
  refusal. So (a) alone would have let phase 4 land; the weak-evidence paths in (b) are real but
  did not fire here.

## (a) An edit is not growth

- A1. A spec file that exists at the base and is modified, or renamed from another offline spec,
  adds no minutes to the decision. The gate never refuses because of it, at the table line or
  at the offline tier.
- A2. Its minutes are still priced and shown in the summary row and in the usage line.
- A3. A new spec file (added, or moved in from `e2e/configured/` or `e2e/catalog/`) still counts
  its minutes as added.
- A4. A new workflow job is still growth in its tier, as before. An existing job made to run more
  often stays priced as today (not an edit of a spec file); after (c) it no longer blocks.

## (b) Weaker evidence never makes the gate stricter

- B1. The table line is 95% whether the durations table is fresh or past its 8-day bound. A stale
  table adds a warning that names its age and the pending refresh.
- B2. On a pull request every tier's line is 95%, whatever its evidence state (already true).
- B3. A missing, unreadable or failed-fetch weekly report never refuses. The tiers are judged on
  the newest complete report, or the frozen seed when there is none, and the change warns,
  naming the report. The same holds for an offline tier with no measurement or no verdict
  (`applyOfflineStop`, today a refusal): it is judged on the change's own cost, as
  `assessTiers` already does with trusted evidence. The `growth.unreadable` refusal, which
  nothing sets, is removed.
- B4. A growth stop refuses only when the newest readable weekly report is complete and within
  its age bound, and records that stop. A stop carried by a partial, stale or missing newest
  report warns and names the stop.
- B5. A floor from a newer partial report (a proven lower bound) can only warn. Refusals are judged
  on the newest complete measurement alone, so partial evidence never turns ok into refuse. This
  supersedes #2379's rule that a floor raises the judged cost; `growth-report.mjs` still records
  the floor and the gate names it. A floor-only breach opens no repayment item (C2): it shows in
  the warning and the weekly report.
- B6. Unchanged: a diff the gate cannot read is unknown added cost and refuses. That is the
  change's own evidence, not a report's; updating the branch from its base clears it (a base
  that cannot be reached fails again on a plain re-run).
- B7. Unchanged: a gate that crashes (an unreadable ceilings file in the checkout, an empty suite
  or table) fails the plan job. That is a broken checkout, not a cost decision.

## (c) Repay, do not block

- C1. Where a cost refusal is still correct (a new spec or job over the table line or a tier
  line, a confirmed stop), the gate passes with the verdict `repay` and the change lands.
- C2. After landing, the change gets a repayment item: a GitHub issue assigned to the alarm owner
  (`alarmOwner()`, miwco today), titled for its tier, with a due date (opened + 14 days), the
  tier, the cost it added and the pull request. At most one is open per tier. A table-line
  repayment is filed under the offline tier.
- C2a. How it learns the verdict: the merge group's `CI gate` prints one fixed annotation per
  tier, `Repay (<tier>): <cost>`. A new step in post-land's existing `ages` job (it already has
  `checks: read` and `issues: write`; no new job or schedule) reads the `CI gate` annotations of
  each pull request merged into main in the last 20 first-parent merges, and records each one
  once, keyed by pull request number in a hidden marker on the item. A cancelled or batched
  post-land run is caught up by the next one. At most 100 API reads a run (past them it
  stops before writing), and at most three writes per tier.
- C3. (Coordinator's decision, 2026-11-12, as proposed; basis: the owner's "a cost ceiling must
  never block a landing" and "at most one open per tier"; blocking the tier would break the first.)
  When one is already open for that tier, no second
  issue opens: the pull request and its cost are added to the open item as a comment, and its due
  date does not move. The debt accumulates on one dated item, so the pressure stays real. Once
  the due date passes, the same step marks the item overdue (title and one comment, routed to
  the owner). Landings stay unblocked. The other reading, blocking further growth in a tier while
  its item is open, would let a cost ceiling block a landing again, so it was not chosen.
- C3a. A landing already recorded on a repayment item closed in the last 30 days is never
  recorded again (the debt was repaid). Only the item's body sets its due date, and only a bot's or
  member's comment counts as a record or an overdue mark.
- C4. It never writes `scripts/growth-ceilings.json`, a budget exception or a work-spec line, and
  it waives nothing: the tier stays over its line in every later warning and weekly report.
- C5. The #2411 owner-only kinds `full:*` and `stopped:*` become repayment items instead of
  refusals; `ownerKinds` and the CI gate's "Needs the owner" message shrink to `revision`. A
  `repay` verdict sets no failure. What still refuses after (c), and only this: an unreviewed
  ceilings revision and other ledger errors, offline exception-record errors, an unreadable
  diff (B6), and a crashed gate (B7). They guard the records and the change's own evidence, not
  the cost.
- C6. An automatic repair still may not write a budget exception (unchanged rule).
- C7. Real cost growth stays visible: the gate warning, the weekly report, the v3 dated reduction
  plan and the repayment items all still show it.
