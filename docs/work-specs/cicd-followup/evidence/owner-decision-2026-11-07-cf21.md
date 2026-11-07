# Owner decision, 2026-11-07: add phase cf21 "Review stopping rules"

Given by the owner (`miwco`) in the cicd-followup coordinator session (session_017SdbwPphatUYXtpZ9CHkPu, run #1967) on 2026-11-07. Recorded verbatim below; the coordinator's placement note follows it.

## The owner's words

> Owner decision for the cicd-followup run (docs/work-specs/cicd-followup/spec.md). I authorize one added phase, cf21 "Review stopping rules", placed before cf20 so cf20 reports it. No other scope change; every existing rule, limit and gate stays.
>
> Why: cf03 shows CI is not where merge time goes (PR CI median 6 to 14 min, queue wait 0.7 min), while ready-to-green p95 is 145 to 196 min and plan rows take a median 167 min to reach the queue. The JEV sample (cicd-improvement phase-ci17.md, AC-2 table) shows 0 to 4 Codex rounds per PR, and the 4-round PR took 152 min. The time is in review and repair rounds. The Claude Code team ("How the Claude Code team does code review", Oct 2026) cut mean reviews to pass from 2.08 to 1.32 and PRs needing five or more rounds from 8.9% to 1.5% with stopping rules, without adding checks, and found about 59% of what their reviewer kept flagging was code present since its first pass.
>
> cf21 changes, in docs/plan-runs/known-traps.md "Review checkpoints", .agent-workflows/plan-run.md, .agent-workflows/so.md and .agent-workflows/check.md (other files only if needed for consistency):
> 1. Delta re-review: once a full /so met the grade on a head, a later repair head gets a /so on git diff <assessed head>..<new head> only, given the earlier verdict and the findings the delta answers. A full /so is still required if the delta touches files outside the findings' area, includes a merge from main or a rebase, or the reviewer sees effects beyond the delta. This extends the existing Narrow delta case; /check, CI and the Codex request on the new head stay as they are.
> 2. Round cap: after three confirmed review rounds on one PR (any reviewer), stop patching and run the existing Repeated-family reassessment of the approach first. A warning, not an extra attempt; repair limits unchanged.
> 3. Converging findings: a reviewer names the class of a defect and the builder fixes every instance of that class in one checkpoint, not one line per round. A finding the PR already answered with a recorded reason is not raised again unless the code it rests on changed.
> 4. Risk-scaled review: Ordinary rows (copy, docs, contained logic or tooling that sets no state rule) need /check and the Codex review only, no /so. Never Ordinary: .github/workflows and CI or landing scripts, migrations and supabase/, auth and account code, and any path an owner rule marks sensitive. Risky rows keep the Rules-first /so, the final /so and the checker unchanged.
> 5. A short review-guidelines rule for Codex, added through npm run learn (never by editing AGENTS.md directly): what counts as a real defect in this product (state rules, playout, export, data loss, test selection gaps), evidence as a file and line rather than a guess, a cap on nits, what to skip (evidence notes, generated files, style lint already covers), and a summary that says plainly when there is nothing to fix. Under ten lines.
> 6. Pre-existing findings: a confirmed defect in code this PR did not change is labelled pre-existing, does not block the PR and does not count as a round. Fix it in its own commit only if check.md's small, clear and contained test holds; otherwise file an issue and link it.
>
> Acceptance: (a) plan-run.md, known-traps.md, so.md and check.md state the above without contradicting each other; (b) cf20 reports review rounds per PR, the share passing after one round, and cf03's "M1 from ready" for rows before and after cf21, with sample sizes and cf03's spread rule, and makes no improvement claim without enough rows; (c) the guardrail: cf20 also reports reverts and post-landing failures for the same rows, and a rise counts against the change rather than as a saving; (d) no check, test, limit, gate or budget is weakened.

## Placement (coordinator)

The run's ledger admits a phase only after the last phase with a ledger event, which is cf13 (in progress). cf21 is therefore inserted directly after cf13, as phase 14, before cf02 and so before cf20, as the owner asked. Placing it this early also gives cf20 more rows after cf21 to compare, which acceptance (b) needs. cf21 depends on cf13; every other phase keeps its acceptance, order and dependencies.
