# cf22 fix 2: a refusal only the owner can move goes to the owner, not round the loop

Owner decision 2026-11-11 on #1967 ("Let's do as you recommend"): cf22's rank-2 fix C, built after
fix 1 (#2398, landed 417e7a05) and after #2379 (growth gate robust to bad reports, landed bc41ebae).
Evidence: [phase-cf22.md](phase-cf22.md) sections 3.3 and 4. Branch
`claude/repair-loop-owner-refusals`, from `main` at bc41ebae.

## The problem

cf22 counted 16 capacity refusals in 14 days, and 3 PRs that looped on the same refusal 6 more
times (#2005 three times, #2134 twice, #2194 once): the agent re-pushed against a refusal its change
could not clear. The gate's message names only two ways out ("add a budget exception … or make the
change cheaper") and does not say when the second one is impossible.

## Rules

Each rule is observable from the gate's output and GitHub alone. Revised after the Rules-first
review (grade C, five required changes, all taken).

1. **Every capacity refusal, by name.** The capacity verdict (`scripts/e2e-capacity.mjs`, the plan
   job) refuses for these reasons and no others. Each is classed here once:

   | Refusal | Class | Why |
   | --- | --- | --- |
   | Tier line, the tier's share **before** this change already at or over its line | owner: `full:<tier>` | any addition to the tier is refused; on a pull request the line is always the refuse line (95%), and only an owner-approved exception or ceiling change moves it |
   | Tier line, the change's own addition crossing it from under | agent | the change can be made cheaper |
   | Tier growth stop (weekly report breach) | owner: `stopped:<tier>` | only the stop's correction moves it |
   | Offline growth stop | owner: `stopped:offline` | the same |
   | Table line, the table's share **before** this change already at or over the line applied (95%, or 85% while the durations table is stale) | owner: `full:table` | any added spec minute is refused; a stale table is moved only by its refresh landing, which waits on review (#2364's case, #2316), or by an exception |
   | Table line crossed by the change's own minutes | agent | the change can be made cheaper |
   | Tier with no measurement; growth report unreadable | not here | a bad report is #2379's alarm, `Growth report not complete` |
   | Ceilings, estimates or measurement changed, or `MAIN_RUNNERS` / `SHARD_CAP_MINUTES` raised, without a reviewed revision | owner: `revision` | only an owner-reviewed revision passes it |
   | Ledger form: an exception removed, edited, duplicated or appended out of order; a new exception invalid (no measured repayment receipt, or overlapping an earlier one in its tier) | agent | the entry itself is wrong and its author can correct it |
   | Unreadable diff | agent | infrastructure, retried by a new run |

   A pending exception awaiting review is a warning, not a refusal, and has no kind.
2. **Outside this fix: the E2E protection check.** cf22 counted its two refusals (#2229, #2321)
   among those needing the owner. Its message already gives the agent its way out: restore the
   protection, or record a reviewed removal in the work spec. So it stays agent-fixable here, and
   cf22's estimate for this fix (215 minutes, floor 49) loses those two; the three PRs that looped
   (#2005, #2134, #2194) looped on capacity tier refusals, so the floor stands.
3. **The message.** An owner-only refusal's gate error starts `Needs the owner (<kinds>):`, then
   says plainly: re-pushing will not pass it; what moves it (rule 1's column); the one thing the
   change itself can do (add nothing to that tier or table); and to raise the owner alarm now by
   running `node scripts/repair-wake.mjs check --issue`. Agent-fixable refusals keep their message.
   A verdict holding both kinds says both.
4. **The signal.** The plan job outputs the owner-only kinds (comma-separated, from rule 1's fixed
   set) beside the verdict, and the gate's error annotation carries them in the fixed form
   `Needs the owner (<kinds>)`. Only those fixed kinds are read from it.
5. **The alarm is raised at once, by the refused agent.** The message tells the agent that met the
   refusal to run the check (rule 3), which it can, holding the repository's write access that the
   gate deliberately lacks (the gate runs the branch's code with no write scope). The check is
   bounded (100 calls) and idempotent, so running it at once and again at the next landing or
   plan-run check-in raises one alarm. Those later runs (fix 1 rule 10) are the backstop.
6. **How the check reads it.** When a red PR run's failure is its `CI gate`, the check reads that
   job's annotations (one call; a failed read makes the check incomplete). If the fixed form is
   there:
   - the bound is 0 and nothing defers it: no comment, owner-record edit or re-run counts as
     attending an owner-only refusal, because no agent action can clear one (agents post under
     member accounts). The alarm is raised at that check, whether or not the PR has a repair owner;
   - the line says `needs the owner: <kinds>` and names the refusal by its kinds only; no text from
     the branch's run is quoted beyond the fixed kinds;
   - its key keeps fix 1's form (PR, run, attempt, failure time), and it also carries an owner mark
     of PR and kinds. A failure whose owner mark is listed in the open alarm raises no new notice: a
     re-push refused the same way is the same alarm. A mark leaves the open alarm only as rule 7
     says, so a refusal of the same kind after the PR was cleared (for example after an approved
     exception) is a new alarm. If the owner closes the alarm by hand while the PR stays refused, the
     same failure is not raised again (fix 1's memory of keys), and only a further refused re-push
     raises one notice. A different kind is a new alarm. At most the fixed kinds exist (four tiers, the table, revision,
     each `full` or `stopped`), so the marks per PR are bounded.
7. **Kept while refused.** A line with an owner mark stays listed while the PR's newest verdict is
   still running (a re-push in flight), and leaves only when a finished verdict on the PR no longer
   carries that kind, or the PR closes or turns draft. So an in-flight re-push never withdraws the
   alarm, and the issue never closes while the PR is still refused.
8. **Nothing loosened, nothing new.** No line, ceiling, budget, exception or test changes, and a
   refused PR stays refused. No workflow, job, trigger or schedule is added (the overhead tier has
   no room, coordinator 2026-11-12). The merge group's `after-gate` job is left as it is. A tier can
   fill or a stop land between a PR's green run and its merge-group run, and the check reads
   merge-group verdicts the same way (fix 1 rule 1), so such a refusal is alarmed at the next check
   too. The message of rule 3 reaches the agent that queued the PR only if it reads the merge-group
   run's error, which queue-merge's repair paragraph already has it do.
9. **Its one job beside the weekly report.** Stops and tier breaches already appear as owner items
   in the weekly growth report. This alarm adds only which pull request is blocked by one, and when.
