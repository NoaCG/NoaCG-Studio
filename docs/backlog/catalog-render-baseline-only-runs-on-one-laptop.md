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

The `#count` and the `.noacg-data-source` holder are almost certainly the operator speed control
and the first-frame paint arriving as real elements. Whether that drift is CORRECT is the
question the spec exists to force somebody to answer - *"A token substitution cannot do this —
investigate before re-recording"* is its own error message - and for eight commits nobody was
asked, because on Linux the question was never put.

## Shapes

- **Record the baseline where the gate runs.** Re-record on Linux in CI and let the Windows
  laptop be the one that skips. The fingerprint stops being reviewable by the person who changed
  the design, which is the cost.
- **Two recorded platforms**, keyed by `process.platform`, each compared where it applies. Twice
  the file and twice the re-recording, but the gate then runs everywhere.
- **Keep it laptop-only and make the SKIP loud** - report it in the run summary and fail the
  weekly freshness check when the recorded platform is not CI's. Cheapest, and it converts a
  silent hole into a visible one rather than closing it.

The third is the smallest change and the first is the real fix; whichever is chosen, the nine
credits records have to be investigated and re-recorded deliberately, not swept up with it.

## Not this branch's work

Found while verifying `claude/agents-refs-text-box-3b934b`, whose only `src/templates/` edits are
five source comments. Reported rather than fixed: re-recording somebody else's rendering change is
exactly what the error message says not to do.
