# 2026-09-10 - the deck and the demo doc (row CA)

Branch `claude/ca-deck-and-demo-doc`. Gap-list row 13 was closed from our side. The deck at
`docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` now says what `docs/DEMO_2026-09-25.md`
says after the owner's three calls of 2026-09-10. The demo doc's A4 and A6 cells now match the
real CasparCG runs of the same day.

## What is left, and why

- **The owner's walk of the deck.** It is his, and the reason is taste: `docs/acceptance/owner-queue/2026-09-10-ca-the-deck-now-ends-at-our-own-player.md`,
  which is §7 row 13, now UNSEEN (eyes). He has never opened the deck. A rebuild cannot tell
  anyone whether the slides are good.
- **G2, the two one-page indexes** (§7 row 12, the week of the 22nd), and **how a finished
  take-home file comes back** (§7 row 17). Slide 7 names both pages, and slide 4's notes name the
  hole. Neither page exists yet.
- **A6, one press of Put on air from `https://noacg.studio`** (§7 row 10, now PARTLY). The
  browser's Local Network Access prompt needs a person, so nothing here can do it.
- The deck's original walk item, from 2026-09-09, was folded into
  `docs/acceptance/owner-queue/2026-09-10-ca-the-deck-now-ends-at-our-own-player.md` on
  2026-09-11, with its surviving question, so the owner has one deck item to walk.

## Decisions taken here, each one revertable

- **A4 is WORKS on a screen consumer, and §7 row 2 is closed.** The beat's own sentence is "load
  the output URL by hand", and that ran on a real 2.3.2 and a real 2.5.0. What a screen consumer
  cannot prove is SDI, a Decklink and the venue's network. That keeps the §8.7 acceptance line
  unticked, but it does not keep the beat open. A6 stays PARTLY: on 2.3.2 it got `202` with an
  empty channel, and it has never been pressed from a public origin.
- **§7's rule now says what NOT ON THE DAY means.** It is not a status and never earns a row. A3
  had to have its cell restated as UNSEEN (box), because the rule would otherwise have orphaned
  row 3.
- **The deck's other playout targets stay on slide 6 as NOT TODAY**, the two cautions on slide 4
  share one panel, and slide 7's label reads "in the same 10 min" so the labels add up to 90.
  The owner-queue item says how to undo each one.
- The deck's slide 1 changed a little too. The subline no longer promises the room's hardware,
  and the notes carry the new clock. That was outside the letter of "slides 3, 5 and 7", and it
  was the same contradiction.

## Traps that live in no other file

- **The slide numbers in the backlog item and in the old §7 row 13 were wrong.** Road 1 is slide
  4 and on air is slide 6. Only the close, slide 7, was right. Go by `newSlide(n)` in the
  generator, never by prose.
- **LibreOffice ignores `PageRange` on PNG export** and always writes slide 1. The way round it is
  a copy of the deck holding one slide, which the presentation README now describes. The Bash
  tool also refuses `soffice.exe` by quoted path or by variable, because it cannot prove the
  command is not git. Use the PowerShell call operator: `& "C:\Program Files\LibreOffice\program\soffice.exe" ...`.
- **pptxgenjs 4 writes an `<a:pPr>` before every run of a multi-run paragraph**, across the whole
  deck, slides 1 and 5 included, which are unchanged since 2026-09-09. The schema allows one.
  PowerPoint has not been seen to complain, and nobody here has opened the deck in PowerPoint to
  check. A paragraph option therefore goes on a paragraph's first run, so it lands in the
  `<a:pPr>` a strict reader keeps. `step()` and slide 7 do that. This was not fixed deck-wide,
  because it is the library's output and not this branch's.
- **The build log contains the word "failed" in passing test names**, for example "a failed
  execution ledgers ...". Read the build's own exit code, as the root rule says, and never grep
  the log for failure.

## Evidence

- `npm run build`, exit 0 by its own code, on the source before and after `/check`. CI run
  `34569520118` on `5720688b` passed: Factory gates, E2E plan, Build and the CI gate ran. The E2E
  shards were skipped because the plan mapped a change that touches only docs to no specs.
- The built deck was checked two ways. There were 23 text assertions over the slide and notes
  XML, and all passed, including that slides 2, 3 and 5 are byte-identical to the previous deck.
  Slides 1, 4, 6 and 7 were rendered through LibreOffice and looked at. Three panels overflowed or
  under-ran, and two panels set their body text at a different inset from their head. Only the
  render showed any of that. All five are fixed.
- The delegation went to Codex `gpt-5.6-sol` at high effort and is graded `repaired` with cause
  `prompt` in the outcome ledger. The copy and notes landed verbatim, and the geometry needed
  four repairs. The spec gave a width heuristic that was wrong and no render step. The next deck
  spec should require the single-slide render.
- `/check`: review was `delegated`, with 5 findings and 5 fixed, and its scope was checked
  against base `0634d6bd` and the same five files plus the deletion. Simplify was `inline`,
  because the skill returned fan-out instructions; it found 1 thing and fixed 1 (`foot()` reused
  for slide 4's guide line). Verify was `inline`: the build, the XML checks and the renders.
  Taste is not applicable, because no product graphic moved. `check: run`.

## Needs the owner

Only the walk, and the reason is taste. Nothing here needs money, an account or anything past
`main`.
