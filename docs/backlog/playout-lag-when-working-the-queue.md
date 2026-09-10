---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: advanced
note: "measured end to end 2026-09-10 (commit 95bade71, scripts/playout-lag-bench.mjs). On the
  BUILT app Take paints in 29 ms and Out in 30 ms, the preview rebuild costs one frame, and nothing
  freezes the page longer than a frame; on the DEV SERVER the same gestures cost 93-214 ms and
  freeze it for 60-100 ms every time. The ask still stands because the PUBLISHED path - where a
  verb is a Supabase round trip before the operator's own monitor moves - is untested and needs a
  configured backend."
needs-owner: account
asked: "I noticed some lag when I was playing out the quiz graphics, moving around the queue, and
  playing and stopping graphics. It's very important that our layout system is lag-free and
  reliable. This is existential for that playout software: that it works well... The lag happened,
  for example, when I tried to play out the graphic. It didn't play out immediately, or it didn't
  stop immediately."
---
# Lag working the queue: take and out did not answer at once

Owner, 2026-09-05, driving quiz graphics on the production dashboard. He is right about the stakes:
**an operator who cannot trust Take to be instant stops trusting the software**, and no feature
makes up for that.

**Measured end to end on 2026-09-10** with `scripts/playout-lag-bench.mjs`. The headline is not the
one this file expected: on the app we actually ship, the dashboard is instant, and the lag lives in
how the app was being RUN rather than in what it does.

## What the numbers say

Four stamps per gesture in one clock - the capture-phase click, the command reaching the stage, the
graphic's own command handler returning, and the first animation frame after it - plus `froze`, the
largest gap between consecutive animation frames in the host page, which is the freeze an operator
feels. Median of six rounds, five gesture families interleaved. Milliseconds from the click.

**The BUILT app** (`npm run build`, then `npm run dev:worktree -- --preview`), at 4.1 GB free:

| gesture | to command | to painted | froze |
| --- | --- | --- | --- |
| Take, on a selection that settled | 1.9 | **28.9** | 19.0 |
| Out, on a graphic that is up | - | **29.6** | 18.1 |
| move within one template | - | - | 18.2 |
| move across templates (document rebuilt) | - | preview's first frame 32 | 19.4 |
| move, then Take at once - no rebuild | 36.8 | 62.1 | 18.4 |
| move, then Take at once - with rebuild | 52.8 | 78.8 | 19.3 |

**The DEV SERVER**, same fixture, same gestures, at about 2 GB free:

| gesture | to command | to painted | froze |
| --- | --- | --- | --- |
| Take, on a selection that settled | 28.1 | **93.2** | 63.6 |
| move, then Take at once - no rebuild | 112.3 | 182.2 | 72.6 |
| move, then Take at once - with rebuild | 134.4 | 213.8 | 72.2 |

Three to seven times slower, and it freezes the page for 60-100 ms on every single gesture - which
is lag a person sees. A CPU profile of the dev server says why in one line: `jsxDEV` is the top
frame in every gesture, and it is the top frame at 71 ms per second and a half with **nothing
pressed at all**. React's development JSX runtime captures a stack per element, and StrictMode
renders everything twice. Neither exists in the shipped bundle.

## The three answers

1. **The verbs are not the cost, and neither is stopping.** The command handler inside the graphic
   returns in 0.0-0.1 ms, and Out paints in 29.6 ms against Take's 28.9 - the two halves of what he
   reported are the same number. Nothing here freezes the page for longer than a single frame.
2. **The cost follows SELECTION, but the preview rebuild is not it.** A Take pressed immediately
   after moving in the rundown paints at 62 ms instead of 29. Of that 33 ms, **16 ms is the
   document rebuild and the rest is the selection's own React render**: the family that moves
   WITHIN one template - where no document can be replaced - is 62 ms, and the one that crosses a
   template boundary is 79 ms. One frame apart.
3. **This file's own "likely first fix" was wrong.** The preview really is composed once per
   TEMPLATE, exactly as `ProductionPage.tsx` §preview documents: moving between two cues of the
   same pool graphic replaced the `srcdoc` **zero times out of six**, in every run. The 2026-09-05
   observation that "every cue selection rebuilds the preview document" was a selection that
   happened to cross a template boundary each time. Replacing the document when the graphic
   genuinely changes is not optional and costs one frame.

Production SIZE does not move any of this: the same measurement over a pool of eight graphics and
sixteen cues is within a frame of the pool of three, and the host still never freezes past 20 ms.
Neither does memory pressure, on the built app: at 1 GB free - the machine nearly out - Take still
painted in 37 ms and Out in 38.

## So what was he seeing

Two candidates are left, and they are not in this code.

**He was on a dev server.** That is what a session hands him when it drives the app on his laptop,
and the table above says it costs 60-100 ms of frozen page per gesture before anything else goes
wrong. Under the memory pressure this machine routinely carries it is worse. **The 2026-09-12
rehearsal must be run off a built app** - `npm run build`, then `npm run dev:worktree -- --preview`
- and not off `npm run dev`. That is the difference between 29 ms and 93 ms to air, and it needs no
code change.

**Or the production was PUBLISHED, and this is the untested one.** Everything above is the OFFLINE
path. On a published production `runVerb` (ProductionPage.tsx) takes a different road: it awaits
`sendHostedControlBatch` - a Supabase RPC - and deliberately does NOT apply the command locally,
because the log follower brings it back and applying twice would double every write. So the
operator's own PROGRAM monitor does not move until a full server round trip plus a Realtime fan-out
has completed. On a venue's wifi that is exactly "it didn't play out immediately", and no amount of
work on the local path can touch it. **Nobody has measured it**, because this checkout has no
backend configured (`.env` absent, `.env.bench` blank) - it needs a real Supabase project and a
published production. That measurement is the next piece of work here, and it should be taken with
the same instrument against `playwright.live.config.ts`'s configured mode.

If the round trip IS the cost, the shape of the fix is already visible and is not free: apply the
command locally at once and make the follower's echo idempotent. `PayloadStage`'s `data-plays`
counter exists precisely because a duplicate `play` leaves no trace on screen, so "just apply
locally too" is the change that has already been got wrong once.

## How to re-run it

```
npm run dev:worktree                                     # the dev server, for the seed only
node scripts/playout-lag-bench.mjs playout-lag-out --seed
npm run build && npm run dev:worktree -- --preview       # the BUILT app, same port
node scripts/playout-lag-bench.mjs playout-lag-out --measure --headless
```

The two phases exist because the fixture is built through the app's own modules, which a production
bundle does not expose; the seed saves the browser profile (localStorage and IndexedDB both) and
the measure phase restores it against the same origin. `--pool N` asks the question at the size of
a bigger show.

Free memory is recorded beside every number, because the 2026-09-05 reading was taken on a machine
at 3.9 GB against a 4.0 GB floor and a browser that is swapping lags whatever the code does.

The quiz's drawn states re-measure through `svgFitDue` -> `fitSvgText` (declared in
`src/templates/importedDesign/svg.ts`, called from the drawn-state setter in
`src/templates/importedDesign/behaviourRuntime.ts`), which is real work on a state change and is
absent from a simple graphic - and it does not show up as lag in any family above. There is no
`importedDesign/drawnState.ts`; the citation this file used to carry named a file that has never
existed.
