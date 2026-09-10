# 2026-09-10 - row BJ, what a published production's verbs cost

Branch `claude/bj-published-path-lag`, on the worktree `agent-a901bde5ea093cca0`. Seven commits
off `747c2fbb` (the merge of pull request 220, which is BG's row and this branch's fork point),
build green, CI green with the E2E shards correctly skipped (this branch touches no `src/`, and
`e2e-affected.mjs` keys entirely on `src/`, `e2e/**` and `scripts/e2e-durations.json`).
`/check` passed - `review: delegated`, `simplify: inline`, `verify: inline`, `taste: not
applicable`.

## What the row was asked and what came back

BG measured the LOCAL path and left the published one untested. It is measured now, and it is worse
than the hypothesis expected: **a published Take paints in 515 ms and Out in 397 ms, against 30 ms
and 32 ms for the same production unpublished in the same browser a minute later.** No product code
changed.

**The round trip is the SMALLER half.** The RPC is answered at 100-150 ms; the row comes back at
330-500 ms. So 220-350 ms of every published verb is the Realtime fan-out, and the tables are in
`docs/backlog/playout-lag-when-working-the-queue.md`.

**That fan-out is `postgres_changes`, and it is bimodal - about 130 ms or about 600 ms.** Measured
three ways on the same machine: from Node with no browser, from an EMPTY Chromium page on the app's
own origin, and from the real dashboard. All three see the two modes, so it is not the dashboard's
code, not Chromium, and not this network (the bare HTTP round trip to the project is 36 ms).

**A `broadcast` on the same backend is 50 ms, twelve out of twelve, no slow mode.** That is what
makes the fix a transport change rather than a local-apply trick.

## What is left, and why

**The fix is designed and deliberately not implemented.** The design is in the backlog under "The
fix: send the picture over broadcast, keep the log as the truth", with the five decisions it still
needs. Three reasons it did not ship here: it changes the live playout path two days before the
2026-09-12 rehearsal; a doubled entrance is INVISIBLE on screen, so it needs its own configured e2e
cover keyed on `data-plays` the way `e2e/configured/hosted-control-recovery.spec.ts` is; and the
measurement is worth landing on its own.

The one thing to read before writing a line of it: **the echo cannot be reconciled on the id the
server minted.** The obvious design - have `control_send_many` return its ids and skip them coming
back - loses a race this row measured, because the Realtime row can arrive before the RPC that
created it answers, reaching a follower whose skip-set is still empty. Any skip-set has to exist
before the send. The way out is a client-minted `oid` inside `msg`: `control_events.msg` is `jsonb`
and the RPC validates only `t` and `graphic` before inserting it verbatim, so it needs no migration.
The wire probe already proves that works - it carries its own `take` marker through the RPC and
reads it back off the row.

## Evidence and traps that exist in no repo file

**BG's `needs-owner: account` was wrong and is corrected in the backlog's front matter.** The
account exists, its credentials are in the main checkout's `.env`, and a linked worktree reaching
them is `cp C:/claude/NoaCG-Studio/.env .env` (vite reads the file from the checkout root, so
without the copy the dev server serves an app with no backend) plus `read-dotenv.mjs`'s
`ambientEnv`, which ALREADY falls back to the main checkout for exactly this. That fallback is not
as old as the file - `envRoot` arrived two commits later, in `122b0fb1` ("Let every bench find the
machine's .env when it runs from a worktree") - but it has been there since, and it was there when
the receipt was written. Nothing was ever the owner's here.

**I edited `docs/backlog/playout-lag-when-working-the-queue.md`, which my prompt's TRAPS told me not
to.** The reason given was that BG's queued branch owned it this wave. That branch landed as pull
request 220 twelve minutes before this row started; I fast-forwarded onto it, so there was no branch
left to conflict with - and the `needs-owner` line the prompt told me to correct exists in no other
file. Flagging it rather than burying it: if another row was told to fold something into that file
tonight, it is merging against my version.

**The queue refused this bench for over an hour, and the refusal was right twice over.** The floor
first read "only 0.8 GB RAM free, needs 4.0", then "2 run(s) outside this queue" - another session
(`agent-aa65267b7ed99afcc`, the caspar row) was running two `configured/live` suites against the
SAME backend and the same E2E account. `e2e/configured/hosted-control-recovery.spec.ts` deletes
every show it can see; overlapping would have risked my published fixture and confused their
assertions. **Do not force past that particular refusal on a live-backend job.**

**The 4 GB floor is a name-based guess and `--cost 0.5` is the documented way out.** The classifier
prices anything matching `*-bench*` as a full suite because `SWEEP_SCRIPTS` says so. This bench is
one `chromium.launch`, one context, one page - a `walk` by `jobs-store.mjs`'s own definition, which
halves the floor to 2 GB. That is the lesson j-0888 paid for on 2026-09-09 ("the session KNEW its
job was not a suite and had no way to say so"); it now has a way, and this row used it.

**A finished bench job can be recorded as `failed`.** j-0917 ran to completion, printed both summary
tables and wrote `playout-lag-out/playout-lag.json`, and the store recorded
`"exitCode": null, "reapedAsDead": true`. Read the log before believing the state - and the same
job's numbers are the ones in the backlog.

**`dev-worktree`'s own warning is real: stopping the shell task leaves vite holding the port.**
Both times. `Get-NetTCPConnection -LocalPort <port> -State Listen` then `Stop-Process` on the owning
pid, after checking the command line is the vite for THIS checkout.

**The instrument had a hole the code review caught, and the data proves it did not change the
verdict.** The bench timed the first Realtime frame in the window rather than the verb's own row.
`toPlayed` - stamped inside the graphic's own document, and unable to share that failure mode - sits
within 6 ms of `toWsRow` in 19 of the run's 20 verb rows; the twentieth sits 126 ms apart. That is
one contaminated row, its family median unchanged.

**Both stamps are now matched to the verb's own command, and the matcher is exercised on the NEXT
run, not this one.** The numbers in the backlog came off the old matcher and are corroborated by
`toPlayed` as above; the new one reads the command type off the raw socket text
(`payload.data.record.msg.t`) and refuses to match a frame it could not parse, reporting
`wsUnparsed` per gesture so a wrong path is loud rather than silent. **Whoever runs the bench next
should read that column first**: `wsUnparsed` above zero with `toWsRowMs` null means the matcher is
blind, not that the row never came.

**Checking that parse path caught it being WRONG, which is the whole argument for checking.** The
first version read `JSON.parse(text).payload.data.record.msg.t`, which is what the postgres_changes
payload looks like once the client has parsed it. On the raw socket it is a **Phoenix v2 array** -
`[joinRef, ref, topic, event, payload]` - so the object path resolved to `null` on every frame, and
with the strict matcher that means `toWsRowMs` would have been blank for the entire run. The bench
now reads `frame[4].data.record.msg.t` and falls back to the object form, verified against a live
frame (the record carries `id, msg, graphic, show_id, created_at`).

Two method notes for whoever probes a socket here next. **It cannot be done from Node**:
`realtime-js` there uses the `ws` package, not the global constructor, so a wrapped global captures
nothing. **And in a browser the wrapper has to go in at DOCUMENT START** - `context.addInitScript`,
which is how the bench installs it. Wrapping from inside `page.evaluate` runs after the SDK bundle
has captured the global, intercepts nothing, and looks exactly like the parse path being wrong.

**Nothing was left on the owner's backend.** Checked after the run: no `Lag Bench`, no probe rows.
The two `Connect Walk` rows in `control_shows` belong to the caspar row's live suite, not to this.

## Anything that needs the owner

Nothing is blocked on him. The owner-queue item
`docs/acceptance/owner-queue/2026-09-10-bj-published-take-is-half-a-second.md` is a `walk`: it hands
him `node scripts/playout-wire-probe.mjs` to run on the venue's wifi before Saturday, and says what
to do with the answer. **The operational advice for 2026-09-12 is to run the rehearsal unpublished
if it does not need the output URL or other people's phones** - unpublished every verb is local and
instant, published it is half a second and gets worse with the network.

## Pointers

- `scripts/playout-wire-probe.mjs` - the two wire hops in fifteen seconds, no browser and no dev
  server. The instrument to reach for first, and the one to run at a venue. It needs no BROWSER
  slot, but it is not exempt from the paragraph above: it signs in as the same E2E account and
  writes real `control_shows` and `control_events` rows, so do not run it while a `configured/live`
  suite is on the machine. Its own cleanup matches on the title "Wire probe" and so cannot touch a
  suite's fixtures, but a suite can still delete its production mid-run.
- `scripts/playout-lag-bench.mjs` - `--published` on the seed, the three wire columns, and the local
  control the measure phase runs after unpublishing.
- `docs/backlog/playout-lag-when-working-the-queue.md` - the tables, the three-client comparison,
  the two refused causes, and the fix design.
- `playout-lag-out/playout-lag.json` (gitignored) - the raw twenty verb rows behind the tables.
- `src/components/home/ProductionPage.tsx` - `runVerb` (the two roads) and the log follower's
  `onRow` (where a broadcast would have to reconcile).
- `src/components/home/PayloadStage.tsx` - the `data-plays` counter, and its comment on why a
  duplicate `play` leaves no trace.
