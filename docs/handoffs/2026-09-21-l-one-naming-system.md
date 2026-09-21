# Handoff: one layer-naming system for every graphic (row L, 2026-09-21)

Branch `claude/l-one-naming-system`, worktree `.claude/worktrees/agent-a154e872eb00f02fc`.
Owner receipt and the system itself: `docs/backlog/one-layer-naming-system-for-every-graphic.md`.
Owner walk: `docs/acceptance/owner-queue/2026-09-21-l-one-naming-system.md`.

## The system

Three layers in every example, in the same order from the top of the Layers panel: `Text` (what
the operator types), `Moments` (what NoaCG shows, hides or moves: hidden groups and bars drawn
full), `Board` (what stays as drawn). A name is a word and a row, the row LAST: `Answer A`,
`Selected A`, `Score 1`, `Winner 2`. The quiz counts in letters, every other type in numbers. A
moment is a hidden group. A label is `static:`. Spelling is free (capitals, spaces, underscores
and dashes are one separator; synonyms, Finnish and now Swedish words are read), the examples are
strict. The quiz moments are taught as `Selected A`, `Correct A`, `Wrong A` (row last, like every
other type) instead of `A selected`; the matcher already read both, so old files import as before.

Measured on Illustrator 2026 through its own scripting: all six example files open with exactly
the names, the hidden state and the order the docs trees draw (as three groups inside Layer 1).

## What landed

- `public/docs/examples/`: six files, one per type, three layers each, every plate and label
  named (`Row A`, `Panel`, `Track 1`). The two lower-third variants and their pictures are gone.
- `docs.html`: the Layer names page opens with the system, one full tree, and a table of every
  name the importer reads, GENERATED from `words.json` by `scripts/behaviour-docs.mjs` between
  `<!-- behaviour-words:start/end -->` markers; `npm run build` fails when it drifts. The
  generator joins with the page's own line ending, because docs.html is CRLF on Windows and a
  bare-newline block read as stale after every editor touch. Each type page shows its tree.
- `words.json`: the three quiz `teach` spellings, and Swedish plus a few English synonyms for the
  four documented types. Cross-type reads were listed before and after (a scratch script over
  `matchesRole`): every new one is the same role in a sibling type, the pattern the English words
  already follow. `docs/backlog/more-trigger-words-and-languages.md` is the standing door.
- The importer (`svgImport.ts`): a one-letter text is `drawing` unless named `f:`; a group that
  wraps one unnamed text and nothing drawn is not a moment candidate ("Question 2"); the no-size
  error names Save a Copy.
- The wizard: furniture rows listed last, and a one-letter text the proposed behaviour WRITES (a
  puzzle's tiles) stays ticked (`pollDrivenLayers(proposed)`); unticking asks nothing and says
  "stays as drawn" with "take it off the artwork" one press away (the 2026-09-02 dialog is gone,
  newer ruling wins); the box heading's swatch is a round dot after the name; a type with hidden
  moments to bind in a file with no hidden layer is told about Export As
  (`map-svg-hidden-missing`); the graphic is named after the dropped file until Finish is given a
  name (`fileName` rides on `SvgImportResult`; the Finish contract's blank-falls-back rule is
  untouched); the drop step's help teaches Save a Copy, its chip is "Exporting the SVG", its note
  says what happens next.
- `docs/SVG_AUTHORING.md` section 1, 6 and 6b now teach Save a Copy; two corpus sidecars name
  the legacy exporter.

## Row H's collision, and the fixture that keeps its walk alive

Row H (PR #364, `claude/h-quiz-question-wraps`) adds a walk to `e2e/import-svg-behaviour.spec.ts`
that imports `public/docs/examples/quiz-lower-third.svg`, which this branch deletes. The
lower-third shape (a question band above two rows of two answers) is what H's wrap walk
measures, so the file lives on as `e2e/fixtures/illustrator-quiz-lower-third.svg`
(`f7c95961`), byte-identical below its header. **Whichever of the two lands second repoints
H's `DOCS_QUIZ_LT` constant at that fixture path**; the edit is one line in H's spec and this
handoff says so because H is finished. At the time of writing #364 was still BLOCKED on its CI
(18 checks pending, the Catalog calibration gate red), so it had not landed and could not be
taken in; `origin/main` at `f54c182f` was merged (`89ef55bb`) and touched none of this row's
files. No spec on main points at either deleted file.

## Measured in the wizard after the change

A scratch Playwright look (not a gate) at the Fields step on `quiz.svg` and on an Export As
shaped quiz with unnamed one-letter tiles: the letters list last and unticked; the Export As note
shows on the second file and not on the first; the box heading's dot sits after the name; the
unticked row reads "stays as drawn" with the removal link beside it. It also showed the row
plates headed "Black plate 1" to "Black plate 4" beside a file that names them `Row A` to
`Row D`: a box name needed a four-letter word to count as readable (`stageMeasure.ts`,
`isReadableBoxName`), fixed at three (`9d41bd6a`) and the docs pictures re-shot after it.

## What is left, and why

- **Item 7 from row E's list** (two "+ New graphic" titles differing by a dash in
  `src/components/home/ProductionPage.tsx`) is not this row's file and was not touched.
- **`docs/svg-samples/`** does not follow the system; its README now says plainly it is a design
  gallery and points at the teaching set. Converting 23 files is a separate row if wanted.
- **The name-from-file rule infers "the file gave this name" by string equality** with the
  previous file's stem rather than storing a flag. A reader who types exactly the stem and then
  swaps files gets the new file's name; that outcome is acceptable and it saved a draft field.
- **Owner question, one, already applied:** the quiz moments are spelled `Selected A` rather
  than `A selected`. The alternative was to move the row FIRST on every other type. To revert:
  three `teach` values in `words.json`, `npm run write:behaviour-docs`, rename the groups in
  `quiz.svg` and the two trees on the docs page.

## Verification

Filled in at the end of the session; see "The check" below.

## Traps not in any repo file

- **`node scripts/docs-shots.mjs` needs this worktree's dev server up** (port from
  `node scripts/dev-port.mjs`, started with `node scripts/dev-worktree.mjs`); the queue refuses
  the job otherwise, with the reason in its record. The e2e jobs start their own server.
- **Do not edit `src/` while a queued Playwright job runs against this worktree**: Vite reloads
  the app mid-test. Two tests failed that way on the first run (a Next button never enabled, a
  layout table missing) and passed unchanged on the re-run.
- The Edit tool rewrites `docs.html` with CRLF; a generated block joined with `\n` then reads as
  stale to `behaviour-docs.mjs --check`. The generator now joins with the page's own EOL.
- The sandbox refuses a Bash line that runs `powershell`, a python heredoc, or a `for` loop over a
  shell variable; use the PowerShell tool and plain commands.
- Illustrator through COM: `New-Object -ComObject Illustrator.Application` and
  `DoJavaScriptFile(<jsx>)`, with the JSX writing its log line by line; the six files took under
  two minutes with no modal.

## Commit pointers

`5da3a41c` the system, the examples, the docs page, the wizard and the specs; `41b0fca2` the
Swedish and synonym words; `63a79552` the name-from-file default; `8cf7f99a` the review's
fixes; `cc55b105` the simplifications; `059271d0` the re-shot docs pictures; `f7c95961` the
lower-third fixture for row H; `89ef55bb` main taken in; `9d41bd6a` the three-letter box name.
