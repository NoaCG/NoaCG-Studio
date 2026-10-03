---
v: 2
source: agent
kind: finding
raised: 2026-10-03
state: unstarted
---
# The wizard preview's blank detector reads one slow frame as a 400 ms blank

**Filed:** 2026-10-03, from the flaky-tests row. **Source:** measurement.

## Why

`e2e/wizard-preview.spec.ts` "the preview keeps the artwork on the stage across a step change"
failed under load in row CY's run, and again here: 1 of 54 in `--repeat-each 6 --workers 4`
(the whole spec), at `blank after Fields -> Animation: 403` against `< 400`. A detector that fails
on a busy machine teaches people to re-run it, and then it no longer guards the afterimage it was
written for (1.2 to 1.5 s blanks before it, 41 to 52 ms after).

## What was seen

The failing film, Fields to Animation, at the spec's 12x CPU slowdown:

```
7310ms   21.9% ink      (the afterimage)
                        (no frame for 4 s: nothing painted, the page was busy)
11399ms   0.5% BLANK    (the new document's first frame)
11802ms  21.2% ink
11836ms  21.8% ink
```

One blank frame, then the next frame 403 ms later. The blank window is counted from the first
blank frame to the next frame with ink, so the whole gap to the next painted frame is charged as
blank. Frames after it come every 15 to 35 ms again.

## Not decided

Whether that 403 ms was really on screen cannot be told from this film. Either the page did not
paint for 400 ms after the entrance's first frame (the entrance starts from nothing on purpose,
and under 12x slowdown on a loaded machine one frame can take that long, which would make the
blank real and the bound too tight for the slowdown), or the screencast sent nothing because its
previous frame was not yet acknowledged (then the camera was blind and the blank is an artefact).

## What it would take

Record each screencast frame's arrival and acknowledgement times beside its paint time, and run
the spec under load until it fails again. If the gap is acknowledgement backlog, charge a blank
only for the time the camera could see. If it is real paint time, decide the bound against the
slowdown the spec applies: the defect it guards against measured 1.2 s and more, so the bound has
room to move without losing it.
