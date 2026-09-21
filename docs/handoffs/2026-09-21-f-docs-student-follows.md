# Handoff: the Graphics docs a student can follow (row F, 2026-09-21)

Branch `claude/f-docs-student-follows`. Touches `docs.html`, `e2e/docs.spec.ts`,
`scripts/docs-shots.mjs`, `public/docs/examples/`, one owner-queue note.

## What was done, and how it was proven

The Graphics topic (Import an SVG, Prepare the file, Layer names, Quiz, Scoreboard) was read cold
first, and every stall point written down before any code was opened. Then a lower-third quiz and
a lower-third score were built in Adobe Illustrator 2026 (30.1) from the docs text alone, through
Illustrator's own COM scripting so the real exporters ran (`ExportType.WOSVG` is File > Export >
Export As > SVG; `ExportType.SVG` is File > Save a Copy > SVG), and every export was run through
the real importer (`importSvgMarkup`) and the real proposal (`bestProposal`) in a Chromium DOM.
The scripts and every exported variant are in this session's scratchpad, not in the repo.

Findings, each now a docs sentence:

1. **Export As drops hidden layers and hidden groups.** Twelve hidden moment groups and one
   hidden layer, gone from the file with no warning. The wizard still picked Quiz from the
   answers alone, so a student following the old docs would think they had done it right and get
   NoaCG's default highlights instead of their drawings. Save a Copy (the legacy exporter) keeps
   them as `.stN{display:none}` classes, which `svgImport.ts` already reads, and the check
   proposed Quiz with every selected/correct/wrong layer bound and Score with both Goal layers
   and Full time. The corpus files that claim to be Illustrator 28.6 Export As output carry prose
   comments, so they were hand-shaped; they match the legacy exporter's shape, not Export As.
2. **Without Use Artboards the export is cut to the drawing** (1600x250 and 760x120 files), which
   the wizard treats as a floating object.
3. **Font: SVG in the legacy dialog embeds glyph outlines** unless Subsetting is None (Use System
   Fonts): a 3.2 MB file otherwise. The docs row names the setting.
4. **Unnamed text objects take their layer's name, numbered**, and no type is found. Proved on a
   file whose text names had been lost (`Answers`, `Answers 2`, proposal null). A single text
   alone in a layer named Question is read as Question (the importer climbs to the nearest named
   group), which the docs now say.
5. **Round trip of the shipped examples** (coordinator's ask): Illustrator opens `quiz.svg` and
   `scoreboard.svg` with every name in the Layers panel (`Answer D`, `static:Letter D`,
   `A selected` hidden, `Full time` hidden) and a Save a Copy of them proposes the same type with
   every layer. An Export As of them drops the hidden groups again.
6. **Download links on the live site**: `noacg.studio/docs/examples/quiz.svg` answers
   `Content-Disposition: inline`, and the links are same-origin `<a download>`, which the browser
   honours regardless. The spec now asserts a `download` event on the dev server.

## Every docs sentence changed, and why

- `#first-finish`: "Create project opens the code editor instead, and it does not save" became
  "Skip to finish, shown from the drop step on, brings you here and leaves the steps in between
  as they are" - PR #354 (row A) removes Create project from the default studio.
- `#svg-rules` "Give it a size": added where to draw a lower third on the artboard and the Use
  Artboards tick - finding 2.
- `#svg-export` Illustrator row: Export As replaced by Save a Copy with five settings, and a plain
  sentence that Export As leaves hidden layers out - findings 1 and 3.
- `#svg-layers` first bullet: name the text object or put it alone in a named layer, with the
  failure case - finding 4.
- `#svg-layers` hidden-group bullet: text inside a hidden group is drawing, and the Save a Copy
  pointer - finding 1.
- `#svg-layers-files` (new): one line of download links for every example, so a student can open
  one in Illustrator and copy the layer structure - coordinator's ask.
- `#scoreboards` and `#quiz`: a second figure each, the lower-third version with its download
  link.

## What is left, and why

- **The shot job (j-1602) ran through the queue**: the wizard picked Score tracker for
  `scoreboard-lower-third.svg` and Quiz for `quiz-lower-third.svg`, the two new pictures came
  out at 1560x300 and 1560x240 (the sizes `docs.html` reserves), and the four existing
  quiz/scoreboard pictures re-shot without a byte of change.
- **`e2e/docs.spec.ts` ran once through the queue (j-1601)**: 16 passed, including the
  `download` event test, and one failed on a locator of mine (`#svg-export` is the heading,
  not the table). The locator now reads `#svg`, the figures and the 14-picture count are in,
  and the spec was queued again; if that run had no verdict when this landed, CI's e2e run is
  the verdict.
- `TYPE_EXAMPLES` entries with `fieldsShot: false` are checked in the wizard on every run but
  publish no Fields-step picture, so the docs do not show the same panel twice.
- `docs/SVG_AUTHORING.md` section 6 and 6b, the internal authoring page, still teach Export As
  and "not Save As". They are outside this row's TOUCHES. The corpus sidecars
  (`student-illustrator-quiz.expect.json`, `illustrator-four-team-scoreboard.expect.json`) say
  "Export As" for files whose shape is the legacy exporter's. Both want a sentence, not a rewrite.
- Row B may change what the import reads; the layer-name pages were checked against `naming.ts`
  and `words.json` at `bde57a83`. Re-read them after B lands.
- A third example (a plain name strap) was built but not published: the docs already say a lower
  third needs no special names, and `docs/svg-samples/illustrator-export.svg` teaches the same
  lesson. It earned no place.

## The check

`review: delegated` - the code-review skill returned findings with the branch, base
`bde57a83` and the nine files, and that scope was compared with `git diff --name-only` plus
`git status` here: it matched. Eight findings; five confirmed and fixed on this branch (a stale
sentence and a which-option question in the owner-queue note, which now records the decision;
the empty `Layer_1` group Illustrator leaves in both example files, which the wizard would have
offered as a layer; a duplicated per-shot lifecycle in `docs-shots.mjs`, now a `capture` option
on `shot()`; and a stale section comment there). Two are real and outside this row's files: the
wizard's own "Exporting the SVG" hint (`ImportDesignStep.tsx`) and `docs/SVG_AUTHORING.md`
still teach Export As, and two corpus sidecars mislabel legacy exports as Export As. Filed as
`docs/backlog/illustrator-export-as-drops-hidden-layers.md`. The eighth (the Skip to finish
sentence depends on PR #354, which is queued to land) stands as written; once #354 is on main,
`e2e/docs.spec.ts` should also open the import walk and assert `wz-skip-to-finish` is visible
after the drop, which this branch cannot do from its fork point.
`simplify: inline` - the simplify skill returned fan-out instructions, so the four angles were
read here over the same diff: one single-use helper inlined and one flag read once. Nothing
else needed it.
`verify: inline` - `npm run build` exit 0 read from the task's own output, with the stamp
`claude/f-docs-student-follows`; `e2e/docs.spec.ts` 17 passed through the queue (j-1605)
before the review's fixes and queued again after them (j-1610), and the shot job likewise
(j-1609): the SVG edit removes an empty group that draws nothing, so the pictures are expected
byte-identical.
`taste: not applicable` - nothing here changes how a graphic renders; the two example files
are new artwork the shot job rendered and the pictures were looked at (both frames read as the
docs describe them).

## Traps not in any repo file

- **Sibling rows share one scratchpad directory, so a log file there can be another row's.**
  The first build of this row was written to `<scratchpad>/build.log`, and that log ended
  `[write-version] dist/version.json -> claude/c-dashboard-flawless@4a495170b7`, a stamp that
  exists in row C's worktree (`agent-a7b5a4572df6e69ee/dist/version.json`) and not in this one.
  Row C's job j-1604 also points `NOACG_SHOTS` at this same scratchpad path. The build was
  re-run with `pwd`, the branch and `cat dist/version.json` in the same command and its exit
  read from the task's own output, not from a log another session can overwrite. Name scratch
  files with the row letter, and read a build's stamp from its own output.
- Illustrator's COM object stays alive after a script ends and one process refuses `Kill`;
  a second `New-Object -ComObject Illustrator.Application` attaches to a fresh one anyway.
- A modal in Illustrator blocks `DoJavaScriptFile` forever with no output; the first run stalled
  on the third document and never wrote its log (the log is buffered until `close`). Write the
  log line by line with open/append/close if it matters.
- Reopening the new exporter's own SVG in Illustrator loses the names of text objects that carry
  `<tspan>` runs; the legacy exporter's output and the shipped examples round-trip intact.
- `rolldown` cannot bundle `naming.ts` without a `?raw` loader plugin (fonts.ts imports the OFL
  text that way), and a script outside the checkout cannot resolve `@playwright/test`.

## Main taken in

PR #354 (row A) and #355 landed while this row ran, and #354 rewrote the same Finish-step
sentence and the same spec line this row had rewritten. `origin/main` at `21d8d481` was merged
in (`96245108`); main's wording of the Skip to finish sentence stands, and the spec keeps main's
comment plus this row's extra pin that the walk no longer mentions Create project. The build was
re-run on the merged tree and `npm run test:e2e:integration` queued (j-1612) behind other
sessions' suites; CI runs the same from the fork point, and that is the verdict this landing
rests on. `naming.ts`, `words.json`, the importer and the wizard's import steps did not change
between `bde57a83` and `21d8d481`, so the layer-name pages still describe what main reads.

## Commit pointers

`50a462f3` the docs, the two examples, their pictures, the shot script and the spec;
`f111ee0a` the review's fixes and the backlog file; `96245108` the merge of main; the tip is
this handoff.
