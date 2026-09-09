# The control-panel road

**Status: a PLAN, rewritten 2026-08-28 from the owner's brief
(`docs/backlog/control-panel-road-v2-brief.md`, verbatim, 2026-08-28). It builds nothing.** The
first version (2026-08-27) answered "how does a user's own graphic get a control panel"; the
brief widens the question to "can these foundations grow into professional broadcast-scale
operation - sports, esports, elections, automated newsrooms, multi-operator productions - without
being replaced". So this rewrite keeps every decision the owner already ratified, measures the
existing architecture against the professional systems it is catching up with, and marks which of
today's assumptions are load-bearing and which must not harden into invariants.

Two questions gate every decision below, and both must remain true:

> *If NoaCG eventually has to operate a major live sports event, esports tournament or automated
> newsroom, will this decision still be a good foundation?*

> *Can we keep today's experience simple enough that a student or first-time operator can use it
> without understanding the underlying machinery?*

Binding background: `docs/CONTROL_LAYER.md` (panels are generated; the command log),
`docs/STATE_MACHINE_SCHEMA.md` (what a graphic is), `docs/GRAPHIC_TYPES.md` (types declare
machines), `docs/CLOUD_PLAYOUT.md` (the output renderer and recovery), `docs/PLAYOUT_DASHBOARD.md`
(the operator surface), `docs/PRODUCTION_DATA_PLAN.md` + `docs/DATA_API.md` (shared data),
`docs/GRAPHIC_BEHAVIOUR_PLAN.md` (the import pilot). `docs/EDITOR_RESEARCH.md` (2026-08-28) is the
AUTHORING-axis competitor read; §1 below is its CONTROL-axis sibling and does not repeat it.

---

## 1. What the professional systems settled (evidence, not requirements)

Read 2026-08-28 from public documentation (sources at the end), on the brief's five axes. Marketing
copy is weak evidence about shipped software; a row that would change an architecture decision gets
re-checked against a live system before it does.

- **Capability vs workflow: every mature system separates them.** Ross ships the graphics engine
  (XPression: scenes, the Sequencer's take items, DataLinq) and a SEPARATE panel product
  (DashBoard): "PanelBuilder allows users to easily create custom control panels so that GUIs can
  be simplified for non-technical staff", "a customized application around your particular event
  and workflow". Vizrt splits template (what the designer built) from PAGE - "an instance of a
  template that can be customized with data values" - and an operator's whole show is pages, never
  template edits; concepts/variants re-skin the same page per production. Singular.live generates
  the control app from control nodes, then instantiates it per show ("for every show, you need an
  app instance ... without affecting the original composition"). MXMZ's Operator is a separate
  product with hand-built panels per vertical. **Nobody makes "customize the panel" mean "edit the
  graphic" - and nobody except Singular generates the default panel at all.** The bespoke-panel
  cost (MXMZ per-sport builds, DashBoard needing an ogScript author) is exactly what our generated
  default avoids.
- **Production operation is a rundown of data rows over templates.** Trio pages, XPression take
  items, MXMZ playlists, Flowics playlists - all the same shape as our cues. Preview/program with
  an explicit take is universal; so is a Next/Continue verb; MXMZ adds auto-advance timers and a
  purpose-built match-control surface. Layer/channel replacement (a take on an occupied layer
  replaces, other layers stay) is the CasparCG-heritage model we already follow.
- **Shared data is a central plane graphics BIND to; panels write data, not graphics.** XPression
  DataLinq binds scene fields to external sources with a per-binding "Live Update" opt-in; Ross's
  own scoreboard pattern is DashBoard score buttons writing values that DataLinq feeds into the
  scene. Singular has Data Streams; Flowics makes data providers first-class elements. The score
  is entered once, everywhere it shows.
- **Multi-operator means shared server-held state, not client coordination.** Vizrt's Media
  Sequencer "stores all playlists/shows and makes them available to all control applications
  connected to it"; TV2's automation notes state the client rule outright: "the library should not
  store any state. It should read and write from the VDOM tree as required." Singular: "multiple
  operators can use the same Control App ... any overlays that are taken to air will be visible on
  all instances", with page prep independent per operator. Hard locks and role systems are rare;
  division of labour is mostly human convention over a truthful shared view.
- **Recovery = the show state lives off the client.** A restarted Trio re-initializes from the
  Media Sequencer; a restarted Singular control app rejoins the shared instance. Automation
  (newsroom MOS via Viz Gateway, Sofie driving MSE) is one more client of the same shared state,
  never a second path to the renderer.

**Where NoaCG already stands on these:** the durable command log + `control_shows` row IS the
shared server-held state (the INSERT is the send, clients follow the log - the MSE pattern in
event-sourced form); cues are pages; preview/program with Take is the dashboard's 90% case; the
production data tree + bindings (shipped, `docs/PRODUCTION_DATA_PLAN.md`) is DataLinq's shape; and
the generated panel is the thing the big systems make you build by hand. The gaps this document
decides about are the capability/workflow split (§3), the production story said out loud (§4), and
validation aimed at safety rather than coverage (§7).

## 2. The default follows the graphic - kept, and restated

**Recommendation: keep the invariant unchanged.** Every control surface is GENERATED from the
graphic's own contract - fields become inputs, the machine's operator events become buttons,
`machine.controls` metadata supplies labels, sections, payloads and ± adjusts, legality is the
structural guard mirrored as greying. A graphic with no machine gets the derived linear machine's
honest panel. The generated panel is NoaCG's zero-configuration default, and it must always be
complete and usable on every surface, for every graphic, with no per-graphic code.

This is the property that keeps five renderers in parity, keeps exported and hosted panels working
(everything travels inside the template), and gives a stranger's OGraf package the same treatment
as our catalog. It is also our lead: generated-from-the-machine with structural legality beats
hand-built panels (MXMZ), promoted-property forms (Singular) and per-target definition files
(Loopic) - `docs/EDITOR_RESEARCH.md` §3.

**One sentence from v1 is narrowed.** "Customizing a control panel means editing the graphic" stays
true for the graphic's OWN contract - its fields, machine and controls metadata are the single
source of what it CAN do, and no other store may define behaviour. What that sentence must not
mean is "a production may never arrange the controls it was given" - that is §3, and it is
presentation over declared capability, never behaviour.

Alternatives, each a line: **per-graphic panel HTML** - forks five-renderer parity, rots on every
graphic edit; rejected. **A panel layout editor as a second scene model** - rejected on the same
grounds the product refuses hidden scene models. **Category-keyed panels** - banned by the
client-agnostic rule and the control layer's own contract.

## 3. Capability vs workflow - the production control profile (direction, not schedule)

The brief asks whether NoaCG should eventually separate what a graphic CAN do from how a
particular production wants to OPERATE it. The professional evidence (§1) says yes; the owner's
football principle says why: *the operator should understand football, not the graphics software* -
fewer, more meaningful controls, not every declared capability at equal weight.

**Recommendation: a PRODUCTION CONTROL PROFILE - additive presentation state on the Show,
referencing capabilities the graphics already declare. Not built now; the shape is reserved.**

- **What it may do:** arrange, hide, rename, emphasize and group controls; pin the handful a show
  actually uses; combine declared verbs into one press (a combined control is an ordered batch of
  already-declared events/verbs/data patches - the shape Take already is: update + play + cue as
  one atomic `control_send_many` batch, and the shape a Goal already is: event + adjust on one
  press). Deterministic composition of existing capabilities, nothing else.
- **What it may never do:** invent an event, carry logic or conditions, override structural
  legality (a hidden button's event is still guarded by the machine; a renamed one still greys by
  the same table), or define behaviour. A profile is DELETABLE at any moment: removing it must
  always leave the complete generated panel, which stays the recovery surface and the default.
- **Where it lives:** on the `Show`, additive-optional, keyed by pool-graphic name then control
  id - exactly the precedent `Show.bindings` set (production-scoped taste over graphic-owned
  contract, pinned onto `control_shows` at publish, older builds read past it). Not on the
  template: a library graphic is shared by many productions, and one show's taste must not churn
  a shared document or ride into exports.
- **Why not now:** the generated panel plus `machine.controls` sections already cover today's
  shows, and the first real demand signal should shape the profile's vocabulary (the same
  third-case rule that deferred the behaviour registry). The decision made HERE is only that the
  profile is the sanctioned road - so no future session solves "this panel is too busy for our
  operator" by per-graphic panel code or by forking a template per production.

Alternatives, each a line: **bake workflow into each graphic's `machine.controls`** - wrong owner;
production taste would churn library documents shared across productions. **A panel markup
editor** - §2's rejected alternatives, unchanged. **Do nothing, ever** - fails the football
principle the moment a real sports show puts twelve declared controls in front of one operator.

## 4. Beyond one graphic - the production operator story

The per-type stories (§8) say how ONE graphic is operated. Real operators run shows. The story
below is the production-level counterpart, told in verbs; most of it narrates behaviour that is
already shipped and pinned, and it is written here so the whole arc is an explicit contract rather
than an emergent property.

> Before the show I add graphics to the production and write CUES - named data rows over the pool,
> reordered by drag, each carrying its own values. During the show I select a cue, see it on
> PREVIEW (selection is the preview gesture; nothing airs), and ⟳ TAKE it. Each graphic lives on
> its own LAYER: taking a cue on another graphic leaves the first one up, taking a second cue on
> the SAME graphic replaces it, and a bug, a strap and a ticker are three layers up at once. I
> edit the NEXT cue while another is live - typing stages, and stages only. » Next advances the
> live graphic's own machine; its ⚡ actions and ± live numbers act on air and say so. ■ Out takes
> one layer off; ■■ All out is the panic control and clears the frame. A second operator on the
> hosted page sees what I staged, what aired and who did what (the activity feed); we divide the
> show by layers, and the log serializes whatever we both send. When a renderer or a panel
> reloads mid-show, it rebuilds to the exact on-air state from the log and reports - including the
> match clock, which carries its own time origin. When the show is over, Out, and the production
> keeps its URL for next week.

**Recommendation: adopt this story as the production-level contract, and hold the six
architectural commitments under it.** Each is one line here because each is already carried by a
binding doc:

1. **Preview vs program** - preview is always local; program changes only by an explicit send
   (`docs/PLAYOUT_DASHBOARD.md` §1, `docs/CLOUD_PLAYOUT.md` §4).
2. **Cues, layers, replacement, Next, editing-ahead, emergency clear** - the rundown + layer model
   and the verb glossary (`docs/CONTROL_LAYER.md` "operator verbs", `docs/CLOUD_PLAYOUT.md` §2-4).
3. **Multi-operator** - shared server-held state, truthful shared view (staged/live/activity), the
   log as the serializer. WHO is missing, deliberately: operator identity and per-person
   capability arrive with TEAMS (`docs/GOALS.md` THEN 0); the capability model (WHAT a URL may do)
   must not grow ad-hoc WHO semantics before it.
4. **Recovery** - the log + reports doctrine, boot replay off a hidden stage, the poll floor under
   Realtime, origin-stamped clocks (`docs/CLOUD_PLAYOUT.md` §3). A reload is an ordinary event,
   never an incident.
5. **Automation and newsroom control** - a future automation client (MOS gateway, rundown system,
   Companion/Stream Deck plugin) is ONE MORE WRITER of the same command log, exactly as the Data
   API already is for data - never a second path to the renderer. That is the MSE lesson in §1,
   and it is already this architecture's §7 doctrine in `docs/CLOUD_PLAYOUT.md`. No new
   architecture is reserved for it because none is needed: the log IS the integration point.
6. **Scale** - the measured concurrency budget and its order of ceilings
   (`docs/CLOUD_PLAYOUT.md` "Concurrency budget"). Olympics-scale is a capacity and redundancy
   problem on the same shapes, not a different architecture - PROVIDED the §9 assumptions are not
   allowed to harden.

Alternatives, each a line: **a show-controller layer above productions** (grouping productions,
cross-production verbs) - nothing today needs it, and a production already composes arbitrarily
many graphics; revisit only with a real multi-studio case. **Auto-advance / timed rundowns**
(MXMZ) - real, cheap to add later as cue metadata driving the existing verbs, not architecture;
parked until a show asks.

## 5. Shared production data - the ruling, restated

v1 recorded the owner ruling "one shared data backend" OUT and "each graphic carries its own" IN.
The brief asks that this not be misread, and it has already been superseded in the narrow sense:
the production data tree SHIPPED (`docs/PRODUCTION_DATA_PLAN.md` Phases 1-2, `docs/DATA_API.md`).

**Recommendation: keep both halves, stated precisely.**

- **A graphic owns its fields, panel and behaviour.** It is portable, self-contained, and exports
  anywhere with nothing to miss - the ruling's real content, which was a refusal of a universal
  type-specific backend SERVICE (a list manager, a quiz service), not of shared truth.
- **A production owns a DATA TREE that graphics BIND to.** `match.home.score` is written once -
  by an operator stepper, the Data tab, or a feed through `PATCH /api/data/patch` - and the
  scorebug, the fullscreen result, the halftime board and the standings all follow their
  bindings. The brief's four-places score is already impossible for bound graphics. Bindings are
  production state (`Show.bindings`), resolve to ordinary `update` rows in the one log, and the
  graphic never learns a path name - so portability survives.
- **Data never operates.** Feeds write values; only operator surfaces air, clear or advance
  anything ("writes describe state, never graphic commands" - `docs/DATA_API.md`), and the
  audience plane structurally cannot reach the command log (`src/audience/`). This is the
  boundary that makes shared data safe rather than a second operator with no face.

Alternatives, each a line: **a runtime `productionData.*` object inside template code** - breaks
export-anywhere and adds a parallel rendering path; already rejected
(`docs/PRODUCTION_DATA_PLAN.md` §2.3). **Graphic-addressed writes as the primary API** - forces
feeds to know the rundown; kept only as the low-level escape hatch.

## 6. Staged vs live - the safety boundary, made explicit

The pieces all exist; the brief asks for the mental model to be stated once, as a contract every
surface keeps. **A beginner must be able to predict whether what they just did changed the
output.**

- **Typing STAGES.** Nothing airs because it was typed - not in a cue draft, not in the shared
  staging buffer, not in an entry. The surface says so (staged badges, "changes air on ⟳ Take",
  the amber not-sent dot).
- **Operator actions change LIVE state, intentionally and visibly.** The verbs, the ⚡ actions and
  the ± live numbers act on air; each is labelled as acting on air, greys when it does not apply,
  and lands in the activity feed.
- **Declared LIVE BINDINGS update live automatically - and are marked.** A field bound to
  production data (or fed by the Data API) is the one sanctioned way typing-shaped input reaches
  air without a Take, and the surface marks it (the link chip; a bound field leaves the cue's
  editable set). Nothing else may join this class quietly: any future surface that would air on
  input must present itself as a binding, never as an ordinary field.

Alternatives, each a line: **everything live by default** (some cloud tools) - fails the
predictability test and the brief names it as the fear; refused. **Everything staged including
data feeds** - makes a scorebug feed wait for a human on every tick; refused, the binding mark is
the honest middle.

## 7. Validation - deterministic, recoverable, safe

"Every operator arrow fired once" proves action coverage. The brief is right that it does not
prove broadcast safety. **Recommendation: the long-term validation invariant is DETERMINISTIC,
RECOVERABLE, SAFE OPERATION; arrow coverage stays the floor, and the professional failure cases
become the proving rounds' torture list.**

Most cases already have a structural answer - the value of writing them down is that each becomes
a claim a round drives rather than a property we believe:

| Failure case | The structural answer today |
|---|---|
| Repeated Take / double press | Take is defined on a live cue (toggle off / re-take semantics); a re-Take re-sends values + entrance - idempotent in effect, never additive |
| Out during another transition | One serial queue per graphic; an event mid-transition finishes the running timeline instantly with suppressed callbacks and evaluates against the NEW state - deterministic by construction |
| Duplicated / late / illegal events | Structural guard drops them, payload and all; log followers dedupe by row id |
| Refresh / reconnection | Log follow + gap-fill from the tail, holes filled FROM the log, the 30 s poll floor under Realtime |
| Renderer or controller restart | Boot recovery from per-graphic report baselines, replayed off a hidden stage; a production never rendered replays from the log START |
| Stale state on a surface | Reports ride the log; "not sent yet" compares against the WIRE, not local hope |
| Simultaneous operators | The DB-ordered log serializes; later rows win; the activity feed attributes |
| Interruption halfway through a verb | Multi-part verbs are ONE atomic batch (`control_send_many`); an event's payload applies only if the machine accepts the event |
| Recovery to a known on-air state | Reset is two operations (data, then snap); the recovery picker is labelled recovery; clocks carry their own time origin |

**What is genuinely owed** (the gap, not a rebuild): the proving rounds (§8) currently walk the
HAPPY story. Each round adds the torture pass - double-press every verb, Out mid-entrance, reload
the renderer and the panel mid-state, replay the log cold - driving the same generated surfaces.
The bench's arrow walk stays the cheap gate; the torture pass is per-type proving work, not CI
(a chaos suite now would be enterprise ceremony ahead of demand). One standing rule joins the
model docs: **a graphic must land in a defined state whatever order legal presses arrive in** -
which the structural guard + serial queue already deliver, and which any future feature (profile
macros included) must preserve.

Alternatives, each a line: **model-checking the machine** (exhaustive state exploration) - the
graphs are small and structural guards make illegal transitions unrepresentable; cost without a
failure mode to find. **Fuzzing in CI** - revisit when a real incident survives the torture pass.

## 8. Playout intent, per type - and proving against it (kept)

Unchanged in substance from v1; ratified by the owner 2026-08-27 with credits first.

**Intent is a declared OPERATOR STORY per type, and proving is driving the generated panel through
that story.** Each type with real playout behaviour gets a short story - one paragraph, in verbs,
start to finish, owner-confirmable prose, not a DSL (the sample is far too small to freeze a
schema). The proving round, one type at a time, per the standing rule that a category is proven in
cloud, dashboard AND offline export:

1. Write the operator story and get it confirmed - the design work that must not be guessed.
2. Author or verify the type's machine and controls against it; persist a machine only where the
   derived one is wrong.
3. Create the graphic through the wizard AND the import road where the type is import-shaped.
4. Drive the story on all three planes: hosted control page, production dashboard, offline
   exported panel - now including the §7 torture pass and, where the type binds data, a shared
   §5 data write.
5. Pin the walk as a spec; file the owner-queue item - "operable" is a judgement a person makes by
   operating it.

Order from `docs/backlog/playout-logic-for-all-common-graphics.md`; credits first (the exemplar:
**end credits = paste a list** - the "backend" is one textarea field, the roll and its pause are
the machine, the speed nudge is a control).

### The stories, as the owner told them - owner direction, 2026-08-27

Given on the phone, per type. **Direction, not specification** - the owner's framing was "not too
strict", and *"many of these things already work well"*, so a proving round confirms or corrects
each story rather than building to it blind. The WHY binds; the mechanism is the round's to
design. Anything not listed here has no story yet and needs one before it can be proven.

- **Credits** - the whole list is pasted as ONE text. A separator splits role from name (a colon
  or something like it; the exact character is still open). Short and long credits both. Roles
  are styled differently from names, side by side or stacked. **The system handles the per-name
  structure, not the user.**
- **Ticker / crawl** - one pasted list, one item per line, looping until Out. The list stays
  editable mid-show and new items enter on the next pass.
- **Scoreboard** - the current model is right: Goal A is flag plus score in one press, +/- are
  for corrections, and Full time is independent.
- **Quiz** - lock then reveal stays the taught default path, but revealing directly without
  locking is allowed.
- **Poll / vote** - the audience votes live through `/join`, bars fill from real votes, and the
  operator decides only WHEN the results show. (Manual or offline entry was not ruled on; the
  option the owner took was audience-first.)
- **Timer / countdown** - the duration is set beforehand, it starts on TAKE, and at zero it HOLDS
  at 0:00 until it is taken out.
- **Stat readouts** - play counts from 0 up to the value; an UPDATE while on air animates old to
  new. Never a snap, and never a recount from zero.
- **Lists** (agenda, lineup, standings) - rows pasted as one field, NEXT reveals them row by row.
  A show-all option is acceptable.
- **Alerts / notifications** - two stories, chosen per design: a breaking-news strap stays up
  until Out; a follower or donation pop plays, holds briefly and takes itself out.
- **Results boards** - also two, per design: award-style steps to the winner on Next,
  standings-style enters whole.
- **Reveal cards** - staged. Taken on air hidden or teased, and ONE Reveal press fires the moment.
- **Holding** - an ambient loop until Out. **Transition / stinger** - fires once, completes
  itself, no Out.
- **Simple graphics** (lower third, title, topic, info, question, quote, caption, bug, sponsor,
  CTA, product, map) - type, Take, Update as a clean swap, Out. That is the standard story, and
  the standing instruction is to **stay open**: any of them may grow behaviour later, and shipping
  a richer one as its own type under its own name is fine. The owner's guardrail on all of it:
  *"let's not make this too difficult for us"* - openness over machinery.

## 9. Where behaviour comes from - the agent road and the wizard step (kept, condensed)

Both decided by the owner 2026-08-27; recorded here so this document stays the one road.

- **The agent door: type-first, with authored machines as a blessed, gated fallback.** The default
  the skill states: behaviour comes from a type (`noacg types` → scaffold/attach); no stated
  behaviour means NO machine - the derived lifecycle machine, honest on every target. When no type
  fits, the agent may author a machine as an explicit step under the full gate. The 2026-08-08
  "AI never authors machines" rule is retired (owner, 2026-08-27): custom control panels are open
  on EVERY path, Lite and Pro included, and the safety model is the GATES - the same three
  wherever a machine is authored: **(1)** `noacg validate` passes, machine checks included,
  before `save`; **(2)** the agent runs `noacg inspect` and shows the user the derived panel -
  "these are your buttons" - so a human confirms the operator surface; **(3)** the bench walks
  every operator arrow at least once, plus the §7 torture pass as it lands. Lite and Pro inherit
  the same three conditions when their turn comes (after the 2026-09-12 production; condition 2
  needs an in-product surface where the CLI needs a terminal). The skill additionally teaches:
  `machine.controls` metadata, *parameterize with data, not states*, and the default-path
  contract - `update/play/next/stop` alone must still walk the graphic, because that is what a
  playout server has.
- **The SVG-import wizard's behaviour step: offer only what the artwork can carry, default to
  nothing, never interrogate.** The offer list is computed from artwork-shape predicates (the
  `missingParts` pattern), never a category. No behaviour is a good default - fields plus the
  derived machine is a fully playable graphic. "Something else" is a real row: it says the graphic
  works now, points at the node editor and the agent door, and records the ask through
  `src/feedback/` so coverage grows from demand. Naming stays the accelerator, never the door
  (the MXMZ lesson); AI proposals stay deferred.

Alternatives, each a line: **type-only, authored machines refused** - leaves the five proven
novel-brief cells on the table and pushes users back to fields-as-state, the measured failure
mode. **The agent authors the panel itself** - never; panels are derived (§2). **A flat list of
all behaviours, most greyed** - thirty invalid options to offer two valid ones; against the
one-line rule.

## 10. Assumptions that must NOT become long-term invariants

The brief's direct ask. Each is correct TODAY and each would be wrong to freeze. A session that
finds one of these in its way should treat it as movable - by design, with its named successor -
not as doctrine.

1. **"Customizing a panel = editing the graphic", read as forbidding production-level
   arrangement.** The graphic stays the source of capability; the §3 profile is the sanctioned
   presentation layer above it.
2. **Graphic identity on the wire is the pool NAME** (the 0008 key). Renaming orphans live/staged
   rows until the next publish (`docs/CLOUD_PLAYOUT.md` known limits). A stable graphic id on the
   wire is the successor when multi-operator scale makes renames routine.
3. **One renderer per production.** Two output tabs are last-write-wins on `control_report`, and
   `output_seen_at` cannot tell renderers apart. Main+backup renderers (any serious event) need
   multi-renderer awareness - reserved as Stage-2 work, not precluded by anything, but nothing may
   start ASSUMING a single reporter.
4. **The per-show command budget (50/5 s) and the anon-readable event log.** Right-sized for a
   class; neither is a scale nor a security posture for a stadium. The budget is one number, and
   the log-visibility fix is a known, deliberate product decision (v2 receivers) - keep both on
   the books as settings of the current era.
5. **A cue carries the full value set.** Shared data already peels bound fields out of cues
   (§5/§2.7 of the data plan); nothing may re-assume "cue = every field" - a cue is the prepared
   values of the UNBOUND fields plus a reference to shared truth.
6. **Operators have no identity.** Capability URLs say WHAT, not WHO - the right model until
   TEAMS (`docs/GOALS.md` THEN 0) adds WHO on top. Nothing may bake "anonymous forever" into new
   surfaces (the activity feed already phrases actors loosely for this reason).
7. **All timing is design-time.** Timer delays live on the arrow (owner ruling 2026-08-09: no
   second clock; an armed timer must be VISIBLE instead). The ruling stands; what must not freeze
   is the meta-assumption that no future type may carry per-play operational timing as DATA - a
   variable shot clock would, and the model already allows data-carried values without touching
   the no-second-clock rule.
8. **The proving bar is the happy walk.** §7 replaces it: arrow coverage is the floor,
   deterministic-recoverable-safe is the invariant.

What deliberately IS long-term, for contrast, one line each: code as the single source of truth;
the structural guard (no expression language, ever); data updates never cause transitions; the
serial per-graphic queue inside the template; the one command log with the operator always able to
win; generated panels complete with no per-graphic code; nothing viewer-written airs without an
operator; the default path as the dumb-playout contract.

## 11. Non-goals (unchanged, plus the brief's own)

- **The cloud editor stays parked.** Editing a graphic's design or code on hosted surfaces is not
  on this road; panels and outputs are published artifacts, editing stays in the app, one
  re-publish from air. Tracked, not forgotten.
- **No enterprise features on spec.** Roles/permissions, cue locking, NRCS/MOS adapters,
  redundancy orchestration, audit trails, per-key scopes, panel scripting - each has a named seam
  above (§3, §4.3, §4.5, §10.3) and none is built until a real production asks. The brief's own
  instruction: do not turn this into an enterprise-feature roadmap.
- **No second graphic model, no per-template panel code, no arbitrary panel markup** - restated
  from §2 because they are the standing temptation.
- **Nothing in this document is authorized to be built by it.** The NOW push (`docs/GOALS.md`,
  `## NOW`) owns the calendar; every section above is sequenced after it, and each build starts
  from its own session with this doc as the brief.

## The decisions record

- **2026-08-27, owner (by phone):** agent-authored machines blessed under the three §9 gates, and
  custom control panels opened on every path (Lite/Pro direction-only until after 2026-09-12);
  the wizard behaviour step ratified as planned; per-type operator stories given (§8), credits
  first. Recorded in v1 of this document the same day.
- **2026-08-28, owner (the rewrite brief):** the long-term bar set (professional-scale foundations,
  student-simple today, both at once); capability/workflow separation to be investigated - answered
  here as the §3 profile; the production story added (§4); "own backend" wording corrected (§5);
  staged-vs-live made explicit (§6); validation re-aimed at deterministic-recoverable-safe (§7);
  the §10 non-invariants called out. This rewrite is the record; no open owner decision remains in
  this document - §3 returns to the owner only when something wants to BUILD the profile.

## Sources (control-axis research, read 2026-08-28)

Public material only. Authoring-axis sources live in `docs/EDITOR_RESEARCH.md`.

- Ross Video: [XPression DashBoard API option](https://www.rossvideo.com/resources/ross-university/xpression-dashboard-api-option/),
  [DashBoard CustomPanel development guide](https://documentation.rossvideo.com/files/Manuals%20(ARCHIVED%20DO%20NOT%20USE)/Enterprise%20Control%20Systems/DashBoard/DashBoard_CustomPanel_Development_Guide.pdf),
  [Setting up XPression DataLinq](https://www.rossvideo.com/resources/ross-university/setting-up-xpression-datalinq/),
  [DataLinq + DashBoard](https://www.rossvideo.com/resources/ross-university/xpression-and-dashboard-part-v-setting-up-dashboard-to-use-datalinq/)
- Vizrt: [Viz Trio system overview](https://docs.vizrt.com/viz-trio-guide/3.2/System_Overview.html),
  [Viz Trio show control](https://docs.vizrt.com/viz-trio-guide/3.2/Show_Control.html),
  [Media Sequencer](https://www.vizrt.com/component-updates/media-sequencer-2/),
  [TV2 v-connection MSE architecture notes](https://github.com/tv2/v-connection/blob/develop/doc/architecture_notes.md)
- Singular.live: [control applications](https://www.singular.live/control-applications),
  [Data Stream API guides](https://developer.singular.live/data-stream-api/how-to-guides),
  [remote operations](https://support.singular.live/hc/en-us/articles/360040755992-Remote-Operations-With-Singular)
  (support portal answers 403 to unauthenticated fetches; quoted lines came via search indexing)
- MXMZ and Viz Flowics: control-side reads in `docs/EDITOR_RESEARCH.md` (Operator product;
  Rundown Control), 2026-08-28.

---

The two tests, once more, verbatim - every future decision on this road answers both:

> *if NoaCG eventually has to operate a major live sports event, esports tournament or automated
> newsroom, will this decision still be a good foundation?* And equally: *can we keep today's
> experience simple enough that a student or first-time operator can use it without understanding
> the underlying machinery?* Both must remain true.

## 11. Owner answers, 2026-09-03 - §3 confirmed, §10 all stays open

**§3 is confirmed, with one emphasis he added and it is the load-bearing part:**

> Yes, §3 is basically what I mean, with one important emphasis: **there should be no fixed
> universal control vocabulary that limits what a graphic can expose.**

> The graphic is the source of truth for its control surface. It declares whatever that particular
> graphic needs: text fields, numbers, scores, lists, toggles, clocks, actions, states, buttons, or
> many controls at once. NoaCG then generates the complete control panel from that declaration.

> Then the Show/profile layer you describe makes sense as an optional operator layer on top:
> arrange, hide, rename, group, pin and combine controls that the graphic already exposes. Delete
> the profile and you get the full generated panel again. That is exactly the recovery model I
> want.

> The football principle is a good example: the graphic knows what Goal, Score, Clock, etc.
> actually do; the production can arrange those into the simplest possible football operator panel.
> The operator should not need to understand the underlying graphics machinery.

So the profile road is sanctioned as written, the deletable-profile recovery model is ratified in
his own words, and the fences in §3 stand.

**The phrase he does NOT want frozen**, which was sitting in this doc's own "deliberately
long-term" list and in `docs/CONTROL_LAYER.md`'s opening sentence:

> One thing I would also be careful not to freeze accidentally: "generated panels complete with no
> per-graphic code" must mean no bespoke panel UI code, not no graphic-specific control
> definitions or behavior. The whole point is that a graphic can define whatever controls it needs.

The clarification is now the second paragraph of `docs/CONTROL_LAYER.md`, which is the binding
contract and the file a session reads before touching the generator - a warning belongs where it
fires, not in a road map.

**§10: none of the eight is frozen.**

> I would not freeze any of them as permanent. They all look like implementation choices or current
> limitations that we may need to outgrow. In particular, renderer redundancy, operator identity,
> timing-as-data, cue representation, rate limits/log exposure and the proving bar should remain
> open.

He named six of the eight explicitly, which is stronger than leaving the list alone: renderer
redundancy, operator identity, timing carried as data, cue representation, the rate limit and log
exposure, and the proving bar are all expected to be outgrown rather than merely tolerated.
