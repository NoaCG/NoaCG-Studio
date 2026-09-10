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
  scripts/playout-wire-probe.mjs and the wire columns on the bench: on the built app a published
  Take paints in 515 ms and Out in 397 ms, against 30 ms for the same production unpublished in the
  same browser a minute later. The large gap is the Realtime fan-out, not the RPC - postgres_changes
  delivers in either ~130 ms or ~600 ms, bimodally, in every client including an empty page, and the
  OUTPUT page follows the same road so AIR is late too. A broadcast message on the same backend is
  50 ms with no slow mode. It does NOT grow with the show's log, tested to 50,000 rows and refused.
  The ask stays open on ONE thing: the transport fix designed in the section below, deliberately not
  shipped by the round that measured it, two days before the rehearsal."
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
work on the local path can touch it. **Measured on 2026-09-10** on branch
`claude/bj-published-path-lag`, with the bench extended to stamp the wire; it is half a second, and
the round trip turned out to be the smaller half of it. The numbers are the section below.

The round it was NOT measured in recorded `needs-owner: account`, on the reasoning that a
configured backend is an account and therefore the owner's. That was wrong, and it is the mistake
`docs/acceptance/OWNER_QUEUE.md` names: the account already exists, its credentials are in the
main checkout's `.env`, and a linked worktree reaching them is a `cp` (for the dev server vite
serves) plus `read-dotenv.mjs`'s `ambientEnv`, which already falls back to the main checkout for
exactly this. A missing file in a worktree is a technical problem, and a technical problem is
never his.

## What the published path costs, measured

`scripts/playout-lag-bench.mjs --seed --published` then `--measure`, 2026-09-10, the BUILT app on
this checkout's port, a published production on the real backend, five rounds, about 5.0 GB free.
Every column is from the VERB'S OWN click and each is cumulative, so a step's cost is one column
minus the one to its left:

| family | toRpcSent | toRpcDone | toWsRow | toCommand | **toPainted** | froze |
|---|---|---|---|---|---|---|
| take-idle | 0.2 | 149.5 | 497.3 | 498.4 | **514.9** | 18.7 |
| out-idle | 0.2 | 98.8 | 385.3 | - | **396.9** | 18.3 |
| take-after-rebuild | 0.2 | 126.5 | 391.4 | 394.1 | **397.1** | 18.7 |
| take-after-no-rebuild | 0.2 | 114.1 | 332.0 | 333.9 | **345.3** | 18.2 |
| take-idle, UNPUBLISHED | - | - | - | 1.5 | **29.6** | 18.1 |
| out-idle, UNPUBLISHED | - | - | - | - | **31.8** | 18.1 |

The last two rows are the same production, unpublished in the same browser in the same minute, so
the comparison carries no machine drift. The selection families in that run measured 3.4-3.8 ms to
`srcdoc` and 28-29.5 ms to the preview's first frame, matching the 2026-09-10 built-app table above
- the machine was healthy. Nothing froze the page for longer than one frame interval anywhere.

**A published Take paints in about half a second. Unpublished it paints in 30 ms.**

**THE LARGE GAP IS NOT THE RPC, IT IS THE FAN-OUT.** The send is answered at 100-150 ms and the row
comes back at 330-500 ms, so the round trip to the database is the smaller half and the delivery of
the row back to the browser is 220-350 ms of it.

### Where that 350 ms actually lives

Three clients, all measured on 2026-09-10 on this machine, all pressing the same three-command batch:

| client | RPC answered | row back over `postgres_changes` |
|---|---|---|
| Node, no browser (`scripts/playout-wire-probe.mjs`, 18 takes over two runs) | 98-112 | median **131**, one outlier per run at 455-635 |
| an EMPTY Chromium page on the app's origin (10 takes) | 117 | median **132**, but four of ten at 495-652 |
| the real dashboard, built app (20 takes) | 114-150 | **332-497** |

So the fan-out is **bimodal - about 130 ms or about 500-650 ms** - and it is bimodal in every client
including one with nothing on the page. It is not the dashboard's code, not Chromium, and not this
laptop's network: the bare HTTP round trip to the project is 36 ms median. It is `postgres_changes`
itself, which reaches a subscriber through the Realtime server's WAL watch and a per-subscriber RLS
re-check. The dashboard lands in the slow mode more often than an idle page does, and that gradient
is not explained here.

**Supabase's other transport does not have the problem.** A `broadcast` message from one signed-in
client to another on the same channel, twelve sends: **50 ms, range 49-55**. It touches no table and
no WAL. That is a tenth of the slow mode and half of the fast one, and it never varies.

**Two candidate causes were tested and refused.** The rate-limit check inside `control_send_many`
counts the production's rows in the last five seconds, and `control_events` is indexed on
`(show_id, id)` with nothing on `created_at` - so the obvious guess was that a take gets slower as a
show's log grows, which would have matched "it lagged while I was working". It does not: measured at
0, 2,000, 10,000 and 50,000 rows behind the same production, the RPC stays at 100-140 ms with no
trend. And it is not the graphics or the dashboard, which are the 30 ms at the end.

### The half of this that optimistic apply cannot fix

The OUTPUT page - what the audience and the stream see - follows the same log over the same
`postgres_changes` subscription. So **air is 330-500 ms behind the press too**, and no amount of
applying locally on the operator's dashboard touches that, because the output page never sent
anything to be optimistic about. On a published production the picture on screen is up to half a
second behind the finger that took it, for everybody.

## The fix: send the picture over broadcast, keep the log as the truth

This is the standard Supabase shape and the measurement above is what argues for it. A verb becomes
TWO sends from the same click: a `broadcast` on the production's channel, which every operator page
and the output page apply on arrival (50 ms), and the `control_send_many` insert exactly as today,
which stays the durable, ordered truth that recovery, the tail and a late-joining renderer read.
Nothing is removed. The log keeps being the thing that is right; the broadcast is the thing that is
fast. It fixes **air**, not only the operator's own monitor, which optimistic apply cannot.

**The reconciliation is the whole design, because a duplicate `play` leaves NO trace on screen** -
it re-runs an animation that settles on the picture that was already there. `PayloadStage`'s
`data-plays` counter exists for exactly that reason, and it is why this has already been got wrong
once (`e2e/configured/hosted-control-recovery.spec.ts`).

**It cannot be reconciled on the id the server minted.** The obvious design is to have the RPC
return its inserted ids and have the follower skip them, and the measurement kills it: the row can
arrive before the RPC that created it answers, reaching a follower whose skip-set is still empty.
Any skip-set has to exist before the send does.

**So the command carries its own id, minted by the client.** `control_events.msg` is `jsonb` and
`control_send_many` validates only `t` and `graphic` before inserting `msg` verbatim, so an extra
key rides along with no migration: mint an `oid` per command, put it in the `msg`, send it on both
roads. Every consumer keeps a small set of applied `oid`s and applies each one ONCE, whichever road
brought it first. That is symmetric - it does not care which arrives first - and it degrades to
today's behaviour exactly when the broadcast is lost, because the durable row still comes.

What still has to be decided before code:

- **How long an `oid` stays in the set.** It has to outlive the slow mode (650 ms measured, so
  seconds not milliseconds) and be bounded, because a long show is thousands of commands.
- **A broadcast that arrives and an insert that then FAILS.** The picture moved and the log does not
  agree. `play` cannot be un-played; the honest ending is to say so on the surface, which is what the
  unsent dot on `verb-update` already does for a different case.
- **`liveCue` and the rundown's ON AIR marker** move on the `cue` status row. If the picture goes
  fast and the marker stays on the log, the two disagree for a third of a second, which is its own
  bug - the `cue` row has to travel the same two roads.
- **Ordering.** The log is ordered by id; broadcasts are not. Within one verb the batch is applied
  in the order it was sent, which is fine, but two verbs a few milliseconds apart from two devices
  could land in different orders on different pages. The durable row is the tiebreak, and what that
  means for a page that already applied the other order needs stating.
- **A cost check.** Broadcast messages are billed and rate-limited separately from database rows.

**This was deliberately not shipped by the round that measured it.** It changes the live playout
path two days before the 2026-09-12 rehearsal, it needs its own configured e2e cover against a real
backend (a double-play is invisible, so the gate is the `data-plays` count, as in the recovery
spec), and the measurement is worth landing on its own. Nothing about Saturday waits on it: an
unpublished production is 30 ms today.

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
