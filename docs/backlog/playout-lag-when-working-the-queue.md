---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: unstarted
asked: "I noticed some lag when I was playing out the quiz graphics, moving around the queue, and
  playing and stopping graphics. It's very important that our layout system is lag-free and
  reliable. This is existential for that playout software: that it works well... The lag happened,
  for example, when I tried to play out the graphic. It didn't play out immediately, or it didn't
  stop immediately."
---
# Lag working the queue: take and out did not answer at once

Owner, 2026-09-05, driving quiz graphics on the production dashboard. He is right about the stakes
and they are the reason this is filed rather than fixed off a hunch: **an operator who cannot trust
Take to be instant stops trusting the software**, and no feature makes up for that.

## What was measured, so the next session does not start from zero

On the dev server, one production, three cues, two graphics on air (Windows laptop, 2026-09-05):

- **The click handler is not the cost.** TAKE, Re-take and OUT each return in **0.3-0.4 ms**, and
  are done with their microtasks inside 13 ms.
- **No main-thread jank in the dashboard.** A `longtask` observer across two cue selections
  recorded **nothing** - no task over 50 ms in the host page.
- **But every cue selection rebuilds the preview document.** The preview iframe's `srcdoc` is
  replaced on each selection - **184 KB**, reparsed, with the graphic's fonts, GSAP and the fit
  ladder booting behind it. Measured 18 ms from click to the new `srcdoc`, 29 ms to the iframe's
  `load`; the graphic's own boot after that was not measured and is where the remaining cost has
  to be. This is the one finding that matches "moving around the queue" specifically.
- **Two polls run per stage**: 500 ms for the preview's overflow report, 1000 ms for the program
  monitor's machine state, and the program poll asks EVERY graphic that is up. Each is one
  postMessage round trip into a sandboxed document, so the cost grows with the number of graphics
  on air - which is exactly the state he was in.

**Not reproduced.** Take and Out answered immediately in every attempt here. So this is an open
investigation, not a diagnosed bug, and it needs his case rather than a synthetic one.

## The confound to control for first

The machine was under memory pressure that day: the job queue refused a run for having **3.9 GB
free against a 4.0 GB floor**, and this laptop routinely carries several agent sessions at about a
gigabyte each. A browser swapping will lag on play and stop whatever the code does. Measure with
the sessions closed before concluding anything about the product - and if it only lags under
pressure, that is still worth knowing and is a different piece of work.

## How to actually catch it

Timestamps, not impressions, and taken where the operator's eye is - the PROGRAM monitor:

1. Stamp `performance.now()` in the click handler, when the command reaches the stage, when the
   graphic's `play()` returns, and on the first painted frame of the entrance. The gap that is
   large is the answer; today nobody knows which of the four it is.
2. Do it with the quiz he used - a bound behaviour, drawn state layers, several cues - not a lower
   third. The quiz's drawn states each trigger a re-measure through `svgFitDue` -> `fitSvgText`
   (declared in `src/templates/importedDesign/svg.ts`, called from the drawn-state setter in
   `src/templates/importedDesign/behaviourRuntime.ts`), which is real work on a state change and
   is absent from a simple graphic. There is no `importedDesign/drawnState.ts`; the earlier
   citation named a file that has never existed.
3. Drive the sequence he described: move up and down the rundown, play, stop, play again. If the
   preview rebuild above is the cause, the lag will follow SELECTION rather than the verbs, and
   that is a decisive, cheap experiment to run first.

## The likely first fix, if the rebuild is confirmed

The preview is documented as composed "ONCE per template" (`ProductionPage.tsx` §preview), and the
measurement above says the document is nevertheless replaced on every selection. Either the
memoisation key is finer than the template (so two cues of one graphic each get their own build),
or something upstream of it changes identity per selection. A preview that survives a selection
would make moving around the rundown free, which is the motion he was complaining about.
