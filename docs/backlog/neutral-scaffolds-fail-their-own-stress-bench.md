---
v: 2
source: derived
kind: finding
raised: 2026-09-09
state: unstarted
found: "three of six neutral scaffolds hand the author a bench WARNING they did not cause - and the
  overflow the warning describes is not in the render, so the fault is in the bench's own check"
size: standard
touches: src/validation/runtimeBench.ts
---
# A neutral scaffold fails the bench it ships with

**Filed:** 2026-09-09. **Source:** the time-to-air walk (docs/AGENT_CLI.md, "Time to air,
measured").

## Why

The loop the door teaches is scaffold -> author -> `validate` until clean -> `save`. On the walk
the very first `validate` of an untouched scaffold came back with a warning:

```
OK - 0 error(s), 1 warning(s)
- WARN bench-stress: #f1 extends past .scoreboard-box, the nearest thing painted behind it, once
  every text value is doubled in length - part of the text reads straight against the video.
```

Nobody had edited anything. That is the wrong first impression twice over: it teaches a newcomer
that a warning is background noise to be scrolled past (which is exactly how a real one gets
missed later), and it hands an agent a finding to "fix" in code it did not write, which is how a
scaffold gets mangled in its first minute.

The scaffolds are the house's own work, benched by the house's own bench. If our starting point
cannot survive doubled text, we are asking authors to clear a bar we did not clear.

## What it would take

**The CSS is not the fault. Measured 2026-09-09, and this replaces the guesses that were here
before.** Both candidates this file used to name are dead:

- **`width: fit-content` already works.** `stress.png` from the reproduction below shows the plate
  grown around the doubled text, with `#f1` 24px clear of the box's right edge and 83px clear of
  its bottom. There is no overflow in the picture at all.
- **The `.scoreboard-mask` `min-width: 0` theory is wrong too.** Driving the exported package's own
  runtime through the bench's exact stress sequence - `play()`, then `update()` with the doubled
  values, then measure - `#f1` never leaves `.scoreboard-box`. Four samples, the worst of them
  23.2px INSIDE the box on every side. The `update()` mask pop
  (`gsap.fromTo(mask, {scale: 1.35}, {scale: 1, duration: 0.4})`, which is what a changed score
  fires) was the last plausible way a rect could escape, and it does not: at the 200ms the bench
  measures at, the mask is at scale 0.966.

So the overflow the warning describes does not exist in the DOM the package renders. That points
at **check (a2) in `overflowIssues`, `src/validation/runtimeBench.ts`** - the `bench-unbacked-text`
comparison of `el.getBoundingClientRect()` against `paintedAncestor(el)`. Note that its neighbour,
check (a), deliberately exempts any ancestor whose class matches `-mask` ("Reveal masks clip on
purpose during the entrance"), and (a2) carries no such exemption. That asymmetry is the first
thing to look at, but it is a reading of the code rather than a measurement.

**What is left to do, in order.** The next session's whole job is to close the gap between the
bench's environment and the standalone one, because the package alone is clean:

1. Instrument the bench where it measures (phase `stress`, the `overflowIssues` call) and print
   the two rects it is comparing, plus which element `paintedAncestor` picked. Run it against the
   neutral scoreboard through the studio's own bridge - that needs the dev server, which is the
   one thing the reproduction below could not use.
2. The bench mounts the template in an IFRAME and the standalone run does not. `--scale`, the
   canvas size and the iframe's own box are the differences worth ruling out first.
3. Only once the two rects are on screen does anyone touch anything. If the bench is measuring a
   mid-animation frame, the fix is the mask exemption in (a2) and it fixes all three scaffolds at
   once. If the iframe genuinely renders differently, that is a bigger finding than this item.

`match-board`'s second warning is a separate fault in the same pass: `legibility-secondary-size`,
its clock at 16px against the ~20px TV reading floor. That one is real and is a template fix.

**How far does it reach?** Only the neutral scaffolds were measured. If the cause is the bench, the
catalog designs are affected too and nobody has looked; that is a second measurement, not an
assumption.

## Evidence

Six neutral scaffolds, scaffolded and validated 2026-09-09 against this checkout's dev server
(`npm run dev:worktree`), each untouched between the two commands:

| Type | `validate` |
|---|---|
| `lower-third` | 0 errors, 0 warnings |
| `title-card` | 0 errors, 0 warnings |
| `social-bug` | 0 errors, 0 warnings |
| `scoreboard` | 0 errors, **1 warning** - `#f1` extends past `.scoreboard-box` under doubled text |
| `sponsor-bug` | 0 errors, **1 warning** - `#f0` extends past `.corner-bug-box` under doubled text |
| `match-board` | 0 errors, **2 warnings** - `#f1` and `.scoreboard-clock` overlap 25% under doubled text; supporting text is 16px |

Half of a six-type sample, and the three that warn are the ones with a plate. The remaining
neutral scaffolds were not measured.

**Reproduced again 2026-09-09 (branch `claude/ae-cli-0-3-1`), this time against the LIVE
deployment rather than a dev server**, with the CLI built from that branch:

```
noacg scaffold --type scoreboard --design neutral --out ./sb
noacg validate ./sb --screenshots ./shots
  OK - 0 error(s), 1 warning(s)
  - WARN bench-stress: #f1 extends past .scoreboard-box …
```

Same warning, same wording, on an untouched scaffold. Then `shots/stress.png`: the plate has grown
around "HOME HOME / 888" and "AWAY AWAY / 888" and contains all of it, with visible margin on every
side. Nothing reads against the video.

Then the same package driven directly in headless Chrome at 1920x1080, through the bench's own
stress sequence (`play()`, settle, `update()` with the doubled values, sample at 120ms and 200ms -
the bench waits 120 then 80 - and again at 1.4s):

| when | `#f1` past `.scoreboard-box` (positive = outside) | mask transform |
|---|---|---|
| settled, default data | left -215.4, right -24.0, top -16.0, bottom -83.0 | none |
| 120 ms after `update()` | left -350.4, right -23.2, top -15.2, bottom -82.2 | scale 1.0258 |
| **200 ms - where the bench measures** | left -352.2, right -25.0, top -17.0, bottom -84.0 | scale 0.9662 |
| 1.4 s after `update()` | left -351.2, right -24.0, top -16.0, bottom -83.0 | none |

Every number negative, i.e. inside, against a bench threshold of +2px. The scaffold's step count is
1, so the bench presses `next` zero times and this sequence is the whole stress phase.
