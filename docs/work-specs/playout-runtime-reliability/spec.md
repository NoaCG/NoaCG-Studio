# Phase 6: playout runtime and reliability - Steps 0, 1 and 2

## Problem and authority

On 2026-09-29 the production database stopped answering for three minutes and every Take failed.
The research that followed (`docs/PLAYOUT_ISOLATION_RESEARCH.md`, landed in #548) measured why a
prepared production is fragile on air: every live verb, both delivery roads, recovery and output
boot run through the one Postgres; a lock or an overload delays Takes silently and lands them out
of order; a Take delayed in transit can air after the Out pressed behind it; a follower can lose a
Take from the durable log; any other busy production adds about 92 ms to every Take; and the
operator surfaces say the wrong thing during an outage.

The owner answered the research's questions on 2026-09-29 (the session prompt that started this
spec). Those answers are the authority for everything below and are recorded verbatim in
substance here, so a later session can revert a derived choice without reopening them.

## Owner decisions (2026-09-29, binding)

1. **Staged path.** Guardrails, then visibility and telemetry, then a cheap and correct command
   path, then READY and Prepare for Live, then versions and last-known-good, then database-outage
   survival, then an optional local runtime. Local mode never moves ahead of the command-path
   foundation.
2. **Bridge stays simple.** For normal CasparCG use the playout laptop starts Bridge and that is
   all: no install, firewall or network configuration on the CasparCG server as the default
   workflow. Bridge stays loopback-only. If full offline graphics on a separate CasparCG machine
   need LAN serving or something installed there, that is a later optional Local Mode, and the
   simplest alternatives go to the owner before anything is built.
3. **Private Realtime topics** for the signed command path, initially. Public transport is
   revisited only if measurements show private reconnect during outages is a real operational
   problem.
4. **Graphic versions never silently replace a graphic on air.** A prepared new version becomes
   the default the next time that graphic goes from off air to on air. An explicit Apply Update
   exists for long-running graphics that may stay on air all programme.
5. **Prepare for Live may publish pending changes itself**, and the UI says clearly that the
   unpublished changes will be included. It then prepares and checks everything and gives the
   Ready for Live result. READY itself stays automatic. Prepare for Live never freezes editing.
6. **Migrations.** Ordinary migrations and deployments stay automatic. Live-path contract changes
   are the explicit, scheduled class, with backwards compatibility and lock protection. There is
   no permanent "do not deploy while someone is live" rule.
7. **No spending.** Do not increase Supabase compute or lift spending limits. Measure first;
   spend only when real usage shows the need.
8. **Order now.** Step 0 now, then Steps 1 and 2. Steps 1 and 2 do not wait for the Phase 5
   studio walk. Reliability of Take, Out and Next, and preventing stale or out-of-order commands,
   is foundational.

Throughout: preserve the working workflow and add capabilities incrementally. Phase 6 is not a
rewrite.

## Derived decisions (revertible; each names what to change to revert it)

- **D1. §16 item 11 is delivered by Step 1's health line.** The hosted page and the phone get
  the one health line the production page has, from the same component. Until Presence is on
  the server it reads `output_seen_at` (already returned by `control_show_by_slug`), so item 11
  does not wait for the migration. Revert: a separate hosted-page line.
- **D2. §16 item 9 (the client stopgap for the commit-order skip) is built in Step 0.** Step 2
  needs the gated migration and two review passes, so it will not be on air before the stopgap
  is useful; the global-id path the stopgap protects stays in service as Step 2's fallback for
  as long as old servers or old pages exist. Items 8 and 9 land together: both change the
  follower's refill in the same function. Revert: drop the re-read window.
- **D3. Presence rides a new private topic, `live-<show id>`,** with a SELECT policy for
  anon and authenticated (the reach the `log-` topic has) and an INSERT policy limited to
  `extension = 'presence'`, so capability holders can announce themselves and still nobody but
  the database can broadcast. A private rejoin needs Postgres, so an output that loses its
  socket during a database outage drops out of the health line until the database is back; that
  is honest, because the same output cannot receive private commands then either. Revert: drop
  the two policies; health falls back to `output_seen_at`.
- **D4. The per-show lock is a new small row, and no writer locks anything after it.** A new
  table holds, per production, the sequence head and the desired-state summary. Every function
  that appends to the log takes that row's lock and allocates the next sequence number
  immediately before it inserts, and none of them touches `control_shows` after taking it. The
  research said "locks first"; taking it last and never waiting on anything while holding it is
  what keeps a publish or a data merge from stalling every Take, and a single lock order is
  what rules out deadlocks between old and new writers. Revert: stop reading the sequence; the
  global id path is untouched.
- **D5. The revision check is per graphic, compare-and-set with a sender chain.** A command
  carries the revision the sender last saw and the sender's own press number. The server applies
  it when the revision still matches, or when every change since was the same sender's earlier
  press; otherwise it refuses it as stale and says what is on air now. A retry of a press that
  already applied is answered as applied, so the server finally has idempotency of its own.
  All out is never refused: it is the panic control, and a stale All out takes graphics off air
  rather than putting a wrong one up. Revert: send without a revision; the server applies
  unconditionally, as today.
- **D6. The new path does not replace the old one in place.** New functions sit beside the old
  ones; the old functions keep their signatures and behaviour and learn only the sequence and
  the new home of `live_cue` and reports; the per-row `log-` broadcast and the `cmd-` fast road
  keep running for old followers. Retiring any of it is a later, evidence-based step (Step 1's
  telemetry shows no old-protocol client for 14 days). A new client that meets an old server
  (Vercel deploys before a held live-path migration applies) keeps using today's path.
- **D7. The live-path class is explicit and scheduled by landings.** A migration that touches a
  named live-path object must say so in its header; `db-push` holds it on an automatic run and
  applies it at the first later run that finds production quiet (no renderer heartbeat in the
  last ten minutes), or at once when a person names it. Every other migration stays automatic.
  Revert: remove the class; such migrations apply on landing like any other.
- **D8. AC-15 is about the real writer.** The publish was an upsert, which locks the row FOR
  UPDATE and blocks a Take whatever the Take locks; an ordinary UPDATE of the row, which the old
  AC tested, was not what a publish does. So the publish now updates by id (NO KEY UPDATE) and
  inserts only when nothing matched, the new send takes the production's row at KEY SHARE, and
  AC-15 is worded against that real statement. An old bundle's upsert still blocks Takes until it
  reloads. Revert: restore the old wording and the upsert.
- **D9. AC-16 heals by replaying, not by snapping.** The server knows what each graphic's last
  command did, not where the graphic's machine is, so there is no pose to snap to; and dropping
  or reordering rows changed what the operator meant (clock starts, event payloads, snaps used as
  recovery). An output that missed frames applies every row it reads back, in order, and skips
  only an entrance that a later play or stop of the same graphic replaces; an exit always runs,
  because a stop can do more than animate (a debate board halts its speaking clocks). Revert:
  restore the old wording (it needs a pose the server does not have).
- **D10. A page picks its protocol once per load.** The new resolve answers, or the page runs
  today's protocol for its life. A renderer on a production that still holds pre-migration rows
  it would need follows by id for that session, and its reports move past them. The migrations
  can therefore land before or after the client, in either order. Revert: none needed while old
  servers exist; retire proto 1 by D6's evidence.
- **D11. Step 2's migrations land with the client, after Step 1's 0068 is on `main`.** 0069 is the
  head table, 0070 the read policy for the numbered topic, 0071 the sequence; each strongly locks
  at most one live table. The client works on an unmigrated server (D10), and 0071 refuses to
  apply without 0070's read policy, because without it every new follower's join is refused and
  falls back to the 30 s poll. `e2e/configured/command-sequence.spec.ts` runs wherever the tree's
  migrations apply (it skips only on a server without the sequence road). Revert: split the three
  migrations off onto their own branch and restore the command-sequence allowed skip.
- **D12. The numbered frames have their own private topic, `seq-<show id>`, never Presence's.**
  Realtime closes a channel that exceeds its Presence rate limit (5 calls per client per 30 s on
  every plan; 50 Presence messages per second per project on Pro). With the frames on `live-`, the
  measured A/B run on the preview branch saw the channel close 25 to 27 s after it opened, and a
  third of the Takes pressed before it joined again never played, while every send had answered
  ok. The command road must never share fate with Presence: `seq-` has a read-only policy for anon
  and authenticated and no insert policy of any kind. Revert: send the frames on `live-` again and
  drop 0070's policy (not advised while Presence has a rate limit).

## Non-goals

No READY state, Prepare for Live, versions or signed commands (Steps 3-5). No local runtime and
no change to Bridge (decision 2). No separate playout backend. No change to compute or spending
limits (decision 7). No change to the audience plane. No removal of the global-id path, the
per-row `log-` broadcast, the `cmd-` fast road, `control_shows.live_cue` or any old RPC tonight:
they retire later, by evidence. No test or query against production (verification uses a
temporary preview branch).

## Step 0 - guardrails (research §16)

Each lands on its own. Items 1, 5 and 6 are other sessions' branches
(`claude/output-embed-frame-headers`, `claude/migration-safety-guardrails`).

### AC-1: An operator page never reads an outage as "unpublished" (§16 item 2)

Scenario: the hosted control page is opened while `control_show_by_slug` answers 503; it says
the server is not answering and keeps retrying, never "not found"; when the route recovers it
shows the production without a reload. The production page's follow retries its resolve on the
same backoff and says so. A real unknown slug still says "not found". Covered by an e2e spec.

### AC-2: The output renderer boots through a failed chunk, and its error card never paints air (§16 item 3)

Scenario: the supabase-js chunk answers 404 once at boot, then normally; the renderer comes up
without a reload. The "Output not available" card is transparent on air and shows its text only
with `&debug=1`. Covered by an e2e spec.

### AC-3: A send attempt cannot commit long after it was pressed (§16 item 4)

Each attempt has its own deadline and is abandoned at it, so the §5.6 case (a Take's request held
6 s in the browser, an Out pressed 1.5 s after it) ends with the graphic off air and the operator
page agreeing. Covered by an e2e spec or a unit test of the sender with a held transport.

### AC-4: A refill re-reads behind its cursor, and refills after a reconnect are spread out (§16 items 8, 9)

A row that commits late below the follower's cursor is still applied (the §5.3 commit-order case:
a watcher's durable action log records the delayed Take). Refills triggered by a reconnect start
after a random delay, so ten outputs dropped together do not all read the tail in the same second.

### AC-5: A hanging font host cannot keep a graphic off air (§16 item 12)

Scenario: font requests never answer; every graphic still airs on a fallback face within a
bounded time after the output opens, and the output's debug line says which font it is waiting
for. Covered by an e2e spec.

### AC-6: The two "never" rules are written down (§16 item 10)

`docs/DEPLOYMENT.md` says never to enable Vercel's production pause without exempting `/output`,
and never to change a live-path function without a behaviour self-check tied to the named
contract.

### AC-7: One library sync pass per browser (§16 item 7), if it proves cheap

Two tabs of the editor on one account run one sync pass per change between them, not one each.
If it is not cheap it stays filed, with a note of why.

## Step 1 - see the live path

### AC-8: Every output and operator page can say who it is and how commands reach it

An output knows a stable instance id, its host engine (for example "CasparCG 2.3 · Chromium 71"),
the renderer build and the protocol version. Every command a page sends carries the sender's
instance, build, protocol and press time; an output stamps receive, apply and first frame, and
counts per road: commands received, duplicates dropped, holes, refill walks, late and refused.
It is visible on the output's debug line and reported in its Presence entry on `live-<show>`
when the server has the topic, and nothing breaks when it does not. Report-only: nothing acts on
it yet.

### AC-9: Both operator surfaces show one health line

The production page and the hosted page (and so the phone) show the same line: how many outputs
are connected, their engines, how fresh, and a warning when one says commands may arrive late
(Realtime not joined). With Presence it comes from Presence; without it, from `output_seen_at`.

### AC-10: The Presence migration is the live-path class and harms nothing on air

It is additive (two policies on a new topic shape), sets `lock_timeout` and `statement_timeout`,
carries the live-path header, and an old page keeps sending while it applies on the preview
branch.

## Step 2 - make the command path cheap and correct

### AC-11: The live-path class exists in `db-push` before any live-path migration lands

Research §11.2 rules 1-4: the named contract (RPCs, topics, tables and policies), the header, the
hold on automatic runs, the quiet-window apply, the explicit override, and lock protection.
`scripts/db-push.test.mjs` refuses a migration that touches a named object without the header.

### AC-12: A per-show, gap-free sequence commits in order

Every log row of a production carries the next number of that production's sequence, allocated
under the per-show row lock, so commit order equals sequence order. The §5.3 commit-order run no
longer reproduces: a watcher's durable log records the delayed Take in 5 of 5 trials, following
the sequence rather than the global id.

### AC-13: A stale Take is refused

The §5.6 late Take (held 6 s, Out pressed behind it) is refused by the server and never airs; the
§5.3 lock-release burst ends on the operator's last press in every trial; a retried press that
already applied is answered as applied and airs once. The refusal reaches the operator in plain
words.

### AC-14: Other productions no longer slow a production

With another production writing a row every 120 ms, the output applies a Take within noise of the
quiet case (today +92 ms), and no Take goes out without its command frame because of another
production's traffic (today 17 of 20).

### AC-15: A publish holding the `control_shows` row does not delay a Take

The Take path is off the hot row: a new send takes the production's row only at KEY SHARE, and
`live_cue` and renderer reports live on `control_heads`. With the row held for 15 s by the
publish's real statement (an update by id, D8), Takes and Outs keep their normal latency (today
every one fails). An old bundle's publish upsert still blocks until that page reloads.

### AC-16: One frame per inserting statement, carrying a summary; a missed frame heals by replay

A Take reaches a new follower as one frame with its sequence numbers and a small summary per
touched graphic (revision, on air, cue, step). An output that missed frames reads them back from
the tail in one read, applies every row in seq order, and does not animate an entrance nobody
would see finish: a play that a later play or stop of the same graphic in the same read replaces
(with no event, next or snap of that graphic between them). Exits always run, because a graphic's
stop can do more than animate. The summary is data: nothing plays, stops or refills because of it
(D9).

### AC-17: Old pages and old outputs keep working on the new schema

An output and an operator page built from `main` before this step send and follow against the
migrated preview branch with today's behaviour, including `live_cue`, reports and recovery; the
global-id path is intact. A new page against an unmigrated server uses today's path.

### AC-18: Take latency is not worse

Press to output applied, p50 and p95, on the preview branch before and after, measured the same
way, sequentially: not worse beyond noise. The migration applies with `lock_timeout` while an old
page sends every 700 ms, and no send fails.

## Verification

- Never test on or query production. A temporary Supabase preview branch of
  `kprolrchuldgfrzspthy`, deleted the same night and confirmed gone with `list_branches`.
- The §5 measurements run before and after, one browser job at a time on this machine: command
  latency per road, the busy-instance penalty, lock and overload behaviour, the commit-order skip,
  late and reordered Takes after a lock, the reconnect storm. Receipts go in `evidence/`.
- CasparCG 2.3.2 and 2.5.0 host checks run from scratch configurations passed on the command line
  (2.3 reads a uniquely named temporary file from its own folder, deleted afterwards); their own
  configurations are never edited.
- Two read-only adversarial reviews of Step 2 (lenses: commit ordering and concurrency, migration
  and lock safety, old clients on air, recovery and snap, Take-path latency): one on the design
  before building, one on the finished diff before it is queued.
