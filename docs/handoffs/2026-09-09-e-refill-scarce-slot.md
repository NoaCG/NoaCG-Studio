# Row E - the refill instrument sees the browser slot

Branch `claude/e-refill-scarce-slot`.

The night of 2026-09-08 the refill loop's instrument, `scripts/candidates.mjs`, said `LAUNCH` for a
browser row four times while another row held the one browser slot this machine has. It composes
`collision-check` (files) and `wave-horizon` (time), and neither knows a scarce resource. The row
was a design question with three candidate shapes; this is what was chosen and why.

## The shape, and the failure mode chosen on purpose

**What a candidate NEEDS is derived, and an explicit column may override it.** A candidate whose
`SPECS` column names an e2e spec is taken to need the browser. That inference fails CLOSED: a
code-only row covered by e2e specs (row O that night) is held while the browser is busy although it
could have run, and the loop takes the next candidate and comes back. The rejected alternative, a
column the planner must remember to fill, fails OPEN when a cell is forgotten, which is the four
bad picks again, silently. Reading `MINTS` from the wave table alone was never a whole answer: it
says what running rows hold and nothing about what a candidate needs.

An optional `browser` column on the candidates table overrides the derivation, and only `yes` and
`no` count as the planner's word; an empty cell, a dash or anything else derives, so a placeholder
cannot fail open either. Combining the two is better than either alone because they fail in
opposite directions, and the override can only move a verdict from "held by inference" to "the
planner's word". The one open failure left is a planner writing `no` on a row that drives the
browser, which no instrument can check any more than a wrong `TOUCHES`. The plan check now refuses
a browser cell spelt any other way, in both tables, so a planner who believes they overrode and
did not is told at plan time.

**What is HELD comes from the rows that are running.** A planned row holds the browser when the
wave table's `browser` column says yes or its `MINTS` carries the token `browser` or `the browser
slot` (a whole token, so a path or a note mentioning the browser mints nothing); a launched
candidate holds it when the same need rule says so (the third bad pick was `M` while candidate `L`
held the slot, and L is in no wave table). Running means launched in the ledger `wave-launch.mjs`
keeps for this wave, not landed, not in the queue, and its branch still existing - existence rather
than a diff, because a freshly launched row has no diff for its first minutes and those minutes are
when the bad picks happened. A landing that gave up or was withdrawn leaves the row running, since
its session may be back at work. The ledger is what `wave-horizon` already depends on, and
`launch.md` already makes recording every launch the rule. A wave-table browser row due now with no
ledger line carrying its letter is printed as a caution with the record command rather than held:
a phantom hold that no landing can lift is the one closed failure that is not cheap, so that is the
one place the choice is loud-open.

**The ledger is also the loop's memory.** A candidate with a launch record for this wave is held as
`already launched as <branch> at <time>`, whatever became of it. That closes
`docs/backlog/candidates-relaunches-a-unit-it-already-launched.md` (deleted in this branch), the
2026-09-05 defect where `LAUNCH W` printed twice in an hour with W's record already written. On the
real 2026-09-08 plan the instrument now reads L, O and P as launched with their real branches.

**Which wave a ledger line belongs to.** A record naming its plan is matched by file name, since
the store keeps one plan per date and kind. Records with no plan (every line before 2026-09-09)
match by the wave's window, from the local midnight of the date in the plan's name to its "Window
ends", which keeps last night's F, G, K, L, O and P out of a plan reusing those letters. A day and
a night plan of one date share that window's early hours; for legacy lines that ambiguity is
accepted rather than guessed at, because new lines carry the plan.

Verdict order is the ledger, then collision, then slot, then window - by how hard the fact is. The
slot reason says whether the unit fits once the slot frees, and the closing line names the slot
when the slot is why, so the loop does not read a list waiting on the browser as the horizon
verdict or as a spent list.

## The test that would have caught the four bad picks

`scripts/candidates.test.mjs`, "the four bad picks of 2026-09-08": the night's wave table with G
as a browser row and running, the night's five candidates verbatim, 250 minutes remaining so that
L and M fit on time alone. L and M are held with `needs the browser ... held by G
(claude/g-import-name); fits once it frees`, O is held from its specs with the override hint in
the reason, and the pick is P. A second test replays the third pick, with L launched into the slot
and no longer in any wave table, and pins that L itself is held as launched rather than picked
again. A third gives O an explicit `no` and shows the pick moving up to it. A fourth pins that a
wave-table browser row that launched and has since landed is not reported as unrecorded, because
the first cut of this printed exactly that false caution on the real plan. `runningRows` is pinned
on a freshly launched row with no diff, on a landing that gave up, and on a same-name landing from
an earlier wave; `belongsToWave` on a typed path in another spelling and on a legacy record before
this plan's day began.

## The FINISHED-LOOKING alarm

Three alarms on 2026-09-08, three wrong, every one on a row reading its CI run before queueing.
That shape is indistinguishable from an ended session with the tick's current legs (clean tree,
no commit for 30 minutes, nothing queued). The right fix is a CI leg: `gh run list` on the tip for
the branches that already pass every other leg, in-progress meaning "not finished", completion
starting the quiet clock. That is its own unit with its own measurement, so it is filed in
`docs/backlog/finished-looking-needs-a-ci-leg.md` with the three cases, the run ids and the gate
p90 (15.6 min over 324 jobs). What landed here is the smaller fix that shares nothing with it: the
event line now says what it did not check and points the reader at night.md's three signals, so
it stops reading as a verdict. Pinned in `scripts/wave-tick.test.mjs`.

## Contract text

`.agent-workflows/orchestrator/night.md` step 4 names the slot as the second thing the pick needs,
and the candidate-list paragraph names the optional `browser` column and its `yes`/`no` rule.
Line-neutral: 243 lines before and after, ten bytes smaller.

## What the check found

`review: inline` - the code-review skill answered with a promise of a later notification, which
under check.md's rule means it did not run, so the diff was read here against the angles. Two
edges fixed: the ledger's `plan` path was compared with `path.resolve` against a path the operator
typed, and on Windows a drive-letter case or slash difference would have emptied the running set
(the open failure, silently) - plans are now matched by file name, which the store keeps unique per
date and kind; and the candidate `browser` cell accepted only a bare `yes`/`no` while the wave-table
reader accepted a leading word, so `yes - drives the app` would have derived - both now share
`browserWord`. Both pinned in the test file.

`simplify: inline` - the simplify skill returned fan-out instructions. One finding applied:
`runningRows` re-derived newest-record-per-branch with a timestamp comparison `joinDurations`
already makes, so `joinDurations` now carries `plan` (additive) and `runningRows` filters its rows
directly. Skipped: putting the browser need in the backlog item's front matter, where the other
candidate fields come from - the right depth eventually, but it is the owner-receipt format and
its own change.

`verify: inline` - `npm run build` exit 0 read from the build's own status, three times (before
the check, after it, and after the relay below), `fail 0` in the test leg, every gate green. No
product code changed, so no e2e leg. `taste: not applicable` - nothing here can move what a
graphic looks like.

## The relay: eight strayed reports, judged before queueing

Every fan-out agent the check spawned reported to the orchestrator, who relayed them unjudged.
Read before `queue-merge`, as the relay asks. Taken:

- **The path comparison, measured twice.** `path.resolve` keeps drive-letter case on this box, and
  `wave-launch record` stores `--plan` verbatim after a case-insensitive `inStore` check, so a
  record could be written in a form the instrument never matched, emptying the running set - the
  open failure. Chose a file-name match over the suggested `samePath`, and this is why: the
  record's path is always the store's, the name is unique per date and kind, and the one case the
  two differ on is an operator pointing at a copy of the plan somewhere else, where a name match is
  the right answer and `samePath` would empty the set again. Legacy `plan: null` lines (all 28 on
  this machine) are matched by the wave's window rather than the borrowed 48-hour constant.
- **A freshly launched row was invisible.** `scanActivity` returns nothing for a worktree with no
  diff, so the instrument dropped a row for exactly the minutes the bad picks happened in. Running
  is now branch existence, not activity.
- **`toQueueMin` counted a landing that gave up or was withdrawn as queued forever.** Now
  `landingStateFor`, restricted to jobs after the launch, and both states leave the row running.
- **Two readers of the planner's yes.** One `browserWord`, shared with the plan check, stripping
  backticks and bold; the plan check refuses any other spelling in either table.
- **`\bbrowser\b` on MINTS matched a path or a negation.** A whole-token grammar over `mintsOf`.
- **The relaunch defect** the Altitude agent named is the open sibling backlog item; closed here.
- **The caution fired for rows not yet due** and after a row landed; now only for rows due `now`
  with no record carrying their letter.
- **The closing line read as the horizon verdict** when the slot was why; it names the slot now.
- **night.md lost the H and I clause** that carried the collision rule's evidence; restored.
- **The tick's pointer named a phrase night.md does not have**; it is `three-signal test` now.
- **The backlog item cited the store file**, which is designed to disappear; the facts are in its
  own evidence section now, and it carries the optional front matter its sibling had.
- `parseCandidates` and `parseWaveTable` were two copies of one table walker; `tableUnder` is the
  one, exported from `wave-plan-check.mjs`.

Overruled, in writing:

- **"The queue already owns the browser slot."** It serializes SCRIPTED browser jobs (`npm run
  queue`, `COST.browser`). All four bad picks were rows driving the browser BY HAND - reproduce in
  the running app, a rendered measurement - which no process table shows as a job, and which is
  what the wave table's `browser` column has meant since `collisions.md` priced a browser-driving
  session at a full slot. So the plan is the right source, and the cost the agent names (a row
  holding the slot for hours around one six-minute suite) is the closed direction, accepted.
- **"Ship the CI leg or demote the alarm."** The alarm exists for a failure that happened three
  times on 2026-08-30 and demoting it hides the one night it is right. The CI leg is its own unit
  with its own failure semantics and is filed with the measurement; the honest wording is what
  fits this row.
- **"Make `browser` a required column."** That is the explicit-column shape, whose forgotten cell
  fails open; derive-by-default with a checked override keeps the closed failure. The plan check
  now validates the values, which is the part of that suggestion that was right.

Not mine to fix but worth saying: **the first day wave this hold met had recorded none of its
rows.** Three of today's branches, this one included, were running with no ledger line. The hold
is exactly as good as the recording, and the caution line is what says so out loud.

## Judgements taken, so they can be reverted

- **Directories in `TOUCHES` without a trailing slash.** The night's candidate table wrote
  `src/templates, src/render` and `collision-check`'s `matchesOwned` reads a bare path as an exact
  file name, so those cells matched nothing by file (the spec side still caught the collisions).
  Not this row's file; noted for the planner and for whoever next touches `collision-check`.
- **No owner-queue item.** The only reader of this instrument is the night loop, and a technical
  problem is never the owner's (2026-09-04 ruling).
- **No `npm run learn` rule.** The mechanism is in the code and the one contract sentence is in
  night.md where its reader looks.
- **The `unrecorded` caution is per run, not once.** The instrument is run per refill, not per
  tick, so a repeated caution is a reminder rather than noise; if it starts reading as noise, it
  belongs behind the same seen-set the tick uses.

## What is left

- The CI leg above, filed.
- `night.md`'s three-signal test still names the transcript mtime; the `.output` mtime the
  orchestrator reached for is not the transcript and froze for 95 minutes on a live row. The
  backlog file carries it; the sentence belongs beside the signal in night.md.
- Row M's second precondition that night ("cannot run while the wave is running", a measurement
  the wave's own load would confound) is not a slot and this row did not model it. If it recurs,
  a candidates-table `needs-owner` or a `holds-until` cell is the shape, and it should fail closed
  the same way.

## Pointers

- `scripts/candidates.mjs`: the header carries the decision; `needsBrowser`, `waveRowHoldsBrowser`,
  `waveSpan`, `belongsToWave`, `runningRows`, `heldBrowser`, `unrecordedBrowserRows`, the ledger
  and slot arms in `evaluate`, and `holdLine`.
- `scripts/wave-plan-check.mjs`: `tableUnder`, `mintsOf`, `browserWord`, and the two browser-cell
  checks in `checkPlan`.
- `scripts/candidates.test.mjs`: the four-bad-picks replay, the relaunch hold and the override tests.
- `scripts/wave-tick.mjs`: the FINISHED-LOOKING line; `scripts/wave-tick.test.mjs` pins it.
- `docs/backlog/finished-looking-needs-a-ci-leg.md`.
