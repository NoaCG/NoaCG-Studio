# 2026-09-10 - the format validator gets called

Branch `claude/cc-validate-project-format`. Row CC of the 2026-09-10 wave: give
`validateProjectFormat()` callers, so a template carrying a resolution or frame rate the project
format catalogue does not offer says so at load and cannot be saved in silence. The receipt is
`docs/backlog/editor-canvas-1920x1880.md`, now carrying the fix.

## What landed

Two commits of code and docs, plus a third with the review fixes.

**The reproduction came first**, and it is worth knowing it was cheap: seed the autosave slot with
`resolution: { width: 1920, height: 1880 }`, reload, and the header read exactly
`1920×1880 · 25 fps`, the canvas chip repeated it, `validateProjectFormat` returned
`['Unsupported project resolution 1920×1880.']` when asked directly, and no surface anywhere
carried that sentence. A spec asserting that silence passed green. That is the owner's 2026-08-29
screenshot reached from a test rather than from a memory.

**Nothing refuses, and that was the call to make.** Refusing to open loses the reader's work;
refusing to save strands it. What the catalogue can detect is that a format is UNKNOWN, not that
the document is broken - the graphic renders and exports either way. So both roads stay open and
both are loud:

- **Load: one derived call.** `src/components/ProjectFormatMeta.tsx` reads the LIVE working
  template and both surfaces that already print the format render it - the topbar meta
  (`AppShell.tsx:340`) and the canvas chip (`PreviewFrame.tsx:402`). Deriving covers boot restore,
  library open, import, cloud pull and a hand edit of the code at once. The alternative, calling
  the validator at each load door, means finding all ten and missing the eleventh.
- **Save: a word.** `src/store/saveActions.ts` validates in BOTH save doors and the status beside
  the Save button reads `⚠ Saved · unsupported format` with the sentence on its title.
- **Three call sites, three mutation tests.** Each was removed on purpose and the matching
  assertion went red: the load one as `Expected "⚠ 1920×1880 · 25 fps" / Received
  "1920×1880 · 25 fps"` (the reproduction's own signature) and each save one as
  `Expected "Saved · unsupported format" / Received "Saved"`.

The tests live at the end of `e2e/project-format.spec.ts` rather than in a new file, so
`scripts/e2e-lists.mjs` needed no entry: that spec already owns project formats and is already in
`FOCUS`, and `src/store/`, `src/styles`, `AppShell` and `PreviewFrame` are all CORE in
`e2e-affected.mjs`, so this change escalates to the focus list and reaches it that way. A file
called `project-format-guard.spec.ts` sitting beside `project-format.spec.ts` would have been one
dash of difference for whoever came next.

## The trap that is in no repo file

**`toHaveText` reads `textContent`, so it passes on text that CSS has hidden.** The save word's
reason is dropped below 1400px with `display: none`; the assertion written the obvious way was
green at 1280 on a bar where the reason was still in the DOM, which is exactly the state that
overflows. `{ useInnerText: true }` is the fix and the spec says so at the line. The same shape
bit the topbar meta earlier in the row - a `toHaveText` there passed against a span the 1400px
rule had already hidden, which is why that assertion is now `toBeVisible` / `toBeHidden`.

**The e2e viewport is 1280 wide** (`devices['Desktop Chrome']`, `playwright.config.ts:104`), under
every one of the topbar's width breakpoints. Any topbar assertion written without knowing that is
measuring the narrow layout while thinking it is measuring the wide one.

## What the review caught, because it matters more than the fix

The first version overrode the 1400px rule that hides the topbar's format line, on the argument
that a warning is not decoration. **That would have re-broken the thing the width ladder exists to
prevent.** `app-shell.css`'s own comment records that a signed-in 1366 bar overflowed by 24px and
hung the account avatar off the right edge, which is why the line goes first; the line is ~140px
and the slack is ~70px, and the longer save word was another ~150px on top.
`e2e/configured/signed-in-ux.spec.ts` asserts `overflowPx <= 0` at six widths but only ever with a
catalogue format, so nothing would have caught it. The fix bands both: the header line stays
hidden below 1400 and the save word drops its reason there, keeping the ⚠. The banding is
mutation-tested (removing the drop turns the 1280 assertion red).

**The signed-out overflow assertion in `project-format.spec.ts` did NOT catch that mutation** -
signed out there is enough slack at 1366. It is still worth having, in the right direction, but do
not read it as covering the signed-in ladder. The real gate for that is
`configured/signed-in-ux.spec.ts`, which needs `E2E_EMAIL`/`E2E_PASSWORD` and was not run here.
**If anyone widens the topbar again, run that spec in the unsupported state**, or accept the same
blind spot.

## The delegation

Codex `gpt-5.6-sol`, effort high, job `task-mtvyxjze-espmdd`, one launch, no retries. It answered
all nine acceptance conditions with file and line evidence and its code matched the spec exactly.
Recorded as `repaired / prompt`: everything that had to change after review traces to MY spec, not
to its execution - the topbar override, the dirty-status class, keeping the seed helper verbatim
(it carried an autosave race), and creating a separate spec file. Its own build attempt failed on
`EPERM` writing the shared git port registry from its sandbox and it said so plainly rather than
claiming green, which is the behaviour you want; the build was re-run here at exit 0.

The honest routing note: this was **short to do and long to specify**, the opposite of what the
delegation rule asks for. The 14.5 KB spec took longer to write than the code would have. What it
bought was a re-derivation that was fast, because every line was already decided.

## The one red, and why it is not this branch

`npm run test:e2e:affected` escalated to the full offline suite (this change touches four CORE
paths) and came back **1307 passed, 1 failed** in 20.1 minutes, catalog tripwire 35/35 green.
The failure is `e2e/video-project.spec.ts:124 scrubbing seeks the composition deterministically`,
at line 158: after scrubbing to frame 75 the countdown never showed `3` within its 10 s budget.

It is not this branch. Nothing in the diff is imported by the video shell - that shell has its own
store (`videoProjectStore.ts`), and the two files of mine it could conceivably share
(`templateStore.ts`, `save-controls.css`) it does not use. Re-run in isolation on this exact tree
it passed **3 out of 3**. The reading is a slow seek on a starved box: six workers, the full suite,
catalog benches queued behind it.

Two honest caveats. **A green `--repeat-each` is not a measurement of a race** (`e2e/AGENTS.md`
says so in its own words) - the correct report is "not reproduced in 3 isolated runs", not "fixed".
And the AGENTS.md entry for this same test documents a DIFFERENT mode: the transport-state race,
which `awaitVideoPreview` fixed and which the spec now guards. This is the seek itself not landing
in time. Nobody has written that one down, and it is deliberately not written down here either -
it belongs to whoever owns the video shell, with `npm run learn` and its own evidence, not to a
row that happened to trip over it. **The pre-merge gate is CI on a clean checkout**, which runs it
sharded and unstarved.

## What is left

- **The VIDEO shell is unguarded the same way.** `src/components/video/VideoAppShell.tsx:169`
  prints a video project's own `width×height · fps` with nothing checking it against the
  catalogue. Deliberately out of scope: a `VideoProject` is a different record with its own
  picker (`VideoSettingsPanel`), and widening the row would have mixed two subjects in one branch.
  It is a small job for whoever wants it - the component takes a template today, so it needs
  either a second prop shape or a shared `{ width, height, fps }` one.
- **Nothing OFFERS to fix the format.** There is no format control for a graphic that already
  exists (`ProjectFormatPicker` only appears in the creation wizard and in video settings), so the
  tooltip says what the number costs instead of sending the reader to a door that is not there.
  "Put this on 1920×1080 for me" is a real feature and the owner-queue item says so in his words.
- **The origin of 1880 is still unproven, but the road is named.** Measured in the page: the
  import path's `importedResolution` (`src/model/importTemplate.ts:69`) deliberately KEEPS an
  off-catalogue size rather than snapping it, labelling it `Imported (1920×1880)`, and
  `detectAuthoredFormat` reads exactly `1920x1880` out of `body { width: 1920px; height: 1880px }`.
  In the same probe `importHtmlTemplate` alone still produced 1920x1080, because the source stated
  no frame rate and the uncertain path falls back to the selected format - so whether 1880 survives
  depends on what the reader accepts at the import step, which was not walked end to end. On the
  receipt.

## Needs the owner

Nothing blocking. One thing to look at, filed as
`docs/acceptance/owner-queue/2026-09-10-cc-a-format-the-app-does-not-offer-now-says-so.md`
(`because: scope`): whether an unknown format deserves a permanent amber mark rather than a
refusal, and whether he wants the offered repair. **Its route needs `npm run dev`**, not the
deployed site - nothing in the app's own UI can put an off-catalogue size on a graphic, so the only
hand route is a console line that loads a source path only a dev server serves. The item says so
and offers to build him a droppable fixture instead if he would rather have one.

## The check

`review: delegated` (6 findings, 6 acted on; scope confirmed - the pass reported merge base
`0634d6bd` and exactly the 11 handed files). `simplify: inline` - the skill returned fan-out
instructions, which under `.agent-workflows/check.md` means the pass did not run, so the four
angles were covered here: two fixes (typing the `SaveControls` status ladder so five rungs stop
spelling out `title: undefined`, and naming `unsupported` in `ProjectFormatMeta` instead of testing
`issues.length` three times) and one reported-not-fixed (`topbarOverflowPx` duplicates five lines
of `configured/signed-in-ux.spec.ts`; sharing it would mean editing a spec this machine cannot run
and putting the helper in `e2e/_*`, which is CORE and would escalate every touch to the full
suite). `verify: inline` - build green at its own exit code, affected suite 1307/1 as above.
`taste: not applicable` - this is editor chrome; `docs/VISUAL_TASTE_REVIEW.md` is about graphics
and no graphic changed.

One honest note on the stamp: the delegated review saw `392c3e0f`, and one commit landed after it
(`28eb67b6`, six lines of YAML front matter naming the shas on the 1920x1880 receipt, which the
review had already read as a file). The branch was re-stamped at the new tip rather than re-run.
That is the workflow's "honestly re-stamp what was re-checked" - read the increment before
believing this line, it is one paragraph. The chrome itself was looked at rather than assumed: screenshots of the
topbar at 1440 and 1280 in the warned state, which is how the two-band design was confirmed to
read (`⚠ 1920×1880 · 25 fps` beside `⚠ Saved · unsupported format` wide, `⚠ Saved` alone narrow).

## Pointers

- `src/model/projectFormat.ts` - the catalogue and the validator, unchanged by this row.
- `docs/backlog/editor-canvas-1920x1880.md` - the receipt, now carrying the fix, the width lesson
  and the import road.
- `e2e/project-format.spec.ts`, last two tests - the guard.
- The ask this row answers came from the owner's 2026-09-10 walk; the receipt above carries it.
