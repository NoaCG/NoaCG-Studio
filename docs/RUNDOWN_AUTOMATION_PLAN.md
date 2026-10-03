# Rundown automation and basic media - the plan

**Plan, 2026-09-26. Build 2 is built (2026-09-28, `CLIP_PLAYBACK_PLAN.md` phases 0 to 4). Build 1's phase 1 is built (2026-10-03, unpublished productions, §2.0); its phase 2, the wire, is not.** It answers two owner asks at once:
[`backlog/rundown-cue-timing-and-automation.md`](backlog/rundown-cue-timing-and-automation.md)
(cue durations, auto-advance and the rest of rundown automation, planned before anything is built)
and the unplanned half of [`backlog/video-through-playout-wrapper.md`](backlog/video-through-playout-wrapper.md)
(the clip attributes a show needs, which `BRIDGE.md` §5a left open on 2026-09-25). They are one
plan because a clip ending is the most natural auto-advance trigger there is.

**Updated 2026-09-27:** build 2 was planned in full with the owner and now lives in
[`CLIP_PLAYBACK_PLAN.md`](CLIP_PLAYBACK_PLAN.md); §3 summarises it, and it is built before build 1.

Every claim about the code cites `file:line`, checked at `19518e21`.

---

## 0. What to decide, in two minutes

| # | What | Size | For | Recommendation |
|---|---|---|---|---|
| **Build 1** | A cue can end by itself: a duration, then Out, Next or Out and next. A countdown on the live row, the next cue marked armed, **H** to hold, one click to go manual. The deadline lives in the command log, so a reload, a phone and a second operator see the same second, and the end action fires exactly once. (§2) | large, three landable phases | both | **Decided 2026-10-02: build now, as planned**, with the countdown starting when the cue airs (picks below). It is the gap felt in every show. |
| **Build 2** | Clip and audio playback: a clip's ending, fades, level and trim, audio on its own layer, folders, the clip clock and a resizable rundown. (§3, and `CLIP_PLAYBACK_PLAN.md`) | large, five phases | both | **Decided 2026-09-27: build first**, then build 1. **Built 2026-09-28.** |
| 6 | Cues from a spreadsheet: one cue per row, with an optional duration column. | small | your productions | **Next after build 1** (owner, 2026-10-02). |
| 10 | Linked cues: one press takes a graphic and a clip. | small | your productions | **Next after build 1, beside 6** (owner, 2026-10-02), through a folder's All together reaching server cues, not as a new concept (Combined controls were removed 2026-10-02). |
| 9 | As-run log export. | small | TV station, sponsors | **After 6 and 10**, as a CSV of the last seven days. |
| 7 | A Bitfocus Companion module for a Stream Deck. | weeks | both | **Under way; continues whenever it fits** (owner, 2026-10-02), not held back for the items above. |
| 8 | Audio cues. | - | both | **Folded into build 2** for CasparCG; browser-source audio later. |
| 5 | Back-timing to a hard out. | small | TV station | **Not now** (owner, 2026-10-02). A rundown of graphics is not a show's running order. |
| 11 | Switcher automation (ATEM). | weeks | TV station | **Out of scope** (owner, 2026-10-02). Companion (item 7) reaches the switcher. |

**Your picks** (all answered):

1. **Answered 2026-10-02: build 1 as planned.** A graphic cue gets a duration in seconds, and after
   it the configured action runs by itself: Out, Next, or Out and next. The owner made four points
   binding:
   - **The countdown starts when the cue is actually on air, not when Take was pressed.** This
     changes §2.3, which anchors the deadline to the Take's own log row: the building session
     anchors it to the moment the cue airs (for example the first output's report that it holds
     the cue, with the log row as the fallback when no output reports) and says which in its spec.
   - An automatic action more than 5 seconds late is marked missed and never runs later (§2.5).
   - An automatic action never moves the operator's selection (§2.1).
   - Hold (H) and one click to go manual stay, so the operator can always take over (§2.5, §2.8).
2. ~~Build 2's attribute list~~ **Answered 2026-09-27**: planned with the owner as
   `CLIP_PLAYBACK_PLAN.md` (§3 below), built first.
3. **Answered 2026-10-02, the order after build 1, kept loose on purpose:** cues from a spreadsheet
   (6) and linked cues (10) are both next; the Companion and Stream Deck work already under way (7)
   continues whenever it fits; an as-run log (9) follows; back-timing (5) waits; switcher
   automation (11) is out of scope.

---

## 1. What exists today

- **A cue has no idea of time.** `ShowCue` is `id`, `sourceId`, `source`, `label`, `values` and
  `note` (`src/model/shows.ts:24-40`). Every Take and every Out is a click.
- **The record's version stays put for additive fields.** `Show.version` is `2`, and every optional
  field added since (cues, datasets, playout items) was additive (`src/model/shows.ts:116-154`).
- **A server clip already knows its length** when the server reported it: `PlayoutItem.frames` and
  `fps` (`src/model/shows.ts:77-79`), filled from `CLS` (`cli/src/playout/amcp.ts:229-247`) when the
  picker adds a clip (`src/components/home/PlayoutItemPicker.tsx:102`). The picker keeps the length
  and drops the server's kind word (`movie`, `still`, `audio`), so an audio file becomes a clip on
  the shared clip layer (`src/model/shows.ts:526`).
- **Which cue is on air per layer** is written as a cue status row `{ t: 'cue', cue }`
  (`src/control/hostedControl.ts:204-207`), sent with every Take (`src/control/hostedControl.ts:919-925`)
  and Out (`src/control/hostedControl.ts:928-933`), and mirrored by the database into
  `control_shows.live_cue` as `{ v: 2, layers: { <graphic>: { cue, at } } }`, `at` being the server's
  `now()` (`supabase/migrations/0034_live_cue_layers.sql:25-56`, called from
  `supabase/migrations/0057_command_topic_keeps_live_cue.sql:69-76`). A reloading page recovers the
  on-air map from that column (`src/components/home/ProductionPage.tsx:1060`,
  `src/components/HostedControlPage.tsx:326`) through `readLiveCue`
  (`src/control/hostedControl.ts:589-603`), which reads `cue` and ignores anything else.
- **Renderers ignore cue rows**; only pages read them (`src/control/hostedControl.ts:202-203`). The
  database accepts exactly seven row kinds (`supabase/migrations/0057_command_topic_keeps_live_cue.sql:51-56`)
  and at most eight items per batch (`src/control/hostedControl.ts:944`).
- **The match clock is the time pattern.** Its value carries the instant it was true, and "the stamp
  is derived, never invented": it is the row's own server time (`src/control/matchClockWire.ts:25-29`,
  `rowInstant` at `:158`, `clockRowEffect` at `:196`). Client clock skew is accepted there.
- **Unpublished, a verb stays on the machine**: `runVerb` applies it to the local PROGRAM monitor and
  sends nothing (`src/components/home/ProductionPage.tsx:1418-1439`). Published, it goes on the wire
  and comes back through the log follower.
- **Server cues go through NoaCG Bridge and never into the log** (`docs/BRIDGE.md` §5). What is on
  air on the server is page memory only (`src/components/home/ProductionPage.tsx:376`), so a reload
  forgets it, and the hosted page lists server cues as disabled with no on-air state
  (`src/components/HostedControlPage.tsx:1190-1219`).
- **The Bridge protocol is adapter-neutral**: target, item, slot, verb (`src/control/playoutProtocol.ts:15-49`),
  and an adapter declares its verbs (`cli/src/playout/adapters/casparcg.ts:146-151`). An OGraf
  adapter is planned beside CasparCG (`docs/backlog/bridge-ograf-adapter.md`).
- **The verb keys** are Space, R, U, N and 0 plus the arrows (`src/components/playoutKeys.ts:43-68`).
  H is free.
- **"No second clock"** (owner, 2026-08-09, `docs/PLAYOUT_DASHBOARD.md:812`) forbids a per-play
  timer field that could disagree with a graphic's own authored timer, and requires an armed timer
  to be visible. A combined control's `after` wait (removed with Combined controls on 2026-10-02)
  lived on the controller side of that line (`docs/CONTROL_PANEL_ANY_GRAPHIC.md` §6d), and so does
  a cue duration: it paces the controller's sends and never touches a graphic's own timer.

---

## 2. Build 1: timed cues

**Owner ruling, 2026-10-02 (§0, pick 1):** the countdown starts when the cue is on air, not at the
Take. Wherever this section still anchors it to the Take, the on-air moment wins; §2.0 says how the
build picks that moment and its fallback.

### 2.0 The spec delta, 2026-10-03 (what the build follows where §2.1 to §2.11 differ)

Written by the building session before the first edit, against `c1df51aaa`. Where a later
paragraph of §2 disagrees with this one, this one wins.

**Scope: timed GRAPHIC cues.** §3 already dropped `At clip end` (a clip's ending belongs to the clip
and its folder since build 2), so `CueAuto.after` is a number of seconds only, the editor offers
**Ends** `Manual` / `After [ 8 ] s` on a graphic cue and nothing on a server cue, and nothing in
build 1 reads `PlayoutItem.frames` or `mediaKind`. With no server cue ever timed, phase 3 (server
cue markers in the log, §2.7) no longer carries anything build 1 needs: it stays a separate,
later item for what it fixes on its own (a reload knowing which server cues are up, the hosted page
showing them on air).

**Next takes the next graphic cue.** `Next` arms the first GRAPHIC cue after the timed cue in the
rundown's order (`Show.cues`), looking past server cues the way a clip's Play next looks past
graphics (`CLIP_PLAYBACK_PLAN.md` §6.6), so every end action is log rows that both pages can
send. A cue in a folder is taken on its own, as a press on its own row would take it. No graphic
cue after it: nothing is armed, and the editor says that `Next cue` has nothing to take.

**The words.** In this product **» Next** (N) is a graphic's own step, so the end actions read
**Out**, **Next cue** and **Out and next cue** in the editor, the rundown (`0:08 → Out`,
`0:08 → Next cue`, `0:08 → Out + next`) and the log. The stored values stay `out`, `next` and
`out-next`.

**The on-air anchor** (the owner's point 1). The countdown starts when an OUTPUT has applied the
Take, never when Take was pressed. Until then the cue is armed but waiting: its row reads its full
length, dimmed, its title says it is waiting for air, and nothing counts. A Take that fails, is refused or is
superseded never arms.

- **Unpublished (phase 1).** The production page's PROGRAM monitor is the only output there is
  (nothing leaves the machine). The anchor is the monitor's first state reply for the cue's graphic
  after it applied the Take: the stage posts one after every command it applies, and a graphic
  still loading in the monitor applies its queued Take only once it has loaded, so the reply is the
  output saying it holds the cue. Fallback: no reply within 3 s (a graphic that never loads), and
  the moment the Take was applied is the anchor. Page memory, as everything unpublished is; a
  reload forgets it with what was on air.
- **Published (phase 2).** The anchor is the server time of the first renderer report of the cue's
  graphic whose baseline covers the Take, that is, a `{t:'live'}` report written after the
  renderer applied the Take's rows (0071 keeps each report's `seq` baseline in
  `control_heads.live`). A renderer reports a change about 800 ms after applying it, which is
  about when a typical entrance has settled. The stamp is taken by the database, not by a page, so
  every surface and every reload reads the same instant: the first surface that sees such a report
  asks the arm RPC to stamp it, and the RPC checks the baseline under the head lock and refuses a
  report that does not cover the Take. Fallback: no covering report within 3 s of the Take's
  marker row (no output open, an output older than 0071, or a re-take that changed nothing the
  renderer reports), and the Take's own marker row is the anchor, stamped the same way. Once
  stamped, the anchor never moves.
- **Every surface derives the deadline the same way**: anchor + length, the match clock's rule.
  Nothing about the anchor depends on the clock of the page that pressed Take.

**What 0071 and the live-safe rules change for phase 2.** §2.3 and §2.4 were written against
`control_send_many` (0057). Pages now send through `control_send_seq` (0071), which already locks
the production's head row before it inserts, so the plan's lock-first step is true already, and
its stale-press refusal is what stops a fire from landing over an Out another screen pressed. 0075
is to be an *add* (`docs/work-specs/live-safe-migrations/spec.md` L2): new names only. So the arm
lives in a new table beside the head, keyed by production and lane, and a new
`control_cue_arm(p_slug, p_lane, p_cue, p_op, ...)` does every arm operation under the head lock
(`aired`, `hold`, `resume`, `cancel`, `fire`). `fire` is the compare-and-set: it answers `ok` to
exactly one caller in the window from the deadline to 5 s after it, writes the arm's marker row,
and the winner then sends the end action through `control_send_seq` like a press, carrying the
revisions it saw, so a stale fire is refused rather than aired. The take marker carries `auto`
(`{t:'cue', cue, auto}`, additive in the row's message), so every follower learns the arm from the
Take's own row, and the arm RPC checks any page's claim about a lane against the head under the
lock rather than trusting it. No existing function is replaced, so no renderer and no older page
meets a changed RPC.

**Landing phase 1 alone** (the owner's "land each"): a published production does not offer a timed
cue. Its Ends row is disabled with the sentence "Timed cues run on an unpublished production for
now. On a published one they arrive with the next update.", a timed cue there airs as a manual
one, and its rundown wears no timing words, so nothing on a published production promises an end
that will not come.

### 2.1 What the operator gets

- **In the cue editor**, one row under the fields: **Ends** `Manual` / `After [ 8 ] s` / `At clip end`,
  and when it is not Manual, **Then** `Out` / `Next` / `Out and next`. `At clip end` is offered only
  on a server movie whose length the server reported and which does not loop: `mediaKind` is
  `movie`, or, on an item saved before `mediaKind` existed, `frames` is above 1, because a 2.3.2
  server lists a still as `1 1/25` (`cli/src/playout/amcp.ts:218-221`). Otherwise it is absent, with
  the reason as its hint.
- **In the rundown**, a timed cue wears its length and end word (`0:08 → Out`) whether or not it is
  on air.
- **When a timed cue is on air**, its row counts down (`0:05`). In the last five seconds the count
  takes the warning colour. The cue that `Next` will take is marked **armed** with the same count.
- **Over PROGRAM**, one chip shows the countdown that fires soonest: the cue, the end word, the
  count, **Hold** and **Manual**. Held, it reads `Held 0:05` and offers **Resume**.
- **H** holds that countdown, and pressing it again resumes it. **Manual** drops the auto action
  for this airing; the cue stays on air as an ordinary manual cue. It has no key, because it is final
  and rarer.
- **At zero** the end action runs: `Out` plays the cue's layer off, `Next` takes the armed cue,
  `Out and next` does both in that order. A next cue that is itself timed arms in turn, which is
  how a sequence runs itself.
- **Missed.** If nothing could fire it within 5 seconds of zero, because no operator surface was
  open or able, it does not fire late. The row reads `Out was due 0:12 ago` on every surface,
  including one opened afterwards, and the ordinary verbs are there. Any new marker on the layer or
  Manual clears it.
- **An auto action never moves the operator's selection.** Somebody may be editing the next cue's
  fields; moving the selection under their hands would edit the wrong cue.
- **The activity log words it**: "Anna: auto Out sent", "Anna: held at 0:05", "Anna: resumed",
  "Anna: manual", "Anna: auto Out missed".

A manual Take of a timed cue arms it with its full length, and so does a re-take (R). Update (U)
does not touch the countdown. A manual Out, All out, or a Take of another cue on the same layer
replaces the layer's marker and with it the countdown.

### 2.2 The record

On `ShowCue`, additive and optional:

```ts
/** How the cue ends by itself. Absent = manual, which is how every existing cue keeps behaving. */
auto?: CueAuto;

export type CueEnd = 'out' | 'next' | 'out-next';

export interface CueAuto {
  /** Seconds after the Take, 0.5 to 86400, at most one decimal. Or 'clip': the server clip's own
   *  length (a media PlayoutItem with frames and fps, not looping). */
  after: number | 'clip';
  then: CueEnd;
}
```

- **`Show.version` stays 2.** The field is additive, like `cues` and `playoutItems` before it
  (`root/version-every-persisted-format-ship-breaking`); an older build keeps it untouched through
  `updateShowCue` and `moveShowCue`, which mutate in place (`src/model/shows.ts:635-652`, `:687-697`).
- **`PlayoutItem.mediaKind?: 'movie' | 'still' | 'audio'`** arrives in build 1, not build 2: the
  picker records the server's kind word it drops today (`src/components/home/PlayoutItemPicker.tsx:102`),
  because `At clip end` must tell a movie from a still. Build 2 uses the same field for audio (§3.2).
- **On the cue, not on the graphic or the item**, because two cues over one lower third air
  different people for different times. Loop stays on the item, because it is a property of how the
  slot plays (`src/model/shows.ts:72-76`).
- **Seconds, not frames.** Every rundown tool counts seconds, and an OGraf target has no frame rate
  to count in. `'clip'` is resolved to milliseconds at Take from `frames / fps`.
- **The published payload carries it**: `OutputCue.auto` and `OutputPlayoutCue.auto`, additive, so
  the hosted page arms a cue it takes. Each carries `next`, the cue after it, resolved at publish
  from the production's own interleaved order, because the payload splits the rundown into
  graphic cues and server cues and loses that order (`src/control/hostedControl.ts:315-343`).
  `OutputPayload.v` stays 1.
- **Packs and the exported controller** do not carry it in build 1 (§2.8, §2.9).

### 2.3 Where the deadline lives

*The anchor below is superseded by §0's 2026-10-02 ruling: the deadline counts from when the cue
airs (§0 has the fallback).*

**In the cue status row, and in its mirror.** The Take's marker gains an arm:

```ts
interface CueStatusMsg {
  t: 'cue';
  cue: string | null;
  /** ADDITIVE. The countdown this marker starts or reports. */
  auto?: CueArm;
  /** ADDITIVE. Set on the rows the arm RPC writes (§2.4), so a follower and the activity log can
   *  tell an arm change from a take. */
  arm?: 'hold' | 'resume' | 'cancel' | 'fire' | 'late';
  /** ADDITIVE. Present on a server cue's marker (§2.7): the slot it went to. */
  playout?: Slot;
}

interface CueArm {
  then: CueEnd;
  /** Milliseconds from this row's own server time to the end action (running), or the frozen
   *  remainder (held). */
  ms: number;
  /** The cue `next` will take, resolved at arm time. */
  next?: string;
  held?: true;
  /** Nothing fired it in time (§2.4); kept so every surface can say so. */
  missed?: true;
}
```

- **The deadline is derived, never invented**: `created_at + ms` of the row that started it, the
  match clock's rule. The mirror stores the same instant as `from` (epoch ms of the server's `now()`,
  which in the same transaction equals the row's `created_at`, `supabase/migrations/0008_hosted_control.sql:53`):
  `layers.<graphic> = { cue, at, auto: { then, ms, next?, from? } }`. `from` absent means held.
- **`next` is resolved when the cue is armed** and travels in the arm, so every surface agrees
  which cue will be taken and can mark it armed. The production page resolves it from its own
  rundown order at the Take; the hosted page takes the `next` its payload carries (§2.2), since it
  cannot see the interleaved order. Reordering after the Take does not change an armed next. The
  last cue in the rundown arms no next, and its editor says that `Next` has nothing to take.
- **Rejected: a new row kind** (`t: 'arm'`). The database whitelists seven kinds, every consumer
  switches on them, and an arm is a fact about a cue on a layer, which is exactly what the cue row
  already is. **Rejected: the deadline in page state**, which was the removed combined control's
  `after` and lost its tail on reload. **Rejected: an absolute deadline
  stamped by the client**, because two machines' clocks disagree and the match clock already
  learned that the row's server time is the one value every reader shares.

**The migration** (the next free number, following `supabase/AGENTS.md`, with a self-check block
that CALLS the functions as `0057` does):

1. `control_live_cue_set` takes the whole marker instead of its `cue`: it stores `auto` with `from`
   set to the server's `now()` for a running arm, without `from` for a held one, and nothing for a
   marker without `auto`. It routes a marker carrying `playout` into a sibling map,
   `playout.<item id> = { cue, at, slot, auto? }`, never into `layers` (§2.7). The format stays
   `v: 2`: both keys are additive and `readLiveCue` ignores them. A marker carrying `arm` is an arm
   change, not a take: the RPC edits the lane's `auto` in place and `at` keeps the Take's instant
   (the take mirror would re-stamp it, `supabase/migrations/0034_live_cue_layers.sql:50-52`).
2. `control_send_many` and `control_send` pass the whole marker. The insert-and-mirror body of
   `control_send_many` moves into one internal function both it and the new RPC call, so the two
   cannot drift the way `0056` drifted from `0034`. **That body starts with
   `select ... for update` on the production's row.** Today it inserts first and updates the row
   after (`supabase/migrations/0057_command_topic_keeps_live_cue.sql:57-76`), so a manual Out and a
   fire could both land; with the lock, whichever commits second sees the first, and the log's order
   is the commit order.
3. **`control_cue_arm(p_slug, p_lane, p_cue, p_op, p_items)`**, below.

### 2.4 Who fires, and exactly once

**Every open operator surface that can perform the whole end action runs the countdown, and the
database lets exactly one of them fire it.**

`control_cue_arm(p_slug text, p_lane jsonb, p_cue text, p_op text, p_items jsonb default '[]') returns jsonb`,
granted and checked like `control_send_many` (the same `feature_denied_for(..., 'control.hosted')`
refusal, `supabase/migrations/0057_command_topic_keeps_live_cue.sql:40-42`), where `p_lane` is
`{ "graphic": <name> }` or `{ "playout": <item id> }`. **Every marker it writes names its lane
the way a Take's marker does**: the graphic name as the row's `graphic`, or the item id with
`playout: <slot>` in the message, so a server lane's arm rows land in `playout` and never in
`layers`.

- It locks the production's row and reads the lane's mirror entry. If the lane no longer holds
  `p_cue` with an arm, it answers `{ ok: false, reason: 'gone' }`: somebody already fired, went
  manual, took something else or took it off.
- **`fire`** requires a running arm (`{ reason: 'held' }` on a held one, `{ reason: 'missed' }` on a
  missed one) and `now()` at or after the deadline (`{ reason: 'early', ms }` otherwise, and the
  caller waits `ms`) and no later than 5 s after it. Later than that it keeps the arm marked
  `missed`, writes one `{ t: 'cue', cue, auto: { ..., missed: true }, arm: 'late' }` row, and
  answers `{ reason: 'late' }`. In time, it clears the arm and inserts `{ t: 'cue', cue, arm: 'fire' }`
  followed by `p_items` (at most seven: Out is two items, a Take three, so Out and next is six in
  all), through the same insert-mirror-broadcast body as `control_send_many`, rate cap included.
- **`hold`**, **`resume`** and **`cancel`** do their arithmetic on the server's clock and write one
  marker each, so every follower sees the change: hold stores `ms = deadline - now()` with no
  `from` and writes `{ t: 'cue', cue, auto: { ..., ms, held: true }, arm: 'hold' }`; resume stamps
  `from = now()` and writes `{ ..., auto: { ..., ms }, arm: 'resume' }`; cancel removes the arm
  (running, held or missed) and writes `{ t: 'cue', cue, arm: 'cancel' }`. A hold on an arm whose
  deadline has passed answers `{ reason: 'due' }` and changes nothing: the fire is already racing,
  and the surface follows the log.

The surfaces:

- **The countdown is a `setTimeout` to the deadline** on the page, re-armed on every arm change and
  on `visibilitychange`. At zero the surface builds the end action's items with the same functions a
  manual press uses (`takeCueItems` and `clearCueItems`, `src/control/hostedControl.ts:919-933`),
  bound values included, and calls `fire`. `ok` means it fired; any other answer means another
  surface did, or it was held, missed or too late, and the surface just follows the log.
- **A fire travels both roads like a manual verb**: its items carry the minted ids and `fast` marks
  that `sendControlVerb` gives a press (`src/control/hostedControl.ts:791-846`), so the database
  broadcasts them. Unlike a press, the firing surface applies them to its own monitor only after
  `ok`, because a surface that lost the race must not move its picture, and the minted ids drop
  the echo as they do today.
- **The countdown runs on the server's clock, estimated.** Every live row a page receives gives
  `receivedAt - created_at`, which is the page's clock offset plus that row's latency; the page
  keeps the smallest value seen and schedules and paints against `deadline + offset`. A page whose
  clock is ten seconds slow therefore still fires on time instead of every action going Missed, and
  the `early` answer covers the rest. Before any row has arrived the offset is 0.
- **If the armed next cue no longer exists** on the firing surface (deleted after the Take), the
  surface fires the part it can (the Out of `Out and next`, or nothing but the arm row for `Next`),
  and the note line says the armed cue is gone.
- **Out and next onto the same layer** plays the exit and the next entrance back to back, which
  cuts the exit short; `Next` alone already replaces a cue on its own layer, and the editor says so
  when the armed cue shares the timed cue's graphic.
- **A surface attempts only an end action it can perform whole.** A graphic end action is log rows,
  so the production page and the hosted page can both fire it. An end action that includes a server
  cue needs the Bridge, so only a page whose Bridge answers `/health` attempts it (§2.7).
- **Unpublished**, the production page is the only surface. It runs the same state machine locally,
  from the same pure module, and fires through `runVerb`. Nothing leaves the machine, as today.

**Rejected: a server-side scheduler** (pg_cron or a scheduled function). It would fire with every
page closed, but it cannot reach the Bridge on the operator's machine, it does nothing for an
unpublished production, and it adds a moving part to every hosted instance. **Rejected: the
renderer fires**: there are several renderers per production, they cannot write to the log, and the
pages would disagree about what is on air. **Rejected: only the page that took the cue fires**: if
that page is a phone that went to sleep, nothing fires, and the fallback for "somebody else fires"
is the race the RPC removes. **Rejected: firing late.** A take 40 seconds late, after a crashed
laptop comes back, is more likely wrong than right; `Missed` puts the choice back with the operator.

**The known limits, stated.** A hidden browser window throttles its timers (Chrome's intensive
throttling after five minutes hidden). A countdown in such a window fires late, and past 5 s it
becomes Missed, which is safe and visible. A foreground surface fires on time, within the latency
of the smallest-latency row it has seen. **Rejected: a Worker timer**, because whether it keeps
time in a hidden window is itself browser-dependent and the Missed state already makes the case
safe. **Rejected: the match clock's plain local clock**, which is fine for a number on screen but
here would turn every action into Missed on a slow machine. **Rejected: an early tolerance**
(accepting a fire slightly before the deadline to save a round trip), because on a clip-end Out
it trims the clip's tail.

### 2.5 Hold, resume, manual

- **Hold freezes the countdown; resume continues from the frozen remainder.** Manual drops the auto
  action for this airing. A held arm never fires.
- **A countdown at clip end cannot be held apart from its clip**, because the clip keeps playing.
  On a page with a Bridge, its chip offers **Pause** instead of Hold, and H does the same when it is
  the chip's countdown: the clip's Pause verb, then `hold`; Resume is the clip's Resume, then
  `resume`. The ordinary Pause and Resume buttons of a clip with a clip-end arm do the same, so a
  paused clip is never taken off at the moment it would have ended. On a page without a Bridge (the
  hosted page) such a chip offers **Manual** only, and H there says "Pause needs NoaCG Bridge".
  **Rejected: Hold on a clip-end arm alone**, which would leave the clip running to its end with
  the end action frozen.
- **Manual has no key**, because it is final and rarer than Hold, and each key is one intention
  (`src/components/playoutKeys.ts:56-58`). **Rejected: Shift+H**, a chord an operator under
  pressure mistypes into H.
- **The 5 s late limit** is one constant in the module and in the RPC. It is long enough for a
  reload on venue wifi and short enough that nothing airs noticeably out of turn.

### 2.6 Reload and recovery

- **Published**: the page reads `live_cue` as it does today; a new `readLiveArms` beside
  `readLiveCue` returns each lane's arm. A running arm resumes its countdown from `from + ms`. If
  the deadline passed while the page was away and is less than 5 s old, the page calls `fire` like
  any other surface, and the RPC guarantees it happens once. Older than that, the RPC answers
  `late`, the arm stays in the mirror marked `missed`, and every surface, this one included, shows
  Missed until the operator acts.
- **A recovery never fires an action twice**: an arm is cleared in the same transaction that
  inserts its action, so a second caller, a replay or a reload finds it `gone`.
- **Unpublished**: a reload already forgets what was on air, and it forgets the countdown with it.
  Nothing changes there.

### 2.7 What a second operator sees

The hosted control page (`?control=<slug>`) and a second production page follow the same log, so
they show the same countdown, the same armed next cue and the same Held or Missed state, and they
can hold, resume or go manual from a phone: those are log-only operations (a clip-end countdown
offers Manual only there, §2.5). They fire graphic end
actions like any surface.

**Server cues get their on-air marker in the log.** The VERB still goes only through the Bridge,
as `docs/BRIDGE.md` §5 says; after the Bridge accepts a Take, the page writes the status marker
`{ t: 'cue', cue, playout: <slot>, auto? }` under the item id, and after an accepted Out,
`{ t: 'cue', cue: null, playout: <slot> }`. The mirror keeps them in the `playout` map, apart from
the graphics' `layers`, so no consumer of `layers` ever meets a lane that is not a graphic. **The
log followers route them the same way**: today both pages apply every cue row to the graphic map
by its `graphic` (`src/components/home/ProductionPage.tsx:713`,
`src/components/HostedControlPage.tsx:262`), so a row carrying `playout` goes to the server-cue map
(`livePlayout`, `src/components/home/ProductionPage.tsx:376`) and never through `withLiveCue`.
**Keyed by the item id**, because the page's server-cue state is already keyed that way and one
item is one slot. **Rejected: keyed by the slot address**, which moves when the operator changes a
cue's channel. **Rejected: keyed by the cue**, since two cues of one item replace each other on
one slot. The
slot is the protocol's own `Slot` object, stored whole, so an OGraf slot
(`{ adapter: 'ograf', rendererId, renderTarget }`) needs nothing new. This is what lets a timed
clip's deadline live in the log at all, and it also fixes two gaps found above: a reload now knows
which server cues are up and where they went, so Out after a reload goes to the right slot, and the
hosted page can show a server cue as ON AIR (still not takeable there).

For a fire that involves a server cue, the order is CAS first, Bridge second, marker third: the
surface wins `fire` (which writes the timed lane's rows), then sends the Bridge action, then writes
the server cue's marker as a manual Take would. If the Bridge refuses, nothing is marked on air
that is not, and the firing surface's note line says which hop refused. The other surfaces see the
arm cleared and the ON AIR marks unchanged, which is the truth: the log words a `fire` row as
"auto Out sent", never "went out", because on-air is what the markers say. **Rejected: Bridge
first**, because two surfaces would both send the PLAY before either knew the other had.

**Rollout.** A page opened before the build words every cue row with a cue id as "Took"
(`src/control/eventLog.ts:53-55`), so until it reloads its activity log shows each hold or fire as
a take. It is an old tab's log, not its air; the as-run fold of item 9 skips `arm` rows.

**End actions hold for any adapter.** `Out` is the adapter's own `out` verb and `Next` is its
`take`; build 1 adds no verb and no protocol field, so `PLAYOUT_V` stays 2 and the OGraf adapter
row needs nothing from this plan. A native clip end is an adapter capability in build 2 (§3.4).

### 2.8 Surfaces, keys and the cue editor

- **The production page and the hosted control page** get the countdown on the live row, the armed
  mark, the PROGRAM chip and H. `usePlayoutVerbKeys` gains `h: 'hold'` for both
  (`src/components/playoutKeys.ts:43-68`).
- **H acts on the chip's countdown**: the running arm that fires soonest, or when none is running,
  the most recently held one. Every other verb acts on the selected cue's layer; H does not, because
  the operator has usually moved the selection to the next cue by the time they want to stop the
  current one. Every row's own chip holds that row's countdown with the mouse.
- **The cue editor** is the production page's own (`src/components/home/ProductionPage.tsx:2926`
  for a graphic cue, `:3156` for a server cue, where the Loop box sits at `:3214`). Build 1 changes
  nothing in `src/App.tsx`, `HomePage.tsx`, `GraphicControlPage.tsx` or `CreationWizard.tsx`.
- **The exported controller does not run auto actions in build 1**, and says so in one line under
  its rundown, as it did for the since-removed combined controls. Its
  wire is a bundled local relay with no durable log to anchor a deadline in, and a second timer
  engine in vanilla JS is the thing that ruling declined. The builder adds this to that paragraph.

### 2.9 Files, phases, and what is not touched

**One new pure module, `src/control/cueAuto.ts`**, holds every rule once: resolving `CueAuto` to
milliseconds (`'clip'` from frames and fps), the next cue at arm time, a row's effect on a lane's arm
(the `clockRowEffect` shape), remaining time at `now`, the chip's choice, and the 5 s limit. Both
pages and the unpublished engine use it, and a unit test drives it offline.

Three phases, committed in order; phases 1 and 2 land together, phase 3 lands on its own:

1. **Model, module, unpublished engine.** `CueAuto` and `mediaKind` on the record, `auto` on the
   payload, the editor row, the rundown words, the countdown, H, Hold and Manual, all running
   locally on an unpublished production, graphic cues and server cues alike.
2. **The wire.** The migration, `readLiveArms`, the RPC calls on both pages, the hosted page's
   countdown, and recovery. Landing it with phase 1 means no build ever offers a timed cue that
   does nothing once published.
3. **Server cue markers** in the log (§2.7), on both pages. **Until it lands**, a server cue's Ends
   row on a PUBLISHED production is disabled with the sentence "Timed server cues on a published
   production arrive with the next update", because its deadline would have nowhere to live but
   the page. Unpublished, server cues time as in phase 1.

Not touched: the renderer (`src/output/`), which ignores cue rows; the Bridge and its protocol; the
pack format (`setShowCues` keeps building cues without `auto`, `src/model/shows.ts:659-685`); the
four files named in §2.8.

### 2.10 The specs that prove it

- **`e2e/rundown-timing.spec.ts`** (offline, Playwright's `page.clock`, the fake Bridge of
  `e2e/playout-cues.spec.ts`): a cue timed `4 s → Out and next` is taken; the row counts down and
  the next cue is marked armed; at zero the layer goes off and the next cue is on air, and the log
  reads "auto Out sent"; H at 2 s freezes the count, 10 s pass with nothing fired, H again resumes and it
  fires 2 s later; Manual leaves the cue on air for good; a server clip timed `At clip end` sends
  exactly one `out` action to the fake Bridge at its length; the selection has not moved.
- **`e2e/configured/rundown-timing-recovery.spec.ts`** (the configured suite, a real backend): a
  published production takes a timed cue; a second page on the hosted control URL shows the same
  count within a second; the production page reloads mid-countdown and resumes the same count;
  at zero, with both pages open to race, the log read back through `hostedControlTail` holds
  exactly one `fire` row, one `stop` for the timed graphic and one `play` for the next, and the
  renderer's `data-plays` for the next graphic moved by exactly one (the arithmetic
  `e2e/configured/playout-both-roads.spec.ts` uses; `data-plays` counts entrances only, so the Out
  is counted in the log); a hold pressed on the hosted page freezes the count on the production
  page; a reload after a missed deadline still reads Missed.
- **The migration's self-check block**: arm, fire, fire again (`gone`), early (`early` with the
  wait), late (`late`, and the arm kept as `missed`), fire on a held arm (`held`), hold then resume
  (the remainder carried, `at` unchanged), cancel of a missed arm, a manual Out then a fire
  (`gone`), and a playout marker and a playout lane's hold landing in `playout`, not in `layers`.
- **Unit tests for `cueAuto.ts`**: every row kind's effect, the chip's choice, `'clip'` arithmetic,
  and the last-cue case.

### 2.11 Every build-1 choice and what it rejected

| Choice | Rejected | Why |
|---|---|---|
| `auto` on the cue | on the graphic or the item | two cues of one graphic air different people for different times |
| seconds, `'clip'` for clip length | frames | rundown tools count seconds; an OGraf target has no frame rate |
| three end actions: out, next, out and next | a free list of actions | these are the three the backlog item names and the competitors ship; linked actions are item 10 |
| `Show.version` stays 2, payload `v` stays 1, `live_cue` `v` stays 2 | a version bump | every change is an additive optional field |
| the arm rides the cue status row | a new row kind | the database whitelists seven kinds, and an arm is a fact about a cue on a layer |
| deadline = the row's server time + ms | a deadline stamped by the client, or kept in the page | the match clock's rule; the page's copy dies on reload |
| `next` resolved at arm time, and at publish for the hosted page | resolved at fire time | every surface agrees on the armed cue; the payload has lost the interleaved order |
| `mediaKind` recorded in build 1 | wait for build 2 | a still reports a length on 2.3.2 and would get a 40 ms clip end |
| every capable surface counts down, one RPC fires | a server scheduler, the renderer, only the taking page | the RPC is exactly-once by construction; the others miss the Bridge, write nothing, or stop when a phone sleeps |
| the send body locks the production's row first | insert first, update after, as today | a manual Out and a fire could both land |
| a fire applies locally only after `ok` | apply before the round trip, as a press does | a surface that lost the race must not move its picture |
| fire at or after the deadline | accept slightly early | an early clip-end Out trims the clip |
| countdown against an estimated server clock | the plain local clock | a slow machine would miss every action |
| no late fire after 5 s; the arm stays as Missed | fire however late, or drop the arm silently | a late take is more often wrong; Missed must survive a reload |
| Hold freezes and resumes; Manual drops | one "stop" that cannot resume | a presenter running long needs the remainder back |
| a clip-end arm holds by pausing its clip | Hold on the arm alone | the clip would play to its end with the action frozen |
| H acts on the soonest countdown | H acts on the selected cue's layer | the selection has usually moved on by then |
| Manual has no key | Shift+H | final and rarer; a chord is mistyped under pressure |
| an auto action never moves the selection | the selection follows the air | an operator may be editing the next cue |
| server cue markers in the log, verbs through the Bridge | server cues kept out of the log | a clip's deadline could not live in the log, and a reload could not find a clip's slot |
| server lanes keyed by item id | by slot address or by cue | a slot moves with the channel pick; two cues of one item share one slot |
| fire, then Bridge, then marker | Bridge first | two surfaces would both play the clip |
| phases 1 and 2 land together | each alone | a timed cue must never do nothing once published |
| main-thread `setTimeout` | a Worker timer | browser-dependent in a hidden window; Missed already covers it |
| the exported controller shows no auto actions | a third implementation in vanilla JS | no durable log there; the combined-control ruling set the precedent |

---

## 3. Build 2: clip and audio playback - decided 2026-09-27, built 2026-09-28

**Replaced by [`CLIP_PLAYBACK_PLAN.md`](CLIP_PLAYBACK_PLAN.md)**, planned with the owner on
2026-09-27 and revised after an independent review of the plan against the code and the CasparCG
2.5.0 source. The build-2 section that stood here was its input; git keeps it. In short:

- **Why.** Clips are the named blocker: "one reason I can't use it in my productions". Outcome 5's
  basic-media criterion asks for clips and audio from the rundown with volume, loop and the other
  attributes a production needs.
- **Goal.** One operator runs graphics, clips and audio from one rundown on a 1920×1080 screen (and
  still at 1366×768), with each clip's ending, fades, level and sequence carried out by the server,
  and a countdown the operator can trust.
- **Non-goals.** No video through the web; no timer in the page that fires or queues a clip; no live
  level changes on air yet; no same-frame promise for separate video and audio files; no mixer,
  routing or recording items; no new features on the phone surfaces, which keep working.
- **Key decisions.** A clip's settings open in the panel left of the rundown: **At the end** (Hold
  last frame by default, Clear, Loop, Play next, which looks past graphics to the next clip on the
  same slot), **Fade** in and out, **Level** in dB, trim under Advanced. Audio files get their own
  kind and layer. **Folders** play one by one, through, or all together. The **clip clock** beside
  PROGRAM shows one number, and TO STUDIO when clips follow automatically, read from the server's
  `INFO`. The rundown is resizable and one line per row. Sequences are run by NoaCG Bridge, not the
  page. The phone Control page may differ from the desktop dashboard (a superseding rule of
  2026-09-27).
- **Phases.** 0 safety net and the page split; 1 layout for everyone; 2 the clock and the server's
  truth; 3 clip settings and sequences; 4 folders. Then build 1's timed cues for graphics.
- **Acceptance, observable on a CasparCG server:** `CLIP_PLAYBACK_PLAN.md` §11, with the ten
  measurements the real server must answer first in its §12.

**What this changes in build 1 (§2):** its `At clip end` choice is dropped, because a clip's end now
belongs to the clip and its folder (`CLIP_PLAYBACK_PLAN.md` §6.6). Build 1 keeps timed cues for
graphics and comes after build 2. Item 8 below (audio cues) is covered for CasparCG by build 2, and
item 10 (linked cues) partly by an All-together folder.

---

## 4. The rest of rundown automation

**5. Back-timing to a hard out.** *What:* with durations on cues, the rundown shows the time
remaining to the end against a target end time, over or under. *Who:* Rundown Studio, Ontime, Cuez
(`docs/LANDSCAPE.md:211`). *Size:* small once build 1 exists: a target end time on the show and one
line under the rundown. *For:* a TV station. A NoaCG rundown lists graphics, and eight seconds of
lower third says nothing about whether a 30-minute show ends on time; back-timing means something
only once the rundown holds the show's segments, which it does not. **Recommendation: not now.**
Revisit if the rundown ever carries segment rows.

**6. A running order from a spreadsheet into cues.** *What:* pick a graphic, import a sheet, get one
cue per row, with columns matched to fields by title (the rule the Data workspace already uses) and
an optional `Duration` column filling build 1's `auto`. *Who:* Ontime, Rundown Studio, Stagetimer,
Sofie (`docs/LANDSCAPE.md:212`). *Today:* `parseTableFile` reads CSV, TSV and JSON
(`src/model/csv.ts:199`) and lands the rows in a dataset, from which a cue loads one row at a time.
*Size:* small, a day or two: the parser and the field match exist. *For:* your productions, where
twenty guests means twenty lower-third cues typed by hand. **Recommendation: build next, after
build 2.**

**7. A Bitfocus Companion module.** *What:* a Companion module so a Stream Deck shows what is on air
and the countdown on its keys, and takes, outs and holds from a second machine. *Who:* Companion
itself (814 connections, free), H2R, uno (`docs/LANDSCAPE.md:218`). *Today:* keyboard emulation only,
which needs the window focused and the playout column on screen
(`src/components/playoutKeys.ts:73-89`), and gives the deck no feedback. *Size:* weeks: a module in
Bitfocus's own repository and review process, and before it a documented, versioned control API,
because the hosted RPCs are internal today. *For:* both. **Recommendation: later**, after build 2
and item 6, starting with the API document.

**8. Audio cues.** *What:* a stinger or a music bed fired from the rundown. *Who:* CasparCG, OBS,
vMix, H2R, Ontime (`docs/LANDSCAPE.md:214`). *Today:* a CasparCG server's audio files are listed and
can be cued, but land on the clip layer. *Size and recommendation:* the CasparCG half is in build 2
(§3.1). A sound played by the browser output itself, for a production with no CasparCG, is a
separate and larger item (the output page would carry audio into OBS or vMix): **later**, and only
if a production of yours runs without CasparCG and needs sound.

**9. An as-run log.** *What:* what aired, when and for how long, as a file. *Who:* every cloud
platform, sold to sponsors and rights holders (`docs/LANDSCAPE.md:225`). *Today:* the command log
has every fact, and publishing prunes rows older than seven days
(`supabase/migrations/0029_cloud_playout.sql:181`). After build 1 and its server cue markers, the
cue rows alone give on and off times for graphics and clips. *Size:* small: fold the cue rows into
intervals and download them as CSV from the Activity panel, with no change to retention. *For:* a TV
station or a sponsored production, rarely a school show. **Recommendation: later**, as that CSV;
keeping the log longer is a separate cost decision.

**10. Linked cues.** *What:* one Take fires a graphic and a clip together, a sting and a lower third.
*Who:* Pixla, Cuez, CasparCG Client groups. *Today:* a folder's **All together** airs several cues
on one press (`docs/PLAYOUT_DASHBOARD.md` §2i), and build 1's `Next` with a short duration also
chains two cues. Combined controls, which this paragraph first named as the host, were removed on
2026-10-02 (owner ruling: keep playout simple; none was in use). *Size:* small: let a folder carry
a server cue beside a graphic cue, on the production page, the one surface with the Bridge. *For:*
your productions. **Recommendation: later**, when a show of yours needs it, and as an extension of
folders, never a second "link" concept beside them.

**11. Switcher automation (ATEM).** *What:* the rundown also cuts the vision mixer or fires its DSK.
*Who:* Pixla, Cuez, Sofie, Rundown Creator Pro (`docs/LANDSCAPE.md:219`, verdict "gap-wrong").
*Does OGraf change it?* No. The OGraf Server API drives graphics renderers
(`docs/backlog/bridge-ograf-adapter.md`); it has no switcher in it, and being an OGraf client makes
NoaCG a better graphics source, not a switcher controller. *Size:* weeks per switcher family.
*For:* a TV station. **Recommendation: no.** Companion (item 7) already speaks to ATEM, so a
Stream Deck key can fire a NoaCG Take and the switcher's DSK in one press without NoaCG owning the
switcher.

**Left out, named.** MOS or newsroom ingest, and Sofie-style timelines across several devices, are
TV-station systems (`docs/LANDSCAPE.md:222`). Nothing here builds toward them or against them.
