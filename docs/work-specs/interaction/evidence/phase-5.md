# Phase 5 evidence: More results and home-made graphics

Spec: `docs/work-specs/interaction/spec.md`, phase 5 (AC-12, AC-13, AC-15 repeated). Base:
`1740d4f128ec6f74bc9b95ca3b90d12f0c101ab5`.

| Criterion | Changed behaviour | Proof |
| --- | --- | --- |
| AC-12 | Nine result boards, `pl06` to `pl14`: bars across, bars up and a donut, each full screen, as a lower third and at the side, on a new Vote result type with a fifth field, Figures (percent, count or both). Offered in Interaction's result picker. | `e2e/audience-pack.spec.ts` "result boards: three layouts by three placements ..."; catalog gates below |
| AC-13 | Home-made vote artwork with Question, Option N, Bar N (full length) and Vote count layers imports as a live vote; `noacg scaffold --svg` makes the same graphic from the CLI; a layer named `QR` draws the Join link as a QR code. Docs: `docs/SVG_AUTHORING.md`, `cli/README.md`, the CLI skill. | `e2e/audience-pack.spec.ts` "studio import: ...", "CLI scaffold --svg: ...", "CLI scaffold --svg builds the studio import's own default for every corpus file", "an imported SVG with a layer named QR ..."; `cli/test/unit.test.mjs` "scaffold --svg ..." |
| AC-15 | The walk airs the vote on a result board (Result Donut Lower) instead of House Vote. | Rehearsal walk below |

## AC-12, result boards

One test renders every board over a stand-in studio picture with 2 short options and with 8
options whose names run past any column, in each Figures mode, in the house palette and in Volt.
For every case: the board stays inside the frame and the action-safe area (93 percent), no
element leaves the board, a row's label and figures stay inside the row, no label runs past its
column (a long name wraps to two lines, then ends in an ellipsis; one line full screen and on a
side donut at six or more), the figures read `22.2%`, `1 096` or `22.2%|1 096` as asked, the
graphic's own document background is transparent, and the first option's fill or swatch is the
palette's accent; every track across has one length and every column one baseline. 108 cases,
about 30 s.

Catalog gates, scoped to `pl06` to `pl14` (on this machine, queue jobs):

- `check-catalog-emit`: the five existing vote boards emit byte-identical code; nine new rows
  recorded in `e2e/catalog-baseline.json`, no other row changed.
- overflow sweep: no board paints outside the frame; the full-screen question's 3 px descender
  clip in its mask was fixed (line height) rather than baselined, so no baseline row is added.
- type floor: passes after the badge and count line moved from 18 and 19 px to 20 px.
- field coverage, numerals, factory: pass.
- the catalog specs, scoped (`NOACG_ONLY_DESIGNS=pl06..pl14 npm run test:e2e:catalog`): see the
  pull request for the run on the final head.

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

## Review (`/check`)

The code review found ten points; eight were fixed: a count-only figure styled as the quiet half
of a pair; counts fading in out of step with their bars (each row now keeps one counted share and
fades its count with its own bar); the row-count layout applied a microtask after the text fit
(now inside the rebuild); the ring's observer running on every board (now the donut only); a bare
QR shape's wrapper not keeping the layer's id; a QR first measured before layout never drawn
(now retried on the next frames); `scaffold --svg` silently ignoring `--design` and `--set` (now
refused); the result picker's names not checked against the catalog (now in the test). Left as
they are: the QR search re-states the importer's hidden and non-rendered test rather than sharing
it, and an imported build parses its markup once more to look for a QR layer.

## CI repairs

CI on `0e0dd49` found two things this machine did not: on the side card with bars up, eight
options' share figures were a little wider on the runner than here and left their columns (that
board's card is now 780 px wide instead of 660); and `EXEMPLAR_CORPORA`, the AI harness's
measured catalog corpus, is derived from the catalog and had to be regenerated for the nine new
designs (`scripts/pro-harness-exemplars.test.mjs` writes the block; pasted as it says).

## Review of `f4a8e55` (Codex)

Two findings, one family (the bars must compare across rows), both product defects, fixed: bars
across sized each row's figure column to its own figures, so a count of `1 000` beside `999`
shortened its own track (every row now takes the widest row's figure width); in columns a
two-line name lifted its column (every column now keeps room for two lines). The test's
two-option case is now a short name beside a long one at 999 and 1000 votes, and checks that
every track across has one length and every column one baseline, within one pixel. Mutation:
undoing either fix fails the test (tracks 22.6 px apart; columns 26.4 px apart).

## Review of `7be5fc7`

`/so` (fresh read-only session): AGREE WITH CORRECTIONS, grade A. Its two findings need no code:
the scoped catalog specs and calibration gate on the head are posted on the pull request, and the
two open items are filed (#2345 grouped rows not proposed, #2346 Windows render rows).

Codex: two findings, one family (the CLI path must apply the studio import's defaults), product
defects: a proposed countdown's clock layer was not bound, so the CLI-made timer never ticked;
and the artwork's bundled faces were dropped. Fixed at `bb021b2` in the then hand-made helper.

## Review of `bb021b2`

`/so`: A, with one minor finding (text off the artboard offered as fields by the CLI only;
filed as #2347, then fixed by construction below and closed by this pull request: the sweep's
"text off the artboard" case pins it). Codex: oversized artwork not fitted to the frame by the CLI path. That made two
successive rounds of one missing rule (the CLI path must equal the studio import's default), so
patching stopped and a fresh read-only reassessment of the model came first. It found six more
defaults the copy missed (`static:` and `f:` layers, picture slots, `show:`/`choice:` extras,
typed behaviours with their gap check, the written-layer filter) and recommended calling the
studio's own function. Done: `svgDefault.ts`, called by the bridge; the copy is removed. The
parity test is now a sweep: every file in the SVG corpus (51) plus a 3840x2160 artwork and text
off the artboard, asserting the CLI-made template equals the one built from the studio chain's
own `DesignSvg` (html, css, js, fields). Mutation: stripping the fonts on the bridge side fails
it on 53 points.

## Review of `593822e`

`/so`: A, two doc corrections, made: the architecture's bridge bullet now names `svgDefault.ts`
as its one component, and #2347 is recorded as fixed. Codex: the capability's compiled contract
named `import/index.ts` its only door, contradicting the new one. Taking the index instead would
load the step components into the bridge page, which has no React on the dev server, so the rule
was amended at its source (`contracts/rules/wizard/hold-whole-import-graphic-capability-inside.md`,
recompiled; the evidence is in its record) to name `svgDefault.ts` as the bridge's React-free
door.

## Rehearsal walk (AC-15, phase 5)

`e2e/configured/audience-live.spec.ts` "the rehearsal walk" now creates Result Donut Lower
instead of House Vote and stages the vote's result on it. On a local Supabase stack (CLI 2.111.0,
all 113 migrations applied from scratch): the phone joins by the link decoded from the studio's
QR, answers the Open question, votes Away, chat adds a vote each way, Add results to rundown
stages on Result Donut Lower, staging sends nothing to Program, Take airs the donut with both
options under the question, and the room moves through the third question to the waiting text.
Passed (queue jobs j-0031, j-0032, and j-0036 after the review fixes, 42 to 48 s). The screens
were read: the phone shows the Open question, its thanks, the vote with A and B marks, "Counted"
with Away marked, the third question and the waiting text; Program shows Result Donut Lower in its
voting state, the ring empty until the operator's Show result, as every vote board is.

Findings: none blocking. Filed: #2344 (imported artwork drawn as upright bars or a pie, which the
spec's Graphics section places in this phase; AC-13 itself asks only for bars at their share).

## Not run, or partly run

- The rendered catalog baseline (`e2e/catalog-render-baseline.json`) is recorded and compared on
  Windows only; this machine is Linux, so it has no rows for the nine boards (the Join card from
  phase 2 has none either). Recording them is a Windows run.
- The queue does not admit `node scripts/catalog-specs.mjs` as browser work on a cloud worker
  (it refuses the run inside the job); the same specs run through `npm run test:e2e:catalog` with
  `NOACG_ONLY_DESIGNS`, admitted with `--cap 12`, once per commit.
