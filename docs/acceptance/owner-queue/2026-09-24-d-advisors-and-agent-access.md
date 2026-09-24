---
kind: agent
date: 2026-09-24
---
# Post-land's advisor step and the agent-access walk are green again, and a lab-computer walk joins the suite

Three things were red or missing after pull request #402 landed the package door.

- **The advisor step in post-land** failed on every landing. Its one new finding was an unused
  index from migration 0065, which nobody had used yet because the feature was new. It is in the
  accepted class, production has used it since, and `supabase/advisor-baseline.json` now holds 109
  findings. The judgement is in `docs/STACK_FRESHNESS.md`, "The second re-record".
- **`e2e/configured/agent-access.spec.ts`** timed out at step 5 on every run (issue #403). The
  package step ends on a production page and then deletes that production as cleanup. The page
  becomes "Production not found", which has no account button. The product was right and the spec
  was wrong: the walk now opens Settings from Home.
- **`e2e/configured/shared-lab-computer.spec.ts`** is new. Student 1 signs in on Home and makes a
  graphic, signs out, student 2 signs in on the same browser and makes their own, signs out, and
  student 1 signs in again. It checks the screen, the cloud rows of both accounts, and a second
  fresh browser for student 1.

## The route, under a minute

In GitHub, open the configured-suite run for this branch and read its job list and summary:
https://github.com/NoaCG/NoaCG-Studio/actions/workflows/configured-suite.yml (the newest run on
`claude/d-advisors-agent-access`, or the first `main` run after it lands).

**What to look at.** That the summary says 54 ran and 0 failed, and that both
`agent-access.spec.ts` and `shared-lab-computer.spec.ts` are in the passed list. On the first
landing after this, the post-land run's "Ask the advisors about what just applied" step is green
and prints `109 advisor findings; 109 accepted in the baseline.`

## Decided, so you can overrule a thing that exists

- **The baseline records what production reports now, not the finding the alarm named.** By the
  time the finding was read, production had scanned the index, so it was no longer reported.
  Recording it anyway would print a "gone" line on every run until somebody removed it.
- **Student 2 is a throwaway account the spec makes and deletes itself**, through the service key
  of whatever project the suite runs against: the runner's local stack in configured-suite, and
  the staging project in hosted-latency. The workflows' account setup is unchanged. Like every
  spec in this suite, it must never be pointed at production.
