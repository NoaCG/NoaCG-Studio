# Behaviour authoring - the P2 research thread

Current editor scope is [EDITOR_PLAN.md](EDITOR_PLAN.md): imported SVG animation first,
templates/brands/rundown in R1, node-graph UI deferred. This file preserves existing runtime,
import or research knowledge; it does not authorize adding a node editor to the new workspace.


**Comparison update, 2026-09-13:** [OGRAF_STUDIO_RESEARCH.md](OGRAF_STUDIO_RESEARCH.md) finds
rich visual tracks and data collections, but Studio's declared custom actions currently only
acknowledge calls. It is therefore animation/binding evidence, not a replacement for this
behaviour-authoring investigation or NoaCG's executable machine/control contract.

**Status: research round 1, 2026-09-01.** Programme P2 (the retired programme register) runs as a standing
research thread by owner amendment: the search for the authoring surface starts now and never
pauses; implementation waits for evidence plus a ruling. This document is that thread's record -
the failure analysis the repo's own law demands as the starting point, the candidate interaction
models, the standing challenge-graphic set every candidate and every future implementation is
proven against, and the round-2 plan. Nothing here authorizes a build.

**The question** (`docs/GOALS.md`, "The core question"): drawing a graphic without code is the
easier half; the hard half is giving it LOGIC, and then CHANGING that logic, without code. Two
surfaces were tried and neither landed as a way a non-programmer authors logic: the canvas editor
and the node editor. The answer is not assumed to be a third editor.

**The doctrine that binds every candidate** (owner ruling, 2026-09-01): "no expression language,
ever" stands. Guarding is structural - states, transitions, events, timers, groups. A candidate
that smuggles expressions in through a side door is disqualified, and this document says so where
it happens. The doctrine reopens only on proof that a required behaviour is impossible or
materially worse structurally; the challenge set (§4) exists partly to force that proof one way
or the other.

Companion docs: `STATE_MACHINE_SCHEMA.md` (the model), `CONTROL_LAYER.md` (what authoring feeds),
`GRAPHIC_TYPES.md` (behaviour as declaration), `GRAPHIC_BEHAVIOUR_PLAN.md` (the attach road),
`EDITOR_RESEARCH.md` §4f (the behaviour ladder this round tests level by level).

---

## 1. Why the node editor did not land as an authoring surface

First, the honest scope of the failure. The node editor (`src/components/timeline/MachineGraph.tsx`
over `src/blocks/machineEdit.ts`) is not broken software. Its mechanics passed every probe of the
2026-08-28 editor audit - port-drag arrows, transition style cards, guarded deletes, materialize-
on-first-edit, live state highlighting, break-fearlessly reset - and `e2e/machine-graph.spec.ts`
pins the whole acceptance walk nightly. As a VIEWER of behaviour, and as a pro's escape surface,
it shipped fine and it stays. What did not land is the claim that a non-programmer AUTHORS logic
there. The owner's verdict ("it did not really work out", recorded in `docs/GOALS.md` THEN 2 and
`EDITOR_RESEARCH.md` §1d) is about route and audience, not code - and the ranked causes below are
why a third graph, or a better version of this one, would fail the same way.

**Cause 1 - the graph speaks the model's language, not the producer's.** A graph asks its author
to think in the formalism's nouns: states, transitions, events, groups. A producer thinks in show
verbs: "when I press Lock, the pick freezes"; "it clears itself after eight seconds". The mapping
between the two is exactly the expertise the surface was supposed to make unnecessary. Evidence
that this is the load-bearing cause, not a taste guess: the one behaviour-authoring flow that DID
land with the target audience - the SVG import behaviour step (`GRAPHIC_BEHAVIOUR_PLAN.md`
§10-§11) - never shows the machine at all. Pick a named behaviour, point at layers, done in about
fifteen clicks by hand on a student's own Illustrator file. The machine and the buttons were
"free" (the plan's own words); the graph was never part of what made it work. Externally the same
split shows everywhere `EDITOR_RESEARCH.md` §2 looked: Rive's community names the state machine
as the product's learning cliff even for motivated designers, and Unreal - with a full broadcast
state-machine plugin on the shelf - teaches form-filling behaviours first and demotes the graph
to the bottom of its ladder.

**Cause 2 - authoring-from-blank was second-class by design, and the model's judgment calls have
no home on the surface.** The shipped editor is "optimized for inspect-and-tweak first,
authoring-from-blank second" (`GOALS_ARCHIVE.md`, the Phase 4 record) - it was built as a viewer
that can edit. Facing a derived three-state machine, nothing on the graph suggests what a quiz
needs; and the model's real design decisions are expert judgment the surface cannot carry: one
`Selected` state plus a field versus four near-identical states ("parameterize with data, not
states"), parallel group versus mutually-exclusive states in one group ("a modelling decision
each type makes, not a house default" - `GRAPHIC_TYPES.md` §6b), a timer never arming on a
timeline that never ends. Every shipped machine that gets these right was designed by an expert
in a type file. The graph hands a beginner the same blank page it hands the expert, minus the
judgment.

**Cause 3 - the authored state is worthless without its paint, and the paint lives elsewhere.**
`GRAPHIC_BEHAVIOUR_PLAN.md` §4 named the hard problem precisely: a state means nothing on
somebody's artwork until someone decides what it LOOKS like there. The graph edits topology only.
An author who draws `Locked` has produced an invisible no-op until they leave the graph and author
a timeline or a drawn-state binding - so the surface's own loop never closes, and the reward for
learning the formalism is a box that does nothing. The import road inverted this: it starts from
the drawn moments (the designer's own layers) and the states come along invisibly.

**Cause 4 - the loop to the operator's artifact does not close either.** The point of authored
behaviour is the generated control surface, and the graph shows no panel. Worse,
`machine.controls` - the labels, sections and adjusts every real panel needs - has no editor at
all (`EDITOR_RESEARCH.md` §1b, level-1 list): the graph edits events, nobody edits their
presentation. So even a successful graph session ends short of the thing the producer wanted.
The event strip and Rehearse panel exist and are genuinely ahead of the market, but they sit on
other tabs; the mockups in §5 all treat "the panel appears as you author" as non-negotiable.

**Cause 5 - route and audience, the secondary cause.** The graph lives behind the ◇ States toggle
in the timeline dock of the editor, and the editor is Advanced mode - the surface the student
release deliberately demoted. The target user never arrives. Real, but fixing the route without
causes 1-3 would only deliver more people to a surface that fails them.

**The canvas half is the sibling's.** The WYSIWYG canvas editor's own failure analysis is being
written into `docs/WYSIWYG_PLAN.md` and is not duplicated here; the one-paragraph summary that
matters to THIS thread is that the canvas failed at a different job - direct manipulation of the
graphic's look - and its lessons bind P7, not the logic question. The two failures share only the
conclusion GOALS.md already draws: neither a better canvas nor a better graph is assumed to be
the answer.

**What survives into every candidate.** The machine model itself is not implicated in the
failure - it is proven at scale (65+ types, five acceptance criteria, the control layer, OGraf
alignment) and no candidate below replaces it. The graph survives as the pro/escape surface and
the debugging view. The failed part is the ENTRY: the surface a non-programmer meets first.

---

## 2. What the target user actually does - the authoring moments

Derived from the real shows this repo has records of (the quiz and scoreboard productions, the
2026-08-27 operator stories, the live-vote thread, the §4 briefs' source formats). These are the
verbs a producer thinks in; a candidate surface is judged by how directly each moment maps onto
one gesture there.

1. **"I need a Lock button."** The producer names an operator press by the word the operator will
   read mid-show. The button IS the mental primitive; the event and arrow are its consequences.
2. **"When I press Reveal, the right answer flips green."** A press plus a visible outcome - the
   moment couples a transition to its paint, which is why a surface that authors topology without
   look (cause 3) feels like nothing happened.
3. **"This week, no lock - reveal straight away."** The CHANGE claim, verbatim from the owner's
   framing of the core question. Removing a step from an arc must be one comprehensible act, on a
   graphic the current producer did not author.
4. **"It clears itself after eight seconds."** A timer. Producers state it as a property of the
   graphic, not as an arrow between named states.
5. **"Goal: the flash and the +1 in one press."** An event with data riding it - the shipped
   `adjust` mechanic. The producer thinks of it as one button doing two things atomically.
6. **"The alert has to come in over whatever is up, and leave everything as it was."** A parallel
   group. The producer never says "parallel group"; they say "over" and "as it was".
7. **"Same three calls for every lot."** Reuse across items - one arc plus a data field, never a
   copy per lot. The parameterize-with-data rule stated as a producer's economy instinct.

Moments 1, 2 and 3 are the ones both failed surfaces served worst; moments 6 and 7 are where a
weak candidate will quietly generate state explosions the model forbids.

---

## 3. Candidate interaction models

Six candidates, each assessed against the four fixed rulers: the structural doctrine (no
expressions, anywhere, including disguised ones); the existing schema (positional binding
`defaultPath[i]` = `steps[i]`, the default-path compatibility contract, the frozen-interpreter
pairing rule - `src/blocks/AGENTS.md`); the generated control layer (one generator, five
renderers, `machine.controls` as the metadata); and the owner's bar ("If I can't automatically
understand what it is, it's probably not good enough yet").

Every candidate is a PROJECTION of the one `NOACG_ANIM` machine, writing through the same
`machineEdit` mutators and `writeAnimData` - a level is never a store (`EDITOR_RESEARCH.md` §4f
invariant). A candidate that needs a second model is disqualified before assessment.

### M1 - Behaviour recipes (the graphic-types road, generalized)

Pick a named behaviour - quiz, scoreboard, auction call, cycler - then parameterize it with
structural options: "Require Lock before Reveal" on/off, "Reveal by itself after N s", "Allow
re-opening after Going twice". Every option adds or removes arrows and states from an
expert-designed machine; the panel updates live. This is the shipped attach road plus the one
thing it lacks: the options, which are exactly how "the next producer wants no lock" becomes one
checkbox instead of a machine edit.

- *Doctrine:* clean by construction - options are structural variants an expert authored; there
  is nowhere to type anything.
- *Schema:* clean - a recipe compiles through `attachMachine`/`compileMachine` exactly as types
  do today; an option is a filtered declaration (the §10 pilot already filters the audience
  branch out of `ANSWER_BOARD_MACHINE`, proving the mechanism).
- *Control layer:* free - `TypeControlEvent` declarations ride each recipe.
- *Owner bar:* strongest of the six - a recipe is named in show language and its read-back is a
  sentence list.
- *The honest limit:* it authors nothing novel. A behaviour nobody wrote a recipe for is out of
  reach, and the library grows from recorded demand (`src/feedback/`), not from the user's own
  hands. Claim (a) "the behaviour their show needs" is covered only as far as the library
  reaches; claim (b) is covered brilliantly for the variations each recipe anticipated and not
  at all beyond them.
- *Risk to watch:* option sprawl. A recipe with twelve toggles is a worse graph. The §4 briefs
  test where the option model runs out.

### M2 - Question-driven composition

"What makes it happen - a press or a timer?" "Which press?" "Only from which look?" "Where does
it go?" Each answered question adds one transition; a new answer can mint a new state or event.
The grammar is a fixed interview, so there is no free text except NAMES.

- *Doctrine:* clean if the questions only ever offer structural answers. The trap is the tempting
  fifth question - "only when...?" with a value comparison - which is the expression language
  wearing a costume. Disqualified the moment it appears; the "only from which look" question IS
  the guard and the whole guard.
- *Schema:* clean - each completed interview is one `machineEdit` mutation.
- *Owner bar:* good during creation, poor afterwards - an interview leaves no readable artifact.
  Assessment: M2 is not a standalone surface; it is the ADD flow of whichever surface holds the
  readable result (M4 embeds it exactly so; M6 embeds a button-anchored variant).
- *Verdict:* fold into M4/M6, do not prototype alone.

### M3 - State strip (timeline of states)

States as cards in a row - the default path as the spine, branch states as cards below it,
arrows drawn by dragging card to card. Essentially the step timeline's vocabulary extended
sideways to branches.

- *Doctrine and schema:* clean; the strip is close to what `timelineKind` and the dock already
  draw, and the positional binding maps directly onto the card order.
- *Owner bar:* good for linear reading; the moment branches, rejoins and parallel groups appear
  the strip becomes a graph drawn worse - the layout fights exactly where the behaviour gets
  interesting. It also inherits graph causes 1-3 nearly intact: cards are still the formalism's
  nouns, blank-canvas guidance is still absent, the paint still lives elsewhere.
- *Verdict:* not shortlisted. Its good half (the spine as cards) already exists as the step
  timeline; its new half re-fails the graph's test.

### M4 - Sentence board (rule rows, structural grammar)

The whole behaviour as a list of sentences, one per transition: "When the operator presses
**lock**, while it shows **Answer picked**, go to **Locked**." / "After **8 s** in **Locked**, go
to **Revealed** by itself." Every slot is a pick from a list - a press, a look, a duration -
never typed prose. Adding a sentence is the M2 interview; deleting one is changing the logic;
reading the board IS reading the machine. `EDITOR_RESEARCH.md` §4f names this level 2 of the
ratified ladder and says the grammar is where it succeeds or fails - this candidate is that
grammar, made concrete.

- *Doctrine:* clean, with the fence stated: the "while it shows" slot is a state pick, and there
  is no clause slot into which a comparison could ever be typed. The Chyron lesson (a nice
  Conditions tree ends in `ReadFile()`) is the named failure this grammar refuses. A payload
  riding a press ("the amount rides it") is data, not a guard, and stays legal.
- *Schema:* clean - a sentence is precisely one `AnimTransition`; the board is a projection of
  `machine.groups[].transitions` with the walk's own lifecycle edges shown read-only. Parallel
  groups render as sections of the board ("Meanwhile, the clock:"), which is the first surface
  where groups have a natural plain-language form.
- *Control layer:* direct - a sentence naming a new press makes a button appear; the board is
  also the natural place `machine.controls` curation (label, section) finally gets an editor.
- *Owner bar:* the read-back test is the board itself; §5's mockup exists to test exactly this.
- *The honest limit:* sentence count. The quiz is seven sentences; a two-group scorebug with
  clock is ~12. Somewhere above that the board needs grouping to stay readable, and a board of
  40 sentences would fail the bar as surely as a graph of 40 arrows.

### M5 - Demonstrate-by-example

Rehearse mode records: the author presses buttons and arranges looks, and the system writes the
arrows demonstrated. Assessed because "arrows drawn by demonstration" keeps being proposed.

- *The structural problem is circular:* to demonstrate a press, the press must exist; to exist,
  the arrow must be authored. Demonstration can therefore only rewire what already exists, or it
  must infer - and inference from examples is where hidden conditions creep in ("it seems you
  only press this after that") which the doctrine forbids and the determinism contract cannot
  honour. Verified against the model: an inferred machine cannot be shown truthfully in advance,
  so `validateMachine` could never gate it honestly.
- *Verdict:* rejected as an authoring model. One narrow gesture survives it: drawing an arrow by
  doing (press-and-hold a button in Rehearse, then pick the destination look) as an affordance
  INSIDE M4/M6 - recorded, never inferred.

### M6 - Panel-first (buttons make the machine)

The author builds the operator panel - the artifact the show actually runs on - and never sees a
machine. "Add a button" asks three things: its name (the word the operator reads mid-show), when
it may be pressed (tick the looks it works from), what the graphic shows afterwards (pick or mint
a look). The machine falls out and is shown only as a read-back strip. Authoring moment 1 ("I
need a Lock button") is the primitive, and `machine.controls` metadata is authored in the same
gesture as the arrow - the two things the graph left orphaned.

- *Doctrine:* clean - "when may it be pressed" is the structural guard phrased as the producer
  already thinks of it; multi-select of from-looks writes one arrow per look, no conditions.
- *Schema:* clean for operator arrows; timers and lifecycle edges need a home the panel does not
  naturally give them (a timer is not a button - it renders as a card in the read-back, authored
  through an M2-style question). Parallel groups are representable (a button may belong to the
  clock group) but the panel view flattens the group structure the model keeps deliberate.
- *Control layer:* the closest possible alignment - the surface IS the generated panel, so
  build mode and rehearse mode are the same artifact and the loop closes by construction.
- *Owner bar:* the panel is the one artifact every producer already understands; the open
  question is whether the read-back strip suffices as the answer to "what does this graphic do"
  or whether panel-first authors machines people cannot later read - which is M4's strength.
- *The honest limit:* it centers events over states. A behaviour that is mostly looks and timers
  with few presses (the weather cycler) authors awkwardly from the panel side.

### The shortlist for round 2, and why

**M1 (behaviour recipes) and M4 (sentence board, with M2 as its add flow).** They are not
competitors - they are the two rungs of the ratified ladder (`EDITOR_RESEARCH.md` §4f: named
behaviours, then sentences, then the graph), and the working hypothesis this round hands to
round 2 is that they COMPOSE: a recipe gets a producer a proven machine in one pick; the sentence
board is what the recipe's result reads back as, and where the producer goes when the options run
out - the same document, one projection deeper. Claim (b), "the next producer changes it", is
served twice over: by a recipe option where one was anticipated, by deleting a sentence where one
was not. M6 is the reserve candidate: its mockup was built because the panel-anchor question -
whether M4's add flow should start from the button rather than the sentence - is cheap to test
and the answer folds into M4 either way. M3 and M5 are not carried forward, for the reasons
above.

---

## 4. The challenge-graphic set

The standing evaluation set. Every candidate surface, and every future implementation, is proven
against these - never only against the quiz and scoreboard it was built around (the
challenge-scenario rule, the retired 2027 North Star §4). Each brief names the graphic, the
operator's verbs, the machine it implies, and the TRAP - the place a weak model or a weak surface
fails, chosen so that between them the eight briefs cover every deferred or dangerous corner:
data-condition temptation, state explosion, parallel groups, interruption, off-path rejoins,
timer edges, and the reach of the no-expressions doctrine itself.

**C1 - Debate clock with overtime.** Two speakers, per-speaker running clocks, a hold, and an
overtime look. Verbs: start A, start B, hold, overtime, reset the segment. Implies: one `turn`
group (A speaking / B speaking / held), a parallel `phase` group (regular / overtime), clock
values as data. *Trap:* the overtime transition begs to be "when the clock reaches zero" - a
data condition. The structural answer is an operator press or a timer arrow from a fixed-length
state; a candidate that offers a value trigger is disqualified on the spot, and a candidate that
cannot express the behaviour WITHOUT one is the doctrine's reopen evidence. (The shipped
convention already rules a related case: no timer edge on operator-visible state,
`docs/OGRAF_STATE_IN_FIELDS.md`.)

**C2 - Silent-auction board.** Lots with a current bid; going once / going twice / sold per lot;
a late bid steps the call back. Verbs: next lot, new bid (amount), going once, going twice, sold.
Implies: ONE call arc plus `lot` and `bid` fields, the bid riding the `bid` event as payload.
*Trap:* per-lot state explosion - a weak surface lets the user author "Lot 1 sold", "Lot 2
sold"... The parameterize-with-data rule must be carried by the surface, not remembered by the
user.

**C3 - Election night with checkpoint states.** A results board that moves through counted
checkpoints (25% / 50% / 75% / final), with "too close to call" and "declared" as separate facts.
Verbs: advance checkpoint, declare, retract, back to undeclared. Implies: a `count` group walking
checkpoints (the default path - SPX `next()` must still walk it dumbly), a parallel `call` group
(undeclared / too close / declared). *Trap:* "declare when share > 50%" is the expression
temptation again, this time where the real-world rule genuinely IS a number - the structural
answer (declaring is an editorial act, an operator press, never a computation) must feel right on
the surface, not like a workaround. Second trap: retract - an arrow back - distinguishes models
that treat the machine as a one-way wizard.

**C4 - Weather five-day cycler with alert interrupt.** Five day-cards cycling on a timer; a
weather alert takes over the frame at any moment and leaves the cycle where it was. Verbs: start
the cycle, hold, skip, alert, all-clear. Implies: a timer-driven `cycle` group (self-transition
beat, the ticker pattern), a parallel `alert` group (off / alert). *Trap:* interruption. If the
alert is modelled IN the cycle group, resuming "where it was" is impossible without state
explosion; the parallel-group answer must be the one the surface leads to. This brief walks
straight into the model's consciously-deferred corner (interruption priorities,
`STATE_MACHINE_SCHEMA.md` §6) - what it must prove is that the deferred feature is not needed for
this, or produce the evidence that it is.

**C5 - Bingo caller.** A called-number board: call a number, the board marks it, undo the last
call, new game. Verbs: call (number), undo last, new game. Implies: almost NO machine - one
board state, `call` as a self-transition carrying the number as payload, the board painted from
data; new game is the two-reset rule (data reset + visual snap) surfaced as one operator act.
*Trap:* 75 states. A surface that invites a state per number fails instantly; the brief also
tests whether "undo" is correctly authored as a data correction rather than a state walk - and
whether the surface can say honestly that the RIGHT machine here is nearly empty.

**C6 - Tournament bracket advance.** An eight-team bracket; a winner advances per match; a
crowning look at the end. Verbs: advance (winner), highlight a match, crown. Implies: the
competition pack's own argument (`GRAPHIC_TYPES.md`: one `advanced` state plus the match/team as
payload - the ⟳ self-transition), a `crowned` branch off the walk. *Trap:* the bracket LOOKS like
a state diagram, which seduces both users and surfaces into modelling the tournament rather than
the graphic. The machine is three states; the bracket is data.

**C7 - Lyric / liturgy stepper with chorus jump.** Verses in order as the default path; from any
verse, jump to the chorus and come back to where the walk left off. Verbs: next verse, chorus,
back to the verse. Implies: the default path as the verses (the SPX contract - `next()` alone
must still step it), the chorus as an off-path branch state with authored jump and rejoin arrows.
*Trap:* the positional binding. "Come back to where I was" from a branch is the model's
canonical-path and rejoin mechanics under load; a surface must make the jump-and-return
authorable without breaking `defaultPath[i] = steps[i]`, and a model that quietly proposes "the
chorus remembers the previous state" has invented a variable - the doctrine's line again.

**C8 - Breaking-news wrap.** One graphic carrying a strap, a ticker and a countdown to the top of
the hour - three independent things on air at once. Verbs: strap up/down, ticker hold/resume,
countdown arm/hold. Implies: three parallel groups, each trivial on its own; the countdown's
armed/running/held is the sports clock's three-state lesson. *Trap:* composition. Every candidate
authors ONE behaviour well; this brief asks the surface to hold three at once without the
combined view collapsing (the sentence board's section-per-group answer, the panel's grouping,
the recipe model's "can two recipes coexist" - which the attach road currently forbids:
one behaviour per graphic, `GRAPHIC_BEHAVIOUR_PLAN.md` §12).

The set is standing: a brief is never retired by being passed once - it is the regression suite
for authoring. New briefs are appended when a real show asks for a behaviour outside these
shapes, the way §12's live vote arrived.

---

## 5. The mockups

Three clickable single-file prototypes, no dependencies, fake data, real interactions - each
demonstrates the authoring loop closing: add a state or sentence or button, and watch the
generated operator panel change, then rehearse against the structural guard (greying included).
They are TASTE probes for the owner and protocol material for round 2, not implementations.

| Model | File | Artifact |
|---|---|---|
| M1 Behaviour recipes | `docs/design/behaviour-authoring/recipes.html` | <https://claude.ai/code/artifact/95424d4a-268a-4611-aedb-1735dd07d621> |
| M4 Sentence board | `docs/design/behaviour-authoring/sentence-board.html` | <https://claude.ai/code/artifact/84402755-4561-428d-b422-9bfa367c5e88> |
| M6 Panel-first (reserve) | `docs/design/behaviour-authoring/panel-first.html` | <https://claude.ai/code/artifact/313fe9bd-5007-4468-af1e-86c43f9d1dca> |

Each carries the round-2 change test in its own data: the recipes mockup makes "remove the lock"
one checkbox; the sentence board makes it two deleted sentences and one added; the panel mockup
ships the auction with SOLD missing, to be added button-first.

---

## 6. Round 2 - what gets prototyped, and the evidence gate

**Prototype.** Promote M1 and M4 from mockups to prototypes wired to the real model, so a
prototype cannot lie about expressibility: authoring gestures write an actual `NOACG_ANIM`
version-2 machine through the `machineEdit` mutators, `validateMachine` gates every result, and
the panel is rendered by the real generator (`controlModel.ts` fieldDescriptors/eventButtons/
eventLegality), not a hand-drawn imitation. The M6 panel-anchor question rides along as an A/B of
M4's add flow. No product surface changes; the prototypes live beside the app the way the
mockups do.

**Paper pass first.** Before any user touches them, each candidate is walked against all eight
challenge briefs on paper: can the model express the brief at all, which gestures it takes, and
where the graph escape hatch is reached. Recorded per brief in this document. A candidate that
cannot express six of the eight without falling through to the graph does not go to user testing.

**The proxy protocol.** Per candidate, three tasks with a non-programmer proxy (someone who did
not build it - the owner counts; a student proxy if one is available before the class):

1. **AUTHOR** - build C2 (auction) and one more brief from its one-paragraph story, unaided.
2. **CHANGE** - remove the lock from a quiz someone else made (claim (b), verbatim).
3. **READ** - shown a machine they have never seen (C4), say what the graphic does and what the
   operator can press right now.

Timed, hints counted, first-confusion noted. The read task is the owner's bar made into a
measurement: the surface passes only if the read-back is correct WITHOUT explanation.

**The evidence that would justify implementation (the ACTIVE gate).** Per the register, P2
implementation needs evidence plus an owner ruling. This round proposes the evidence bar: a
candidate covers at least six of the eight briefs on the paper pass without the graph; the proxy
completes all three tasks unaided on at least two briefs with a correct read-back; no step
anywhere required an expression, a second model, or knowledge of the schema's vocabulary; and the
owner's taste ruling on the prototypes is positive. Meeting the bar makes implementation a stage
PROPOSAL to the owner - never an automatic start.

**The verification arm, in parallel.** The register's P2 stages name the property-test harness on
the `machineEdit` mutators, the event queue and snap recovery. It is round-2 work that needs no
UX decision: the mutators are pure, the invariants are stated (`defaultPath.length ===
steps.length`, one `(from, event)` pair per group, waypoints unique, dispatch determinism), and
the harness hardens whichever surface wins. It should start beside the prototypes, not after
them.

**What round 2 does not do.** No product surface ships, no schema change is proposed (every
candidate lives inside version 2 as-is), and the graph is not grown - `EDITOR_RESEARCH.md` §8's
"how much graph investment" question stays parked until the ladder's lower rungs exist and show
what the graph is still needed FOR.
