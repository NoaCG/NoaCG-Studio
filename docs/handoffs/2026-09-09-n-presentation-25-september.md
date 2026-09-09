# Session N - the HTML deck that was built, verified, and then withdrawn

**Branch:** `claude/n-presentation-25-september`, from `origin/main` at `ffadb42e`. What lands is
this handoff and nothing else: `git diff origin/main` on the branch is empty apart from it. The
history carries the HTML deck at `77376353` (seven cards, presenter notes, bundled fonts) and its
stylesheet cleanup at `237e612b`; `ff9b4ce5` removes both after taking `main` in.

## What happened to the row

The prompt asked for a self-contained HTML presentation under `docs/presentation-2026-09-25/`.
I built it, opened it from a `file://` URL through Playwright, looked at all seven cards at two
widths and on paper, fixed four layout defects, ran the build green and pushed. Then the relay
brought the owner's word: a presentation should open and edit in PowerPoint or LibreOffice. Row S
built the deck as a `.pptx` on my card order (pull request 198), row AA repaired four defects in it
(pull request 199), and both are on `main` in the same directory. Two files claiming to be the
presentation is the drift `docs/README.md` exists to prevent, so the HTML version does not land.

Taking `main` in conflicted on `docs/README.md` and on the directory's `README.md`; both resolve
to `main`'s text, which describes the `.pptx`. The merge is `8bf7ea07`.

**No owner-queue item from this row.** Nothing observable lands. The deck's item is S's, filed
with pull request 198.

## What was built, so the thinking is on record

A follow-along session, not a demonstration (script §0, call 1), so the deck was seven cards the
room looks at only at the boundary of a section: what NoaCG is (four sentences, each with a row in
`docs/PROMISE_AUDIT.md`), the one picture of the two roads meeting in the library, one card per
section with what the room does now and where the guide is, and the close. Presenter notes behind
`N` named the script row and the status date behind every claim; the cards themselves carried no
status vocabulary. The measured 24.8 s sat on the coding-agent card with its date, and the untimed
leg from the library to air was stated beside the number rather than sold as "minutes to air".

Verified from the file, not a server: Playwright opened the `file://` URL and logged exactly four
requests (the page and its three fonts), all three brand faces reported `loaded`, no console
error. Seven cards were read at 1600x900 and 1366x768 and the print rendering was read in full.
Four defects were found by looking and fixed: the coding-agent card overflowed its bottom edge at
both widths, "24.8 s" broke across two lines, two sublabels in the picture ran past their boxes,
and the print fallback kept the dark palette's pale text on white paper.

S read the draft for its order and its lines and kept them; AA then fixed things in the `.pptx`
that my deck had wrong too, which is the part worth recording:

- **My road-1 card ended "Create, then Finish: add it to a production"** and said the upload road
  is "on the last screen before Create". Both came from the script's R1.5 and R1.6 as they read
  that morning, and both were wrong: `Create project` is a door that saves nothing, and the
  Typefaces row is on the Fields step, two screens earlier (`2026-09-09-aa-deck-repair.md`).
- **My coding-agent card said `validate` is "the only verb that opens a browser".** Every bridge
  verb launches one; `validate` is the slow one for what it does inside the browser. I took the
  sentence from `docs/AGENT_CLI.md` without reading `BridgeClient.connect()`.

I read `make-deck.mjs` on `main` line by line against my cards after the withdrawal. Every line
and every note of mine is carried or improved there: the "YOU" chips and the export branch on the
picture, the "Say it before they ask" pair, the number with its honest edge, the four targets
with Connect and the OGraf-controller beat kept off the slide. I have no slide to add and no line
to move.

## Two things that transfer to any future HTML artifact in this repo

Both came out of the simplify report that reached the orchestrator instead of this session, and
both match what I had written, so they are stated here as my own:

1. **A print stylesheet should redefine the tokens once, not re-colour selectors.** Mine
   re-coloured a dozen selectors with `!important` and still missed the arrowheads, because a
   literal hex colour inside an SVG `<marker>` is not reachable from any rule set. Define
   `--void`, `--paper`, `--amber` and the rest under `@media print` and draw every colour,
   markers included, from a token.
2. **A key map has one source.** Mine was written three times, in the head comment, the `?`
   overlay and the handler, and the handler quietly accepted `Enter` and `Backspace` that neither
   list named. Keep the map as one array and render the overlay from it.

## The browser question, in my own words

The wave table gave this row `browser:no` and the row's deliverable was a thing meant to be
looked at. From inside the row it read like this: the Browser pane refuses page tools on a
`file://` tab outright, so an offline artifact can only be looked at through Playwright from a
Node script, and that script had to import Playwright from the primary checkout's `node_modules`
because a linked worktree carries none. I saw no long wait myself, but the timestamps do: the
fonts were copied at 12:31Z and the first CI run started at 15:31Z, so three hours passed inside
one tool call, and the relay says a permission prompt held it.

My view for the prompt rules: a row that builds a visual artifact gets the browser, and for a
`file://` artifact the prompt should name the Playwright route and allow `node` on a scratchpad
script up front. "Verify by reading the markup" is not verification of something built to be
seen. My four layout defects were found by looking and could not have been found any other way,
and the five reviews of S's deck found their defects by looking too. The alternative contract,
never navigate, would have shipped my card 5 with its last line cut off.

## /check

Scope: `git diff ffadb42e...HEAD` in this worktree, branch `claude/n-presentation-25-september`;
after the merge the effective scope against `origin/main` is this file.

- `review: inline`. The code-review skill returned a partial result with a promise of more from
  agents still running, which `check.md` classes as not run; its verified points were used as
  extra evidence (the `#svg-rules` list has five items, the SPX export ships `controlpanel.html`,
  the driver's keys and hash behave) and the diff was read here: each card line against its beat
  row, the driver for defects. The three content errors above were not caught by this read; AA
  caught them in the `.pptx` by reading the source.
- `simplify: inline`. The skill returned fan-out instructions. Its report later reached the
  orchestrator with six findings; one overlapped what I had already changed (the sibling margin
  rule undone by two grids), the two transferable ones are recorded above, the rest die with the
  file.
- `verify: inline`. `npm run build` exit 0, read from its own exit line, on the deck, on the
  cleanup, and on the merged tree with this handoff. CI on `77376353`: `Build`, `Factory gates`,
  `E2E plan` and `CI gate` ran and passed; the E2E shards, `Reviewed`, Vercel, the catalog gate
  and the after-gate jobs were skipped, the honest plan for a docs-only push. The run on the final
  tip is read to a verdict before queueing and named in the stamp.
- `taste: answered` on the withdrawn deck (the four NOs above, all fixed and re-read); not
  applicable to what lands, which is prose.

## Safe to archive

Yes, once landed. Nothing uncommitted, the relay is read and acted on, no owner receipt served
(`owner-receipts.mjs --serves` reports none).
