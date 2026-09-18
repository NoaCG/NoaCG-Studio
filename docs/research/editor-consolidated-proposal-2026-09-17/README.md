# Revised editor mockup, 2026-09-17

Design evidence under [EDITOR_PLAN.md](../../EDITOR_PLAN.md). No application implementation.
Open `editor-svg-and-templates-preview.html` in a browser to inspect the proposal; the sibling
fragment is the editable source. It uses illustrative SVG artwork, not a real imported file.


2026-09-18 amendment: this remains the whole-workspace/gallery layout reference. Its old
first-key, disable and destination-ease interactions are superseded by the
[Adobe/SVG contract](../editor-adobe-svg-contract-2026-09-18.md) and
[transform study](../editor-transform-proposal-2026-09-18/README.md). Do not implement those
older interaction details from this retained historical prototype.

## What this revision demonstrates

- Permanent canvas, compact tools, Layers/Properties and a property timeline; left dock
  collapses first on laptop widths. An expanded inspector can scroll independently.
- Import SVG opens an example wizard result with groups, fields and text. The real wizard
  and its output remain the mandatory first implementation fixture, not this drawing.
- Templates exposes categories and six illustrative graphic types. The first Starter set
  has five kinds; Scoreboard illustrates browsing beyond that set. Choose a Home brand and
  subset, then preview the rundown list. No files or productions are written.
- In/Step 2/Out, existence bars, a direct scrub ruler, property stopwatch/diamond, one-frame
  stepping, effective speed display and a second detail reveal through Next. Local-loop
  controls and optional Code keep the canvas. The node/States UI is absent.
- Chat remains a visible dock with an example proposal. It is not connected to a model.

## Boundaries

This is an interaction/layout study, not the application, importer, source parser or export
runtime. Layer hierarchy, rich key editing, retiming Out, automatic exit, full property
sampling, artwork-preserving transforms, real asset/brand application, save/reopen and live
production are not validated here. The text shown in Code is illustrative, not Monaco or a
live source mirror. Key edits demonstrate scope/history only; R1.1 must prove initialization,
base offsets, mixed axes, interpolation and disabling against the real source/runtime.
Template previews illustrate layout types; they are not finished curated designs.

## Verification

Queued Chromium job j-1337 exited 0. `consolidated-inspection.json` records 27 passed checks,
zero runtime errors, and layouts at 1920, 1366, 1024 and 320 px with no horizontal overflow.
Canvas bounds remain above the timeline. Gallery fits the laptop dock; brand, subset,
category and distinct screen/logo previews were exercised. Dark/light screenshots inspected.
The standalone preview adds 16 px outer padding, so its 1366 viewport has 1334 px app width.
Desktop output is the design target; 320 px is a stacked fallback, not mobile-editor acceptance.

Earlier checks caught canvas/inspector intrinsic-height overflow (j-1328-j-1330) and gallery
overflow (j-1332/j-1334). j-1331 was diagnostic with the overlap assertion temporarily omitted;
it was restored for the final passing run. No failed pilot establishes product evidence.
No product B task is closed by these checks. This mockup remains subject to owner review.

Screenshots: `consolidated-dark-1366.png`, `consolidated-dark-1920.png`,
`consolidated-templates-1366.png`, `consolidated-templates-1920.png`,
`consolidated-next-1920.png`, `consolidated-light-1366.png`; smaller fallbacks are retained.

Repository build j-1336 exited 0 after the goals-budget correction. See `planning-build.log`
and `verification-summary.json`. Documentation scope only; no product implementation started.

Later owner correction on 2026-09-18: cue creation forms and categorical no-cross-cue rules
are superseded by [timeline-first editing](../editor-timeline-first-2026-09-18.md).
Use that contract and study for Add Step/Add Out, duration bars and reverse entrances.
