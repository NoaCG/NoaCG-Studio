---
v: 2
source: owner
kind: ask
raised: 2026-09-05
state: advanced
note: "measured end to end 2026-09-10 on branch claude/bg-playout-lag, which landed the instrument
  (scripts/playout-lag-bench.mjs) and `dev-worktree --preview`, and changed no product code because
  the measurement found nothing in the dashboard to fix. On the BUILT app Take paints
  in 30 ms, Out in 30 ms, a Take straight after moving in the rundown in 30 ms, and nothing freezes
  the page for longer than one frame. On the DEV SERVER, at his own memory conditions, the same
  gestures paint in 85-91 ms and drop three to four frames every time. The PUBLISHED path was then
  measured on 2026-09-10 on branch claude/bj-published-path-lag, which landed
  scripts/playout-wire-probe.mjs: a published Take costs about 160 ms from press to painted frame
  against 30 ms unpublished, and the whole difference is the round trip plus the Realtime fan-out,
  so it scales with the operator's network. It does NOT grow with the show's log, which was tested
  to 50,000 rows and refused. The ask stays open on ONE thing: the optimistic-apply fix, designed
  in the section below and deliberately not shipped in the round that measured it."
needs-owner: none
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
one this file expected: on the app we actually ship, every gesture on the dashboard answers in
about 30 ms, and the lag lives in how the app was being RUN rather than in what it does.

## What the numbers say

Four stamps per gesture in one clock - the capture-phase click, the command reaching the stage, the
graphic's own command handler returning, and the first animation frame after it - plus `froze`, the
largest gap between consecutive animation frames in the host page, which is the freeze an operator
feels. Median of eight rounds, six gesture families interleaved so no family sits in a different
part of the machine's day than another. Milliseconds from the click that PRESSED the thing being
timed. Both tables are the same fixture, the same instrument and the same afternoon.

**The BUILT app** (`npm run build`, then `npm run dev:worktree -- --preview`), 4.25 GB free:

| gesture | to command | to played | to painted | froze |
| --- | --- | --- | --- | --- |
| Take, on a selection that settled | 1.5 | 14.9 | **29.7** | 18.2 |
| Out, on a graphic that is up | - | 15.5 | **30.3** | 18.1 |
| Take, straight after moving - no rebuild | 1.4 | 14.6 | **29.7** | 18.2 |
| Take, straight after moving - with rebuild | 1.5 | 14.2 | **29.1** | 19.1 |
| move within one template | - | - | - | 18.1 |
| move across templates (document rebuilt) | preview's own first frame at 29.4 | | | 18.9 |

**The DEV SERVER**, same fixture, same gestures, 3.67 GB free - which is the condition he reported
from, within a rounding error (3.9 GB on 2026-09-05):

| gesture | to command | to played | to painted | froze |
| --- | --- | --- | --- | --- |
| Take, on a selection that settled | 26.9 | 56.9 | **84.9** | 55.2 |
| Out, on a graphic that is up | - | 59.2 | **86.6** | 57.1 |
| Take, straight after moving - no rebuild | 26.8 | 58.4 | **85.7** | 60.1 |
| Take, straight after moving - with rebuild | 30.4 | 63.7 | **90.8** | 65.3 |
| move within one template | - | - | - | 33.6 |
| move across templates (document rebuilt) | preview's own first frame at 59.4 | | | 34.1 |

Read `froze` against 16.7 ms, which is one frame at 60 Hz: the built app's 18 ms is the sampler
reporting **no freeze at all**, and the dev server's 55-65 ms is three to four frames dropped on
every single gesture. That is the hesitation a person sees. A CPU profile says why in one line:
`jsxDEV` is the top frame in every gesture, and it is the top frame at 71 ms per second and a half
with **nothing pressed at all**. React's development runtime captures a stack per element and
StrictMode renders everything twice. Neither exists in the shipped bundle.

## The three answers

1. **The verbs are not the cost, and neither is stopping.** The command handler inside the graphic
   returns in 0.0-0.1 ms. Out paints in 30.3 ms against Take's 29.7 - the two halves of what he
   reported are the same number, on both builds.
2. **Moving in the rundown first costs the next Take nothing.** 29.7 ms after a selection against
   29.7 ms on a settled one, and 29.1 ms when that selection rebuilt the preview document. The
   rebuild delays the PREVIEW's own first frame and touches nothing else - PROGRAM is a separate
   stage and was never rebuilt.
3. **This file's own "likely first fix" was wrong.** The preview really is composed once per
   TEMPLATE, exactly as `ProductionPage.tsx` §preview documents: moving between two cues of the
   same pool graphic replaced the `srcdoc` **zero times out of eight**, in every run, with the
   observer proved live on each one. The 2026-09-05 observation that "every cue selection rebuilds
   the preview document" was a selection that happened to cross a template boundary each time.

**An earlier pass of this measurement said otherwise, and the instrument was at fault.** It reported
a Take as 33 ms slower after a selection and attributed most of that to the selection's own React
render. It was timing the two-click families from the CUE click, so every one of those numbers
carried Playwright's gap between its own two calls - locator resolution, actionability checks, a
CDP hop. That gap is 34-85 ms and no operator's hand pays it. The bench now times the verb from the
verb's own click and prints the driver's gap in its own column, which is why this file no longer
claims a selection penalty: there is not one.

Production SIZE does not move any of this: the same measurement over a pool of eight graphics and
sixteen cues is within a frame of the pool of three. Neither does memory pressure, on the built app:
at 1 GB free - the machine nearly out - Take still painted in 37 ms and Out in 38.

## So what was he seeing

Two candidates are left, and neither is in the dashboard's own code.

**He was on a dev server.** That is what a session hands him when it drives the app on his laptop,
and the second table says it costs three to four dropped frames per gesture and triples the time to
air - measured at his own memory conditions. **The 2026-09-12 rehearsal must be run off a built
app** - `npm run build`, then `npm run dev:worktree -- --preview` - and not off `npm run dev`. That
is the difference between 30 ms and 85 ms to air, and it needs no code change.

**Or the production was PUBLISHED, and this is the untested one.** Everything above is the OFFLINE
path. On a published production `runVerb` (ProductionPage.tsx) takes a different road: it awaits
`sendHostedControlBatch` - a Supabase RPC - and deliberately does NOT apply the command locally,
because the log follower brings it back and applying twice would double every write. So the
operator's own PROGRAM monitor does not move until a full server round trip plus a Realtime fan-out
has completed. On a venue's wifi that is exactly "it didn't play out immediately", and no amount of
work on the local path can touch it. **Measured on 2026-09-10** on branch `claude/bj-published-path-lag`, with the same instrument
extended to stamp the wire; the numbers and what they mean are the section below.

The round it was NOT measured in recorded `needs-owner: account`, on the reasoning that a
configured backend is an account and therefore the owner's. That was wrong, and it is the mistake
`docs/acceptance/OWNER_QUEUE.md` names: the account already exists, its credentials are in the
main checkout's `.env`, and a linked worktree reaching them is a `cp` (for the dev server vite
serves) plus `read-dotenv.mjs`'s `ambientEnv`, which already falls back to the main checkout for
exactly this. A missing file in a worktree is a technical problem, and a technical problem is
never his.

## What the wire costs, measured

`scripts/playout-wire-probe.mjs`, 2026-09-10, from this laptop against the real backend, eight
takes, 4.3 GB free. It signs in as the E2E account, makes one throwaway production, and presses the
same three-command batch `takeCueItems` sends, through the same RPC and the same RLS:

| from the press | median | range |
|---|---|---|
| `control_send_many` answered | **98 ms** | 80-143 |
| the row back over Realtime | **131 ms** | 127-455 (the first is cold) |
| the Realtime channel joining, once, at page open | 254 ms | |

Add the app's own 30 ms from the table above and a published Take is **about 160 ms from press to
painted frame**, against 30 ms unpublished. The bare HTTP round trip to the project from here is 36
ms median (12 requests, warm connection), so roughly 60 ms of the RPC is server-side and the rest is
the network - which means **the number scales with the operator's network, not with anything in
this repo**. At a venue RTT of 150 ms the same take is 350-450 ms to picture, which is the report.

**Two candidate causes were tested and refused.** The rate-limit check inside `control_send_many`
counts the production's rows in the last five seconds, and `control_events` is indexed on
`(show_id, id)` with nothing on `created_at` - so the obvious guess was that a take gets slower as a
show's log grows, which would have matched "it lagged while I was working". It does not: measured at
0, 2,000, 10,000 and 50,000 rows behind the same production, the RPC stays at 100-140 ms with no
trend. And it is not the graphics or the dashboard, which are the 30 ms at the end.

## If this is to be fixed, the fix is optimistic apply - and here is the part that is not obvious

Apply the command locally the moment the operator presses, send in parallel, and make the
follower's echo idempotent so the returning row does not play the entrance a second time.
`PayloadStage`'s `data-plays` counter exists precisely because a duplicate `play` leaves NO trace on
screen - it re-runs an animation that settles on the picture that was already there - so this is the
change that has already been got wrong once (e2e/configured/hosted-control-recovery.spec.ts).

**The echo cannot be identified by the id the server minted.** The obvious design is to have
`control_send_many` return its inserted ids and have the follower skip them, but the measurement
above kills it: the Realtime row arrives 131 ms after the press while the RPC answers at 98 ms, and
those two orders are not guaranteed - a fan-out that beats its own RPC response would reach a
follower whose skip-set is still empty, and play twice. The skip-set has to be populated BEFORE the
send, which means it cannot contain server-minted ids.

So the reconciliation has to match on CONTENT: a pending queue of `{graphic, msg}` filled before the
send, and a follower that consumes the head of it instead of applying when a row matches. That
brings its own decisions, and they need writing down before code:

- **A send that fails.** `play` cannot be un-played. The honest ending is to leave the local apply
  standing and say so on the surface, because air and the operator's monitor now disagree - which is
  what the unsent-dot on `verb-update` already does for a different case.
- **Two operators, one cue.** Identical commands from two devices are indistinguishable by content.
  Consuming one echo per pending entry is the conservative choice; the alternative double-plays.
- **`liveCue` and the rundown's ON AIR marker** move on the `cue` status row, which comes back the
  same way. Applying the picture optimistically and leaving the marker on the round trip would make
  the two disagree for 130 ms, which is its own bug.
- **The output page and other operators still wait the full round trip**, and always will. This
  fixes the OPERATOR'S OWN monitor only, which is the thing they are looking at when they press.

None of that is hard, but all of it is a decision, and the row that measured this deliberately did
not also ship it. Nothing about the 2026-09-12 rehearsal waits on it: unpublished is instant, and
published is 160 ms on a decent network.

## How to re-run it

The wire on its own - fifteen seconds, no browser, no dev server, and the one to run AT a venue:

```
node scripts/playout-wire-probe.mjs [--takes N]
```

The whole dashboard, which needs a job slot and about ten minutes:

```
npm run dev:worktree                                     # the dev server, for the seed only
node scripts/playout-lag-bench.mjs playout-lag-out --seed [--published]
npm run build && npm run dev:worktree -- --preview       # the BUILT app, same port
node scripts/playout-lag-bench.mjs playout-lag-out --measure --headless
node scripts/playout-lag-bench.mjs playout-lag-out --cleanup     # only after a run that died
```

`--published` signs the fixture in with `E2E_EMAIL` / `E2E_PASSWORD` and publishes it through the
page's own button, so the measure phase really is on the wire; that phase then unpublishes it and
presses the same two verbs again as a local control on the same machine and minute. A LINKED
WORKTREE NEEDS ITS OWN `.env` for this, copied from the main checkout - vite reads the file from
the checkout root, so without it the dev server serves an app with no backend and the fixture
publishes nothing. The scripts themselves reach across on their own (`read-dotenv.mjs`).

The two phases exist because the fixture is built through the app's own modules, which a production
bundle does not expose; the seed saves the browser profile (localStorage and IndexedDB both) and
the measure phase restores it against the same origin. `--pool N` asks the question at the size of
a bigger show. `--measure` pointed at a plain dev server is how the second table above was taken -
the record names whichever build actually answered on the port, not whichever flag was passed.

Free memory is recorded beside every number, because the 2026-09-05 reading was taken on a machine
at 3.9 GB against a 4.0 GB floor and a browser that is swapping lags whatever the code does.

The quiz's drawn states re-measure through `svgFitDue` -> `fitSvgText` (declared in
`src/templates/importedDesign/svg.ts`, called from the drawn-state setter in
`src/templates/importedDesign/behaviourRuntime.ts`), which is real work on a state change and is
absent from a simple graphic - and it does not show up as lag in any family above. There is no
`importedDesign/drawnState.ts`; the citation this file used to carry named a file that has never
existed.
