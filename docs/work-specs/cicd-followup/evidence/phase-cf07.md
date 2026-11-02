# Phase cf07: the late-send-abandoned flake (#1805)

Plan run #1967 (cicd-followup), phase cf07. Builder session on branch
`claude/plan-cicd-followup-cf07-build`, from `main` at 4a1ee559.

## Repeat-count brief (written and pushed before the repeat run)

This section is the phase's written brief for the count, committed on its own before the run
starts (acceptance (b)).

**Pre-fix failure rate.** Two measures, both counted; the count below is sized for the lower.

| Source | Runs | Failed | Rate |
| --- | --- | --- | --- |
| CI history since the quarantine (2026-10-28T20:00Z to 2026-11-02): the `noacg/quarantine/e2e/configured/late-send-abandoned.spec.ts` status on every main commit the configured suite ran on (push and schedule), each run with the suite's one retry, so "failed" means any attempt failed | 94 | 12 | 12.8% |
| Measured before the fix: three trials of the unchanged spec and helper on a CI runner, retries off (endurance.yml runs 41533158591, 41537602966, 41539944252) | 80 | 15 (9 of 40, 5 of 20, 1 of 20) | 18.75% |

**Repeat count.** N = 40 runs, retries off, on one `ubuntu-latest` runner with the CI worker
count (`playwright.live.config.ts` `workers: 1`, as each configured shard runs it), against the
local Supabase stack started as the configured suite starts it (CLI 2.111.0,
`supabase start -x studio,edge-runtime`), through `endurance.yml` with
`npm run trial:late-send-abandoned -- --minutes 40`.

**Arithmetic.** N must satisfy 1 - (1 - r)^N >= 0.95, so N >= ln(0.05) / ln(1 - r).

- At the lower rate r = 12/94 = 0.1277: ln(0.05) / ln(0.8723) = -2.9957 / -0.1366 = 21.9, so N >= 22.
- At the measured rate r = 15/80 = 0.1875: -2.9957 / ln(0.8125) = -2.9957 / -0.2076 = 14.4, so N >= 15.
- N = 40 gives 1 - 0.8723^40 = 0.9958 at the lower rate, and 1 - 0.8125^40 = 0.9998 at the
  measured one.

**Pass condition.** All 40 runs pass with zero failures, and exactly 40 ran
(`scripts/configured-trial.mjs`: a fail-then-pass cannot hide, retries are off).

## (a) Reproduced and explained

**Every recorded failure is one failure.** All 15 failures read from CI history (the 12 main
statuses above, and the three runs on #1805: 40763025050, 41187110573, 41189183454) end the same
way: `the operator page has read the log and is not reading it now`, at
`late-send-abandoned.spec.ts:96`, the first `followerLevel()` before any press. The
`watchLogReads` wait (`e2e/configured/_helpers.ts`) timed out after 30 s. The trace of a failed
attempt (run 41408535007, shard 1, retry) shows the operator page sending no
`control_tail_seq` for 30.3 s after it resolved the show, then one at its 30 s poll.

**Reproduced on a CI runner** with the unchanged spec, retries off: 9 of 40, 5 of 20 and 1 of 20
runs failed with the same message (the three trials in the brief).

**Where the read went.** Each trial added one layer of diagnostics (temporary commits on this
branch, all removed before review):

1. The operator page's realtime frames (trial 1). In a failing run the page joins `seq-<show>`
   at 3.6 s and the server answers `ok` at 3.7 s, exactly as in a passing run. The join is not
   slow and not refused.
2. Debug lines in the follower (trial 2). In every failing run the page reports
   `SUBSCRIBED`, the follower refills, the tail read starts and its answer comes back
   (`tail done ok` about 50 ms later, 0 rows, same epoch). The product read the log at once, as
   its rule says (`seqFollow.ts` `joined()`: refill at once on the first join).
3. Raw network events beside Playwright's (trial 3). In the failing run the page's own fetch
   ran, and Chromium's `Network.requestWillBeSent` arrived for it on a CDP session of the page
   (twice, as in every passing run), but Playwright emitted no `request` and no
   `requestfinished`, neither on the page nor on the context. In the 19 passing runs all four observers saw the read.

So the page did nothing wrong: it joined, read the tail and had its answer within 50 ms. The
watcher counted reads from Playwright's request events, and Playwright dropped the event for the
one read the page makes on joining. The watcher then saw no read until the page's 30 s poll,
and its own timeout is also 30 s. That is the whole flake. No documented product rule is broken
(the page followed the log and its presses were never at risk), so a product change would fix
nothing.

**The fix waits on observable state.** `watchLogReads` now counts the page's reads at the page's
own `fetch`, through an init script installed before the page loads, and polls that counter.
The read is the fetch, so it cannot be missed. A read counts as Playwright's events counted it:
open from the call, closed once the whole answer has arrived (the wrapper reads a clone of the
body), answered whatever status the server sent, and not answered if it broke off. The rule
waited for is the same: one read answered, none open, none for 300 ms. No timeout, wait, retry
or assertion changed. The four
specs that use the helper (late-send-abandoned, late-commit-notice, command-sequence,
playout-switch-mid-flight) now await it before their page loads.

**Not a backend stack or port collision (#1865, #1829).** Those fail `supabase start` before any
test runs, and the shard reports no tests. Every failure here ran on a stack that had started,
passed its schema, grant and realtime assertions and served the tests before it; the trials ran
one stack per runner with nothing else on it; and the frames show the stack answering the join
in under 100 ms. The setup fix stays with cf04.

## (b) Stability under CI conditions

The brief above was pushed in its own commit (`0bd3e24d`) before the run. One correction to its
wording: the trial's stack is started with the same CLI and command as the configured suite's,
but it is not put through the configured-stack action's schema, grant and publication
assertions; the trial makes and signs in its account only. The first run:
[41542195497](https://github.com/NoaCG/NoaCG-Studio/actions/runs/41542195497), `endurance.yml`
on this branch at `0bd3e24d` (the fix and the brief), `trial:late-send-abandoned` for 40 minutes
with the local stack: **40 of 40 runs passed, 0 failed, exactly 40 ran** (21.4 minutes of
Playwright, retries off, one worker). The same runner and spec failed 9 of 40 before the fix.

The quarantine is not touched by hand. `e2e/quarantine.json` still lists the spec; the configured
suite runs it on every push to `main` and posts `noacg/quarantine/<spec>`, and
`scripts/e2e-quarantine.mjs release-due` queues its release after `RELEASE_AFTER` (20)
consecutive passes. That happens after this merge.

## (c) The incident record

#1805 carries owner (`miwco`, weekly owner session as backup), impact, repair date (2026-11-11)
and restoration criteria (cf01, comment 6575541195). This phase adds a comment with the root
cause, this PR, the repeat run and what remains: release by the documented route, then the issue
closes. Nothing in this PR closes it.

## Phase notes

- **Previous verified main SHA:** 4a1ee55913b4c63425a00bedf8a2c85792a45bde (CI, merge group,
  configured suite, quarantine and post-landing all green on it).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. It puts the request-event
  watcher back and removes the trial script; the quarantine entry is untouched either way.
- **Decisions:**
  - A test fix, not a product fix: the trials show the page joining, reading and being answered
    within 50 ms in every failing run, so no product rule is broken (acceptance (a)).
  - The page's own `fetch` is the observable state, not a new product attribute: it is the read
    itself, it needs no product change, and an invisible test hook in the product would serve
    only the specs.
  - The repeat trial runs through `endurance.yml`, the existing dispatch-only workflow for long
    runs, with a new `scripts/configured-trial.mjs` and one npm script naming the spec and count.
    No workflow changes: a new workflow cannot be dispatched before it is on `main`, and inputs on
    `configured-suite.yml` would break `candidate-dispatch.mjs`'s rule that every run of that
    workflow at one commit is the same check. cf05, cf06 and cf08 can add their own
    `trial:<spec>` line.
  - Retries are off in a trial, so a fail-then-pass is counted as the failure it is.
  - N = 40, above the 22 the lower (history) rate needs, so the run means the same whichever
    rate is taken.
- **Traps:**
  - The diagnostics went in as commits on this branch and were removed before review; a
    trial's dispatch runs the branch's own `package.json`, so its count must be committed first.
  - `gh api ... --jq` takes no `--arg`; a loop built that way fails before calling the API.
  - The repo's commit hook refuses attribution trailers.
