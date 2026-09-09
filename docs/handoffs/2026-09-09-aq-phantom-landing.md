# The phantom LANDED is fixed, and its stated cause was wrong

Branch `claude/aq-phantom-landing`, from `main` at `d02eef82`. Two commits:

| sha | what |
|---|---|
| `84f8cc4d` | LANDED requires a branch that once carried a commit of its own |
| `7a76eb7e` | each doc comment back on the function it describes (the pre-merge review's fix) |

Nothing is left undone on this row, and nothing is uncommitted. The three items under "What this
row deliberately did not do" are recommendations for whoever picks them up, not unfinished work.

## The cause is NOT the `git branch -m` rename, and the wave prompt says it is

Row AQ's prompt states that every row's `git branch -m` step makes its branch "appear briefly
ahead of main and then resolve to it", and that `wave-tick` keying LANDED on that transition is
what fires the phantom. **That is not what happens.** A branch created at main's tip and renamed,
with no commits, is listed by `git branch --merged origin/main` from the moment it exists - the
rename does not change its sha and `--merged` includes a tip equal to the ref it is measured
against. Reproduced in a synthetic repository: that sequence produces **no event at all**, not
even the `NEW BRANCH` line.

**The real cause is the ORDER of the tick's two git reads.** `mergedBranchNames()` ran at
`wave-tick.mjs:397` and `branchInventory()` at `:414`, about a second apart in wall-clock terms -
`syncLandings`, `readJobs`, `worktreeEntries` and the process-table read all sit between them. A
branch created inside that window is in the inventory and missing from the merged set, so it
reads as ahead of main for reasons that have nothing to do with its commits. The next tick finds
it in both and sees exactly the ahead-then-contained transition the LANDED event keys on.

This matters beyond this row: the wave prompt's belief would have led to "fix the rename", which
the prompt itself (rightly) forbids, and would have left the defect in place. Anyone updating
`.agent-workflows/orchestrator/night.md` or `incidents.md` on the strength of that prompt should
use this paragraph instead.

## The reproduction, so it can be re-run

The durable half is in `scripts/wave-tick.test.mjs` - four tests pin the phantom, the genuine
landing, the `aheadOfMain` probe and the ahead-of-main line, and the comment above them carries
the incident. The half that needed real git was a throwaway script; the recipe, which takes about
a minute to rebuild:

1. `git init --bare -b main origin.git`, clone it, one commit, push, fetch.
2. Reimplement `mergedBranchNames()` and `branchInventory()` verbatim from `wave-tick.mjs` but
   taking an explicit `cwd`, and a `tick(root, now, { between })` that runs the merged read, then
   the `between` hook, then the inventory - `between` is the race window.
3. Case 1, no race: create a branch at `main`, `git branch -m` it, run two ticks. Feed the
   snapshots through the real `deltaBetween`. **No events** - the rename theory dies here.
4. Case 2, the race: pass the branch creation as `between`. **Tick A prints `NEW BRANCH ahead of
   main: <name>`, tick B prints `LANDED <name>`** - the observed pair, on a branch with no commits.
5. Case 3, a real landing: commit on a branch, merge it into main, push, fetch. **`LANDED` still
   fires**, before and after the fix.

With `ahead` computed by `aheadOfMain` instead of inferred from the merged set, case 2 goes
silent and case 3 is unchanged. Both directions, measured, on real git.

## The evidence from the night itself, which is on this machine and not in the repository

`C:\claude\NoaCG-Studio\.git\noacg-jobs\wave-tick-events.log`, lines 249-258:

```
2026-09-09T20:19:58.552Z tick 345 NEW BRANCH ahead of main: claude/ac-harness-verdict
2026-09-09T20:23:02.204Z tick 346 LANDED claude/ac-harness-verdict
2026-09-09T21:27:29.743Z tick 367 QUEUED claude/ac-harness-verdict
2026-09-09T21:30:33.696Z tick 368 LANDED claude/ac-harness-verdict
```

One branch, two LANDED events an hour apart, and the first one four minutes after the branch was
created with nothing on it. That log and the state file beside it are per-machine and are not
committed anywhere, so this quote is the only copy that survives the next cleanup.

The same tick fired `NEW BRANCH` for `claude/ab-reap-codex-delegation-tree` too, and that one did
not go on to a phantom LANDED - it had committed by 20:23, which is what the fix now requires up
front rather than by luck of timing.

## What the fix is

Each branch now carries `ahead`, a **separate measurement** from `landed`, and the LANDED event
requires both: the existing `!before.landed` transition key, plus `before.ahead === true`, the
receipt that the previous tick asked git directly whether that exact sha was an ancestor of
`origin/main` and got no. `landed` still comes from the one batched `git branch --merged` read;
`ahead` re-asks per sha, but **only where the batched set says a branch is not contained** -
three of 53 branches on this repository tonight, so the tick still costs a handful of git calls
(measured 3.3 s end to end, dominated as before by `blocked-sessions.mjs` and the process table).

Deleting the batched read and probing all 53 would be simpler and more general, and I rejected it
on the number the file already carries: 2.7 s for 69 branches the spawn-per-branch way against
63 ms batched. Two tiers with the cheap one first is the right depth here.

Four other things follow from the same answer:

- **`looksFinishedUnqueued` refuses a branch with no commits of its own.** A row's branch is cut
  at main's tip, so its `lastCommitMs` is *main's* last commit and is already quiet past the
  30-minute bar on the row's first second, with a clean tree and nothing queued. A raced empty
  branch could therefore have been announced as a session that ended without queueing. Nobody
  reported that one; it was there.
- **`refs/remotes/origin/HEAD` is no longer read as a branch.** Its short name is the bare remote
  name `origin`, which does not start with `origin/`, so it entered the inventory as a local
  branch sitting at main's tip. It was in the live state file, and every "N branch(es) ahead of
  main" summary line has been one too high for months. The tick now reads `%(refname)` as well and
  skips that ref.
- **A tick that cannot read the merged set carries the previous answers forward** instead of
  writing "not landed" over every branch. It used to do the latter, which means one failed
  `git branch --merged` would have made the next healthy tick re-announce every landing it already
  knew about. Suppressing the events in the blind tick was never enough on its own.
- **`STATE_VERSION` is 2**, because the stored branch records gained `ahead`. A v1 file is
  discarded with the warning that path already prints.

## The decision the prompt asked for, in one line

**Yes - `NEW BRANCH ahead of main` gets the same requirement**, because it fired on the same
phantom and its own wording claims something it was not checking. It is now keyed on the *ahead*
transition rather than on first sighting, so a row's empty branch says nothing when the harness
mints it and says `AHEAD OF MAIN <branch>` when it makes its first commit - later, but true, and
it also covers the case the file already worried about (fresh commits after a landing, nobody
queueing them) an hour before `FINISHED-LOOKING` would reach it.

## Traps

- **The night loop gets one tick of amnesia when this lands.** The version bump discards the v1
  state file, so the first tick after it prints its baseline and no events. A landing that
  completes inside that single gap is announced zero times. It is three minutes wide, the script
  says so in its own warning line, and re-running the tick does not recover it - only knowing to
  look does.
- **A branch that commits AND lands inside one inter-tick gap has never produced a LANDED event**,
  and still does not. The `!before.landed` transition key consumes it on its own: the tick that
  sees the branch empty records `landed: true`, so the next tick's `landed: true` is not a
  transition. This predates the change and is unchanged by it - the pre-merge review raised it as
  new, and it is not. Landing inside three minutes of a branch's first commit would need CI, a
  queue slot and a merge in that window, so nothing has hit it.
- **`git rev-list --count origin/main..<branch>` returning 0 still means landed OR empty.** The
  fix does not remove that ambiguity, it stops the tick from resolving it with a reading taken
  before the branch existed. Checking a landing by hand still needs the previous tick.
- **A delegated review mis-scoped itself against a stale local `main` for the fifth time in this
  repository** - see the check report below.

## The pre-merge check

`review: discarded+inline`. The code-review skill (level `high`, named explicitly) came back with
ten findings and reported its scope as `main...HEAD` - **the local `main` branch**, five
first-parent commits, four of them merged pull requests. This worktree's real scope is branch
`claude/aq-phantom-landing`, merge base `d02eef82e389c8fa189ddff0a557e0e63361763b`, two files:
`scripts/wave-tick.mjs` and `scripts/wave-tick.test.mjs`, working tree clean. Nine of the ten
findings name files this branch never touched. So the pass was discarded whole, per
`.agent-workflows/check.md`, and the review redone by hand over the two-file diff, which found and
fixed one real defect: three JSDoc blocks stacked above one function, leaving `nothingQueuedFor`
and `looksFinishedUnqueued` documented by comments attached to something else. Fixed in
`7a76eb7e`, which also corrects the probe count in `aheadOfMain`'s comment.

This is the fifth measured occurrence of that mis-scope and the second cause listed in
`docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md`. The scope check caught it in
one command, as advertised.

**The nine discarded findings are about code already on `main`**, not about another live branch, so
there is no session to relay them to. They are worth a look by whoever owns that area, and I have
not verified any of them: `cli/src/output.ts:115` (the stray-word refusal drops quoting advice for
verbs whose one argument is a path), `scripts/worktree-cleanup-lib.mjs:76` (a reaper timeout reads
as not-busy, so a worktree with a running delegation is removed), `scripts/codex-rescue.mjs` at
`:471`, `:363`, `:559` and `:793`, `scripts/e2e-runs.mjs:603`, and two stale docs claims in
`docs/AGENT_CLI.md:344` and `docs/backlog/three-cli-verbs-still-swallow-an-unquoted-flag-value.md`.

`simplify: inline` - the skill returned fan-out instructions, which by `check.md`'s four-branch
rule means the pass did not run, so the four angles were covered here. Reuse: `aheadOfMain` takes
an `inMain` callback to match `landingStateFor`'s existing convention rather than inventing a
second shape. Simplification: nothing left to remove; the two parallel carry-forward ternaries
were left explicit on purpose, because collapsing them would spawn a git probe during the very
outage they exist to survive. Efficiency: covered above. Altitude: covered above.

`verify: inline` - `npm run build` green on the final tip; `node --test` green on
`scripts/wave-tick.test.mjs` (30 tests) and on the five job/wave suites together (142 tests). CI
run 34412584148 on `84f8cc4d` completed **success**, and the jobs that ran were `Factory gates`,
`Build`, `CI gate` and `E2E plan`, all success - the E2E shards, `Catalog calibration gate`,
`Reviewed` and `Vercel accepted the commit` were **skipped**, which is correct for a diff that
touches only `scripts/`. The run for `7a76eb7e` is read before this branch queues.

`taste: not applicable` - nothing here can move what a graphic looks like.

No `docs/acceptance/owner-queue/` item: the change is orchestration machinery, and there is no
route through the product for the owner to walk.

## What this row deliberately did not do

- **`npm run learn` was not run.** The lesson is real and worth recording - *a batched git read
  and a per-branch read taken at different moments disagree, and the disagreement reads as a state
  transition* - but writing it regenerates the compiled `.claude/rules/` files, and other rows were
  live tonight. The landing trap about generated files merging cleanly and coming out wrong is
  exactly this shape. Whoever records it should do it from a quiet tree.
- **`night.md`'s "The trigger is a landing, checked, never assumed" bullet was left alone.** It is
  still true, and now understates the mechanism: containment for a branch the tick has not yet
  seen is not a reading at all. One sentence would fix it, and the row's own instruction was not
  to widen past `wave-tick.mjs`.
- **No wave prompt's `git branch -m` step was touched**, per the row's instruction - and, as the
  top of this file explains, there was never a reason to.

## Pointers

- `scripts/wave-tick.mjs` - `aheadOfMain` and its comment carry the mechanism; the block above the
  `LANDED` push in `deltaBetween` carries the incident with its timestamps.
- `scripts/wave-tick.test.mjs` - the four new tests, under the banner comment beginning "The
  phantom landing: an empty branch is not a landed one".
- `.agent-workflows/orchestrator/night.md`, the landing-trigger bullet, and `incidents.md`, "the
  empty branch that read as landed" - the trap this case sits beside and is not covered by.
- `docs/backlog/code-review-scopes-a-branch-against-a-stale-main.md` - now with a fifth occurrence.
