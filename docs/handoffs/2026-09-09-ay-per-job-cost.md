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

---

# 2026-09-10 - row BC, why the four landings burned

Four landing jobs died on this branch (j-0903 to j-0906) and the row that picked it up was given
two hypotheses for the four red tests. **Neither is true.** Both were disproved by measurement
before a line was changed, and the real cause is a third thing that neither would have found.

## The two hypotheses, and how each was killed

**(a) The tests depend on the HOST - three of the four names mention free memory, so a runner with
different free RAM reads differently.** False, and the test file says so in its own header: the
clock and the free-RAM reading are injected, and no case reads `os.freemem`. Measured in both
directions rather than argued:

| tree | this Windows laptop | GitHub's Linux runner |
|---|---|---|
| the branch alone (`affa277a`) | 87/87 pass | pass - run 34420984127, `push` |
| that same sha merged with `main` | 4 fail | 4 fail - run 34421030153, `pull_request` |

Two hosts, same verdict, twice. The host is not the variable.

**(b) The parent commit's green was stale and the fix never worked.** False, and it is worth being
precise about how false, because the prompt's TRAPS line rests on it. The claim was that the gate
ran BEFORE the handoff commit, so the queued tip was never gated. It was:

    gh run view 34420984127 --json headSha,event,conclusion
    {"conclusion":"success","event":"push","headSha":"affa277a..."}
    gh run view 34421030153 --json headSha,event,conclusion
    {"conclusion":"failure","event":"pull_request","headSha":"affa277a..."}

**The same sha, green and red in the same hour.** The queued tip was gated, on the runner, at
exactly the commit that was queued. "Gate the thing you queue" was already satisfied. So the trap
this branch is evidence for is a different and sharper one - below.

## What was actually wrong

A semantic conflict with `main` that merged as clean text.

`scripts/jobs-store.test.mjs` had a `walk()` fixture whose command was j-0888's verbatim,
`node scripts/ograf-external-walk.mjs ...`. Its whole job was to be a command the classifier
CANNOT recognise, which is the case the 0.5 default exists for - and the fixture's own comment
said so: "that script lives on the branch it was queued from rather than in this repository."

On 2026-09-10 row AG landed that script, and the same commit (`2e348a9f`) added five lines to
`scripts/command-match.mjs` putting `ograf-external-walk` into `SWEEP_SCRIPTS`. Correctly, on its
own terms. From that moment the fixture named a battery, so `costOf` answered 1 where four cases
expected 0.5. One line settles it:

    old fixture command  -> 1    (COST.browser)
    new fixture command  -> 0.5  (COST.walk)

Neither branch touched the other's files. Git had nothing to conflict on. The premise inverted
anyway, and every gate that looked at one side alone stayed green.

## The fix

The fixture no longer names a real script. `WALK_COMMAND` is
`node scripts/a-walk-this-repo-has-never-seen.mjs`, and one new case asserts the premise the other
four rest on: if `command-match.mjs` ever learns that name, it fails with an instruction to rename
the fixture and NOT to re-price the mechanism. A fixture that names a real artefact is asserting
somebody else's decision about that artefact; this one now asserts only what it means to.

`main` is merged into the branch, so what CI gates from here is the tree that actually lands.

## The rule candidate, corrected

Not "gate then commit then queue" versus "gate the thing you queue" - both held here.

**A branch-only gate cannot see a conflict with `main` that has no text conflict, and the branch's
own push run is a branch-only gate.** Only the `pull_request` run builds the merge. A branch that
is BEHIND `main` and about to be queued has never been gated on the tree that will land, however
green it is. This branch was four commits behind and every local and branch signal was green.

Two cheap mechanisms, either of which would have caught it: integrate `main` before queueing (the
queue-merge workflow already says a clean `git merge main` is not proof, and asks for the
integration plan from the fork point - this is the case that makes it concrete), or read the
PULL REQUEST's run rather than the branch's push run, since only one of the two builds the merge.
It is the same family as the `landing/generated-file-merges-cleanly-still-comes` trap: git
resolving two texts it has no reason to question, and the meaning going wrong underneath.

## Measured on the way, for whoever retunes `COST.walk`

j-0888 is weaker evidence for the 0.5 default than this branch claimed. Reading row AG's landed
script: one `chromium.launch`, one context, **two** `newPage` calls, and **two** spawned servers
(`npm run dev` and `dist/main.js`). Heavier than the walk this default assumes - one server, one
page - and lighter than the four-worker suite it was charged. Row AG rounded it up to a battery by
listing it, which is a defensible call for it.

So what j-0888 still proves is the half of this change that is not a judgement: the session KNEW
its job was not a suite and had no way to say so. What it no longer proves is that 0.5 is the
right guess for an unknown command. That number is not moved here - it is a landed judgement and
this row exists to get the branch green - but the measurement is recorded so the retune the code
comment already asks for can start from it rather than from j-0888's description.

Also left alone deliberately: `docs/OGRAF.md` still tells a session to queue
`node scripts/ograf-external-walk.mjs` plainly, which now prices at 1.0 and so demands 4 GB free
on this laptop. That is row AG's pricing working as intended, and the answer the session has now
is the one this branch added: `--cost 0.5`, or `--kind sweep` if it means it.

## One thing done out of order, recorded rather than tidied away

The freeze hook refused an `Edit` while j-0906 was running - correctly. But by then
`git merge origin/main` had already moved the tip off the sha j-0906 was pinned to, and
`git apply` had already changed a tracked file, neither with a word of refusal.

Reading the guards says why. `scripts/hooks/guard-edit.mjs` checks `liveLandingFor` before every
edit, and `scripts/hooks/guard-command.mjs` checks it for `git ... commit`. **Nothing checks the
git commands that MOVE THE TIP** - `merge`, `apply`, `reset`, `checkout`. So the freeze catches
the second thing a session does to a queued branch and not the first, and the pin is already
stale by the time the refusal arrives.

j-0906 was doomed either way: PR 216 read `BLOCKED` with `Build` and `CI gate` failing, so the
watch could never have succeeded. Cancelling it was refused by this session's own permissions, so
it was left to reach its 60-minute cap - which is the verdict, just spent rather than read. The
gap is real and cheap to close: the same `liveLandingFor` call, on the same `isCommit`-style regex,
widened to the tip-moving verbs.

## One cleanup this session could not do itself

This row ran isolated in `.claude/worktrees/agent-a5655ec96bd2c8221` and could not run git against
the worktree that owned the branch, so it adopted the branch here with
`git checkout --ignore-other-worktrees`. Two worktrees now name `claude/ay-per-job-cost`, and the
original - `.claude/worktrees/agent-af639a49376d610e4`, whose session is closed - has files at
`affa277a` while the ref moved on, so it reads as **27 uncommitted files**. `merge-order.mjs`
picks that worktree as the branch's home and calls the branch NOT LANDABLE on the strength of it.
Everything binding is clean: `review-request.mjs` binds git to the worktree that owns it and
answered correctly from here, and `git status --porcelain` is empty in this one.

From the primary `main` checkout, where the worktree tools are meant to run, one line settles it:

    git -C .claude/worktrees/agent-af639a49376d610e4 checkout -- .

or remove that worktree outright - its session is closed and all of its work is on the branch.

## Both hazards are filed, because a handoff gets drained

The two mechanism gaps above are not this row's to fix, and they outlive this file. Each is its own
entry under `docs/backlog/`:

- `the-freeze-does-not-cover-the-git-verbs-that-move-a-tip.md` - `liveLandingFor()` has exactly two
  callers, file edits and one regex for `git ... commit`. Every verb that moves a tip is unguarded:
  `merge`, `apply`, `rebase`, `reset`, `checkout -B`, and `push`, which is the sharpest of them
  because it moves the pull request's head without touching the local branch at all.
- `a-fixture-that-names-a-real-command-inverts-without-a-git-conflict.md` - what shape of fixture is
  safe, and the two checks that would catch the next one: no test fixture may name a script in
  `SWEEP_SCRIPTS`, and a green push run beside a red pull-request run on one sha always means the
  merge preview differs from the branch, never that the run is flaky.

## Pointers

- Commits, in order: `affa277a` the work, `df981bd1` `main` merged in, `9abc04b1` the fixture and
  the two comment corrections.
- `scripts/jobs-store.test.mjs` - `WALK_COMMAND`, the guard case above `capacity is one by day`.
- `scripts/command-match.mjs` - `SWEEP_SCRIPTS`, and `ograf-external-walk` in it (from `main`).
- `scripts/jobs-store.mjs` - the `COST` comment, with the j-0888 measurement added.
- Runs 34420984127 (push, green) and 34421030153 (pull_request, red) - the same sha.
