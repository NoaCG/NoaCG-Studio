# Pushing a branch and then queueing it races the `Reviewed` gate, and the gate loses

**Filed:** 2026-09-09. **Source:** hit and measured while landing `claude/v-port-registry-race`
(PR #174) during the day wave.

## Why

The landing path has two steps in a fixed order, and they start two clocks that overtake each other:

1. `git push` puts the tip on GitHub. That immediately triggers the `CI` workflow, whose `Reviewed`
   job reads the `noacg/reviewed` commit status on the head sha and fails if it is absent.
2. `npm run queue:merge` is what POSTS that status.

So on any branch pushed and then queued, `Reviewed` can run before the status exists. Measured on
PR #174:

    run created                    2026-09-09T05:42:43Z
    Reviewed read the status at    2026-09-09T05:42:50Z   -> "missing", exit 1
    queue:merge posted the status  2026-09-09T05:43:38Z

Forty-eight seconds. The job takes about six seconds to reach the check, and `queue:merge` has to
talk to GitHub several times before it posts, so the race is not close - **the gate loses by
default** whenever the two commands are run back to back, which is the normal way a session lands.

The failure is silent in the way that matters: nothing is broken, the review really did happen, and
the fix is `gh run rerun --failed`. But a red `Reviewed` on a pull request reads as "this was not
reviewed", which is the single most alarming thing a landing check can say, and it says it on
branches that are fine. A session that trusts the check spends time diagnosing a review problem it
does not have; a session that learns to re-run it stops reading the check that exists to be read.

It also blocks the merge queue until somebody notices, because the ruleset requires `Reviewed`. On a
night wave, where the session that pushed may already be gone, that is a branch stranded on a race.

## What it would take

The honest fix is to stop the ordering mattering, not to tell people to re-run. Three shapes, and
the first is probably right:

- **Have `Reviewed` wait for the status instead of sampling it once.** A short bounded poll - say up
  to ninety seconds - turns a race into a wait. The job already has a three-minute timeout, so this
  costs nothing on the common path where the status is already there, and it removes the failure
  entirely rather than making it rarer.
- Post the status BEFORE pushing the tip. This does not work as stated - the status is posted against
  a sha that must already exist on the remote - but a variant where `queue:merge` owns the push would.
  That is a bigger change to who does what, and it takes the push away from the session.
- Have `queue:merge` re-run a `Reviewed` job that failed while it was posting. This repairs the
  symptom reliably and leaves the race in place, so it is the fallback, not the fix.

Whichever is chosen, there should be a test that a branch pushed and queued back to back lands
without a human re-running anything, because that is the sequence every session actually performs.

## Evidence

- `.github/workflows/ci.yml:206-231` - the `Reviewed` job; line 230 is the single `gh api ... status`
  read with no retry.
- Run `34315981181`, job `102352180544`: `noacg/reviewed on 21b82fa3...: missing`, then
  `no passing noacg/reviewed status on 21b82fa3... - queue with npm run queue:merge`.
- The same run's re-run of that job passed in 4 seconds against an unchanged sha, which is what
  proves it is a race and not a verdict.
