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
cannot fail open either. Combining the two is genuinely better than either alone, not merely both:
they fail in opposite directions, and the override can only move a verdict from "held by
inference" to "the planner's word". The one open failure left is a planner writing `no` on a row
that drives the browser, which no instrument can check any more than a wrong `TOUCHES`.

**What is HELD comes from the rows that are running.** A planned row holds the browser when the
wave table's `browser` column says yes or its `MINTS` names the browser; a launched candidate holds
it when the same need rule says so (the third bad pick was `M` while candidate `L` held the slot,
and L is in no wave table). Running means launched in the ledger `wave-launch.mjs` keeps, not yet
queued, not landed, still seen by the activity scan, and belonging to this wave (a record naming
another plan, or older than a plan can live, is a leftover whose letter may have been reused). The
ledger is what `wave-horizon` already depends on, and `launch.md` already makes recording every
launch the rule. A wave-table browser row with no ledger line at all is printed as a caution with
the record command rather than held: a phantom hold that no landing can lift is the one closed
failure that is not cheap, so that is the one place the choice is loud-open.

Verdict order is collision, then slot, then window - by how hard the fact is.

## The test that would have caught the four bad picks

`scripts/candidates.test.mjs`, "the four bad picks of 2026-09-08": the night's wave table with G
as a browser row and running, the night's five candidates verbatim, 250 minutes remaining so that
L and M fit on time alone. L and M are held with `needs the browser ... held by G
(claude/g-import-name)`, O is held from its specs with the override hint in the reason, and the
pick is P. A second test replays the third pick, with L launched into the slot and no longer in
any wave table. A third gives O an explicit `no` and shows the pick moving up to it. A fourth
pins that a wave-table browser row that launched and has since landed is not reported as
unrecorded, because the first cut of this printed exactly that false caution on the real plan.

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
  `runningRows`, `belongsToWave`, `recordedLetters`, `heldBrowser`, and the slot arm in `evaluate`.
- `scripts/candidates.test.mjs`: the four-bad-picks replay and the override tests.
- `scripts/wave-tick.mjs`: the FINISHED-LOOKING line; `scripts/wave-tick.test.mjs` pins it.
- `docs/backlog/finished-looking-needs-a-ci-leg.md`.
