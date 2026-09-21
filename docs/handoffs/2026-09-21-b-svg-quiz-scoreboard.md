# B - the SVG quiz and scoreboard, walked from real Illustrator output to air

Branch `claude/b-svg-quiz-scoreboard`, worktree `.claude/worktrees/agent-a23657a4ed535b696`.
Queued through `/queue-merge` at the end of the session. Owner walk:
`docs/acceptance/owner-queue/2026-09-21-b-svg-quiz-scoreboard.md`.

## What was walked

Four graphics went through import, Fields, behaviour, Finish, a production, Take and the
behaviour's own buttons, with a long value typed at the end:

- `e2e/fixtures/svg-corpus/illustrator-save-as-quiz-board.svg` (new). An Illustrator Save As
  export with an internal DTD, an SVG `<font>` subset, a CDATA stylesheet, a picture placed by
  its transform, hidden layers as inline `display:none`, a two-line question and a hand-kerned
  answer.
- `e2e/fixtures/svg-corpus/illustrator-scoreboard-lower-third.svg` (new). An Export As
  scoreboard drawn as a lower third on slanted `<polygon>` plates, with embedded crests, two
  hidden goal flashes and a period split at the Ä.
- `public/docs/examples/quiz.svg` and `public/docs/examples/scoreboard.svg`, the files the live
  docs hand out (per the orchestrator's scope note). Walked and pinned. Not edited, since row F
  owns them.

The CDATA stylesheet, the DTD and the SVG font caused no fault. No console errors on any walk.

## Fixed, each pinned by a spec in `e2e/import-svg-behaviour.spec.ts`

1. **Run-styled text lost its look on the first update** (`src/assets/svgImport.ts`,
   `hoistRunStyle`). Illustrator puts the class on each `<tspan>` and none on the `<text>`.
   `update()` replaced the runs, so "Tampere" drew at 16px black and read as three dots in the
   wizard preview. "2. ERÄ" did the same. The classes and attributes every run shares now move
   up to a class-less `<text>`. The review caught my first version, which COPIED them: that let
   stylesheet order pick the colour and doubled a non-inherited opacity. Commit `4db9a910`.
2. **A slanted `<polygon>` plate was not a box.** The Fields step called both club names "no box
   of their own", while the runtime was measuring their room against that polygon. The panel
   inventory now reads a polygon as the closed path it is. The growth runtime
   (`src/templates/importedDesign/svg.ts`, `svgShiftPoints`) widens it by its corners and keeps
   the slant. `docs/SVG_AUTHORING.md` and `docs/SVG_IMPORT_PLAN.md` now say so.

## Left as it is, and why

- **Live-text letter tiles become operator fields.** On the Save As quiz, A to D arrive ticked,
  called "Letters", "Letters 2" and so on. That is the §3 promise: live text becomes a field.
  The docs example avoids it with `static:` names. Untick them or name them `static:`. I left
  the rule alone, and the owner-queue file asks whether it should change.
- **The docs example quiz's long question shrinks rather than wraps.** Twice the drawn length
  lands on one line at 27.5px, the 55% floor, although the board has room above it. That is the
  ladder working as ruled. The question is composed against the top of its box, so the space
  above counts as margin. It fits and nothing overflows. Worth an owner look if he wants long
  questions on two lines.
- **The Fields step repeats a box heading.** On the docs example quiz, "Rows 1" appears once for
  the `static:` letter and again for the answer on the same row, each with its own grow select.
  The code's comment says this is deliberate: groups are runs in document order.
- **A name with a crest drawn beside it never grows.** That is the PENNED rule, working as
  written. The club plates on the lower third shrink their names rather than widen.

## For the owner

Nothing needs an account, money or identity. The two observations above are taste calls.

## Traps no repo file holds

- **Edit nothing under `src/` while a Playwright job runs against this worktree's dev server.**
  Vite hot-reloads the app mid-test. A flash assertion failed that way once and passed unchanged
  on the next run.
- The worktree sandbox refuses a Bash command that mixes a shell variable with `sed`, `node` or
  `cat`. Spell the paths out.

## Verification

- `npm run build`: exit 0 at `4db9a910`.
- `npm run test:e2e:integration` after taking main in: 1144 passed, 1 failed. The failure was
  `counting-settle.spec.ts` (canvas), which stopped at its 180 s timeout inside a catalog sweep
  unrelated to SVG import. Re-run alone, the unchanged spec passed 5 of 5. It is a
  timeout under a full machine, not a defect.
- Check: review delegated (2 findings, 2 fixed, scope compared and matched: 10 files, base
  `21d8d481`), simplify inline (1 cleanup: the path and polygon growth branches share one body),
  verify inline. Taste was answered from the walk's own frames of both graphics in the Fields
  step, Finish and program. Tampere and ERÄ now render in their drawn type, and every line sits
  inside its plate. The corpus sweep's `--shots` run was cancelled for queue time and not
  replaced.
- The six new walks and the whole import family (behaviour, svg, corpus, student rehearsal,
  sticker sample): 150 passed before main was taken in.
- No change to `src/templates/behaviours/naming.ts` or `words.json`, so the layer names the
  importer reads are unchanged.

## Commits

`aa505352` (the run-style and polygon fixes and both fixtures), `2af46a14` (the docs example
walks), `e98c0791` (main taken in), `4db9a910` (the review fix and the shared growth body).
