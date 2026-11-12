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

Each rule is observable from the gate's output and GitHub alone.

1. **Owner-only refusal.** A capacity refusal is owner-only when no change to the PR's own cost,
   short of adding nothing to the tier, can pass it:
   - **full:** a tier's measured share before this change is already at or over its line (95% on
     complete evidence), so any addition to it is refused; or
   - **stopped:** a tier, or the offline table, carries a growth stop from the weekly report.
   Only an owner-approved budget exception, a ceiling change or the stop's correction moves these.
2. **Agent-fixable, unchanged.** Every other refusal keeps its message and behaviour: the change's
   own addition crossing the line from under it, an unreadable diff, a tier with no measurement, a
   bad growth report (#2379's own alarm, `Growth report not complete`, covers that), the E2E
   protection check (an agent can restore the coverage; an intended removal has its own exception
   process), and every non-capacity failure.
3. **The message.** An owner-only refusal's gate error starts `Needs the owner (<kind>):` and says
   plainly that re-pushing will not pass it, what moves it, the one thing the change itself can do
   (add nothing to that tier), and that the owner alarm lists the PR. A refusal that is both
   owner-only and agent-fixable on different tiers says both.
4. **The signal.** The plan job, which computes the capacity verdict, outputs which kinds are
   owner-only (for example `full:overhead`), and the gate's error annotation carries them in that
   fixed form. Nothing else reads or writes it.
5. **The alarm.** The check of fix 1 (`scripts/repair-wake.mjs`), when a red PR run's `CI gate`
   failed, reads that job's annotations (one call) and looks for the fixed form. When present:
   - the bound is 0: the next check raises it, whether or not the PR has a repair owner;
   - the alarm line says `needs the owner: <kinds>` and quotes the refusal;
   - its key is the PR and the kinds, not the run, so a re-push refused the same way is the same
     alarm, never a new one; a different kind is a new alarm.
   Every other rule of fix 1 holds: memory while red, one notice per check, withdrawal only by a
   complete check, a 100-call bound.
6. **Where the alarm is raised, and when.** The gate itself does not write: by design it holds no
   write scope and runs the branch's code, and giving every pull request run an issue-writing token
   would hand that scope to every branch. So the alarm comes from fix 1's check, at the next landing
   or plan-run check-in (fix 1 rule 10, the timing trade put to the owner on 2026-11-12). The
   refusal message reaches the agent at once, in its own run, and tells it to stop re-pushing.
7. **Nothing loosened.** No line, ceiling, budget, exception or test changes. A refused PR stays
   refused; this only says which refusals are the owner's and tells the owner.
8. **No new job.** No workflow, job, trigger or schedule is added: the overhead tier has no room
   (coordinator, 2026-11-12).
