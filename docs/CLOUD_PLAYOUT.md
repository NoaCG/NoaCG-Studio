# Cloud playout — the Browser Output workflow

The binding contract for **Productions**: one persistent browser-output URL a production client
(CasparCG HTML producer, OBS Browser Source, vMix Web Browser input, any Chromium) loads once,
plus the operator workflow that prepares and airs graphics through it. This doc governs
`src/output/`, the production surfaces in `src/components/home/`, the cue additions to
`src/model/shows.ts`, and migration `0029_cloud_playout.sql`.

Read `docs/CONTROL_LAYER.md` first — cloud playout is a THIN layer over the hosted-control
system (migration 0008), not a second control architecture. The command log, the RPC surface,
the staged-vs-take model, the recovery doctrine, and the receiver semantics are all inherited
unchanged.

## What was reused, and what is new

Reused verbatim (the audit that chose this is summarized in §9):

- **The durable command log** — `control_events` + `control_send`/`control_tail` (0008): the
  INSERT is the send, DB order is the truth, gap-fill + hole detection recover a reconnect.
- **The capability model** — an unguessable slug in the URL is the authorization; SECURITY
  DEFINER RPCs are the gate; owning/publishing needs sign-in (RLS), operating does not.
- **Staged-vs-take** — `control_stage` + the shared `staged` buffer: nothing airs because it
  was typed; airing is an explicit Take.
- **Recovery doctrine** — reset is two operations, recovery is both: the data half (update),
  then the visual half (snap — timers arm). The renderer rebuilds from its own last
  `control_report`.
- **Rendering** — `composeDocument(template, { liveControl: true })` in a
  `sandbox="allow-scripts"` iframe (the GraphicControlPage pattern), commands crossing as
  `previewProtocol` postMessages.
- **The record layer** — `Show` (sync kind `'show'`, packet conventions) grows cues
  additively; `ControlEntry` stays the per-graphic saved data row; the library resolvers
  (`resolveSavedGraphicDoc`, `templateForSavedGraphic`) stay the one lookup.

New:

- **`output.html`** — a 4th Vite MPA entry: the persistent transparent renderer page.
- **Cues on the Show record** — a first-class ordered cue list (§2).
- **Migration 0029** — `output_slug` + `output` payload on `control_shows`, two output RPCs,
  a `cue` status row in the send allowlist, owner pruning of old log rows.
- **The Productions UI** — the Home rail section + `#/production/<id>` page (§5).

## 1. The three activities, separated

1. **Create and edit graphics** — the editor, unchanged.
2. **Prepare a production** — the production page: pick graphics, write cues, publish.
3. **Operate the live production** — the operator surfaces driving the output URL.

A **production** is the user-facing name for the `Show` record (the UI word "Rundown" is
retired; the model file keeps its name — renaming `shows.ts` would churn sync kind `'show'`
for nothing). One production = one output URL + one control page + one cue rundown.

## 2. The data model

### Cues (local, additive on `Show`)

```ts
/** One prepared, orderable data row of the production — "what airs next", not a graphic. */
interface ShowCue {
  id: string;              // uuid — stable across edits and reorders
  sourceId: string;        // the pool entry (SavedGraphic.id) this cue drives
  label: string;           // "Anna Andersson — Presenter"
  values: Record<string, string>; // fieldId -> value, the cue's prepared data
  note?: string;           // operator note, shown in the rundown
}

interface Show {
  // ...existing fields unchanged...
  cues?: ShowCue[];        // ADDITIVE OPTIONAL — rundown order; absent = no cues authored
  outputSlug?: string;     // the published output URL's capability, like hostedSlug
}
```

- `Show.graphics` stays the graphic POOL: which templates the production can air, each once
  (the name-keyed add is unchanged — one renderer instance per pool graphic). **Cues are data
  rows over the pool**: many cues may reference the same pool graphic (`sourceId`), which is
  how "speaker lower third" airs Anna at cue 2 and Ben at cue 7 without a second copy of the
  template. This dissolves the same-graphic-twice problem without touching the name-keyed
  channel identity every receiver already ships with.
- Both fields are additive optional — no version bump, no migration, an older build reads and
  writes the record untouched (rule 6). `makeConflictCopy` strips `outputSlug` exactly as it
  strips `hostedSlug`: the published pages belong to the original record.
- Adding a graphic to a production auto-creates one cue seeded from the template's field
  defaults, so the cue rundown is never empty-but-working. Entries (`ControlEntry`) remain the
  per-graphic saved rows; the cue editor offers "from entry…" as a starting point, but a cue
  OWNS its values — editing a cue never writes back to an entry.

### The published payload (server, migration 0029)

`control_shows` grows two columns:

- **`output_slug text unique`** — a second, independent capability: holding it authorizes
  RENDERING the production, nothing else. It never appears in `control_show_by_slug`, so a
  control-page operator cannot derive it, and the output URL cannot operate the show beyond
  what rendering requires (`control_report`). Generated URL-safe
  (`translate(encode(gen_random_bytes(9),'base64'),'+/','-_')`) — the 0008 slug's raw base64
  survives only inside a query parameter; this one must also survive being hand-typed.
- **`output jsonb`** — the renderable payload, written at publish:

```jsonc
{
  "v": 1,
  "resolution": { "width": 1920, "height": 1080, "label": "…" }, // the production canvas
  "graphics": [{                                // one renderer instance per pool graphic
    "key": "Lower third",                       // = the 0008 graphic name key, unchanged
    "html": "…", "css": "…", "js": "…",
    "assets": [{ "path": "images/logo.png", "data": "data:…" }],
    "resolution": { "width": 1920, "height": 1080, "label": "…" }, "fps": 50
  }],
  "cues": [{ "id": "…", "graphic": "Lower third", "label": "Anna",
             "values": { "f0": "Anna Andersson" }, "note": "after the intro" }]
}
```

**Publishing pins a version.** The payload is a snapshot taken at publish; editing a graphic
in the library changes the output only on the next publish. This deliberately inverts the
live-resolution doctrine (`templateForSavedGraphic`) that the hosted PANEL spec keeps: an
operator page should always match the current design, but a renderer that has been on air for
three hours must never change under the operator's feet. The production page shows a "changes
not yet published" hint when the library template or cue list is newer than the last publish.

### Server changes (migration `0029_cloud_playout.sql`)

1. `control_shows.output_slug` + `control_shows.output` (above), plus
   `control_shows.output_seen_at timestamptz` — the renderer's heartbeat.
2. **`control_output_by_slug(p_output_slug)`** → `(id, title, output, live, last_event_id)`.
   SECURITY DEFINER, granted to anon — the renderer's one resolve call. Returns neither
   `panel`, `staged`, nor the control slug.
3. **`control_output_tail(p_output_slug, p_after)`** — `control_tail` addressed by the output
   capability (the renderer must not hold the control slug).
4. **`control_output_seen(p_output_slug)`** — stamps `output_seen_at`; the renderer calls it
   every 60 s. Operator surfaces read the staleness as the "renderer connected" indicator.
   **It is only shown once there IS an output to ask about** (owner walk, 2026-08-29): publishing
   mints the output slug whether or not anybody wants a browser output, so the slug cannot answer
   the question and a header reading "output not seen lately" beside a production with no browser
   source anywhere reads as a fault. The production page asks it when the operator has TAKEN the
   output URL (`Show.outputOpenedAt` - copied the link or downloaded the template file) or when a
   renderer has ever reported in, and says nothing about an output otherwise.
5. **`control_send` allowlist grows `'cue'`** — a STATUS row (`{t:'cue', cue: <id>}`) the
   control surfaces write on Take so every open page agrees on which cue is live. Receivers
   ignore unknown `t` by construction (verified against `receiverScript.ts` and
   `hostedReceiver.ts` — the row is backward-compatible with already-exported graphics).
   The row has always named its GRAPHIC (`control_events.graphic`), so the log was per-layer
   from the start; making a production multi-layer (0034) changed only the row snapshot below
   and the clients reading it, never the wire.
5b. **`control_send_many(p_slug, p_items)`** — a multi-part verb (Take is update → stop
   previous → play → cue) as ONE atomic, log-ordered insert: one RPC round-trip of on-air
   latency instead of four, and it cannot fail halfway. Validated per item, burst-checked
   once for the batch, capped at 8 items (a verb, not an ingest API).
   Since **migration 0056** it also BROADCASTS the same commands, in the same transaction, on
   the production's private topic `cmd-<show id>` — the FAST ROAD every following surface
   applies on arrival (median 97 ms against the durable row's 131 with a slow mode past 600).
   An item rides it when the caller marks it `"fast": true`; that mark is transport and is never
   inserted. RLS on `realtime.messages` lets anon READ that topic and gives no client an INSERT
   policy, so the only writer is this function and the only key to it is the CONTROL slug — which
   is what stops a holder of the read-only output URL pushing a command onto air
   (`e2e/configured/output-url-cannot-push.spec.ts`).
6. **Owner pruning** — a DELETE policy on `control_events` for the show's owner; the publish
   path deletes rows older than 7 days. Keeps the append-only log from growing without bound
   under a 24/7 output URL (the 0008 schema has no retention at all).
7. `control_show_by_slug` grows `output` in its return — the hosted operator page uses the
   published templates for its local PREVIEW iframes (§4).

Entitlement: the whole surface rides **`control.hosted`** — publishing writes `control_shows`
(already gated by the 0022 restrictive policy), and every operator write already passes the
RPC-internal owner check. The output READ RPCs stay open like `control_show_by_slug`
(0022 doctrine: reads render and explain themselves; commands are what the gate refuses).
A separate `playout.*` key can split the two features later without schema changes.

## 3. The output renderer (`/output?production=<output_slug>`)

A 4th MPA entry (`output.html` → `src/output/`), following the `/admin` build shape (own
entry module, own CSS, no `styles.css`, no `trackPageVisit()`) with the OPPOSITE access
model (the `?chat=`/`?control=` capability pattern: the slug in the query IS the auth).

The page:

- **Stage** — a fixed-size stage at the production resolution, CSS-scaled to the viewport
  (predictable broadcast scaling: 1920×1080 design pixels regardless of window size),
  transparent background (`html, body, iframe { background: transparent }`,
  `<meta name="color-scheme" content="dark">` on BOTH the page and every srcdoc — the
  Chromium opaque-iframe rule).
- **One sandboxed iframe per pool graphic**, all built at load (preload). Each iframe is
  `composeDocument(reconstructedTemplate, { liveControl: true })` — templates start invisible
  by the SPX contract, so a stacked idle graphic shows nothing.
- **Every graphic is a LAYER, and pool order is the stack** — index 0 furthest back, the last
  entry on top, carried through the published payload's `graphics` array to the stage, which
  states it as an explicit `z-index` rather than relying on append order. The production page
  authors it (§5) and a re-publish is what moves it, like every other pinned fact. Several
  layers are on air at once by design: a bug, a lower third and a ticker are three graphics,
  so taking a cue on one leaves the other two exactly as they were. That is why a cue's
  identity is its GRAPHIC — one cue per layer, never one cue per production.
- **Transport** — the `hostedReceiver` behavior implemented app-side over supabase-js:
  resolve via `control_output_by_slug`, seed `lastId` from the RECOVERY BASELINE (below),
  rebuild each graphic from `live[key]` (update, then snap), subscribe to `control_events` INSERTs filtered by
  show id, **re-tail on every `SUBSCRIBED`** (the reconnect gap the audit found in the hosted
  page), **re-tail every `CONTROL_POLL_MS` whatever the socket is doing** (the floor below),
  dedupe by row id, tail-fill on holes, route each command to its graphic's iframe as
  a `previewProtocol` message, report applied state back via `control_report` (debounced),
  heartbeat `control_output_seen` every 60 s.
- **Nothing on air but graphics.** No UI, no connection text — a disconnected renderer keeps
  the last applied state and recovers silently. `&debug=1` overlays a status readout for
  setup and rehearsal; without it the page renders nothing but the stage.
- **The recovery baseline is per graphic, and it is what the renderer APPLIED** (migration
  0033). Every report writes `live[graphic].event` — the last log row that renderer had
  applied when it captured that truth. Boot rebuilds each graphic from its own report and
  then follows the log from the OLDEST of those baselines, dropping only rows a graphic's own
  snapshot already contains. The rule it replaces looked identical and was not: 0029 seeded
  the cursor with the log HEAD, so anything commanded between the last report and the boot
  counted as applied and was dropped. A running renderer reports within ~800 ms of any
  command, so the hole was invisible in rehearsal — but while the renderer is DOWN the hole is
  the whole outage, which is the exact case recovery exists for (kill the output page, take a
  cue, bring it back: the pre-kill picture returned and the cue never aired; found on prod
  2026-08-03 by §8's step 5). A snapshot with no baseline (pre-0033 row or renderer) is
  replayed rather than trusted — a needless re-animation is recoverable, a lost take is not.
  Catch-up is paged: the tail RPC answers 500 rows, so `followControlLog` keeps pulling while
  pages come back full instead of recovering only the first page of a long outage.
- **A production nobody has rendered starts at the log START, never at its head** (2026-08-25).
  0033 left one case behind: with NO baseline anywhere — no renderer, hosted or relay, has ever
  reported for this production — the boot fell back to the log head, and the head is a claim
  about the renderer ("everything up to here is already on air") made about a log nothing had
  ever followed. So a cue taken before the browser source finished booting was dropped for good:
  no snapshot to recover from, no row left to replay, a dark layer until an operator happened to
  send another command. Taking a cue and THEN pasting the output URL into OBS is the everyday
  shape of it; the boot itself is the same race in miniature, since the take only has to beat the
  resolve. It is what made `quiz-output` and `scorebug-output` flaky on CI on 2026-08-24 — both
  dark for their polls' full 30 s, both green on retry, never failing on a warm laptop.
  Replaying that log is the FIRST airing rather than a re-airing, and it settles off air like
  every other catch-up. The whole rule lives in `control/outputRecovery.ts`, pure and outside the
  boot closure for the reason the match clock's does — this page runs only against a live
  backend, so a decision left inside it can be verified by no offline spec.
  `e2e/productions.spec.ts` drives the rule; `e2e/configured/output-cold-boot.spec.ts` walks it
  end to end on the real wire (take first, open the renderer second).
- **The RELAY receiver shares that rule, with one stated divergence** (2026-08-25). The block
  appended to an exported graphic (`control/hostedReceiver.ts`) follows the same log for one
  graphic and had the same bug on the plane published packages run on: seeded from
  `last_event_id`, a graphic loaded after the cue was taken dropped that cue for good. It now
  calls `receiverFollowFrom` — `control/outputRecovery.ts`, beside the renderer's rule, emitted
  into the block as ES5 because that plane can import nothing, and the two forms are asserted
  equal by `e2e/hosted-control.spec.ts` rather than trusted. The boot also READS the log itself
  now, before the socket, instead of relying on `ws.onopen` to do it.
  **Where it differs, and why:** a report with no `event` baseline is trusted here (start at the
  head) where the renderer would replay from the log start. `control_report` (migration 0008)
  has no `p_event` parameter, so a report written on this plane can never carry a baseline —
  the renderer's pre-0033 edge case is this plane's every report — and a graphic is its own
  stage, with no `setVisible(false)` to settle a replay behind, so replaying a 7-day log would
  play the outage's history out on screen. **So the outage window a report cannot date is still
  lost on the relay plane**, and closing it is two changes together: `p_event` on
  `control_report`, plus a catch-up pass that hides the graphic. Walked on the real wire by
  `e2e/configured/relay-cold-boot.spec.ts`, which proxies the block's own RPCs to the stack.
- **THERE IS A FLOOR UNDER REALTIME: every follower re-reads the log every 30 s**
  (`CONTROL_POLL_MS`, 2026-08-25). Every recovery above is triggered by something the SOCKET
  does — a row arriving with a hole in front of it, or a `SUBSCRIBED` after a reconnect. A
  channel that opens and is never joined does neither: it never closes, so nothing reconnects,
  and it never delivers, so no row can expose a gap. The renderer held whatever its boot
  catch-up had fetched and aired nothing else for the rest of the show. It is not exotic — a
  venue proxy that passes the WebSocket upgrade and eats the frames, a Realtime incident, a
  phone suspended past its rejoin, an old CEF.
  **Why 30 s specifically.** It is a floor, not a transport: when Realtime works it delivers in
  well under a second and every poll returns nothing, so the only thing it buys on a healthy
  production is load. Against the concurrency budget below, one `control_tail` per follower per
  30 s is 0.03 req/s each — 100 productions with a renderer and two operator pages apiece cost
  ~10 req/s on PostgREST, under 2% of the ~600 req/s the audience plane already spends at that
  scale and which is what actually breaks first. At 5 s it would be ~60 req/s, a tenth of that
  ceiling, spent almost entirely on empty answers. Longer is worse than useless: a take that
  airs a minute after the press is indistinguishable from one that never aired.
  **And a channel that never joins is DIAGNOSABLE, not silently retried.** `subscribeControlEvents`
  used to swallow every status but `SUBSCRIBED`; it now reports all of them, `followControlLog`
  tracks whether the channel has ever joined, and `/output` says `NOT JOINED … polling every
  30 s` on the `&debug=1` overlay plus once on the console — which is what reaches a CasparCG or
  OBS log when nobody thought to add `&debug=1` first. The receiver block warns the same way.
  A renderer running on the floor instead of the stream is a production on a 30 s delay, and it
  looks identical to a quiet show from every seat unless it says so.
  `e2e/configured/output-realtime-floor.spec.ts` intercepts the socket and takes a cue through
  it; `e2e/hosted-control.spec.ts` does the same offline for the relay block.
- **Recovery is never watchable.** The doctrine is data, then SNAP — instant, timers arm — and
  catch-up rows break it by their nature: they are ordinary commands, so replaying them animates.
  A reopened output would air the outage's history (a graphic entering, a cue leaving, another
  entering) before settling. So the whole boot pass — the rebuild AND the replay — runs with the
  stage hidden (`setVisible`, an opacity on the renderer's own surface, never the graphics'
  state), and the stage returns after a fixed settle. Nothing to replay hides nothing, so an
  ordinary reopen still paints at once. The settle is fixed rather than "wait for quiet": a
  recovered state can legitimately keep moving (a ticker, a clock), so a quiet-period test would
  never fire.
- **A MATCH CLOCK is the one value a snapshot cannot rebuild, so it carries its own origin.**
  Everything else on the wire is a value somebody sent; a clock keeps moving with nobody
  commanding it, and until 2026-08-19 the only copy of "67 minutes" was in the renderer's own
  memory — so a browser source reloaded at 67 minutes came back at 0:00, on air, with nothing on
  the operator's screen saying so. The clock's field value now carries the instant it was true
  (`"45:00@1755600000000"`) and every renderer paints `value ± elapsed`, which also ends the
  two-renderer drift and the background-tab throttle. The stamp is DERIVED, not invented: it is
  the `clockStart` row's own `created_at`, so every renderer computes the same one and a
  boot-time replay of the log reconstructs it exactly. `control/matchClockWire.ts` reads the
  clock out of the published markup (no design declares anything) and decides what each row does
  to it (`clockRowEffect`); `output/main.ts` writes that into `mergedData` — which is what the
  report persists and what boot recovery replays, so the recovery is the ordinary one. Runtime
  half: `templates/shared/matchClock.ts`.
  **The decision is PURE and lives outside the renderer on purpose.** This page only ever runs
  against a live backend, so anything decided inside its boot closure can be verified by no
  offline spec — and "which event stamps what, in which order, against which held value" is
  exactly where a bug here would hide, on air. `e2e/productions.spec.ts` walks a whole match
  through it (kick-off, a goal re-sending the value set, half time, the second half resuming
  from 45:00, a reset) and is mutation-tested against the ordering and both banked values.
  **THIS PAGE IS THE ONLY PLANE THAT DERIVES THE ORIGIN FROM THE ROW**, which is the one way
  several renderers agree EXACTLY rather than within delivery skew. Since 2026-08-20 the
  exported operator pages stamp one too (`control/matchClockPageJs.ts`, the dependency-free
  copy of this module's arithmetic), so a reload is recovered off the hosted plane as well.
  `docs/SPORTS_PACK.md` carries the per-plane table. A relay-driven browser source recovers a
  reload as well, by the bounded off-air replay in `control/localReceiver.ts`.
- **A DEBATE BOARD'S TWO SPEAKING CLOCKS carry the same origin, and the STAMP says which one is
  running.** Everything above applies twice on the speaking-timer type (dc01), where two clocks
  alternate — and the hard part is not the arithmetic but "who has the floor", which is the
  machine's floor-group pointer. The wire does not learn to read machine graphs to find it. The
  invariant is a property of the wire's own values: **at most one of the two clock fields carries
  an origin stamp, and that one is running.** `switch` banks the stamped clock plain and stamps
  the other (neither stamped → the first, because somebody has to open); `penalty` docks whichever
  is stamped; `reset` returns both to the allowance on screen; going off air banks the stamped
  one. No state id is named and no edge is read, and it agrees with the machine because the
  design's own engine already alternates the same way (`scoreboards/debateFloor.ts`
  `debateStart`). The design DECLARES its clocks with one attribute vocabulary —
  `data-speaking="a" | "b" | "allowance" | "penalty"` — because unlike the match clock there is
  no pre-existing class contract to read. Wire half: `speakingClocksFromHtml` /
  `speakingClockRowEffect` in `control/matchClockWire.ts`; runtime half: `speakingClockUpdate` in
  `templates/scoreboards/debateFloor.ts`. `e2e/productions.spec.ts` walks a whole debate through
  the log and then reads the snapshot mid-speech, and boots the real board against a stamped
  value; both are mutation-tested.
- **THE STAGE IS SENT WHAT THE RENDERER HOLDS FOR A CLOCK FIELD, not what the row carried.** A cue
  stores a plain time forever, so every Take and ✎ Update re-sends it. The template's own resend
  guard can only compare against the value it last RECEIVED, so once a clock has moved away from
  what the cue stores — a debate's second speech, a match clock restarted after the interval —
  the resend is no longer recognisable as one and pulls a running clock back. `output/main.ts`
  forwards the merged value instead: a stamped value is time-relative, so re-sending it is always
  safe, and a genuine correction has already replaced it in `mergedData` by then.
- **Snap resets the graphic first, and the reset is blunt** (`clearProps: 'all'` over the root's
  subtree). It clears inline styles the DATA layer owns, not just the motion's: an image field
  with no picture hides itself inline, so recovery used to put a broken-image box on air beside
  the caption (seen in CasparCG, 2026-08-03; every design with a `filelist` field was exposed).
  Two guards now, because the runtime lives in two places: the emitted interpreter re-hides every
  srcless field image after its reset, and the renderer restates the data AFTER the snap — which
  is what repairs graphics whose code was published before the interpreter learned the rule.
  `e2e/snap-recovery.spec.ts` is the gate: it drives every image-bearing design through recovery
  and fails if a snap changes what the fields decided to show.
- **It must parse on an OLD CEF.** CasparCG 2.3.x LTS — the ordinary school/student install
  — embeds a ~Chromium 65 browser. A real 2.3.2 server rejected the first build outright
  (`Uncaught SyntaxError: Unexpected token ?`: `?.`/`??` need Chromium 80), showing a dead
  layer with nothing on air and no clue why. Two rules follow, and neither is optional
  while 2.3.x is a supported target: **the Vite build target stays at `es2017`** (it covers
  every bundle, including the dynamically imported supabase client), and **`output.html`
  carries the runtime shims** for the APIs that engine lacks (`globalThis`,
  `Object.fromEntries`, `AbortController`, `queueMicrotask`). The template code inside the
  iframes is emitted text that Vite never transpiles, so the same bar applies to
  `ANIM_INTERPRETER_JS` and every design-owned runtime: no `?.`, no `??`. None of this is
  caught by `npm run build` or the e2e suite — only a real old-CEF server shows it, which
  is why it is written here.
- Offline build / bad slug: a neutral dark "not available" card (never on a production's
  air — this state only exists when the URL was wrong to begin with).

The URL is persistent by construction, and that now includes unpublishing. IDENTITY (which URLs
address a production) and PUBLICATION (whether they resolve) are separate: publication is the
`control_shows` row, which unpublish still DELETES, so every capability 404s honestly the moment a
production is taken down; identity is a `control_show_identity` row that the delete does not touch
(migration 0040), and two triggers on `control_shows` remember every slug on the way out and hand
the same four back on the way in - control, output, join and presenter alike.

So a production's output URL, once pasted into CasparCG or an OBS browser source, is good for the
life of that production. It was NOT before 0040: unpublishing dropped the row and re-publishing
re-minted every slug from its column default, which contradicted what this section and the app's
own publish confirmation both promised. The fix is in the database rather than in the publish path
on purpose: restoring identity is an invariant of the table, not a step a writer can forget, and it
changes no function, policy or authorization path, so it cannot leave a door open behind an
unpublished production.

0040 was written partly as the one mechanism that would have explained acceptance round 2's
unexplained "the CasparCG URL stopped working" report. **Do not read it as that report's diagnosis.**
The symptom as the owner describes it is that a production page's GRAPHIC stopped working, which
need not involve the URL at all; it happened once, it has not been reproduced, and the address half
is now closed and verified regardless. The owner parked the case on 2026-08-20 rather than keep an
un-reproducible item open - so it is not on anyone's list, and it gets reopened by a second
occurrence, not by another round of speculation about the first.

One consequence worth knowing: a readable join name stays reserved by the production that held it
even while that production is unpublished, so claiming it from another production is refused as
taken. That is the same promise seen from the other side. The refusal reaches the operator as the
ordinary "already taken" message and not as a raw database error: the unique index that stops it
is the one on `control_show_identity`, it is violated inside the AFTER trigger, and a unique
violation raised in a trigger still propagates as SQLSTATE 23505 - which is the code
`claimJoinName` (`control/hostedControl.ts`) already translates.

**Applied on production 2026-08-12, and confirmed by CALLING it on 2026-08-20.** Worth writing down
because the obvious check is the one that cannot answer the question: `supabase migration list
--linked` reports a version number, so a `0040` in the remote ledger says only that *something*
numbered 0040 ran - the duplicate-number trap, where two branches mint the same number and `db push`
silently skips the loser while still reporting success. Reading the catalog is no better: finding
the table, the two triggers and the RLS state proves shape, not behaviour. What was actually
measured, as `authenticated`, inside a transaction deliberately aborted so production kept nothing:
publish a throwaway production, unpublish it the way the app does, publish it again, and compare all
four addresses - control, output, join and presenter all came back identical, and the identity row
survived the delete. A second walk claimed a readable name on a production, unpublished it, and had
another production try to take the name: refused, 23505, as the paragraph above promises. The
back-fill ran over the 29 productions published at the time and no published production is missing
its identity row today. Re-run either walk the same way if the question ever comes up again; the
follow-up that closed the two functions' EXECUTE grants is migration 0042.

## 4. The operator surfaces

Two clients of the same log — the four-renderers doctrine of `docs/CONTROL_LAYER.md` extended
by a cue vocabulary. Preview is LOCAL on both; program is only ever changed by an explicit
send.

**The production page** (`#/production/<id>`, in-app, the owner's cockpit — §5) and the
**hosted control page** (`?control=<slug>`, no login, phone-capable) both present:

- **The cue rundown** — ordered cues with label, graphic, note; every LIVE cue marked (from the
  `cue` status rows + `live` reports). Selecting a cue stages nothing by itself. There is no
  single live cue: one per layer that is up, so several rows carry the mark at once.
- **Preview** — a local sandboxed iframe settled with the selected cue's values. Pure local
  render; the wire is never touched, so editing or previewing can never modify program. The
  PRODUCTION page deliberately previews the LOCAL (to-be-published) template — it is the
  authoring cockpit, and the "changes not yet published" hint names any divergence from what
  the renderer runs. The hosted page ships no visual preview in the MVP (cue strip + fields +
  live status); the published payload already carries the templates, so adding one there is
  UI work, not schema work.
- **Field editing** — the selected cue's values through the shared `FieldDescriptor`
  controls; edits stage via `control_stage` (shared across operator pages, the 0008 model).
- **The verbs, and the layer each one addresses.** Every verb below Take acts on ONE LAYER —
  the layer of the SELECTED cue on the production page, the layer of the row the button sits on
  in the hosted page. There is no longer a "the live graphic" for a header button to mean, so
  the surface has to name which layer it is about, and the operator's own selection is the
  least ambiguous answer.
  - **Take** — air the selected cue AS PREPARED: `update` (the cue's values — on the
    production page including its unsaved draft edits) + `play` + the `cue` status row to its
    OWN graphic — one atomic batch (`control_send_many`). It stops nothing. Taking a second
    cue on the SAME graphic re-airs that one instance, which is what makes two cues over one
    lower third replace each other rather than stack; taking a cue on ANOTHER graphic leaves
    the first up, because that is another layer. Staged edits do NOT ride a cue Take; they air
    through the graphic card's own ⟳ Take, which exists for exactly that. The send RPCs mirror
    each cue marker onto `control_shows.live_cue` (0031, per-layer since 0034), so a reloading
    surface recovers what is on air from the row rather than scanning a log window that global
    event ids can defeat.
  - **Update** — send the selected cue's edited values to its layer without replaying it
    (`update`). Legal only while that cue is the one on air on its layer: pushing another
    cue's data onto a live layer would be a take nobody asked for.
  - **Next** — advance that layer's state machine (`next`).
  - **Out** — animate that layer off (`stop` — the SPX contract's out IS stop) + a `cue: null`
    status row. The other layers stay up.
  - **All out** — every live layer off, in batches of four layers (`control_send_many` takes
    eight items and Out costs two). With per-layer Out no single verb clears the frame any
    more, and "get everything off" is the one an operator reaches for under pressure.
  - **Preview** — no verb on the wire; the local iframe above.
- **Status** — renderer connected (from `output_seen_at` staleness, polled), every live layer
  with its cue + machine state + applied values (from `live` reports), publish freshness.

Mobile: the hosted page keeps its single-column layout; the cue strip, field editor, and the
verb row are the priority content (the preview collapses first).

## 4a. Two states, and no Rehearse mode

**A production is either published or it is not, and the header's mode strip says which:**
`● SHOW` or `○ NOT PUBLISHED` (`ProductionPage.tsx`, `data-testid="production-mode"`). There is no
third state and no mode to choose.

A REHEARSE mode was built and then removed (`docs/PLAYOUT_DASHBOARD.md` §6). It was a second way
to do what the surface already does: **preview is local and always available, published or not.**
Choosing a cue shows it, the transport verbs drive it, and none of that reaches air. The mistake
rehearsal could produce - believing you were rehearsing while you were live - went with it, and
`ProgramStage.tsx` records the removal where the stage it used to build is now the PROGRAM
monitor.

- **Unpublished, the verbs still work and stay on the machine.** `runVerb` applies the batch to
  the local PROGRAM monitor, appends the same rows to the activity log, and sends nothing
  (`ProductionPage.tsx`). So the whole rundown is drivable and provable offline, which is what
  `e2e/productions.spec.ts` exercises: it takes two cues, asserts both layers are up and that the
  values reached the rendered documents, then Outs one layer and All-outs the rest.
- **Published, the page is not the authority on what aired.** Verbs go on the wire and come back
  through the log follower; nothing is applied locally, or every command this page sends would be
  applied twice.
- **The monitor renders the LOCAL show, not what was published**, because the authoring cockpit's
  job is to show what it is about to publish. Checking a change before publishing it is therefore
  the ordinary case rather than a mode.

## 4b. The action log

The command log has always recorded everything, because that is what makes recovery possible —
and nothing ever showed it to the person driving the show. "Did that take actually go?" was a
question the system could answer and did not. The production page's **Activity** panel is that
answer: the log read back in the words an operator would use, newest first.

- **It shows COMMANDS — what somebody asked the production to do.** The two meta rows are
  deliberately absent. `staged` is typing (debounced, one row per few keystrokes, per operator)
  and would drown everything else; `live` is the RENDERER reporting back, a different fact with
  its own surfaces (the live chips, the renderer-connected indicator). A feed carrying all three
  is unreadable, which is the usual failure of an event log.
- **A verb is several rows and the log says so.** A Take is `update` + `play` + `cue`, and it
  prints as three lines. Collapsing them would mean inventing a grouping the log does not carry;
  the log's whole value is that it is what actually happened.
- **Cues are named, never numbered.** `describeLogRow` resolves a cue id to the label the
  operator wrote, and the id never reaches the screen. The lookup reads the DRAFT first, for the
  same reason a Take sends draft values: a verb runs in the same tick as its own `flushDraft()`,
  so reading the stored record alone logged the name a cue had *before* the rename that just
  happened — precisely when someone is most likely to be reading.
- **An unpublished production keeps its own log**, built from the same `ControlSendItem`s
  through the same `describeLogRow`. That is what makes the panel identical published or not,
  and it is the only reason any of this is provable without a backend.
- **The HOSTED control page carries the same panel** (2026-08-19). It is the multi-operator
  surface, so it is where "did that take go, or was that somebody else?" is actually asked - and
  it was already reading every one of these rows to drive its PROGRAM monitor and discarding
  them. Same `describeLogRow`, same cap, same history seed.
- Opening a published production seeds the panel with recent history (one tail read behind the
  log head — `followControlLog` starts AT the head by design, being recovery rather than a
  history reader). Global event ids mean that window is a ceiling on rows READ, not on rows
  shown: on a busy instance it simply yields fewer of this show's rows. Entries are capped
  (`LOG_LIMIT`) so a 24/7 production cannot grow the page without bound.
- Timestamps are real: `control_tail` has returned `created_at` since 0008, and a Realtime
  INSERT payload carries the whole row — surfacing them needed no migration, only a widened
  type. A row with no time says `—` rather than guessing.

## 5. Where it lives in the app

- **Home rail**: the `rundowns` section becomes **Productions** (`#/home/productions`) —
  create, list, open; shows the output + control links and renderer status per production.
- **`#/production/<id>`**: the production page — name, status, links (copy output URL / copy
  control URL), publish ("Start production" = publish + verify the renderer connects; it
  never airs anything), the cue rundown editor (add from library or pool, edit values/notes,
  reorder, delete), the **layer stack** (the pool, listed FRONT TO BACK like every layer panel,
  with ↑/↓ moving a graphic forward and back, its layer number, and an on-air mark), the
  **mode strip** (§4a) and the operator surface of §4. The stored pool stays in PAINT order — index 0 furthest back, which
  is what the payload and the stage read — and only the list is reversed, so there is one
  ordering in the data and one convention on screen.
- **Pictures** (`src/templates/picture.ts`): "＋ Add pictures…" beside the pool uploads stills
  straight into the rundown - one CUE per picture, all of them on ONE generated picture graphic,
  so taking picture 3 replaces picture 1 on that layer instead of stacking a second still over
  it. It is the cue model of §2 with no new architecture under it: no migration, no wire change,
  no schema change. Four things are deliberate. The graphic is **pool-owned, never a library
  record** - the production page may not write into a document it only references, which is the
  rule the cue editor's image picker already states; its name is made unique against the library
  because `resolveSavedGraphicDoc` falls back to a NAME match when there is no `graphicId`.
  Uploads are **downscaled in the browser** (`importImageFile`, capped at the stage's long edge)
  because every asset is base64'd into the published `output` row. That row is why
  **`MAX_PICTURES` is 20** - a real ceiling, not taste; past it the answer is externalizing
  assets to a bucket, not a bigger number. And assets are **pinned at publish**, so a picture
  added to a published production reaches the renderer on the next publish - which the upload
  says out loud rather than leaving to be discovered on air.
- **The editor's Control tab**: its Rundowns block renames to Productions and links out to
  the production page; adding the current graphic to a production stays.
- The wizard Finish step and Home rows keep their existing doors; a graphic's "add to
  production" is reachable from the production page (pool + cue add), not a new wizard branch.

  *Amendment (2026-08-04, the student-release pivot - docs/GOALS_ARCHIVE.md "Student release" step
  6): REVERSED. The wizard's Finish step now leads with a production door - pick or name a
  production and land on its page with the graphic pooled, its first cue seeded, and the
  look captured onto a production that had none - because the primary workflow is
  wizard → production → playout URL. The production page keeps its own add paths, and the
  constraint that Finish stays the wizard's ONE branch still holds: the door is a Finish
  card, not a new step.*

## 6. Export parity (nothing removed)

The six zip targets and the whole-show export are untouched. (The whole-PACKAGE export
retired with packages themselves - step 3 of the student release; whole-show export covers
the need.)
`buildShowZip` keeps producing the offline `show_controlpanel.html` + per-graphic folders, and
a published production still bakes the hosted receiver into exported graphics — the
self-hosted/offline path is the same production operated over the same log, with the renderer
swapped from `/output` to the user's own hosting. The long-term output model:

1. **NoaCG Cloud Output** — the `/output` URL (this doc), plus the **output embed**
   (`src/export/outputEmbed.ts`) for a host that loads template FILES and has nowhere to paste a
   URL. It is downloaded from the Links block beside the URL, and it is that same live output:
   one SPX-legal `.html` framing it, whose Play/Stop move the FRAME while cues stay with the
   operator. It carries the output capability only — a template able to air a cue would have to
   carry the control slug onto a playout machine.
2. **Self-hosted NoaCG Output** — the exported package + hosted receiver (existing).
3. **Portable package export** — the six targets (existing; offline, archival, restricted
   networks).

## 7. The automatic-data direction (the first slice is built)

The browser-output architecture must not need replacing when external data arrives. What this
milestone fixes in place:

- **One ingress.** External data becomes `update` rows in the SAME log, written server-side —
  a connector is a producer next to the operator, never a second path into the renderer. The
  renderer stays dumb: it applies log rows in order, whoever wrote them.
- **Normalized fields.** A connector maps provider payloads to the graphic's own `fN` fields
  server-side (the normalized-schema layer); the graphic never learns provider field names.
  The Google-Sheets polling block (`control/liveData.ts`) remains the client-side stopgap and
  is superseded by server-side connectors, not extended.
- **Credentials stay server-side.** Provider keys live in the backend (the sealed-key /
  gateway patterns already exist for AI); the output page never holds them. The backend
  fetches once, validates, caches, and fans out through the log — renderers never poll
  providers.
- **Operator precedence.** Operator commands and data updates are ordered by the one log, so
  "manual override / freeze" is a connector-side gate (stop writing), not renderer logic.
- **Local venue data** (timing/scoring systems on closed networks) will need a small local
  bridge maintaining an outbound connection that writes the same log — nothing in this
  design assumes a source is cloud-reachable.

**Built (the first slice): the Production Data API** - `POST /api/data/update`
(`api/data/[...path].ts`, migration 0047, integrator docs in **`docs/DATA_API.md`**). It is
exactly the ingress above: a per-production data key (update-only, revocable - deliberately
NOT the control slug, which is a full operator capability and, since 0040, unrotatable)
authorizes a server-side write of ordinary `update` rows through `control_data_send`
(control_send's ingest twin: same checks, rows marked `src:'api'`), with field values
addressed by the graphic's own field LABELS (the dataset binding's normalization) and an
ingest budget - 25 of any 5 s window, the operator keeping the rest - enforced in the
DATABASE, so operator headroom holds globally rather than per serverless instance.
Connectors (pollers, venue bridges) are CALLERS of this endpoint, not new paths.

Recommended first experiments, after this MVP is proven in a real production:
**A.** a published-CSV Google Sheet driving a ticker through a server-side poller (validates
mapping, freshness, override, reconnect); **B.** one legitimate stock-data provider through
the backend (validates credentials, caching, rate limits, delayed-data labeling,
last-known-good). Choose concrete providers only after licensing/cost review.

## 8. Live-verify checklist (real Supabase — a green build never counts)

1. `supabase db push` applies 0029 cleanly; `supabase migration list --linked` shows it.
2. Signed in: create a production, add two graphics, author 3 cues (two on one graphic),
   publish → both links appear; `control_shows` row has `output_slug` + `output` payload.
3. Load `/output?production=<slug>` in a plain browser tab: transparent, nothing visible,
   `&debug=1` shows connected + graphics loaded; `output_seen_at` advances.
4. From the production page: Preview cue 1 (program unchanged), Take cue 1 (airs), edit a
   field + Update (live text changes without replay), Next (state advances), Take cue 2 on
   the OTHER graphic — **both are now on air**, each on its own layer, cue 1 untouched — then
   Out on cue 2's layer (only that one exits) and All out (the frame clears).
4b. **Layers**: with two graphics up that overlap on screen, type a higher `Playout layer` for
   one of them in the cue editor (docs/PLAYOUT_DASHBOARD.md §5 — the number, not an ordering
   gesture), re-publish, and reload the output: the higher number paints over the other. Take a
   third cue on the SAME graphic as cue 1: it replaces cue 1 rather than stacking, because a
   graphic is one layer and one renderer instance.
5. Kill the output tab, reload → it snaps back to the pre-kill on-air state (data, then
   snap). Kill the network briefly → commands sent meanwhile apply on reconnect, in order.
6. Open `?control=<slug>` on a phone (signed out): cue strip + fields + verbs usable; a Take
   from the phone airs on the output tab; the live chip agrees on both surfaces.
7. OBS Browser Source and CasparCG HTML producer (`CG 1-20 ADD 1 "<url>" 1` — channel-layer
   BEFORE `ADD`, as in the generated CasparCG export README): transparent, correct scale at
   1920×1080, survives a CasparCG channel restart.
8. Unpublish → output URL and control URL both go dead honestly; re-publish → same record,
   new session, output URL unchanged only if the row was updated rather than deleted.
9. **The Data API (migration 0047 + `/api/data/update`) — NOT YET RUN LIVE.** A green build
   proves the function compiles, NOT that the platform routes it (the hosted-Pro lesson):
   after the deploy, curl the deployed URL before trusting anything else.
   - `supabase db push` applies 0047; `supabase migration list --linked` shows it; existing
     `control_shows` rows all have a `data_key` (the volatile-default backfill ran).
   - `curl -X POST https://<host>/api/data/update` with no token → the app's own JSON 401
     (routed); a platform NOT_FOUND here means the route never deployed.
   - With a wrong token → 401 "Unknown data key". With the production's real `data_key` and
     `{"values": {"Score A": 1}}` → 200 with `applied: {"f1": "1"}`, and the score changes on
     the open `/output` page and on the operator surfaces within a second.
   - Operator precedence: take a cue, run `scripts/data-api-demo.mjs`, then type a different
     score on the production page and Update - the operator's value lands and stays (later
     log rows win; the feed's next tick overwrites again, which is also correct - freeze is
     stopping the feed).
   - Hammer the endpoint (a loop without sleep) → 429 with `Retry-After`, and the operator
     page keeps working while the feed is refused.
   - Unpublish + re-publish → the old data key answers 401, the new one works (rotation);
     the output and control URLs are unchanged (0040 identity).
10. **Pictures — NOT YET RUN.** The picture graphic (§ pool list, `src/templates/picture.ts`)
   ships covered by `e2e/productions.spec.ts`, which is the LOCAL half: it never publishes,
   so the one thing pictures add to the wire — a multi-megabyte base64 payload in the
   published `output` row, read whole by the renderer AND by every hosted operator page — has
   never been carried by a real backend. Needs a real Supabase, so it cannot be run from a
   spec: add two pictures to a production, publish, load `/output?production=<slug>`, take
   picture 1 (it airs full-frame), take picture 2 (it REPLACES picture 1 on the same layer
   rather than stacking), kill the output tab and reload (it comes back showing picture 2).
   Watch the payload size and the reload time while doing it — that is what `MAX_PICTURES = 20`
   is a guess about, and this walk is the first measurement of whether twenty is the right
   number.

## 9. Why not… (decisions with their reasons)

- **A new `production` record kind?** The Show record already carries identity, order, sync,
  tombstones, and the hosted-control linkage (`control_shows.id = Show.id`). Cues are
  additive. A parallel kind would duplicate all of it and orphan existing rundowns.
- **A new command transport?** The 0008 log already has ordering, recovery, gap-fill, shared
  staging, and burst caps, and its RPCs are live on prod. The renderer is a new CONSUMER of
  the same log.
- **Realtime Broadcast for the renderer?** Fire-and-forget (no replay) — a renderer that
  reconnects must recover exactly what it missed; only the durable log gives that.
- **Serving composed HTML from a Vercel function?** Costs a function slot (2 of 12 left),
  loses HMR/dev parity, and duplicates `composeDocument`. A static entry + client-side
  compose reuses the proven path and keeps the renderer self-updating on deploy.
- **Templates in the panel spec instead of a second payload?** The panel spec is deliberately
  live-resolved and light (operator pages re-publish cheaply); the output payload is
  deliberately pinned and heavy. Different lifecycles, different columns.
- **The production's DATASETS on the output payload, so the hosted page could match rows
  itself?** No: the output payload is what the OUTPUT capability URL serves, and a dataset is
  operator material - a question bank holds the answers. Publishing the matched ROWS onto the
  `panel` spec instead (`dataRows`, 2026-08-19) keeps them behind the control link, ships less,
  and needs no migration: `panel` is jsonb with no version, so an older row simply carries none
  and normalizes to `[]` on read.
- **`hello`/`graphic-online` on the wire?** The hosted path's boot recovery is self-service
  (the renderer rebuilds itself from `live`); the announce round-trip is a BroadcastChannel
  affordance and stays there.

## Concurrency budget (what many simultaneous productions cost)

Nothing here has been load-tested - these are the transport facts plus arithmetic against the
Supabase plan limits, recorded on 2026-08-24 so the ceilings are known before they are hit.
**A real answer is a k6 run against a staging project, not this table.**

What holds a connection, per live production:

| surface | transport | cost |
|---|---|---|
| `/output` renderer | Realtime WebSocket on `control-<showId>` + `control_output_tail` gap-fill + a 30 s tail poll (`CONTROL_POLL_MS`, §3) + `control_output_seen` every 60 s | 1 Realtime connection; 1 request per 30 s |
| operator control page | same Realtime channel, same 30 s poll | 1 Realtime connection; 1 request per 30 s |
| `/join` audience pages | **HTTP polling, never Realtime** (`src/audience/audienceData.ts` - an authorization decision, not a performance one: the capability model cannot be expressed to Realtime row filters) | 0 Realtime connections; 1 request per 5 s per viewer (inbox 4 s, tally 2 s, jittered, paused while hidden) |

That split is what makes the audience cheap on Realtime and expensive on PostgREST. At **100
simultaneous productions**, on the Pro plan with the spend cap ENABLED (500 concurrent
connections, 500 messages/s, 500 channel joins/s):

- **Realtime connections: ~200-300 of 500.** Fits, with under 2x headroom. A fourth persistent
  per-production surface would break it. Disabling the spend cap raises the ceiling to 10,000
  but also opts the org into overage billing.
- **Realtime messages: ~20/s of 500.** Playout events are operator-driven and sparse. Not a
  concern even if the cap counts per-subscriber deliveries rather than sends.
- **Follower polling: ~10 req/s** (100 productions x 3 followers / 30 s) — the §3 floor. Under
  2% of the audience figure below, on the same PostgREST instance, and almost all of it empty
  answers. That ratio is the whole argument for 30 s rather than 5.
- **Audience polling: ~600 req/s** (100 productions x 30 viewers / 5 s) against PostgREST on a
  Micro compute instance. **This is the first thing that breaks, and it is a compute problem,
  not a Realtime one.** The lever is a compute add-on; the included $10 credits cover Micro
  only.
- **Boot payload egress:** 100 renderers booting a heavy show is ~690 MB in a burst (see the
  payload-size limit below - one existing row is 6.9 MB, the average is 244 kB). Trivial
  against the 250 GB/month egress quota even with reloads, but a 7 MB fetch over a venue's
  wifi is dead air before the first frame. Latency, not quota, is the reason to slim it.

Order of concern if the target ever becomes real: (1) audience poll volume vs compute size,
(2) Realtime connection count vs the 500 cap, (3) payload size vs time-to-first-frame.

## Known limits (deliberate, documented)

- **The `control_events` anon SELECT** (`0008:60-61`, `using (true)`) lets any holder of the
  anon key page through EVERY show's log via PostgREST — the show id is only a secret against
  Realtime filters. Narrowing it breaks receivers already baked into exported user files, so
  0029 does not touch it; field values on hosted shows remain effectively public. Owner
  pruning (7 days) now bounds the exposure window. Closing it fully needs a v2 receiver
  generation + a deprecation window — an explicit product decision, not a quick fix.
- **The 50-commands-per-5-s cap is per show**, shared by all operators AND the `cue` status
  rows. Fine for one operator + one renderer; a two-operator production hammering steppers
  can hit it (the page surfaces the slow-down error today). **All out** costs two commands per
  live layer, so it is the one verb whose price grows with the production — a twelve-layer
  clear is 24 of the 50, which is affordable but not free.
- **Payload size**: `output` inlines assets as data URLs; a production heavy on large images
  makes a heavy row (read once per renderer load, so tolerable, but not free). The HOSTED
  OPERATOR page pays the same row on every load while using only the cue list from it — a
  deliberate MVP trade (the templates are already there for a future preview); splitting the
  cues out of the operator resolve is the fix if a metered phone connection makes it bite.
  Asset externalization to a public bucket is the known next step if the renderer side bites.
- **One report authority**: two open output tabs both write `control_report`; last write
  wins. Harmless for state (they converge on the same log) but `output_seen_at` cannot tell
  two renderers apart. Multi-renderer awareness is Stage-2 work.
- **Graphic identity is still the pool NAME** (the 0008 key). Renaming a pool graphic
  between publishes orphans the old key's `live`/`staged` rows until the next publish.
- **`control_events.id` is a GLOBAL identity**, so per-show id sequences have legitimate gaps
  whenever other shows are active on the instance. A consumer cannot tell a benign gap from a
  missed row, so every suspected hole answers with a tail round-trip (correct either way; the
  cost is one extra RPC of latency on that command when the instance is busy). A per-show
  sequence number would remove the ambiguity — schema work for the multi-layer stage. The
  RECOVERY half of this ambiguity (an id-windowed scan for the on-air cue that busy traffic
  could defeat) is gone since 0031 mirrors the cue marker onto the row.
