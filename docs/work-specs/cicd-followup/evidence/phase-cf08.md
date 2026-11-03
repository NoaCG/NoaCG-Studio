# cf08: Track and exercise the SVG import incidents (#1954, #1926, #1834)

Builder: Claude Code Cloud worker, run #1967, branch `claude/plan-cicd-followup-cf08-build`,
from `0b73b488`. Acceptance is in [spec.md](../spec.md), cf08 (a) to (d).

## Summary

| Item | Finding | Outcome |
| --- | --- | --- |
| #1954 | A product race in the wizard: a preview rebuild took the growth-limit line off the stage, so a drag that began or paused in that gap did nothing | Product fix, a regression test that fails on main, a CI repeat trial of the original test |
| #1926 | svg01 is not a playout defect: its catalog row has no artwork, so the bench measured a no-text stand-in that never reaches air | `imported-design` is benched in CI; svg01 is benched with a real imported file and passes |
| #1834 | The 2026-10-30 flake was real, but the spec has run 73 times on main since without failing | Closed as obsolete with the reason; the signature is tracked in #1997 |

## (a) Owner, target date and the JEV run

The JEV coordinator (jev-svg-import, #1850) was asked at the start of cf08, by `send_message`,
whether it accepts #1954 and #1926 with a named owner and a target date. It answered at 02:41 UTC
(and again at 02:56): no for both, because no JEV row's allowlist covers those files and the run
may not widen its scope; cf08 should go ahead. It also confirmed no JEV branch touches
`WizardPreview.tsx`, `e2e/import-svg.spec.ts` or the catalog bench (its only open PR, #1996, does
not).

Each issue carries a comment with: operational owner `miwco`, with the weekly owner session as
backup (#1951); the JEV run's answer (#1850); target date 2026-11-14 (#1954's repair date, used
for both); and this PR as the coordinated fix: [#1954](https://github.com/NoaCG/NoaCG-Studio/issues/1954#issuecomment-6594479098),
[#1926](https://github.com/NoaCG/NoaCG-Studio/issues/1926#issuecomment-6594480206).

**Departure from the wording.** The acceptance says that without JEV acceptance "a coordinated
fix is split out as an issue". cf08 found both root causes and fixes both in this PR, so the
coordinated fix is this PR, linked from #1926 and #1954, with the owner and date above. A separate
issue for work this PR already does would be filler. The two things that are not fixed here have
their own issues: #1997 (the corpus flake from #1834) and #1915 (the `import-svg.spec.ts:988`
recurrence, see (d)).

## (b) CI exercises and reports svg01

**Reproduced.** Benching `imported-design` on `0b73b488` (the category added to the bench locally):
imp01 passes; svg01 fails `bench-entrance` and `bench-replay`, as #1926 says.

**Root cause.** `IMPORTED_SVG.create()` with no file renders `NO_SVG`
(`src/templates/importedDesign/svg.ts`): a 960x270 plate with no text and no picture. Its own
comment says it is used only when a preview or the catalog baseline renders the variant before an
SVG exists. The bench's on-air check counts what a viewer can read (`collectLeaves`: elements that
own text, and images), so a plate with nothing on it reads as "not visible after play()" and as
"does not come back on replay". The same bench on svg01 built from four real files, through the
import a drop takes, passed every rule: `illustrator-lower-third.svg`,
`illustrator-quiz-lower-third.svg`, `out-text-box.svg`, `fidelity-nested.svg`. So it is neither a
playout defect in svg01 nor a rule that does not fit imported artwork: it was the wrong input.

**Change.** `e2e/catalog/catalog-bench.spec.ts` benches svg01 built from a real file,
`e2e/catalog/fixtures/svg01-artwork.svg` (a copy of the Illustrator lower third in
`e2e/fixtures/`), with the importer (`importSvgMarkup`) and every text layer a field, the way
`ograf-parity.spec.ts` builds its imported designs. Every other design still benches its
`create()`. The file sits under `e2e/catalog/` and the importer under `src/assets/`, so a change to
either raises the catalog gate (`CATALOG_TRIGGERS` in `scripts/e2e-affected.mjs`) without any
change to test selection. `imported-design` moves into `BENCH_CATEGORIES` and `NOT_BENCHED` is
empty, so rule S4 still fails any new category left in neither list. No bench rule, threshold or guard changed. The real-manifest
assertion in `scripts/catalog-bench-scope.test.mjs` now checks the category is benched and nothing
is declared left out; the synthetic manifest still tests rule S9.

**Reported.** The scope guard's line names what was measured (for a run scoped to imp01 and svg01,
"measured 2 of 2 expected design(s)"), and its JSON report lists `svg01` in `results`. The CI
`Catalog calibration gate` job runs the whole bench on this PR, because the plan raises the catalog
flag for a bench change. Local run (scoped to imp01 and svg01, both configs): the imported-design
unit passed with 2 of 2 measured, and the catalog baseline passed.

## (c) #1834

Reviewed against `0b73b488`. Closed as obsolete, not merged:
[comment](https://github.com/NoaCG/NoaCG-Studio/pull/1834#issuecomment-6594349224).

- The flake was real: `import-svg-corpus.spec.ts:1362` failed at line 1409 in run 41134775210
  (main, `0df77f74`) and passed on a re-run.
- Since then (2026-10-30T22:00Z to 2026-11-03T02:40Z) 73 completed `ci.yml` runs on main ran it
  in the blocking shards: 70 green, and the 3 red ones (41244292482, 41336665950, 41359365006)
  failed in other specs. The documented route releases after 20 consecutive passes, so the
  quarantine would already have ended; landing it now would only take a stable spec out of the
  blocking set.
- Not a `// critical` spec, so no incident process is owed. Not a deterministic product
  regression: it passed on the same commit and 73 times since.
- The branch conflicts with main's `e2e/quarantine.json`, which holds no specs.
- The signature is tracked in #1997 (P3, area:e2e).

## (d) #1954

### Root cause: a product race

Both CI failures of "a growth limit stops at the frame and at the box" have one signature: line
1616, `drag(-4000)` read back 0.045 where about 0.759 was expected (runs 40501378385, 2026-10-27,
and 41244292482, 2026-10-31). 0.045 is exactly the value the `ArrowUp` press just before had left,
so the drag changed nothing.

`WizardPreview.tsx` draws the line only while it has a rect for the artwork (`capRect`). Every
move of the line changes the graphic, so the preview rebuilds, and two things removed that rect:

1. the rebuild debounce (220 ms) ran `setRects({})` when it committed the new document;
2. the new document then posted an empty rect list, before it was told what to track.

Until the new document answered, the line was off the stage. A pointer that went down on it just
before, or a drag that paused that long, lost its element and pointer capture, and the moves went
nowhere. Under CI load the gap is longer and lands inside the test's drag more often.

**Reproduced deterministically.** A new test holds a drag across one rebuild and counts, with a
`MutationObserver`, every moment the stage is without the line. On main it fails every time
("the line left the stage", 1 removal; 5 of 5 with `--repeat-each 5`).

**Fix (product).** The artwork rect the line is drawn on is held across the rebuild, and kept when
a fresh document's report leaves that selector out (not asked yet); the document's answer replaces
it as soon as it gives one, with a rect or with `null`. The afterimage keeps the old artwork painted
meanwhile, so the line stays on the frame it is drawn on. No wait, sleep or retry was added; the
test waits on the stage's own `data-doc-rev` and `data-doc-pending` stamps.

**Local runs after the fix:** both growth-limit tests 10 of 10 (`--repeat-each 5`), and
`import-svg.spec.ts` with `wizard-preview.spec.ts`, 78 of 78.

### Stability on CI: the repeat count, written before the run

- Rate from main CI history, 2026-10-24 to 2026-11-03: 181 completed `ci.yml` runs on main
  (191 less 10 cancelled), 2 failures of this test: rate = 2 / 181 = 0.01105. Two errors in this
  count are possible, and both are on the safe side. Some of the 181 ran while the spec was
  quarantined, so it was not in their blocking shards; and a failure inside `quarantine.yml`
  (which stays green and posts its verdict as a commit status, not read here) is not counted.
  Either way the true rate is higher than 0.01105, and a higher rate needs fewer runs than N
  below to show a failure with 95% probability.
- N such that 1 - (1 - 0.01105)^N >= 0.95: N >= ln 0.05 / ln (1 - 0.01105) = 269.6, so N = 270
  (1 - 0.98895^270 = 0.9502; 269 gives 0.9497).
- Committed in `abf54661` as `trial:import-svg-growth-limit` before the dispatch.
- Conditions: `endurance.yml` on an `ubuntu-latest` runner, `playwright.config.ts` with CI's one
  worker, the dev server with the suite's own pins, retries off, `--grep "cannot be dragged past
  either"`. `scripts/configured-trial.mjs` gained an offline mode for this (see Decisions); the
  verdict is the existing one: every asked-for run passed, and exactly that many ran.

TRIAL_RESULT

### Release and the issue

`e2e/import-svg.spec.ts` is not quarantined: it left on 2026-11-02 after 20 consecutive passes
(PR #1963, `9b3d00a2`), by the documented route. Nothing is released by hand here. If it fails
then passes on one commit on main again, `ci.yml` puts it back. This landing closes #1954.

### The recurrence on #1966 is a different cause

`import-svg.spec.ts:988` "a growing lower third keeps the space" failed then passed on PR #1966
(run 41431355698, line 1017, gap 11 where at least 12 was expected). That test measures the live
graphic in the editor; the wizard overlay is not involved, so it is not #1954's cause. It is
recorded on #1915, which already tracks that test
([comment](https://github.com/NoaCG/NoaCG-Studio/issues/1915#issuecomment-6594359962)).
#1988 (`import-svg-credits.spec.ts:1183`, timed credits cards) is in the editor and the live
credits engine, also not this cause, so it is left to its own issue.

## Phase notes

- **Previous verified main SHA:** `0b73b488ecaf7c98c5b9f7f8a48da9b86cb1698e` (CI push and merge
  group, configured suite, quarantine and post-landing all green on it).
- **Revert:** `git revert -m 1 <merge commit of this PR on main>`. It puts the line's rect drop
  back (and the #1954 race with it), returns `imported-design` to `NOT_BENCHED`, and removes the
  offline trial mode and its npm script. No data or quarantine state to undo.
- **Decisions:**
  - svg01 is benched from a real file rather than by changing `NO_SVG` (which would move the
    catalog baseline and is JEV's code) or by teaching the bench that a bare plate is content
    (which would change the judge). One file keeps the cost to one more design in the bench.
  - **Departure, stated:** the bench no longer measures svg01's `create()` with no file. That
    output is the stand-in a preview shows before a file exists; it never plays on air, and the
    catalog baseline (`catalog-baseline.spec.ts`) still fingerprints it. Measuring a design a user
    can actually play is the point of the gate (#1926 asked for exactly this choice), so this is
    a correction of the input, not a loosened rule: every rule and threshold is unchanged.
  - The bench builds svg01 with the importer alone rather than the wizard's draft module, so that
    nothing it depends on sits outside the catalog gate's triggers; widening the triggers would
    have been a selection change, which belongs to cf11.
  - Only the growth limit's rect is held across a rebuild. Other overlays (the draw marquee, the
    hover box) also lose their rects for that moment, but nothing reported fails because of it,
    so they are left as they are.
  - The repeat trial reuses `endurance.yml` and `configured-trial.mjs` (cf07's route) with an
    offline mode, instead of a new workflow, which could not be dispatched before it is on main.
    The offline bound is 400 runs, not the configured 75, because an offline run takes seconds;
    the configured bound is unchanged and `--minutes` still caps every trial.
  - The trial runs only the #1954 test. The new regression test fails every time without the fix,
    so the ordinary CI run covers it; running both 270 times would not fit the 75-minute job.
- **Traps:**
  - A local catalog bench run filtered with `-g` fails the scope guard by design; scope with
    `node scripts/catalog-specs.mjs --only <ids>`.
  - Cloud browser runs must go through `node scripts/jobs.mjs add ... --cap <n>` and
    `jobs.mjs wait`; a direct `npx playwright test` is refused, and a foreground poll is blocked.
  - The repo's commit hook refuses attribution trailers.
  - `gh api --paginate` on the Actions runs list follows a numeric-id link the proxy refuses; page
    with `-f page=<n>` instead.
