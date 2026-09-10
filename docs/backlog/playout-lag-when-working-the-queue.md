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
  The transport fix was then SHIPPED on 2026-09-10 on branch claude/bm-verbs-on-both-roads: a verb
  now leaves the press on both roads and every consumer reconciles them on a client-minted oid, with
  e2e/configured/playout-both-roads.spec.ts as the cover (mutation-tested red before it was
  believed). Re-measured with the same probe: a second surface waits 51 ms for a Take and 52 ms for
  an Out with no slow mode at all, against 131/138 median and a quarter of presses at 404-637 ms on
  the durable road. The sending page no longer waits for the wire at all. What is left is the
  AUTHORISATION trade the fast road makes and the cross-device ordering limit, both stated in the
  section below."
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

**The `wsRow` column is corroborated by a stamp that cannot share its failure mode.** `toPlayed` is
taken inside the graphic's own document when its command handler returns, and in 19 of the run's 20
verb rows it sits within 6 ms of `toWsRow`. The twentieth sat 126 ms apart, which is the bench
picking up a straggler from the settle before it - the reason the frame is now matched to the verb's
own command rather than taken as whichever arrived first. That row's family median is unchanged
either way.

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

**And a command sent moments after the channel joins can be missed entirely.** Seen once in 34
probe takes: the take fired right after `SUBSCRIBED` never arrived over the socket at all, inside a
ten-second wait. `followControlLog` does cover it - it refills on `SUBSCRIBED` and again whenever a
later row leaves an id gap - so on the real page the picture catches up on the NEXT command rather
than staying wrong. With nothing else sent, the floor is the 30-second poll. What that means for an
operator is that the very first Take after opening the page is the one most likely to look ignored,
which is exactly the take a class or a rehearsal starts with.

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

### What shipped, and what each decision came out as

Shipped 2026-09-10 on `claude/bm-verbs-on-both-roads`: `src/control/commandRoads.ts` holds the ids
and the reconciler, `sendControlVerb` in `hostedControl.ts` is the one door a verb leaves by, and
`followControlLog` gained an `onCommand` tap that the dashboard, the hosted control page and the
output renderer all feed into a single `createAppliedOnce`. Every open decision above, answered:

- **How long an `oid` stays in the set.** 400 ids, evicted oldest-first. The log caps a production
  at 50 commands per 5 s (0029), so 400 commands cannot be written in under 40 SECONDS however hard
  a show is driven, against a slow mode of 650 ms. Bounded, with two orders of magnitude of room.
- **A broadcast that arrives and an insert that then FAILS.** Said on the surface. The thrown error
  carries `aired`, and both operator pages word it as "reached the screens but was NOT logged" -
  a different sentence from "failed", because an operator would act differently on each.
- **`liveCue` and the ON AIR marker.** They travel the fast road with the picture: the `cue` row is
  in the same batch, and both surfaces moved their marker handling into the same `applyCommand` the
  stage goes through, so the two cannot disagree for a third of a second.
- **Ordering.** Resolved for one sender, stated as a limit for two. A machine `event` keeps the slow
  road alone, because a clock's shared origin is derived from the row's own server time and a
  broadcast has none - so a graphic that has just been sent an event stays slow for 1200 ms and a
  verb pressed straight after cannot overtake it. ACROSS DEVICES that is not fixable from one
  sender: an event from one operator and a Take from another, inside one fan-out window, can still
  land in different orders on different renderers. The durable log stays the record.
- **A cost check.** One broadcast per verb, alongside the row that was already being written; the
  log's own 50-per-5-s cap bounds it. Nothing else broadcasts - `staged` (debounced typing), the
  renderer's `live` reports and the production data API's server-side rows all stay durable-only,
  which is where the volume actually is.

**The authorisation trade, which was not on the list and should have been.** The command channel is
public, joined with the publishable key, and isolated by its topic being derived from the show id -
the same capability model `realtimeControl.ts` already ships for exported graphics. The show id is
reachable from the OUTPUT capability as well as the control one, so a holder of an output URL, who
could previously only read, can now push a command onto the fast road. The durable log is unaffected
(writing it still needs the control slug and passes RLS) and a forged command is never recorded, but
a read-only URL did become able to move a picture. Removing it needs Realtime Authorization with RLS
on `realtime.messages`, which needs the receiving surfaces to hold a token - and the hosted control
page and the output page are both signed OUT by design. The shape of that fix is to broadcast FROM
the database inside `control_send_many` (`realtime.send`) on a private topic anon may read and not
write; it costs the RPC's own 110 ms on top of the 50, so air would be about 180 ms rather than 80.
That is a row of its own, not a reason to keep half a second.

**CLOSED the same day** on `claude/bn-private-command-topic`, and the estimate above was
pessimistic: it cost about 45 ms, not 110. What it actually took is the section below.

### The fast road becomes a private topic (migration 0056)

The hole was real and a spec now proves it: `e2e/configured/output-url-cannot-push.spec.ts` opens a
browser context holding nothing but the output slug, resolves the show id and the graphic names
from it (`control_output_by_slug` answers both, because a renderer needs them), and pushes a `play`
on every topic reachable from there - public and private, over the socket and over Realtime's REST
broadcast endpoint. Against the road as it shipped that morning, **the renderer played the forged
entrance**: `Expected: "0" Received: "2"`, both the socket frame and the REST one landing (job
j-0981). Nothing was written to the log, exactly as designed - and a graphic still went on air on
every screen at the word of somebody who only ever held a read-only link.

**What changed.** No client broadcasts any more. `control_send_many` emits the command frame itself,
with `realtime.send(...)` on the PRIVATE topic `cmd-<show id>`, inside the same transaction as the
insert. RLS on `realtime.messages` lets anon and authenticated READ that topic shape and gives
nobody an INSERT policy at all, which under RLS is a refusal - so the only writer left is the RPC,
which a sender reaches by holding the CONTROL slug. The sender marks which items may ride, with an
item-level `"fast": true` that the RPC reads for the broadcast and never writes to the log; the
rule for what may be fast stays on the client, where the press is.

Three consequences worth having beyond the boundary itself:

- **A verb that fails to log now airs nowhere.** The two roads commit together, so the "reached the
  screens but was NOT logged" state is gone from every surface except the sending page's own
  monitor, which still applies optimistically. Both pages say that instead, in those words.
- **The public channel keeps carrying the log and nothing else.** No surface binds a command
  handler to `control-<show id>` any more, so a frame pushed there reaches no listener. Realtime
  treats a private topic and a public topic of the same name as different channels and passes
  nothing between them, which is why the two can coexist safely at all.
- **The private join is deliberately not reported as connection status.** It changes how FAST a
  command arrives, never whether it does, so a refused join degrades to yesterday's speed rather
  than reading on screen as a broken production.

### Measured after, with the same probe

Sixteen takes and sixteen outs, 2026-09-10, one client sending and a SECOND client reading - which
is what another operator's page and the output renderer are, and what a broadcast's sender can
never measure about itself (`self` is false, so nobody hears their own frame). Two readings: the
client-broadcast road as `claude/bm-verbs-on-both-roads` shipped it, and the private topic that
replaced it the same afternoon (job j-0982).

| what a second surface waits | client broadcast | PRIVATE topic | durable row |
| --- | --- | --- | --- |
| Take | 51.5 ms (48-59) | **86.9 ms** (72-215, one press) | 136 ms, 2 of 16 past 270 (to 645) |
| Out | 51.6 ms (48-54) | **88.3 ms** (74-107) | 131 ms (128-143) |

Those are the SIGNED-OUT readings, because that is the seat: a browser source in OBS, the venue's
playout machine and an operator's phone on the hosted URL all hold a slug and no account, and the
command topic's read policy names `anon` and `authenticated` separately. The probe used to sign in;
it no longer does, and if anon were ever refused this is the only instrument that would say so. The
same run signed in reads 96.5 and 98.1 ms, which is the difference between two runs rather than
between two roles.

About 30 ms of paint goes on top of all of them, so a published Take now airs in about 120 ms
against the 515 ms this file opened with.

**The private topic costs about 35 ms and it buys the boundary.** The reason it is not slower is
worth knowing: the broadcast arrives at the second client within a millisecond or two of the RPC
answering its own sender (`fastMs` tracks `sendMs` press for press in the raw table), because both
are released by the same commit. The estimate of "the RPC's own 110 ms on top of the 50" was wrong
because it counted that round trip twice.

**The median is still not the point.** The durable road has two modes and picks one unpredictably:
two of these 32 rows landed past twice their own median, out at 645 ms, and the run before it had
five out at 638-788. THE BROADCAST NEVER DID THAT - on either road, and the private one's single
outlier is the first press of a run, the cold connection every column pays. BM's finding holds. The
SENDING page remains faster than any of
them: it applies its own items before the send is awaited, which the minted id is what makes safe.

## How to re-run it

Both roads on their own - thirty seconds, no browser, no dev server, and the one to run AT a venue.
It prints a fast and a slow column per press, which are the after and the before of the same verb:

```
node scripts/playout-wire-probe.mjs [--takes N]
```

The whole dashboard, which needs a job slot and about ten minutes:

```
npm run dev:worktree                                     # the dev server, for the seed only
node scripts/playout-lag-bench.mjs playout-lag-out --seed [--published]
node scripts/playout-lag-bench.mjs playout-lag-out --cleanup     # only after a run that died
npm run build && npm run dev:worktree -- --preview       # the BUILT app, same port
node scripts/playout-lag-bench.mjs playout-lag-out --measure --headless
```

`--cleanup` sits with the DEV SERVER on purpose: it goes through the same door the seed does
(`import('/src/control/hostedControl.ts')`), and a production bundle exposes no module graph, so
run against `--preview` it crashes on the import rather than cleaning anything up.

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
