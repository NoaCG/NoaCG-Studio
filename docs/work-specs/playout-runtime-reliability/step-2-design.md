# Phase 6 Step 2 design, v2 (after the first adversarial review), as built

Spec: docs/work-specs/playout-runtime-reliability/spec.md on main (858ad05e), ACs 11-18, D4-D7.
v1 was reviewed by five lenses with a skeptic each; the verified findings are cited below by id
(for example "migration:F1"; the review itself stayed in the orchestrator's session). This v2 was
binding for the implementation. Section 0 records what the implementation decided where v2 was
silent, and the three places where it corrects v2; sections 1 to 3 are v2 as it was reviewed.

## 0. As built (2026-09-30)

Code: `supabase/migrations/0069_control_heads.sql`, `0070_command_sequence.sql`;
`src/control/seqFollow.ts` (the follower), `src/control/seqSend.ts` (the sender), their wiring in
`src/control/hostedControl.ts`, `src/output/main.ts` and the two operator pages. Receipts:
`evidence/` beside this file.

### Corrections to v2 (each would have been a defect if built as written)

- **C1. The duplicate test must not trust `bool_and` over missing entries** (§1.5 step 3). "Every
  touched graphic has by = id and press = p" written as `bool_and(by = id and press = p)` answers
  TRUE when a touched graphic has no summary at all, because `bool_and` skips NULLs: a first press
  on a new graphic beside an old one would be answered "already applied" and never air. 0070
  coalesces each comparison to false. Revert: none needed; it is the design's intent.
- **C2. `base` is read when the operator presses, and reused by every resend** (§2.4 said "the rev
  this page last saw", without saying when). Read when the payload leaves the per-graphic queue,
  or again on a resend, a press would carry knowledge the operator never had: another screen's
  change arriving in the frame between the press and the send would make a stale press look
  current, which is exactly what the check exists to refuse. The page's own earlier presses need
  no base; the chain rule covers them. Revert: compute `senderBody` inside the queued send.
- **C3. `legacy` is exact rather than conservative** (§1.5). v2 said: any seq-null row above the
  oldest baseline, or any seq-null row at all when a payload graphic has no report. That makes a
  production with one never-used graphic run proto 1 for seven days after the migration. 0070
  asks the precise question instead: is there a seq-null row that is a renderer COMMAND (update,
  play, stop, next, event, snap) of a graphic whose own baseline is below it (no report counts as
  0)? Only those rows can be missed by a seq follower; status rows never reach a stage. Revert:
  widen `control_head_legacy` back to v2's rule.

### Decisions where v2 was silent (each revertible where it says)

- **D-a. Timeouts** `lock_timeout = 500ms`, `statement_timeout = 5s` in both files, as v2 asked;
  both are inside db-push's rules (1 ms to 5 s; bounded). control_send_seq and
  control_output_report_seq set a transaction-local 2 s `lock_timeout` so a stalled head answers
  55P03, which the page resends (the send is idempotent) instead of eating the role's statement
  timeout.
- **D-b. The self-check reads `realtime.messages` only where Realtime could write at all.** A
  project whose Realtime tenant has not started has no partition for today (a fresh preview
  branch had none), `realtime.send` then swallows the failure into a warning, and asserting the
  counts there would fail the migration for the environment's sake. It asserts exact counts per
  topic (3 log-, 1 cmd-, 1 live- for a Take) wherever the first send wrote any, and says so in a
  notice otherwise. Revert: assert unconditionally.
- **D-c. `live_cue` from the old resolve is the column, unchanged, until the head has seen a cue**
  (`control_live_cue_view`), so every production nobody has taken a cue on since 0070 answers
  byte for byte what it answered before. After that it is format 2 with the head's layers over
  the column's.
- **D-d. The operator resolve (`control_show_resolve`) carries no seq baselines and no `legacy`.**
  Pages follow from the head and never replay history by seq (their PROGRAM monitor's boot replay
  stays on the id road, which still works), so both would be cost without a reader.
- **D-e. `superseded` lands silently.** The page's own later press is what stands on air, and
  its monitor already shows that press. `stale` throws: "<graphic> was changed from another
  screen, so air did not change." naming only the graphics the server says changed, or "This
  production was published again while this page was open, so air did not change." when the
  cause was the epoch; plus the page's half ("Your press is on this monitor only. Press again if
  you still want it." when the press moved its monitor). The answer's summary is learned either
  way, so the next press is made on what is on air now.
- **D-f. The per-graphic queue releases at 1500 ms**, Step 0's attempt deadline, on its own timer,
  so it holds whether or not Step 0's abort has landed in the same build: a stalled send cannot
  hold the next press longer than one attempt, and if it lands late the server refuses it as
  superseded. All out does not queue.
- **D-g. Protocol is decided once per page load.** The first resolve answers, or anything that is
  not "unanswered" (PGRST202 included) turns the page to proto 1 for its life, logged once to the
  console; the renderer also says it on its debug line ("protocol: ..."). A live-path migration
  can land under an open page (D7), and switching one page's cursor road mid-session is a second
  cursor for one log.
- **D-h. Operator pages on proto 2 have no fast road.** The numbered frame and the command frame
  are written by one transaction and arrive together, so there is nothing for a fast road to win.
  Sends still mark items `fast` by today's rules so old renderers keep theirs. Apply-here is
  unchanged; the echo is dropped by the oid claim as before.
- **D-i. The renderer elides superseded ENTRANCES only in a LIVE refill**, not in the boot
  catch-up, which is already hidden while it settles. Every row still applies (data, event
  payloads, clocks, reports, the oid claim); only `stage.apply` and the play count of a `play`
  that a later play or stop of the same graphic replaces are skipped. Exits always run (review
  R-5: a debate board's stop halts its speaking clocks, and a play does not undo that). This
  narrows v2's "play or stop" and the spec's AC-16 says so (D9).
- **D-j. A new epoch on the renderer clears its per-graphic seq baselines, restarts from 0 and
  reports every graphic again**: a republished production is a new log numbered from 1, and a
  baseline from the old one would skip its first rows as "already in the snapshot". The first
  epoch of a log the renderer booted on before it had a head is learned, not a restart.
- **D-k. The renderer's report `event` is the highest id it has applied**, next to the seq and the
  epoch. An older reader of that report follows by id from it, as it always did; the highest id
  is what its snapshot contains (review R-4 replaced "the last row in seq order", which after an
  id/seq inversion made old readers replay a row twice).
- **D-l. `live-<show>` is joined once per page** (`joinLiveTopic`, reference counted), because
  Realtime returns the same channel object for a topic already joined and a second `subscribe`
  on it never reports; Step 1's Presence should register through the same join.
- **D-m. The publish updates by id and inserts only when nothing matched** (and updates again on a
  23505), with the same columns and the same 0058 fallback. Old bundles keep their upsert until
  they reload: Takes wait behind it as they do today, and never deadlock.
- **D-n. Old pages' Updates now wait for a new publish.** The trigger takes NO KEY UPDATE on the
  show row for every old writer (v2 §1.2), which a publish's NO KEY UPDATE blocks; before 0070 an
  old page's Update (no cue item) passed a held row. Old pages' Takes and Outs already waited.
  Transitional: it ends when old pages reload. Accepted, not fixed.
- **D-o. The new configured spec skips on a server without the sequence road**, and is listed in
  `e2e/configured/expected-run.json` `allowedSkips` with that reason, because the migrations land
  on their own gated branch: the landing that brings 0069 and 0070 into the tree removes the
  entry and raises `minTests`. Revert: drop the runtime skip once both are in the tree.
- **D-p. Specs that intercept a send or a report now match both roads** (`control_send_*`,
  `control_output_report*`): the CI stack applies every migration in the tree, so once 0070 is
  there the pages and renderers in those specs negotiate protocol 2.

### Known limits (recorded, not fixed)

- **K1. Two accumulating presses under a failing send.** The queue keeps two Nexts in order while
  sends answer; if the first has been failing for longer than one attempt deadline, the second
  leaves, and if it lands before the first's resend, the first is refused as superseded, silently,
  and air advances one step where the page's monitor shows two. Only reachable while a send of that
  graphic is already failing.
- **K2. The old bundle's publish upsert still blocks Takes** until that page reloads (D8), and old
  pages' own Updates now wait behind a new publish (D-n).
- **K3. A frame Realtime fails to write is only found by the next frame or the 30 s poll**, as on
  the id road: `realtime.send` swallows its errors into a warning, by design, so a command is
  never lost to a broadcast.
- **K4. A long catch-up by seq reads more rows than it returns.** With no `(show_id, seq)` index
  (v2: no index build under a lock on the live table), a tail page reads the newest
  `(head.seq - after) + 64` rows by id, or scans the production's rows when that falls short, so a
  renderer booting from seq 0 on a production with 20,000 retained rows reads on the order of
  400,000 rows over its 40 pages; `control_head_legacy` scans the production's retained rows once
  per renderer resolve. Bounded by the 7-day prune and only at a boot with no baseline; a later,
  ordinary migration can add the index when measurements say so.
- **K5. Step 1 and Step 2 both join `live-<show>`.** Realtime hands back the existing channel for
  a topic and a second `subscribe` never reports, so Step 1's Presence join and this step's
  `joinLiveTopic` must become one join (the channel created once with Presence's config, both
  listeners on it, removed when both have left). Whichever of the two lands second does it.

### The review of the finished diff (2026-09-30, before queueing)

A code review over the whole branch (base d1e0dcf6, 31 files) returned 14 findings; each was
checked against the code. What each became:

- **R-1. 0070 requires 0068, which is not in this tree.** True, and kept: it is the prerequisite
  (D11). Stated in 0070's header; this branch as a whole cannot pass the configured suite's stack
  start until 0068 is in the tree, which is why the migrations land on their own branch.
- **R-2. A renderer on an old epoch could bank a seq baseline in the new log.** Fixed: the report
  carries the epoch and the server banks the seq only in that epoch, clamped to the head.
- **R-3. Rows healed through a tail read never updated the page's revisions.** Fixed: tail answers
  carry the head.
- **R-4. The report's `event` could be below rows already in the snapshot.** Fixed (D-k).
- **R-5. Eliding a `stop` skipped its side effects.** Fixed (D-i).
- **R-6. A head was learned before its rows applied, and proto 2 had no stand-down.** Fixed: heads
  are handed on once the cursor reaches them, and the page's presses take the durable road while
  the follower holds rows or reads (`recovering`, as on the id road).
- **R-7. After All out the production page marked skipped graphics off air.** Fixed: the send
  returns what the server skipped, and the page leaves those on air.
- **R-8. All out was refused for an old epoch.** Fixed: no epoch refuses All out.
- **R-9. An answer read under a left epoch flipped the follower back; null to the first epoch
  restarted a renderer.** Fixed: such answers are read again; the first epoch is learned.
- **R-10. The log- and cmd- sends ran under the 2 s head wait.** Fixed: 250 ms once the head is
  held; the frame's send has its own exception block.
- **R-11. A failed refill left held rows until the poll.** Fixed: retried a second later.
- **R-12. Tail and legacy scans are O(retained rows).** Recorded as K4.
- **R-13. The stale sentence named every graphic, and blamed another screen for a republish.**
  Fixed (D-e).
- **R-14. Dead conditions in the follower's epoch rule; the negotiation written twice.** Fixed.

## What changed from v1, and why (one line each)

- ONE migration became TWO files, each strongly locking at most ONE live table, with no scan and
  no backfill under any lock (migration:F1, F2; oldclients:F1): legacy writers touch
  control_shows and control_events in both orders, so any single transaction holding strong locks
  on both can deadlock with them.
- No unique index on (show_id, seq): its build scans control_events under a lock and the table size
  on production is unknown. Tails and the burst cap use the existing (show_id, id) index instead.
- No backfill of heads: heads are created lazily by the first write (migration:F3).
- The old send bodies are NOT redefined (removes the 0056 risk, migration:F6). A BEFORE ROW trigger
  keeps the head (seq, cue, on, rev, step) right for every legacy writer, including bodies already
  running when the migration commits, and takes the show row lock (NO KEY UPDATE) BEFORE the head,
  so no writer ever waits for the show row while holding the head (ordering:F5).
- The publish (new bundle) stops using an upsert that names the primary key, which locks the row
  FOR UPDATE and blocks every Take (ordering:F1, oldclients:F4, latency:F1).
- control_data_apply takes FOR NO KEY UPDATE instead of FOR UPDATE (latency:F2).
- Heads cascade with the show and carry an EPOCH, so unpublish + republish can never be mistaken
  for "nothing new" by an open follower (ordering:F3).
- Reports move to control_heads.live (off control_shows, as the owner asked), carrying both `seq`
  and `event`; the old resolves merge reports per graphic by the newer `at` (recovery:R3, migration:F8).
- New followers keep the oid claim (oldclients:F2), keep the 25 ms reorder hold (recovery:R4), treat
  tail answers as authoritative (recovery:R6), and never act on the summary alone (recovery:R5).
- Pre-migration rows (seq null) are never lost: a renderer that would need them runs today's path
  for that session (oldclients:F3, recovery:R1).
- The refill elides only superseded ANIMATIONS, never a row's effect (recovery:R2). AC-16's wording
  changes accordingly (the server has no machine pose to snap to).
- Chain rule: one send in flight per page and graphic (ordering:F6), All out never refused but never
  undoes the same sender's later press (ordering:F2), sender id and press defined (ordering:F4),
  55P03 resent (latency:F9), `superseded` distinguished from `stale`.
- created_at = clock_timestamp() taken after the head lock, so it is monotone in seq (recovery:R7).

## 1. Migrations (both live-path class; both start with `set lock_timeout = '500ms';` below the
## 1 s deadlock_timeout, and a bounded `set statement_timeout` (5s); both carry the
## `-- live-path:` header line; check the exact rules of scripts/db-push.mjs on main)

### 0069_control_heads.sql - the table only (locks control_shows SHARE ROW EXCLUSIVE for ms, nothing else)

```sql
create table public.control_heads (
  show_id    uuid primary key references public.control_shows (id) on delete cascade,
  epoch      uuid not null default gen_random_uuid(),   -- new on every (re)creation of the head
  seq        bigint not null default 0,                 -- last sequence number allocated
  graphics   jsonb  not null default '{}',              -- {g: {rev, on, cue, step, by, press}}
  live       jsonb  not null default '{}',              -- {g: {data, state, at, seq, event}}
  recent     jsonb  not null default '[]',              -- last 64 "sender:press" applied
  updated_at timestamptz not null default now()
) with (fillfactor = 70);
alter table public.control_heads enable row level security;       -- no policies: definer RPCs only
revoke all on public.control_heads from public, anon, authenticated;
grant all on public.control_heads to service_role;
```
Self-check: table, RLS, grants (ABSENCE for anon/authenticated). Nothing writes it until 0070.

### 0070_command_sequence.sql - column, triggers, functions (locks control_events ACCESS EXCLUSIVE for ms)

Order inside: `alter table public.control_events add column seq bigint;` first (the only strong
lock), then functions, then triggers, then self-checks. It asserts (via pg_policies, no lock) that
0068's `live-` SELECT policy exists and raises if not; it never creates or drops a policy
(migration:F4). No index. No backfill. No redefinition of control_send_many / control_send /
control_stage / control_report / control_output_report / control_data_send.

#### 1.1 The head helpers (internal, revoked from anon/authenticated)

- `control_head_effect(p_graphics jsonb, p_graphic text, p_msg jsonb, p_by text, p_press bigint) returns jsonb`:
  one row's effect on the summary. `cue` row: sets graphics[g].cue (null = off air marker kept as
  an entry). `play`/`snap`: on = true, step = 0. `stop`: on = false. `next`: step + 1. rev + 1 for
  `update`,`play`,`stop`,`next`,`event`,`snap` WITHOUT `src` (data API and operator data patches
  carry `src`; staged/live/cue rows never bump). by/press set on every rev bump. Used by the
  trigger and by the new functions, so there is one rule.

#### 1.2 The BEFORE INSERT ROW trigger `control_events_seq` (WHEN (new.seq is null): legacy writers only)

```
perform 1 from public.control_shows where id = new.show_id for no key update;   -- (a) show row FIRST
insert into public.control_heads as h (show_id, seq) values (new.show_id, 1)
  on conflict (show_id) do update set seq = h.seq + 1, updated_at = now()
  returning h.seq into new.seq;                                                   -- (b) head, to COMMIT
update public.control_heads set graphics = public.control_head_effect(graphics, new.graphic, new.msg, 'legacy', 0)
  where show_id = new.show_id;                                                    -- (same row, same lock)
new.created_at := clock_timestamp();
```
(a) is NO KEY UPDATE, not KEY SHARE: every legacy writer either already holds it (report, stage,
report, data_apply) or takes it later anyway (the old sends' live_cue UPDATE), so taking it before
the head is what makes the order the same for everyone. It also covers the foreign-key check.

#### 1.3 The AFTER INSERT STATEMENT trigger `control_events_frame` (REFERENCING NEW TABLE AS fresh)

Per show in `fresh`: ONE `realtime.send(payload, 'batch', 'live-<show id>', true)` in its own
exception block, with a transaction-local short lock_timeout around it (restored after) so a stall
on realtime.messages cannot hold the head for long. Payload: `{epoch, rows: [{id, seq, graphic,
msg, created_at}] ordered by seq, head: {seq, graphics: {<touched g>: summary}}}`. The 0064 per-row
`log-` broadcast stays as it is, for old followers.

#### 1.4 Lock order (the invariant; write it in the migration header)

control_shows row (KEY SHARE, NO KEY UPDATE or FOR UPDATE) strictly BEFORE control_heads; after
the head only: the same head row, control_events inserts, realtime.messages inserts. Every path:
- control_send_seq / control_output_report_seq: KEY SHARE show, head FOR UPDATE, insert with seq
  preset (trigger skipped by its WHEN).
- legacy writers: their own show lock (or the trigger's NO KEY UPDATE), then head in the trigger.
- control_data_apply: redefined with `for no key update` (same body otherwise; its self-check calls it).
- publish (new bundle): plain UPDATE of the row (NO KEY UPDATE; compatible with KEY SHARE), insert
  only when no row matched; old bundles keep the upsert (FOR UPDATE) until they reload: sends wait
  behind it, as today, but never deadlock.
- heartbeat, audience writes, team stamp: show row only. Unpublish: show row delete, cascades.
Still blocking a Take (the show row FOR UPDATE / key change / delete): an old bundle's publish
upsert, claimJoinName (join_slug unique), data_key rotation, unpublish. Rare; listed, not fixed.

#### 1.5 New functions (all SECURITY DEFINER, `set search_path = ''`, granted to anon, authenticated)

- `control_send_seq(p_slug text, p_items jsonb, p_sender jsonb) returns jsonb`.
  `p_sender = {id: <uuid minted per page load, memory only>, press: <int, one per RPC payload,
  strictly increasing, reused only by that payload's resends>, epoch: <uuid|null>, base: {g: rev},
  all_out?: true}`. Refuse a non-uuid id.
  1. slug -> show, owner (plain read); feature_denied_for; validate items exactly as 0057 (1..8,
     allowlist, non-empty graphic); `set_config('lock_timeout','2000',true)`.
  2. KEY SHARE on the show row; lock the head (`insert ... on conflict do nothing`, then `select ...
     for update`).
  3. Duplicate: `id:press` in recent, or every touched graphic has by = id and press = p -> answer
     `{ok: true, duplicate: true, epoch, head}`; insert nothing.
  4. Epoch: p_sender.epoch not null and <> head.epoch -> refuse `{ok:false, refused:'stale', epoch,
     graphics}` (the page re-learns).
  5. Revision, per touched graphic g, cur = graphics[g] (absent = rev 0):
     - not all_out: accept g if base[g] = cur.rev, or cur.by = id and cur.press < press. Otherwise
       refuse the WHOLE batch: `refused: 'superseded'` when cur.by = id (the page's own later press
       won), else `'stale'` (another screen changed it); return `graphics: {g: cur}` for every touched g.
     - all_out: never refused; but DROP g's items when cur.by = id and cur.press > press (the
       sender's own later press stands).
  6. Burst cap, bounded: count over `(select created_at from control_events where show_id = v order
     by id desc limit 51)` where created_at > now() - 5 s; same 50 rule and error as 0057.
  7. seq_from..seq_to = head.seq + 1 .. head.seq + n; head: seq, graphics (control_head_effect per
     item, by = id, press = p), recent (append, keep 64), updated_at.
  8. One INSERT ... SELECT of the n rows with explicit seq and created_at = clock_timestamp().
  9. The `cmd-` fast frame for items marked `fast`, exactly as 0057 does (old renderers keep their
     fast road while they last).
  10. Answer `{ok: true, epoch, seq_from, seq_to, head: {seq, graphics: {touched}}}`.
- `control_show_resolve(p_slug text) returns jsonb` and `control_output_resolve(p_output_slug
  text) returns jsonb`: in ONE statement: what the old resolves answer, plus `proto: 2`, `epoch`,
  `seq` (head, 0 when no head), `graphics`, `live` merged (below) where every entry carries `seq`
  (its own, or mapped from `event`: `coalesce(min(seq) of rows with id > event and seq not null,
  head.seq + 1) - 1`), and `legacy: true` when any row with seq null has an id greater than the
  oldest report baseline `event` (or when seq-null rows exist and a graphic of the payload has no
  report). The show resolve also returns `live_cue` computed as in 1.6.
- `control_tail_seq(p_slug, p_after bigint, p_epoch uuid)` / `control_output_tail_seq(p_output_slug,
  p_after, p_epoch)` returns jsonb `{epoch, rows}`: rows with seq > p_after ordered by seq, at most
  500. Fast path: `select ... from (select ... from control_events where show_id = v order by id
  desc limit (head.seq - p_after) + 64) t where seq > p_after order by seq`; if it did not find
  min(head.seq - p_after, 500) rows, fall back to `where show_id = v and seq > p_after order by seq
  limit 500` (per-show scan; logs are pruned). A different epoch answers `{epoch, rows: [], reset: true}`.
- `control_output_report_seq(p_output_slug, p_graphic, p_data, p_state, p_seq bigint, p_event bigint)`:
  KEY SHARE show, head; `live[g] = {data, state, at, seq, event}`; insert the `live` status row with
  a preset seq (operator chips follow it). Never touches control_shows.

#### 1.6 Redefined reads (same RETURNS TABLE shapes; `create or replace`; self-checks CALL them)

- `control_show_by_slug`: `live_cue` per layer from head.graphics when the head has an entry for
  that layer (cue null = off), else from the column (covers legacy writes the head never saw);
  `live` merged per graphic by the newer `at` between control_shows.live and head.live (head
  entries carry `event`, so old readers keep a dated baseline).
- `control_output_by_slug`: `live` merged the same way. Nothing else changes.

#### 1.7 Self-checks (CALL, per supabase/AGENTS.md; throwaway show, cleaned by cascade)

On a throwaway show: legacy control_send_many Take then Out -> rows get consecutive seqs; the head
cue/on/rev/step follow; the old column live_cue still moves (legacy body unchanged); count the
realtime.messages rows this transaction wrote per topic: cmd- only for fast items, one log- per
row, one live- per statement; control_send still returns the inserted id; the burst cap still
raises its text and errcode; the two refusal texts still raise. control_send_seq: accept; stale
refuse (another sender); chain accept (same sender, lower press committed); superseded; duplicate;
all_out skips the same sender's later graphic; epoch mismatch. Both new resolves called as
`anon` (`set local role anon` inside a sub-block, then reset to the migration role WITHOUT `reset
role` of the session: see supabase/AGENTS.md "never change the session role"; if that cannot be
done safely, call them as the migration role and assert the grants separately). control_data_apply
still merges and appends. The old resolves return the merged live and the head-or-column live_cue.

## 2. Clients

### 2.1 Negotiation
New resolve first. PGRST202, or any error that is not "unanswered" (status 0, >= 502, 57014), ->
the old resolve and proto 1 for the whole session, logged once to console and the debug line
(oldclients:F5). Unanswered -> retry as today. `legacy: true` -> a RENDERER runs proto 1 for this
session (its reports then move the baselines past the seq-null rows; the 7-day prune removes them);
operator pages follow by seq from the resolve's head regardless (they do not replay history).

### 2.2 The follower (new function beside followControlLog, which stays for proto 1)
- Channel `live-<show>`: `batch` frames (shares the channel object with Step 1's Presence; if Step 1
  has landed, reuse its join).
- Cursor = last applied seq; epoch = the resolve's. A frame with another epoch: reset cursor to 0,
  adopt the epoch, refill. Rows in seq order; seq <= cursor dropped; row id and the oid claim
  (createAppliedOnce) also dedupe. A frame ahead of cursor + 1 is HELD for REORDER_WINDOW_MS (25 ms)
  and drains the moment the gap closes; still open -> ONE single-flight `tail_seq(cursor)` refill.
  Refill on SUBSCRIBED (jittered as Step 0 row D does) and every CONTROL_POLL_MS.
- Tail answers are authoritative: the cursor advances to the last returned seq over any gap in or
  before the answer (prune, cascade). A reset answer resets.
- No fast road, no `recovering` stand-down, no slow-after-event hold on this path.
- The summary is data (base revs, chips, telemetry). A follower never issues play, stop, snap or a
  refill from the summary alone (recovery:R5).
- Refill elision (AC-16): every refilled row is applied in seq order through the same applyCommand
  path (data, event payloads, clocks, speaking clocks, mergedData); only the stage ANIMATION of a
  `play` or `stop` that a later `play`/`stop` of the same graphic in the same refill supersedes,
  with no `event`, `next` or `snap` of that graphic between them, is skipped, so the graphic ends
  in its final state once. Never reorder rows.

### 2.3 Output renderer (src/output/main.ts)
Proto 2: boot from the new resolve; per graphic baseline = live[g].seq; follow from the oldest;
`alreadyInSnapshot` by seq; hidden catch-up via control_output_tail_seq exactly as today's hidden
catch-up; reports via control_output_report_seq with the applied seq AND the id of the last applied
row (event). Proto 1: today's code, untouched.

### 2.4 Sender (sendControlVerb) and publish
- Proto 2: control_send_seq with {id, press, epoch, base}; base[g] = the rev this page last saw for g
  (resolve, frames, its own answers). One send in flight per page and graphic: a FIFO per graphic;
  the next payload for g leaves when the previous one answers or is abandoned at its Step 0
  deadline (ordering:F6). All out bypasses the FIFO with all_out: true. Apply-here first as today
  (the echo is recognised by oid). `stale` -> the "on this monitor only" path worded "<graphic>
  was changed from another screen; air did not change"; `superseded` -> no notice (the page's own
  later press stands); 55P03 counts as unanswered for proto 2 (latency:F9). Mark `fast` items by
  today's rules (clock events slow) so old renderers keep their fast road.
- publishControlShow: update by id without naming id in the SET; insert only when no row matched
  (retry the update on a unique violation). Same columns, same fallbacks as today.

## 3. Verification that must exist before queueing (AC-12..18)
On preview branch B (migrated) against branch A (unmigrated), interleaved, with the harness in
scratchpad/harness: S1 latency, S2 busy instance, S3 late Take, S4 lock-release order, S5
commit-order skip, plus: an old page (origin/main bundle) sending every 700 ms while 0069 and 0070
apply (no send fails); a real publish held open during Takes (AC-15 with the real writer); a
3-graphic data patch and simultaneous reports (reorder counts and tail_seq calls per follower); a
pre-migration Take then a new renderer boot (legacy path airs it); unpublish + republish with an
open renderer (epoch reset).
