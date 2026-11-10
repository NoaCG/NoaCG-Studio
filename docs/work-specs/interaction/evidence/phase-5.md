# Phase 5 evidence: More results and home-made graphics

Spec: `docs/work-specs/interaction/spec.md`, phase 5 (AC-12, AC-13, AC-15 repeated). Base:
`1740d4f128ec6f74bc9b95ca3b90d12f0c101ab5`.

| Criterion | Changed behaviour | Proof |
| --- | --- | --- |
| AC-12 | Nine result boards, `pl06` to `pl14`: bars across, bars up and a donut, each full screen, as a lower third and at the side, on a new Vote result type with a fifth field, Figures (percent, count or both). Offered in Interaction's result picker. | `e2e/audience-pack.spec.ts` "result boards: three layouts by three placements ..."; catalog gates below |
| AC-13 | Home-made vote artwork with Question, Option N, Bar N (full length) and Vote count layers imports as a live vote; `noacg scaffold --svg` makes the same graphic from the CLI; a layer named `QR` draws the Join link as a QR code. Docs: `docs/SVG_AUTHORING.md`, `cli/README.md`, the CLI skill. | `e2e/audience-pack.spec.ts` "studio import: ...", "CLI scaffold --svg: ...", "an imported SVG with a layer named QR ..."; `cli/test/unit.test.mjs` "scaffold --svg ..." |
| AC-15 | The walk airs the vote on a result board (Result Donut Lower) instead of House Vote. | Rehearsal walk below |

## AC-12, result boards

One test renders every board over a stand-in studio picture with 2 short options and with 8
options whose names run past any column, in each Figures mode, in the house palette and in Volt.
For every case: the board stays inside the frame and the action-safe area (93 percent), no
element leaves the board, a row's label and figures stay inside the row, no label runs past its
column (a long name wraps to two lines, then ends in an ellipsis; one line full screen and on a
side donut at six or more), the figures read `22.2%`, `1 096` or `22.2%|1 096` as asked, the
graphic's own document background is transparent, and the first option's fill or swatch is the
palette's accent. 108 cases, about 30 s.

Catalog gates, scoped to `pl06` to `pl14` (on this machine, queue jobs):

- `check-catalog-emit`: the five existing vote boards emit byte-identical code; nine new rows
  recorded in `e2e/catalog-baseline.json`, no other row changed.
- overflow sweep: no board paints outside the frame; the full-screen question's 3 px descender
  clip in its mask was fixed (line height) rather than baselined, so no baseline row is added.
- type floor: passes after the badge and count line moved from 18 and 19 px to 20 px.
- field coverage, numerals, factory: pass.
- `catalog-specs --only`: see "Not run" below.

Owner look (taste, not a gate): the nine boards at eight long options are in the test's output
(`pl06-8.png` to `pl14-8.png`); in the studio, Browse ▸ Polls, the names start with "Result".

## AC-13, home-made result and join graphics

- Studio import and CLI, one test each, the same artwork (four 600-unit bars, a bare rect named
  `QR`): proposed as a live vote with four rows, export gate clean, one Question and one Vote count
  field (the layers the vote writes are not operator fields), Options and Join link fields;
  counts 10, 20, 30 and 40 of 100 draw each bar within one pixel of its share on screen; the QR
  decodes to the Join link.
- QR layer: a transformed group named `QR`, a text layer also reading QR, and a hidden draft
  group holding another `QR`; the code is drawn inside the real layer (so its animation moves the
  code), centred in its box within one pixel, decodes from pixels, redraws once on update, goes
  when the link is emptied, and ignores a stroke the root declares. Mutation: letting text count
  as the QR layer fails the test.
- `scripts/svg-import-passes.test.mjs` fails 4 of 22 on this machine and fails identically on
  `main` (same files per pass): the machine's browser, not this change. No corpus file has a QR
  layer, and the behaviour runtime is unchanged.

## Rehearsal walk (AC-15, phase 5)

`e2e/configured/audience-live.spec.ts` "the rehearsal walk" now creates Result Donut Lower
instead of House Vote and stages the vote's result on it. On a local Supabase stack (CLI 2.111.0,
all 113 migrations applied from scratch): the phone joins by the link decoded from the studio's
QR, answers the Open question, votes Away, chat adds a vote each way, Add results to rundown
stages on Result Donut Lower, staging sends nothing to Program, Take airs the donut with both
options under the question, and the room moves through the third question to the waiting text.
Passed (queue jobs j-0031 and j-0032).

Findings: none blocking. Filed: #2344 (imported artwork drawn as upright bars or a pie, which the
spec's Graphics section places in this phase; AC-13 itself asks only for bars at their share).

## Not run, or partly run

- The rendered catalog baseline (`e2e/catalog-render-baseline.json`) is recorded and compared on
  Windows only; this machine is Linux, so it has no rows for the nine boards (the Join card from
  phase 2 has none either). Recording them is a Windows run.
- `catalog-specs --only` needs a check stamp on the head before the queue admits it; it runs
  after `/check` (result in the pull request).
