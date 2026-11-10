# The Control Layer (Phase 5)

> **Cloud playout builds ON this layer**: the persistent browser-output URL, the cue rundown,
> and the production surfaces are a thin consumer of the same log and RPCs — see
> **`docs/CLOUD_PLAYOUT.md`** (migration 0029) before extending anything here.

How operators drive graphics. Control pages are GENERATED FROM THE STATE MACHINE
(docs/STATE_MACHINE_SCHEMA.md): every operator-triggered transition becomes a button, every
data field an input — per template, from one generator, with no per-template code. This doc
is the binding contract for `src/control/`, the show model, and the hosted-control schema
(supabase/migrations/0008_hosted_control.sql).

> **What "no per-template code" means, and what it must never be read as** (owner, 2026-09-03,
> guarding against exactly this misreading):
>
> > "no per-graphic panel code" ... means we should not hand-build a separate UI for every
> > graphic. I do **not** mean that every graphic must fit into a small predetermined set of
> > controls. The graphic can declare its own capabilities and logic as richly as needed.
>
> So there is **no fixed universal control vocabulary**. A graphic is the source of truth for its
> own control surface and declares whatever it needs — text, numbers, scores, lists, toggles,
> clocks, actions, states, buttons, many at once — and the generator renders whatever was
> declared. The rule bans a bespoke hand-built panel per graphic. It does not bound what a graphic
> may expose, and a session that reaches for "the vocabulary does not have a control for this" has
> read this line backwards: the answer is to let the graphic declare it.

## Where playout behaviour comes from (and where it does not)

A template's playout behaviour travels INSIDE the template, and nowhere else:

- **Fields → inputs.** `SpxField.ftype` picks each control (`fieldDescriptors`); a `number`
  is steppers, a `textarea` is the rows editor, a `filelist` an image picker.
- **Machine → buttons.** Specialized behaviour is a MACHINE SHAPE compiled into `NOACG_ANIM`
  at create time (a GraphicType's branches, parallel groups, timers and `controls` —
  docs/GRAPHIC_TYPES.md): score flags, quiz select/lock/judge, clock pause/resume, ticker
  skip, poll close/call are all `machine.controls` entries plus arrows, never per-template
  playout code. A template with NO explicit machine gets the derived linear machine: all its
  fields, the lifecycle verbs, no ⚡ events — which is the correct, honest control surface
  for every plain field-driven graphic.
- **What NEVER selects behaviour: any category.** The browse taxonomy (graphic categories
  and their groups, `src/model/taxonomy.ts`) and the `AssemblerId` routing id are invisible
  to this layer — `graphicKindLabel` prints a word next to a cue and that is the whole
  footprint. Catalog, imported and AI-generated templates therefore get identical treatment:
  whatever their code declares is what every surface renders. Keep it that way — a switch on
  a category id in `src/control/` or the production surfaces would fork catalog templates
  from imported/AI ones, which is the divergence this design exists to prevent.
- **The same shapes from an OGraf manifest.** `src/control/ografContract.ts` is the adapter
  the other way round: any OGraf v1 manifest (a NoaCG export or a stranger's package) yields
  `FieldDescriptor[]` from its `schema`, `ControlButton[]` from its `customActions` and a
  `steps` summary from `stepCount` - the SAME types the generator produces, so every consumer
  renders it unchanged. A JSON-schema type is a 3-way collapse, so the control kind comes from
  the standard's GDD type (`gddType`, falling back down its prefix), then from the `v_noacg.kind`
  hint older exports carry; honest about what OGraf cannot say: it has no state graph, so every
  button is live. `e2e/ograf-contract.spec.ts` pins it on a
  hand-written third-party graphic (docs/AGENT_CLI.md).

## The one generator, three surfaces

- **`control/controlModel.ts`** is the vocabulary: `fieldDescriptors` (SPX fields → the shared
  `FieldDescriptor`s), `eventButtons` (the machine's buttons via `blocks/animMachine.ts
  machineControls`), `eventLegality` (event → group → the states it fires from — the
  structural guard, precomputed), the `ControlMessage` protocol, and the OVERFLOW WARNING's
  words (`overflowNote`, `OVERFLOW_FIELD_MARK`, `OVERFLOW_FIELD_HINT` — a value the graphic
  could not make fit, said the same way on every surface where a value is typed;
  docs/SVG_IMPORT_PLAN.md §3 for the ruling behind it, docs/CONTROL_PANEL_PARITY.md §4 for the
  surface-by-surface state). A graphic reports it through `noacgTextOverflow()` and it rides the
  MACHINE-STATE answer rather than a channel of its own: every surface already polls for state,
  so this costs one field on a message that was already in flight.
- Three surfaces render that vocabulary and must stay in step:
  1. the in-app **Control tab** (`components/ControlPanel.tsx`, React),
  2. the standalone **`controlpanel.html`** (`control/controlPanelHtml.ts`, vanilla JS —
     the one deliberate second renderer, show-shaped: one card per graphic),
  3. the **production page** (`components/home/ProductionPage.tsx`), the one operator surface
     since the hosted control page was retired (docs/work-specs/retire-hosted-control/spec.md);
     an old `?control=<slug>` link only forwards to it (`components/OldControlLink.tsx`).
- The simulator's event strip is the FOURTH renderer of the same vocabulary: the same
  `machineControls` merge for its labels and the same `isEventLegal` for its greying. It owns
  the preview iframe, so it runs the one poll of `noacgMachineState()` and publishes the
  pointers to `templateStore.machineGroups`, which is where the in-app Control tab reads them.
- The FIFTH renderer is the exported **PRODUCTION CONTROLLER**
  (`control/productionControllerHtml.ts`, vanilla JS — the launcher's landing page in a
  local-control package): the cue rundown + the shared verbs + PREVIEW/PROGRAM monitors, its
  per-graphic modules built from the SAME `emitGraphic` the standalone panel uses. Its wire is
  the **LOCAL RELAY** (`export/local-relay/`, protocol v1 — the local counterpart of the
  hosted log: ordered rows, a `stream` field for preview vs program, persisted to
  relay-log.jsonl), received by `control/localReceiver.ts` in every exported overlay graphic
  and conformance-tested by `npm run test:local-relay`. "→ Preview" and "⟳ Take" are the same
  command list one `stream` apart; `{t:'cue'}` meta rows carry the per-stream tally, and
  receivers ignore them exactly as they ignore the hosted log's status rows.

## Buttons come from the machine

- `machine.controls` (blocks/animData.ts `MachineControl`) is ADDITIVE OPTIONAL metadata
  INSIDE `NOACG_ANIM`: label, section, order, `payload` (field ids whose current values ride
  the event), `adjust` (field ids whose current value MOVED by a delta rides the event - a
  goal's `{f1: 1}`), `set` (field ids the press puts to a declared figure - a reset's
  `{f1: '0'}`), `add` (list field ids the press appends the named source field's value to as a
  line - a puzzle's `{f2: 'f3'}`, Reveal letter adding the Guess box to the revealed letters),
  `remove` (its inverse: the last line equal to the source comes out), `destructive`. It travels
  in the template, so the exported panels and the production page keep their labels with no registry to ask.
  Graphic types declare it as `TypeControlEvent` (logical keys); `compileControls` resolves them
  to `fN` ids at attach, and refuses an `add` or `remove` on anything but a `lines` field.
- **The four moving members are one family, and one road per field.** `payload` rides a field
  as it reads; `adjust` moves a figure; `set` writes a constant; `add` and `remove` move a LIST by
  one line (2026-09-06, the list twin of `adjust` three game-show graphics asked for). A field
  key appears in at most one of them on a press; an `add` or `remove` source is only read, so it
  may ride elsewhere too. `movedKeys` names what a press moved, `sourceKeys` what it read, and
  `adjustWords` words all four for the button hints, so a surface that grows a fifth member has
  one place to add it.
- **An `adjust` is a payload the SURFACE computes** (`controlModel.ts eventPayload` - the one
  rule, inlined verbatim in `controlPanelHtml.ts`): `current + delta` rides as an ordinary
  payload value, so the figure lands exactly when the machine accepts the event and not
  otherwise, the log holds the ABSOLUTE value for recovery, and the runtime needs nothing new
  (a template-side counter would bump on a snap, and could not keep the operator's field box
  or the cue in step). Every surface then writes the new figure back into its own field
  state - the cue draft, the shared staging buffer, the sample data, the panel's box - the way
  its ± stepper does, or the next press would move from the stale value; the production page
  also folds an event's payload into `airedData` so "what air shows" is what a goal counts
  from. The scoreboard type's `goalA`/`goalB` are the first users (owner, 2026-08-23: "no
  reason to play the goal animation if the number doesn't change"); the ± steppers stay the
  correction road, so an adjusted field is NOT excluded from the live-numbers block the way a
  payload field is.
- Every authored operator event gets a button even undeclared (label = the event name).
  An undeclared `next` is skipped — the lifecycle » Next already fires it. A declared entry
  whose event no arrow carries is dropped and `validateMachine` warns; a payload key no
  field has warns in `validateTemplate`.
- Legality is the structural guard mirrored as greying: while a surface knows the graphic's
  state it disables buttons the machine would drop; before it knows, everything is enabled
  and the runtime guard decides. `eventLegality(js)` precomputes the table and
  `isEventLegal(table, event, state)` asks it — every React surface calls THAT one, so a
  press refused in the editor is refused identically on the production page. The editor's strip
  was the last surface that only pretended: it took every press and dropped the illegal ones
  silently, which reads as a broken button rather than an impossible one. Never invent a
  third "legal events" implementation — editor-side is `operatorEvents`/`eventLegality`,
  runtime-side is the interpreter, and `controlPanelHtml.ts` inlines the same rule because it
  ships without React.

## The protocol

`ControlMessage` = `update | play | stop | next | event | snap | hello`; replies
(`ControlReply`) = `state` (after every handled message, and on timer advances via a 1 s
watcher) and `graphic-online` (once at boot). Four receivers forward commands to the
template globals (`update/play/stop/next` + `noacgDispatch`/`noacgSnap`) and must stay in
agreement: `receiverScript.ts` (BroadcastChannel), `realtimeControl.ts` (Realtime Broadcast,
send-only panel path), `hostedReceiver.ts` (the durable log path), and `localReceiver.ts`
(the local relay — the production controller's wire, above). An event's payload is
applied only if the machine accepts the event — that is the atomic multi-part change.

## The operator verbs (the one glossary)

The canonical meanings, worded here ONCE (docs/GOALS_ARCHIVE.md "Student release" step 6); every
surface's button hints - the production page and the exported panels - say the same thing, and rehearsal applies the identical command lists locally:

- **⟳ Take** - air the selected cue on its layer: its values + play, sent as ONE atomic
  batch. Other layers stay up (every pool graphic holds its own on-air cue).
- **✎ Update** - push the cue's edited values to the LIVE graphic without re-animating it.
- **» Next** - advance the live graphic to its next step (its reveal).
- **« Back** - the live graphic one step back, instantly: the step before the current one on the
  route a snap replays (the previous waypoint on the walk). The on-air cue's values ride with it.
- **⟲ Reset** - the live graphic back to its first step, instantly and still on air, with the
  on-air cue's values.
- **■ Out** - play the selected cue's layer off air; the other layers stay up.
- **■■ All out** - play every live layer off; clear the frame.
- **Load** (the retired hosted control page, 2026-11) - staged the cue's values into its
  graphic's fields for every open operator page; nothing aired until a take.
- **▶ Play / ■ Stop** (single-graphic surfaces) - take the values and run the entrance /
  animate the graphic off.

Editing is always a DRAFT: the production page's cue editor keeps the edit on the page, and
nothing reaches air because it was typed.

## Prepared vs published, and the event log

- **Nothing airs merely because it was typed.** With Live off, edits are STAGED (badge) and
  air on an explicit ⟳ Take, or ride an event's payload (which un-stages exactly the fields
  it airs).
- The standalone panel keeps a per-channel EVENT LOG in localStorage (`noacg-log-<channel>`):
  a capped timestamped history of sent commands + the merged latest data + the last reported
  state. Recovery is both halves of reset, in order: the data half (update), then the visual
  half (snap — timers arm). A rebooted graphic announces `graphic-online` and is rebuilt; a
  reloaded panel seeds fields/chip/legality from the log.
- An accepted event's payload merges into the log's latest data — recovery must replay it.
- **A MATCH CLOCK is written into that log by the panel itself**, because it is the one value
  that keeps moving with nobody commanding it: a log of what was SENT would rebuild a clock at
  the value the last Take carried. A clock verb therefore writes the clock field around its own
  event — the time origin before a start, the banked time after a hold or a reset — so the log's
  latest data holds `"10:00@1787257289761"` and the rebuild lands on the real match time
  (`control/matchClockPageJs.ts`, `docs/SPORTS_PACK.md` for the per-plane truth).

## Shows (the rundown level)

`model/shows.ts` — an ORDERED set of graphics that run together, one card each on its own
channel (`spx-control-<slug>`), packet-store conventions (localStorage, `updatedAt` LWW,
tombstones), sync kind `'show'`. The single-graphic case is a show of one — the standalone
panel is built by the same `renderPanelPage`. `export/showExport.ts buildShowZip` packages a
Starter folder per graphic + one `show_controlpanel.html`. Since 2026-08-05 no exported graphic
carries the hosted receiver (`stripHostedReceiver`); only packages exported 2026-07-21 to
2026-08-05 still carry their own copy, which since migration 0066 rebuilds from the log tail on
reconnect and no longer receives commands live (CLOUD_PLAYOUT.md, known limits).

`Show.profile` (`model/profile.ts`, docs/CONTROL_PANEL_ANY_GRAPHIC.md §6) is the production's
CONTROL PROFILE - how this production presents the controls its graphics already declare, additive
optional beside `bindings`. It is ARRANGE: order, section, shown name, hidden and pinned, per pool
graphic per control id. Its second primitive, COMBINE (named controls made of ordered steps), was
removed on 2026-10-02 by the owner's ruling; a stored `combine` list is read without error and
ignored. A profile may never invent an event or change what a press does; the reader drops any
arrangement key it does not know. It is pinned at publish on `control_shows.profile` (migration
0058, jsonb, default `'{}'`), so a production published by an older build reads as no profile. The
profile carries its own `v` inside itself, so adding it never bumped `Show.version`, and
`readShowProfile` degrades a version this build does not know to READ-ONLY rather than erasing it.
Deleting it is one action (`deleteShowProfile`) and restores the generated panel everywhere.

## Hosted control (migration 0008)

- **The INSERT is the send.** `control_events` is the append-only command log (DB-ordered);
  Realtime Postgres Changes deliver rows; a (re)joining side fills its gap from
  `control_tail`. There is no second command path.
- `control_shows` (id = the local Show.id) carries the capability `slug`, the `panel` spec
  (name/fields/js/image paths/entries per graphic — never full templates), the shared `staged`
  buffer, and `live` — each graphic's own report of applied data + machine state.
- **Entries are published, not authored.** The panel spec carries each
  graphic's saved `ControlEntry` rows (docs/SAVED_CONTENT_MODEL.md §4), read out of the
  library at publish time; the hosted control page (retired 2026-11) rendered them as a
  read-only switcher that loaded an entry's values into the shared staging buffer, airing only
  on an explicit take. Editing entries stays in the app (`#/control/<id>`), one
  re-publish away from air. The library record is found by `SavedGraphic.graphicId` (recorded
  when the graphic is added to the show), falling back to a unique library name for copies
  added before that link existed; an ambiguous name publishes no entries rather than guessing.
  `panel` is jsonb with no version of its own, so a row published by an older build simply
  carries no entries and is normalized to `[]` on read.
- **A page's own edits counted on that page at once** on the hosted control page (retired
  2026-11), which staged field edits in the shared buffer and laid its own unconfirmed ones over
  it. The production page airs its own draft on Take, so the shared buffer is not on its path.
- **Capability model:** owning/publishing requires sign-in (RLS); OPERATING needs only the
  slug, through SECURITY DEFINER RPCs (`control_show_by_slug`, `control_send`,
  `control_stage`, `control_report`, `control_tail`). Revoke = unpublish or rotate.
  That is the server's posture; the one operator surface, the production page, needs sign-in.
  `control_events` is readable only by the production's owner and team (migration 0066); a
  slug holder reads the log through `control_tail` and follows it on the private
  `log-<show id>` topic (0064).
- **Recovery is self-service:** the hosted receiver reboots by reading its own last report
  (data, then snap), then follows the log. The production page rebuilds what is on air from the resolve and the log when it opens. Live
  reports ride the log as meta rows (`t:'live'`) so every open page follows without polling; they
  are never applied as graphic commands. `t:'staged'` rows were the retired hosted control page's
  shared edits; nothing writes them now.
- **On the hosted half an RPC either ANSWERED — possibly with nothing — or FAILED, and the two
  never collapse into one value** (`hostedReceiver.ts`; `untilAnswered` in `hostedControl.ts`,
  which `output/main.ts` boots through). "No such production" and "the request never arrived"
  are indistinguishable as a null, and both used to be read as the first. One dropped
  `control_show_by_slug` left a hosted graphic dead for a whole show — no show id, no
  subscription, and nothing that would ever ask again — and the renderer painted its wrong-URL
  card over a live airing. So the boot resolve retries for good, backing off to a 10 s ceiling:
  neither surface has anything to degrade to, and nobody is watching a browser source to reload
  it. Only an ANSWER of no row is obeyed, because that is what a revoked capability says. The
  renderer's catch-up read retries a few times and then stands down — it has the report baseline
  to stand on, and the follow's own refill re-reads the gap. `control_report` deliberately does
  NOT retry: a report is a snapshot of a moment, and a late one landing over a newer one would
  make recovery rebuild an older picture than the graphic had reached.
- **A hole in the log is filled FROM the log, never papered over by the row that revealed it.**
  Applying that row first pushes the cursor past the gap, so the tail's older rows come back and
  are dropped as duplicates: the gap closes on paper while the commands inside it never run.
  `followControlLog` carried this rule; the hosted receiver did not, so a dropped socket could
  eat a `play` and leave a graphic updating its fields off air. Its tail also PAGES now (500 rows
  a call, 40 pages), so a long outage recovers in full rather than in its first page.
- **The local half recovers from the LOG instead of a report** (`localReceiver.ts`: replay from
  the last `play` for this graphic and stream, off air, then settle) — and it reads that log
  ONCE, so a lost fetch on the way in is retried, never believed. A failed read is not a short
  log and an unanswered probe is not a missing relay: the first said "this graphic never aired"
  and left a live board blank, the second said "no relay on this origin" and went quiet for a
  whole show, because a source in OBS routinely loads before the launcher is double-clicked.
  Only a 404 means static hosting and inertness. Pinned by local-relay.spec.ts, which drops one
  request of each kind on purpose.
- **The local READ is bounded by a baseline of its own.** `relay-log.jsonl` is appended to and
  never rotated, so starting at row 0 meant re-reading every show the package had ever run —
  20 000 rows at 500 a fetch before the graphic may paint. There is no report channel here, so
  the block keeps the same kind of baseline itself, in localStorage on the relay's origin (what
  survives a browser source reloading, which is the outage being recovered from): the values it
  has merged, how far it has read, and the row the current airing began at. The boot read starts
  at that play. Versioned — an unknown version, or a cursor ahead of the relay's head (the log
  was reset), is ignored and the old full walk runs. It is a CACHE of the log and never a
  substitute: every row after the bound is still read and replayed, so a stale baseline costs
  nothing.
- **What is pinned offline, and what is not.** The receiver blocks are generated JS talking to
  two addresses, so both halves' boot discipline is driven in-spec: `local-relay.spec.ts` (the
  local half, one request of each kind dropped on purpose, and the bound), `hosted-control.spec.ts`
  (the hosted receiver's dropped resolve and its hole), `productions.spec.ts` (`untilAnswered`
  itself). The renderer's own wiring of that walk needs a real backend and belongs to the
  live-verify checklist below.
- The graphic reports AFTER applying (debounced): harvest the definition's fields from the
  DOM + `noacgMachineState()` → `control_report`.

## Profiles

The routed Home (`components/home/HomePage.tsx`, `#/home` — docs/SAVED_CONTENT_MODEL.md §3;
it replaced the old Homebase modal) is the profile: the flat graphics library, video
projects, productions with their output links, community submissions. (Packages are
retired — docs/GOALS_ARCHIVE.md "Student release" step 3.) Sync kinds
include `'show'` and `'video'` (video tombstones strip the heavy payload to a readable
stub). All local-first; cloud mirrors for signed-in users.

## Live-verify checklist (maintainer, real Supabase — a green build never counts)

**Steps 8 and 9 were driven on every run of the configured suite** from 2026-09-16 to 2026-11
by `e2e/configured/hosted-control-profile.spec.ts`, which published a production carrying an
ARRANGE (plus a legacy `combine` list it had to ignore) and three bound fields, drove the hosted
control page signed out and read every claim back off the durable log. That spec was deleted with
the page (docs/work-specs/retire-hosted-control/spec.md); the published panel spec and profile
stay pinned offline by `e2e/hosted-control.spec.ts`, which reads them but cannot see a publish
write them. With that spec gone, steps 8 and 9 are again the only real-backend check that a
publish writes the profile.

1. `supabase db push` applies 0008 cleanly on the project.
2. Signed in: publish a 2-graphic production → the output URL appears; the `control_shows` row
   has slug/panel; Unpublish deletes it, the output URL goes dead and an old control link says
   "This link no longer works".
3. An old link: open `?control=<slug>` → it forwards to `#/production/<id>` (signed out, that
   page asks for a sign-in); an unknown slug says "This link no longer works".
3b. Retired with the hosted control page (2026-11): its entry switcher and staged edits.
4. Export the published show; run a graphic's `index.html` as a browser source (another
   machine ideally): the production page drives it; kill + reload the graphic → it snaps back to
   the pre-kill state with the aired data; reload the production page mid-show → chip + fields
   resume.
5. Two operators, each signed in on their own device with the production page open: A takes, B's
   chip updates; refresh B mid-show → recovers.
6. Burst the send cap (hold a stepper with Live on) → the page surfaces the slow-down error,
   nothing crashes, the graphic stays consistent.
7. Sync: save a show + a video signed-in on device A; device B pulls both; delete on B;
   A converges (tombstones propagate; video tombstone body is a stub).
8. Profile (migration 0058): publish a production carrying a `Show.profile` → the `control_shows`
   row's `profile` column holds the canonical JSON; publish one without → the column reads `{}`.
   The offline suite pins the READ side of that column and the record round trip
   (`e2e/hosted-control.spec.ts`); only a real backend can show the write, because
   `publishControlShow` returns before its upsert when there is no Supabase.
9. ARRANGE in the published profile (migration 0059): with the production page's ⚡ Arrange
   toggle pin one control, hide and rename another, publish, and check the `control_shows` row's
   `profile` carries it; the hosted control page that rendered it from there is retired
   (2026-11), and the production page and exported deployments are pinned in the suite.
   Clear it with "Back to the graphic's own", publish again → the generated panel is back.
   Also check 0059 itself applied: an instance still on 0058 returns no `profile` key from
   `control_show_by_slug`, which reads as "no profile" and renders the generated panel — correct,
   but indistinguishable from a production that has none, so confirm the migration before
   concluding the arrangement did not travel.
10. (Retired 2026-10-02.) COMBINE was removed with the feature; a published profile that still
   carries a `combine` list shows no Combined section. The configured check of that went with
   the hosted control page in 2026-11.
