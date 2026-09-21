# G - reveal after reload

Branch `claude/g-reveal-after-reload`, forked from `da821d84`. Row C found a Reveal pressed from a
reloaded hosted tab that logged everywhere and never lit on air (Friday-critical).

## What it really was

The reload was not the cause. The retry trace of configured run 35633742370 showed the Reveal
reaching the renderer, which moved to `reveal` and lit answer A. Air had key A because tab A
picked key C and pressed Take in the same second. The hosted page's Take airs the SHARED staging
buffer, and a pick only reaches that buffer after the 400 ms typing debounce, the stage RPC and
the log round trip. The test clicks faster than that, and so can a student.

Fixed on this branch:

1. **A hosted Take airs what the operator sees.** The page lays its own staged edits over the
   shared buffer until the buffer shows them and no write of theirs is still in flight
   (`src/components/control/ownStaged.ts`, pinned by `scripts/hosted-own-staged.test.mjs`,
   mutation-checked). The first version settled by value alone. The code review found that
   C, B, C inside the debounce could air B, and the in-flight count closes that gap.
2. **Staging typed edits no longer gets lost.** A loaded entry, a data row, an event's adjust or
   a live-number bump used to cancel the debounce timer and drop the typing it held. Those edits
   now go out in the same write.
3. **`stageHostedData` throws on a refusal.** The RPC returns an error instead of rejecting, so
   every caller's catch was dead code.
4. **The hosted PROGRAM monitor restores the machine state after a reload.** It replayed a bare
   `play()`, and it did so once, from an effect. React StrictMode in dev builds the stage twice,
   so the replay landed in the destroyed stage. The chip read "Off" a second after the reload.
   The replay now runs from `PayloadStage` `onReady` on every fresh stage and uses the
   dashboard's recipe (update, snap to the reported state, update).
5. **The configured walk has its legs back:** Reveal from the reloaded tab lights C on the
   renderer, the dashboard monitor and tab B, and the state chip still reads Locked 3 s after the
   reload. A dashboard reload restores both layers, the score and the revealed quiz. After that
   come a later score press and Out from both tabs. `expect(errors).toEqual([])` is back.
6. A Windows EPERM flake in `scripts/claude-run.test.mjs` cleanup failed one of my builds. The
   cleanup now retries.

## Verification

- `npm run build`: exit 0 on the tip.
- Configured suite on this branch: run 35648343147 (commit 3aa7f01d) passed 51 of 51 with 0 flaky,
  and the walk passed on its first attempt. The later commit changes docs only. Two earlier runs
  failed on this branch and are what found fixes 4 and 5's wrong assertion: 35645497595 (chip
  "Off") and 35647135874 (I asserted the "selected" look after a reveal, which the quiz recipe
  drops by design).
- The dashboard reload on a published production needed no code change. The walk proves it.
- The hosted page cannot run offline, so the only browser proof is the configured suite.
  `configured-suite.yml` runs on push to main, not on pull requests. The dispatch runs above are
  the evidence.

## Check

- review: delegated (code-review skill, high). I checked its scope against the branch: the same
  base `da821d84` and the same six files, including the uncommitted doc. It raised one finding,
  the value-only settle, and I fixed it (fix 1). The commits after that pass (the in-flight
  count, the `onReady` recovery, the test flake and the spec assertion) I reviewed inline.
- simplify: inline. The skill returned fan-out instructions. I found one piece of doc wording that
  had drifted from the code and fixed it. I skipped removing the cue editor's own `echo`, which
  the overlay now mostly duplicates. Removing it changes how typing behaves, so it needs its own
  change.
- verify: `npm run build` exit 0, plus configured run 35648343147.
- taste: not applicable. No graphic's look changes.

## What is left

- **The orchestrator's scope addition (row E's "For row G" list) is NOT on this branch.** I
  queued this green fix first, as the orchestrator asked. I work the list in order on a
  follow-up branch: Out leaving an imported graphic painted in PROGRAM, Update after a reveal
  carrying the old verdict, Next after a reveal doing nothing, the score chip's machine words,
  the scoreboard editor's row labels, and the "+ New graphic" title dash. That branch has its own
  handoff.
- The hosted cue editor keeps its own `echo` beside the overlay. The two agree, but one of them is
  redundant.

## Traps in no repo file

- **The dev server runs StrictMode, and production does not.** Anything a page does once, from an
  effect, into an imperative child (a stage, an iframe) goes to the first instance of that child,
  which dev then destroys. Use the child's ready signal instead. A green production build proves
  nothing about it either way.
- **Read the RPC bodies in the trace before theorising.** `0-trace.network` holds every
  `control_send_many` and `control_output_report` body. The renderer's report of `f5: "A"` settled
  a day-long mystery in one grep.

## For the owner

Nothing needs you. The walk is `docs/acceptance/owner-queue/2026-09-21-g-reveal-after-reload.md`.
The workaround in row C's note is no longer needed.

## Commits

- 8491390b the overlay, the recovery recipe, the restored walk
- 12d579ac owner-queue item
- 03de8df6 in-flight tracking, `stageHostedData` throws
- f9c50c6b recovery on every stage build
- 16eaabc3 test cleanup retry
- 3aa7f01d walk assertion after reveal
- 77027dc2 doc wording
