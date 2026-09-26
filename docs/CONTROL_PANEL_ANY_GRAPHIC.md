# A control panel for any graphic - the plan

**Status: a PLAN, written 2026-09-15 from the weekly alignment of the same day. P2 is at DESIGN,
so this builds nothing; it says what the one approach is, proves it on paper against the
proof case, and separates what the first showing needs from what waits.**

The brief: one control-panel approach that fits ANY graphic we have - catalog templates,
imported SVGs, graphics a coding agent makes through the NoaCG CLI, and later a stranger's OGraf
package. The proof case is a voting show: five people vote on who performs
each song, one graphic shows each person's vote for the current song, another keeps a running
total of how many songs each person has guessed right. The owner wants to prompt it in Claude
Code, save it with the CLI, and run it from the playout dashboard within minutes, in front of the
producer and director.

**What the first showing is, answered 2026-09-16** (the retired owner rulings ALIGN-2026-09-15-6): a
DEMONSTRATION, not an air date. The programme's own graphics are made in post by its own people;
what is wanted on the day is a graphic that updates so the host and the contestants can follow the
score, the playout in the room is SPX, and the point is to show the producers and creators how
easily the graphic is made. Nothing in this plan changes shape because of that - the profile was
built on the general argument of ALIGN-2026-09-15-2 and never on the date being live - but §5a now
says what the DAY needs, as opposed to what we build.

Binding background, none of it repeated here: `docs/CONTROL_LAYER.md` (the one generator and its
five renderers, and the 2026-09-03 clarification that there is no fixed control vocabulary),
`docs/CONTROL_PANEL_ROAD.md` (the road, the production control profile in §3, the agent door in
§9), `docs/STATE_MACHINE_SCHEMA.md` (what a machine is), `docs/OGRAF_STATE_IN_FIELDS.md` (what a
foreign host can and cannot learn), `docs/SVG_BEHAVIOUR_PLAN.md` (recipes, the 14 in
`src/templates/behaviours/registry.ts`), `docs/AGENT_CLI.md` (the door the proof case walks).

---

## 0. The answer in one paragraph

**There is already one approach, and it is the control contract: a graphic declares its fields,
its machine and its controls inside its own code, and every surface generates the panel from
that declaration.** Nothing in this plan adds a second one. What the proof case needs is the
agent door being allowed to WRITE the contract it already reads: today the skill
tells a coding agent that authoring its own machine "is a later capability", while the runtime,
the validator, the bench and all five renderers already accept one, and the owner blessed it on
2026-08-27 under three gates. So the recommendation is to teach and gate the contract on the
agent road before the first showing, walk the proof case through it once ourselves, and hold everything
else - phones, self-sorting rows on the SVG road, OGraf legality - until a real show asks for it.
One thing did ask, the same day: the production control profile the road reserved is built for
the first showing as two primitives, ARRANGE and COMBINE (§6), with the proof case as its evidence and
not its shape. The reasons follow.

---

## 1. What already exists - one contract, four fillers, five renderers

The generator reads three things out of a template and nothing else: the SPX definition's
DataFields (inputs), `NOACG_ANIM.machine` (buttons, greying, what » Next does) and the additive
`machine.controls` metadata (labels, sections, order, `payload`, `adjust`, `set`, `add`, `remove`,
`destructive`). No category is consulted, ever (`docs/CONTROL_LAYER.md`). Four roads fill that
contract today, and each fills the same three slots:

| Road | Who writes the contract | How it gets there | Panel today |
|---|---|---|---|
| Catalog type | an expert, in `src/templates/types/<id>.ts` | `attachMachine` at create | complete, proven on five types (`docs/CONTROL_PANEL_PARITY.md`) |
| Imported SVG | a recipe compiled from the artwork's roles | the same `attachMachine`, through `importedDesign/behaviour.ts` | complete for the 14 recipes in the registry, switches and choices among them |
| Agent or hand-written | the author, directly in the template's code | the template IS the contract | complete for whatever is declared - the 2026-08-22 round's five novel briefs each authored a working machine from scratch, and the control layer rendered them |
| Foreign OGraf package | the package's manifest | `control/ografContract.ts` reads `schema` + `customActions` + `stepCount` | complete minus what OGraf cannot say: every button live, no sections, no adjusts |

Five renderers draw the result and are measured not to diverge: the in-app Control tab, the
exported `controlpanel.html`, the hosted control page, the editor's Rehearse strip, and the
exported production controller. The production dashboard adds what a show needs above one
graphic: cues, layers, ⟳ Take, ± live numbers, the ⚡ actions block with sections, the snap
recovery picker. A graphic that declares nothing still gets the honest panel - fields plus
Take/Update/Next/Out - because the derived machine is a machine.

So "graphics that bring their own control panel" is not a feature to design. It is the property
the generator has had since Phase 5, and the third road is the one where nobody has yet been told
they may use all of it.

---

## 2. The recommendation, and why

**Recommendation: the control contract is the universal answer. Make it the thing the agent road
teaches, gates and proves, and add vocabulary only where a real graphic shows a hole.**

### 2a. What a graphic declares - the whole list

A graphic that brings its own panel declares five things, all in its own code, none of them UI:

1. **Fields, with kinds.** One DataField per thing an operator or a foreign host may change:
   text, lines, number, dropdown, toggle, colour, image. A `hidden` field is a holder the runtime
   reads and nobody draws (the countdown's minutes, the vote's status).
2. **A machine.** Groups, states, arrows. Operator arrows become buttons, timer arrows advance by
   themselves, the default path is what » Next and a dumb playout host walk. The structural guard
   is the whole guard - an event with no arrow from the current state is dropped, and the panel
   greys it for the same reason.
3. **Controls metadata.** Per event: the operator's word for it, its section, its order, what
   rides it (`payload`), what it moves (`adjust`), what it sets (`set`), what it appends
   (`add`/`remove`), whether it is destructive. This is what makes a goal one press and a reset
   red.
4. **Calls into the graphic's own runtime.** A state's timeline may `call` a function the
   template defines outside the marked region. That is where the graphic's own logic lives - a
   comparison, a sort, a paint - and it is legal there because it is the graphic's code, not a
   binding. The doctrine bans an expression language in the CONTRACT; it never banned a template
   from having JavaScript.
5. **Reported fields for anything a foreign host must reach.** `docs/OGRAF_STATE_IN_FIELDS.md`
   R1 and R2: if a controller that can only send data must be able to change it, it is a field
   the runtime reads back on `update()`, and the button that changes it `set`s the same field.
   That is what keeps "a generic OGraf host displays the graphic from standard data updates
   alone" true without a return channel.

What a graphic never declares: markup, layout, a panel. The panel is derived, on every surface,
with no per-graphic UI code. The owner's 2026-09-03 sentence is the fence on both sides - "no
bespoke panel UI code" and "the graphic can define whatever controls it needs" - and this list is
exactly what "whatever controls it needs" means today.

### 2b. Why this and not the alternatives, one line each

- **Per-graphic panel HTML, or a panel the agent writes.** Forks five-renderer parity, rots on
  every edit, and loses greying, recovery and the log for the graphic that has it. Rejected in
  `docs/CONTROL_PANEL_ROAD.md` §2 and rejected again here; Zero Density's declared-only custom
  actions are what a panel without a machine behind it looks like.
- **A control DSL or panel schema beside the machine.** A second store the code would have to
  agree with. The contract already carries everything a panel needs, and OGraf's `customActions`
  proves a flat declared action set is enough for the wire.
- **Wait for the production control profile.** The profile arranges controls a graphic already
  exposes; it cannot give a graphic controls it never declared. It is the second half of "just as
  the user needs it" and it is deferred on the road's own rule (first real demand shapes its
  vocabulary). The proof case may be that demand; §5 says where.
- **A recipe per show.** The SVG road's answer, and the right one for a drawn board. The proof
  case is prompted, not drawn, and a recipe for a five-person guessing panel would be a program
  written for one broadcast. The agent road exists so that nobody has to write it.

### 2c. What the third road is missing - the actual gap

The skill's own text (`cli/skill/noacg-graphic/references/contract.md` §5): *"Authoring your own
machine is a later capability."* Everything below that sentence already works. The road (§9)
recorded the owner retiring the 2026-08-08 rule on 2026-08-27 and naming three gates for an
authored machine: (1) `noacg validate` passes with machine checks, (2) the agent runs `noacg
inspect` and shows the user the derived panel so a human confirms the operator surface, (3) the
bench walks every operator arrow. Measured today: (1) exists - the `machine` finding is an error
and a stale interpreter is refused; (3) exists with a cap - `runtimeBench.ts` dispatches the
first eight authored operator events (`MAX_BENCH_EVENTS`) and checks the pose each produces, so a
graphic with more buttons than that has its ninth and later unwalked; (2) exists as a verb and as step 4 of the loop,
but the skill never tells the agent to author a machine, so the step is only ever reached with a
type's machine. `docs/GOALS.md` NEXT still carries "Agent-authored machines - the owner gate is
armed" as an open decision. The 2026-09-15 brief answers it: the proof case is an agent-authored
machine by definition.

---

## 3. The proof case, designed against today's vocabulary

Written out so the vocabulary is tested rather than assumed. Two graphics, one production, two
layers. Names are the operator's; the machine's ids are the agent's.

### 3a. The votes board - who did each person pick

- **Fields.** Song (text). Performer A, B, C, D (text; an empty row is not drawn). Panelist 1 to
  5 (text). Pick 1 to 5 (dropdown A/B/C/D, empty allowed). Correct (dropdown A/B/C/D). Shown
  (hidden, `votes`/`revealed`, the reported field for a foreign host).
- **Machine.** One group: `off` → `votes` (the entrance; names and picks on) → `revealed` (the
  correct performer lit, each pick marked right or wrong) → `out`. The default path is that walk,
  so ⟳ Take shows the votes, » Next reveals, ■ Out clears - and a playout host with nothing but
  `play`/`next`/`stop` drives the whole graphic, which is the dumb-playout contract.
- **Controls.** `reveal` labelled "Reveal performer", `payload: [correct]`, `set: { shown:
  'revealed' }`. The reveal is reachable two ways and they do not fight, the vote board's own
  pattern (`docs/OGRAF_STATE_IN_FIELDS.md` §4b): a NoaCG surface fires the arrow (» Next or the
  ⚡ button, and the button also writes Shown), while a data-only host writes Shown and the
  runtime reads it back on `update()` and paints the same look. Optionally one "Show pick 1..5"
  per row on a `set` per-row field, the survey board's pattern, if the producer wants the picks
  to land one by one.
- **Calls.** The `revealed` state calls `markGuesses()`, a function in the template's own JS that
  compares each pick to the correct answer and lights the marks. A comparison, in the graphic's
  runtime, invoked by name from a state - the exact shape `docs/SVG_BEHAVIOUR_PLAN.md` §8 reserves
  for "design-owned JS a professional or an agent writes".
- **Panel, derived.** Sixteen inputs, ▶/⟳/»/■, one ⚡ button that greys until the graphic is on
  air and after it has fired, a state chip reading Votes / Revealed, snap recovery. Over OGraf: a
  `schema` of sixteen properties, one custom action, `stepCount` 2. A stranger's renderer shows
  the picks from data and reveals on `playAction`.

This is the quiz board with five pickers instead of one. Nothing in it needs a word the
vocabulary lacks.

### 3b. The running total - who has guessed right so far

- **Fields.** Name 1 to 5 (text). Points 1 to 5 (number).
- **Machine.** `off` → `board` → `out`. A `flash` parallel group (`none`/`shown`) if the agent
  wants a scored row to pulse - the score recipe's shape.
- **Controls.** `+1` and `−1` per person, `adjust: { points3: 1 }`, section "Panelist 3". "New
  game" `set`s every points field to 0, destructive. Five people, ten small buttons and one red
  one - the shape `docs/SCORE_CONTROL_SURVEY.md` derived from every scoreboard console read.
- **Calls.** `update()` re-sorts the rows by points and animates them into place - GSAP moving
  the agent's own DOM on a data change. That is paint, not control, and it is the graphic's to
  do.
- **Panel, derived.** Ten inputs, the ± live numbers block (every operator-visible number
  field no ⚡ event carries as payload gets it, on air, partial updates), the ⚡ block in five
  sections, New game in red.

### 3c. The operator's minute at the first showing

Before the song: type the song, the performers, the five picks and the correct letter into the
votes cue; ⟳ Take. After the performance: » Next (or ⚡ Reveal performer). Read the board, then
on the totals cue press +1 under each person who was right. That is two presses plus one per
correct guess per song, and every one of them is in today's dashboard. The totals graphic stays up on its own layer for
the whole show; the votes board is taken and cleared per song.

Who that minute is for, since the 2026-09-16 answer: the host and the contestants reading the
room's SPX output, with the show's producers watching the operator. The presses are the same
ones either way. What changes is that a mistake costs a retake in the room instead of going out, so
the minute demonstrates how quickly the graphic was made rather than surviving a transmission.

### 3d. What the walk on paper found

Three findings, none of them blocking, listed so the proof walk (§5 row 3) knows what to look
at:

1. **The bench walks eight buttons and the totals board declares eleven.** The cap in §2c
   meets `+1` and `−1` for five people plus New game, so gate 3 leaves three presses unwalked on
   this graphic. Either the cap rises for a machine that declares more, or the proof walk presses
   the rest by hand and says so. Not a doctrine question, a number.

   What the walk on paper did NOT find, recorded because the first draft of this plan claimed
   it: the cue editor's field bands. `control/cueFieldGroups.ts` already bands NUMBERED rows
   ("Panelist 3 / Pick 3", "Name 2 / Points 2") by the same mirror test the A/B sides use, the
   alphabet that arrived with the score tracker. Both proof-case graphics band on their own
   titles; the lettered performers and the song fall into the shared band, as they should.
2. **A control's section is a static word.** The totals board's buttons sit under "Panelist 3"
   while the field beside them says "Katri". An additive `sectionField` on a control, naming the
   field whose current value heads the section, would put the person's name on the buttons on
   every surface. Nice for the first showing, not needed for it.
3. **"+1 to whoever was right" cannot be one press across two graphics, and should not be
   faked.** A graphic never reacts to another graphic, an `adjust` delta is static, and a total
   the graphic bumped internally would drift from the log and vanish on recovery - the drift the
   `adjust` mechanism exists to prevent. The honest answers are the operator's presses (today),
   then a combined control in the production control profile - Reveal, then after a beat the
   five +1s each offered as a tick, one ordered batch of already-declared events (§6, built for
   the first showing by the owner's ruling of 2026-09-15) - and only then the open design question
   `docs/SVG_BEHAVIOUR_PLAN.md` §13 already names - whether a DERIVED value can be a field. That
   question is not bent around here.

---

## 4. The three questions the brief asked

**How does an agent-made graphic declare its own panel?** In its code, as §2a: fields, machine,
controls metadata, calls into its own runtime, reported fields. The skill teaches it, `noacg
validate` gates it, `noacg inspect` prints the panel it will get, the bench presses its buttons
(the first eight today, §3d.1),
and `noacg save` puts it in the library exactly as a typed graphic. The OGraf manifest the
package carries states the same contract as `schema`, `customActions` and `stepCount`, with the
sections and adjusts riding `v_noacg`. Nothing is added to any format.

**Do the five votes come from an operator, or from the voters' phones through the audience join
page?** From the operator, for the first showing and as the standing default. The audience plane counts
anonymous votes per option: `audience_votes` is keyed by `(round, device)`, a device token is
never returned to an operator, and a tally is counts by option index. "Each person's vote" needs
five NAMED seats, which is a different round kind, not a setting. It is worth building only if
the production wants the panel to lock in from their phones, and it changes nothing about the
graphic: named picks would stage onto the same five Pick fields through the same road a poll
tally takes today (stage a cue, the operator takes it), so nothing viewer-written airs without a
press. Design it when a production asks; do not build it for the proof case.

**Does a running total need rows that reorder themselves, which no recipe does today?** No, and
the distinction is the useful part. Reordering is PAINT, and the control surface for a total is
names, numbers, `+1` per row and a reset - all shipped vocabulary. On the agent road the
graphic's own JS sorts on `update()`, and that is what the proof case does. On the SVG road a
drawn board cannot sort itself until the `arrange` paint mechanism exists (`docs/SVG_BEHAVIOUR_PLAN.md`
§2a, phase 5, waiting on its spike), and that stays parked: the proof case does not draw its
board. A recipe is the wrong tool for a graphic that is prompted rather than drawn.

---

## 5. What has to exist for the first showing, and what waits

Ordered by what would sink the demo. **These rows start now** (owner, 2026-09-15,
ALIGN-2026-09-15-4: work that is ready does not wait for its date). What the earlier dates still
need is the owner walks under `docs/GOALS.md` NOW, and none of the rows below touches a file or a
surface those depend on: the skill, the profile and the data tree are not on them. The
early-October production needs only the scoreboards and quiz boards that already exist. **The rows
below are what we BUILD; §5a is what the DAY needs**, and the two are not the same list.

| # | What | Why it is on this side of the line | Cost | Who |
|---|---|---|---|---|
| 1 | **LANDED 2026-09-15, pull request 270.** **The skill teaches the contract.** Retire "a later capability"; add §2a as a section of `references/contract.md` with a worked machine and controls block; make the three gates explicit steps of the loop - validate, inspect and SHOW the user the buttons, bench; teach the default-path contract and reported fields. One generated source, every shipped copy follows (`cli/scripts/build-skill.mjs`). | Without it the agent scaffolds a typeless graphic and ships state as fields - the measured failure mode of the 2026-08-22 round's free cells | one row; a CLI release after it (`npm run release:cli`, which a session may run) | one row, week of the 28th |
| 2 | **LANDED 2026-09-15, pull request 270**, in the same row. **Close the open gate in GOALS.** "Agent-authored machines - the owner gate is armed" is answered by the brief; record it in the retired owner rulings and move the GOALS line. | A doc that says the question is open will stop the next session | minutes | the same row |
| 3 | **WALKED 2026-09-15, pull request 271** - in-app only; publishing needed an env a linked worktree has not got. **Walk the proof case ourselves, once, end to end and timed.** Prompt Claude Code with the shipped skill, build both graphics, `save`, one production, publish, drive §3c from the dashboard, and file the owner-queue item with the route and the stopwatch. Fix what it finds; §3d says where to look first. | "Within minutes in front of the producer" is a number, and the numbers we have are 24.8 s of tool time for the seven verbs and, since 2026-09-16, the last hop as well: 7.4 s from `noacg save` returning to the graphic readable on a production's output URL, of which 0.7 s is the take | a day, plus whatever it finds | one row, first week of October |
| 4 | **LANDED 2026-09-15, pull request 274** - 24 arrows, and a `bench-events-skipped` finding for what it cannot reach. **The bench's event cap** (§3d.1): raise `MAX_BENCH_EVENTS` for a machine that declares more, or have `validate` say which buttons it did not press. | Gate 3 has to mean what §2c says it means on the first real graphic that needs it | an hour, plus one bench run | one row, with row 3 |
| 5 | **LANDED 2026-09-15, pull request 275** - migration 0058. **The profile's model and storage** (§6e): `Show.profile` v1 with ARRANGE and COMBINE, its parse/serialize/validate beside `shows.ts`, pinned at publish, baked at export, deletable in one action. Unit-tested offline. | Everything after it reads this shape; a wrong shape here is a migration later | a day | one row, week of the 28th |
| 6 | **LANDED 2026-09-15, pull requests 276 and 277** - migration 0059; the field half was refused in §7b and the acceptance text amended to match. **ARRANGE on all three dashboard deployments** (§6e): order, section, rename, hide, pin applied to the generated ⚡ block and the cue editor's fields; the "Controls" panel on the production page. Pinned by a spec on each deployment. | The football principle, on the surface the operator holds | two days | one row, after row 5 |
| 7 | **LANDED 2026-09-15, pull requests 278 and 279** - in-app, then the hosted page and the exported line; the hosted page's own buttons are gated from 2026-09-16 by `e2e/configured/hosted-control-profile.spec.ts`. **COMBINE, with `after` and `ask`** (§6b, §6d): the composer, the batch send through `control_send_many` one row per step, the visible countdown and its cancel, the per-step drop reported in the activity feed, on the in-app and hosted pages; the exported controller shows the line §6f gives it. Pinned by a spec that reads the rows off the wire, the way ± live numbers is. | The proof case's "one press", and the general capability the owner named | three days | one row, after row 6 |
| 8 | **WALKED 2026-09-16, twice.** Composed, driven and timed in-app (pull request 283); then published and driven on the HOSTED page in the configured suite, which is the rig with both a real backend and a throwaway account. AC-6, AC-7 and AC-9 all pass on that run and the walk re-runs on every landing. **The proof walk, again, with the profile** - row 3 repeated once rows 6 and 7 land: the Reveal-then-+1s combined control composed in the room's minute, driven from the hosted page, timed. Owner-queue item. | The demo is the profile in use, not the profile built | half a day | one row, second week of October |
| 9 | **LANDED 2026-09-16, pull request 280**; its migration 0060 refused itself on two post-land pushes, was corrected in pull request 283, and **applied to production and staging on 2026-09-16** (post-land run `35055657854`, one migration each, eight function grants). **A stepper on a bound field patches the shared value** - `docs/PRODUCTION_DATA_PLAN.md` §2.9's Phase 3: a `+1` (`adjust`) or a ± press on a field bound to production data writes the tree, on the in-app and hosted pages, and the graphic follows its binding like every other bound graphic; an unbound field keeps the field stepper unchanged, and so does the exported controller, which carries no tree (§6f). Pinned by a spec that reads the patch and the resulting `update` rows off the wire. | Without it a `+1` on one graphic is overwritten by the next shared write; with it, a score entered once shows everywhere (owner, 2026-09-15) | a day | one row, week of the 28th |
| 10 | **LANDED 2026-09-16, pull request 281.** **Bind all by title** - one button on the Data tab's bindings table that accepts every unambiguous title-to-leaf suggestion the table already computes, per graphic and for the whole production. | Graphics made with matching field titles, by hand or by an agent, bind in one press instead of one per field | half a day | one row, with row 9 |

Rows 5 to 10 are the owner's 2026-09-15 rulings (§6). Everything else waits, each with the thing
that would pull it up:

- **Named-seat voting on `/join`** (§4, question 2) - when a production asks for phones.
- **`sectionField` on a control** (§3d.2) - cheap, additive, after row 3 says whether it matters.
- **`arrange` for the SVG road** - the ranking recipe's spike, unchanged in priority.
- **Derived-value-as-field** - the bracket's and the auto-+1's shared question; a design of its
  own, never a corner of this one.
- **OGraf legality vendor block, GDD array shape, foreign packages in the dashboard** - the OGraf
  ladder in `docs/GOALS.md` NEXT, in its own order. A stranger's package already gets the honest
  panel through `ografContract.ts`; what it lacks is what the standard lacks.

---

### 5a. What the first showing actually needs

**Answered 2026-09-16** (the retired owner rulings ALIGN-2026-09-15-6). The day is a demonstration:
a score that updates so the host and the contestants can follow along, running on SPX, in front of
the show's producers and creators, to show how easily the graphic was made. A dated event gets
a clear list of what it needs and never the whole machine (owner, 2026-09-15), so here is the list
and the evidence for each line. It is short because most of it is already standing.

1. **A score that updates, readable as a follow-along.** EXISTS. Two walks cover the road between
   them, and neither covers it alone. Walk 1, in-app, 2026-09-16 (pull request 283,
   `docs/acceptance/owner-queue/2026-09-16-the-proof-case-with-the-profile-in-use.md`): both
   graphics of §3a and §3b prompted through the agent road, the combined control composed by hand,
   §3c driven - but nothing published, because a linked worktree carries no backend configuration.
   Walk 2, the same day, in the configured suite: a production carrying the profile published and
   driven on the HOSTED control page, where it now re-runs on every landing
   (`e2e/configured/hosted-control-profile.spec.ts`) - but the profile was written through
   `setShowProfile` rather than composed. So prompt-to-hosted has never run as one walk
   (`docs/work-specs/control-panel-any-graphic/evidence/ac-9-the-proof-case-timed.md`), and the
   follow-along itself is not in doubt: it is the totals board sitting on its own layer while +1
   presses move it, which §3c already describes.

2. **That score, playing out on SPX.** THE ONE GAP. Half of it is a choice nobody has made yet and
   half is a check only hardware can run. NoaCG has two doors into SPX and they hand the operator
   different products:
   - the **output embed** (`src/export/outputEmbed.ts`) - one SPX-legal file whose body is the
     production's own output URL, so SPX's Play and Stop move the frame while every cue, the
     combined control and the shared data stay with the NoaCG operator. This is the door the day
     wants. **It has never been run against a real SPX server**
     (`docs/acceptance/owner-queue/2026-08-25-spx-output-embed-on-a-real-spx-server.md`, open since
     2026-08-25, and the check needs a machine no session here has);
   - the **SPX starter export** (`src/export/targets/spxStarter.ts`) - a self-contained folder that
     is the strictest export gate we have and carries fields plus the default path, but by §6f no
     combined controls and no production data tree. It is the honest offline fallback, and it costs
     the profile.
   Comparing the two doors on the proof case is offline work nobody has done, and it is filed as
   `docs/backlog/which-door-into-spx-the-proof-case-uses.md` so the choice is made before a
   production depends on it.

3. **An authoring story that looks effortless to people who make graphics for a living.** EXISTS
   and is timed, with one honest hole. The skill teaches the contract (row 1), and the road is
   measured in three separate runs that are never added together: **32.6 s** of tool time for the
   seven authoring verbs and **5.8 s** to import the pack and land on the production page, both on
   walk 1 (`docs/acceptance/owner-queue/2026-09-16-the-proof-case-with-the-profile-in-use.md`); and
   **7.4 s** from `noacg save` returning to a readable frame on a public output URL, measured by
   `scripts/save-to-air-bench.mjs` against `noacg.studio`. None of them contains a human
   thinking, and nobody has done the
   minute with an audience watching - which is the half the producers will actually judge.

4. **Nothing else, and this is the part worth saying out loud.** The day needs no broadcast chain,
   no compatibility with the broadcaster's own playout, and none of the programme's graphics, which
   its own people make in post. Named-seat voting from phones stays where §4 put it, built when a
   production asks. The early-October production is a separate, earlier date and still needs only the
   scoreboards and quiz boards that already exist.

---

## 6. The production control profile - two primitives, and the proof that they are general

**Ruled 2026-09-15, after this plan's first landing: build the profile for the first showing.** The
owner's framing binds the design and is quoted in the retired owner rulings ALIGN-2026-09-15-2: the
"one press: Reveal plus a delayed action" case is EVIDENCE for a general capability, never the
workflow being designed around. NoaCG should control essentially any sensible graphic sequence -
reveal elements in different orders, trigger several related actions from one control, delay a
later action, and support graphic-specific controls without hard-coding each use case - while
the operator experience stays simple and nothing here becomes a general-purpose automation or
programming system. Prefer a small set of composable primitives.

### 6a. Where the line already is

`docs/CONTROL_PANEL_ROAD.md` §3 reserved the shape on 2026-08-28 and the owner confirmed it on
2026-09-03: additive presentation state on the Show, referencing capabilities the graphics already
declare; it may arrange, hide, rename, emphasize, group, pin and COMBINE controls, where a combined
control is an ordered batch of already-declared events, verbs and data patches; it may never
invent an event, carry logic or conditions, override structural legality or define behaviour;
deleting it always leaves the complete generated panel. Nothing below moves that line. What §3
left open - "the first real demand signal should shape the profile's vocabulary" - is what this
section closes, and the vocabulary it arrives at is two words.

The division of labour that keeps it small: **inside one graphic, sequence and timing belong to
the machine** (arrows, timer arrows, the default path - the graphic's own contract, §2a);
**across graphics and per production, they belong to the profile.** A profile never reaches into
a machine, and a machine never knows a profile exists.

### 6b. The two primitives

**ARRANGE** - per pool graphic, per control id: order, section, a shown name, hidden or not,
pinned or not. Presentation over declared capability. A hidden control is still guarded by the
machine, a renamed one still greys by the same table, and the generated panel is what remains
when the profile is deleted.

**COMBINE** - one named control the production makes out of STEPS. A step is exactly one thing a
surface can already send: an operator EVENT of a named pool graphic, with the payload rule its
control declares (a `payload` reads the cue's field, an `adjust` moves it, a `set` writes it - the
same `eventPayload` every surface computes today); a lifecycle VERB on a cue (Take, Update, Next,
Out); or a data PATCH of stated field values. A step carries two optional marks and no others:

- **after N s** - the surface waits that long before sending the step, shows the wait counting
  down on the button, and any Out or a press on the countdown cancels what has not been sent.
- **ask** - the step is offered as a tick beside the button and sends only when ticked, with a
  declared default. This is the whole of what a press may vary by, and it is a tick, never a
  value.

A step is resolved when it FIRES, not when the button was pressed: an `adjust` reads the figure on
the wire at that moment, so a delayed `+1` counts from what the audience is looking at. Every step
is one ordinary row in the one command log, attributed to the operator who pressed, guarded by the
machine of the graphic it targets. A step the machine drops is dropped alone; the rest proceed,
and the activity feed says which one did not apply. A combined control greys when its first step
is illegal, and its hover names each step.

That is the vocabulary. There is no third primitive, and there is no slot in either for a
condition, a comparison, a variable, a loop, a wait on something the graphic reports, or a wall
clock.

### 6c. Why these two are the right two - the general check

The owner asked for the design to be checked against graphics not yet designed rather than
against his example. Read against the standing challenge set (`docs/BEHAVIOUR_AUTHORING_RESEARCH.md`
§4), the game-show and late-night walk (`docs/SVG_BEHAVIOUR_SHOWS.md`) and the proof case:

| Sequence a show wants | Which half answers it | Steps |
|---|---|---|
| Voting show: reveal the performer, then three seconds later the +1s for whoever was right | COMBINE across two graphics: `reveal` on the votes board; after 3 s, five `+1` steps on the totals board, each marked **ask** | 6 |
| Awards: reveal nominees in the producer's order, a beat apart, then the envelope | COMBINE on one graphic: five per-row reveals (the survey's `set` per row) with after 2 s on each, then `envelope` | 6 |
| Late-night top ten: run the list by itself, one entry every four seconds | COMBINE: » Next on the cue, nine times, after 4 s each. The countdown is visible; Out cancels the rest | 9 |
| Football: the operator understands football, not the software | ARRANGE: pin Goal A, Goal B, Clock start, Clock stop; hide Clear flag and the ± corrections into a "More" section | 0 |
| Breaking-news wrap (C8): strap up and ticker resume together | COMBINE: two events on one graphic's two parallel groups | 2 |
| Election (C3): 25 / 50 / 75 / final, declare, retract | ARRANGE only - the machine already has every verb; the production orders the Counted section first | 0 |
| A rundown that advances itself (MXMZ's auto-advance, road §4) | COMBINE: Take cue 2 after 10 s, Take cue 3 after 10 s - the deferred feature falls out of the primitive rather than being built | n |
| Bingo (C5): call a number, undo, new game | Nothing - all three are the graphic's own controls, and `add`/`remove` already exist | 0 |
| Election night (owner, 2026-09-15): many graphics showing the same party and candidate figures in different looks, the numbers gathered by a feed or an assistant, nobody typing, and the operator still driving | SHARED DATA plus the contract: every graphic binds its figures to one production tree (`parties.kok.votes`, an array of scalars for a lines field), a connector outside the app writes the tree through the Data API as one more writer of the log, the operator's presses land after it and win, and the checkpoints and the declaration stay operator presses (C3). The profile arranges and combines as for any show. | 0 |

Seven of nine need nothing but the two primitives, two need neither, and none needs a third. The
same table read the other way says what the profile refuses, and each refusal is the graphic's
job or the operator's: "declare when the share passes 50" is a comparison (the operator declares,
C3's own lesson); "+1 to whoever was right" is a derivation across two graphics (the operator
ticks, §3d.3, until derived-value-as-field is designed on its own); "repeat until the operator
stops" is a loop (a fixed count with a visible countdown is honest, and Out is the stop).

**The two places the example could have bent the design, and did not.** A cross-graphic step
was tempting to special-case for "Reveal here, +1 there"; instead every step names its graphic,
which is what the awards and the auto-advance rows need too. And **ask** could have been a
per-person parameter of one macro; instead it is a mark any step may carry, which is what makes
"reveal the nominees, but skip the one who did not turn up" the same gesture.

**What would make this a programming system, refused by name:** conditions on steps, steps that
read a graphic's state or a field's value, named variables, loops, a step that waits for a report,
scheduling by wall clock, a profile that calls another profile. A show that needs one of those has
found a behaviour, and behaviours belong in the graphic's contract.

### 6d. The delay, against the two timing rulings

"No second clock" (owner, 2026-08-09, `docs/PLAYOUT_DASHBOARD.md` §8a ruling 2) forbids a per-play
timer FIELD that could disagree with an arrow's authored `after` inside a graphic. A combined
control's `after` is the controller pacing its own sends and never touches a graphic's timer;
the graphic still sees ordinary rows arriving in order. "An armed timer must be visible" (the same
ruling) is met on the surface itself: the button counts down and can be cancelled. What a delayed
step costs, stated so nobody discovers it live: the wait lives in the surface that pressed, so a
surface that reloads mid-countdown loses the unsent tail, the state chip shows what did not
happen, and the operator presses it by hand. Nothing is retried behind anyone's back.

### 6e. Storage, publish, surfaces

- `Show.profile`, additive-optional beside `Show.bindings` and on the same precedent: keyed by
  pool-graphic name then control id for ARRANGE, plus a list of combined controls; carries its own
  `v: 1`; older builds read past it (root `AGENTS.md` rule 6). Pinned onto `control_shows` at
  publish exactly as `bindings` is (`hostedControl.ts` `publishControlShow`), baked into the
  exported production controller at export. Deleting the profile is one action and restores the
  generated panel everywhere.
- **ARRANGE renders on all three dashboard deployments** - the in-app production page, the hosted
  control page and the exported controller - because it is presentation, `docs/PLAYOUT_DASHBOARD.md`
  says they must not diverge, and the exported one is built from the same `emitGraphic`. **COMBINE
  renders on the two NoaCG-hosted pages**; the exported controller is the offline fallback and
  carries the one line §6f gives it rather than a sequencer of its own. The combined controls sit
  in the ⚡ actions block under a section of their own, pinned controls above the fold; ARRANGE is
  applied to the existing block, not a new one.
- **Authoring is on the production page**, a "Controls" panel beside the cue editor: the generated
  controls per graphic with drag order, hide and rename; "+ Combined control" names it and adds
  steps by picking a graphic, then one of its controls or verbs, then the two marks. No text field
  takes anything but a name or a number of seconds. Not the CLI: a profile is a production's
  taste, and a library graphic stays clean of it.

### 6f. The boundary - portable graphics, NoaCG-owned production behaviour

**Owner, 2026-09-15, the third ruling of the day** (the retired owner rulings ALIGN-2026-09-15-3):
production data and bindings are ONE capability of the control model, never the whole of it; a
downloaded graphic must stay usable without knowing any NoaCG production path; and NoaCG's
multi-graphic state, sequencing and automation are not forced into a standalone HTML export where
that would create a second production runtime. Advanced behaviour lives in NoaCG's playout and
control layer and integrates with external playout systems from there.

Checked against the plan as it stands, the architecture already holds that line, and one sentence
in §6e was over the line and is corrected above. The control model has four parts, and each has
one home:

| Part | What it is | Where it lives | What travels with a downloaded graphic |
|---|---|---|---|
| The contract (§2) | what a graphic exposes: fields, machine, controls, reported fields | the template's own code | all of it - it IS the graphic |
| The profile (§6) | how a production arranges and combines what its graphics expose | `Show.profile`, above the command log | nothing |
| Shared data (§5 rows 9 and 10) | one value many fields follow | `Show.data` and `Show.bindings`, resolved by the sender into ordinary rows | nothing - a graphic never learns a path name |
| The renderers | whatever plays the rows: `/output`, CasparCG through it, an OGraf renderer later | below the log | the graphic plays there from data alone |

So a downloaded graphic - an SPX folder, an OGraf package, a standalone `controlpanel.html` -
carries its contract and nothing of the production. An external playout system is reached the way
every renderer is: the profile, the bindings and any later automation write rows above the log,
and the log reaches the renderer through `/output` today and the Server API facade later
(`docs/GOALS.md` NEXT, OGraf ladder). Nothing about a combined control or a shared value has to
exist inside a renderer for it to work there.

**The one place the line needed drawing: the exported production controller.** It is NoaCG's own
control layer packaged for a show with no network, built from the same generator, and
`docs/PLAYOUT_DASHBOARD.md` holds it to parity with the two hosted pages. Parity on the generated
panel and on ARRANGE stands, because both are presentation of the contract. COMBINE does not cross
into it: a sequencer with delays and ticks, inlined a second time in vanilla JS, is exactly the
second production runtime the owner named. The exported controller therefore shows, where a
production has combined controls, one line: *"This production's combined controls run from its
hosted control page"* - the same honest degradation a stranger's OGraf package gets on legality.
The same holds for shared data: the exported controller carries no tree and no bindings today, so
row 9's stepper change does not reach it, and its field stepper stays what it is. If an offline
show ever needs either, that is the demand that reopens this paragraph, recorded then, not
pre-built now.

**What this check did NOT change.** The two primitives, the step marks, the general table in §6c,
the refusals, the timing rule in §6d. The score example proves the shared-data row and nothing
else; the profile proves sequencing; the contract proves graphic-specific controls. None of the
three defines the others.

### 6g. What this changes above

§3d.3 now reads as the road to "one press": the operator's presses first, then a combined control
with `ask` on the +1s, which is the proof case in §6c's first row. §5 gains the rows that build
this. §8's decision 5 is amended. The reserved shape in the road is unchanged, so no other document
moves.

## 7. The constraints, checked

- **No expression language, ever.** The contract stays structural; the one comparison in the
  proof case lives in the graphic's own function, called by name from a state. No slot anywhere
  takes a condition.
- **The code is the truth; no hidden scene model.** Every declaration is in the template; the
  panel is a projection, never a store.
- **Controls are generated from the graphic's machine, never hand-built per graphic.** The agent
  writes a machine, not a panel; five renderers draw it.
- **A generic OGraf host displays the graphic from standard data updates alone.** Both graphics
  are fields plus a default path; the reveal mirrors into a reported field.
- **P2 is at DESIGN.** This file builds nothing. Rows 1 to 4 of §5 are P5 (the agent door) work,
  which is unparked; rows 5 to 8 are control-layer work under road §3, activated by the owner on
  2026-09-15. None of them touches an authoring surface: a profile arranges and combines what a
  graphic declares, and authoring what a graphic declares stays P2's question.

On Zero Density, held as the brief asked: the pattern worth learning is that a declared action
set with typed payloads is enough for a wire (their `customActions`, our `machine.controls` and
the exporter agree); the pattern not to copy is a runtime that acknowledges an action and runs
nothing. No code is read from it; it is AGPL and its runtime rides in every export.

---

## 8. Decisions made here, and what is his

Made here, recorded so they can be reverted rather than adjudicated:

1. The control contract is the one approach; no second declaration format is reserved.
2. Authoring a machine on the agent road is taught and gated; today it is only accepted.
3. The five picks are operator-entered by default; named-seat phones are a later round kind.
4. Reordering is paint; the agent road sorts in its own JS; the SVG road waits for `arrange`.
5. "+1 to whoever was right" is presses first, then a combined control whose +1 steps are
   ticks, and never an internal bump.
6. The rows start now and touch nothing the earlier dates depend on (§5); the wait was lifted
   by the owner on 2026-09-15.
7. The profile is two primitives, ARRANGE and COMBINE, and a step carries `after` and `ask` and
   nothing else (§6b). A third primitive or a third mark needs a graphic that cannot be served
   without it, walked and recorded.
8. Timing in a combined control is the surface's own wait, visible and cancellable, never a row
   the renderer holds back (§6d).
9. A downloaded graphic carries its contract and nothing of the production; combined controls and
   shared data live above the command log and reach any renderer as rows (§6f). The exported
   controller renders the panel and ARRANGE, and says in one line what runs from the hosted page.
10. A stepper on a bound field patches the shared value, and matching titles bind in one press
    (§5 rows 9 and 10). Both are the shared-data capability, one case of the control model.

**Needs him: nothing.** The one question the first landing put to him - whether to build the
profile for the first showing - he answered the same day (ALIGN-2026-09-15-2), and §6 is the design his
answer asked for.
