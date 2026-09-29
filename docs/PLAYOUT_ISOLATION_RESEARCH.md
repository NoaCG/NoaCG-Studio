# Playout isolation research - keeping a production on air while NoaCG changes

**Status: RESEARCH ONLY, nothing built, nothing decided (2026-09-29).** No product code, schema or
infrastructure changed because of this document. It is the evidence for the owner's Phase 6
decision ("Playout Runtime & Reliability"). Where it recommends, the recommendation is labelled a
suggestion.

**Why it exists.** On 2026-09-29 the production database stopped answering and restarted
(06:42-06:45 UTC) after library sync lists hit statement timeouts. Every Take in that window failed,
because every step of the live path runs through that one database. The sync cause is fixed
(67d444dc5, 551f4f60f). This document asks the wider question: how does a prepared production stay
reliable on air while NoaCG keeps being developed, deployed, migrated and synced, or is partly down?

**How to read the evidence tags.** **[code]** checked in source at `709fdd3ad` (file:line given).
**[measured]** run for this document, method in §5. **[doc]** claimed in a repo document and not
re-checked. **[web]** an external source, linked. **[inferred]** reasoning, not observed.

Read `docs/CLOUD_PLAYOUT.md` and `docs/BRIDGE.md` first; this document assumes them.

---

## 1. Summary

**What we have.** A working system with good bones on the output side: every graphic is preloaded
when an output opens, the output keeps its last picture when the connection drops, and an open
output keeps running the code it booted with through any number of deploys (seven went live on
2026-09-29). What it lacks is isolation on the command side: **every live verb, both delivery
roads, recovery and output boot run through the one Postgres** that library sync, the audience
pages, publishing and migrations also use (§2).

**What the measurements say** (§5, on a temporary preview branch, never production):

- **The "fast road" no longer exists as a separate path.** Since migration 0064 the command frame
  and the log row are both database broadcasts in the same transaction and arrive at the same
  millisecond (p50 difference 0 ms).
- **A database overload does not fail a Take; it delays it silently.** With the database's
  connections held by slow calls (the shape of the 2026-09-29 incident before the restart), no send
  failed, but Takes reached the follower a median 2.4 s and up to 18 s late, and 23 of 79 in a
  different order from the presses. The operator's own monitor had already moved, so nothing
  looked wrong.
- **A lock on a control table fails every press for the length of the lock, then airs a burst of
  late commands in any order.** In one run the last command to arrive was the first Take, so air
  ended with the graphic up after the operator's last press was Out; in another the final state
  was down to which of two commands landed in the same millisecond.
- **One line of migration hygiene removes the migration risk measured here.** An instant
  `ALTER TABLE` queued behind a 12 s reader failed 12 of 38 sends; with `lock_timeout = '2s'` it
  failed none.
- **Realtime client Broadcast kept its 46 ms median through the database overload**, and joins to
  private channels kept working. That is the path that can carry commands when Postgres cannot.
- **Browser storage survives a restart on CasparCG 2.5 but not on CasparCG 2.3**, so a
  browser-side cache alone cannot carry a CasparCG 2.3 output through an outage.
- **Followers can silently lose a Take from the durable log.** With the hot row held by an ordinary
  write, another operator's later command committed first and a watching page's log skipped the
  delayed Take in 5 of 5 trials; the picture still aired through the fast road, so nothing looked
  wrong, but recovery and reports are built from that log.
- **Other productions slow every production.** Because log ids are global, one other busy
  production added about 92 ms to every Take and switched the sender's fast road off for 17 of 20
  Takes.
- **The operator surfaces mislead exactly when it matters.** During a PostgREST outage the chip kept
  saying a graphic was on air that no screen showed; a hosted page reloaded during the outage said
  "This link is invalid or the page was unpublished" and did not recover by itself; with Realtime
  blocked, commands reached the output 12-26 s late while the only health light stayed green.
- **Three ways to put the wrong thing on air without any error:** a Take delayed in transit landed
  after the Out pressed behind it (graphic up, operator page "nothing on air"); a font host that
  hangs leaves an output that counts every Take and shows nothing; and the SPX output embed, served
  against production's framing headers, puts a full-frame grey error page on a CasparCG 2.5 layer.
- **Render time is not the problem on a desktop browser**: about 30 ms from the output applying a
  Take to its first frame, quizzes included; the command path is the other 200 ms.
  The same holds inside CasparCG 2.5's renderer; the quiz slowness the owner saw is on the way to
  the output, not in the graphic.

**Suggested direction (a suggestion, §14):**

1. **Guardrails now** (§16): small fixes, several found by this research, among them that
   production's framing headers block the SPX output embed.
2. **Make the command path cheap and correct before anything else**: a per-show sequence that
   commits in order, the hot row split, stale Takes refused by a revision check, and a small
   desired-state summary on every command so outputs heal themselves. READY's "in sync" is not
   provable without it.
3. **READY as an automatic status and Prepare for Live as an optional, seconds-long check** that
   never locks editing (§9), then **versions with last-known-good** so a changed graphic prepares
   beside the one on air and is applied only when it is safe (§10).
4. **Outage survival by measurement**: signed commands over Realtime client Broadcast, so delivery
   no longer needs Postgres, and **an optional local runtime grown from NoaCG Bridge** for venues
   that must survive losing the internet (§12). One renderer and one command format in both modes.
5. **No separate playout backend yet**, and no permanent "no deploys while live" rule; instead a
   live-path contract that only grows, `lock_timeout` on every migration, and contract changes
   retired by evidence from the outputs themselves (§11).

The owner's decisions are collected in §18.

---

## 2. The system we actually have

### 2.1 One Take, end to end

```
 operator page                         Supabase (one project, one Postgres)                 renderer (/output)
 ─────────────                         ────────────────────────────────────                 ──────────────────
 press Take
   applies fast items to its own
   monitor (0 hops)
   POST /rest/v1/rpc/control_send_many ──► PostgREST ──► control_send_many (one transaction):
                                                        slug lookup, entitlement gate,
                                                        burst cap count(*),
                                                        INSERT 3 control_events rows ──► trigger realtime.send
                                                        UPDATE control_shows.live_cue      per row: log-<show>
                                                        realtime.send(fast items): cmd-<show>
                                                        COMMIT ─────────────────► Realtime ─► private topics ─► dedupe by oid,
                                                                                                                apply to the
                                                                                                                graphic's iframe
                                                                              ◄── control_output_report 800 ms later
                                                                                  (UPDATE live + INSERT a 'live' row)
```

- **Send** [code]: every hosted verb is one PostgREST POST, `control_send_many(p_slug, p_items)`
  (`src/control/hostedControl.ts:909-914`; current body `supabase/migrations/0057_command_topic_keeps_live_cue.sql:28-91`).
  `SECURITY DEFINER`, anon-callable, the slug is the whole authorization. A Take is three items,
  `update`, `play`, `cue` (`hostedControl.ts:934-940`); Out is `stop`, `cue` (`:943-948`); All out
  goes in batches of four layers (`:969-975`).
- **In the transaction** [code]: slug lookup; `feature_denied_for` (reads `user_accounts`,
  `system_settings`, `user_grants`); a burst cap that counts the show's rows in the last 5 s with no
  `created_at` index (0057:57-61); the inserts; one `UPDATE control_shows` per cue item (0057:69-77),
  which also fires `set_updated_at` and `control_shows_guard_owner`; one `realtime.send` per
  inserted row from the AFTER INSERT trigger (0064:28-53); one `realtime.send` for the items the
  sender marked fast (0057:83-90). About 8 row writes and 5 reads per Take.
- **Delivery** [code]: both "roads" are database broadcasts. The fast road (`cmd-<show>`, 0056) and
  the log road (`log-<show>`, 0064) are both `realtime.send` calls committed in the same
  transaction. There is no client-to-client message anywhere on the path; no client role may
  insert into `realtime.messages` (0056:161-170, re-asserted 0064:77-85).
- **Receive** [code]: the renderer dedupes by the command's minted `oid` (400 remembered,
  `commandRoads.ts:109,171-191`) and by row id (`hostedControl.ts:1068`), holds an out-of-order
  row 25 ms before treating the gap as a hole (`:1107-1149`), refills from the tail on every
  (re)subscribe and every 30 s whatever the socket does (`:1026,1103-1106,1150-1155`), and while a
  refill walk is running it drops fast frames (`:1157-1158`) and stops its own sender's fast road
  (`:751,830`).
- **Report and heartbeat** [code]: `control_output_report` 800 ms after a forwarded command or state
  change (`src/output/main.ts:158-173`); `control_output_seen` at boot and every 60 s (`:463-464`).
  Both write the same `control_shows` row the Take updates.

### 2.2 The other verbs

| Verb | Surface call | Items | Extra database work |
|---|---|---|---|
| Take | `takeCueItems` | update, play, cue | the send; renderer report after |
| Update | `updateLive` | update | none (no cue item, no `live_cue` write) |
| Next | `nextLive` | next | none |
| Out | `clearCueItems` | stop, cue | `live_cue` write |
| All out | `clearAllCueBatches` | 2 per live layer, 4 layers per call | one call per 4 layers |
| Custom action | `fireEvent` | event | `control_data_patch_by_slug` when a bound value moves (`ProductionPage.tsx:2987-2989`) |
| Snap | `snapTo` | snap, update | none |
| Hosted typing | `stageShared` | - | `control_stage` in parallel with a Take when typing is pending (`HostedControlPage.tsx:674-676`) |
| Server clip/template | Bridge `act` over loopback | - | none: the only verbs that never touch Postgres (`playoutLink.ts:383,589`) |

### 2.3 The renderer (`/output?production=<output slug>`)

- **Boot** [code]: Vercel serves a static page (`output.html`); it resolves the production with
  `control_output_by_slug`, retried for good with backoff to 10 s (`main.ts:102-104`,
  `hostedControl.ts:647-662`). The answer is the whole payload pinned at publish: every graphic's
  HTML, CSS, JS and assets as data URLs (`hostedControl.ts:278-345`), up to 6.7 MB for the largest
  production [doc, CLOUD_PLAYOUT.md:762]. There is no cache across reloads, no service worker, no
  browser storage.
- **Preload** [code]: every graphic becomes a sandboxed `srcdoc` iframe at open, hidden until its
  `load` (`src/output/stage.ts:166-216`). Commands queue until the frame is loaded.
- **Take inside the frame** [code]: `update` runs at once; `play` waits for `document.fonts.ready`,
  capped at 400 ms, and later commands queue behind it (`src/preview/composeDocument.ts:273-303`).
  Bundled fonts are fetched from `noacg.studio/fonts/*` by each frame (`model/fonts.ts:335-343`);
  uploaded and Google fonts are data URLs.
- **Recovery** [code]: from the oldest per-graphic report baseline, or from row 0 if nothing ever
  reported; off air while the missed rows replay, then back on air (`outputRecovery.ts:54-74`,
  `main.ts:339-409`, `catchUp.ts`).
- **On disconnect it keeps the last picture** [code]: nothing clears the stage (`main.ts:447-459`).
  This is already the "last known good picture" property, for the running page.
- **Version** [code]: no version check, no `vite:preloadError` handler, no reload prompt. An open
  renderer runs the code it booted with for as long as it stays open.
- **Re-publish** [code]: reaches an open renderer only when it reloads, and the reload swaps every
  graphic at once and snaps the old state into the new frames (`main.ts:363-379`).

### 2.4 Operator surfaces

- **Production page** (signed in, `authenticated` role): sends through `sendControlVerb`; health is
  `output_seen_at` under 90 s, polled every 30 s ("● output connected / ○ output not answering",
  `ProductionPage.tsx:1372-1377,4256-4273`).
- **Hosted control page / phone** (signed out, `anon` role, `/app?control=<slug>`): the same sender;
  no renderer health at all [code], although CLOUD_PLAYOUT.md §4 says both surfaces show it.
- **Resolve on error** [code]: `controlShowBySlug` returns `null` on any error
  (`hostedControl.ts:559-563`), so an outage reads as "invalid or unpublished" on the hosted page.
  The renderer's resolve does not have this defect: it uses `RpcAnswer` and retries
  (`hostedControl.ts:619-626,664-684`).

### 2.5 NoaCG Bridge, CasparCG and the local relay

- **Bridge** (`cli/src/playout/`, exe 0.6.0) [code]: a loopback-only HTTP server on
  `127.0.0.1:8899` with token pairing and an origin allowlist (`cli/src/playout/server.ts:397-459`). No Supabase
  code, no cache, state in memory only (`BRIDGE.md` §3). It never binds `0.0.0.0`, on purpose:
  that would make any web page a remote control for the playout server (`BRIDGE.md` §1c).
- **CasparCG graphics come through the cloud** [code]: "Put on air" sends
  `PLAY 1-20 [HTML] "https://noacg.studio/output?production=<slug>"` (`playoutLink.ts:608-610`).
  So the main production path shares every cloud dependency above. Only server clips and server
  templates driven over AMCP avoid it, and the Bridge can already drive templates with
  `CG ADD/UPDATE/NEXT/STOP` (`cli/src/playout/adapters/casparcg.ts:276-308`).
- **Local relay** [code]: HTML-overlay and production exports carry a stdlib Python or PowerShell
  relay (protocol v1: `/relay/ping|head|log|send`, `src/export/local-relay/`), a `controller.html`,
  and a receiver that polls every 400 ms (`src/control/localReceiver.ts`). It is offline-capable,
  localhost-only, unauthenticated, and not connected to published productions.

### 2.6 Deployment and migration pipeline

- **Migrations** [code]: every push to `main` runs `.github/workflows/post-land.yml`, which applies
  whatever production and then staging are missing (`db-push.mjs`), with no approval step. It
  refuses destructive statement classes (`db-push.mjs:333-395,449-497`) but sets no `lock_timeout`
  or `statement_timeout`; a repo-wide grep finds none.
- **Frontend** [code, doc]: Vercel builds `main` independently; the migration usually lands one to
  three minutes before the new frontend is live (`docs/DEPLOYMENT.md:89-97`). Nothing orders them,
  and a refused migration does not stop the frontend.
- **History of live-path migrations** [code]: 0029 added unique columns with volatile defaults to
  `control_shows` (a table rewrite under an exclusive lock); 0056 redefined `control_send_many` by
  copying an older body and silently dropped the `live_cue` mirror (fixed by 0057); 0066, which
  revoked anon read on `control_events`, was committed three hours after 0064 (15:16 and 18:08 UTC
  on 2026-09-24), although 0064's header said to wait until on-air renderers had reloaded; older
  exported receivers fell back to the 30 s poll. Nothing records whether any had.
- **Vercel** [measured]: hashed assets are served `Cache-Control: public, max-age=0,
  must-revalidate`. Skew Protection is active but not wired: an old deployment's assets answer
  404 on `noacg.studio` and 200 with `?dpl=<deployment id>`, which the Vite build never sends (§5.5).
  Rolling releases are off.

---

## 3. Verified facts, and where the docs disagree with the code

### 3.1 Beliefs this research checked

| Belief | Verdict | Evidence |
|---|---|---|
| "The fast road is independent of the database" | **False.** Both roads are `realtime.send` calls inside the send's transaction | [code] 0056, 0057:83-90, 0064:28-53 |
| "The fast road is faster" | **Not any more.** Since 0064 the command frame and the first log row arrive together | [measured] §5.1 |
| "An open output keeps its picture when the connection drops" | **True** | [code] `main.ts:447-459` |
| "An output survives a reload during an outage" | **False.** It retries the resolve forever, transparent | [code] `main.ts:102-104`; [measured] §5.6 |
| "A deploy does not affect an open output" | **True for the running page**; a reload gets the new build; a page that fetches a lazy chunk after a deploy gets a 404 | [code]; [measured] §5.5 |
| "Migrations are safe because db-push refuses destructive statements" | **Partly.** It refuses DROP, TRUNCATE and similar, but not a lock queue, a behaviour change or a signature change | [code] `db-push.mjs:333-497`; [measured] §5.3 |
| "Retries cannot air a stale Take" | **False.** The guard stops retries, not the attempt in flight; waiting sends commit in any order when a lock releases | [code] `failedSends.ts:68-91`; [measured] §5.3 |
| "The log's id order is delivery order" | **False.** Ids are allocated at insert and commit in a different order | [code]; [measured] §5.3 |
| "NoaCG graphics on CasparCG do not depend on the cloud" | **False** for the documented workflow (the cloud URL on a layer); Bridge can drive server templates without it | [code] `playoutLink.ts:608-610`, `casparcg.ts:276-308` |
| "Output health is shown to operators" | **Only on the production page**, from one timestamp any renderer overwrites | [code] `ProductionPage.tsx:1372-1377`; hosted page has none |
| "A renderer boot cache would carry a restart through an outage" | **Depends on the host**: yes on CasparCG 2.5 (storage persists), no on CasparCG 2.3 | [measured] §5.4 |

### 3.2 Where the documents disagree with the code

Found by the trace for this document; none is fixed here.

- `CLOUD_PLAYOUT.md` §2 (5b) says a Take is "update -> stop previous -> play -> cue"; the code sends
  three items with no stop (`hostedControl.ts:934-940`).
- `CLOUD_PLAYOUT.md` §3 says the renderer follows `control_events` INSERTs and reports through
  `control_report`; it follows the private `log-` topic and reports through `control_output_report`.
  The concurrency table still names the retired `control-<showId>` channel.
- `CLOUD_PLAYOUT.md` §4 says a published production applies nothing locally; the sender applies its
  fast items to its own monitor first (`applyHere`).
- `CLOUD_PLAYOUT.md` §4 says staged edits do not ride a cue Take; on the hosted page they do
  (`hostedCueValues`, `HostedControlPage.tsx:729`).
- `CLOUD_PLAYOUT.md` §4 says both operator surfaces show renderer status; the hosted page shows none.
- `CLOUD_PLAYOUT.md` §6 and `CONTROL_LAYER.md` say exports bake the hosted receiver; exports strip
  it (`showExport.ts:93`), which `CLOUD_PLAYOUT.md`'s own known-limits section agrees with.
- `CONTROL_LAYER.md` says Postgres Changes deliver the rows and there is "no second command path";
  the code has two roads and the log topic.
- The 0057 header says `control_output_by_slug` returns `live_cue`; it does not.
- The 0033 header says a never-rendered production starts at the log head; `outputRecovery.ts`
  starts at row 0.
- The fast road's median is given as 97 ms (`CLOUD_PLAYOUT.md`) and 87 ms (`commandRoads.ts`), and
  the durable road's 130-650 ms slow mode (`commandRoads.ts:3-14`) predates 0064; §5.1 measures both
  roads arriving together.
- `supabase/AGENTS.md` and `scripts/migration-drift.mjs` say the management token is deliberately
  not a CI secret; `post-land.yml` uses it from the `production` environment.

---

## 4. Failure inventory

What the operator sees, what the audience sees, how it recovers, and how far it reaches. "Air"
is what the output shows. Evidence in brackets; §5 has the numbers.

| # | Failure | Operator sees | Audience sees | Recovery | Blast radius |
|---|---|---|---|---|---|
| 1 | **Postgres overloaded** (connections held by slow calls, the shape before the 2026-09-29 restart) | nothing wrong: sends succeed, their own monitor moves at once | graphics arrive late (p50 2.4 s, up to 18 s) and some in the wrong order | by itself when the load drops; a wrong final state stays until the next press | every production on the project [measured] |
| 2 | **Postgres not answering or restarting** (the incident) | each press is sent 4 times over 3.6 s when PostgREST answers 503 at once (as on 2026-09-29), or for about 6.5 s (hosted page, `anon`) to 8 s (production page, `authenticated`) when statements hang; then "That is on this monitor only… Send it again.", with a chip that still says the graphic is on air | the last picture stays; nothing new | no resend after the 4 s window; the operator presses again; outputs refill from the tail; database broadcasts may lag behind the database coming back (Supabase issue #2211) | every production [measured §5.6, code, web] |
| 3 | **PostgREST failing, database fine** | the same as 2 | the same as 2 | the same as 2 | every production [measured §5.6] |
| 4 | **Realtime down, REST fine** | sends succeed; nothing warns: the output-health light stays green because the heartbeat goes over REST; the output says "NOT JOINED" only on its debug line | commands arrive through the 30 s poll floor: up to 30 s late (measured 11.8-25.9 s) | by itself on rejoin, with a tail refill | every production [measured §5.6] |
| 5 | **A Supabase region or maintenance outage** | 2 and 4 together; a reloaded operator page cannot start | the last picture stays; a reloaded output stays blank | when Supabase returns | every production [inferred] |
| 6 | **Vercel down** | an open page keeps working; a reload fails | an open output keeps working (fonts already loaded); a reloaded output fails to load | when Vercel returns | only reloads [code; §5.6] |
| 7 | **Venue internet down, LAN up** | cloud sends fail as in 2; Bridge clips and server templates still work | the last graphics picture stays; server clips keep playing | when the internet returns | that venue [code, inferred] |
| 8 | **WebSocket reconnect** | nothing, or a brief "not joined" chip | a command sent during the drop arrives at the next poll or rejoin (measured 13-16 s) | reconnects at 1, 3, 8, 18 s after the drop, then every 10 s; each rejoin is a Postgres query plus a tail read | that output [measured §5.7] |
| 9 | **An output open across a frontend deploy** | nothing | nothing: it keeps its code | a reload gets the new build, not the one it was prepared on | none while open [code; §5.5] |
| 10 | **A migration locks a control table** | every press fails after 3 s (hosted) or 8 s (production page); the notice as in 2 | nothing new for the length of the lock, then a burst of late commands **in any order**, so a stale Take can end on air | the migration finishes; with `lock_timeout` it gives up after 2 s instead | every production [measured §5.3] |
| 11 | **A function or schema change under open pages** | behaviour change: nothing visible (0056 dropped the `live_cue` mirror silently); signature change: every press fails with the server's words (`PGRST202`) | nothing new | a forward fix; the next press after it works with no reload | every page on the old contract [code; measured §5.3] |
| 12 | **Auth expires** | outputs and the hosted page use the anon key plus a slug and do not expire; the production page's session refreshes in the background; if the refresh fails (auth outage, offline), its sends are refused with a JWT error, which is not retried | nothing new from that page | the session refreshes or the operator signs in again | that operator [inferred from code] |
| 13 | **Rate limits and quotas** | "Too many commands. Slow down a moment." at 50 rows per 5 s per production, which renderer reports also consume; Realtime past its connection cap refuses new joins, past its message cap disconnects | a refused command does not air | wait; the Realtime client reconnects under the cap | one production (burst cap); every production (Realtime) [code, web] |
| 14 | **Commands duplicated, reordered or late** | duplicates: nothing; late: nothing, the own monitor already moved | a duplicate airs once (measured); a late or reordered command airs when it arrives, even after a later press | none built in: no staleness check, no revision | that production [measured §5.3, §5.6] |
| 15 | **Many outputs reconnect at once** | nothing | each output catches up after the rejoin | in lockstep: every output retries at the same instants (1, 3, 8, 18 s) and refills together; up to 10 s after Realtime is back before they rejoin | the project's Postgres and Realtime join rate [measured §5.7] |
| 16 | **Bridge crashes and restarts** | the Bridge state reads "unidentified" for its clips; graphics are unaffected (they come from the cloud) | CasparCG keeps playing what it has; a running sequence stops advancing | restart the exe; All out clears unidentified clips on the rundown's layers | that venue's server clips [code, `CLIP_PLAYBACK_PLAN.md` §20] |
| 17 | **New content fails to prepare while the show is ready** | nothing: the chip says the broken graphic is on air; its script error reaches only the output's own console (`stage.ts:234-236` ignores the frame's error report) | the broken graphic shows nothing when taken; the others play normally | re-publish a fixed graphic and reload the output | that graphic [measured §5.6] |
| 18 | **The font host hangs** (a request that never answers) when an output opens | nothing: Takes are sent and counted | no graphic ever appears: every frame waits for its fonts before it loads, and commands queue behind unloaded frames | when the font requests finally fail or answer; a font host that refuses at once is harmless (fallback faces) | every output that opens during it [measured §5.2] |

---

## 5. Measurements

### 5.0 Where and how

- **Backend:** a temporary Supabase preview branch of the NoaCG project (Postgres 17.6, eu-west-1,
  all 67 migrations applied by the branch itself), created for this research on 2026-09-29 and
  deleted the same day. Nothing touched production. Its role timeouts are the Supabase defaults:
  `anon` 3 s, `authenticated` 8 s, `authenticator` 8 s statement and 8 s lock. Production's were
  not read.
- **Client:** the owner's Windows laptop in Finland, over its normal connection. **Hosted latency
  is indicative only**: a different network or region moves every number; the comparisons between
  conditions are the point.
- **Tools:** a Node probe that sends the operator's own RPC (`control_send_many`, as `anon`, the
  same body shape `sendControlVerb` posts) every 700 ms and follows the same private topics a
  renderer follows, plus a public client-broadcast channel; database faults applied through the
  Management API on the branch only. Playwright walks of the real app (dev server, branch backend)
  for what the operator and the output show. CasparCG 2.3.2 and 2.5.0 installed on the same laptop,
  run from scratch configurations. The scripts are not committed; each run below states its method.
- **Latencies are kept apart:** *command latency* is press to the output receiving the command;
  *render latency* is the output receiving it to the graphic's first presented frame; *prepare
  latency* is opening an output to every graphic being loaded.

### 5.1 Command latency on a healthy database

Node probe, 40 alternating Takes and Outs, one follower:

| Measure | p50 | p95 | max |
|---|---|---|---|
| `control_send_many` round trip | 68 ms | 227 ms | 242 ms |
| send to the command frame (`cmd-`) at the follower | 69 ms | 223 ms | 227 ms |
| send to the first log row (`log-`) at the follower | 68 ms | 223 ms | 226 ms |
| log row minus command frame | **0 ms** | **0 ms** | - |
| client-to-client Broadcast, round trip through Realtime | 44 ms | 50 ms | - |

**Both roads arrive together.** The fast road was built when the log still came through
`postgres_changes`, which had a slow mode of several hundred milliseconds. Since 0064 the log is a
database broadcast in the same transaction, so the command frame has no lead left. The machinery
that exists for the difference (oid dedupe of two copies, the 1200 ms slow-after-event hold, the
stand-down during refill walks) is now cost without benefit on a healthy database.

**The same through the real app** (Playwright: press on the hosted control page, a dev build; the
output's WebSocket frames stamped on arrival; the output's own `data-plays` counter for "applied"),
20 Takes per condition, p50 / p95:

| Condition | press -> send answered | press -> command frame at output | press -> output applied the Take |
|---|---|---|---|
| 1 output | 113 / 126 ms | 116 / 125 ms | 114 / 124 ms |
| 3 outputs | 114 / 202 ms | 116 / 163 ms | 115 / 158 ms |
| 1 output, **another production writing a row every 120 ms** | 69 / 155 ms | (fast road off, below) | 160 / 233 ms |

**Other productions' traffic slows every production.** Log ids are global, so with any other
production writing, every row this production receives has a "gap" in front of it. The follower
holds each row 25 ms, then reads the tail to fill a gap that was never there. Measured per Take:
the output applied the command **1 ms** after its log row arrived on a quiet instance, and **92 ms**
(p95 103 ms) after it with one other busy production. Worse, the sender's own follower was almost
always mid-refill, and a sender mid-refill turns its fast road off: 17 of 20 Takes went out with no
command frame at all. At scale every production is "another production"; a per-show sequence (§14
step 2) removes this entirely.

### 5.2 Render latency

**Method.** The real `/output` page of a published production on the branch, four graphics (House
Scorebug, Arena Quiz qz01, Frost Quiz qz03 with `backdrop-filter`, Hairline lower third). Each
graphic's frame was instrumented from Playwright: the time its `update()` and `play()` ran, and the
second animation frame after `play()` returned (the first frame the entrance is presented in).
Takes were pressed on the hosted control page (a dev build, so its own click handling is slower
than production's). Six rounds of four Takes per condition; p50 / p95.

| Condition | Output open -> ready | Renderer applies -> first frame | inside it: `update()` | `play()` | press -> first frame |
|---|---|---|---|---|---|
| Desktop Chromium, full CPU | 1.4 s | 27-33 / ≤ 42 ms | ≤ 2 ms | ≤ 6 ms | 227-257 / ≤ 307 ms |
| Desktop Chromium, CPU ×4 | 3.0 s | 29-36 / ≤ 115 ms | 1-15 ms | ≤ 70 ms | 237-303 / ≤ 383 ms |

At full CPU no long tasks were recorded and the first Take of each graphic was no slower than the
later ones: every graphic had been composed and its fonts loaded when the output opened. At ×4 the
first Takes of the scorebug and of a quiz each carried one long task (76 and 54 ms), the only
sign of first-use cost. **On a desktop browser the graphics' own Take-time work is small; the
command path dominates** (press to first frame 230-260 ms, of which rendering is about 30).
A warm pass at open time (§9.2, guarantee 5) would remove the first-use long task on slow hosts;
it would not change the typical Take.

**Fonts are the one Take-time dependency that can stop a graphic entirely.** Bundled fonts are
fetched from `/fonts/*` by every graphic's frame when the output opens. Three runs, four graphics
each, a Take of every cue, the output's frames inspected 10 s after opening and again 35 s after:

| Font requests | Graphic frames loaded | Takes counted by the output | Graphics visible on air |
|---|---|---|---|
| answered | all 4 | all | all 4 |
| refused at once | all 4 | all | all 4, on fallback faces |
| **hanging** (no answer) | **none, still hidden after 35 s** | all | **none** |

A web font requested during a frame's first layout holds back that frame's `load` event, and the
stage keeps every frame hidden, with its commands queued, until `load` (`stage.ts:147-164,
190-208`). So a font host that answers slowly or never (a venue proxy, a partial CDN problem, a
local runtime that forgot the fonts) leaves an output that accepts every Take and shows nothing,
with nothing on any operator surface saying so. The 400 ms `fonts.ready` cap on `play` never gets a
chance to help, because the frame never loads. Fonts belong in the prepared version (inlined, or
served by whatever serves the output) and should never gate a frame; READY's guarantee 4 is what
would have shown this as amber instead of silence.


### 5.3 Database faults

All on the branch, Node probe sending every 700 ms unless stated.

**Table lock.** `LOCK control_events IN ACCESS EXCLUSIVE MODE` held 15 s: every send in the window
failed after **3.07 s** with `57014 canceling statement due to statement timeout` (the `anon`
role's 3 s), 17 of 41. The operator's page treats 57014 as "unanswered" and retries at 400 ms, so
one press spends about 6.5 s before the notice appears (two 3 s attempts). The production page
signs in as `authenticated`, whose timeout is 8 s: one attempt, then the notice after 8 s.

**Row lock on the hot row.** The production's `control_shows` row held for 15 s, first with
`SELECT ... FOR UPDATE`, then (rerun) with an ordinary `UPDATE`: identical for Takes and Outs, 17 of
41 failed after about 3.1 s each. Every Take and Out carries a cue item and so updates that row.
In the app under the same `UPDATE` lock, an Update of a graphic already on air (no cue item) went
through in about 200 ms while every Take and Out around it failed.

**The wrong order after a lock.** In both runs, the four sends still waiting when the lock released
committed within about 30 ms of each other, **and reached the follower in a different order from
the presses**:

| Pressed at | Verb | Reached the follower at |
|---|---|---|
| 16.85 s | Take | 19.47 s (**last**) |
| 17.55 s | Out | 19.45 s |
| 18.25 s | Take | 19.45 s |
| 18.95 s | Out | 19.45 s (**first**) |

The operator's last press was Out; the last command to arrive was the first Take, so air ended
with the graphic up. In the row-lock rerun the last press (Out, 18.97 s) arrived *first* (19.64 s)
and a Take pressed before it arrived 28 ms later, in the same millisecond as an older Out, so
which one air ended on was down to chance. The renderer applies whatever
arrives, deduped only by id, so nothing in today's design can tell a stale Take from a new one.

**A migration-shaped lock queue.** A reader held `control_events` for 12 s and a plain
`ALTER TABLE control_events ADD COLUMN` (normally instant) queued behind it:

| | Sends failed | Longest successful send | What the ALTER did |
|---|---|---|---|
| no `lock_timeout` | **12 of 38**, every send for 8 s, then late commits up to 2.5 s | 2,533 ms | waited 11.7 s, then applied |
| `SET lock_timeout = '2s'` | **0 of 38** | 1,478 ms | gave up after 2.2 s (`55P03`) |

This is the textbook lock queue: the ALTER itself needs no time, but every Take waits behind it.
One line in the migration session turns an outage into a two-second hiccup and a retry.

**An incompatible function signature.** `control_send_many(text, jsonb)` dropped and replaced by a
`(text, jsonb, int)` version while the probe kept sending: every send failed at once with `404`
(`42883`, then `PGRST202 "Searched for the function public.control_send_many with parameters
p_items, p_slug..."`), 13 of 13 for the 8.5 s it lasted. In the app, an open hosted page showed
*"That is on this monitor only. It may not have reached the screens or the log (Could not find the
function public.control_send_many(p_items, p_slug) in the schema cache). Send it again."* After
the original was restored, **the very next send succeeded** with no reload (the open page's next
Take aired 591 ms after the restore): PostgREST's schema reload was effectively immediate. The
damage lasts exactly as long as the incompatible contract does.

**The database overloaded.** 60 concurrent calls to a branch-only function that burns 2.5 s of CPU
each, through PostgREST as `anon`, for about 55 s (481 calls, all answered):

| During the overload | Before | During |
|---|---|---|
| `control_send_many` round trip, p50 / p95 / max | 68 / 114 / 114 ms | **2,424 / 15,529 / 18,411 ms** |
| sends that failed | 0 | **0** |
| sends that reached the follower out of press order | 0 | **23 of 79** |
| client-to-client Broadcast, p50 / p95 | 46 / 50 ms | **46 / 55 ms** |
| private channel join (a fresh client) | 197 ms | 225-253 ms, all `SUBSCRIBED` |
| Realtime REST broadcast | - | `202` in 146-188 ms |

This is the shape of the 2026-09-29 incident before the restart: connections held by slow calls.
Nothing failed, so **the operator saw no error at all**, but Takes reached air a median 2.4 s and
up to 18 s late, and a quarter of them in the wrong order. The queue was PostgREST's connection
pool, where the statement timeout does not apply. Meanwhile Realtime client Broadcast did not slow
down, and joins to private channels still worked. A Postgres *restart* could not be reproduced on a
hosted branch; Supabase documents that client Broadcast does not need the tenant pool [web], while
database-originated broadcasts (both of NoaCG's roads) do.

**A higher log id can reach followers seconds before lower ones.** The hot row held for 2.5 s by an
ordinary `UPDATE` (what a renderer report or a publish does); a Take sent during it; 0.7 s later
another operator's Update, which carries no cue item and so does not wait for the row. The Update
committed in 106 ms; the Take waited 2.5 s. A follower received log row **2396 about 2.4 s before
rows 2393-2395**. The renderer's follower treats the gap as a hole for 25 ms, refills from the tail
(which cannot return uncommitted rows), moves its cursor to 2396, and then drops 2393-2395 as
already seen when they arrive (`hostedControl.ts:1068,1134-1149`).

**And the real follower does drop them.** The same setup in the app: operator A's Take waiting on
the held row, operator B's Update committing past it, and a third hosted page watching. The
watcher's action log is built only from durable log rows. In **5 of 5 trials it never recorded the
Take** (its update, play and cue rows), while it recorded B's Update and A's later Out on either
side; an earlier Take made without the lock appears in the same log normally. The watcher's chip
still showed the graphic on air, because the Take also travelled the fast road, which is why
nobody would notice: what is lost is the durable record every follower builds its report baseline,
action log and recovery from.

A correction to an earlier run: holding the row with `SELECT ... FOR UPDATE` also blocks the
foreign-key check of *every* insert into `control_events`, so under that lock even an Update
failed. A real writer takes the weaker `FOR NO KEY UPDATE`: inserts pass and only other `UPDATE`s
of the row (every Take and Out, through `live_cue`) wait. With a real `UPDATE` holding the row for
15 s, the result for Takes and Outs was the same as above: every one failed after about 3.1 s.

### 5.4 Playout hosts

**Browser storage in CasparCG's embedded Chromium** (a probe page writing localStorage, IndexedDB and
Cache Storage, loaded with `PLAY 1-10 [HTML]`, then reloaded, then after a server restart):

| Host | Engine | Survives a layer reload | Survives a server restart |
|---|---|---|---|
| CasparCG 2.5.0 | Chromium 142 | yes, all three | **yes**, all three |
| CasparCG 2.3.2 | Chromium 71 | yes, all three | **no**, all three empty; also with `<cache-path>` set |
| OBS 32 | CEF | not run | localStorage persists across restarts [web] |

A browser-side boot cache therefore helps OBS and CasparCG 2.5 but not a CasparCG 2.3 restart, which
is why §10 prefers a boot path that does not depend on it.

**Render time inside CasparCG 2.5.0** (Chromium 142, its default software raster): the branch
production on a layer, the same frame instrumentation read over CasparCG's DevTools port, Takes
pressed on a hosted page in a separate browser; five rounds, each graphic's own Take:

| Graphic | press -> first frame, p50 / p95 | `update()` | `play()` | `play()` -> presented frame |
|---|---|---|---|---|
| House Scorebug | 212 / 568 ms | ≤ 1 ms | ≤ 5 ms | 9 / 17 ms |
| Arena Quiz | 182 / 265 ms | ≤ 1 ms | ≤ 2 ms | 3 / 11 ms |
| Frost Quiz (`backdrop-filter`) | 171 / 288 ms | ≤ 1 ms | ≤ 3 ms | 7 / 12 ms |
| Hairline | 212 / 269 ms | 0 ms | ≤ 5 ms | 6 / 12 ms |

The graphics' own main-thread work is as small in CasparCG's renderer as on the desktop, and the
glass quiz is no slower than the others. Two limits: this measures when a frame is *produced*, not
what software raster of blurs and shadows costs afterwards or whether the channel drops frames
(CasparCG's own frame statistics would); and another session's test gate was running on the same
machine. CasparCG 2.3's Chromium 71 is too old for Playwright to attach to over DevTools, so 2.3
was not timed.

**So where can a quiz be slow?** Not in its rendering, on any host measured. The measured causes
are all on the way to the output: seconds under database load (§5.3), up to 30 s while Realtime is
down (§5.6), about 90 ms more per Take whenever another production is busy (§5.1), a quiz event
held on the durable road for 1.2 s after a slow one (`hostedControl.ts:781`), and a font host
that answers slowly (§5.2).

### 5.5 Deploys

- **Frequency:** on 2026-09-29, 18 production deployments were started and **7 went live** between
  08:07 and 14:41 UTC; the ignore step cancelled the other 11 (Vercel deployment list). An output
  left open all day meets several deploys.
- **Old assets:** the `/output` renderer chunk of a deployment about seven hours old
  (`/assets/output-BLLjtMA3.js`) answers **404** on `noacg.studio` and **200** with
  `?dpl=<deployment id>`. Skew Protection is therefore active on the project, but the Vite build
  never sends the deployment id, so an open page that fetches a lazy chunk after a deploy gets a
  404. The output page loads one lazy chunk, supabase-js, at boot; a failure there is cached and
  the page stays dead (§5.6).
- **Caching:** `Cache-Control: public, max-age=0, must-revalidate` on hashed assets; a missing asset
  answers `404 text/plain`.

### 5.6 What the operator and the output show during outages

Playwright, the real app on the branch: one output (`/output?...&debug=1`) and one hosted control
page, then faults injected in the browser.

**PostgREST not answering for 90 s** (every `/rest/v1/*` request answered `503 PGRST002 Could not
query the database for the schema cache. Retrying.`, the exact answer of 2026-09-29; Realtime left
up):

| Time after the outage began | What happened |
|---|---|
| 5.0 s | Take pressed. Sent 4 times (5.1, 5.6, 6.6, 8.6 s), each `503` |
| 8.6 s | The notice: *"That is on this monitor only. It may not have reached the screens or the log (the server did not answer). Send it again."* The live chip beside it keeps saying *"on air: ● House Scorebug"*; the output shows nothing new |
| 16.5 s | A second output opened: transparent, "resolving… (6 failed…)" on its debug line, retrying with backoff up to 10 s |
| 21-89 s | The first output's 30 s poll and 60 s heartbeat fail; it keeps its picture |
| 45 s | The hosted page reloaded: ***"Control page not found. This link is invalid or the page was unpublished."*** |
| 95 s | PostgREST answers again |
| +5 s | Nothing aired by itself; the notice and the "on air" chip are still up |
| +7.8 s | The second output resolves and follows, without a reload (its backoff step) |
| +8 s | The reloaded hosted page still says "not found" and stays so until reloaded |
| +8 s | The next Take reaches the output in 387 ms (204 ms in an earlier run) |

So the resend window does its job for a blip, the output behaves well, and the operator surfaces
mislead: a chip that says "on air" for a graphic that is on no screen but their own, and a
"not found" page for a production that exists.

**Realtime refused, REST fine** (the output's WebSocket closed on every attempt): the output shows
"realtime: NOT JOINED (CHANNEL_ERROR) - polling every 30 s" on its debug line only. Four Takes
reached it after **18.3, 25.9, 18.9 and 11.8 s**, through the poll floor (an earlier run: 18.7,
26.0, 18.8, 11.9 s). Its heartbeat goes over REST and kept succeeding, so the production page's "● output connected" would have stayed green
the whole time: **the one health signal an operator has says nothing about the path commands
take.** The hosted page shows nothing at all.

**A late Take** (the Take's request held 6 s in the browser, as a slow uplink or a queue in front of
the database would; Out pressed 1.5 s after the Take): the Out committed at 1.7 s, the Take at
6.1 s. **Air ended with the graphic up (161,636 non-transparent pixels in the output's screenshot,
against about 50,000 for the debug text alone) while the operator's page said "○ nothing on
air", with no error on either side.** The stale-send guard
only stops *resends*; nothing stops an attempt already in flight, and nothing on the server knows
the Take is older than the Out.

**A duplicate send** (the Take's exact request body posted a second time after it had aired): the
server accepted it (`204`), so the log now holds those rows twice, and the output played the
entrance **once**. The client-side dedupe by minted id works; the server has no idempotency of its
own.

**The supabase-js chunk failing once at boot** (one `404` for that file, then served normally): the
page logged "Failed to fetch dynamically imported module", its debug line stopped after the
engine name, and **20 s after the file was available again the output was still dead**. Only a
reload brings it back. On production that one failure is what a deploy landing between the page's
HTML and that chunk produces (§5.5).

**A graphic whose script throws at load, beside good ones** (one graphic's published script
prefixed with a `throw` on the branch, the output reloaded, every cue taken): the other three
graphics loaded and played normally, so the iframe sandbox does contain the failure. The broken
graphic showed nothing of itself when taken, **while the operator's chip said "on air: ● Frost
Quiz"**. The only trace was an error in the output's own console; the stage ignores the error
report its frames post. This is exactly the case READY's guarantee 3 and last-known-good (§10)
exist for.

### 5.7 Many outputs reconnecting at once

Ten outputs of one production; every output's Realtime socket closed at the same moment (as when
a Realtime node restarts), new sockets refused for 10 s, then allowed. A Take was pressed 3.3 s
after the drop, while no output had Realtime (REST kept working).

| | Measured |
|---|---|
| Reconnect attempts after the drop | all ten outputs at **1.0, 3.0, 8.0 and 18.0 s**, each round within about 120 ms across the ten |
| Realtime available again | 10.3 s |
| Outputs back on Realtime | 18.0 s: the next step of the schedule, 7.7 s after the service returned |
| The Take pressed during the drop reached the outputs | 16.5-18.9 s after the drop (13-16 s after the press), through the 30 s poll floor |
| Requests in the 20 s after Realtime returned | 22 tail reads, 10 reports |

The Realtime client's schedule is fixed (1, 2, 5, 10 s, then every 10 s; `RealtimeClient.js`
`RECONNECT_INTERVALS`) with no jitter, so every output of every production that drops together
retries together, and each rejoin of a private channel is a Postgres query followed by a tail read.
At ten outputs that is harmless; at thousands it is a synchronized burst against the database at
the moment it is least welcome. Jitter on the reconnect and on the refill (§16) is cheap.

### 5.8 The SPX output embed

The file `outputEmbedHtml` generates (`src/export/outputEmbed.ts`), served from another origin the
way SPX or a CasparCG template folder serves it:

- pointed at `https://noacg.studio/output?...`: Chromium logs *"Framing 'https://noacg.studio/'
  violates the following Content Security Policy directive: "frame-ancestors 'self'". The request
  has been blocked."* and the frame ends on `chrome-error://chromewebdata/`;
- the same file pointed at the dev server (which sends no such header) frames the output.

So the door `CONTROL_PANEL_ANY_GRAPHIC.md` §2 names for SPX cannot work against production today.
It has never failed a test because the dev server does not send the production headers.
**What reaches air.** Loaded on a CasparCG 2.5.0 layer (`PLAY 1-20 [HTML]`) and captured from
CasparCG's own renderer over its debugging port, the production-pointed embed shows **Chromium's
full-frame grey error page, opaque over the whole 1920x1080 frame**: every pixel covered. A
production that used this door would put a grey card with a sad-page icon over its programme.

---

## 6. How comparable systems solve this

These are principles, not products to copy.

| System | Where it runs | What it teaches NoaCG |
|---|---|---|
| **Vizrt Media Sequencer / Trio / Multiplay** [web](https://docs.vizrt.com/viz-multiplay-guide/3.2/Preparing_and_Playing_Out_Content.html) | Engines on site | "Initialize" loads every scene of a playlist into engine memory before air, so a take is instant. Each element shows grey, yellow or green for not, partly or fully loaded. A changed scene needs Cleanup then Initialize. The vendor warns that initializing during a broadcast can cost frame rate on air. |
| **Sofie** (NRK) [web](https://sofie-automation.github.io/sofie-core/docs/user-guide/concepts-and-architecture/) | Core central, Playout Gateway in the studio | The gateway runs next to the hardware so "the number of web-clients or load on Sofie Core won't affect the playout". Playout is **state-based**: Core sends a timeline of desired state, the gateway diffs it against device state and sends only the difference. Lookahead preloads the next parts. |
| **Singular.live** [web](https://developer.singular.live/rest-api/how-to-guides/update-a-sub-compositions-animation-state) | Cloud only | Cloud-rendered outputs with commands "synchronized through the cloud"; its control API is **state-based** too (`state: "In"|"Out"` plus the payload per sub-composition). No offline mode is documented. |
| **CasparCG** | Server on site | The server holds playout state; clients connect and disconnect without changing what is on air. `CG ADD` can load a template without playing it. The HTML producer's `enable-gpu` defaults to false (software raster). |
| **SPX Graphics Controller** [web](https://github.com/TuomoKu/SPX-GC) | Node server, local or cloud | Renderer URLs from a server that can sit on the venue LAN and run with no internet. |
| **H2R Graphics** [web](https://h2r.graphics/docs/output/output-window/) | Desktop app | Output URLs served from the operator's machine to the LAN (`http://<host>:4001/...`); no internet needed. |
| **OBS browser source** [web](https://obsproject.com/kb/browser-source) | Local CEF | A page stays loaded while the scene is in use, but "Refresh browser when scene becomes active" and "Shutdown source when not visible" make reloads routine. localStorage persists across OBS restarts (CEF leveldb profile). |
| **Supabase Realtime** [web](https://supabase.com/docs/guides/realtime/architecture) | Elixir cluster beside Postgres | Client Broadcast and Presence "do not need the tenant pool"; database-originated broadcasts do, and a bug fixed on 2026-09-14 left them down until a 5-minute reconnector ran ([supabase/realtime#2211](https://github.com/supabase/realtime/issues/2211)). Private-channel authorization is a Postgres query at join, cached for the connection ([docs](https://supabase.com/docs/guides/realtime/authorization)). Pro with the spend cap: 500 connections, 500 messages/s ([limits](https://supabase.com/docs/guides/realtime/limits)). |
| **Vercel Skew Protection** [web](https://vercel.com/docs/skew-protection) | Platform | Pins requests to the deployment that served the page, via `?dpl=`, `x-deployment-id` or the `__vdpl` cookie, up to the retention period. Vite is not a supported framework, so the pinning has to be added by hand. |
| **Postgres migration practice** [web](https://gocardless.com/blog/zero-downtime-postgres-migrations-the-hard-parts), [web](https://xata.io/blog/migrations-and-exclusive-locks) | - | An `ALTER TABLE` waiting for its lock blocks every later reader and writer behind it; set `lock_timeout` on every DDL session and split breaking changes into expand, migrate, contract. |

**The principles that recur:**

1. **Keep the live data plane away from everything else.** Sofie's gateway, CasparCG's server and
   Vizrt's engines all hold what is on air in a process that busy editors, rundown ingest and
   dashboards cannot slow down. NoaCG's renderer already holds the picture; what it lacks is a
   command path that does not share the database with library sync and audience polling.
2. **Prepare before air, and show preparation per element.** Vizrt's grey/yellow/green is the
   closest precedent for READY and for "1 change preparing".
3. **Desired state beats a replay of commands.** Sofie and Singular send what should be on screen;
   a duplicate, late or reordered message then cannot put the wrong thing on air, and recovery is
   "fetch the state", not "replay the log". NoaCG's snapshot recovery (`snap` from reports) is half
   of this already.
4. **Local where the wire is local.** Every system that must survive a venue's internet runs a
   component on the venue's network (Sofie, CasparCG, SPX, H2R). The cloud-only product (Singular)
   documents no offline mode.
5. **Version-lock the client to the server it booted against**, or make every server contract
   backwards compatible for as long as a client can live (Vercel's skew protection, expand/contract).

---

## 7. The assumptions, challenged

Each idea from the brief, with a verdict. None is confirmed just because it was proposed.

**1. Separate the live command path from Postgres.** *Right goal, wrong first step.* The incident
was caused by NoaCG's own load on a small instance (Micro, by `CLOUD_PLAYOUT.md` [doc]), and nothing stops the next one: library sync,
audience polling (about 600 requests/s at 100 productions by CLOUD_PLAYOUT's own estimate),
publish upserts of multi-MB rows and migrations all share the database with the Take. But a Take
also needs Postgres for its *record* (recovery, the action log, `live_cue`, reports), so "off
Postgres" can only mean *delivery* off Postgres, with the record written beside it. That is worth
doing only once the path on Postgres is cheap and correct (§14, step 2). Before that, the measured
problems are inside the transaction and the pool: the hot row, the ordering, the stale Take, and a
Take that waits silently for seconds behind other work (§5.3).

**2. Client-to-client Realtime Broadcast.** *Viable as a delivery road, not as the authority, and
only with signed commands.* Supabase documents that client Broadcast does not need the tenant
database pool [web], and §5 measures it under a database overload. The blocker is security, not
transport: a renderer learns the show id from the output capability, and a broadcast topic keyed
on the show id would let anyone holding an output URL (copied onto playout machines, pasted into
SPX templates) push commands. 0056 exists because that happened for one morning in September.
The cheap fix is to make the transport irrelevant to authority: control pages sign every command
(ECDSA P-256 through WebCrypto, which CasparCG 2.3's Chromium 71 supports; Ed25519 it does not)
with a key minted per publish whose private half only the control capability can read, and
renderers verify with the public half from the output payload. Costs: key handling, replay
protection by a per-sender sequence, and a flood risk on the project-wide 500 messages/s quota if
the topic is public. A private topic keeps the flood risk out but needs Postgres to join or rejoin.

**3. A separate playout database or service.** *Not justified by today's evidence.* Three of 19
publications had a renderer in the last seven days [doc]. A second Supabase project would double
migrations, auth crossings and the self-hosting burden (a pillar in `GOALS.md`) to isolate load
that NoaCG can bound itself. A purpose-built per-show service (the Durable Object or PartyKit
shape: one ordered, in-memory room per show) is the right shape if NoaCG ever outgrows Supabase
Realtime, and §13 names the triggers. Not now.

**4. A local runtime.** *Justified for the CasparCG and venue path, not for everyone.* A streamer
whose internet fails has no stream, so a local runtime buys them nothing; a venue feeding SDI to a
screen, a recorder or a broadcaster keeps going without the internet, and today its graphics stop.
CasparCG with Bridge is the main production path (`GOALS.md` §5), and those users already install
Bridge. So the question is not "should everyone install something" but "should the thing CasparCG
users already install hold the show". §12 compares the topologies, including a cheaper
CasparCG-native route.

**5. Preload everything.** *Already true for the graphics, and "everything" is the wrong unit.*
Every graphic of a production is composed into its own frame when the output opens (§2.3). What is
not prepared: bundled fonts (fetched per frame from `noacg.studio`), the first layout of each
graphic's text, and anything a template pulls from an absolute URL. The right unit is "everything
this production can take", checked, not "the library".

**6. Command acknowledgement.** *Yes as a signal, no as a gate.* The renderer already
acknowledges, slowly: its report reaches the database 800 ms after it applies a command. A fast,
database-free "applied" signal per output (Realtime Presence or a broadcast) would let the operator
see "on air on 2 of 2 outputs" and would give §13 its latency numbers. A Take must never wait for
it: delivery is already at-least-once through the log, and an operator cannot act on a missing ack
faster than on a missing picture.

**7. Command expiry instead of retries.** *Both, and neither is the main fix.* The four-second
resend window is right (`failedSends.ts:25-31`). What is missing: a per-attempt timeout (an attempt
started in the window can still commit much later), and a server-side check that refuses a Take
older than the graphic's current state (a per-graphic revision compare-and-set), so a late Take can
never land after the Out that followed it. Expiry by timestamp needs clocks that agree across
machines; a revision check does not. Late rows that do arrive should converge the state without
replaying the entrance.

**8. Pause migrations while shows are live.** *Only as a narrow, time-boxed hold, never as the
policy.* At any scale somebody is always live, so a pause becomes "never migrate". The durable
answer is that a migration cannot hurt a running show: expand/contract, `lock_timeout`, a
live-path contract that only grows, and contract steps retired by evidence (§11). A short hold for
the rare migration that must lock a live-path table is still useful, because the renderer
heartbeat already says which productions are live.

**9. A READY state.** *Yes, as a status with exact guarantees and an age, never as permission.*
Today "output connected" means one heartbeat within 90 s from whichever renderer wrote last. §9
defines READY per output, and why it needs a per-renderer identity and a gap-free sequence first.

**10. A Prepare for Live action.** *Yes, operator-initiated, seconds long, never locking anything.*
§9 says what it does. The honest limit: it proves the path and the prepared content at the moment
it runs; it cannot promise the venue's network in ten minutes.

---

## 8. Architecture options

### 8.1 The options

- **A. Today's architecture plus guardrails.** §16, plus migration rules (§11). Postgres stays in
  every step of the live path.
- **B. The same Supabase, with a cheaper, correct and then decoupled command path.** §14 steps 2
  and 5: a per-show sequence, the hot row split, stale Takes refused, one log frame per
  transaction; then signed commands over client Broadcast beside the database send, so delivery
  survives the database.
- **C. Cloud outputs plus an optional local runtime.** §12 L1: Bridge serves the renderer and
  holds the log for venues that need it. Builds on B.
- **D. A separate playout backend.** A second Supabase project for playout only, or a purpose-built
  per-show service (a small websocket server, or a Durable Object style room per show).
- **E. The suggested combination.** A now; B's step 2; READY and versions (§9, §10); then B's
  step 5 and C, each only if its measurement holds; D deferred behind triggers (§13.4).

### 8.2 Comparison

| | A. Guardrails | B. Cheaper, then decoupled path | C. + local runtime | D. Separate backend |
|---|---|---|---|---|
| **Database overloaded or restarting** | overloaded: Takes arrive seconds late, some out of order, with no error; restarting: Takes fail; the output keeps its picture either way | step 2: fewer ways to cause it, the same failure if it happens; step 5: Takes still reach outputs whose socket stays joined, the record catches up afterwards | local outputs unaffected | isolated from app load; its own database can still fail |
| **Realtime down** | 30 s poll floor | same | local outputs unaffected | depends on its own transport |
| **Vercel down** | open outputs fine, reloads fail | same; with step 4 still no reload without Vercel | local outputs reload from disk | same as A unless it serves the renderer |
| **Venue internet down** | no commands | no commands | local Takes continue | no commands |
| **Deploy or migration during a show** | safe for open pages once §11 rules hold | same, plus a contract with versioned RPCs | the runtime pins its renderer and its protocol | isolated from app migrations; its own need the same rules |
| **Latency, press to output** | today's (§5) | step 2 removes the hole walks and the event hold-back; step 5 is one Realtime hop | loopback: a few ms | similar to B |
| **Ordering, duplicates, late commands** | today's machinery, known skip | per-show sequence, revision check, desired-state heal | one local log | per-show room orders by construction |
| **Security and capability URLs** | unchanged | step 5 needs signed commands (key per publish); a public topic adds a quota-flood risk | a LAN listener only if read-only; loopback otherwise | a new service to secure and audit |
| **Recovery** | log replay | provable "in sync"; state heal | runtime restarts into the same show | per-show room state |
| **Complexity added** | low | medium (schema additions, renderer changes, signing) | medium-high (sync, serving, local log, offline controller) | high |
| **Maintenance burden** | low | medium | medium: an exe release train already exists | high: a second backend forever |
| **Operating cost** | none | none (fewer writes and messages) | none for NoaCG | a new paid service or project |
| **Self-hosting** | unchanged | unchanged, all inside Supabase | Bridge already ships | a second stack to run |
| **Customer install** | none | none | the existing Bridge exe, opt-in | none |
| **Scaling** | message amplification unchanged | 3-5x fewer messages per Take | offloads venue shows | best per-show isolation |
| **Browser and host compatibility** | unchanged | WebCrypto P-256 works on Chromium 71 | CasparCG on the same machine first | unchanged |
| **Migration risk** | none | additive, dual-running until telemetry says the old path is unused | additive, opt-in | the largest: two systems during the move |
| **READY and Prepare for Live** | possible but "in sync" is not provable | provable | "Ready locally" possible | provable |

### 8.3 Reading the table

- **A is necessary and not sufficient.** It removes known defects and stops migrations from being
  a risk, but a database hiccup still stops every show on the instance.
- **B's step 2 is the foundation for everything the owner asked for.** READY's "in sync" is not
  provable on global ids that commit out of order, and "Prepare" cannot be honest about a path that
  can drop rows. It is also where the measured latency is (§5).
- **B's step 5 is the only cloud-mode answer to a database outage**, and it is cheaper than it
  looks once commands are signed: the transport stops being the security boundary. §5 measures
  whether Realtime client Broadcast actually keeps delivering while Postgres is overloaded.
- **C is the only answer to the venue's own internet**, and it matters for the main production
  path (CasparCG), not for streamers.
- **D solves a scale problem NoaCG does not have yet**, at the price of the self-hosting pillar.

---

## 9. READY and Prepare for Live

### 9.1 The rule

**READY is a status, never permission.** Take works whenever the output is healthy enough to
receive it. A button is never disabled because a check has not run; the page says what it knows.

### 9.2 What READY guarantees, per output

An *output* is one renderer instance: one `/output` page in one browser source, CasparCG layer or
tab. READY for playout means all of these were true at a stated moment, and the page shows that
moment ("Ready, 20 s ago"):

| # | Guarantee | How it is known | Exists today? |
|---|---|---|---|
| 1 | **It is this output.** A stable instance id, the host engine ("CasparCG 2.3, Chromium 71"), the renderer build | reported by the renderer | engine only on the debug overlay |
| 2 | **It holds the production version the operator is working from** | manifest version or hash | no version exists (§10) |
| 3 | **Every graphic of that version is loaded** and threw nothing while loading | frame `load` plus the frame's own error report | `load` yes; errors are posted and ignored (`stage.ts:234-236`) |
| 4 | **Every font and image the version uses is loaded**, none on a fallback face | `document.fonts.check` per family, image `decode()` | no |
| 5 | **Each graphic has done one off-air update** with the values of its first cue, so the first Take pays no first-layout cost | a warm pass in the frame | no |
| 6 | **It is in sync**: it has applied the production's log up to its head, and what it shows matches the on-air state | a per-show sequence, not the global id (§14 step 2) | not provable today: ids are global and can commit out of order |
| 7 | **Commands reach it**: both roads joined and a round trip succeeded recently | the join status plus an ack | join status on the debug overlay only |

**What READY cannot promise**, and the page should not imply: that the network will hold, that
every possible value fits (only the warmed values were measured), or, in cloud mode, that a reload
of the operator page or the output will succeed while the cloud is down.

**It needs two things that do not exist yet.** A per-renderer identity and an *expected outputs*
list: `output_seen_at` is one timestamp that any renderer overwrites, so today a dead CasparCG box
is an absence, not a red light. And the health signal must not travel through the database it is
meant to warn about: Realtime Presence (one entry per renderer, gone on disconnect, no database
write) is the natural carrier; a report row through Postgres vanishes in exactly the outage it
should announce.

### 9.3 The states the operator sees

| State | Meaning | Wording (suggestion) | Colour |
|---|---|---|---|
| Preparing | loading graphics or fonts | "Preparing 18 of 24" | neutral |
| Ready | all seven hold | "Ready for playout" | green |
| Ready, change preparing | version V ready, the changed graphics of V+1 still loading | "Ready · 1 change preparing" | green |
| Ready, change failed | V+1's graphic could not be prepared; V's copy stays | "Ready · 1 change not prepared: Frost Quiz (script error)" | amber |
| Degraded | reachable, but a guarantee fails | "Commands may arrive up to 30 s late" / "Using a fallback font for Manrope" / "Behind: showing v12" | amber, never green |
| Not answering | no presence for longer than a threshold | "CasparCG ch1 not answering (40 s)" | red |

The production summary counts expected outputs: "Ready for Live · 2 of 2 outputs · checked
14:02". Both operator surfaces show it; today the hosted page and the phone show no output health
at all.

### 9.4 Prepare for Live

An optional button on the production page. It gives the operator a named moment: *checked, the
show is ready*. It runs in seconds, and nothing is locked before, during or after it.

1. **Publish what changed** as the next version, or say "nothing changed since v12". (Whether it
   may publish by itself is an owner question, §18.)
2. **Every connected output prepares that version**: only new or changed graphics, one at a time,
   and never while something on air is animating. Vizrt warns that initializing on air costs
   frames. §5.4 measured the Take-time cost in CasparCG 2.5's software renderer; what preparing a
   graphic costs there, and whether it drops channel frames, was not measured (§17).
3. **Checks per output**: fonts, images, the warm pass with the rundown's first cue values, any
   absolute URL a template references.
4. **The command path, end to end**: the operator page sends a non-airing ping through the same
   send path (a new command type the send accepts and graphics ignore); each output acknowledges;
   the page shows "command path 110 ms" per output. The ack is also what lets the page count the
   outputs that answered, rather than inferring health from a heartbeat that travels another road
   (§5.6 shows that heartbeat staying green while commands run 30 s late).
5. **Bridge and CasparCG, when configured**: Bridge answers, the server answers, the layer holds
   this production's output URL (`INFO`), and every server clip or template the rundown cues exists
   on the server.
6. **A checklist**, green, amber or red per line, each amber or red line saying what to do, and a
   stamp: "Ready for Live, checked 14:02 (v12)".

**It never freezes the production.** After the stamp the operator can edit a graphic, add one,
change the rundown or the settings. The summary becomes "Ready · 1 change preparing (v13)", the
outputs prepare only what changed, and it returns to "Ready for Live (v13)" by itself. The stamp
keeps its honesty: "checked 14:02 on v12, 1 change since". Pressing the button again re-runs the
full check. A graphic that fails to prepare stays unavailable with its reason; everything that was
ready stays ready (§10).

**Time budget.** Publishing today rebuilds and uploads the whole multi-MB payload in one upsert on
the hot row; with a manifest (§10) it uploads only the changed objects, and the build should run off
the main thread so editing never stutters. The output side is bounded by the slowest output's
preparation of the changed graphics, measured in §5.

### 9.5 Ready locally

With a local runtime (§12), a stronger stamp is possible: **"Ready locally"** means the runtime
holds version V, every font and asset and the renderer build on disk; the local outputs are READY;
the loopback command path answered; and an offline control surface is available. It then promises
that losing the internet, Supabase or Vercel does not stop Takes from the open operator page, does
not stop an output from reloading, and does not stop the runtime from restarting into the same
show. It does not promise phone control (that is cloud), nor that changes made elsewhere during the
outage reach air.

---

## 10. Versions, snapshots and last-known-good

### 10.1 What exists

Publishing already pins a snapshot: "a renderer that has been on air for three hours must never
change under the operator's feet" (`CLOUD_PLAYOUT.md` §2). That is the right principle, and half
of it is built. What is missing:

- **No identity for a snapshot.** A re-publish overwrites the payload column; nothing names v12 or
  v13, so nothing can say which version an output holds.
- **All or nothing.** An open renderer never sees a re-publish; a reload swaps every graphic at once
  and snaps the old state into the new frames (`main.ts:363-379`). Adding one quiz mid-show means
  reloading the browser source that carries the whole show.
- **One heavy row.** The snapshot is a single jsonb value (data-URL assets, up to 6.7 MB), rewritten
  whole on the hot row every publish and read whole on every renderer boot and operator page load.

### 10.2 Suggested model

**A production version is a manifest**, written at publish:

```jsonc
{ "version": 13, "resolution": {…}, "renderer": { "min": "2026.10.1" },
  "graphics": [
    { "key": "Frost Quiz", "layer": 20, "content": "sha256:…", "state": "sha256:…", "fields": "sha256:…" }
  ] }
```

- **`content`** addresses the graphic's composed body (HTML, CSS, JS, assets), stored once by
  hash. Unchanged graphics keep their hash, so preparing v13 fetches and composes only what
  changed.
- **`state`** hashes the graphic's state machine and data shape, which decides whether its on-air
  state can be carried into a new body (below). **`fields`** hashes its field schema, which decides
  whether a control panel built for one version can drive the other.
- **Where the bodies live** is a trade-off, not a given. A table keyed by hash keeps everything in
  Postgres (simple; boot still needs the database). A public, immutable bucket or CDN path makes
  boot possible while the database is down, and makes the local runtime's sync a download by hash.
  §5's measurements matter here: browser storage survives a restart on CasparCG 2.5 and OBS, but not
  on CasparCG 2.3, so a browser-side cache alone does not carry a 2.3 restart through an outage.

### 10.3 How an output reacts to a new version

1. **Unchanged graphics are not touched.** Same hash, same frame.
2. **New and changed graphics are prepared beside the old ones**, in hidden frames: load, fonts,
   warm pass. The output reports "1 change preparing".
3. **A graphic that is off air switches** as soon as its new frame is ready.
4. **A graphic that is on air keeps its frame.** It switches at its next Out, or when the operator
   takes it again (the entrance replays anyway), or when the operator presses "Apply update".
   Never silently mid-air. Bugs, scorebugs and tickers can stay up for a whole show, so the explicit
   apply is not optional.
5. **The switch is a logged command**, not a local decision, so every output of the production
   switches at the same point and a reloaded output lands on the same version as its siblings.
6. **State across the switch** (quiz step, scores, a running clock) is carried by `update` then
   `snap`, the recovery path that exists today, **only when the `state` hash is unchanged**.
   Otherwise the switch waits for an Out or a reset, and the page says why.
7. **The control panel follows the output.** Commands carry the graphic's `fields` version; while
   an output still shows v12 of a graphic, the operator panel for it keeps v12's fields and says
   "v13 ready". Today the hosted panel spec is resolved live while the output is pinned, which is
   exactly the mismatch this avoids.

### 10.4 Last known good

- **An output never discards a prepared frame until its replacement is ready.** A failed
  preparation keeps the old frame and reports the reason; the rest of the production stays READY.
- **A graphic that is new and fails** is simply not available: its cue says why, and nothing else
  changes. The iframe sandbox already confines a throwing script to its own frame (§5 measures
  it).
- **Data is not a version.** Cue values, typed fields and the production data tree keep riding the
  commands as today; only a graphic's body, state shape and fields are versioned.
- **Locally**, the runtime keeps the last version that reached "Ready locally" on disk, so a runtime
  restart during an outage comes back to it.

### 10.5 Cost

A manifest, content-addressed storage, per-graphic preparation in the renderer, an apply command,
and versioned panels. This is the largest single piece of Phase 6 and the one the operator sees
most. It does not need the command path to change, so it can come before or after step 5 of §14.

---

## 11. Migration and deployment safety

### 11.1 What can hurt a running show today

| Change | What happens to a show already on air | Evidence |
|---|---|---|
| A migration that takes a strong lock on `control_events`, `control_shows` or `realtime.messages` | every Take queues behind it and fails at the role's statement timeout | §5 lock and lock-queue runs |
| A live-path function redefined with different behaviour | silent: 0056 dropped the `live_cue` mirror for everyone | 0057 header [code] |
| A live-path function with a new signature | pages already open fail every send with the server's words | §5 signature run |
| A policy or grant an old client depends on | old clients degrade silently (0066: exported receivers fell to the 30 s poll) | 0064/0066 headers [code] |
| A frontend deploy | an open output keeps its code and is unaffected; a page that loads a lazy chunk after the deploy gets a 404; a reload gets the new build | §5 skew check |
| Vercel "Pause Production Deployments" (a policy in `docs/VERCEL_PRO_NO_OVERAGE_PLAN.md`) | `/output` answers 503 until someone resumes it | [doc] |

The owner's goal, "a renderer which is already READY and on air remains safe while a new NoaCG
version is being deployed", is mostly true today for the *running page* and false for the
*database contract* and for *reloads*.

### 11.2 Suggested rules

1. **Name the live-path contract and treat it as a public API.** The RPCs renderers and control
   pages call (`control_send_many`, `control_output_by_slug`, `control_output_tail`,
   `control_output_report`, `control_output_seen`, `control_show_by_slug`, `control_tail`,
   `control_stage`, `control_data_*`), the topics (`cmd-`, `log-`), and the columns and policies
   they read. In place, only additive changes. Anything else is a new versioned function beside
   the old one (0033 already did this once, keeping the 4-argument report working through a
   default).
2. **Retire old contract versions by evidence, not by waiting.** Renderers and control pages
   report their build and protocol version (in the same Presence entry as READY). "No output on a
   build older than X has been seen for 14 days" is a query; 0066's "until the renderers already
   on air have reloaded" had no way to be checked, and was not.
3. **Every migration session sets `lock_timeout` and `statement_timeout`** in `db-push`, and a
   migration that times out on a lock is retried later rather than left queued. §5 measures what
   this changes for a show under a lock queue.
4. **A live-path statement class in `db-push`.** DDL, trigger, policy or grant changes on live-path
   objects, and any redefinition of a live-path function, need an explicit `--allow` (the mechanism
   exists for destructive statements) and run in a quiet window: no production live by the
   heartbeats, or after a time-boxed hold, and always with `lock_timeout`. Every other migration
   stays automatic.
5. **Behaviour self-checks for any redefined live-path function**, which the repo already requires
   (`supabase/AGENTS.md`), plus a contract test in the configured suite that runs the *previous*
   release's client calls against the new schema.
6. **Wire Vercel Skew Protection for Vite.** It is on for the project (§5: an old deployment's
   assets answer with `?dpl=`), but Vite never sends the id. Adding it to built asset URLs lets an
   open page keep loading its own build. For the renderer, simpler still: bundle supabase-js into
   the output entry so it has no lazy chunk at all, and never cache a failed import.
7. **Pin the renderer build to the prepared version (later).** The output page loads the renderer
   build that was READY when the production was prepared, from an immutable per-build path, so a
   reload mid-show lands on the same code. New builds apply between shows ("Renderer update
   available"). The local runtime gets this for free: it carries its renderer.
8. **Rollback.** The frontend can roll back instantly on Vercel (promote the previous deployment);
   the repo has no command for it today. The database only moves forward. Rule 1 is what makes a
   frontend rollback safe without a database rollback.

### 11.3 Deploy cadence

- **Keep deploying on every landing.** Once rules 1-6 hold, the renderer's safety comes from the
  contract and, later, from pinning, not from deploying less often. Bundling deploys would slow
  every other outcome to protect a path that should not need it.
- **Schedule only live-path contract changes**, which are rare. This is the separation between
  application releases and production migrations that is worth having; a separation of all
  migrations is not.
- **Canary.** Vercel Rolling Releases is off for the project; it helps the app, not open outputs.
  For outputs, pinning (rule 7) is the canary: a new renderer build meets a production only when
  that production is next prepared.
- **Never a permanent "no deploys while anyone is live".** At scale that is "never deploy". A
  time-boxed hold exists only inside rule 4.
- **Do not enable Vercel's production pause** as a cost control without exempting `/output`.

---

## 12. Cloud and local

### 12.1 Cloud mode stays the default

`NoaCG -> persistent output URL -> OBS / vMix / CasparCG / browser` keeps working with no install.
With the steps in §14 it can promise:

- an open, READY output keeps its picture through any cloud failure (true today);
- commands keep flowing through a database overload or restart, if step 5 (signed commands over
  client Broadcast) is built and the output's socket stays joined;
- an output reload during a database outage comes back, if boot can read a cached or CDN copy of
  the prepared version (step 4);
- a frontend deploy never changes an output's code mid-show, if the renderer build is pinned
  (§11 rule 7).

It cannot promise anything when the **venue's own internet** fails: the output keeps its last
picture and receives nothing. For a stream that is moot (no internet, no stream). For a venue
feeding screens, a recorder or a broadcaster over SDI, it is the whole show.

### 12.2 Three shapes for local mode

**L1. Bridge serves the renderer (an evolution of Bridge).** Bridge gains a *local output*: it
syncs the prepared version (manifest, graphic bodies, fonts) and a renderer build to disk, serves
`http://127.0.0.1:<port>/output?...`, and relays commands to its local outputs. The production page
already talks to Bridge over loopback for server clips, so graphic commands go the same way,
signed as in §7. The cloud receives a copy for phones, remote outputs and monitoring, and is never
replayed to air: **one log, held locally**.

- *For:* the same renderer and the same command format as cloud mode; the exe CasparCG users
  already run; offline after sync; loopback only when CasparCG runs on the same machine, so no
  security boundary moves.
- *Against:* CasparCG often runs on a separate playout machine. Serving it means Bridge listening
  on the LAN (a Windows firewall prompt, client isolation on venue wifi, and the rule in
  `BRIDGE.md` §1c that Bridge never binds `0.0.0.0`), unless the LAN side is **read-only**: it
  serves the output and a command stream, protected by the output token, and accepts no commands.
  Commands still arrive only on loopback. That keeps §1c's reasoning intact, since a LAN client can
  watch but not operate. The operator laptop also becomes a single point of failure for air.

**L2. CasparCG-native.** Export the production's graphics as CasparCG templates onto the server,
and let Bridge drive them with `CG ADD/UPDATE/INVOKE/NEXT/STOP`, which it already speaks. The
server then holds playout state and survives a Bridge or browser restart.

- *For:* the most broadcast-native answer; CasparCG does what it was built for.
- *Against:* AMCP cannot upload files, so the templates need a helper on the server machine or a
  shared folder (`BRIDGE.md` §9). The CasparCG and SPX exports today carry neither combined
  controls nor the production data tree (`CONTROL_PANEL_ANY_GRAPHIC.md` §2), so quiz events,
  clocks and shared data would need to ride `CG INVOKE`, and two control models would exist
  side by side, against the "one consistent control model" principle in `GOALS.md` §4. Unmeasured:
  whether every behaviour survives that route.

**L3. A sibling runtime on the playout machine.** A second small program installed next to
CasparCG, paired with the operator's Bridge. It removes the LAN-bind question from the operator's
laptop but doubles the install and the support.

### 12.3 Suggested shape

**L1, staged** (a suggestion): first the same-machine case, which needs no security change and
covers the laptop-plus-CasparCG setups; then a read-only LAN output if owners need a separate
playout machine. Keep **one renderer** (the `/output` stage and `composeDocument`), one signed
command format and one local log; Bridge's adapter structure (`adapters/casparcg.ts`,
`adapters/ograf.ts`) already has room for "serve an output" as one more target. The relay protocol
of the exports (`/relay/log?after=N`) is a working seed for the local command stream. L2 stays the
measured alternative: its first test is whether a quiz's Select, Lock and Reveal and a match clock
survive `CG INVOKE`.

### 12.4 Is "Ready locally" practical?

Yes, for L1, with stated limits:

- **Holds without internet:** Takes from the operator page that is already open (loopback to
  Bridge); an output reload (served from disk); a Bridge restart (the prepared version and the
  last on-air state on disk); CasparCG restart (it reloads the local URL).
- **Does not hold:** reloading the operator page (it comes from Vercel and has no service worker;
  the offline fallback is a Bridge-served controller, the pattern the exports' `controller.html`
  already proves), phone control (cloud), and edits made elsewhere during the outage.
- **Storage is not the obstacle:** the runtime serves from its own disk, so the measured loss of
  browser storage on a CasparCG 2.3 restart does not matter here.

### 12.5 One runtime with adapters, not a second engine

The rendering engine is the part to keep single. Every mode loads the same composed documents into
the same stage; only the transport changes (Supabase, local relay, BroadcastChannel). The
exported overlay packages already run a different receiver (`localReceiver.ts`, 400 ms polling);
local mode should move toward the stage, not grow that second path.

---

## 13. Scaling and observability

### 13.1 The audience is not the load

A stream watched by millions still has a handful of NoaCG connections: its outputs and its
operators. NoaCG's load scales with **live productions** and **open NoaCG pages**, not viewers. The
exception is the `/join` audience plane, which polls PostgREST per viewer and shares the database
with the Take.

### 13.2 Scenarios

Per live production, assume 2 outputs and 2 operator pages (a desk and a phone), a Take or Update
every 10 s on average, and one renderer report per command per output.

| Scenario | Realtime connections | Log and command messages delivered / s | Control writes / s | What breaks first |
|---|---|---|---|---|
| Today (19 published, 3 with a renderer in 7 days [doc]) | a few | < 1 | < 1 | nothing |
| 100 live productions | ~400 of 500 (Pro, spend cap on) | ~300 | ~110 | audience polling if audiences are used (~600 req/s on Micro [doc]); connections near the cap |
| 1,000 live productions | ~4,000 (needs the cap off: 10,000) | ~3,000, above the 2,500 cap | ~1,100 | Realtime message quota; the hot row per show is fine, the shared database is not |
| 5,000 idle editors | 5,000 if every tab holds a socket | ~0 | sync passes | library sync volume (the incident's cause) |
| Reconnect storm (Realtime restart) | all rejoin in seconds | - | one tail read per output | private joins are Postgres queries; §5 storm run |

The message column is the one to watch, and it is mostly amplification: today each Take reaches
each follower as one command frame plus one frame **per log row** (three for a Take), and each
output's report adds a row that every follower receives. A Take to four followers costs about 20
delivered messages. Step 2's "one frame per transaction" and moving reports to Presence bring it
to about 4-8.

### 13.3 What to measure, from step 1 on

| Measure | Where it comes from |
|---|---|
| Press -> received -> first frame, p50/p95/p99, per road and per host engine | the sender stamps the press; the output reports receive and first-frame times in its Presence entry or a sampled metrics row |
| Failed sends by class (unanswered, refused, rate-limited), resends, late commits, duplicates dropped, holes, refill walks | sender and output counters |
| Command payload size; boot payload size and boot time | sender; output |
| Database: `control_*` RPC latency and calls (`pg_stat_statements`), row-lock waits on control tables | Supabase |
| Realtime: connections, joins/s, messages/s against the plan, join failures, reconnects per output per hour | Supabase Realtime reports; outputs |
| Preparation: time to READY, failed preparations, versions pending, time "Degraded" | outputs |
| Local: which road carried each command, runtime restarts, cloud mirror lag | Bridge |

### 13.4 Triggers for a separate playout backend

Revisit option D (§8) when any of these holds for a sustained period after steps 1-2: Realtime
connections or messages above 70 % of the plan at peak; `control_send_many` p95 above 300 ms on a
healthy database; a customer needing an availability NoaCG cannot get from one Supabase project;
or the audience plane contending with playout after it has been bounded.

---

## 14. An incremental path, with rollback points

Every step lands on its own, changes the schema only additively, and keeps the old path working
until telemetry says nobody uses it. The rollback of each step is to stop using the new part.

| Step | What | Why this order | Rollback point |
|---|---|---|---|
| **0. Guardrails** | §16, each independent | cheap, removes known defects, no design choice | revert the single change |
| **1. See the live path** | outputs and control pages report instance, engine, build, protocol version and latency samples; health over Presence | every later step needs these numbers, and READY needs identity | stop reporting; nothing reads it yet |
| **2. Make the path cheap and correct** | a per-show gap-free sequence taken under a small per-show row that every log writer locks first; `live_cue` and renderer reports off `control_shows`; one log frame per transaction instead of one per row; a per-graphic revision checked by the send, so a stale Take is refused; a small desired-state summary on each command (revision, on air, cue, step) so an output heals through `snap` | removes the skip, the stale Take and the hot row, and makes "in sync" provable; decides from measurement whether the separate fast road can go | outputs fall back to the global id when the sequence is absent; the server keeps writing both |
| **3. READY and Prepare for Live** | §9 on today's payload | the operator-visible win; needs steps 1-2 | hide the UI; the checks are read-only |
| **4. Versions and last-known-good** | §10 manifest, bodies by hash, background preparation, explicit apply; boot from a cached or CDN copy | lets a show change safely while on air; lets a reload survive a database outage | publish writes the old payload too; outputs read it when the manifest is absent |
| **5. Commands that survive the database** | signed commands over client Broadcast beside the database send, an operator-side outbox for the record, per production behind a flag | only now is delivery the weakest link; measured in §5 | stop the second send; outputs keep accepting the database road |
| **6. Local runtime** | §12 L1, same machine first, opt-in in Bridge | the venue case; builds on steps 2, 4 and 5 | load the cloud URL on the layer instead |

Deliberately absent: a separate playout backend (§8 option D), until one of §13's triggers fires.

---

## 15. Phase 5

"Phase 5" here is `docs/CLIP_PLAYBACK_PLAN.md` §20: folders you can play (One by one steps, All
out as the panic control) and a rundown you can edit (multi-select, drop on a folder, copy, cut and
paste, rows that read at a glance). It was built in four landings on 2026-09-29; the owner's walk
on the real CasparCG server and the desktop look check are open. Its branches have all landed and
no worktree holds unlanded playout work [code, checked with `git log main..<branch>`].

**Can continue unchanged.** Everything in §20 works through the existing verbs and the Bridge. The
folder step is a pure function (`src/control/folderStep.ts`), All out is a named verb, rundown
editing is model and UI. None of it adds a database round trip to a Take, a migration, or a new
consumer of the command log. The open owner walk should go ahead.

**Where it meets Phase 6.**

- **The production-page split** (`docs/backlog/production-page-phases.md`, phases 3-5, which the
  owner runs awake) is not a conflict but a dependency: its phase 3, "publish and links state", is
  the seam where the READY summary and Prepare for Live will sit. Doing phase 3 first helps.
- **Page memory as the truth about what is on air** (the folder step, `liveCue`, `livePlayout`) is
  an owner decision and stays. Phase 6's desired-state summary could later carry the folder step,
  so it should not gain a second persistence of its own meanwhile.
- **Bridge's in-memory sequence runner** forgets a running sequence on restart (`CLIP_PLAYBACK_PLAN`
  §6.10). A local runtime (§12) would persist state on disk; a separate persistence scheme for
  sequences now would be built twice.

**Is Phase 5 investing in a path Phase 6 may replace?** No. It invested in the Bridge, which Phase 6
grows rather than replaces, and in the rundown model and UI, which Phase 6 does not touch. The part
Phase 6 may simplify is the two-roads machinery in `commandRoads.ts` and `hostedControl.ts` (the
1200 ms hold-back, the stand-down during walks), and Phase 5 did not extend it.

**Until Phase 6 decides, three things are worth avoiding:** a new database round trip on the Take
path; a new consumer of `control_shows.live_cue` or of the global log id; a second persistence
scheme for Bridge state.

---

## 16. Low-risk guardrails worth doing before Phase 6

Ordered by value against risk. Each is small, contained and independent of the Phase 6 direction;
the ones marked *filed* have a backlog item.

1. **Let the output embed frame `/output` in production.** `vercel.json` sends `frame-ancestors
   'self'` and `X-Frame-Options: SAMEORIGIN` on every path, `/output` included, so the SPX door the
   proof case depends on is blocked outside the dev server, and on a CasparCG 2.5 layer the embed
   puts a full-frame grey error page on air (§5.8). A path-scoped exemption plus a test that reads
   `vercel.json`. The most urgent item here: it is the only one measured putting something wrong
   on air by itself. *Filed:* `docs/backlog/output-embed-blocked-by-frame-headers.md`.
2. **Tell the operator the truth during an outage.** The hosted page's resolve collapses an error
   into "invalid or unpublished"; use the renderer's `RpcAnswer` pattern and retry. The production
   page's follow gives up silently until reload. *Filed:*
   `docs/backlog/operator-pages-read-an-outage-as-unpublished.md`.
3. **A renderer that cannot fail at boot on a chunk.** Bundle supabase-js into the output entry or
   stop caching a rejected import; make the "Output not available" card transparent, or show it
   only for an explicit unpublish. *Filed:* `docs/backlog/output-boot-dies-on-a-failed-chunk.md`.
4. **A per-attempt timeout on the send**, so an attempt started inside the resend window cannot
   commit after a later press. The real fix is step 2's revision check; this closes most of the
   window cheaply.
5. **`lock_timeout` and `statement_timeout` in every migration session** (`db-push`), with a retry
   instead of a queued lock. §5 shows the difference for a show under a lock queue. *Done
   2026-09-29:* every migration from 0068 sets both in the file, `db-push` retries a lock timeout
   (`supabase/AGENTS.md`, "Every migration sets its own timeouts").
6. **Make the post-land alarm mean something again.** It is red on every landing today for an
   accepted advisor class, so a real migration failure would look the same. *Done 2026-09-29:*
   `unused_index` now warns and never fails (`docs/STACK_FRESHNESS.md`, Supabase advisors).
7. **One library sync pass per browser**, not per tab per edit. *Filed already:*
   `docs/backlog/library-sync-runs-a-pass-per-tab-per-edit.md`.
8. **Jitter the refill on reconnect**, so a Realtime restart does not send every output to the
   tail RPC in the same second (§5 storm run).
9. **Close the commit-order skip on the client side as a stopgap**: a refill re-reads a short
   window behind its cursor and dedupes by a set of seen ids, instead of trusting that nothing
   below the cursor can still commit. The real fix is step 2. *Filed:*
   `docs/backlog/log-follower-skips-rows-that-commit-late.md`.
10. **Write down two "never" rules** in `docs/DEPLOYMENT.md`: never enable Vercel's production pause
    without exempting `/output`; never ship a live-path function change without a behaviour
    self-check (already a `supabase/AGENTS.md` rule, not yet tied to a named contract).
11. **Show output health on the hosted page and the phone**, the one line the production page
    already has.
12. **Never let a font request gate a frame.** Serve bundled fonts with the prepared payload (or
    from whatever serves the output), or stop waiting for the frame's `load` to release commands;
    today a hanging font host leaves an output that accepts every Take and shows nothing (§5.2).

---

## 17. What this research could not verify

- **Production itself.** By the owner's rule nothing was run or read on production: not its role
  timeouts, its PostgREST pool size, its compute, `pg_stat_statements`, or its real traffic mix
  during a show. The branch's defaults were measured instead. Reading production's statistics is
  read-only and would sharpen §13; it needs the owner's word.
- **A real Postgres restart.** A hosted branch cannot restart its database on demand. The overload
  run reproduces the incident's first phase; for the restart itself this document relies on
  Supabase's documentation and issue #2211 about database broadcasts after the tenant pool drops.
  A local Supabase stack could stop Postgres while Realtime stays up; it was not installed.
- **A private-channel rejoin while Postgres is down.** Joins worked under overload; whether they
  fail outright during a restart (as the documentation implies) was not observed.
- **Hosted latency elsewhere.** All hosted numbers are from one laptop in Finland to eu-west-1 on
  one evening. They are for comparing conditions, not for promising latency.
- **vMix and an SPX server.** vMix is not installed here; SPX was not run as a server. The framing
  check used desktop Chromium and CasparCG 2.5's embedded Chromium; SPX's renderer is a Chromium
  page as well, but it was not run.
- **OBS storage persistence** is documented, not run.
- **Signed commands.** ECDSA P-256 verification cost on Chromium 71 was not measured; WebCrypto
  support there is documented, not tested.
- **Skew Protection's maximum age** for the project is not visible through the API; a deployment
  about seven hours old was still reachable with `?dpl=`.
- **The audience plane's load** (`/join` polling) was not measured; its numbers are
  `CLOUD_PLAYOUT.md`'s arithmetic.
- **Bridge crash and restart** are described from code and `CLIP_PLAYBACK_PLAN.md`, not rerun.
- **Local mode** was not prototyped. §12's feasibility is from the existing Bridge, relay and
  export code, and from the CasparCG storage runs.
- **CasparCG 2.3 render timing and raster cost.** Playwright cannot attach to Chromium 71, and the
  CasparCG 2.5 timing measures frame production, not raster or dropped frames.
- **The browser runs' first attempt overlapped an orphaned run of the same scripts** (a stopped
  task whose shell survived). Those results were set aside and every browser measurement in §5 was
  rerun in one clean sequence; the database probe runs were not affected.

---

## 18. Questions that need the owner

Only the choices that change the outcome. Each has a suggestion.

1. **Direction.** Take the staged path of §14 (guardrails, then a cheaper and correct path, then
   READY and versions, then outage survival and local mode by measurement)? Or put local mode
   earlier because venue shows matter most to you? *Suggestion: the staged path; step 2 is needed by
   everything after it.*
2. **Local mode topology.** For a CasparCG on a separate machine, may Bridge serve a read-only
   output on the LAN (protected by the output token, accepting no commands), or must it stay
   loopback-only and require either the same machine or a second install on the playout machine?
   *Suggestion: loopback first; decide the LAN side when an owner needs it.*
3. **Signed commands over a public or a private topic.** Public: no database even to rejoin, but
   anyone holding an output URL can flood the project's shared message quota. Private: no flood
   risk, but a socket that drops during a database outage cannot rejoin until it is back.
   *Suggestion: private, and rely on sockets staying joined; revisit if §5's reconnect data says
   drops during outages are common.*
4. **A graphic already on air when a new version is ready**: switch at its next Take
   automatically, or only when the operator presses "Apply update"? *Suggestion: next Take
   automatically, plus the explicit button for graphics that never go off air.*
5. **Prepare for Live and publishing**: may Prepare for Live publish pending changes itself, or
   should publishing stay its own press? *Suggestion: it publishes, and says so in its checklist.*
6. **Migration policy**: accept that live-path contract changes become an explicit, scheduled class
   while every other migration stays automatic on landing? *Suggestion: yes.*
7. **Money**: raise the database one compute size and lift the Realtime spend cap only when step
   1's numbers say so, or pre-emptively before larger productions? Both are recurring costs; the
   current prices were not checked for this document. *Suggestion: when the numbers say so.*
8. **Priority**: steps 0-2 are mostly invisible to users. Do they go before the other outcomes
   marked now in `GOALS.md`, or beside them? *Suggestion: step 0 at once (small), steps 1-2 as the
   next playout work after the Phase 5 walk.*
