---
v: 2
kind: handoff
date: 2026-09-10
branch: claude/ba-ladder-frame-detach
row: BA
---
# BA - the fit-ladder spec detaches its own frame

**Done and queued.** `e2e/import-svg-corpus.spec.ts` no longer waits on the wizard preview's
rebuild stamps before reading inside its iframe. It waits on what the document is SHOWING, then
on the stamps, then on the fit's font pass, and every read of the composed document re-resolves
the frame so a rebuild landing mid-read costs a retry instead of the run. CI is green on the
branch, and the lesson is recorded as an e2e trap with its measurements.

## The mechanism, which is two faults rather than one

`readLadder` reached into the preview iframe after `typeQuestion` waited for the stage to clear
`data-doc-pending` and to carry a `data-doc-rev`. Both are set from a React passive effect - one
commit AFTER the change event `fill()` dispatched, never during it. Measured here over the whole
ladder on an idle laptop, the stamp lands **6 to 17 ms** before the assertion that reads it. That
margin is the entire safety of the wait. A contended runner closes it, the wait then answers about
the PREVIOUS document, and the frame it leaves in place is replaced 220 ms later.

The second fault is what decided which rung failed. **Typing a value the field already holds
composes an identical document**, so no rebuild is scheduled and no stamp moves at all - measured,
0 of 28 rungs stamp anything at `shrink / short`, against 1 of 28 at every other rung. The ladder
types its datum at the top of each option (line 607) and again as the first length (line 612), so
that rung is the one where the spec waits for nothing and walks straight into the previous fill's
rebuild. Both CI failures landed exactly there, and the stack in run 34421430904 names line 613
inside the `shrink / short` step - the read immediately after the wait that had nothing to wait
for.

**The detach is the lucky half.** Lose the same race by a hair less and the read succeeds against
the document for the previous value: a silently wrong datum on a test whose whole job is comparing
one reading against another. That half is what I could reproduce.

## What is in no repo file - the reproduction, and what would not reproduce

- **20 natural repeats of the ladder test passed** (4.2 min, 1 worker, the same worker count CI
  uses). The detach did not appear. Four deliberate mutations failed to produce it either: no
  wait at all, a 205 ms wait timed to straddle the swap, 6x CPU throttling, and a 300 ms busy-wait
  inside the evaluate. **The busy-wait one explains the rest**: the read runs on the page's main
  thread, so while it is executing the rebuild timer cannot fire. The detach's window is the part
  that is NOT page JS - resolving the iframe, resolving the selector, the CDP round trips - and on
  an idle laptop that is about 10 ms. **Do not spend another session trying to reproduce the
  detach locally on this machine.** It needs the contention, not the timing.
- **What DID reproduce, deterministically, is the same race won the other way.** Rebuild
  `WizardPreview` with the pending stamp deferred 150 ms instead of landing 7 ms early, and the
  old spec fails 2 of 2 with wrong readings (`grow-x/over3: the plate stayed 1239 px wide` and
  three like it); the new spec passes 2 of 2. That is the before/after this fix rests on, and it
  is a one-line patch to reproduce: wrap the `dataset.docPending = '1'` assignment in
  `WizardPreview.tsx`'s rebuild effect in a `setTimeout(…, 150)` and clear it in the cleanup.
- **The wait is not vacuous**: pointed at a value that is never painted, it fails at the wait with
  `the preview is not painting "Who won?" yet`.
- **The narrowed retry is not vacuous either**: with `#f0` renamed away, the read reports
  `Cannot read properties of null (reading 'getBBox')` on the first attempt rather than burning
  the 20 s budget and reporting a bare test timeout.

## What the wait is now, and why it is in that order

`awaitPainted` asks the document what it is painting, using `svgFitValue` - the runtime's own
reader, the one `svgPaintLines` marks its lines for - so a block wrapped onto three tspans comes
back as the value it was made from, spaces intact, and the comparison is exact rather than a
whitespace heuristic. Measured across all four options and all six lengths: exactly one text node
reads back the typed value, every time. That is true at the rung that owes a rebuild and at the
rung that owes none, and no margin has to hold for it.

**Then the stamps, and only then.** The code review caught that asking ONLY what is painted would
have been a step backwards: the sample value is baked into the emitted markup, so a text node
reads it back the moment the SVG parses - before the fit has run at all. The fit runs twice
(`SVG_FIT_BOOT`): on `DOMContentLoaded`, and again on `document.fonts.ready`, because the first
pass measures a face the browser has not loaded yet. A reading taken between them uses fallback
metrics, and two readings either side of that line differ by a whole size step with nothing wrong
in the product - which is precisely what `corpus: the same question fits the same way whatever was
toggled before it` exists to catch. So the identity of the document is settled first, and then
both events are waited out. `fitBothWays` in the same file already waited for both, for the same
reason; that was the tell.

## What needs somebody, and what does not

- **Nothing needs the owner.**
- **Issue #217 ("CI is red on main") is still OPEN** as of this writing, which is expected: it
  names main's tip 4f95444b, and it can only close once a green run lands on main. Whoever sees
  this branch land should check it closed itself; if it did not, the alarm's own close path is in
  `scripts/red-main-issue.mjs`.
- **The same narrow margin is on `PreviewFrame` too, and its comment overstates it.**
  `PreviewFrame.tsx` says the pending flag is "set synchronously, before the debounce even
  starts", and `e2e/AGENTS.md` repeats that as "sets `data-doc-pending` SYNCHRONOUSLY when the
  template changes". Both are inside a `useEffect`, so neither is synchronous with the change
  event - it is a passive effect, and the measured margin is single-digit milliseconds. Every
  spec that waits through `awaitPreviewRebuild` inherits that margin. **I did not touch it**: it
  is a different surface, no failure is attributed to it yet, and widening this branch into the
  editor preview would have put an unmeasured change next to a measured one. The recorded rule
  (`contracts/rules/e2e/wait-preview-rebuild-what-document-shows.md`) is what should catch the
  next spec that trusts those stamps alone. If a second flake ever points at the editor preview,
  the fix there is the same shape and the measurement above is the head start.
- The `behaviour()` helper in the determinism test still brackets on the revision moving rather
  than on painted content, because attaching a behaviour paints no new words. That is sound only
  because `awaitPainted` now ends on the stamps, so nothing older is in flight when it snapshots.
  Its comment says so; do not reorder those two without re-reading it.

## check

- `review: delegated` - the code-review skill, high effort, forked and returned its findings into
  this conversation. It named merge base `4f95444b` and the one file `e2e/import-svg-corpus.spec.ts`,
  which matches what `scripts/review-request.mjs` handed it. Five findings, all verified against
  the code, all five fixed: the font-pass regression (medium), the `behaviour()` premise (medium),
  a null revision snapshot passed where Playwright takes only a string or a RegExp (low), `toPass`
  retrying real regressions into 20 s timeouts (low), and a missing-runtime diagnostic reported as
  a timing problem (low).
- `simplify: inline` - the simplify skill returned fan-out instructions, so by the workflow's own
  four-branch rule the pass did not run and the leg was done here over its four angles. Reuse: no
  helper to fold into (`e2e/_frame.ts` and `e2e/_preview.ts` both target the EDITOR's
  `iframe.preview-frame`, a different surface with a different stamp holder). Simplification: one
  change, `document.fonts.ready.then(() => true)` became an `async` body that awaits it, which
  states the intent instead of mapping a value to keep it serialisable. Efficiency: the happy path
  is three round trips per settle against the old two, bought by correctness. Altitude: the
  root-cause fix would be in `WizardPreview`, and it would NOT close this failure - the rung that
  fails owes no rebuild, so there is nothing to stamp however synchronously it is stamped. The
  spec is the right depth; the app-side margin is written up above instead.
- `verify: inline` - `npm run build` green. The whole spec file green over three repeats before
  the review fixes (66/66) and two after (44/44). CI green on the branch: run 34445742976 on the
  first commit, with `E2E 1/1 (subset)` genuinely running all 22 tests of
  `import-svg-corpus.spec.ts` on a Linux runner - the environment the flake actually lives in -
  plus Factory gates, Build, E2E plan, Combined E2E report and CI gate. Run 34447676134 covers
  the final code tip `a8d4743f` and is green on the same six jobs. Read the job list, not just
  the conclusion: `Vercel accepted the commit`, `Reviewed`, `Catalog calibration gate`, `E2E
  retry` and `After the gate` are all skipped on both, which is correct for a branch push that
  changes no product code.
- `taste: not applicable` - nothing here can move what a graphic looks like. The only product
  files read were read for evidence; no product code changed.

## Pointers

- The diagnosis this row was filed under, `docs/backlog/the-fit-ladder-spec-detaches-its-own-frame.md`,
  is deleted in the first commit. Its two candidate fixes were both right, and both were needed:
  re-resolve the frame inside a retrying assertion AND wait for the frame the current iteration
  owns. Neither alone would have held, because the rung that fails owes no rebuild.
- `contracts/records/e2e/2026-09-10-wait-preview-rebuild-what-document-shows.md` carries the
  measurements, so they survive this branch.
- `e2e/import-svg-corpus.spec.ts` lines 36-64 are the section comment that states the whole
  mechanism at the top of the file, where the next reader of these helpers will meet it.
