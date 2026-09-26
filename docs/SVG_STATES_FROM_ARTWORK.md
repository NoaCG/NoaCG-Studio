# States from artwork - how an imported graphic's moments become visible

**Status: design picture, 2026-09-01, a P2 round-2 input - it proposes, the owner decides,
and the §7 rulings are OPEN.** The owner imported a quiz board,
got the quiz controls, pressed them, and nothing happened - correctly, by the current contract,
which is exactly the problem. His ask: a deliberate import workflow, judged on one goal -
*someone importing a quiz graphic can understand how to make its interactive controls visibly
work*, with instructions that are simple, discoverable and explicit. This document is the
answer for him to read in one sitting: what actually happens today, the three routes he named
judged against the doctrine, ONE recommendation, and the artwork contract a student can follow.
No product code was written; P2 is in DESIGN (the retired programme register).

Grounding: `docs/GRAPHIC_BEHAVIOUR_PLAN.md` (the pilot and its L1-L4 vocabulary),
`docs/SVG_AUTHORING.md` §5b (the designer-facing contract today),
`docs/STATE_MACHINE_SCHEMA.md` (the doctrine). Mockups: `docs/design/svg-states/`.

---

## 1. What actually happens today, driven fresh (2026-09-01)

Both boards were imported and every quiz control pressed, in the browser, before a line of this
was written.

**A board with no drawn states** (`e2e/fixtures/svg-corpus/illustrator-quiz-board-multiline.svg`
- an ordinary Illustrator export, question and four answer pills, nothing hidden, which is what
a first-time importer brings):

- The wizard is at its best right up to the moment that matters. The quiz is AUTO-PROPOSED from
  the layer names, question and answers arrive bound, the step summary reads "a quiz: select,
  lock, reveal". Zero clicks of binding work.
- Every PICKED / RIGHT / WRONG picker reads "- not drawn -", and **no warning exists anywhere**:
  drawn moments are not binding gaps (`behaviourBindingGaps` checks question and answers only),
  the Finish step's "What you built" table does not mention the behaviour at all, and the step's
  own copy says "Left a layer undrawn? Nothing extra shows, and the behaviour still works."
- On air, the machine is flawless and invisible. Select fires, the state chip walks Question ->
  Answer selected -> Locked in -> Reveal, guards grey the illegal buttons, the activity log
  records every event - **and the Program monitor never changes by one pixel.** The operator
  surface says the graphic is doing four different things; the audience sees a still frame.

That is the owner's finding, reproduced end to end. The machine's half of "the behaviour still
works" is true; the sentence is what a student cannot be given, because for them the visible
half IS the behaviour.

**A board with partial drawn states**
(`e2e/fixtures/svg-corpus/inkscape-hidden-state-layers-quiz.svg` - drawn moments for SOME
rows: "A picked", "B correct", "A wrong", one "Locked in" stamp):

- The proposal filled RIGHT and WRONG ("B correct (hidden)", "A wrong (hidden)") and the lock -
  but **missed "A picked"**, because the name matcher wants the word *select* while the step's
  own column header says PICKED. The designer who copies the UI's vocabulary defeats the
  shortcut; our own corpus fixture proves it.
- Bound by hand (one dropdown), the road is genuinely good: the pick shows the designer's amber
  bar on air, lock stamps LOCKED IN, reveal paints B green and A red. The drawn-state mechanism
  works and looks like the designer's file, exactly as the pilot promised.
- The partial case has the same hole in miniature: had the correct answer been C, reveal would
  have painted **nothing on the correct row** and red only on A - a frame that misreads on air.
  Undrawn moments fail silently per layer, not per graphic.

So the defect is precisely bounded: **the machine, the controls, the binding UI and the drawn
states all work. What is missing is what an undrawn moment looks like - today it looks like
nothing, and nothing ever says so.**

## 2. The three routes, judged against the doctrine

The owner named three approaches. Judged against the structural doctrine (states, transitions,
events, structural guards, no expression language, ever - `docs/STATE_MACHINE_SCHEMA.md`) and
against his own bar (simple, discoverable, explicit):

**Route 1 - default overlays/effects on ordinary artwork** (the plan's L1). The platform draws
the moment when the designer did not: dim the board, ring the picked row, tick and cross on the
verdict, a lock badge. *Doctrine: clean.* It is paint keyed off machine state - deterministic
generated code, no new machinery, no condition language. The classic argument against it (plan
§4: "will not match the design, will look bolted on") is an argument against it as the ONLY
route, not as the floor under the others. And the geometry it needs exists: the import already
finds the panel behind each bound text line (the fit ladder's "a line's room is the panel
behind it", `docs/SVG_AUTHORING.md` §4), so the row highlight can land on the designer's own
answer pill, not on a guessed rectangle.

**Route 2 - imported layers assigned to states in the wizard** (L2 - BUILT, the pilot's
answer). Pixel-exact, keeps the artwork the designer's, proven again today. Its failure mode is
also proven today: as the only route it hands a first-time importer a quiz whose every control
does nothing visible, with no warning at any step. A route that is right for the trained hand
and silent for the beginner fails "discoverable" exactly where the owner hit it.

**Route 3 - automatic state mapping through layer names** (door B - BUILT, as the accelerator
behind route 2's pickers). Correct as sugar, and the MXMZ lesson stands: as the only road it is
a renaming ritual, the precise thing not to require. Today's drive also showed it is too narrow
even as sugar - it misses the vocabulary the product itself teaches (PICKED vs *select*).

**None of the three touches the machine.** All three are answers to "what does a state LOOK
like"; the states, events and guards are identical under each. There is no doctrine reason to
choose - which is the tell that they were never competitors.

## 3. The recommendation: one ladder, defaults at the bottom

**Routes 1, 2 and 3 are rungs of one ladder, and route 1 is the missing rung.** Recommended
contract, per moment, per layer:

1. **Drew nothing** -> the platform's default treatment paints the moment. Every control
   visibly works on any artwork, from the first import.
2. **Drew the moment** -> the designer's layer replaces the default for that moment - the
   pilot's L2, unchanged. Mixed boards are normal: A's drawn highlight beside C's default tick
   is the per-layer rule §12 already discovered for the poll (L4 bars beside L2 states).
3. **Named the layers the known words** -> the binding arrives pre-filled - route 3, unchanged,
   with a wider vocabulary (§5).

This keeps every true sentence true. "Every drawn layer is optional" survives; what changes is
what optional MEANS - today it means *invisible*, after this it means *the default look*. The
beginner path becomes real instead of nominal, the premium path is untouched, and the
progression is itself the teaching: a student sees the platform's generic highlight, is told
"draw your own to replace it", and has a reason to learn §5b rather than a punishment for not
having read it.

**What the default treatment is, concretely.** One neutral style, platform-owned, deliberately
design-agnostic rather than brand-amber (it must sit on THEIR artwork): dim the non-picked rows
slightly and outline the picked row's panel for *selected*; a compact corner badge for
*locked*; green/red edge treatment plus tick/cross glyphs at the row's end for the verdict.
Geometry from what the import already measures - the bound answer layer's text box and the
panel behind it. Emitted as ordinary commented code in the template, on the seam the quiz
behaviour module already owns - today `qShow` skips a layer nobody drew (`if (!el) return`),
and the ladder is what gives that skip somewhere to fall: the real build is plumbing the
measured geometry into the emitted CSS/JS, default-paint code per moment, and export parity -
none of which exists yet. Deterministic, exportable, identical under SPX, OGraf, the /output
renderer and the editor, because it is just more of the same generated paint.

**Argued against, in the owner's terms:**

- *Route 2 or 3 as the answer* - both already exist, and he pressed the buttons on a board
  where they had nothing to say. More pickers or more naming patterns cannot make an undrawn
  moment visible; only a default can.
- *Making drawn states required* (refusing a quiz without them) - fails "simple" for the
  student release's core promise: any graphic, behaviour attached, no code, 2026-09-12. The
  quiz that decides the goal must work from an ordinary export.
- *A knobs/effects panel* (the plan's L3 - pick highlight colour, pick a style) - defer.
  It is a refinement OF the default treatment, it multiplies choices on the wizard's most
  crowded step, and §12's finding says the paint varies in kind per behaviour, so knobs
  designed today generalize badly. Add knobs when a real user rejects the one default look,
  not before.

## 4. The artwork contract a student can follow

The student-facing rules, in the order a student meets them. This is the shape §5b of
`docs/SVG_AUTHORING.md` should take once the ladder ships (that page stays the single
designer-facing home; this section is its content, not a second home):

**Do nothing at all.** Draw the board, the question, one text layer per answer. Import it, and
the quiz already works VISIBLY: NoaCG highlights the pick, stamps the lock and marks
right/wrong with its own neutral look. You never have to do more than this.

**Draw the moments you want to own.** Any moment you draw replaces NoaCG's version, one hidden
layer each: the row picked, the row right, the row wrong, one locked-in stamp for the board.
Click the eye off in your design app - a hidden layer is offered to the behaviour pickers
BECAUSE it is hidden. Draw some and not others; each moment falls back on its own.

**Name things the obvious way and skip the clicking.** "Question", "Answer A", "A picked",
"A correct", "A wrong", "Locked in" - the binding arrives filled in. Never required: every
name is a dropdown in the Fields step either way. (The word set here follows §5.1's proposal
and lands only with the §7.3 ruling - today's matcher accepts "A selected" but misses
"A picked", so until that ruling `docs/SVG_AUTHORING.md` §5b's "A selected" is the word that
actually works, and §5b gains a pointer here in the change that ships the ladder.)

**And the workflow says what it decided** (the explicit half of the owner's bar - see the
mockups): the Behaviour section shows each moment as *your drawing* or *NoaCG's default look*;
the Finish step's "What you built" table gains a Behaviour row saying the same; pressing a
control in the wizard-side preview plays the moment so the student SEES the fallback before
air, not on it.

## 5. Small repairs the drive exposed (recommendations, not code)

1. **One vocabulary.** UI columns say PICKED / RIGHT / WRONG; the authoring doc teaches
   "A selected" / "A correct"; the matcher accepts only *select* / *correct* / *wrong*. Pick the
   UI's words (picked / right / wrong - they are the plainest), teach exactly those in §5b, and
   have the matcher accept both families (`picked|selected`, `right|correct`,
   `wrong|incorrect`, `lock`). Our own Inkscape fixture's "A picked" currently defeats the
   shortcut.
2. **The Finish step names the behaviour.** "What you built" lists design, fields, typefaces,
   motion - and not the one thing that makes this graphic different. One row: "Behaviour - quiz:
   select, lock, reveal - 4 of 13 moments drawn, the rest use NoaCG's default look" (the
   Inkscape fixture's own numbers: four drawn layers against four rows of three moments plus
   the lock).
3. **Select-with-no-pick.** "Select answer" fires with the cue's Selected-answer field, which
   starts empty ("-"), so the first press enters *selected* with no letter - even a fully drawn
   board shows nothing for it. Once defaults exist the same rule covers it (an empty pick paints
   no row treatment), but the control page could also grey Select until a letter is chosen,
   which is the same say-what-is-missing pattern the binding gaps use.

## 6. What this is not

- Not a machine change. States, events, arcs, guards, the serial queue - untouched. This is
  paint, on the seam the pilot built for exactly this purpose.
- Not a behaviour registry, not per-behaviour knobs, not AI. The deferrals in
  `docs/GRAPHIC_BEHAVIOUR_PLAN.md` §6/§12 all stand.
- Not scheduled. P2 is in DESIGN; whether this ships before 2026-09-12 or right after is the
  owner's sequencing call. The September walk can pass with a taught designer (route 2 works,
  proven), but the student who skips the teaching currently gets silence.

## 7. The owner's decisions

1. **Ratify the ladder** - defaults under drawn layers under naming, per moment. This is the
   decision that carries; everything else here is its consequences.
2. **The default look itself** - one neutral platform style, no knobs, replaced per-moment by
   the designer's own drawing. Accepting THIS is accepting that an untrained import looks
   generic-but-alive rather than silent; the alternative (require drawing) was argued against
   in §3.
3. **The vocabulary ruling** (§5.1) - which words the product teaches everywhere.

### RATIFIED, owner walk 2026-09-03

He drove `docs/design/svg-states/moment-ladder.html`:

> rung 1 and 2 works, rung 0 is silent as expected. I like Rang 1 the most of these three right
> now for this specific design, but Number 2 works also. I think this looks great.

**Decision 1 (the ladder) and decision 2 (one neutral default look, no knobs) are both ratified.**
Rung 1 is the recommended default and it is the one he preferred; rung 2 - the designer's own
drawing replacing the default per moment - reads correctly beside it, which is the whole claim the
ladder makes. Rung 0's silence is the finding that started this, confirmed.

**Decision 3, the vocabulary, was NOT put back to him**, under the ruling he made the same day
(`docs/acceptance/OWNER_QUEUE.md`, "A design default is NOT a taste question"). It has a
defensible general answer, so here it is with the reasoning, to be overruled rather than
adjudicated:

**Use `selected` / `correct` / `wrong`.** Three reasons, none of them taste:

1. **The operator's word and the designer's word must be the same word.** A designer typing layer
   names has no UI in front of them; they guess the convention from what the product calls things.
   Two vocabularies for one concept guarantees the guess is wrong half the time, which is what our
   own fixture proved by shipping a layer called `A picked` that the naming shortcut does not read.
2. **`correct` and `wrong` are what the domain already says.** A quiz has correct answers. Nothing
   in broadcast calls them "right answers" in the graphics layer, and `right` additionally collides
   with a direction word in a layout product, where `right` means an edge.
3. **`selected` over `picked`** because it is the ordinary interface word for a chosen option, it
   matches the state name `docs/GRAPHIC_TYPES.md` already uses for the quiz's one selected state,
   and `picked` is informal in a way that ages badly in a product used in teaching.

The consequence is that the UI's PICKED / RIGHT / WRONG labels change, not the naming shortcut.
That is the cheaper side to move and the side with no files depending on it.
