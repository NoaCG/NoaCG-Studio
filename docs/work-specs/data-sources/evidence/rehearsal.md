# C7 rehearsal: every AC-16 route in software

Gates C7 (row 14 of the production-page plan run): data-sources AC-16's software half, with the
Twitch regression and audience-flow AC-5 and AC-9. Made by the C7 builder on 2026-10-22 from a
Claude cloud session, on branch `claude/plan-production-page-p14-build`.

## What "in software" means here

- **The local stack.** Offline journeys (`e2e/`) run the app on its local provider: the production,
  its data tree, its Sheet, feed and message readers and its PROGRAM monitor all run in the page,
  and PROGRAM is the same renderer the published browser output runs (`PayloadStage` over
  `createOutputStage`). Configured specs (`e2e/configured/`) run against a local Supabase stack
  in GitHub Actions (`configured-suite.yml`): publish, the command log, the operator door, the
  production-data key and the server tick, with the stack's own test secret. Production's tick
  switch was not touched and stays off.
- **The fake Bridge.** `e2e/_fakeBridge.ts` answers as NoaCG Bridge and CasparCG for the server-cue
  journeys (folders, the clock, the server's slot readings). No real CasparCG, Bridge or OBS ran:
  those walks are the laptop helper's on C7's merge SHA (non-gating) and parent phase S's real
  studio receipts.
- **Sheets, feeds and YouTube are stubbed** in every journey (the test serves the CSV, the feed or
  the API answer itself). Real-provider receipts are Q's and the earlier phases' records in this
  folder, plus the YouTube live smoke below.
- **One production per route, not one production for all.** Each route is proven by the journey
  that already walks it, on its own fresh production, as the C7 brief directs ("reuse existing e2e
  journeys and configured specs as the evidence where they already prove a route; add a journey
  only where a route has none"). The spec's "one rehearsal production" is therefore the union of
  these journeys on one build. A single production carrying every route at once is not walked in
  software; the laptop helper's and phase S's walks are where a combined production runs.
- **Simulation versus target capture.** Every PROGRAM reading below is the page's own monitor, a
  simulation of the output fed the same commands. No picture was captured from a target output
  (CasparCG, OBS or a browser source on another machine). Where the page cannot know what an
  output shows, it says so: "logged", never "confirmed"; "this page only" before Publish; "not
  confirmed" while a send is owed; the stale-picture overlay on a lost connection (C6).

## App revision

The rehearsal ran on the PR's reviewed head; its SHA, the CI runs and the configured run are in
"Runs" at the end of this file.

## Routes

Each route is recorded separately. "Pass" means the named journey or test ran green on this build
in the run named under "Runs"; a route nothing proves is "unverified", never a pass. New in C7 is
marked **(new)**.

| Route | Proven by | What it shows | Result |
| --- | --- | --- | --- |
| Pasted rows | `e2e/production-data.spec.ts` "Paste rows fills a ticker, a schedule, standings and credits…" | ticker, schedule, standings and credits filled from pasted cells; malformed rows flagged; only Take airs; reload keeps them | pass |
| A Sheet ticker | `production-data` "Connect data previews the whole graphic…", "twelve Sheet rows reach a ticker on air…" | whole-graphic connect in one confirmation; twelve rows reach a running ticker with no new entrance; an emptied tab clears it | pass |
| Schedule, standings and credits from a Sheet | `production-data` "Sheet tabs fill a schedule, standings and credits on air…" **(new)** | each board connected to its own tab; each tab's change reaches its board on air; no new entrance | pass |
| A feed | `production-data` "a pasted news feed fills a ticker…"; `scripts/feed-source.test.mjs`; `e2e/configured/feed-route.spec.ts` | headlines fill a ticker; a failed fetch keeps the list and says since when; two readers make one upstream fetch | pass |
| A pushed score | `e2e/configured/production-data-key.spec.ts` "Another system: the card key pushes…"; `scripts/data-pause.test.mjs` (the sender); offline, `production-data` "Another system connects a whole graphic in one confirmation…" connects the graphic and generates the sender but pushes nothing | the card key pushes a connected graphic; Pause holds every write; Resume sends the final values once | pass, on the configured spec alone: it is quarantined on main (#1608), and it ran and passed in the configured run below |
| A guest row | `production-data` "a guest row loads into a lower third and airs on Take…" **(new)** | one table row fills one cue; Take airs it; editing and deleting the row leave PROGRAM as taken | pass |
| Pasted messages | `e2e/production-audience.spec.ts` "a pasted message airs exactly as prepared…"; `e2e/configured/audience-live.spec.ts` "a pasted message on a published production…" | the prepared version airs; a second message, an edit and a new arrival cannot change it; published through the operator door | pass |
| Sheet messages | `production-audience` "a message Sheet: rows arrive as candidates…"; `audience-live` "a message Sheet on a published production…"; `scripts/sheet-messages.test.mjs` | rows become candidates; reorder, edit and identical rows keep identity; a vanished row keeps a used candidate | pass |
| YouTube comments | `scripts/youtube-comments.test.mjs` on Q's recorded shapes; `e2e/production-chat-intake.spec.ts` "YouTube comments: one press brings the newest 100…", "…a refusal says what to do next", "…a source removed while its fetch is out…" | on Q's recorded shapes | pass on the Node test. The journey spec is quarantined (#1595), so CI does not run it on a branch; its three comments journeys passed in this worker's local run (see "Runs"). No live comments call in C7; the live receipt is Q's |
| YouTube live chat | `scripts/youtube-chat.test.mjs` on recorded shapes; the live smoke below; `production-chat-intake` "YouTube live chat: the first page arrives as earlier…" | the app's own reader on a public stream in the smoke | pass on the Node test and the live smoke (24 new lines in 3.5 minutes, nothing dropped). The journey is quarantined (#1595) and failed in this worker's local run, as filed |
| Twitch chat (regression) | `scripts/twitch-chat.test.mjs` **(new)** on `scripts/fixtures/twitch/anonymous-read.json` | the existing anonymous reader on recorded IRC frames, through the intake | pass; one defect found and fixed (below) |
| A staged vote | `production-audience` "the vote reaches air the same way a question does…"; `audience-live` "the published walk…" **(new)** | votes counted; staging writes a cue and stops; only Take airs | pass |

### PROGRAM after each disturbance

| Disturbance | Proven by | Result |
| --- | --- | --- |
| Source edit | Sheet: "Connect data previews…", "one Sheet score on two boards…"; messages: "a pasted message airs exactly as prepared…"; guest row **(new)**; Sheet messages; audience C3 | pass: a connected value follows; a prepared message and a taken row do not |
| Source delete | "an emptied tab clears it" (ticker); "a vanished row leaves an unused candidate and keeps a used one"; guest row deleted **(new)** | pass |
| Duplicate arrival | `scripts/sheet-messages.test.mjs` (refresh, reorder and reconnect never duplicate); `scripts/twitch-chat.test.mjs` (a re-delivered line is dropped and counted) **(new)**; "YouTube live chat… a reconnect adds nothing twice"; `audience-live` (two adds of one id make one row); "a message prepared while the rundown cannot save… prepares once on retry" | pass |
| Pause | "Connect data previews… Pause"; "the Playout sources line… pauses there"; `production-data-key-tick` "holds a Pause from the row"; `production-data-key` "Pause holds every write" | pass |
| Disconnect | "Connect data previews… Disconnect"; `scripts/sheet-source.test.mjs` "a late read after Disconnect writes nothing"; `scripts/feed-source.test.mjs` "an answer that arrives after Disconnect or Stop writes nothing" | pass |
| Reload | "a bound field takes the LIVE value on air…" (the tree survives a reload); "Paste rows…" (reload keeps pasted rows); "the audience workspace survives a workspace round trip and a reload"; "a reader stopped in one browser…"; `production-data-key-tick` (Pause shows after reload) | pass |
| Operator-page closure | `e2e/configured/production-data-key-tick.spec.ts` (with the page gone, the server tick reads a published source whose lease expired, skips a leased one, holds a Pause from the row) | the spec checks the rows the tick writes to the command log, not PROGRAM or an output picture; on the local stack with its test secret; production's switch untouched. Pass |

### Custom graphics, overrides and readers

| Case | Proven by | Result |
| --- | --- | --- |
| Custom graphic, whole Sheet | "a graphic downloads its data template…", "Connect data previews the whole graphic…"; real receipt `evidence/sheet-custom-slots.md` (C1c) | pass |
| Custom graphic, API | "Another system connects a whole graphic…"; `scripts/data-pause.test.mjs` (paths per field, the sender, a failed acquisition sends nothing); `production-data-key` "Another system…" | pass |
| Manual scalar override | "one Sheet score on two boards…: a ± press moves the shared value until its cell changes"; "a ± press on a bound field moves the shared value…" | pass |
| Reader handover | `scripts/sheet-source.test.mjs` "handover: an expired lease is read once by the next tab…"; `scripts/feed-source.test.mjs` "a second waits out the first's lease…"; `production-data-key-tick` | pass |
| Unchanged and changed cells | "the Playout sources line… tells checked from changed"; "one Sheet score on two boards…" (an unchanged cell keeps the override, a changed one wins); `sheet-source` handover | pass |
| Delayed responses | `scripts/sheet-source.test.mjs` "an old owner's answer after the lease moved writes nothing…", "a page that slept past its lease with a read in flight writes nothing…"; "YouTube comments: a source removed while its fetch is out adds nothing when the answer lands" | pass |
| Pause and Resume | `production-data-key` "Pause holds every write and says so, Resume sends the final values once"; `scripts/data-pause.test.mjs`; `scripts/feed-source.test.mjs` "Resume or Connect reads at once" | pass (configured spec quarantined, see Known issues) |

### Independence, groups and what is confirmed

| Case | Proven by | Result |
| --- | --- | --- |
| A quiz reveal while its independent clock continues; a bound value update neither resets the clock nor advances the quiz | `production-data` "a quiz revealed beside a running clock…" **(new)** | pass: a quiz and a scoreboard bound to the data; the quiz revealed while the scoreboard's clock runs; a data write changes both values on air; the board stays exactly as revealed, the machine stays in Reveal, the clock runs on from where it stood and its machine still reads running |
| All together with a failed child and conflicting layers | `e2e/playout-folders.spec.ts` "All together: one Take starts every cue in it, a refused one is NOT TAKEN with why…", "All together names the children that collide on one layer…", "All together, refused before anything is sent…" | pass: each child's outcome is listed; a collision is named and the Take refused before anything is sent (the existing replacement policy) |
| Selection, staged, pending and confirmed | `e2e/production-controls.spec.ts` "the selected cue is still identifiable once it is on air…", "SPACE previews first…", "± LIVE NUMBERS bumps a figure on air without publishing other staged edits", "published, a Take is pending until the command log answers, then logged, never 'on air confirmed'…" | pass |
| Disconnect leaves no apparently fresh live image | `production-controls` "…a lost connection dims PROGRAM (C6)"; `e2e/playout-feedback-health.spec.ts`; `e2e/playout-clock.spec.ts` "the Bridge gone mid-clip: the count carries on, and says estimated after three seconds" | pass |
| Simulation versus target, unknown status | `production-controls` "before Publish, TAKE says it reaches this page only and PROGRAM stays labelled NOT PUBLISHED (C6)"; `e2e/configured/playout-status.spec.ts` | pass in software; no target capture (see the top of this file) |

### Recorded only by later walks

A ticker, a schedule, a standings board and credits watched updating through the actual
CasparCG/NoaCG Bridge route and an ordinary OBS/browser source; the actual consumer used in
production; Bridge and CasparCG versions, channels and layers on a real server, fonts and assets
on a target, Take/Update/Continue/Out on CasparCG and OBS, stacked graphics on a real output, and
a real restart or reconnect: **unverified in C7**.

**Browser outputs, in software.** No test here loads the published output page and watches a
*data* update arrive on it. What is proven: published data updates are written to the command log
as ordinary update rows (`production-data-key-tick`, `production-data-key-dispatch`), and the
published output renderer applies update rows from that log (`e2e/configured/scorebug-output.spec.ts`
"a published scorebug takes a score bump and a running clock on the real output renderer", and the
other `*-output` configured specs). The two halves are each proven; the combination on one output
page is **not walked in C7**.

The real-output items above are the laptop helper's scratch walks on C7's merge SHA (non-gating)
and parent phase S's real-studio receipts. The fake Bridge journeys above cover the page's side of
the same verbs.

## Audience AC-5: the published walk

`e2e/configured/audience-live.spec.ts` "the published walk: a phone sends a message and a vote, the
presenter view follows, and only Take airs" **(new)**, on the local stack: a production with a poll
board is published; the join link from Setup › Links opens in a 390 × 844 touch browser, which has
no horizontal scroll; the phone sends a message, which appears under "What you sent" and in the
operator's inbox; the presenter link opens and reads "Nothing queued yet."; pointing "Now" at the
message changes the presenter view to it and nothing goes on air; a vote opens, the phone votes,
the operator's tally reads 1, staging writes the vote cue and nothing goes on air; selecting the
cue airs nothing; Take airs the question and its options. Result: **pass** on its first run (24 s,
configured run below). Findings: none.

## Audience AC-9: provider support, stated honestly

- **YouTube comments and live chat** work with a key alone (Q's `evidence/youtube.md`). In CI they
  run on Q's recorded shapes; C7 added one live smoke of the app's own live chat reader (below).
- **Twitch** is the existing anonymous IRC-over-WebSocket reader (`src/audience/twitchChat.ts`).
  C7 regression-checks it on recorded frames in Node (`scripts/twitch-chat.test.mjs`). The frames
  are written in Twitch's IRC wire format (tags, numerics, PRIVMSG, CTCP ACTION, PING, USERNOTICE,
  CLEARCHAT, USERSTATE) with invented channel, names, ids and text: no live Twitch session was
  opened, because the live Twitch check is an owner-list item. No new Twitch work was done beyond
  the one fix below, and none blocks the run.
- No other platform is offered. Manual copying (Paste) is the route for everything else and is
  not claimed as a connector.

## YouTube live smoke

One smoke of the app's own live chat reader against a public 24/7 stream, with the shared key
(`YOUTUBE_API_KEY`, read from the session's environment and never printed or stored). Run on
2026-10-22 from 19:20:46 UTC for 3.5 minutes, on the offline dev server of this branch at
`e53b7e7` (the reader is unchanged since), driven by a one-off Playwright script that was not
committed: an unpublished production, Messages, "YouTube live chat", the stream `4xDzrJKXOOY`
(the one Q found live), the key typed in, Connect. Recorded: counts, status words and timings
only; no message text, names or ids.

| Seconds after Connect | In the inbox | Marked "earlier" | New | Source line |
| --- | --- | --- | --- | --- |
| 1 | 75 | 75 | 0 | 75 in · 0 dropped |
| 61 | 83 | 75 | 8 | 83 in · 0 dropped |
| 121 | 88 | 75 | 13 | 88 in · 0 dropped |
| 211 | 99 | 75 | 24 | 99 in · 0 dropped |

- Calls: 2 `videos` lookups and 40 `liveChat/messages` pages, every one answered 200. The gap
  between pages was 5,146 to 5,800 ms (median 5,284 ms): the 5-second floor held.
- Units at the documented cost: 2 + 5 × 40 = 202, plus 2 for a lookup made before the smoke to
  check that the stream was live: **204 units** of the shared key's 10,000, under the 600 allowed.
- The quota line read "About 2 h 46 min of chat left today…" at the start and moved down a minute
  at a time, as the browser's own spend grew.
- No error detail appeared on the source.
- Shorter than the ten minutes allowed: the job queue caps an uncommitted one-off browser job at
  five minutes. Ten minutes would add pages, not a new kind of evidence.

Result: **pass** for the YouTube live chat route on a live stream, as far as a key alone reaches
(Q's record). The YouTube comments route was not called live in C7; its live receipt is Q's.

## Findings

1. **Fixed: a Twitch chat line containing " 366 " was dropped.** The reader took any line holding
   ` 366 ` as the server's end-of-names reply, so a message such as "We counted 366 votes" never
   reached the inbox and reset the reconnect ladder. Found by the new fixture test; the numeric
   must now be the IRC command (`/^(?:@\S+ )?:\S+ 366 /`, an optional tag block, then the server, then the numeric). Blocking for the Twitch route's honesty (a
   silent drop), small and in the reader under test, so fixed and retested here.

2. **No other defect found.** Every new journey passed on its first run except the quiz walk,
   whose first cut asserted a class the reveal itself replaces (a test error, corrected: the walk
   now compares the whole board before and after the update). In the local affected-spec run two
   journeys failed, both already filed (#1595, #1603), and nothing else did.
3. **Observed, not a defect:** a clock's reading survives a re-take of its graphic, because the
   clock resumes from its stored start time. A check that only reads the clock cannot tell a
   re-take; the quiz walk also reads the graphic's machine state for that reason.

## Known issues touching these routes (filed, not re-fixed)

- #1586 (P3): the Playout sources line can scroll out of sight on a short screen. Touches the
  Sheet, feed and API routes' status line; the journeys run at the suite's window size.
- #1595 (P2): the YouTube live chat reconnect journey can start the chat twice in one tab under
  load; `e2e/production-chat-intake.spec.ts` is in `e2e/quarantine.json`. Touches the YouTube live
  chat route; the live smoke above ran the reader on its own.
- #1596 (closed): the configured suite's agent-access spec was red; named for completeness, no
  route here depends on it.
- #1602 (P3): the feed route's tests do not pin the whole CGNAT range or the stale-row claim
  filter. Touches the feed route.
- #1603 (P2): "Connect closes only once the save landed" fails on main. Touches the Sheet connect
  route; the other Connect journeys prove the route.
- #1606 (P3): no conformance case pins the Pause snapshot of an untouched path. Touches the API
  Pause/Resume route.
- `e2e/configured/production-data-key.spec.ts` is quarantined (#1608, a fail-then-pass on one
  commit). On main it reds nothing; on a branch dispatch, as here, it runs as any spec does, and
  both its tests passed.

## Runs

All on branch `claude/plan-production-page-p14-build`.

| What | Revision | Run | Result |
| --- | --- | --- | --- |
| The whole configured suite, local Supabase stack (`configured-suite.yml`, dispatched) | `e53b7e7` | [39838648044](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39838648044) | 124 passed, 0 failed, 0 flaky, 3 skipped (the allowed skips in `expected-run.json`); the new published walk among them |
| The full offline suite (`ci.yml`, dispatched with no base, so every shard) | `86ebdd9` | [39843292132](https://github.com/NoaCG/NoaCG-Studio/actions/runs/39843292132) | 15 of 15 E2E shards green with no retry; Build, Factory gates and CI gate green |
| Node, this worker | `86ebdd9` | `node --test scripts/twitch-chat.test.mjs scripts/chat-intake.test.mjs scripts/youtube-chat.test.mjs` | 22 of 22 |
| Affected offline specs, this worker (job queue) | `21256cc` | `production-data`, `production-audience`, `production-chat-intake` | 65 passed, 2 failed, both filed: `production-chat-intake.spec.ts:311` (#1595) and "Connect closes only once the save landed" (#1603) |
| The four new journeys after the review edits, this worker | `21256cc`, `86ebdd9` | `production-data.spec.ts -g …` | all pass |
| YouTube live smoke, this worker | `e53b7e7` (reader unchanged since) | one-off, uncommitted | pass, above |

`e2e/configured/` is unchanged between `e53b7e7` and `86ebdd9`, so the configured run covers the
same specs; the commits after it touch only `scripts/`, one line of `src/audience/twitchChat.ts`,
`e2e/production-data.spec.ts` and this folder's evidence.

What the full offline run does not include: the specs in `e2e/quarantine.json` leave the PR and
dispatch shards and run only on main (`quarantine.yml`). For this rehearsal that is
`e2e/production-chat-intake.spec.ts` (#1595), so its YouTube journeys are evidence only from this
worker's local run, as the YouTube rows say; `e2e/rundown-history.spec.ts` and
`e2e/wizard-shell.spec.ts` are the other two and prove no route here.

The app revision of the rehearsal is therefore `86ebdd9` (offline) and `e53b7e7` (configured),
and the merge commit that lands this file carries both unchanged.
