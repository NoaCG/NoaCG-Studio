# The catalog RENDER baseline only ever runs on the machine that recorded it

**Filed:** 2026-09-08. **Source:** measurement, while verifying an unrelated branch - the check
ran on a Windows laptop, failed, and the failure turned out to belong to `main`.

## Why

`e2e/catalog-baseline.spec.ts` keeps two baselines. The SOURCE one is byte-exact and
platform-free, and it guards emitted-code drift everywhere. The RENDER one fingerprints the laid
out DOM, so it is bound to the OS font rasterizer - and the spec handles that honestly, by
recording `platform` in `e2e/catalog-render-baseline.json` and skipping the comparison anywhere
else:

```ts
test.skip(typeof recordedOn === 'string' && recordedOn !== process.platform, …);
```

The recorded platform is **`win32`**. CI runs Linux. So the render half has never executed in CI:
it runs only when somebody happens to run the full suite on a Windows checkout, which is rare and
unscheduled. A gate that fires on one person's laptop and nowhere else is not a gate, and the skip
is silent - a skipped spec exits 0, which is the same trap `e2e/AGENTS.md` records as "a suite that
skips itself exits 0".

## What it already cost

The baseline was last recorded at `aa15e625`. Since then **eight commits** touching
`src/templates/endCredits/` and `src/templates/shared/` have landed on `main`:

```
086a8086  Move the template contract out of src/model/wizard.ts, behind a re-export shim
257d14fd  Open the credits travel with one pose, whether or not the design has a mark
7f4c9f17  Keep the credits' closing pose through an update, and centre the mark on what is visible
8248d9be  Measure the credits travel off the rendered rects, and pin it with a spec
cde2a2da  Give credit rolls an operator speed, and run them all the way through
00f2e914  Paint the first frame on every operator cue, not only on the take
976a96ba  Stop a graphic showing its old figure for a frame when it is taken again
18a37a5b  Update re-arms a running countdown, and the output readout only appears when there is an output
```

Run on Windows today, the render comparison fails on nine end-credits designs, each with two
elements the baseline never recorded:

```
cr01: 2 element(s) — #count, body>div.credits.credits--minimal[1]>div.noacg-data-source[4]
cr02 cr03 cr04 cr06 cr08 cr11 cr12 cr13   (same shape)
```

**That drift is settled, and the answer arrived on 2026-09-10** (branch
`claude/bp-catalog-drift-after-the-shim`). It was the operator speed control
and nothing else - the first-frame paint guessed at above is not involved. `cde2a2da` (2026-09-06)
appends a `<div class="noacg-data-source">` holding the speed value to nine credits designs, and
`1a9269c0` with `4b6642e5` (2026-09-09) does the same to fifteen tickers; the count is 24, not the
9 above and not the 26 the failure appears to print. Each commit re-recorded the SOURCE baseline
beside it and left this one behind. The holder is `display: none`, its rect is `0,0,0,0`, and its
fingerprint is identical to a holder already in the file, so nothing a viewer can see moved at all.
The baseline is re-recorded on that branch and the spec is green here again.

The proof rests on two counts. The designs whose emitted HTML changed in those three commits are
exactly the designs that drift, 24 and 24 with none left over, and in each one the drift is one
new holder key, the last in document order, with the element count up by exactly one. And of the
9,793 elements the render comparison covers across all 504 designs (no design reaches the spec's
80-element cap, so there is no unmeasured tail), none moved in computed style or rect after the
flex-gap shim landed. That clears the shim positively rather than by elimination.

**What that settles is one instance. It does not touch the Why above**, and the four days the red
stood are the argument for it: nine designs went red on 2026-09-06, fifteen more on 2026-09-09, and
the first person to READ the red was on 2026-09-08 - verifying an unrelated branch, exactly as this
file was. Two separate sessions then filed two separate backlog items reasoning towards defects
that were not there: this one guessed the first-frame paint, and
`catalog-render-drift-after-the-flex-gap-shim.md` (filed 2026-09-10 on
`claude/bn-private-command-topic`, PR 233 - delete it once that branch lands) blamed the flex-gap
shim that happened to land the same morning. Two rows spent on a red that had nowhere to speak.

## Shapes

- **Record the baseline where the gate runs.** Re-record on Linux in CI and let the Windows
  laptop be the one that skips. The fingerprint stops being reviewable by the person who changed
  the design, which is the cost.
- **Two recorded platforms**, keyed by `process.platform`, each compared where it applies. Twice
  the file and twice the re-recording, but the gate then runs everywhere.
- **Keep it laptop-only and make the SKIP loud** - report it in the run summary and fail the
  weekly freshness check when the recorded platform is not CI's. Cheapest, and it converts a
  silent hole into a visible one rather than closing it.
- **Run it daily against `main` on the laptop, and let the morning brief speak the red.**
  `docs/ROUTINES.md`'s `daily-morning-brief` already runs at 07:00 Helsinki to answer whether the
  morning needs a person, and already defaults to silence. A fourth line - "the render baseline is
  red on main, N designs" - turns a four-day hole into one morning without changing the gate at
  all. Two constraints: it drives a browser, so it goes through `npm run queue` rather than
  straight into the routine (one such job per machine), and it needs a checkout on `main` that is
  not the primary one, because the root contract forbids reading or building there. A routine that
  queues a read-only job and reports its exit code is still reporting, but it stretches "routines
  report, sessions write" far enough that the rule should be read before writing it.

The third and fourth are the small changes and the first is the real fix. The fourth is the one
that addresses what this actually cost: the gate was never wrong, it just had nowhere to say so.

Whichever is chosen, note that a Linux recording was tried once and CI was red for a day on font
rasterization alone (the spec's own comment records it), so anyone taking the first or second shape
has to prove a fingerprint is stable across repeated runs on the runner image before recording one.

Already landed, and worth knowing before starting: the baseline now records the DAY it was taken,
the failure message prints that day and hands over
`git log --since=<that date> -- e2e/catalog-baseline.json`, and a drifted key the baseline never
had is marked `+` and shown first. That shortens the wrong path a reader takes. It does not close
it, because it still needs a person to be standing there reading.

## Reading a red from this gate

**A `#count` move means the markup changed, not the look.** It is the loudest line in the render
failure, and a computed style or a rect cannot change how many elements a design has - only the
DOM can. A `display: none` holder's record is a constant (rect `0,0,0,0`, everything else
inherited), so a holder key in the drift list means a holder was added or removed, never that one
moved.

**Before filing a backlog item about a red here, grep the shelf for the problem rather than the
symptom.** The 2026-09-10 row searched for the drift, found
`catalog-render-drift-after-the-flex-gap-shim.md`, and drafted a third item. This file owned the
problem the whole time, filed under the GATE two days earlier, and only a code review caught the
duplicate. With 231 files on the shelf that day, a name you would have chosen yourself is not a
reliable search.

## Not this branch's work

Found while verifying `claude/agents-refs-text-box-3b934b`, whose only `src/templates/` edits are
five source comments. Reported rather than fixed: re-recording somebody else's rendering change is
exactly what the error message says not to do.
