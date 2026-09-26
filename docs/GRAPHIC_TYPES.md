# Graphic types

A **type** says what a graphic IS. A **design** says what it looks like. The catalog is
types × designs, and Phase 3 turns that second axis into themes without the first one moving.

Companion docs: `STATE_MACHINE_SCHEMA.md` (the machine a type declares),
`DESIGN_LANGUAGE.md` (the taste bar a design is judged against), `PACK_TAXONOMY.md` (the
packs — curated type-subsets the 60 reference formats map onto; config in
`src/templates/packs.ts`, validated by the factory).

---

## 1. What a type declares

```ts
GraphicType {
  id, name, description, frequency?
  structure: { prefix, category, parts[] }   // the DOM contract, named logically
  fields:    TypeField[]                     // logical keys, compiled to f0..fN
  machine:   TypeMachine                     // groups, branches, default-path events
  controls:  TypeControlEvent[]              // what Phase 5 turns into buttons
  capabilities                               // the wizard's chips (maxLines, logo, presets)
  designs:   TypeDesign[]                    // one per look — Phase 3's themes axis
}
```

Everything a type knows is independent of styling. That is the whole point: the node editor
(Phase 4) edits any type's graph without knowing its CSS, and the control generator (Phase 5)
builds a page from `controls` and `fields` without knowing either.

**A type is a declaration, not a second way to build a template.** `variantsFromType` compiles
one into ordinary `TemplateVariant`s that go through the category's existing assembler, so
`variant.create(options) -> SpxTemplate` stays the single contract the wizard, the AI, the
sweeps and every spec already speak.

---

## 2. The rule that keeps types small

> **Persist a machine only when the derived one is wrong.**

`deriveMachine` already gives every template a correct one-group linear machine. A type with
no branches, no parallel groups and no event overrides compiles to **no `machine` key**, and
its template comes out byte-identical to what it emitted before.

Thirty of the sixty-five registered types are in that class (and among the founding twelve it
was nineteen of twenty-seven at the time that count was first taken). That is the design
working, not a shortcut — and it is what makes promoting an existing variant safe.

---

## 3. Fields

**A category's fields fit the shape of its content.** End credits is the worked example: one field
whose format says what the content is (`docs/END_CREDITS.md`), parsed into groups. Take categories
one at a time; extract a shared mechanism only when two categories want the same thing, never a
universal field model up front. A category's field logic is proven three ways: in NoaCG playout, in
the control panel operating and editing it, and in an offline export that works with no NoaCG.

`TypeField` names fields **logically** (`selectedAnswer`), never `fN`. Ids are positional and
assigned at compile time, so inserting a field renumbers nothing the type references.

`role` routes a field into the plumbing that already exists for its shape:

| role | means | compiles |
|---|---|---|
| `line` | a visible text line | FIRST — `fieldsFromOptions` numbers lines `f0..n-1` |
| `data` | an operator value with its own element (a score, a rows source) | in order |
| `hidden` | input-only, in a `.noacg-data-source` holder (a countdown's minutes) | in order |
| `logo` | the image slot | LAST — `applyLogoSlot` derives its id from the field count |

Those two ordering rules are enforced at compile time with a throw, because getting them wrong
desyncs the ids from the assembler that emits them, and a runtime surprise is worse than a
build failure.

**`role` says where the value lives; `kind` says what control it gets** — including for
`hidden`, whose holder is hidden because the raw value would be meaningless on air, not
because the operator is shut out of it. That hiding is the `.noacg-data-source` stylesheet RULE
(`DATA_SOURCE_CLASS` / `dataSourceCss` in `templates/shared/base.ts`) and **never an inline
`style="display:none"`**: the canvas entrance reset clears inline properties, so an inline-hidden
holder comes back visible with its raw value on air. `e2e/catalog-baseline.spec.ts` gates it.
(SPX's own `hidden` *ftype* is the other thing: it takes
a field away from every operator surface. A type never compiles to it.) So a countdown's
duration is a `number`, and the operator gets steppers rather than a text box — a round is
lengthened by a minute far more often than it is retyped.

Fields compile to `SpxField`, and the existing adapter turns those into the `FieldDescriptor`
every editing surface renders. One direction only: declaring descriptors would need a second
compiler that could disagree with the first.

---

## 4. The machine

The main group's **default path is derived, never declared**. Its length must equal the step
count, and the step count depends on the preset, the line count and the steps flag — so any
literal path a type wrote down would be wrong for some options. `compileMachine` takes
`deriveMachine`'s answer (which is also what the runtime derives, so editor and playout agree
by construction) and layers the type's declarations on top:

- `pathEvents[i]` renames the arrow from waypoint *i* to *i+1*.
- `exitOnNext` authors the arrow into the exit, so `next` alone takes the graphic off air.
  Default off = exact parity with a graphic that has no machine.
- `branches` are off-path states; `timeline: null` means pose-only.
- `parallel` groups are declared literally — nothing derives them.

Waypoints are addressed by position (`{ waypoint: 0 }`, `-1` = the exit) because a type cannot
know the state ids `deriveMachine` will fold out of the step names.

Timelines name **logical parts**, not selectors, and declare ease by ROLE (`'in'` / `'out'`)
rather than as a curve, so a branch moves like the graphic it belongs to whatever the wizard
picked. `reveals`/`hides` are absent from `TypeTimeline` by construction — they are the ordered
walk's mechanics and are invalid off it, so a type simply cannot write one.

### The one trap worth knowing

**A timer never arms on a timeline that never ends.** A timer transition is armed by a call
scheduled at the from-state's entry timeline end; a timeline holding a `repeat: -1` loop or a
measured `dynamics` builder never reaches that point, so the state silently never advances.
Verified directly against GSAP, and now a `validateMachine` ERROR rather than a discovery.

This is why the ticker type is a one-item rotator and not the classic marquee, and why it ships
its own `ticker-rotate` preset: the machine is the cycle, so the entrance has to finish.

---

## 5. Designs and promotion

A `TypeDesign` builds the template — normally by delegating to the existing catalog variant it
promotes. `attachMachine` then puts the compiled machine on afterwards, which is the one
mechanism for every type: it needs nothing exported from any category, and a type with no
machine gets its template back untouched.

**Promotion is id-preserving.** `mergeCatalog` replaces a hand-written variant by id and in
place, so a promoted design keeps its position in the browse grid and its identity in the AI's
variant enum, saved preferences and the sweeps. `e2e/graphic-types.spec.ts` pins that promotion
changes nothing but the machine: same html, same css, same JS outside the marked region.

`attachMachine` **throws** on an off-shape compiled machine, deliberately unlike
`convertToDataRegion`'s quiet degrade. That degrades because its input may be hand-written;
here the input is our own declaration compiled by our own code, and degrading would ship a
graphic whose control page has buttons that do nothing. Every catalog variant is created by the
bench spec, so a broken type is a red build.

### What makes a design promotable — six gates, not one

A compiled variant takes its TYPE's declarations, so promotion can change things about a design
that have nothing to do with which type it belongs to. "The required parts resolve" is the
weakest of the checks and the only obvious one. All six have to hold:

| gate | what fails | caught by |
|---|---|---|
| **parts** | a required selector is absent | `attachMachine` / `missingParts` |
| **fields** | the design emits a different field COUNT than the type declares | `graphic-types.spec.ts` |
| **machine + motion** | a timer transition on a design whose timeline never ends | `validateMachine` |
| **capabilities** | design and type disagree on any offered default | `graphic-types.spec.ts` |
| **samples** | the design's starting text differs from the type's field values | nothing — read it |
| **semantics** | the fields line up but MEAN different things | nothing — judgement |

The last three are the dangerous ones, and the last two are not mechanically checkable at all.
Measured on the first pass: 24 cells looked promotable on parts alone, 8 actually were.

#### The capabilities gate is the whole offered default set, not just `logo` and `maxLines`

`animationPresets` is a capability like the other two, and the loudest of them — **`[0]` is the
default a new project is created with**, and the list is exactly what the wizard, the Inspector
and the AI's legal-preset check offer. A type declaring one list for all its designs therefore
rewrites the motion of every design it promotes.

Measured across the twenty shipped promotions: **six drifted their default entrance and four
lost presets outright.** bug02, the house sponsor bug, opened with a plain fade instead of rising
into its corner. card02's `snap-stinger` — the preset its painted lean exists to survive — stopped
being offered anywhere. sb02 "Quiet Score", a *minimal* design, defaulted to a sport slam purely
because its type's other design is a sport one.

**Why nothing caught it, which is the durable part.** `create({})` resolves the preset from the
design's OWN variant record, not from the compiled one, so the emitted code never moves — and
neither does `catalog-baseline.json`, nor the render fingerprint, nor the byte-identity check
that exists precisely to police promotion. The drift lives entirely in what the UI offers. **A
baseline taken from output cannot see a gate that only changes input**, and this is the second
gate in this table with that shape (`samples` is the first).

`TypeDesign.animationPresets` is the escape hatch, exactly mirroring `TypeDesign.samples`: the
design keeps the vocabulary it was authored around, the type still declares the default for
designs that do not care. Like samples and unlike theme-token overrides, entries here are **not
conformance debt** — a sport slab and a glass panel are *supposed* to enter differently.

**`defaultZone` is the same story**, and it drifted on four designs. A type says a sponsor bug is
"parked in a corner"; *which* corner is a drawing decision, and bug01's frosted tile is authored
for the top-right safe area in its own file's opening comment. `TypeDesign.defaultZone` overrides
it the same way. (`palette` and `fontId` were already per-design — qz01's entry had simply
transcribed the sport family's volt/oswald over the board's own royal/archivo.)

The rule that falls out, and the one the spec now enforces: **a type may WIDEN what a design
offers — a longer preset list, more lines — but it may never change that design's own default or
take something away.**

Two worked examples, both real:
- `lt01` into **social-bug** passed every shape check — that type shares the lower-third prefix,
  category, parts *and* field count, and differs only in what the fields mean. It replaced the
  catalog's default lower third with a handle bug and broke about forty specs.
- `card04` into **title-card** would have offered five lines to a design built for three. It
  broke nothing, so no test objected; it was found by comparing declared capabilities.

`TypeDesign.samples` (by logical field key) is the escape hatch for the samples gate: a design
keeps the text it was written around while the type still declares defaults for anything that
does not care. **These are not conformance debt.** A theme-token override records a design
disagreeing with its family and that map is meant to shrink; a sample is *supposed* to suit its
design. Only the wizard's suggested lines are affected — the emitted html, css and js are
identical either way, which is why no baseline moves and why a rendered check is the only thing
that sees it.

### The factory runs all six gates — `scripts/factory.mjs`

The Phase 3 batch loop (docs/noacg-master-goals.md). It derives the type × family matrix from the
live registry, runs every design through all six gates, classifies each failure **by the gate that
caught it**, writes a machine-readable report (`--json`), and **exits non-zero**, so it works as a
CI gate beside `npm run build`. `node scripts/factory.mjs` prints matrix + gates;
`check --ids a,b` scopes it. It needs the dev server up, like `scripts/l3-sweep.mjs`.

It reads the registry through the running app rather than parsing source, because a type's
`category` is kebab-case (`corner-bug`, `info-card`) and a naive word regex silently truncates it —
that mistake once produced a confident wrong count of what was promotable.

Three of the six gates were "not mechanically checkable". All three now have a mechanical form:

- **capabilities** — compares a compiled variant against the design's own PRE-MERGE catalog entry
  (`HAND_WRITTEN`, exported from `catalog.ts` for this). Covers the whole offered set: `logo`,
  `maxLines`, the preset vocabulary and the zone.
- **samples** — compares the text a design renders against what the wizard would offer.
- **semantics** — cannot be *decided* by machine, but the real failure (`lt01` into social-bug) had
  a mechanical tell: the design's line LABELS differed from the type's field labels. The factory
  raises that signal; the author signs it off with **`TypeDesign.semantics`**, and an
  unacknowledged signal fails the batch.

**What it caught on its first run over the full matrix — 13 of 48 designs:** the motion/zone drift
above still un-declared on all eight agenda and poll designs (each authored for a single measured
preset, compiled to three); `lt02` widened to a mask-wipe it was never drawn for; `card02`/`card03`
and `tk07` showing generic type copy instead of their own (card03's were a line out of step, so the
wizard offered the first body line as the card's heading); and the `Bars`/`Heading` vs
`Options`/`Question` semantics signal on the four poll designs. All fixed; the loop is green at
48/48.

Beyond the six per-design gates, the loop also validates **the pack config** (`packs.ts`
resolves against the live registry; the 60 reference formats covered exactly once — see
`PACK_TAXONOMY.md`) and **literal token drift**: the emitted CSS of every catalog variant is
grepped for the literal FORMS of tokens the family actually values (a hand-typed glow where
`var(--accent-glow)` should be, a literal `backdrop-filter: blur()` where `var(--panel-blur)`
should be). The override map cannot see those — a design hand-typing a near-miss of its
family's value reads as *conformant* — which is how bug02/lt12/tk05/tk06 shipped near-miss
glows (THEME_DEFAULTS_REVIEW §"The blind spot"). Scoped to families where the token has a real
value, so sport's intentional accent halos never trip it.

**Failure modes the loop has recorded (append new ones here):**
- *A purpose-built design needs `samples` just as a promoted one does.* Any design whose own
  suggested lines differ from the type's field defaults must declare them — the gate is about the
  wizard's text matching the design, not about promotion.
- *Measured-motion designs must declare `animationPresets`.* A design whose entrance IS its
  measured builder (a bars-grow, a rows-cascade) offers exactly one preset in its own file, and a
  type that offers three silently re-choreographs it.

---

## 6. The registered types

Counts are how many of the 60 reference formats in `live_format_graphics_needs.xlsx` ask for
that graphic. Every type now ships in all four style families; the design named here is the
noacg (or, where the house has none, the flagship) look, and its machine is the same whichever
family a cell is in.

| Type | Freq | Flagship design | Machine |
|---|---|---|---|
| Lower third | 52 | lt11 House Strap | – |
| Sponsor bug | 37 | bug02 House Clock | – |
| Countdown | 30 | gt05 House Countdown | parallel `clock` (pause/resume) |
| Topic card | 29 | card06 House Topic | – |
| Title card | 23 | card05 House Title | – |
| Agenda | 22 | ig08 House Schedule | – |
| Social handle | 17 | lt14 House Handle | – |
| Poll result | 13 | ig11 House Poll | – |
| Holding screen | 9 | ss04 House Hold | parallel `clock` |
| Ticker | 8 | tk07 House Rotator | timer cycle + pause/resume/skip |
| Scoreboard | 5 | sb03 House Score | parallel `flag` / `result`; `goalA`/`goalB` raise the flag from either state and carry that side's score +1 as an `adjust` payload (the clock group moved to the sports boards that draw a clock — see the note in `types/scoreboard.ts`) |
| Quiz board | — | qz02 House Quiz | branches `selected` / `locked` |
| Now / Next | — | card21 House Now Next | – |
| Headline card | — | card25 House Headline | – |
| Process / checklist | — | card29 House Runbook | – (stepped by default) |
| Public notice | — | card33 House Notice | parallel `level` (escalate / stand down) |
| Statement | — | card37 House Statement | – |
| Key facts | — | ig17 House Facts | – |
| Recap / actions | — | ig21 House Actions | – |
| Three-answer board | — | qz10 House Triple | the quiz board's machine, unchanged |
| Two-answer board | — | qz06 House Split | the quiz board's machine, unchanged |
| Live vote | — | pl01 House Vote | timer voting window + branches `closed` / `called` |
| Viewer question | — | aq01 House Question | – |
| Q&A card | — | qa01 House Q&A | `answer` on the walk |
| Chat highlight | — | ch01 House Comment | timer self-dismiss + pose `held` |
| Question queue | — | qq01 House Queue | branches `forward` / `back` |
| Community request | — | rq01 House Request | – |

Scoreboard, ticker and quiz board earn their place by what they prove rather than by frequency:
parallel groups, timer-driven motion, and the far end of the model.

The AUDIENCE PACK's eight types (the last eight rows) are the audience-interaction set — the
graphics a talk show, livestream, podcast, webinar, church, conference, quiz show or election
programme uses to put what the audience sent on screen. Three things in that block are worth
reading as claims rather than as entries:

- **Two, three and four answers are one machine.** The row count changes the fields and nothing
  else, because the pick is DATA (`types/answerBoard.ts` holds the shared arc). If a smaller
  board had needed a smaller machine, "parameterize with data, not states" would have been a
  slogan rather than a rule.
- **Two of the five audience types persist no machine at all.** A viewer question and a prayer
  request come on and go off; the derived machine is already right, so nothing is written down.
  They are still distinct TYPES — different fields, different meaning, different control page.
- **Both timer types close a real loop.** The live vote's voting window and the chat highlight's
  dwell are `gsap.delayedCall` transitions armed when the entrance settles, so the bench's
  timeScale and the render pipeline's virtual clock drive them, and a settled or scrubbed graphic
  never arms one. Their KNOWN LIMIT is stated in the type files: the delay is authored on the
  arrow, not a per-play operator field, and both graphics carry a manual button beside it.

The seven below them are the TITLE / TOPIC / INFORMATION pack (`src/templates/pack4/`). They
carry no frequency count because the reference sheet asked which graphics a format needs and
answered "an opener" and "a topic card" — the two types already above. Each of these is a shape
those two were being made to stand in for: a now/next card is not a title card with different
words, a process shown all at once is not a process, and a bilingual reading is not a quote.
Six of the seven add no machine, which is the rule holding at scale. The notice adds one
parallel group, because a notice's LEVEL changes while the graphic is on air and re-taking the
card to change it would blank the screen at the worst possible moment.

The pack also added the fourth wizard-facing capability, `defaultSteps`: whether a design starts
in multi-step mode. It is a capability rather than a preference for the same reason
`animationPresets[0]` is — it decides what an untouched `create({})` produces, and a process
card created single-step shows its last step on the first frame. The wizard's steps flag became
tri-state (`null` = the design decides) to make room for it, matching `zone` and `logoEnabled`,
and `scripts/factory.mjs` gates the drift the same way it gates motion and position.

### The identity family (templates/types/identityBugs.ts)

The persistent marks — everything that stays on screen while other graphics come and go. They
came in as one pack rather than one at a time because they share a structure (the corner-bug
contract), and splitting them by frequency would have shipped a station ident with no live bug
to sit beside it. Eight types, four families each, so the matrix stays full.

| Type | Flagship design | Machine |
|---|---|---|
| Station ident | bug05 House Ident | – |
| Live status | bug09 House Live | branches `live` / `replay` / `standby` |
| Logo mark | bug13 House Mark | – |
| Sponsor strip | bug17 House Sponsor Strip | – |
| Sponsor rotation | bug21 House Sponsor Rotation | timer cycle + hold/resume/skip |
| Event ident | bug25 House Event Bug | – |
| Award mark | bug29 House Award Bug | – |
| Location chip | bug33 House Location Chip | – |

Six of the eight declare no machine — the derived linear one already says "it arrives, it
persists, stop() removes it". The two that do are the two where the state is the graphic's
POINT: a live bug that could not actually switch between live, replay and standby would be
claiming a status it does not track, and a sponsor rotation that did not advance by itself
would be a sponsor bug with extra fields. Both were verified running, not just compiled — the
status swap through `noacgDispatch`, the rotation through its own armed timer.

### The gap-list types (templates/types/commerce.ts, goals.ts, transitions.ts)

Eight more types shipped with the gap-list round (docs/PACK_TAXONOMY.md): **call-to-action,
product-card, offer-card, listing-card, goal-meter, milestone-track, qr-card** and **transition**.
They are not in the frequency table because the sheet does not name them as formats — they are what
the sheet's formats kept ASKING for, which is the gap list's whole job. All eight follow the
founding rule: only `transition` declares a machine.

`transition` is worth singling out as the one type whose entire content is its LIFECYCLE — its
entrance covers the frame, and a `timer` arrow from the entrance waypoint straight to the exit
clears it again. That arrow is what `TypeMachine.main.edges` exists for: a branch's edges always
have the branch at one end, and modelling a self-clear as a branch would have meant inventing an
off-path state that duplicates the exit.

### The competition pack's twelve (docs/COMPETITION_PACK.md)

Esports, competition, result and reveal graphics — 38 designs over four categories. They are
NOT frequency-driven: they answer "what does a competition need", which the reference sheet's
gap list had already named as the next two type families (PACK_TAXONOMY §gaps).

| Type | Flagship design | Machine |
|---|---|---|
| Esports scorebug | es02 House Series | parallel `phase` (pre/live/final) + `pause` |
| Map / round indicator | mr02 House Maps | branches `advanced` (cursor) / `decided` |
| Match-up | mu02 House Match-up | branches `selected` ⟳ / `neutral` / `locked` |
| Head-to-head | h202 House Compare | branches `highlighted` ⟳ / `level` |
| Player card | pc02 House Player | walk press `stats` + branches `mvp` / `plain` |
| Roster | rs02 House Roster | branches `spotlight` ⟳ / `level` |
| Standings / result table | st02 House Standings | branches `highlighted` ⟳ / `plain` / `final` |
| Bracket | br02 House Bracket | branches `advanced` ⟳ / `crowned` |
| Nominee reveal | nm01 House Nominees | walk press `reveal` + branch `suspense` |
| Verdict card | vd02 House Verdict | branches `judged` ⟳ / `unjudged` |
| Winner card | wn02 House Champion | walk press `result` + branches `celebrating` / `plain` |
| Award / launch reveal | aw01 House Award | walk press `open` + branches `celebrating` / `settled` |

Every ⟳ is the same argument the quiz board makes about answers, applied to sides, rows and
nominees: **one state plus a field**, the value riding in as the event's payload. Their matrix
is deliberately partial (3-4 families each rather than all four) — an unfilled cell is a
missing design, which the factory reports and does not fail on.

### The matrix is full for the founding twelve — and how it filled

All cells (× noacg / glass / sport / minimal) are filled: 48 of the original twelve types, 28 of
the title/topic/information pack's seven, and 32 of the identity family's eight. The gap-list,
competition and audience packs (sections below) each add their own types and fill the cells their
designs cover; an empty cell is work not yet done and the factory deliberately does not fail on
one (`scripts/factory.mjs`), so leaving a cell empty costs nothing while shipping a wrong design
costs a lot. The route there is worth
recording, because it was not the one the first pass predicted:

- **The promotion well ran dry fast.** 24 cells looked promotable on parts alone; 8 actually were
  on the first pass, and after promoting the single design that cleared all six gates on the
  second (lt05 into the sport lower third), **zero** promotable designs remained. Every other cell
  is a DESIGNED variant. "The parts resolve" is the weakest evidence a design belongs to a type,
  and in a mature catalog it is almost always the *only* thing that resolves.
- **Designed, not promoted, is the norm — not a failure.** A cell with no promotable candidate is
  a cell that needs a design, and 30 of them got one, each named against its lower-third sibling
  and built from its family's shape tokens rather than improvised. A designed variant is a
  first-class fill; a promotion is just the shortcut available when an existing design already *is*
  the graphic.
- **Type-uniform runtimes belong in one place.** When every design of a type renders its content
  the same way — a schedule board's rows, a poll's bars — that rebuild is not per-design and does
  not belong copied into each. It lifts into a shared helper (`infographics/dataRuntimes.ts`), and
  the designs that used to inline it emit byte-identical output afterwards, so the baseline proves
  the extraction changed nothing.
- **A rotator is a preset, not a redesign.** The three ticker cells are strips with ordinary
  items; the shared ticker runtime turns any design into a rotator when the rotate preset is
  chosen (the track stops travelling and wraps, the separator hides). The design work was the
  strip, not the motion.

### Which acceptance criterion each proves

- **Simplicity guard** — lower third: one group, three states, no machine key at all.
- **Scorebug** — scoreboard: scores are data that move no pointer; flag and result are
  independent 2-state groups instead of combined states (the clock group lives on the sports
  boards that draw one); simultaneous events resolve in order. A GOAL moves the score WITH the
  flag on one press - not by a state per side and not by a template-side counter, but by the
  control's `adjust` (docs/CONTROL_LAYER.md): the surface sends the event carrying the new
  figure, the machine applies both or neither, the log holds the absolute score.
- **Ticker** — ticker: items cycle with no operator input, and pause holds them.
- **Millionaire** — quiz board: one `selected` state plus a `selectedAnswer` field (never one
  state per answer); after `lock` there is no `select` arrow, so a late pick is dropped with its
  payload rather than refused by a condition.
- **Compatibility** — every type: `update`/`play`/`next`/`stop` alone still walk the default
  path, which is what a playout server has.

---

## 6b. The sports pack — eight more types

`docs/SPORTS_PACK.md` documents them in full (including the capability matrix of every shared
type they use or extend). What they add to the argument HERE:

| Type | Designs | Machine |
|---|---|---|
| Scorebug | sb05–sb08 | parallel `clock` (3 states) / `play` / `result` |
| Match board | sb09–sb12 | the same three groups |
| Match status | sb13–sb16 | ONE `status` group, three mutually exclusive states |
| Match event | sb17–sb20 | main path + a pose-only `held` branch + an auto-clear TIMER |
| Lineup | ig26–ig29 | – (derived) |
| Standings | ig30–ig33 | – (derived) |
| Stat comparison | ig34–ig37 | – (derived) |
| Fixtures & results | ig26–ig29 | – (derived) |

Four of the eight persist no machine at all, which is the §2 rule working at scale: their
content is a list and their motion is measured from it, so the derived linear machine is already
correct.

Three things they demonstrated that the earlier twelve did not:

- **A parallel group can need a third state.** The clock's `armed` (at the period's starting
  value, not running) is genuinely distinct from `stopped` (held mid-period). Without it,
  starting the second half means reloading the graphic.
- **Some state groups are mutually exclusive and belong in ONE group.** The status card's live /
  interval / full time are not independent facts, unlike the boards' three groups — a card
  cannot be at half time and finished at once. Choosing parallel-vs-single is a modelling
  decision each type makes, not a house default.
- **`TypeMachine.main.edges` was missing.** A main-group arrow that is neither a rename of a walk
  arrow nor a branch's own had nowhere to live; the match event's auto-clear timer needed one.
  Hiding it in some branch's `edges` array would have made the machine's shape depend on which
  branch the author happened to write it under.

The sports types also stress the **capabilities gate** hardest so far: 32 designs each declaring
their own `animationPresets`, `defaultZone`, palette, font and `samples`, because a sport slab
and a frosted pill genuinely do not enter the same way. All 32 pass it.

## 7. Adding a type

1. Declare it in `src/templates/types/<id>.ts` — structure, fields, machine, controls,
   capabilities, designs.
2. Register it in `types/registry.ts`.
3. `e2e/graphic-types.spec.ts` then holds it to the bar automatically: it must parse, clear the
   export gate, resolve every part it promised, keep `settings.steps` derived, and declare only
   control events its machine actually authors.

If it needs no branches or parallel groups, leave `machine: {}` — the derived one is right.
