# Session K - the Reviewed gate stops crying wolf

**Branch:** `claude/k-reviewed-gate-race` (3 commits plus the merge of `main`)
**Pull request:** #193
**Backlog closed:** `docs/backlog/pushing-then-queueing-races-the-reviewed-gate.md`, deleted in the
first commit.

## What changed

`ci.yml`'s `Reviewed` job used to read the `noacg/reviewed` commit status once, about six seconds
into the run. It now waits up to 150 seconds for it (`scripts/reviewed-status.mjs`), because the
status and the run that reads it are started by two different commands and the reader was winning
or losing on network luck.

**The pass condition is byte-identical**: a `success` status on that exact sha. Only the moment we
call the status absent moved.

## The measurement, which corrected the diagnosis

The backlog file had one data point (#174, red by 48 seconds) and read it as "pushing then queueing
loses". Across the five landings of 2026-09-09 the shape is sharper than that:

    PR #189   status 11:49:04Z   Reviewed read it ~11:49:09Z   green by ~5 s
    PR #190   status 12:08:38Z   Reviewed read it ~12:10:09Z   green by ~90 s (a slow runner)
    PR #191   status 12:12:54Z   Reviewed read it ~12:13:01Z   green by ~7 s
    PR #192   status 12:24:46Z   Reviewed read it ~12:24:53Z   green by ~7 s
    PR #174   status 05:43:38Z   Reviewed read it  05:42:50Z   RED by 48 s

There are two shapes, not one:

- **The pull request does not exist yet.** `queue:merge` pushes, creates the pull request (which
  starts the `pull_request` run) and posts the status three `gh` calls later. The margin is one to
  four seconds against however long GitHub takes to schedule a runner - a coin flip we have been
  winning, not a safe win. This is #189 to #192, and it is what `scripts/ci-watch.mjs` was arguing
  from when it said the status lands "well before a runner picks the job up".
- **The pull request already exists.** The push that precedes queueing starts a `synchronize` run
  immediately, and the rest of `queue:merge` takes most of a minute to reach the status call. The
  gate loses this one every time. That is #174, and it is the shape a re-queue always takes.

## The design I chose, and the two I rejected

**Chosen: the job waits for the status.** A bounded poll (150 s, every 5 s) against a worst
measured gap of 48. It removes the race rather than narrowing it, and it cannot make a check pass
that should fail: both true shapes of a `Reviewed` red - a tip that moved after its declaration,
and a `queue:merge` that opened the pull request and then stopped, both of which
`describeReviewedOnly` in `ci-watch.mjs` carries with evidence - are never going to be stamped, so
they still fail, at the bound. The cost is that a genuinely unreviewed tip goes red two minutes
later than it did, on a run whose `CI gate` takes six to nine minutes anyway. The asymmetry is why
the bound is generous: waiting too long costs a runner minute nobody is waiting on, waiting too
short leaves the bug in.

**Rejected: `queue:merge` owns the push.** The backlog file's own first suggestion, in the variant
that could work. It moves the first landing's margin but leaves the `synchronize` case - the one
that actually failed - exactly where it is, because `queue:merge` pushes before it posts too
(`jobs.mjs:513` then `:542`); the push would still start a run a minute ahead of the status. It
also takes the push away from the session, which wants CI's answer on a tip *before* it declares
the work finished. It is a bigger change to who does what, and it does not fix the failing case.

**Rejected: `queue:merge` re-runs a `Reviewed` job that failed while it was posting.** It repairs
the symptom reliably-sounding but with more timing: at the moment `queue:merge` finishes posting,
the job it would re-run has usually not failed yet (it is mid-run), so the repair needs its own
wait to know what to repair. It leaves the race in the gate, and it teaches the landing path to
re-run a red instead of not producing one. A check somebody routinely re-runs has stopped being
read.

## Where the wait lives, and why not in the workflow

`scripts/reviewed-status.mjs` rather than six lines of shell in `ci.yml`, so the bound, the early
exit and the sha resolution have tests: `scripts/gates.mjs` globs `scripts/**/*.test.mjs`, so
`scripts/reviewed-status.test.mjs` (11 cases) gates every `npm run build` with no entry in
`package.json`. The job gained `actions/checkout@v5` and nothing else - no `setup-node`, no
`npm ci`; the runner's own Node runs a file of builtins that shells out to `gh`. `timeout-minutes`
went 3 -> 5 to sit above the wait.

The review pass found the thing that would have undone all of it: where the old check made two `gh`
calls, this one makes up to thirty, so a single 502 would have thrown a raw stack and produced
exactly the false red the change removes. A failed poll is now `unreadable`, the wait continues,
and a bound reached with nothing but failures is reported as gh not answering (re-runnable) rather
than as a missing stamp (needs `/check`). Also from the review: a non-numeric `REVIEW_WAIT_SECONDS`
made the wait unbounded via `NaN`, and every throw now arrives as one `::error::` line.

## Proof

Reproduced first on second and third landings (#189 to #192 above), not on #174's single reading.

In CI, on this branch's own pull request:

- Run `34355021122`, job `102477379533` (`pull_request`, tip `36cf6ded`, nothing stamped on it):
  the job **polled 28 times across 148 seconds** and then reported
  `no passing noacg/reviewed on 36cf6de... after 148s, 28 poll(s)`. Two minutes thirty-seven end to
  end, inside the five-minute cap. That is the bound running on a real runner, and that red is
  true - the old check would have said the same thing in six seconds, and would have said it just
  as loudly on a branch that was fine.
- The landing run: see below - the queueing tip's `synchronize` run is the one that proves a green
  through the race, because `queue:merge` pushes it and stamps it about a minute later.

## Two things worth knowing that this session measured

- **A conflicted pull request gets no `pull_request` run at all.** PR #193 was opened while the
  branch conflicted with `main` (row H had drained the handoff folder under it). GitHub could not
  build the merge ref, so no `pull_request` run was created - and with none, `Reviewed` never
  reported and the pull request could not have landed. `gh pr view --json mergeStateStatus` said
  `DIRTY`. Merging `main` in produced the run three seconds after the next push. If a queued branch
  ever sits with no `Reviewed` at all, look there first.
- **`check-contract-citations` crashed on a file deleted but not yet staged**, because
  `git ls-files --cached` still lists it: an ENOENT stack trace instead of a verdict, for anyone
  who deletes a doc and runs `npm run build`. Fixed in the same branch, with `-z` alongside the fix
  so a C-quoted path cannot silently drop out of the scan.

## What I did not do

- **No owner-queue acceptance file.** Nothing here is observable in the product; it has no route a
  person can walk in the app. Landing-machinery commits here do not add one (`02592b01` is the
  precedent).
- **I queued while rows M and N had not landed**, against my prompt's "a gate lands alone" trap.
  What I could read: at 13:05 UTC `npm run jobs` showed exactly one branch ahead of `main` (mine);
  at 13:16 `claude/m-wizard-says-it-itself` had one commit and was still `not queued`, and
  `claude/n-presentation-25-september` had none. Row J has no branch at all. So both were still
  mid-work, neither could be waited for by a session nothing can wake, and neither had a landing in
  flight for this gate to interrupt. The deciding argument is the direction of the change:
  the new gate is **strictly more permissive** than the old one. Same pass condition, more time
  before the same red, and the one new verdict (`unreadable`) replaces a hard throw. A sibling
  merging `main` cannot get a red that the old gate would not also have given, so the cost of
  landing early is bounded in a way "land last" was protecting against something else. If a
  sibling does see a `Reviewed` red, the job log now says whether it waited and what gh said.

## Next

Nothing is left open on this. If the wait ever proves too short, the bound is one constant
(`DEFAULT_WAIT_MS`) and `REVIEW_WAIT_SECONDS` overrides it per run for a diagnosis.
