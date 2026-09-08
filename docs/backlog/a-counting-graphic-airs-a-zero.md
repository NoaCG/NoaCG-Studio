---
v: 1
source: walk
raised: 2026-09-04
state: superseded
note: "REFUTED. 5098bd92 drove the route again on 2026-09-05 - a cold take and a take after an
  out both count with their separators on and settle on the 124,213 that was typed - and named
  the reason this was honestly seen: a browser pane that is not being composited stops calling
  requestAnimationFrame, so every timeline freezes and a counting figure sits at the frame it
  reached. That trap is now written into .agent-workflows/walk.md. 2179f1aa had already reported
  the same non-reproduction from the other side. The gate half of this file, the oracle that
  could not have caught the fault it describes, is served: 2179f1aa takes each expected figure
  from the value the test typed rather than from the live data-target, adds a cold-take pass and
  three assertions including that a take may not rewrite a readout's own figure, and faa3e1f4
  closed four more holes in the same oracle. Nothing here is standing work."
asked: "a Rising Total taken to Program airs 0 and never counts, until an operator presses Update"
---
# A counting graphic taken to air lands on zero, not on its figure - refuted

**The claim below is wrong, and the file is kept for the two things in it that are not.** Read
the `note:` above first. The on-air zero does not reproduce: `5098bd92` walked the same route on
2026-09-05 and Rising Total counts and lands on the operator's figure, and what produced the
reading was an uncomposited browser pane freezing every timeline rather than anything in the
graphic. The gate weakness the file diagnoses further down was real and is closed (`2179f1aa`,
`faa3e1f4`). What survives is the rAF trap, which is now in the walk procedure, and the record of
how a mis-diagnosis reads when it is written up confidently.

**Filed:** 2026-09-04, from the walk of the "Rising Total plays from zero" acceptance item on a
local dev server. Everything from here down is that filing as written, uncorrected.

## Why

A fundraising total reads €0 on air, for as long as the graphic is up, every time it is taken.
This is the most serious thing on this shelf: it is not a rough edge, it is a wrong number in front
of an audience, on a graphic whose whole job is that number. It is deterministic, it reproduces on
every take, and an operator has no way to know it happened except by looking at the board. It is
also a REGRESSION - the fix that removed a one-frame flash put a permanent zero in its place - so
it is newer than anything else here and it has never been on air correctly since.

## What was seen

Route as walked, on `npm run dev`:

1. New graphic, Templates, **Rising Total**, Skip to finish, production **Walk Night**,
   Add it and go there.
2. The cue's fields read `F0 · Total = 124213`, `F1 · Goal = 250000`, `F2 · Kicker = TOTAL RAISED`.
3. Press **Take**.

The panel animates in correctly - three screenshots across the entrance show it scaling and
fading up, so `play()` is running and the entrance timeline is advancing. `TOTAL RAISED` and
`Goal €250,000` both arrive, so the text fields reach the graphic.

**The total reads `€0`, and it stays `€0`.** It does not count. Waiting ten seconds changes
nothing. Taking it out and taking it again reproduces it exactly, every time.

Pressing **✎ Update** repairs it immediately: `€124,213` with the progress bar filled. Take it
out and take it again after that, and it is back to `€0`. So it is deterministic on the take
path and not a race.

The good half of the item is confirmed at the same time, and should not be lost: there is **no
flash of `124,213` before the zero**, on a first take or a second. The 2026-09-03 change did what
it says. It also introduced this.

## The mechanism, as far as reading gets it

`976a96ba` added `tl.render(0, true, true)` to `noacgEntranceTimeline()`
(`src/templates/shared/animRuntime.ts`), so the entrance's opening values - including the zero
rule's `tl.set(el, { textContent: '0' + suffix }, 0)` - reach the DOM synchronously during the
take rather than on the next animation frame. That is the fix, and it is right.

The infographic rebuild reads its figure like this
(`src/templates/infographics/dataRuntimes.ts`, `rebuildInfographic`):

    var raised = parseIgNumber(raisedEl.getAttribute('data-target') || raisedEl.textContent);
    ...
    raisedEl.textContent = raisedText;
    raisedEl.setAttribute('data-target', raisedText);

The `|| raisedEl.textContent` fallback exists for the first play, before any `update()` has
seeded `data-target`. A take builds a fresh document, so `data-target` is absent - and the
element's `textContent` is now already `"0"`, because the entrance wrote it one frame earlier
than it used to. The rebuild therefore reads its own opening zero as the operator's figure,
writes `data-target="0"`, and every count downstream runs `0 -> 0` and lands on `0`.

`infographicStat()` in `src/templates/infographics/igMotion.ts` has the same
`data-target`-or-seed-from-`textContent` shape and the same exposure. Its comment already states
the invariant that has just been broken: *"never from the live textContent: mid-count that reads
'43%' and an interrupted replay would then count up to the wrong number."* Mid-count now starts
during the take.

**This is a guess from reading, not a measurement** - the Program iframe is sandboxed without
`allow-same-origin`, so it could not be instrumented from the page. Whoever fixes it should
confirm the order before changing anything.

## Why this is probably not one design

Every readout that reaches its figure through `data-target` with a `textContent` fallback is
exposed the same way. `dataRuntimes.ts` alone has that pattern at the fundraising total, the seat
count, the majority and total caps, and the turnout ring. The walk only drove Rising Total. **A
sweep is part of the work, not a follow-up to it** - the last two rounds of this same bug were each
filed as one design and each turned out to be the whole class.

**The sweep list is every file in `src/` that names `data-target`**, and it is longer than the
designs:

    src/templates/infographics/dataRuntimes.ts   src/templates/poll/pl01.ts
    src/templates/infographics/igMotion.ts       src/templates/poll/pl02.ts
    src/templates/infographics/shared.ts         src/templates/poll/pl03.ts
    src/templates/infographics/ig05.ts           src/templates/poll/pl04.ts
    src/templates/infographics/ig07.ts           src/templates/poll/pl05.ts
    src/preview/simulatorRuntime.ts              src/templates/poll/pollMotion.ts
    src/validation/readiness.ts                  src/templates/poll/shared.ts
    src/validation/validateTemplate.ts

Take the list from a fresh `grep -rl data-target src/` rather than from this block, which is a
snapshot. The four shared files - `infographics/shared.ts`, `poll/shared.ts`, `pollMotion.ts` and
`igMotion.ts` - are the ones worth reading first: a fault in any of them is the whole class at
once, which is exactly how the previous two rounds were mis-scoped.

## The shape of the fix

The operator's figure has to be captured before the entrance can overwrite it. Two honest
options:

- **Seed `data-target` at composition time**, from the field value, so no runtime read ever needs
  a `textContent` fallback. This removes the fallback rather than defending it, which is the
  reason to prefer it: a fallback that is only correct before the first frame will keep breaking
  every time the first frame moves.
- **Capture before rendering**: have `noacgEntranceTimeline()` seed every readout's `data-target`
  from its live text before `tl.render(0, true, true)` runs. Cheaper, and it leaves the trap in
  place for the next person who moves a frame.

## The gate, and why adding a landing assertion would not help

**The obvious fix here is the wrong one, so read this before writing a test.** `e2e/counting-settle.spec.ts`
already asserts landing - line 241, *"readouts not landing on their own data"*, added precisely so
that "never show the figure" could not be satisfied by never showing it. A second landing gate
would be redundant. (The third pass that plays a graphic out and takes it again came from
`00f2e914`, not from `976a96ba`, which touched only `catalog-baseline.json`, `igMotion.ts`,
`animRuntime.ts` and `tickers/shared.ts`.)

**The blind spot is the ORACLE, not the assertion.** Both passes build their list of readouts the
same way:

    for (const el of d.querySelectorAll('[data-target]')) {
      const target = (el.getAttribute('data-target') || '').trim();
      const value = parseFloat(target.replace(/,/g, ''));
      // A readout counting to zero has no zero form to tell apart from its target.
      if (!isFinite(value) || value === 0) continue;

Two things follow, and together they make this bug invisible to the spec.

- **A readout whose `data-target` has been corrupted to `"0"` is dropped before any assertion
  runs.** The `continue` was written for a graphic whose real figure is zero; it cannot tell that
  case apart from a figure the entrance has just overwritten with a zero. The worse the bug, the
  more completely the sweep excludes it.
- **The landing assertion is tautological.** `target` and `ended` are both read from the same live
  `data-target` at test time, so a readout that counts 0 to 0 against a corrupted target lands on
  its target exactly.

So the gate has to get its expected value from somewhere the graphic cannot rewrite: the field
value the test typed in, or `data-target` captured BEFORE `play()` is called. Assert that a
readout's target has not changed across the take, and the tautology and the exclusion both go.

