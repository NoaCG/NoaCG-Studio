# Isolated placement and scale experiment, 2026-10-24

Research receipt for `../spec.md` ("Findings", "The quiz, honestly"). No product file changed.

## Method

A scratch Node script emitted catalog templates with the repository's own
`scripts/catalog-emit.mjs` (rolldown bundle, Playwright Chromium, `variant.create({})`), wrote
each as `index.html` + `css/template.css` + `js/template.js` beside a copy of `src/assets/gsap.min.js`
and `public/fonts/`, served them over a local HTTP server, and opened each at 1920×1080 in
Playwright Chromium. The two agent-made boards came from
`e2e/fixtures/agent-made/vote-show.noacgpack.json`. After `play()` and a 2.5 s settle the script
measured the union box of visible ink (text ranges, backgrounds, images), the smallest computed
font size of visible text, and the font families in use. It then measured again after each of:

- A. `--scale` × 0.95 on `:root` (fresh load, and set live on a played graphic).
- B. `transform: scale(0.95)` on `<body>` about the measured box's bottom-left corner, applied
  live; then a `translate` mirroring the box across the frame; then `stop()` and `play()` again.
- C. the same scale on a host page's iframe holding the template.
- D. the scale that fits the box into a 240 px band within the horizontal safe area, and the
  smallest text size that results.
- E. `--font-heading` switched to Archivo at runtime with an injected `@font-face`.

## Observed

Boxes are `left top right bottom (width×height)` in frame px; "min" is the smallest visible
text in px.

| Design | Baseline | `--scale`×0.95 | body scale 0.95 | body mirror | iframe 0.95 | band fit |
|---|---|---|---|---|---|---|
| lt01 Hairline (lower third, bottom-left) | 120 865 530 961 (410×97), min 24 | 120 869 509 961 (389×92), min 22.8, live identical | 120 869 509 961 | 1390 865 1800 961; replay identical | frame rect 6..1830 × 48..1074 | scale 1 |
| lt63 Broadsheet Band (full width) | 0 883 1920 961 (1920×78), min 21 | 0 887 1920 961 (band stays 1920 wide) | 0 887 1824 961 (gap at right) | unchanged | 0..1824 | 0.875 → min 18.4 |
| qz01 Arena Quiz (centred board) | 470 391 1366 678 (895×287), min 22 | 495 390 1345 664 | 470 405 1321 678 | 554 391 1450 678 | 23..1847 | **0.836 → min 18.4** |
| qz05 | 670 429 1250 628 (580×199), min 26 | 685 427 1235 619 | 670 438 1221 628 | unchanged (centred) | 33..1857 | 1 |
| qz13 Sticker Quiz | 365 376 1543 695 (1179×319), min 32 | 394 376 1514 682 | 365 392 1484 695 | 377 376 1555 695 | 18..1842 | 0.752 → min 24.1 |
| sb01 Match Strip (top centre) | 751 99 1169 161 (418×63), min 40 | 762 99 1158 159 | 751 102 1148 161 | unchanged | 37..1861 | 1 |
| sb14 Volt Status Card | 445 424 1475 657 (1030×233), min 20 | 471 424 1449 657, min 19 | 445 435 1424 657 | unchanged | 22..1846 | 1 |
| Votes board (agent-made, bottom-left) | 120 450 1320 961 (1200×511), min 26 | 120 477 1260 961 | 120 476 1260 961 | 600 450 1800 961 | 6..1830 | **0.47 → min 12.2** |
| Totals board (agent-made, top-right) | 1400 100 1800 477 (400×377), min 28 | 1420 100 1800 458 | 1400 119 1780 477 | 120 100 520 477 | 70..1894 | 0.637 → min 17.8 |

Font swap to Archivo at runtime: lt01 407×96 (from 410×97); qz01 **767×317 (from 895×287)**,
qz13 1179×360 (from 319 tall); sb01 488×56 (from 418×63); the agent boards unchanged in box.
`fitStagedText` exists as a function on the staged boards and was not re-run by the swap.

Every page logged five "Failed to load resource 404" console errors, one per page load, from
the browser's favicon request against the scratch server; no template resource was missing.

## Read

- The authored `--scale` knob keeps the zone anchor and re-lays out live without a replay.
- A body or frame transform about the measured corner matches it for hugging designs and
  survives `stop()`/`play()`; a full-width band shrinks and leaves an edge under it.
- Mirroring by translate puts a left strap at the right safe inset but keeps its left alignment.
- Scaling a board into a lower-third band breaks the 20 px floor on qz01 (18.4), lt63's band
  (18.4), the agent "Votes board" (12.2) and the "Totals board" (17.8); qz13 passes at 24.1 but
  is still a 1179 px wide board, not a strip.
- A runtime family change reflows staged boards; the text fit must be re-run after it.

## Limitations

Seven catalog designs and two agent-made boards, one browser, no fonts missing. The band height
of 240 px is an assumption for "room for people and a score graphic above". Screenshots were not
kept; the numbers above are the measurement.
