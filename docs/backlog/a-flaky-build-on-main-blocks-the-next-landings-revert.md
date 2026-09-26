# A flaky Build on main blocks the automatic revert of the next landing's real break

**Filed:** 2026-09-26. **Source:** handoff of `claude/ci-before-the-break` (2026-09-11), re-checked
against `scripts/red-main-issue.mjs` on 2026-09-26.

## Why

The automatic revert is what keeps `main` landable without a person watching CI. A unit test has
no quarantine, so when a Build job fails and then passes its re-run on the same commit, the run's
conclusion stays `failure` on purpose and the red-main issue names it as a flaky test. The next
landing then inherits that red: `lastVerdictBefore` walks back to the nearest commit with a
verdict, finds the flaky run's `failure`, and `shouldRevert` refuses a genuine, confirmed break with
"main was already red ... fix main forward". One flaky test is enough to switch the revert off for
the landing after it, and nobody is told that this is why.

Over a quiet stretch the next landing is usually green and closes the issue, so this is rare. It
bites exactly when two landings arrive close together, which is when the revert matters most.

## What it would take

- In `lastVerdictBefore`, treat a main push run whose ONLY failed jobs passed their re-run
  (`rerun: success`) as no verdict, and keep walking to the next judged commit.
- That needs each walked run's job conclusions, so one extra API call per walked run. Measure the
  cost against the 40-run walk limit before choosing between fetching jobs for every run or only
  for runs that concluded `failure`.
- A unit test in `scripts/red-main-issue.test.mjs` that pins both directions: a flake-only red
  before a confirmed break still reverts, and a confirmed red before it still refuses.

## Evidence

- `scripts/red-main-issue.mjs`: `lastVerdictBefore` keeps any `success` or `failure` run conclusion
  and ignores job-level results; `shouldRevert` refuses whenever that previous verdict is
  `failure`.
- Only Build and Factory are re-run by `ci.yml`'s `rerun` job, so a failure in any other job never
  gets a second verdict and never reverts. That is the conservative direction and is not part of
  this item.
