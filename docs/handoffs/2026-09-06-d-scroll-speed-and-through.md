# Scrolling speed, and the scroll that runs all the way through

Branch `claude/d-scroll-speed-and-through`, 2026-09-06. Serves the owner walk of 2026-08-28
(`docs/backlog/scrolling-speed-and-through.md`), which had stood eight days: "anything with
scrolling graphics should have a speed setting in the control panel, and the scroll runs all
the way through by default".

**Not pushed, not queued** - this ran in a Claude Code cloud container with no CI and no landing
queue, so the orchestrator integrates it.

## What the roll did before, measured

cr01 at 1920x1080 with its own sample list: the viewport is 1075px tall, the track 1181px, and
the `.credits-end` block is 297px tall sitting 884px down it. `creditsRoll()` travelled to
`y = -(1181 - 1075/2 - 297/2) = -495` and stopped, which parks the closing block in the middle
of the frame with the tail of the names above it. The crawl did the same along x, stopping with
the last item still in the strip.

## What changed

- **The travel runs the LIST off the frame.** The roll now measures to where the closing mark
  begins and travels until that point reaches the top of the viewport; the crawl does the same
  along x. Then `creditsEndBeat()` parks the track so the mark is centred and fades it up over
  0.8s. The reel (endless by contract) and the static board are untouched.
- **The speed is an operator field**, appended last so the logo keeps `f2`: a `number` titled for
  what the design does (`Scroll speed (%)` / `Crawl speed (%)` / `Page speed (%)`), in percent of
  the pace the design ships at, defaulted to 100 so an untouched graphic plays exactly as before.
  `creditsSpeed()` clamps to 10-400 and reads blank, zero and nonsense as 100, so nothing an
  operator can type leaves a roll running forever. It lives in a hidden `.noacg-data-source`
  holder and applies from the next take, because that is when the travel is measured. The static
  board emits no field at all.
- **The closing pose is an attribute on `#credits-track`** (`data-credits`), not opacity on the
  rows, because `update()` re-renders every row: an operator correcting the year with the mark on
  air would otherwise bring the whole credit list back on top of it.
- Everything is measured as **rect differences on screen**, never from `offsetTop` /
  `clientHeight` / `scrollHeight`. The first heading's top margin collapses through the track, so
  offset arithmetic parked the mark 50px low; asymmetric padding on `.credits-end` (cr01 breathes
  60px above the hairline and 15px below) put it another 22px low. Both are gone - the mark's
  visible centre now measures 0px off the frame's centre on cr01 and cr13.

Files: `src/templates/endCredits/{creditsMotion.ts,shared.ts,creditsPresets.ts,AGENTS.md}`,
`e2e/end-credits.spec.ts`, `e2e/AGENTS.md`, `docs/END_CREDITS.md`,
`docs/DYNAMIC_MOTION_SCOPE.md`, `e2e/catalog-baseline.json`, `scripts/copy-baseline.json`.

## Verification

The container turned out to have a Chromium (`/opt/pw-browsers/chromium-1194`) that Playwright's
pinned revision could not see. Copying it to `/home/user/pw-local` under the revision Playwright
expects and running with `PLAYWRIGHT_BROWSERS_PATH=/home/user/pw-local` made the whole browser
half of the gate available, so this branch is measured rather than reasoned about.

- `npm run build` - green, stamped on this branch.
- `e2e/end-credits.spec.ts` - 10/10, including two new cases (roll and crawl) that assert the
  travel reaches at least as far as the list itself, the list is gone and the mark is up and
  centred within 2px at the end, the mark survives an `update()`, and 200% roughly halves the
  graphic while nonsense falls back. **Mutation-tested**: restoring the old stop point turns the
  roll case red.
- `e2e/anim-engine.spec.ts`, `e2e/images.spec.ts`, `e2e/package.spec.ts`,
  `e2e/motion-presets.spec.ts` - 33/33, including the measured-motion parity harness that
  compares the data-block emit against the legacy twin across two content lengths.
- `node scripts/check-catalog-emit.mjs` - PASS; `e2e/catalog-baseline.json` re-recorded, and the
  diff is the twelve credits designs and nothing else.
- Frames looked at: `scripts/taste-frame-review.mjs --only cr01,cr04,cr13` (it freezes the
  entrance, which for a roll is the list arriving from below - nothing my change touches), plus a
  screenshot of the pose this change actually moves, mid-roll and at the closing beat, on cr01
  and cr04. Answers in the report below.

**NOT run here:** the four catalog sweeps and the render baseline. `e2e/catalog-render-baseline.json`
is platform-bound to `win32` and its spec SKIPS on Linux, so CI will not catch it - but this
change moves what those twelve designs render, so **the next run on the recording machine needs
`UPDATE_RENDER_BASELINE=1 npx playwright test e2e/catalog-baseline.spec.ts`** and its diff should
be credits-only.

## What is left

- **Tickers.** The receipt is marked `advanced` rather than deleted, with the remainder written
  into it. Requirement 2 does not apply - a marquee travels `repeat: -1` and never ends, and the
  flip cycles forever, so there is no "through" and no closing mark to arrive after. Requirement 1
  does apply and is the same small patch as the credits one: append one `number` field in
  `src/templates/tickers/shared.ts` with a hidden holder, read it in a `tickerSpeed()` beside
  `motionSpeed()` in `tickerMotion.ts`, and multiply the marquee's 140 px/s and the flip's 3.2s
  hold by it. Left out only because this branch owned `src/templates/endCredits/`.
- **A settled roll now shows its closing mark, not a frame of names.** Every surface that shows a
  graphic without a playback gesture parks it at the end of the finite motion
  (`preview/settleGraphic.ts`), so the Browse card, the library thumbnail and the operator preview
  of cr01/cr02/cr11/cr13 are the logo + year rather than typography. That is the honest last frame
  of the motion the owner asked for, and the settled-coverage gate now measures painted pixels so
  it can still see an empty card. If those cards should show the roll instead, the fix is a
  mid-roll settle pose in the settle recipe, not in the templates - it is one decision for every
  travelling graphic, and it is recorded at the end of `src/templates/endCredits/AGENTS.md`.
- **A post-creation preset swap does not revisit the speed field** (the Inspector offers all five
  credits presets; none is `structural`). A board swapped to a roll scrolls with no operator
  field; a roll swapped to a board keeps a field that moves nothing. Neither is worse than before,
  and the fix is a decision about the picker - also recorded in that contract.
- The crawl's park is not re-centred when an `update()` changes the mark's width (26px on cr04).
