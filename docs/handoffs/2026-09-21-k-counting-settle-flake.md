# K - the counting-settle flake

Branch `claude/k-counting-settle-flake`, forked from `da821d84`. The ask came from row B's run on
2026-09-21, where `e2e/counting-settle.spec.ts` (canvas) failed once in a 1145-test run and then
passed 5 of 5 alone.

## Cause

It was never a race. The canvas test sat at 97% of its budget on an idle machine. The baseline
run alone took 2.9 minutes against a 180-second cap, so any real load pushed it over.

The sweep finds counting designs by scanning each composed document for the text `data-target`.
For the canvas recipe it scanned the document composed with `simulate: true`, which serializes
the simulator runtime into the page. `runSimCommand` in `src/preview/simulatorRuntime.ts` has a
comment containing the words "data-target", and dev mode keeps comments. So every one of the 527
catalog designs matched, and the sweep rendered all of them, at about 330 ms each, where it should
have rendered only the counting ones. The thumbnail recipe had no such text and took 10 seconds.
The floor `designs > 30` could not notice, because 527 is also above 30.

I measured this with a throwaway probe spec. Every simulate document contained the mark, iframe
loads were 15-70 ms, and the sleeps made up the rest.

## Fix

This is commit `ffd84389`, and it touches only the spec. Both recipes now discover the mark in
the plain `composeDocument(tpl, {})`, the way the played and re-take passes already did. A new
ceiling fails the test if the mark ever matches half the catalog again, so a repeat shows up as
a named assertion instead of a timeout.

## Evidence

- **Reproduced on the old spec under load.** With the canvas test alone at `--repeat-each 4
  --workers 4`, 2 of 4 hit the 180-second timeout (job j-1625).
- **Fixed spec under the same load.** The canvas test passed 20 of 20 at `--repeat-each 20
  --workers 4`, taking 18-21 seconds each where it took 3.0 minutes before (j-1627).
- **The gate command.** `--repeat-each 10 --workers 1` passed 50 of 50 in 32.4 minutes (j-1632).
  I cancelled the second copy (j-1633) because five other sessions were waiting behind it on a
  machine at its RAM floor, and the loaded run below covers the same ground.
- **The whole file under load.** `--repeat-each 4 --workers 4` passed 20 of 20 (j-1634).
- `npm run build` exited 0.

## Check

The review was delegated and came back clean. Its scope matched: 1 file, base `da821d84`. The
simplify pass ran inline because the skill returned fan-out instructions, and it found nothing
to change. Verification was also inline, using the build and the runs above. Taste does not
apply, because no graphic changed.

## What is left

- **Nothing in this spec.** The played and re-take passes take 43 seconds and 1.3 minutes
  against caps of 240 and 300 seconds, so they have plenty of room.
- **A product note, outside my scope.** The simulator document runs a `requestAnimationFrame`
  loop (`tickPlayhead` in `src/preview/composeDocument.ts`) that posts a playhead message to the
  parent on every frame, even when nothing is playing. That is cheap per frame, but it never
  stops while an editor canvas is open. Someone could look at it if canvas idle cost ever
  matters. I did not measure it.
