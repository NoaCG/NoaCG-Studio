# The placed-text fit stops a little past its slot on Linux Chromium

**Filed:** 2026-10-02. **Source:** measurement, R1.2b.2 CI runs on PR #638.

## Why

Shrink to fit is the broadcast answer to a long name in a drawn slot: the name must stay inside the
artwork. The shared runtime that does it, `fitPlacedText()` in `src/templates/shared/textFit.ts`,
ships inside every imported design and every created text box set to Shrink to fit. On Linux
Chromium it can leave the shrunk line about 5% past its slot, so a Linux playout host (CasparCG's
browser, an OBS browser source on Linux) can show a name running over the artwork it should sit in,
while the same graphic fits on Windows.

## What it would take

The runtime takes up to three proportional passes (`next = current * room / natural`) and stops at
a 55% floor. Linux renders glyphs at whole-pixel sizes, so width does not fall in proportion and the
passes end above the slot. A bounded last step (down by half a pixel or a pixel while the line still
overflows and is above the floor) would converge on both platforms. Keep the floor, the ES5,
comment-rich style (it ships in user templates), and the refit points (update, DOM ready,
`document.fonts.ready`, and the editor preview's stylesheet swap). Reproduce on Linux first (CI or a
Linux container), then tighten the bound in `e2e/editor-typography.spec.ts`'s long-text test from
the slot plus a tenth to the slot, and run the catalog gates `npm run catalog:affected` prints.
Decide whether `ensureTextFitRuntime` should upgrade the runtime text already saved in graphics.

## Evidence

- CI, PR #638, `e2e/editor-typography.spec.ts` "long text": a shrunk 61-character name measured
  842 px in an 800 px slot (run 36993098037), and 1101 px in a 1043 px slot (run 36996643077); the
  save test's bold line 1125 px in 1090 px. The same tests on Windows Chromium fit within 0.5 px.
- The limit is recorded in [the R1.2b.2 receipt](../research/editor-r1-2b-2/README.md).
