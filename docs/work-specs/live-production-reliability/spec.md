# Live production reliability (studio session, 2026-11-23)

Status: draft. The owner's studio feedback of 2026-11-23 named five areas. This record holds the
root causes found, what the first branch fixed, and the projects that follow, in priority order
with their dependencies. Each project lands on its own through `/queue-merge`.

## Root causes found

### Votes (critical)

1. **A phone's first vote could be lost without a word.** The phone page loaded the Supabase
   library only when it first sent something. The library is a code-split file named by content
   hash, and the host serves only the newest deploy's files, so a phone that opened the join page
   before a deploy got a 404 on its first vote. The send threw, `voteNow` never cleared its busy
   flag, every option stayed greyed out and no message appeared. Reproduced in a browser before
   the fix (a client whose `vote` throws leaves both options disabled and no note). `main` lands
   about once an hour, so a deploy during a session of several hours is likely.
2. **Going live again continues the same count** (owner decision O1, interaction spec). A phone
   that voted in the first run still holds that vote and shows it picked. Tapping the same option
   again changes nothing, so the total grows only by phones that never voted before. Run as a
   fresh vote, this reads as votes going missing. Nothing said so at the press.
3. **A vote was a tap**, with only a pressed option as feedback, so neither viewer nor operator
   could tell a deliberate vote from a stray touch.
4. Risks found, not seen failing: the vote guard refuses more than 300 phone votes per round in
   any 10 seconds (0035, 0113), which a large room voting at once can reach; a browser with
   storage blocked mints a new device token per page load, so a reload is a second voter.

### Playout readiness (high)

Outputs play only what the published payload carries. A graphic added to a published production
changes only the saved record. Automatic updates (`auto_publish`, `partial_writes`) are built but
still switched off in production, so the new Join and result cards waited for the next publish.
The status read green "Ready" meanwhile, because unpublished changes were not a status state; the
only sign was the header's Publish changes action. A Take then failed on the output
("not published").

### Companion and Stream Deck

The green "Panel ✓" means this page holds the panel lease. It is set when any non-revoked key is
listed and says nothing about whether Companion is connected: there is no module heartbeat. The
module stops for good, with no retry, when its first backend discovery fails (network not up at
start), when pairing hits a network error, or when hello is refused for an unexpected reason; it
recovers only when its config is saved again. A rotated public key reads as "offline" forever.
The package holds no key, so downloading it again is only needed for "Update the NoaCG module".
Revoke permanently disables one key; the module then says "Panel key revoked. Pair again."

### Several operators

Team productions (one account per person) save with compare-and-swap and a three-way merge, and
name the teammate whose change won. One account on several devices is last-writer-wins, with a
known silent overwrite path (`src/backend/sync.ts` "STILL OPEN") and issue #2562. Rundown edits
reach other operators by a 15 s poll. A five-person staging run on 2026-11-20 lost 18 of 52 Takes;
the fixes since (#2655, #2671, #2617, #2615) have not been run again with people.

## Fixed on the first branch

- Phone votes and answers go out as a plain request, like the join page's read: no library to
  load, and every outcome is an answer, never a throw.
- The phone page recovers from any failed send and says "Not sent. Check your connection and try
  again."
- A tap picks; **Vote** sends. The phone then reads back what the server holds ("Your vote: B
  Away") and offers **Change vote** while the question is live.
- Go live on a vote that has votes says "Its earlier N votes still count. For a fresh count, Stop
  and Clear results, or Duplicate it."
- The operator tally shows each option's share beside its count, and the total under it.
- The playout status turns amber and names each graphic the outputs do not have yet.
- Revoke arms on the first press and explains itself; the panel chip's tooltip says what it shows.

## Projects

### P1. Verifiable voting (now; depends on nothing)

- AC-1: A producer sets per question whether a submitted vote can be changed (default: can change
  until Stop). The database enforces it: a second vote from the same device is refused when
  changes are off. Layer: configured suite.
- AC-2: Stop freezes a snapshot (counts, total, phone and chat apart, closed time) that a result
  cue and the operator read from; a later write cannot move it. Layer: configured suite.
- AC-3: The operator can download a closed question's votes as CSV (time, option, source, a
  per-device key that is not the token). Layer: configured suite.
- AC-4: The operator sees votes refused by the burst cap, and the cap is sized for the largest
  room a production expects (measured, not guessed). Layer: configured suite plus a measure.
- AC-5: "Run again" on a question offers Continue the count or Start a new count, where a new
  count keeps the earlier result readable instead of deleting it. This revisits O1 and needs the
  owner's word first.
- AC-6: A configured journey runs one question twice from three phones and asserts the totals the
  operator, the phones and the result cue each show.

### P2. Playout readiness without republishing (now; independent of P1)

- AC-1: Decide and run step 10 of `docs/work-specs/live-publishing/phase-9-checklist.md`: switch
  on automatic updates, then partial writes, after one studio rerun of the five-person scenario.
  This is the designed answer: every save publishes in parts and outputs take new graphics in at
  once, with on-air graphics kept until cleared.
- AC-2: Until then, adding a graphic to a published production publishes it by itself when the
  only change is new graphics, so nothing already published changes. Needs an additive publish
  path (a new part and a head patch that only adds); today a publish carries every saved edit.
- AC-3: A configured journey adds a Join card to a published rundown and Takes it on `/output`
  without pressing Publish (`e2e/configured/audience-live.spec.ts`).
- AC-4: The rundown marks each cue whose graphic is not on the outputs yet.

### P3. Shared interaction model and question builder (next; after P1)

- One lifecycle for every kind: draft, live, stopped, revealed, and resolved for kinds with an
  outcome. Each kind is a pure module with its option schema, answer schema, tally, change policy
  and graphic bindings, mirrored by one server function. New kinds store answers in one generic
  table; the existing vote and word tables stay.
- Builder: one row per option with remove and drag to reorder; Enter adds a row; pasting several
  lines makes several rows; correct answer and points appear only for kinds that use them; the
  live phone preview sits beside it, rendered by the real join renderer.
- Kinds, in order of value for live production: Prediction (a vote plus an outcome set after the
  event, feeding a leaderboard); Quiz (correct answer, points, nickname, leaderboard graphic);
  Rating scale (average on one big-number graphic); Q&A upvotes on the existing moderation;
  Multiple select. Ranking and points allocation are for workshops and come last.

### P4. Companion connection health (built; module 0.4.0 awaits its release)

- AC-1: The module retries every start and transport failure with backoff and reads `panel.json`
  again after repeated 401 or 403.
- AC-2: The module reports a heartbeat with its version and state; the page shows Companion
  connected, Companion not seen since a time, Key refused, or Needs an update, and is green only
  for the first.
- AC-3: Pair again is one step from a refused key, and deleting a production says its panels
  will need pairing again.

What landed:

- Module (`companion-module/src/panel.ts`, version 0.4.0): one connect step that every start and
  transport failure retries on the backoff (1, 2, 4, then every 8 s): backend discovery, a pairing
  exchange that hit the network, a hello that failed or was refused for a reason other than the
  key, and a dropped channel. Only a revoked or unknown key ends it ("Panel key revoked. Pair
  again."), and a pairing code the server refused. Three calls in a row refused by the gateway
  (HTTP 401 or 403) close the client and read `<address>/panel.json` again. Unit tests:
  `companion-module/src/__tests__/reconnect.test.ts`.
- Heartbeat: `panel_seen` (migration 0128) every 15 s, and on a change of status, with the module
  version and status; at most one write per key in 2 s. A revoked key's report is stored and
  refused, so the page can name it. `panel_list` answers `seen_s`, `module_version`,
  `module_status` per panel and `refused_s`. A module before 0.4.0 never reports and keeps working.
- Page: the header chip and the live dock, while the page answers the panel, read the list every
  8 s (`src/control/companionHealth.ts`): "Companion connected" (green, a report in the last 45 s),
  "Companion not seen since 14:32" or "not seen yet" (amber), "Companion reconnecting" (amber, the
  module reports it is offline), "Companion needs an update" (amber: a module that reports
  `outdated`, or one that has said hello and never reported), "Panel key refused, pair again"
  (red). The panel dialog shows the same line, each panel's own state, and a Pair again button
  beside a refused key. Node test: `scripts/companion-health.test.mjs`; configured walks:
  `e2e/configured/panel-relay.spec.ts` (the RPC) and `panel-production-page.spec.ts` (red after a
  revoke, Pair again).
- Help (`companion-module/companion/HELP.md`): pair again for a refused key; a new module download
  only for "Companion needs an update".
- Open: AC-3's second half (deleting a production says its panels need pairing again) is not built.
  The module 0.4.0 release is a run of the Release NoaCG Companion module workflow by the owner
  after this lands; until then every module in use is 0.3.0, so the page reads "Companion needs an
  update" for a Companion that has connected.

### P5. Several operators (next; testing first)

- Run the studio scenarios below with three, then five people on a team production, one account
  each, and record Takes lost and press-to-air time.
- Close the one-account-on-several-devices overwrite (`src/backend/sync.ts`, #2562) or refuse
  that setup with a clear message.

## Studio test plan for the next session

1. Three phones vote, the question stops, goes live again, two phones change their vote: totals
   on the operator panel, the phones' read-back and the result cue agree.
2. Duplicate the question and run it: it starts at zero.
3. Deploy during the session (or reload one phone after a deploy) and vote from a phone opened
   before it.
4. Add a Join card to the published rundown: the status names it in amber until published.
5. A and B edit different cues; then the same cue; then both reorder. Both see what won.
6. A and B Take the same graphic within a second: one airs, the other is told why.
7. Restart Companion with the network down, then up: note whether its buttons recover.

## Precautions until P1, P2 and P4 land

- Use a team production with one account per person. Do not share one account across devices.
- One playout operator owns Take and the Stream Deck; one person publishes; one runs audience
  questions; at most two people edit the rundown, never the same cue.
- Publish after adding any graphic, sound or card, and wait for the status to leave amber.
- For a fresh vote on the same question, Stop and Clear results, or Duplicate it.
- Ask the audience to press Vote and check "Your vote" on their phone.
- If Companion's buttons show errors while NoaCG is green, open Setup, Panel and pair again; a new
  module download is needed only when Companion says to update it. From module 0.4.0 the header
  is green only while Companion reports in, and says which of the two is needed.
