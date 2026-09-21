# O - does Out leave the picture in PROGRAM?

Branch `claude/o-out-clears-program`, worktree `.claude/worktrees/agent-a5330c049b142754d`,
forked from `ed4af16c` (G2's merge, PR #366). Rows E and G2 disagreed about whether Out leaves an
imported quiz or scoreboard painted in the production dashboard's PROGRAM monitor.

## Verdict

**Not a product defect. The picture stays only in a browser that renders no animation frames,
and the desktop app's browser pane, where row E walked, is one.** No product code changes.

## Evidence

The site served `ed4af16c` (`version.json`, built 23:22:52 UTC) for every run below.

1. **Reproduced in the pane, on E's own production.** The pane still held E's "Friday"
   production with E's imported Quiz board and Scoreboard. I took each one and pressed Out. The
   header read "nothing on air", TAKE re-armed, and the picture stayed in PROGRAM for 11 s on
   the quiz and 10 s on the scoreboard. That is E's symptom exactly.
2. **The pane runs no frames.** In that page, `document.visibilityState` was `visible` and
   `hasFocus()` was true, but a `requestAnimationFrame` loop counted **0 callbacks in 3 s**.
   Timers ran on time. The templates' exit is a GSAP timeline, so it waits for a frame that
   never arrives. `stop()` has run and the machine is already `off`. Only the fade is frozen.
3. **Forcing frames clears it.** Ten back-to-back screenshots of the quiz, then five of the
   scoreboard, each force one frame. PROGRAM was empty afterwards, with no other input.
4. **A browser that renders frames clears it in about a second.** I ran Playwright through the
   job queue (`j-1688`) against https://noacg.studio. It imported the docs `quiz.svg` and
   `scoreboard.svg` through the wizard into a fresh production, "O out test". That production
   lived only in the run's own browser context. I sampled each PROGRAM layer's root opacity,
   its machine state and its frame rate inside its own document every 0.8 s for 10 s after
   each Out. The runs covered the quiz alone after select, lock and reveal, the scoreboard
   alone, the quiz Out with the scoreboard still up (which stayed at opacity 1), then the
   scoreboard, and then All out with both up. In every case the layer was `off` at the first
   sample and at opacity 0 by 1.1 s. The frames ran at about 64 per second and the page had no
   errors.

This also explains why E saw the entrance play. A click and the screenshot after it force
frames, and E watched Out by waiting, which forces none. It is G2's reading ("the pane stopped
repainting"), now measured rather than inferred. One correction to that reading is that the
pane reports itself visible, so `document.hidden` does not reveal the problem.

`/output` was not opened, because publishing needs an account. It builds the same
`createOutputStage` over the same `composeDocument` and the same template, and OBS renders
frames continuously, so nothing here points at it. E's worry was the monitor, and G2's spec
already pins the monitor (`e2e/dashboard-operator-walk.spec.ts` reads opacity and state after
each Out).

## What changed

- A contract trap, `e2e/count-requestanimationframe-page-before-reporting-picture`, scoped to
  `docs/acceptance/**`, `docs/handoffs/**` and `src/components/home/**`. It tells the next walk
  to count frames before reporting a picture that will not leave. I recorded it with
  `npm run learn` and put the evidence in `contracts/records/e2e/`. The glob spans the root, so
  the line also compiles into the root `AGENTS.md`. The build and its gates passed with it.
- E's owner walk (item 1 of "Before you press") and G2's owner note now say the defect was the
  pane and that no workaround is needed. I added no new owner-queue file, because nothing
  observable in the product changed.

## What is left

- Nothing for Friday on this item.
- The pane also clears a viewport you set, as E noted. A walk in the pane can only be trusted
  for layout and copy, not for motion. Motion checks belong in Playwright through the job
  queue.

## Check

- review: inline. The scope from `scripts/review-request.mjs` was 7 files, base `ed4af16c`,
  all docs or generated contract files. I read every line. One finding was fixed: the rule
  claimed OBS clears in about a second, and OBS was never measured, so the rule now names only
  what was measured.
- simplify: inline. The skill returned fan-out instructions. Nothing in a docs-only diff needed
  simplifying.
- verify: `npm run build` exit 0 on `391e5cec` and again after the check's commit. No product
  code changed, so there was no affected e2e run. The live Playwright control is the behavioural
  evidence.
- taste: not applicable. Nothing here changes how a graphic looks.

## Commits

- `391e5cec` the rule, its record, the recompiled contracts and the two owner-note corrections
- the check's follow-up, which narrows the rule's wording to what was measured
- this handoff
