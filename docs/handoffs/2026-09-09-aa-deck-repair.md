# 2026-09-09 - AA, the deck stops lying to the room

Branch `claude/aa-deck-repair`, cut from `0204e175` (the merge of pull request 198, which landed
the deck). Five commits. All four defects are fixed IN THE FILE and the `.pptx` was rebuilt from
the script, so the artifact and its generator agree.

**Why this row existed:** pull request 198 landed the deck with these four still open. Six reviews
found them, the relay carrying them was marked read, and nothing was changed. So every claim below
names the file and the line, which is what makes it checkable without trusting this document.

## What changed, line by line

### Step 2 - slide 4 was wrong about the wizard

The SVG road is Start, Design, Fields, Animation, Finish
(`src/components/wizard/CreationWizard.tsx:125`, `STEP_TITLES_SVG`).

- **`docs/presentation-2026-09-25/make-deck.mjs:317`** - step 05 was
  `'Create, then Finish: add it to a production.'` with no pointer. It is now
  `'Finish: name it, then take the production door. It saves the graphic and puts it in a show.'`
  pointing at `the Finish step > Add to the production`. **"Create project" is not named anywhere
  on the slide.**
- **`make-deck.mjs:339`** - the typefaces panel said the upload road is `' road on the last screen
  before Create.'`; it now reads `' road in the Typefaces row, on the Fields step.'` The Typefaces
  row with the `Upload font file…` button is in
  `src/components/wizard/import/MapSvgFieldsStep.tsx:3682-3737`, which is the Fields step - two
  screens before the end.
- **`make-deck.mjs:349`** - the speaker notes gained a `THE ROAD, IN SCREENS` paragraph naming the
  five screens, saying that `Create project` does not save, and telling whoever presents not to
  name it out loud. `make-deck.mjs:350` (the R1.5 note) now names the Fields step too.
- **`docs/DEMO_2026-09-25.md:112` and `:113`** - R1.5 and R1.6, which the deck traces to, carried
  the same two errors. R1.6 now says never to send the room to "Create project".

**The behaviour claim was read in the source rather than taken from the backlog file**, which
asked for exactly that. `create()` calls `applyDraftProject()` with no arguments and its own
comment says "Saving stays the user's move" (`CreationWizard.tsx:1301`). One thing the backlog
file had wrong is corrected in it: "both Finish doors save" holds for the two doors the default
studio shows, but Finish's Advanced-mode third door, "Open in the editor (Alpha)", is
`onOpenEditor={create}` (`CreationWizard.tsx:2331`) and does not save either. Whoever takes that
item is deciding about two controls. See `docs/backlog/create-project-is-a-door-that-saves-nothing.md:58-80`.

**Still not reproduced in the running app.** The backlog file's first step is a walk - take the
door early, close the tab, look for the project - and this row did not do it. The deck now routes
around the button; that is a workaround for 25 September, not an answer.

### Step 3 - the overwrite guard had a hole

**Reproduced first.** A file containing `HAND EDITED DECK - MUST NOT BE DESTROYED` was passed as
`--out <path>/mydeck` (no extension). `existsSync` saw nothing at that path, `pres.writeFile()`
appended `.pptx` (`pptxgenjs/dist/pptxgen.cjs.js:7200`), and the file came back as a zip.

- **`make-deck.mjs:33`** - `import { existsSync } from 'node:fs'` became
  `import { writeFile } from 'node:fs/promises'`.
- **`make-deck.mjs:45-50`** - the eight-line `existsSync` block is gone. The extension is
  normalised here instead, so the path a caller names is the path that gets written.
- **`make-deck.mjs:510-518`** - the deck is built with `pres.write({ outputType: 'nodebuffer' })`
  and written with `writeFile(OUT, buf, { flag: 'wx' })`. The refusal is the filesystem's own
  `EEXIST` on the exact bytes' destination, so no filename routes around it.

Verified on four filename shapes: an extensionless path whose `.pptx` exists (refused, exit 2,
file intact), an explicit `.pptx` that exists (refused), a fresh extensionless path (written, with
the extension added), and the default deck path (refused while the deck was there).

### Step 4 - `line: { width: 0 }` drew a 1pt stroke

`addShapeDefinition` reads it as `options.line.width || 1` (`pptxgen.cjs.js:2207`), and 0 is
falsy.

- **`make-deck.mjs:115`** - `panel()` no longer passes `line` at all. Its doc comment says why.
- **`make-deck.mjs:165`** - the title mark's three bars, same.

**The prompt said three occurrences and there were two.** The other three `line:` properties in
the file (`:149` the arrows at 1.5pt, `:241` the hot node's amber outline at 1.5pt, `:369` the
code panel's 0.75pt hairline) are deliberate and were left alone. Proof it worked: across all
seven slides the deck's XML held 33 stroked shapes before and 9 after - the 9 being eight at
19050 EMU and one at 9525, which is exactly the set the script asks for.

### Step 5 - `validate` is not the only verb that opens a browser

Every bridge verb goes through `BridgeClient.connect()`, which calls `launchBrowser()` before it
opens `/bridge` (`cli/src/bridgeClient.ts:158`); `doctor` launches one of its own
(`cli/src/commands/doctor.ts:18`) and `login` opens the user's real browser
(`cli/src/commands/login.ts:146`).

- **`docs/AGENT_CLI.md:267-278`** - rewritten. It also names the two rows of that table which do
  NOT open a browser, because the branch review caught this correction being over-broad in turn:
  `whoami` never opens one, and `save` returned in 0.3 s because it looks for a key and refuses
  before it connects (`cli/src/commands/save.ts:76-81`, "that answer needs no browser").
- **`make-deck.mjs:389`** - slide 5's paragraph. Was "validate is 10.7 s of it, the only verb that
  opens a browser"; now "They all start a browser to reach the studio; validate is 10.7 s of it
  because it also runs the gate and writes three full-size frames." ("They" is the seven CLI verbs
  its own bold lead-in names.)
- **`docs/DEMO_2026-09-25.md:140`** and
  **`docs/acceptance/owner-queue/2026-09-09-minutes-to-air-is-now-a-number.md:14`** - the same
  claim, in the two documents the deck is built from. Both corrected and both scoped to the seven
  authoring verbs.

### Step 6 - the deck regenerated

`docs/presentation-2026-09-25/NoaCG-2026-09-25.pptx` was rebuilt from the script. Checked in the
built file, not in the source that made it: slide 4 contains "Finish: name it, then take the
production door" and "the Typefaces row, on the Fields step" and does not contain "Create, then
Finish" or "last screen before Create"; slide 5 does not contain "only verb that opens a browser";
notes slide 4 carries the warning. The deck had no hand edits to lose - its three commits are all
from the row that generated it, the same day.

Then **all seven slides were rendered through LibreOffice and read.** Nothing overlaps, nothing is
clipped, the panels draw no outline, and slide 3's "One URL" box keeps the 1.5pt amber outline it
is supposed to have.

## Gates

- `npm run build` green, exit code read directly rather than through a pipe. Run after every
  commit; the last run is on the tip.
- CI read green three times, most recently on the tip. **Which jobs ran** (same on every run):
  Build, Factory gates, E2E plan and CI gate all passed; the E2E shards, the catalog calibration
  gate, Reviewed and the Vercel job were SKIPPED, which is the docs-only path - the plan measured
  from merge base `0204e175` and found no affected specs. Nothing in this branch touches `src/`,
  `cli/` or `e2e/`. Runs 34378049690 (`c08fe6ac`), 34380119919 (`51c82851`) and 34381415304
  (`97af3226`, the last commit before this handoff).
- `check: review delegated, simplify inline, verify inline. taste: not applicable.`
  - **review: delegated (high).** It scope-checked clean: it named this branch, its three commits
    and a file list entirely inside `git diff --name-only 0204e175..HEAD`. Six findings, all
    verified against the source, all six fixed. Every one was a factual claim this branch had
    introduced - which is the class of error the branch exists to remove, so it is worth saying
    plainly that the first pass shipped two over-broad claims while correcting two over-broad
    claims. The fixes are commit `51c82851` and the one after it.
  - **simplify: inline.** The skill returned fan-out instructions, so the four angles were done
    here. Two changes: `OUT` resolves once instead of in both ternary branches
    (`make-deck.mjs:50`), and `panel()`'s explanation folded into its doc block instead of sitting
    between the doc block and the function.
  - **verify: inline.** Build green; no e2e (no product code); the deck rendered and read.
  - **taste: not applicable.** Nothing here can move what a graphic looks like. The deck is not a
    graphic, but it was rendered and every slide looked at anyway, which is the same instinct.

## For whoever comes next

1. **The Create-project question is still open and now has a date on it.**
   `docs/backlog/create-project-is-a-door-that-saves-nothing.md`. The walk that settles whether
   anything is really lost has still not been done, and it is the first step in that file. It is
   two controls, not one.
2. **`e2e/import-svg.spec.ts:886` has a stale title**: "the last screen before Create names a
   typeface that will not travel". The test asserts against `.wz-finish-summary`, so it means the
   Finish step, and "before Create" is wording from an older wizard. `docs/DEMO_2026-09-25.md:112`
   quotes that title verbatim as a citation, so renaming the test means updating the citation in
   the same commit. Left alone here because `e2e/` is outside this row's files and another row may
   hold it.
3. **`docs/DEMO_2026-09-25.md` exists on two branches independently.** It is not on `origin/main`
   at all; this branch has it via pull request 198, and `claude/g-demo-25-september` has its own
   210-line version that shares no history with it. Whoever lands second gets an add/add conflict
   over the whole file, and the corrections in this handoff are the ones to carry across.
4. **Slide 4's left column is bottom-heavy.** Steps 03, 04 and 05 each wrap to two lines and sit
   tighter than 01 and 02. Nothing overlaps and nothing leaves the slide - it was checked in the
   render - but if it wants fixing, the fix is shorter step text, not a re-layout.

**Not done, deliberately:** the typefaces were not touched, and slide 5 was not re-laid-out. The
prompt files those together as one change and not this one.

An owner walk is queued at
`docs/acceptance/owner-queue/2026-09-09-aa-slide-4-no-longer-sends-the-room-through-create-project.md`.
