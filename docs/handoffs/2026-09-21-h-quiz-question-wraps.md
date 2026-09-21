# H - a long quiz question wraps above the answer rows

Branch `claude/h-quiz-question-wraps`, worktree `.claude/worktrees/agent-a74501bbce559213a`.
Queued through `/queue-merge` at the end of the session. Owner walk:
`docs/acceptance/owner-queue/2026-09-21-h-quiz-question-wraps.md`.

## What changed

Reproduced first. Both new walks failed on `origin/main` (`da821d84`): the docs example quiz put
an 81-character question on one line, and so did the lower-third quiz at 131 characters.

The cause: the question is drawn inside the board, over answer plates inside the same board. The
ladder read its vertical alignment against the whole board, where it sits at the top, and the
plates below kept their whole drawn gap, so it had no room of its own.

The fix, in `src/templates/importedDesign/svg.ts` (`svgOwnBand`, used by `svgAlignOf` and
`measureSvgRoom`): the vertical alignment and the D3 room are read in the band between the nearest
SHAPE inside the box above the line and the nearest below it. A text never trims the band, so the
2026-08-29 name-over-role ruling is untouched. A bottom line in a band a plate closes keeps its own
drawn bottom gap at the top where that is tighter than half a line. The Fields step mirrors it
(`ownBandOf` in `src/components/wizard/import/stageMeasure.ts`), because the review showed the
nine-dot grid would otherwise say "top" for a question the template centres.

Measured on air: `quiz.svg` gives 2 lines at 50px for 81 characters and 3 lines at 45px for 131.
`quiz-lower-third.svg` gives 1 line at 40px for 81 characters (it always fitted) and 2 lines at
26.2px for 131. `docs/TEXT_BOX_BINDING.md` has the table as D4.

I decided the shape-versus-text line after a blocking design consult. The other options were
"only where the box has no growth row", which ties the drawing's reading to a toggle (rule 7), and
"text too", which breaks the name-over-role ruling.

## Left, and why

- **The wrap is greedy, so the last line can be a widow.** The lower-third frame at 131 characters
  ends on "made of?". Balanced line breaking would look better on air. It is a change to
  `svgWrapLines` for every wrapped graphic, so it needs its own row and a corpus sweep.
- **A caption drawn as live text under a question** ("Question 3 of 10") still leaves the question
  no room, because text never trims the band. The nine-dot grid is the override. None in the
  corpus.
- **The grow-cap picture** (`growCapOf`, `inside: fit.box.height - 2 * fit.insetY`) now takes
  `insetY` from the band. That only differs on a box with plates inside that also grows, and no
  quiz grows. Worth a look if a growing strap with an inner plate shows an odd cap line.
- **Tail not done: letter tiles drawn as live text becoming operator fields.** It is a naming rule
  in the Fields step (outside this row's files) and it is a question the owner still has open
  from row B. Nothing here changes it.

## For the owner

Nothing needs an account, money or identity. One taste call is in the owner-queue file: at 131
characters the lower-third quiz question drops to about two thirds of its drawn size, because its
band is only 90 units tall. If he wants that board to grow instead, it would be a new rule, since
quiz boards do not grow under rule 3.

## Traps no repo file holds

- `node scripts/jobs.mjs` runs its command through `cmd.exe` on this machine. Set an environment
  variable with `set NAME=value&& npx ...` (no space before `&&`). `cross-env` is not installed.
- A job can report "failed" in `jobs.mjs wait` while its log ends "2 passed" (j-1648). Read the log.
- Worktree git commands must be plain and separate. A compound `git add && git commit` with a
  heredoc is refused by the isolation guard.

## Verification

- Reproduced red on main, then green: `import-svg-behaviour`, `import-svg-corpus` and
  `import-svg` together, 156 passed and 1 failed (j-1635, final product code). The failure was my
  own lower-third test asking for 2 lines where 81 characters fits one line on that wide board. I
  corrected the lengths, and both new walks passed in j-1648 and again in j-1654.
- `npm run build`: exit 0 at `125550a6`.
- Check: review delegated (4 findings, 4 fixed; scope compared and matched, 4 files, base
  `da821d84`, the wizard file was added after). Simplify inline (1 cleanup). Verify inline.
- Taste answered from frames of the program stage (j-1654, `NOACG_SHOTS`). The board question is
  centred between the amber rule and row A at 2 and 3 lines. The lower-third question is on two
  lines inside its band, with the widow noted above.

## First CI run, and what changed after it

The first queue attempt (PR #364, tip `24d0c833`) was refused on CI by three failures:

- **My lower-third walk read "madeof?".** That was the test, not the product. CI's face broke the
  line between "made" and "of?", and `toContainText` reads `textContent`, which joins the tspan
  lines with nothing between them. The runtime reads a block back line by line with spaces
  (`svgFitValue`), so the value was intact. The walks now compare the whole value read that way
  (`valueOnAir`), and assert the operator's field still holds the typed value. That pins "no
  space lost" wherever the break falls.
- **Catalog emit fingerprints and `catalog-baseline.spec.ts` said "emitted code moved".** Exactly
  one design moved: `svg01` (imported-design), its `js` hash only. That JS is the SVG fit runtime
  this row changes, so it was intended. No other catalog design emits it. I took `main` in first,
  then re-recorded with `UPDATE_CATALOG_BASELINE=1 node scripts/check-catalog-emit.mjs`. The diff
  is that one line in `e2e/catalog-baseline.json`.
- **`import-svg.spec.ts:2224` (followers of a growing panel) hit "Execution context was
  destroyed".** That is a navigation race. It passed on this laptop before and after (j-1635,
  j-1673), and it does not touch the fit.

Row L is deleting `public/docs/examples/quiz-lower-third.svg`, so the walk now imports a copy at
`e2e/fixtures/illustrator-quiz-lower-third.svg`. The owner-queue route and the D4 section point
there. After the fixes, `import-svg-behaviour`, `import-svg` and `catalog-baseline` gave 138
passed (j-1673).

## Commits

`125550a6` (the band, the wizard mirror, both walks, the docs), `24d0c833` (this handoff), then main taken in and the CI fixes above.
