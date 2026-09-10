# 2026-09-09 - row AY, what a job costs the queue

Branch `claude/ay-per-job-cost`, two commits on merge base `345877ec`. Nothing is left uncommitted.

## What was wrong, reproduced first

Row AG's diagnosis was right and the reproduction is exact. `costOf()` read a `cost` field off the
job record; `addJob()` never wrote one and silently dropped one that was passed. So the field was
dead, no session could declare anything, and every job fell back to classification - where an
unrecognised command was charged a whole suite. Because the free-RAM floor is
`freeMemFloorMb * cost`, a suite-priced job demands 4 GB free, which this laptop does not have
while the owner has a browser open.

Driving the queue's own `addJob` + `costOf` + `schedule` against a throwaway store, with j-0888's
command verbatim and the free-memory reading it was refused on:

```
declared cost 0.25 survived addJob? undefined
  running  j-0001  [1]  node scripts/ograf-external-walk.mjs --s...
--- schedule() at 3.2 GB free, 02:00, floor 4096 MB ---
  #1       j-0001  only 3.2 GB RAM free, needs 4.0
  #2       j-0002  only 3.2 GB RAM free, needs 4.0
```

The second line is the one that cost the night: a session that KNEW its walk was small declared
0.25 and was charged a suite anyway. After the change, both start, and re-derived through the real
CLI on this machine at 3215 MB free: a walk says `starting now`, `npm run test:e2e:affected` still
says `only 3.1 GB RAM free, needs 4.0`. The floor did not move.

## The default, and why

`COST.walk = 0.5` - a dev server and ONE browser page - is the default for a command the
classifier does not recognise. The reasoning is in `scripts/jobs-store.mjs` above `COST` and above
`costOf`, which is where a reader meets it. In short: suite-sized work is enumerated (the e2e
suites, and the batteries in `SWEEP_SCRIPTS`), so the common unknown is a one-page script, and its
worst case is a server and that page. Half a suite is a judgement, not a measurement - it leaves
the floor at 2 GB, which is reachable here, and it is dear enough that a night cannot fill with
eight browsers. Retune it from the logs the way `freeMemFloorMb` already asks to be.

Two consequences I decided deliberately rather than stumbled into, both pinned by tests:

- **Two walks may run by day where one suite could, four at night.** The day still spends at most
  one suite-equivalent of this machine on agent work - sliced instead of whole - which is what the
  day budget has always promised.
- **`SWEEP_SCRIPTS` drifts, and this default no longer covers for it.** `command-match.mjs` reads
  as a log of suite-sized scripts that were missing from it until someone noticed. Under the old
  default an unlisted battery was charged correctly by accident; now it is charged half. Carrying
  that instead: a session that knows says so (`--kind sweep` is now honoured as a declaration, or
  `--cost`), and a job priced too low overcommits the box by itself rather than letting three more
  in behind it - see below.

## What the check found, and what it changed

`review: delegated` (scope-checked and matched - same branch, merge base `345877ec`, files a subset
of this branch's diff). Eight findings, all confirmed against the code, all fixed. The one that
mattered:

- **`schedule` never spent its free-memory reading.** Every candidate was tested against the same
  sample taken before the loop, so N jobs that each fit it all started together. It was nearly
  harmless while nothing could start below 4 GB; pricing a walk at half a suite made it reachable,
  and four walks were admitted on 2.1 GB free. The pass now keeps a running figure and charges
  each admission its floor. This is a PRE-EXISTING defect that my change would have made real, so
  it is fixed here rather than filed.

Also fixed: a declared cost had no lower bound (`--cost 0.01` would have demanded 41 MB free -
the range is now 0.15 to 1, judged in one exported `costProblem` the CLI asks rather than
restates); `--cost 2` died as a stack trace because nothing catches a throw out of `main()`;
`--cost` written last was silently dropped; `--kind sweep` was ignored by `costOf`; and
`docs/JOB_RUNNER_PLAN.md` still documented the old 1.0 default.

`simplify: inline` - the skill returned fan-out instructions, so the four angles were covered here.
It folded three near-duplicate walk fixtures onto one test helper, collapsed the CLI's two `--cost`
guards into one block, and simplified the record spread.

`verify: inline` - `npm run build` green (exit code read directly, not through a pipe). No product
code changed, so `test:e2e:affected` is not owed; CI on the first commit ran Build, Factory gates,
E2E plan and CI gate, with every E2E shard skipped, which is the right shape for a scripts-only
change. `taste: not applicable` - nothing here can move what a graphic looks like.

## Left undone, on purpose

- **`scripts/ograf-external-walk.mjs` is not in `SWEEP_SCRIPTS`** and I did not add it. It drives a
  browser, so the guard hook does not know to refuse a hand-started one - but adding a name to that
  list changes what the guard refuses and what the process detector sees, machine-wide, and the
  script itself lives on row AG's branch rather than in the repository. Whoever lands that script
  should decide; if it goes on the list it will be priced as a battery, so it wants a `--cost 0.5`
  or a name that is honest about being one page.
- **`taste-frame-review` is listed as a battery but renders "a handful of designs"** (its own
  comment says so). It is probably a walk, not a suite. Measuring it means running it, which this
  laptop could not afford tonight.
- **Nothing re-prices the jobs already in the store.** A job queued before this change keeps
  reading the default, which is the point of not writing a cost onto a record that did not declare
  one - the change reaches old waiting jobs for free.

## Pointers

- `scripts/jobs-store.mjs` - `COST`, `costProblem`, `addJob`, `costOf`, and the floor arithmetic in
  `schedule`.
- `scripts/jobs.mjs` - `cmdAdd`, the `--cost` flag and its refusals.
- `scripts/jobs-store.test.mjs` - five new cases, including the 2026-09-09 regression in both
  directions and the day-budget consequence.
- `docs/acceptance/owner-queue/2026-09-09-a-single-browser-walk-no-longer-asks-for-a-suite.md` -
  the owner's route, which queues only `node -e 0` because a queued command really runs.
