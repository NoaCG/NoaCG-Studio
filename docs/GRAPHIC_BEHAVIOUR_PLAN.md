# Giving an imported graphic its BEHAVIOUR

**Status: the PLAN (§1-§9) was written 2026-08-22 for review; §10 onwards record what was BUILT.**
§1-§9 are left as written, deliberately - a plan edited after its own result can no longer be read
back against what it promised. Read §10 to §13 for what stands today: §12 is the THIRD BEHAVIOUR §6
said to wait for, and §13 the fifth. **The SCORE TRACKER (the fourth, 2026-09-03) has no section
here** - its record is its own module header, `src/templates/importedDesign/scoreBehaviour.ts`, and
`docs/SCORE_CONTROL_SURVEY.md` for how its buttons were chosen. **What replaces the five modules with
one binding format is `docs/SVG_BEHAVIOUR_PLAN.md`** (2026-09-05): it reads §10-§13 as a
decomposition and plans the port; this document stays the record of what each behaviour found.

**The goal it serves** (`docs/GOALS.md`, `## NOW`): a student draws their own graphic, gets the
behaviour their show needs onto it, and plays it out - without writing a line of code. The two
graphics that decide it are a **QUIZ** (lock the answer, reveal it) and a **SCOREBOARD**
(score + / -). The autumn's productions are quizzes and keeping score, which is what makes those
two the right pair rather than an arbitrary one.

**The larger question behind it** is the north star's: how does a non-programmer give a graphic
logic, and then CHANGE that logic. This plan is a first probe at it, not an answer to it.

---

## 1. What this is not

- **Not a new editor.** The state engine, the step timeline and the node graph all exist and all
  work on an imported SVG (measured, §2). A fourth authoring surface is not the missing piece.
- **Not a category feature.** Owner, 2026-08-22: every imported graphic must be able to carry
  whatever behaviour it needs. Nothing here may key off a category.
- **Not AI authoring a state machine.** Standing owner rule. AI may PROPOSE a binding a person
  confirms; it never writes the machine.

## 2. What already works, measured 2026-08-22

Walked in the browser on `docs/svg-samples/scorebug.svg` and `outlined-title.svg`.

- **SVG import is real and good.** Drop an SVG and the wizard rewires itself: Prepare/Text become
  one **Fields - map text layers** step. From the scorebug it read `Home team`, `Home score`,
  `Away score`, `Away team`, `Match clock`, `Competition`, `Stage`, `Home crest` - decoding
  Illustrator's `_x20_`, splitting tspans, typing figures as `number`, offering `12:00` as Text or
  Countdown, offering the `<image>` as swappable, resolving all three typefaces to bundled faces.
  The outlined file correctly found no bindable text and offered the glyph group as an outline row.
- **The generated template already carries the whole state engine.** `noacgDispatch`, `noacgSnap`
  and the serial queue are emitted into the imported SVG. `NOACG_ANIM` is version 2 with
  `steps: [Enter, Out]` and **no `machine` key**. The runtime is there; only the data is absent.
- **The editor gives it a per-layer timeline and a state graph.** The timeline dock lists the SVG's
  own groups; the **◇ States** tab shows `○ Off → ▶ Enter → ■ Out` ("derived from the steps") with
  `+ state` and `+ parallel group`, and `+ state` offers a pose state, a step on the path, or a
  timeline seeded from any layer.
- **`attachMachine(type, template)` is already a generic transform.** It compiles a type's
  declaration onto any template's anim data and writes it in; `missingParts(type, template)`
  already checks whether a template carries the selectors a type requires
  (`src/templates/types/graphicType.ts`).

**And the surprise: the SCOREBOARD may need no behaviour work at all.** A `number` field becomes a
**stepper with + / -** in every control surface, with no per-template code
(`src/control/controlModel.ts`, `src/control/controlPanelHtml.ts`). The imported scorebug already
typed both scores as `number`. So "score + / -" is a data field, not a machine.
**This is unverified end to end** - nobody has taken that imported scorebug to a production and
pressed the buttons - but if it holds, half the September goal is a walk, not a build.

## 3. What a "behaviour" actually is, taken apart

From the shipped quiz (`src/templates/types/answerBoard.ts`, `src/templates/quiz/shared.ts`),
lock-and-reveal is four separable things:

| Piece | What it is | Can it move to someone else's artwork? |
|---|---|---|
| **1. The machine** | States `selected` / `locked` / `sealed` / `audience`, operator events `select`, `lock`, `revealChoice`, `judge`, `audience`, structural guards | **Yes, free.** Pure data. `attachMachine` writes it onto any template today. |
| **2. The controls** | `TypeControlEvent[]` - the buttons, labels, sections, payload fields | **Yes, free.** Generated from the machine; travels in the template. |
| **3. The structure** | `.quiz` root, an ordered `.quiz-option` list, three hidden holders (picked letter, correct letter, audience results) | **This is the binding problem.** Someone must say which SVG layers these are. |
| **4. The look of a state** | CSS + a GSAP tween: `.quiz-sel` on the picked row, `.quiz-locked` on the root, right/wrong treatments | **This is the hard problem.** Our CSS assumes our design tokens; the artwork is theirs. |

Pieces 1 and 2 are the parts that sound hard and are not. Pieces 3 and 4 are the work.

## 4. The hard piece, stated plainly

`applySelection()` adds a class to a row. On a catalog quiz that class means something because we
drew the design. On a student's Illustrator artboard, `.quiz-sel` means nothing until somebody
decides what "this answer is selected" LOOKS like on their drawing.

Three ways out, and they are not exclusive:

- **L1 - we supply a generic treatment.** A neutral overlay the platform draws: dim the board, ring
  the picked row, tick and cross on the verdict. Works on any artwork with zero effort; will not
  match the design, and on a busy graphic it will look bolted on.
- **L2 - the designer draws the states.** They draw a "selected" version of the row on its own
  layer in Illustrator; we hide and show. Pixel-exact, no taste risk, and it is how a designer
  already thinks. Costs them drawing work and needs a naming or picking convention.
- **L3 - a few knobs.** Pick the highlight colour and one of three styles. Cheap middle ground,
  and the smallest thing that stops L1 looking foreign.

**L2 is the one that makes "category agnostic" real**, because it puts the look where the artwork
is. It is also the closest thing to how MXMZ works (`docs/COMPETITOR_MXMZ.md`): layers and
timelines, with the designer trained for a day.

## 5. Three shapes for the authoring step - to choose between, later

**A. Pick a behaviour, then point at layers.** After the Fields step: *"What does this graphic do?
[Nothing] [Quiz] [Scoreboard]"*, then *"Which layers are the answer rows?"* with hover highlight,
exactly like the Fields step already does. Closest to what exists; `missingParts` already models
the check.

**B. Name your layers and we recognise it.** `answer1`, `answer2`, `question`. The `f:` prefix sugar
already proves the mechanism works. Zero UI - and it is a **renaming ritual**, the precise thing
the MXMZ lesson says not to require. Good as a power-user escape hatch, bad as the only road.

**C. AI proposes the binding; the person confirms.** One cheap text call over the layer inventory:
*"These four look like answer rows - bind them?"* Lite measures **$0.00032 per generation**, so this
is affordable inside free. Never authoring - a proposal, applied by a human, matching both the
standing rule and the `AnalyzeProposalPanel` pattern the raster import already uses.

They compose: **C proposes, A confirms, B is the escape hatch.** That is probably the answer, but it
should be decided after §6, not before.

## 6. NOW vs LATER - the double-work question

The owner's concern, and it is the right one: only the quiz and the scoreboard are thought through.
If we build a general behaviour system for two known cases, we design the abstraction against a
sample of two and get it wrong.

**The proposal: build ONE instance, not a system. Abstract after the third case, not the second.**

**Do now (serves September, and none of it is throwaway):**

1. **Verify the scoreboard end to end.** Import the scorebug, add it to a production, press + and -
   from the control panel, watch it on air. If it holds, half the goal is done and we know it.
   *Cost: an afternoon. Risk of waste: zero - it is a test, not a build.*
2. **Bind the quiz behaviour to an imported SVG, hard-coded to that one type.** No registry, no
   generic "behaviour" concept, no plugin shape. Just: mark the layers, attach the answer-board
   machine, make the states visible. Ugly in the right way - one concrete case, working.
3. **Answer the LOOK question for that one case** (§4). Whichever of L1/L2/L3 wins here is the
   decision that carries forward, because every future behaviour meets the same wall.

**Defer (and say out loud why):**

- **A behaviour REGISTRY / library UI.** The shape of behaviour number three is what tells us
  whether behaviours are types, presets, or something else. We do not have behaviour number three,
  and inventing one to design against is how you get an abstraction nobody fits.
- **Customizing a behaviour** - reveal with no lock. Explicitly out of the three weeks in GOALS,
  and it is the north-star question, not a September one.
- **AI proposal (§5C).** Cheap and attractive, but it proposes a binding whose shape is not settled.
  Build it once the binding exists and has been used by a person.

**What is durable regardless of which way §5 goes** - so it cannot be double work:

- The **layer-pointing interaction** (hover-highlight, tick a layer, name what it is). Every option
  needs it, and the Fields step already contains most of it.
- The **answer to §4**. Whatever "a state looks like on somebody else's artwork" turns out to be, it
  is the same answer for behaviour two and behaviour twenty.
- The **machine and controls** (§3, pieces 1-2). Already generic, already shipped.

**What would be thrown away if we guess wrong:** the hard-coded quiz binding in step 2. That is
deliberate, it is small, and paying it is cheaper than designing a registry blind.

**The thing that would make this all fine even if the students want something totally different:**
the autumn is quizzes and keeping score. Owner, 2026-08-22 - *"That is already actually good
enough."* A third format arriving in November is not a failure of this plan; it is the input the
deferred registry has been waiting for.

## 7. What locks us in, and what does not

- **Reversible:** the hard-coded quiz binding, the layer-pointing UI, an AI proposal step, the
  wizard copy.
- **Hard to reverse:** the answer to §4 (people will draw artwork against it), and anything
  persisted into `NOACG_ANIM`. A new persisted shape needs a version bump and a migration in the
  same commit - non-negotiable, `docs/STATE_MACHINE_SCHEMA.md` §5.
- **Not affected either way:** exports. An imported SVG with a machine is an ordinary
  `SpxTemplate`, so all six targets and the OGraf gate apply unchanged.

## 8. Open questions for the owner

1. **§4 - the look.** Do we supply a treatment (L1), ask the designer to draw the states (L2), or
   ship knobs (L3)? This is the decision that carries furthest and the one a second opinion should
   be pointed at first.
2. **§5 - the door.** Is "pick a behaviour, then point at layers" the shape, or is there a better
   one? Is the AI proposal wanted at all, given the standing no-AI-machines rule?
3. **Trained designer, or zero training?** MXMZ's whole answer is a one-day course. Is a taught
   path acceptable for the person who AUTHORS behaviour, as long as the OPERATOR needs none?
4. **Is the scoreboard actually done?** §2's finding needs one walk to confirm or kill.

## 9. How we would know it worked

The acceptance walk from `docs/GOALS.md` NOW item 3, unchanged: draw a quiz and a scoreboard in
Illustrator, import both, bind the behaviour, put them in one production, and run them from the
dashboard - lock, reveal, +1, -1 - with the operator never seeing code. Timed, and walked by
somebody who did not build it.

---

## 10. THE PILOT, AS BUILT (2026-08-22)

Both September cases are proven end to end, in a browser, and pinned by
`e2e/import-svg-behaviour.spec.ts`. What follows is the answer to §8's questions as the build
actually settled them, and the honest split the owner asked for.

### The scoreboard needed no code at all

Verified, not implemented. `docs/svg-samples/scorebug.svg` imports, its `2` and `1` become
`ftype: number` fields, the production page renders them as **± steppers** with no per-template
code, and both scores change on air. Three things the walk pinned beyond "the buttons exist":

- **The entrance never replays.** A bump is a partial update carrying ONE field, so the log reads
  one `Played in` for the take and `Updated 1 field` per press.
- **The figures persist** across a reload, once the cue draft's 300 ms idle has flushed.
- **A bump inside that 300 ms window is aired but not yet stored.** Pre-existing behaviour of the
  whole cue editor, not of this work, and narrow enough to leave alone — but now written down.

### The quiz: what was already generic

Everything except the paint, which is more than expected going in:

| Reused unchanged | How |
|---|---|
| The machine | `ANSWER_BOARD_MACHINE`, filtered to drop the audience branch — filtered from the shipped declaration, never copied, so the surviving arcs cannot drift |
| The buttons | `ANSWER_BOARD_CONTROLS` verbatim. `compileControls` drops a control whose event no arrow carries, so removing the branch removed its button with no second list to maintain |
| The attach | `attachMachine(type, template)`, already a `(type, template) => template` transform |
| Legality | The structural guard mirrors as greying on the imported graphic exactly as it does on a catalog board — Reveal is grey until a pick exists |
| The field pipeline | The dropdowns, the hidden holders, the control surfaces: all the ordinary SPX field contract |

### What had to be quiz-specific, and why

- **The paint** (`src/templates/importedDesign/quizBehaviour.ts`). The catalog's `applySelection`
  adds a class to a row it drew; on artwork we did not draw, the answer is the designer's own
  layers shown and hidden. This is the L2 model from §4, and it is the piece that would have to be
  rethought for a behaviour that is not row-shaped.
- **The binding UI** (the Behaviour section of `MapSvgFieldsStep`). Pickers, not naming: which
  layer is the question, which are the answers, which drawings are the picked/right/wrong/locked
  moments. `proposeQuizBinding` fills every one of them from the layer names when a designer used
  the obvious ones, so the accelerator is door B behind door A — never a renaming ritual
  (`docs/COMPETITOR_MXMZ.md` §3).
- **The type shim** `importedQuizType`, whose only real job is mirroring the field ORDER so a
  control's payload resolves to the right `fN`.

### §8's questions, answered by the build

1. **The look: L2, with L1/L3 unused.** The designer draws the states. It is the only answer that
   keeps the artwork theirs, and every drawn layer is optional — a board with none still selects,
   locks and reveals, which is what keeps the beginner path real.
2. **The door: pick-then-point, with naming as the accelerator.** No AI. The deterministic path
   works with zero model calls, which is what the owner asked for.
3. **Trained designer?** Not required. The one thing a designer must LEARN is not a tool, it is a
   drawing habit: hidden layers for states, and the words last in the file, because SVG paints in
   document order (`docs/SVG_AUTHORING.md` §5b). That was found by looking at a frame — the first
   run drew the verdict over the answer it was judging.
4. **Was the scoreboard done?** Yes. Half the September goal cost an afternoon of verification.

### The hosted road: WALKED, 2026-08-22

Run against the real project on the owner's go-ahead
(`e2e/configured/imported-quiz-output.spec.ts`; checklist and frames:
`docs/acceptance/IMPORTED_QUIZ_HOSTED_WALK.md`). The board was imported, bound, published, and
driven from the real `/output` renderer over the hosted command log. Both open questions closed:

- **The drawn states cross the wire.** A renderer that never saw the wizard, following a log,
  shows the designer's own layers.
- **BOOT RECOVERY repaints them** — the pilot's one predicted failure, and it did not happen. A
  snap replays states with callbacks suppressed, so the layers come back only because
  `paintQuizState()` repaints from the machine on the trailing `update()`. Reloading the renderer
  mid-lock returned a frame pixel-identical to the one before it (bar the debug overlay's row
  counter): badge up, pick still showing.

Two things the run found, both about the WALK rather than the graphic, and both now fixed in the
shared helper: the live walk runs with Advanced mode on, so an unscoped `Next` role match resolves
to the editor's `» Next` as well as the wizard's; and the wizard opened after sign-in does not
always carry a `#/new/step/…` route, so a URL assertion passes offline and times out against a
real backend on the same clicks. The step COUNTER is the same in both.

**Still owed: the eyes-on half** (the walk's step 2) — whether the mapping step reads as usable
without training. No run answers that.

### What stays deferred, unchanged

No behaviour registry, no plugin shape, no customizing the arc, no AI proposal. §6's reasoning
stands and the build did nothing to weaken it: the third behaviour is still what would tell us the
right abstraction, and there is still no third behaviour. The seams that would carry one — the
`DesignSvgBehaviour` union, the `SvgQuizDraft` discriminant, this module's shape — exist and
nothing else pretends to be general.

---

## 11. THE REHEARSAL, PRE-RUN BY MACHINE (2026-08-28)

The 2026-09-12 walk is the owner's, and it stays the acceptance. This is what a machine found
walking it first, on artwork drawn the way a STUDENT draws it rather than the way the shipped
samples are drawn - an Illustrator export with the dialog untouched, layers named for the
drawing, and none of §5b's naming conventions honoured. Fixtures:
`e2e/fixtures/svg-corpus/student-illustrator-{scoreboard,quiz}.svg`; the whole chain is pinned by
`e2e/student-rehearsal.spec.ts`.

**The owner's own finding reproduced, and it was the WORDS.** Importing a scoreboard offers
"Nothing. It comes on and off." and "Quiz." - so the list reads as *there is no scoreboard here*.
The OFFER is right: a scoreboard needs no machine, because a layer holding a plain figure becomes
a number field and every control surface draws one as a ± stepper (§10). Nothing said so. The
step now names what the artwork already earned - "2 numbers, each with + and −", and the
no-behaviour option reads "Nothing extra. The number layers already get + and −." Same shape as
`missingParts`: say what the thing has and what it lacks, rather than leaving the reader to infer
absence.

**Two defects fixed, both measured first:**

1. **A layer switched off in Illustrator was still an operator field.** With the export dialog on
   its default styling a hidden layer arrives as `class="st10"` beside a `.st10{display:none;}`
   rule in the file's own `<style>` block - never as the `display="none"` attribute the samples
   carry - and `isHiddenNode` read only the attribute and the inline style. So the student's goal
   flash handed the operator a field for MAALI! that nobody can see, and the quiz's LUKITTU badge
   did the same *and took `f0`*, shifting every field index the `importedQuizType` shim mirrors.
   `hiddenClasses` (assets/svgImport.ts) now reads the class form the way `classFontSizes` reads
   sizes. Both fixtures dropped from six offered text layers to five, and every drawn state now
   reports itself as `(hidden)` in the behaviour pickers - which is how a reader tells a moment
   from base artwork in a list of fifteen groups.
2. **A half-made quiz binding was dropped in silence.** `svgBehaviourOption` refuses a binding
   whose question or answers are not ticked rows, for a good reason (§10) - it said nothing, so
   the reader picked Quiz, walked on, and got a graphic that comes on and off. `quizBindingGaps`
   is now the one decider and the step reads its answer out.

**What held, unchanged:** the picker road works with NO proposal. "Option 1" is not "Answer A", so
`proposeQuizBinding` returns null on the student's file and the whole binding - question, four
answers, twelve drawn states, the lock badge - is made by hand in about fifteen clicks. That is
the sentence §5b prints in bold, and nothing until now measured it.

**Two things are STRUCTURAL and stay filed:**

- **An imported scoreboard has no Goal press.** The student drew a goal flash; there is nowhere to
  bind it, because the only behaviour on this road is the quiz. A catalog scoreboard's Goal event
  bumps the score and shows the flag in one press; on somebody else's artwork it cannot. This is
  the THIRD BEHAVIOUR §6 says would tell us the right abstraction, and it is the first time the
  ask has come from a real drawing rather than from a plan.
- **A direct reveal is not reachable.** `ANSWER_BOARD_MACHINE` draws `judge` only from `locked`,
  so select → reveal with no lock is not an arc this graphic has, and the button greys rather than
  doing nothing when pressed. `docs/GOALS.md`'s north star names exactly this ("the next producer
  wants no lock at all") as the open question; changing the arc is the custom-machine road the
  owner opened on 2026-08-27 as direction to build AFTER the student release.

**And one honest limit of the offline build:** a dashboard reload keeps the data - the scores, the
answer key, both cues - and does NOT keep LIVENESS. There is no shared command log offline to
restore it from, so the steppers come back disabled and say why ("not on air — Take the cue
first"), and the operator takes the cue again. The hosted road is the one that repaints a live
layer on boot, pinned by `e2e/configured/hosted-control-recovery.spec.ts`.

---

## 12. THE THIRD BEHAVIOUR: A LIVE VOTE (2026-08-30)

**Why this one, and why now.** §6 deferred every generalization until a third case existed, and
said the third case must arrive from a real need rather than be invented to design against. It
did, twice over: the owner needs a poll for a real show this autumn, and §11's rehearsal already
filed "an imported scoreboard has no Goal press" as the first ask that came from a drawing rather
than from a plan. Everything underneath a poll had also already shipped SEPARATELY - the audience
plane counts votes (`AudienceRound{kind:'poll'}`, `vote()`, `tally()`, Phase 6 of
`docs/INTERACTIVE_PLAYOUT_PLAN.md`), and the catalog has a live-vote board with its own arc
(`types/livePoll.ts`). The one thing that did not exist was the JOIN, so a poll only worked on a
board WE drew - which is the exact thing the current push exists to end.

### Is it a third case, or the quiz with different words?

**A third case, and the difference is the PAINT.** Taking the quiz's split (§10) row by row:

| Piece | Quiz | Poll |
|---|---|---|
| The machine | `ANSWER_BOARD_MACHINE`, filtered | `LIVE_POLL_MACHINE`, filtered. Free again |
| The buttons | `ANSWER_BOARD_CONTROLS` | `LIVE_POLL_CONTROLS`. Free again |
| The attach | `attachMachine` | `attachMachine`. Unchanged |
| The binding | pickers over the candidate inventory | pickers over the candidate inventory |
| **The paint** | **show one drawn moment** | **interpolate a bar between poses nobody drew** |

The first four rows are what a second case would also have shown. The fifth is what only a THIRD
case could: the quiz's answer to §4 is L2 - *the designer draws each moment and NoaCG picks one* -
and **a bar has no moments**. It has one pose per share, so there is nothing to draw and nothing
to pick. The designer draws the bar at its FULL length and the runtime reads that as a RANGE.
Call it **L4: draw the extreme, and NoaCG interpolates.**

Both models are in the one behaviour, and which one a layer uses is a property of the LAYER rather
than of the behaviour: the VOTE NOW badge and the winner marks are L2 drawn states, the bars are
L4, and the labels, figures and count are neither - they are text the runtime writes. That is the
finding, and it is the one that would have been guessed wrong by designing a registry against two.

### So what IS the right abstraction? Smaller than a registry.

Built (`src/templates/importedDesign/behaviour.ts`): **one module interface** naming the seven
things `assembleImportedSvg` needs from a behaviour - the ids it stamps, its field count, its
marking pass, its CSS, its fields, its HTML, its JS, its update hook, its extra step, its type -
with one implementation per behaviour and a two-entry dispatch. `svg.ts` asks for a bound module
and stops caring which one it got; the `quiz ? … : ''` ternaries that were spread through six
places are gone. Plus `drawnState.ts`, the one mechanism both demonstrably share, extracted from
the pilot rather than designed for it. The class NAMES stay per-behaviour (`-qstate` / `-pstate`),
because an exported board carries them and a playout machine reads that file, not ours.

**Still deferred, and now with better evidence:** no behaviour REGISTRY, no plugin shape, no way
to declare a behaviour from data, no combining two on one graphic, no customizing the arc. The
third case's lesson is that the varying part is the paint and the paint is different in kind every
time, which is precisely what a plugin interface cannot flatten. §6's reasoning survives contact.

### The join to the audience plane needed NO new plumbing

`ProductionAudienceWorkspace.tallyValues` already writes a round's counts as `Label | count` lines,
and `pollFieldMap` already decides which graphic can hold them by looking for fields titled
**`Question`**, **`Options`**, **`Vote count`**, **`Vote status`** and **`Live figures`**. So the
join is a FIELD NAMING CONTRACT, and the poll behaviour keeps its half by owning those five fields
itself - hidden holders, like the quiz's two letters. The designer's own layer is called whatever
they called it, which is why the wire cannot be the artwork's fields.

The list grew twice after the pilot, both times by APPENDING (a behaviour's fields compile after
the artwork's and `fieldIdFor` resolves a control's payload key by index, so a field added last
moves nothing already saved or exported): `Vote status` because the open/closed fact had been
riding inside the human-facing count line, and `Live figures` because whether the percentages run
during the vote is a decision a production makes, not a property of the board.

Consequence, and it is deliberate: **a layer the vote drives stops being an operator field.** Two
writers on one node is a graphic whose operator watches their own typing be overwritten, so
`draftToOptions` drops those candidates from the field list (the one place where the numbering, the
markup binding and the control page cannot disagree) and the mapping step says which layers went.

**The structural guarantee is untouched.** Nothing viewer-written reaches Program without an
operator: staging writes a CUE, the operator takes it, and `AudienceBackend` still has no method
that could bypass that (`src/audience/audienceTypes.ts`).

### Animation: the bars move on DATA, and only three things are transitions

The owner's question, answered explicitly because the model makes it easy to get wrong:

- **Data updates never cause transitions** (root `AGENTS.md`, `docs/STATE_MACHINE_SCHEMA.md`), and
  a vote landing is data. So the growth lives INSIDE whatever state the board is in: `update()`
  calls `paintPollState()`, which tweens each bar from where it is to its new share. Nothing
  transitions, nothing re-enters, and the board can sit in the voting state for the whole vote.
- **Three things are transitions**: Close voting (the badge goes), Show result (the figures land),
  Call the winner. Taking the cue is what OPENS the vote - the entrance step is the voting state,
  which is why there is no "Open vote" button.
- **The motion is the catalog board's, imported rather than re-chosen**: `BAR_GROW` (0.9s),
  `BAR_STAGGER` (0.12s) and `power3.out` are now exported from `poll/pollMotion.ts` and used by
  both. No overshoot ease is ever applied to a vote bar, because a bar that overshoots reads as
  the wrong figure. A `<rect>` has its WIDTH tweened rather than a scale, so a rounded cap is not
  squashed; anything else the designer drew is scaled about its own left edge.
- **The drawn length is 100%**, measured once and remembered. Re-reading it after a pass would let
  the last pass's length become this pass's full length, so a bar that ever showed 40% could never
  show more - the same lesson the growth runtime paid for in `svgFitText`.

### What is NOT in this, and should be said out loud

- ~~**The figures wait for the result**~~ - **ANSWERED AND BUILT (owner, 2026-08-30).** They still
  wait by default, because most shows put a vote board up to reveal a result; a production that
  wants the percentages moving on air ticks one checkbox in the audience workspace, which rides to
  the board as the `Live figures` field. Both directions are pinned in
  `e2e/import-svg-behaviour.spec.ts` - off-by-default is as much the contract as on-by-choice.
- ~~**One vote per graphic**~~ - **THE OVERFLOW NOW SAYS SO (2026-08-30).** A round with more
  options than the board has rows still airs the rows that were drawn, and each of their figures is
  that option's true share of the WHOLE vote (which is why the bars visibly fail to fill the
  board). Two things stop it lying: the winner is never called on a row that was not drawn, and the
  `Options` field is reported through `noacgTextOverflow()`, so every surface that already warns
  about a value the design cannot hold - the cue editor, the hosted control page, the exported
  controller - says so before the Take. **Reported, not refused**: dropping a round mid-broadcast
  is a worse answer than airing what fits and naming what did not.
- **No hosted walk yet.** The offline walk is pinned end to end; the hosted road (the real
  `/output` renderer following a command log) is the quiz pilot's §10 walk repeated, and nobody
  has repeated it for the vote.

Pinned by `e2e/import-svg-behaviour.spec.ts` ("imported vote board: a real audience round moves the
bars the designer drew"); the artwork is `e2e/fixtures/svg-corpus/illustrator-live-vote-band.svg`.

---

## 13. THE FIFTH BEHAVIOUR: A COUNTDOWN (2026-09-05)

**Why this one, and how it was picked rather than argued.** The owner named the method on
2026-09-03 - *"we only have a poll and quiz right now, but we need to add more ... We just need to
follow how other programs do them"* - so the choice came out of a survey rather than out of a
preference. That survey is **`docs/BEHAVIOUR_SURVEY.md`**: seventeen products, what each ships as a
named behaviour, the operator verbs each exposes, and a frequency table. It is a companion to
`docs/SCORE_CONTROL_SURVEY.md`, which asks the narrower question of how one behaviour's controls
are shaped.

The table's top three are on air / off air (all seventeen, and therefore not a finding), a
**countdown with start, pause and reset** (ten), and **score plus and minus** (eleven). The score
board had shipped two days earlier. So the countdown is simply the highest-ranked thing a student
could not put on their own artwork, and it is also the first item on the owner's own list in
`docs/backlog/playout-logic-for-all-common-graphics.md`. Survey §6 records what was considered and
passed over, so the fifth is not argued from scratch either.

**Half of it already existed and was unreachable**, which is why the build was small. The shared
clock runtime (`templates/shared/clock.ts`), the countdown FIELD kind, and a catalog type with a
running/paused machine all shipped long ago; a text layer whose sample reads `M:SS` has been
bindable as a countdown since the SVG import plan's P2. What that got you was a clock that started
when you took the graphic and could not then be touched: no hold, no restart, and no way for a
drawing to react to the time running out.

### What is new, and what was reused

| Piece | Where it came from |
|---|---|
| The machine's `running` and `paused` | `countdownType`'s own group, timings and eases included, with the layer tracks dropped - the score board's `drawnStateBranch` move, made again |
| The `armed` state | New, and Reset is why (below) |
| The clock itself | Untouched. `startClock` on the entrance is still the clock refinement's, not this behaviour's |
| The paint of the held mark | The quiz's drawn states (`drawnState.ts`), a second reuse after the score board's |
| The paint of the draining bar | The vote board's L4 - drawn at the extreme, interpolated - reaching a second behaviour |
| The buttons | Derived from the machine, as always. Start / Pause / Reset |

### The three decisions worth reading back

**THE TAKE STARTS THE COUNT, and it was an owner ruling rather than a call this session made.**
*"Timer/countdown: duration set beforehand, starts on TAKE, at zero HOLDS at 0:00 until taken
out"* (`docs/OWNER_RULINGS.md`, operator-stories-2026-08-27). It also keeps two promises: attaching
a behaviour never changes what the Take does to the same artwork, and it is the vote board's own
rule from §12, where the entrance step IS the voting state and there is therefore no Open vote
button. A chair who wants to count the class in gets it from Reset.

**RESET NEEDED A THIRD STATE, and that is a fact about the model rather than about clocks.** An
event's effect here is the DESTINATION state's timeline calls, so two events landing in one state
necessarily run the same call: "go again from where we were" and "put it back to the top" cannot
both land in `running`. Making the difference a payload would be the drift `MachineControl.set` was
added to prevent. So `armed` is a state - the card up, the clock showing the full length, nothing
counting - and it is a real on-air look rather than a second copy of `running`. Reset is legal from
all three, including itself, for the score board's reason: an event with no arrow out of the
current state is dropped, and a button that silently does nothing is worse than no button.

**THE PAINT HAS A THIRD DRIVER, and this is the finding.** §12 asked what the paint IS and answered
"different in kind every time"; the score tracker that followed it weakened that to "not always"
(`importedDesign/scoreBehaviour.ts`, which carries its own record). This one asks
a different question - what makes a graphic repaint - and the answer is new:

| Behaviour | Repaints because |
|---|---|
| Quiz | a STATE changed |
| Live vote | `update()` wrote new DATA |
| Score tracker | both, and compares the data to decide which row |
| **Countdown** | **neither. A runtime tick, four times a second, with nothing else changing** |

The seam's `updateHook` cannot reach that, and nothing else in `behaviour.ts` could either. So the
module defines `clockPainted(secondsLeft, totalSeconds)` - the shared clock runtime's own paint
hook, which already existed for a catalog design that draws more than the digits
(`startingSoon/ss21.ts`'s minute rule) and had never been used by a behaviour. **The seam needed
nothing added**, because `js()` emits whatever the graphic's own runtime needs. That is the second
piece of evidence in a row that §6's refusal to build a registry was right.

Which is also why the last-stretch look and the time-up plate are DATA rather than states. A state
changes on an operator event or an authored timer edge, and an authored timer is a fixed `after`
armed when its state is entered: it cannot follow a count the operator pauses, re-arms with Update
or resets, so a `warning` state would drift the first time anybody pressed Pause. States would also
multiply the group - running-or-paused times plain-or-warning-or-up is six states with every arrow
drawn twice - which is the explosion `docs/STATE_MACHINE_SCHEMA.md` forbids in as many words. The
held mark is the one that IS a state, because it is one: the operator pressed Pause.

### What it does NOT do, said out loud

- **No add-time or remove-time on a running clock.** The survey's clearest un-taken finding: vMix
  has `AdjustCountdown` and H2R has "add/remove time", and both cheap versions here are wrong - an
  `adjust` on the minutes field re-arms the whole count, and shifting the deadline in the runtime
  would air a count the operator's own box no longer describes. Filed:
  `docs/backlog/adjust-a-running-clock.md`.
- **A board with no held mark shows nothing when the clock is paused**, where the catalog countdown
  dims its own clock part. Nothing can be done about that without painting on somebody else's
  artwork, which is the whole L2 answer from §4.
- **Pause stays legal at 0:00.** A structural guard reads states, not clocks. Pressing it there
  shows the held mark over a stopped 0:00 and Reset clears it - the operator's own press shown back
  to them.
- **No hosted walk yet**, exactly as the vote board still owes one.

Pinned by `e2e/import-svg-behaviour.spec.ts` ("imported countdown: the take starts it, and the
operator holds, resumes and resets it"); the artwork is
`e2e/fixtures/svg-corpus/illustrator-question-timer-board.svg`.

---

**Related:** `docs/BEHAVIOUR_SURVEY.md` (which behaviours exist at all),
`docs/SCORE_CONTROL_SURVEY.md` (how one behaviour's controls are shaped),
`docs/SVG_IMPORT_PLAN.md` (how the artwork gets in), `docs/STATE_MACHINE_SCHEMA.md`
(what a graphic is), `docs/CONTROL_LAYER.md` (where the buttons come from),
`docs/GRAPHIC_TYPES.md` (how a type declares a machine), `docs/COMPETITOR_MXMZ.md` (what the
competitor does instead).
