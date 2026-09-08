# SVG behaviour - one binding for any graphic

**Status: implementation plan, 2026-09-05; phases 0 to 5 BUILT the same night** (the owner's
go-ahead that evening: work through phase 5, land when ready). The five modules are gone; the
quiz, the score tracker, the live vote and the countdown compile from declarations under
`src/templates/behaviours/` through one table and one runtime; switches and choices compose beside
them; an undrawn quiz moment wears NoaCG's own look; the quiz's lock is an option; a meter and an
alert joined; the proposal reads one word list and the designer-facing tables are generated from
it. §13 records what building it changed in the design and what phase 5 left for later. Phases 6
and 7 remain. Nothing here changes what the two graphics the 2026-09-12 production is judged on do
on air with a bound quiz - only what an UNBOUND moment shows.

**The question this answers.** Five behaviours now attach to imported artwork - the quiz, the
plain-stepper scoreboard, the live vote, the score tracker, the countdown - and every one of them is
a hand-written module: its own pickers in the mapping step, its own name matcher, its own paint JS,
its own class pair, its own draft type. That is the shelf of ready-made cells the owner argued
against on 2026-09-03 (`docs/backlog/graphics-without-a-ready-made-template.md`): the space of
graphics a show needs has no bound, so a shelf always runs out. This plan replaces the five modules
with ONE binding format, ONE paint runtime and a table of declarations, so that a graphic nobody
anticipated - a poll, an award, a lineup, an election board, a map - gets its controls from the
structure the designer drew, and the five shipped behaviours become the first five rows of that
table rather than five programs.

**What it builds on and does not replace.** The state-machine model (`docs/STATE_MACHINE_SCHEMA.md`)
is the one behaviour model and stays it. The generated control layer (`docs/CONTROL_LAYER.md`) stays
the one control generator. The graphic-type compiler (`attachMachine`, `docs/GRAPHIC_TYPES.md`) stays
the one way a machine reaches a template. The moment ladder (`docs/SVG_STATES_FROM_ARTWORK.md`,
ratified 2026-09-03) is a rung of this plan, not a competitor. The P2 research
(`docs/BEHAVIOUR_AUTHORING_RESEARCH.md`) chose recipes-then-sentences as the authoring ladder; this
plan is what recipes and sentences write INTO.

Companion records: `docs/GRAPHIC_BEHAVIOUR_PLAN.md` (the pilot and what each behaviour found),
`docs/SVG_AUTHORING.md` (the designer-facing page this plan rewrites §5b of),
`docs/BEHAVIOUR_SURVEY.md` (what comparable products ship), `docs/OGRAF_STATE_IN_FIELDS.md`
(why operator-visible facts are fields).

---

## 0. The short version

- A designer draws the graphic. Every moment it can be in is a **hidden layer**. Text the operator
  types is a **text layer**. A bar that fills is **drawn full**. That is the whole artwork contract,
  and it is already the contract today.
- On import NoaCG reads the structure into a **role table**: which layer is a field, which hidden
  layer is a look and of what, which layers repeat as rows. Names are a shortcut that fills the
  table; pickers are the road; the table is what is stored.
- A **recipe** (quiz, score, vote, countdown, switch, choice, ranking, ...) is a declaration, not a
  module: the roles it needs, the rows it repeats, the fields it owns, the machine it attaches, the
  buttons it declares, and how each look is painted. Recipes are data in
  `src/templates/behaviours/`. Adding a behaviour is adding a declaration.
- The template carries `data-noacg-role` stamps on the SVG nodes and a versioned
  `NOACG_BEHAVIOUR` table in design-owned JS. One emitted paint runtime reads both. The machine
  itself stays in `NOACG_ANIM` exactly as today.
- Controls come from the machine, as today. A look shows under a **condition made of picks**: any
  of some states, and all of some field facts. No expression, ever. Facts come from **field kinds**
  that own their own derived truth (a row pick, a share, a clock's phases, a bounded counter).
- Simple stays simple. Rung 0: import, done. Rung 1: hide a layer and it is a switch. Rung 2: name
  layers the plain way and a recipe arrives filled in. Rung 3: tick an option. Rung 4: the sentence
  board (P2). The graph and the agent door remain the escape hatches.
- The five shipped behaviours port to recipes with byte-different, behaviour-identical output,
  pinned by the specs that pin them now. Exported files already in the world are untouched.

---

## 1. What five behaviours taught, read together

Each module recorded its own finding; read as a set they are a decomposition, and the decomposition
is the design.

| Part of a behaviour | Quiz | Score tracker | Live vote | Countdown | Where it varies |
|---|---|---|---|---|---|
| The machine | catalog's, filtered | catalog's, edges regenerated per row count | catalog's, filtered | catalog's plus `armed` | never in kind - always a `TypeMachine`, sometimes a function of the row count |
| The buttons | catalog's | per-row `+1`/`-1` with `adjust`, board verbs with `set` | catalog's | Start/Pause/Reset | never in kind - always `TypeControlEvent[]`, sometimes a function of the row count |
| Rows | answers A-F | teams 1-8 | options 1-8 | none | a keyed repetition or none |
| Fields it owns | answer key, pick | none | five wire fields | warn seconds | zero or more hidden holders with stable titles |
| Fields it reads | the pick | each team's figure | the wire | the clock | ordinary bound fields |
| Looks (drawn layers shown by the runtime) | selected/correct/wrong per row, locked | flash per row, full time | badge, figure, winner per row | warning, held, time up | the thing the designer draws; always a hidden layer |
| Gauges (drawn full, interpolated) | none | none | a bar per row | a bar | the L4 model |
| Writes (runtime puts text into a layer) | none | none | label, percent, total | the clock digits | a layer the runtime owns, so it stops being a field |
| What drives a repaint | a state changed | a state changed or data moved | data moved | a runtime tick | three drivers, all needed |

Everything in the first two rows was already generic. Everything in the other rows is one of a
small fixed set of kinds, and every module hand-wrote the same three things about them: which
layer plays which kind, when a look shows, and how the paint is emitted. That is the part this plan
makes data.

The condition column is where the doctrine bites, so it is worth reading the five conditions the
modules actually needed:

| Look | Shows when |
|---|---|
| `A selected` | the machine is in `selected` or `locked`, and the pick field names A |
| `A correct` | the machine is in `reveal`, and the answer-key field names A |
| `A wrong` | the machine is in `reveal`, and the answer-key field does not name A |
| `Locked in` | the machine is in `locked` or `sealed` |
| `Flash 2` | the flag group is in `shown`, and the figure that moved was row 2's |
| `Winner 3` | the result is shown, and row 3 holds the largest share with no tie |
| `Warning` | the clock has fewer than N seconds left |
| `Time up` | the clock is at zero |

Not one of those is an expression. Each is a pick from states, combined with a fact that a FIELD
can state about itself: a row-pick field knows which row it names; a share field knows its leader
and whether there is a tie; a clock knows its phase; a number knows whether it moved. That is the
survey's conclusion arriving from the other side (`docs/BEHAVIOUR_SURVEY.md` §5: what is missing is
a small vocabulary of self-describing field kinds, not a language). The binding never compares
anything. The field kind owns the comparison, and it owns it once, in the runtime, for every
recipe that uses it.

---

## 2. The model

Six nouns, three paint mechanisms, one condition shape. Every word here is a word in the table, in
the code, in the docs and in the UI, and each idea has exactly one.

### 2a. Nouns in the artwork (what a layer IS to the behaviour)

| Noun | What the designer draws | Bound as |
|---|---|---|
| **field** | a text or picture layer the operator edits | `id="fN"` - unchanged, this is the import today |
| **row** | a unit that repeats with a key: answer A, team 1, option 3 | a key on every role that belongs to the row |
| **look** | a hidden layer showing what something looks like in one condition | `data-noacg-role="answer.selected/A"` |
| **gauge** | a shape drawn at its full extent, to be scaled by a number | `data-noacg-role="bar/2"` |
| **readout** | a layer the runtime writes text into (the clock, a percentage, a total) | `data-noacg-role="percent/2"`; it takes no `fN` |
| **object** | the whole graphic, or one row - what a look belongs to | implicit: a role without a row key belongs to the graphic |

A look, a gauge and a readout are the three paint mechanisms the five modules used (L2, L4 and the
text write). A fourth, **arrange** (rows swap places by a figure - the ranking the owner called
"amazing"), is designed here and built in phase 5; it is the first mechanism that moves the
designer's layers rather than showing them, and it is measured at rest exactly as gauges are.

### 2b. Nouns in the logic (unchanged)

State, group, transition, event, timer, default path - `docs/STATE_MACHINE_SCHEMA.md`. This plan
adds nothing to the machine format. A recipe compiles to a `TypeMachine` and reaches the template
through `attachMachine`, which is how every catalog type and every shipped behaviour already gets
there.

### 2c. Facts, and the field kinds that own them

A **fact** is a named truth a field can state about itself. The runtime asks the field kind; the
binding only names the fact. The kinds this plan needs, and the facts each exposes:

| Field kind | Exposes | Used by |
|---|---|---|
| `select` (exists: dropdown) | one fact per option value: `is:<value>` | switches and choices (a reported field, §2e), vote status |
| `row-pick` (new: a dropdown over the row keys) | `picked` / `unpicked`, relative to a row | the quiz's pick and answer key, a lineup's captain, a bracket's advanced team |
| `row-set` (new: a list field whose lines are row keys) | `listed` / `unlisted`, relative to a row | a checklist, bingo's called numbers, an award's revealed nominees |
| `number` (exists) | `moved` (this update changed it), `zero` | the score flash |
| `counter` (new: a number with a declared min and max) | `at-min` / `at-max`, plus the legality it reports | paged lists - the survey's "grey Next on the last page" without a comparison |
| `share` (new: a row's count as a share of all rows) | `leader` / `tie` / `empty`; derives `percent` for a readout | the vote's winner mark and figures |
| `clock` (exists: countdown) | `armed` / `running` / `warning` / `expired`; derives the digits | the countdown's three looks and its readout |
| `fraction` (new: a number against a declared total field) | derives the 0-1 value a gauge scales by | goal meters, a timer bar |

A fact is a pick from the list the kind exposes. The wizard, the validator and the sentence board
all read the same list from the kind's declaration, so a fact that does not exist cannot be named.
`row-pick` is what "parameterize with data, not states" looks like as a field: one `selected` state
plus one row-pick field, whatever the row count.

### 2d. The condition shape

A look shows when its condition holds. A condition is:

```jsonc
{ "state": ["main/selected", "main/locked"],   // ANY of these (group/state), optional
  "facts": ["f6:picked"] }                       // ALL of these (field:fact), optional
```

Two slots, each a list of picks, one AND between them. A row-relative fact (`picked`, `listed`,
`leader`) is evaluated for the row the look belongs to. A condition with neither slot is always
true, which is what a look that is simply "on while the graphic is up" declares. That is the whole
grammar, and there is no third slot into which a comparison could be typed. `data-condition` in the
machine stays reserved and unused, exactly as it is today.

Gauges and readouts have no condition. A gauge declares which field's derived value scales it and
along which axis; a readout declares which field's derived value it prints. Both repaint on data,
never on state, which is the vote board's rule (`docs/GRAPHIC_BEHAVIOUR_PLAN.md` §12) made general.

### 2e. Operator-visible facts are fields

`docs/OGRAF_STATE_IN_FIELDS.md` is binding here: if an operator has to see it, it is a field. The
machine holds what the operator does. So every recipe whose looks bind to a state ALSO mirrors that
state into a reported field where an external controller could need it. The mechanism already
exists - `set` on a control, shipped for the score board's New game - and the runtime obeys the
field on `update()` (the vote status pattern). For the two micro-behaviours in §7c this is the
whole design: the look binds to the field, the group exists for greying and for the animated
change, and the button's `set` keeps them in step. Nothing new crosses the OGraf wire because
nothing new needs to.

---

## 3. The artwork convention

What a designer does in Illustrator, Figma or Inkscape. Three rules, then names as a shortcut, then
an explicit form for people who want zero ambiguity. `docs/SVG_AUTHORING.md` §5b becomes this
section, generated from the recipe declarations so the two can never disagree again (the
`Answer 1` defect in `docs/backlog/` is a doc that drifted from a matcher).

### 3a. Three rules, unchanged

1. **Draw the base look first**, panel and text. That alone imports as a working graphic.
2. **Every moment is a hidden layer.** Click the eye off. A hidden layer is offered as a look
   BECAUSE it is hidden; hidden text is still not a field.
3. **Words last.** SVG paints in document order; a look drawn after the text covers it.

Plus the two the fit ladder already teaches: a bar you want scaled is drawn at its FULL length, and
a plain figure (`0`, `12`) is what makes a layer a number.

### 3b. Names as the shortcut (the plain vocabulary)

The rule that already holds and stays: **a name is a role word plus, for a row, the row's key as its
own word.** `Answer A`, `Team 1`, `Bar 3`, `A selected`, `Flash 2`, `Locked in`. `Score 10` is not
`Score 1`; `Options` is not option S (the filed heading defect - the shared tokenizer requires the
key to be a separate token at the END of the name, phase 0). Role words, synonyms and translations
are declared per role in the recipe, which is where `Palkki`, `Joukkue` and `Vaihtoehto` move to
from four separate regexes.

The vocabulary the product teaches, ruled 2026-09-03: `selected` / `correct` / `wrong`. The UI
labels move to those words; the matcher accepts the older `picked` / `right` as synonyms without
teaching them.

### 3c. The explicit form (structure without a recipe)

The `f:` prefix exists and is the precedent: a colon-prefixed word that names what a layer IS. Two
more, and they are the two smallest recipes (§7c):

| Name | Means | What the operator gets |
|---|---|---|
| `f:Label` | an editable field (exists) | an input |
| `show:Label` | this hidden layer is a switch | Show *Label* / Hide *Label* |
| `choice:Group/Option` | one of a set of mutually exclusive looks | one button per option, the current one greyed |

`show:Sponsor`, `choice:Status/Live`, `choice:Status/Replay`, `choice:Status/Standby`. Illustrator
escapes both characters (`_x3A_`, `_x2F_`) and `decodeLayerName` already reverses every `_xHH_`
escape, so the form survives every exporter the corpus has. The explicit form is never required: a
hidden layer nobody named is offered in the mapping step with the same two choices, one click each.

No further prefixes. A recipe's roles use plain words because a recipe is TAUGHT; the explicit form
covers the two behaviours that need no teaching. Growing the prefix family into a per-recipe
grammar would be the renaming ritual the MXMZ lesson forbids (`docs/COMPETITOR_MXMZ.md` §3).

---

## 4. Inferred, offered, declared, never

| | What |
|---|---|
| **Inferred**, silently | fields from text layers; numbers from plain figures; a clock from `M:SS`; a picture from an image; the panel behind a line; hidden layers as look candidates; rectangles as gauge candidates; row keys from names; every role a name states |
| **Offered**, one click | which recipe, computed from evidence (§7b), defaulting to nothing; `show:` and `choice:` on any unclaimed hidden layer; a role picker for every role a name did not state; the default look for an undrawn moment |
| **Declared**, by the author | a recipe's structural options (require lock, reveal by itself after N s); which layer is the clock when two look like one; anything two rules could disagree on |
| **Never** | the machine, from artwork; a role, from an unnamed layer; a comparison, from anywhere; a behaviour, from AI in the import path (owner, 2026-09-03) |

The line between offered and declared is the one the mapping step already draws: a proposal fills a
picker, the picker is the road, and a proposal that could pick what the picker cannot show is a lie
(`scoreDrawnPool` states the rule). One inventory, read by both doors.

---

## 5. Storage

Two halves, both in the template, so a saved graphic needs nothing beside the template it already
is (a `SavedGraphic` persists the template and nothing of the wizard - `src/model/packets.ts`).

### 5a. Role stamps in the markup

`data-noacg-role="<role>[/<row key>]"` on the SVG node, placed by the bind pass beside `id="fN"`
and `data-noacg-el` (the growth stamp, same pattern, same pass). One attribute kind for every
role; the table says what each role does. A node may carry several roles, space-separated, for the
same reason the growth stamp is a list.

The designer's own ids are left alone, and the stamped `q-sel-1` / `s-flash-2` id namespace goes
away: the runtime queries by role, so it needs no id it has to keep unique against an Illustrator
file that may already carry one. Fields keep `fN` because SPX's `update()` is `getElementById`.

### 5b. The `NOACG_BEHAVIOUR` table

Design-owned JS, outside the marked ANIMATION region (the timeline rewrites that region; the growth
table stayed out of it for the same reason), commented the way `NOACG_ANIM` is, strict JSON inside
the braces, canonical serialization. Version 1:

```jsonc
var NOACG_BEHAVIOUR = {
  "version": 1,
  "recipe": "quiz",                       // which declaration wrote this, or "custom"
  "options": { "lock": true },            // the recipe's structural options, as chosen
  "rows": { "answer": ["A", "B", "C", "D"] },
  "fields": {                             // logical role -> the fN it compiled to
    "question": "f0",
    "answer": { "A": "f1", "B": "f2", "C": "f3", "D": "f4" },
    "correctAnswer": "f5",                // owned by the recipe: a hidden holder
    "selectedAnswer": "f6"
  },
  "kinds": { "f5": "row-pick:answer", "f6": "row-pick:answer" },
  "paint": [
    { "look": "answer.selected", "when": { "state": ["main/selected", "main/locked"], "facts": ["f6:picked"] },
      "default": "row-highlight" },
    { "look": "answer.correct",  "when": { "state": ["main/reveal"], "facts": ["f5:picked"] },
      "default": "row-mark:correct" },
    { "look": "answer.wrong",    "when": { "state": ["main/reveal"], "facts": ["f5:unpicked"] },
      "default": "row-mark:wrong" },
    { "look": "locked",          "when": { "state": ["main/locked", "main/sealed"] },
      "default": "badge:Locked in" }
  ]
};
```

What each key is for:

- `recipe` and `options` are the SOURCE, so the wizard can reopen the binding and the sentence board
  can show it as the recipe it came from. `"custom"` is what the sentence board writes once the
  machine no longer matches any recipe. This also gives `docs/backlog/back-to-the-wizard.md` its
  second half for imported graphics: the draft is reconstructed from this table.
- `rows`, `fields`, `kinds` and `paint` are the RUNTIME's whole input. The paint runtime needs
  nothing else, and a hand edit to any of them is honoured on the next `update()`.
- `default` names the platform treatment painted when the look's layer is absent for that row -
  the ratified ladder's rung 1 (§7d). A rule with no `default` shows nothing when undrawn, which is
  the correct answer for a flash.
- A gauge rule is `{ "gauge": "bar", "from": "f7:fraction", "axis": "x" }`; a readout rule is
  `{ "write": "percent", "from": "f7:percent" }`. `from` is always `field:derivation`, and the
  derivation is one the field's kind exposes.

The machine is NOT in this table. It is compiled by `attachMachine` into `NOACG_ANIM.machine` as
today, with one addition: every state a recipe declares carries `{ "time": 0, "call":
"noacgRepaint" }` on its timeline instead of a recipe-specific `applySelection` or `scoreFlash`,
and `update()` and the clock's `clockPainted` call the same function. One repaint, three drivers.

### 5c. Versioning, the doctrine applied

Root `AGENTS.md` rule 6 and `docs/STATE_MACHINE_SCHEMA.md` §5, verbatim in application: additive
optional keys never bump `version`; a breaking change bumps it and migrates on read in
`parseBehaviourData`; the serializer writes the current version; an unknown version degrades to
read-only (the template still runs, because the runtime it was emitted with is frozen in it); the
frozen-interpreter pairing rule applies, so `hasBehaviourRuntime(js)` gates every write and the
validator refuses a table under a runtime that predates its version.

---

## 6. The runtime and the controls

### 6a. One paint runtime

`src/templates/importedDesign/behaviourRuntime.ts` emits ES5, once, into every template that
carries a table (the pattern of `growthRuntimeJs` and the anim interpreter). It does four things and
nothing recipe-specific:

1. `noacgRepaint()` - read the machine's pointers (`noacgMachineState()`), read every field the
   table names, ask each field kind for its facts and derivations, evaluate each paint rule, and
   apply: looks by class (`.imported-design-look` / `.-on`, one pair for every recipe from now on;
   the drawn-state mechanism of `drawnState.ts` unchanged in kind), gauges by the measured-at-rest
   scale (the vote board's `<rect>` width rule, and scale about the drawn origin for anything
   else), readouts by `setFieldValue` so the fit ladder runs on what was written.
2. The field-kind library: `row-pick`, `row-set`, `number`, `counter`, `share`, `clock`,
   `fraction`, each a small pure function from the holder's text to facts and derivations. This is
   the one place a comparison lives, and it is not authorable.
3. The default treatments (§7d): generated SVG appended at build time, stamped as looks with
   `data-noacg-default`, so the runtime shows a default exactly when the rule's own layer is absent
   for that row. No drawing at runtime, so exports are self-contained.
4. Measurement at rest for gauges and, in phase 5, for `arrange` - the same discipline the growth
   runtime paid for: measure once, remember, never re-read a pose an earlier pass moved.

The runtime is emitted whole, versioned, and never spliced. A recipe adds no JS. That is the test
of the whole plan: **if a new behaviour needs a line of emitted JS, the vocabulary is missing a
kind, and the kind is what gets added.**

### 6b. Controls

Unchanged in mechanism: `machine.controls` compiled from the recipe's `TypeControlEvent[]`, every
button greyed by the structural guard, five renderers in step. What the recipes add to the shipped
vocabulary is only shapes it already has:

- a row-parameterised press: one button plus a row-pick field riding as payload (the quiz's Select
  answer), or one button per row (the score's `+1`), the recipe's choice;
- a switch: two buttons, `Show X` and `Hide X`, in a "Switches" section, each carrying `set` on the
  reported field;
- a choice: one button per option, the current one greyed by legality;
- a `counter`'s legality riding the machine-state answer the way `noacgTextOverflow()` does, so a
  Next-page button greys on the last page with no arrow evaluating anything.

No new control widget. The exported controller, the hosted page, the in-app tab, the simulator
strip and the production controller render these as they render every button today.

---

## 7. Recipes

### 7a. What a recipe is

A declaration in `src/templates/behaviours/<id>.ts`, registered in `behaviours/registry.ts`, the
shape of a graphic type with the artwork half added:

```ts
interface BehaviourRecipe {
  id: 'quiz' | 'score' | 'vote' | 'countdown' | 'switch' | 'choice' | 'ranking' | ...;
  name: string; description: string;
  rows?: { role: string; keys: 'letters' | 'numbers'; min: number; max: number };
  roles: RecipeRole[];            // kind, per-row or not, required or optional, name words + synonyms,
                                  // which inventory it is picked from, distinctive for the offer
  fields: RecipeField[];          // the hidden holders it owns, with kinds and stable titles
  options?: RecipeOption[];       // structural variants: each toggles arrows, states or a rule
  machine: (rows: string[], options) => TypeMachine;
  controls: (rows: string[], labels, options) => TypeControlEvent[];
  paint: (rows: string[], options) => PaintRule[];
  defaults?: Record<string, DefaultTreatment>;
}
```

`behaviour.ts` stops being a four-way dispatch and becomes the compiler: recipe plus binding in,
the seven things `assembleImportedSvg` needs out (`BoundBehaviour` is a good seam and stays; it is
implemented once). The type shim that mirrors field order for `fieldIdFor` is generated from the
table's `fields`, which removes the hand-kept mirror that every module warned was load-bearing.

### 7b. The offer

The mapping step offers what the artwork can carry, computed from evidence, never a category
(`docs/CONTROL_PANEL_ROAD.md` §9). One scorer replaces the order-sensitive dispatcher that produced
the `Answer 1` defect: each recipe's evidence is the count of its roles the names satisfy, and a
recipe is PRESELECTED only if at least one satisfied role is marked distinctive (a bar for the vote,
a numeric figure per team for the score, a countdown look for the timer, `Answer` rows for the
quiz). Ties go to the recipe with more distinctive evidence, then to none. "Nothing extra" stays the
default and says what the artwork already earned ("2 numbers, each with + and -"). "Something
else" stays a real row that records the ask through `src/feedback/`.

### 7c. The two micro-recipes, and composition

`switch` and `choice` are recipes with no rows, one look each (or one per option), one parallel
group each, and a reported `select` field each. Their declarations are a dozen lines. They matter
out of proportion to their size for two reasons:

- They are the universal floor. An award graphic with three reveal layers, a map with six region
  highlights, a lineup with a formation overlay, a lower third with a sponsor tag - none of these
  is a recipe anybody will write, and all of them are switches. The user's own progression named
  this first ("a correctly named hidden layer can automatically become a Show/Hide button"), and
  the machine model already expresses it as a two-state parallel group.
- They are the first COMPOSITION. Today one behaviour per graphic is a structural limit
  (`docs/GRAPHIC_BEHAVIOUR_PLAN.md` §12; challenge brief C8). A switch beside a quiz is two parallel
  groups and two disjoint role sets, which the machine has always allowed and the binding never
  did. Composition rule: recipes compose when their groups and their role names are disjoint; the
  compiler namespaces a micro-recipe's group and events by the layer's slug (`show-sponsor`), and
  refuses a second full recipe on one graphic until phase 5 proves two full recipes coexist.

### 7d. The default treatment

Ratified 2026-09-03: an undrawn moment gets the platform's neutral look, replaced per moment by the
designer's own layer. Recipes name a default per look role from a short fixed set the runtime
knows - `row-highlight` (outline the row's panel, the geometry the fit ladder already measures),
`row-mark:correct|wrong` (tick or cross at the row's end, green or red edge), `badge:<word>` (a
compact corner plate), `dim` (the other rows at reduced opacity). Generated at build time from the
measured panels, emitted as ordinary commented SVG, shown only where no drawn look exists. No
knobs, by the same ruling.

### 7e. Options - the first customization

Claim (b) in `docs/NORTH_STAR_2027.md` P2 - the next producer changes the behaviour - has a cheap
first rung, and it is the one the owner named on 2026-08-22: "what if I don't want to be able to
lock it?" A recipe option is a structural variant an expert authored: it adds or removes arrows,
states or paint rules, and nothing else. The quiz's first two:

| Option | Default | What it changes |
|---|---|---|
| Require lock before reveal | on | off removes the `judge` arrow's dependence on `locked`: an arrow from `selected` (and from the question) to the reveal |
| Reveal by itself after N s | off | on adds a timer arrow from `locked` to the reveal |

An option is a checkbox on the mapping step and a line in `options` in the table. It is M1 from the
P2 research exactly, and it is where option sprawl gets watched: a recipe with more than four
options is the signal that the sentence board is needed for that graphic, not a fifth checkbox.

---

## 8. The ladder, and where the system stops

| Rung | The author does | Gets | Exists |
|---|---|---|---|
| 0 | imports the file | fields, take/update/out, the derived machine | yes |
| 1 | hides a layer; ticks "switch" or names it `show:` | a Show/Hide pair; composes freely | phase 3 |
| 2 | names layers the plain way, or fills pickers | a recipe: its machine, buttons, looks, defaults | yes for five, as modules; phase 1-2 as recipes |
| 3 | ticks a recipe option | a structural variant of that machine | phase 5 |
| 4 | edits sentences (P2's M4) | any structural machine plus look bindings, still no expressions | P2, gated |
| 5 | the graph, Advanced mode, the table by hand | everything the format holds | yes |
| beyond | the agent door / CLI writes design-owned JS with `calls` and `build` hooks | anything | yes (`docs/AGENT_CLI.md`) |

Every rung writes the same two things - `NOACG_ANIM.machine` and `NOACG_BEHAVIOUR` - and reads
them back. A rung is a projection, never a store (the P2 invariant).

**Where the binding stops, stated as a test.** If a behaviour cannot be written as picks from lists
- states, facts a field kind exposes, roles, options - it is not a binding. Three things are
deliberately outside:

- **Comparisons and arithmetic.** They live in field kinds, which are platform code with a fixed
  vocabulary, or in design-owned JS a professional or an agent writes outside the marked regions
  and the machine calls by name. Tennis games rolling into sets is a field kind (`tennis-score`)
  or a hand-written template, and the survey's finding stands: every competitor ships one template
  per sport, and so may we.
- **External triggers and cross-graphic logic.** A data feed writes fields (`docs/DATA_API.md`);
  an operator or a timer fires events. A graphic never reacts to another graphic. Automation sits
  above the control log, not inside a template (P4).
- **A rules engine, a node graph as authoring, a script layer.** The node editor stays the viewer
  and the escape; a future rule or script layer, if one is ever earned, sits ABOVE this format and
  writes it, or supplies named functions the machine calls. It does not get a second store, and
  this plan reserves nothing for it beyond the `"recipe": "custom"` value and the frozen `data-
  condition` trigger that already exist.

---

## 9. Worked examples

Each: what the designer draws and names, what is inferred, the table in outline, the buttons. The
first three are the shipped cases restated; the rest are the reuse test, chosen from the survey's
top ten and the P2 challenge set rather than invented to fit.

### 9a. A reveal card (rung 1)

An award card: the category text, the winner's name drawn in a hidden layer named `show:Winner`,
a hidden `show:Sponsor` tag.

- Inferred: two fields; two switches from the prefix (or two clicks on two hidden layers).
- Table: recipes `switch` × 2; groups `winner` {off, on} and `sponsor` {off, on}; reported fields
  `Winner` and `Sponsor` (select off/on); paint `look winner/on when facts f2:is:on`.
- Buttons: Show Winner, Hide Winner, Show Sponsor, Hide Sponsor. Take airs the card with both off.
- Over OGraf: a controller sets `Winner` to `on` by data and the name appears. Nothing is lost.

### 9b. The Millionaire board (rung 2, the quiz recipe)

Unchanged for the designer: `Question`, `Answer A-D`, hidden `A selected`, `A correct`, `A wrong`,
`Locked in`. Undrawn moments now get the default treatment instead of silence. The table is §5b's
example. Buttons: Select answer (with the pick), Lock it in, Reveal correct - and with the
"require lock" option off, Reveal correct is legal straight from a pick. `ANSWER_BOARD_MACHINE` is
still the machine, imported from the catalog type, so the two boards cannot drift.

### 9c. The score tracker (rung 2)

`Team 1..n`, `Score 1..n` as plain figures, hidden `Flash n`, hidden `Full time`. Table: rows
`team`; fields `name/n`, `score/n` (kind `number`); paint `look flash/n when state flag/shown and
facts score-n:moved`; `look final when state result/final`. The `moved` fact replaces the module's
own "read which figure changed" code with a fact every number field exposes. Buttons unchanged.

### 9d. An election declaration board (C3 from the challenge set)

Two parties' shares as text, a `Bar 1` and `Bar 2` drawn full, a hidden `choice:Call/Too close`,
`choice:Call/Declared A`, `choice:Call/Declared B`, and `Counted 25%` ... `Counted 100%` as four
hidden layers named `choice:Counted/25` etc.

- Recipes: two `choice` groups (`counted`, `call`) plus two gauges from a `share` pair - no
  election recipe exists and none is needed.
- Buttons: 25 / 50 / 75 / 100 in a "Counted" section; Too close / Declared A / Declared B in a
  "Call" section. Declaring is a press, never a computation - the brief's trap, avoided by
  construction because the binding has nowhere to put "share > 50".
- SPX compatibility: the default path is still take and out; the checkpoints are a parallel group,
  so `next()` alone still airs and clears the board.

### 9e. An awards nominee reveal (the survey's "reveal sequence")

Five nominee rows (`Nominee 1..5` as fields), hidden `Revealed n` per row, hidden `Winner n` per
row, a hidden `Envelope`. A `nominees` recipe: rows; a `row-set` field `Revealed` (lines are keys);
a `row-pick` field `Winner`; controls Reveal next (which the surface computes as "append the next
unlisted key", the `adjust` mechanism's list twin), Reveal all, Open envelope, Crown; paint
`look revealed/n when facts revealed:listed`, `look winner/n when state main/crowned and facts
winner:picked`, `look envelope when state main/opened`. The reveal order is data, so a producer who
wants nominee 3 first types it. One state for "crowned", never one per nominee.

### 9f. A sports lineup with a captain and a substitution

Eleven `Player n` fields, a hidden `Captain n` mark per row, a hidden `Sub n` per row. No lineup
recipe: two row-pick fields dressed as micro-recipes - a `mark` recipe that is `choice` per row
(one look per row bound to `facts captain:picked`) ships in phase 3 as the row-aware twin of
`switch`. Buttons: a Captain dropdown that airs on Update (no event needed - it is data), Sub on /
Sub off per row or one press with a row payload. The graphic is nearly machineless, and the plan's
own test is that the system says so rather than inventing states.

### 9g. A ranking that re-sorts itself (the owner's "amazing", phase 5)

`Position n`, `Name n`, `Points n` per row. The `ranking` recipe adds the `arrange` paint: rows are
ordered by the `Points` fields' `rank` derivation (a field-kind derivation over the row set, the
share kind's sibling), each row's layers move to the slot the artwork drew for that position, and
the position readouts are written from the rank. Slots are measured at rest, once. `+1` per row
(the score's `adjust`) then reorders the board live. This is the first mechanism that moves layers,
and it is the reason `arrange` is a phase of its own with a spike before it.

### 9h. A breaking-news wrap (C8, composition)

A strap with `f:Headline`, a hidden `show:Live` bug, a clock layer bound as a countdown with a
hidden `Time up` plate. Recipes: `switch` plus `countdown`. Two groups, disjoint roles, one table,
one control page with a Switches section and a Clock section. This is the composition case the
current attach road cannot express, and it is why phase 3 lands the micro-recipes before any new
full recipe: composition is proven on the smallest possible pair.

### 9i. The rest of the challenge set, in one line each

C1 debate clock: two `clock` fields and a `choice:Turn/A|B|Held` group; overtime is a switch, and a
press, never a comparison. C2 auction: one `call` recipe with rows as data (`Lot`, `Bid` fields,
`Going once/twice/Sold` as looks bound to states). C4 weather cycler: the ticker's timer cycle as a
recipe plus a `switch` for the alert in its own group, so the cycle resumes where it was. C5 bingo:
a `row-set` field over seventy-five row keys with one look per row bound to `listed`; Undo last is
the surface trimming the list; New game is the two-reset rule. C6 bracket: rows plus a `row-set`
`Advanced` and a `row-pick` `Champion`, the competition pack's own argument. C7 lyric stepper: the
default path plus one branch state, unchanged from the schema; the binding adds nothing because
nothing is painted.

Six of eight need no new recipe, only switches, choices and field kinds. The two that do (auction,
cycler) are recipes of the shipped shape. That is the reuse claim, and it is checkable in §11's
paper pass before any of it is built.

---

## 10. Migration and compatibility

- **Exported files in the world** (SPX folders, CasparCG packages, OGraf packages, standalone
  controllers) are untouched. They carry their own frozen JS and their own `-qstate` classes, and
  no NoaCG surface re-reads them.
- **Saved graphics made by the five modules** keep working: their JS is in the template. They carry
  no table, so the new mapping step and the future sentence board read them as "hand-crafted
  behaviour" - the same honest read-only the anim data gives an unknown version. A one-time
  recognizer that rebuilds a table from the old stamped ids is possible and is NOT planned: the
  graphics are few, re-import is a minute, and a recognizer is a second parser to keep right.
- **The wizard's `DesignSvgBehaviour` union** is session state, never persisted. It becomes one
  `DesignSvgBinding` (recipe id, options, role map) with no migration to write.
- **Class names**: one pair from phase 1 on. Old per-recipe pairs live only in files that already
  exist.
- **Docs**: `docs/SVG_AUTHORING.md` §5b is regenerated from the recipe declarations by a script in
  phase 2 and checked in; the check that the committed page matches the declarations joins the
  build, which is what stops the next `Answer 1` line from being written.
- **The catalog quiz, poll, scoreboard and countdown types** are unchanged. Their machines are what
  the recipes import. A later phase may express their paint through the same table so that a
  catalog board and an imported board are one code path, but that is a catalog refactor with a
  baseline to defend and is not part of this plan.

---

## 11. Rollout

Each phase is one branch through the queue, verified by the gates named, with an owner-queue file
where the product changes visibly. Phases 0-2 add no capability and are current work under the NOW
push (they are its step 2, generalized, and they close four filed defects). Phase 3 onwards adds
capability under P2 and is proposed for the next weekly alignment; the paper pass in phase 2 is the
evidence that alignment reads.

**Phase 0 - the detector, alone.** One shared tokenizer (role word plus a key as its own last
token), one scorer with distinctive evidence, synonyms moved into per-recipe lists. Closes
`answer-n-is-documented-as-a-vote-row-word...`, `a-heading-layer-is-read-as-an-extra-behaviour-row`,
and the `A picked` miss from `docs/SVG_STATES_FROM_ARTWORK.md` §5. Gate: the corpus expectations
(`e2e/fixtures/svg-corpus/*.expect.json`) and `import-svg-behaviour.spec.ts` green; a new spec row
per closed defect.

**Phase 1 - the format and the runtime, with the quiz as the first recipe.** `NOACG_BEHAVIOUR` v1
parse/serialize/validate (`src/blocks/behaviourData.ts`, mirroring `animData.ts`); the role stamp in
the bind pass; `behaviourRuntime.ts` with looks, `row-pick`, the repaint call, and the pairing gate;
the `quiz` declaration; `behaviour.ts` as the compiler; the validator rules (a stamped role no rule
names, a rule naming a state the machine lacks, a fact the kind does not expose, a state-bound look
with no mirrored field as a warning). Gate: every existing quiz spec green unchanged, including the
standalone export and the CasparCG panel walk; `validateTemplate` blocks a table under an old
runtime; a `noacg inspect` of the template shows the same buttons as before.

**Phase 2 - port the other three, delete the modules.** `score` (adds `number:moved`), `countdown`
(adds `clock` phases and the gauge), `vote` (adds `share`, readouts, and the five wire fields as
recipe-owned fields with their stable titles - `pollFieldMap` reads titles, so the join is
untouched). Delete `quizBehaviour.ts`, `scoreBehaviour.ts`, `pollBehaviour.ts`,
`timerBehaviour.ts`; `drawnState.ts` folds into the runtime. Generate §5b from the declarations and
add the drift check to the build. Then the **paper pass**: the eight briefs walked against the
vocabulary on paper, recorded in this document, before phase 3 is proposed. Gate: the four
behaviours' specs green; `catalog:affected` clean (nothing in the catalog moves); the rehearsal spec
green; one owner-queue file - "the same four behaviours, one table, open Advanced mode and read it".

**Phase 3 - switches and choices, and composition.** The two micro-recipes; the mapping step's
unclaimed-hidden-layers list with its two one-click answers; `show:` and `choice:` names; the
composition rule; the reported field per switch and choice; the row-aware `mark` twin. Gate: a new
spec on a reveal card (9a), one on a quiz with a sponsor switch beside it (composition), one on the
hosted road; the OGraf round-trip spec asserts a switch survives as a schema field. Owner-queue file:
"hide a layer, name it show:, press the button".

**Phase 4 - the default treatment.** The four defaults, generated at build time from the measured
panels; the Finish step's Behaviour row with the drawn-versus-default count; the wizard preview
playing each button. Gate: the moment-ladder mockup's three rungs reproduced on the corpus quiz
boards in a spec, pixel-compared against the ratified mockup's intent; owner-queue file.

**Phase 5 - options and the next recipes.** Quiz options (require lock, reveal by itself); the
`counter` kind and a `pages` recipe (the survey's biggest gap); `fraction` and a `meter` recipe; an
`alert` recipe with the timer self-clear; the `ranking` recipe behind an `arrange` spike that
measures whether moving the designer's layers at rest is stable under the fit ladder; two full
recipes on one graphic. Each recipe is its own branch with its own spec and owner-queue file, in
survey order.

**Phase 6 - back to the wizard.** Reconstruct the mapping step's draft from the table so an
imported graphic reopens where it was made (`docs/backlog/back-to-the-wizard.md`, entry point 2).

**Phase 7 - the sentence board.** Reads and writes the same table and machine; P2's round-2 gate
applies in full and this plan does not start it.

What is deliberately not scheduled: any change to the catalog's own paint, AI proposals in the import
path, per-recipe knobs on the default look, and a recognizer for old modules' output.

---

## 12. Decisions made here, and what is his

Recorded so they can be reverted rather than adjudicated (owner, 2026-09-03 and 2026-09-05: a
design question is answered by the strongest model and reported, never escalated).

1. **The binding is a versioned table plus role stamps in the markup, outside `NOACG_ANIM`.** The
   growth table set the precedent; the machine stays where it is.
2. **One paint runtime, no emitted JS per recipe.** The test is stated in §6a; a recipe that needs
   JS is a missing field kind.
3. **Conditions are two lists of picks - states and field facts - and field kinds own every
   comparison.** This is the doctrine's "no expression language" made mechanical rather than
   promised.
4. **Two explicit prefixes and no more: `show:` and `choice:`, beside the existing `f:`.** Recipes
   keep plain taught words.
5. **Switches and choices mirror their state into a reported field**, written by the button's
   `set`, so they work over OGraf by data alone.
6. **Micro-recipes compose now; two full recipes compose in phase 5**, after one pair is proven.
7. **Old module output is not migrated.** Re-import is the road; a recognizer is refused.
8. **Vocabulary `selected` / `correct` / `wrong`** applied to the UI, as ruled 2026-09-03.

**What needs the owner (needs: alignment).** Whether phase 3 onwards enters the P2 implementation
lane on the strength of the phase 2 paper pass, or waits for the round-2 proxy protocol in
`docs/BEHAVIOUR_AUTHORING_RESEARCH.md` §6. Phases 0-2 need nothing from him.

---

## 13. What building phases 0-2 changed in the design (2026-09-05)

Three things moved between the plan above and the code, each for a reason worth keeping.

**Rule tokens name field ROLES, not `fN` ids.** §5b wrote `f6:picked`. A per-row look on a score
board needs "this row's own figure rose", which a fixed id cannot say, so the head of a token is a
field role (`score:moved`, `selectedAnswer:picked`, `clock:warning`) resolved through the table's
own `fields` map - per row for a per-row role. A bare `fN` still parses. The table reads as words
rather than as numbers, which is the readability a hand edit in Advanced mode needs anyway.

**The role words live in one JSON table, and the docs are generated from it.** §10 promised a
generated page; the mechanism is `src/templates/behaviours/words.json` (read by the recipes, the
proposal and `scripts/behaviour-docs.mjs`) plus marker blocks in `docs/SVG_AUTHORING.md` §5b that
the build refuses to let drift. The same table carries a `weak` word per role: a name that binds a
role without being evidence of the behaviour, which is how a student's `Option 1` rows fill a
quiz's answers while three bars beside them still make the file a vote.

**The runtime's field kinds are the whole of what a recipe cannot say.** Porting the countdown
needed two things §2c did not list: an OPERATION on a kind (`noacgClockReset`, which a state's
timeline may call by name, like the engine's own `pauseClock`) and a kind PARAMETER that names a
companion field (`warnAt`, `fallback`). Both are in `FieldKindSpec` as plain strings. Nothing else
in §2 changed, and no recipe emits JavaScript - the test in §6a held for all four.

**The default treatments are built by the runtime, not at assembly** (phase 4). §7d said
"generated at build time from the measured panels"; the assembler runs in a parser with no layout,
and the panel behind a row is exactly what the fit ladder measures at runtime, so the runtime
builds each default once on first need from the row's field, the panel `svgFitContainer` finds
under it, or the artwork's viewBox for a badge. Same code on every road, so the same picture.

**Phase 5 shipped the first options and two recipes, and deferred two.** The quiz's `lock` and
`autoReveal` options are arrows added or removed by a checkbox (§7e as written); the `meter`
(a gauge over the new `fraction` kind) and the `alert` (the catalog transition's timer arc) are
declarations of the shipped shape, and every rowless recipe after them is held by the wizard in
ONE generic draft rather than a new union member. `pages` waits for the bounded counter to reach
the control surfaces - a counter the runtime clamps while the operator's box runs past it is the
drift `adjust` exists to prevent - and `ranking` waits for the `arrange` spike, since moving the
designer's layers under the fit ladder is a paint mechanism that needs measuring before it needs
a recipe. Two FULL recipes on one graphic stay refused: each owns the default path.

**The paper pass** the rollout asked for before phase 3 (§9i restated against the built
vocabulary): the reveal card is two `switch` instances; the election board is two `choice`
instances plus two gauges over a `share` pair; the lineup is a `row-pick` field with per-row
looks; the breaking-news wrap is a `switch` beside the `countdown`. Each needs only §7c's two
micro-recipes and the composition rule, which is what phase 3 builds.

### The reuse test, run for real (2026-09-06, `docs/SVG_BEHAVIOUR_SHOWS.md`)

Six game-show and late-night graphics, drawn as a student would and imported through the wizard.
Five became recipes of the shipped shape (`survey`, `list`, `lineup`, `puzzle`, `reveal`); the
bracket binds with a switch and a choice and nothing else. What the six changed, and what they
found, in the order they matter:

**A counter's ceiling is the machine's, and that closes the `pages` question.** The survey's
strikes are a `counter` field whose `+1` rides `adjust` on a `strike` event, and a `strikes` group
of four states carries that event only three times - so the fourth press is greyed by the
structural guard every control surface already honours, and the operator's box can never run past
the three X's. No legality reaches the surfaces from the runtime; the runtime's clamp only decides
what a figure a controller wrote past the ceiling paints. A paged list is the same shape with
`page` for `strike`, which is what §13 above was waiting for.

**A rule may be about ONE row** (`row` beside `rows` in `LookRule`, additive). The top ten's
tenth entry stays up from its own step to the last, which is a different state list per row and
so a rule per row; the grammar gained a pick of a row, not a third slot. The recipe emits ten
rules and the whole behaviour is the default path - no event, no group, and SPX's Continue,
CasparCG's NEXT and OGraf's steps all drive it.

**A recipe may own a field per row** (`RecipeField.row`). The survey's "Answer 3 revealed" is a
select the Reveal 3 button `set`s and the row's look binds to, the switch's own wire rule applied
per row: a data-only controller reveals a row by writing `on`. It is what made a row-set kind
unnecessary for a board of at most eight answers.

**Three field kinds joined**: `counter` (facts `reached:N`, `is:N`, `at-min`, `at-max`, `zero`),
`list` (a "Label | figure" line per row: `label`, `figure`, `line` per row, `total` over the rows
whose companion field reads on, `listed`) and `puzzle` (a phrase over tiles: `letter` per tile,
`used`, `shown`, `hidden`). The `row-pick` kind gained the order facts `before` and `after`. Every
one is a small pure function from a holder's text; no recipe emits JavaScript, still.

**FINDING - a list field has no button that adds to it.** The puzzle's "Reveal R", the bracket's
"advance the winner of match 3" and a bingo caller's "call 42" all want one press to append a
value to a lines field - the "list twin of `adjust`" §9e named. `payload` rides a field as it
reads, `adjust` moves a number, `set` writes a constant; none can say "add this". The puzzle
ships on the data road (the operator adds the letter to the Revealed box and presses Update),
which is honest and a keystroke slower than the show. Not a doctrine break: a fourth member of
the payload family on the control surfaces, `add: { list: sourceField }`, resolved on the surface
like the other three so the box moves with the board. Not built here; built the same day, below.

**FINDING - a recipe carries ONE row set, and a grid has two.** The bracket (teams and matches),
the Jeopardy board (categories and values) and the Deal or No Deal case board (cases and
amounts) each repeat along two keys. §7a's `rows` is one keyed repetition by design; the bracket
therefore binds as DATA - every slot typed, the match highlight a `choice`, the crown a `switch` -
which is brief C6's own lesson rather than a defeat. What the model cannot say is the cross-row
LOOKUP ("the winner of match 1's name moves up by itself"), which is a `row-pick` deriving a
companion per-row field's text: a kind derivation, allowed by the doctrine, unbuilt because the
second row set has to exist first. Left as the plan's next design question, not bent around.

**Two import traps the walk surfaced, neither the behaviour's.** A text layer named after its own
sample text ("Champion" reading "Champion") loses its name to the parent group, because the
importer treats a name equal to the content as Illustrator's default naming (`namesItsOwnCopy`).
And decorative numerals a student types ("10.", "9.") arrive as ten fields to untick, because
nothing in the file can say "this text is not a field". Both are `docs/backlog/` material.

**The wizard holds every recipe with rows in ONE generic draft** (`SvgRecipeDraft.rows`,
`DesignSvgRecipeBehaviour.rows` and `.fields`, additive), offered from the registry rather than a
hand-kept list, so the four legacy draft shapes are the last of their kind.

### The list twin, built (2026-09-06, later the same day)

**`add` is the fourth member of the payload family, and `remove` is its honest inverse.** A
control declares `add: { <listField>: <sourceField> }`; the surface reads the source, appends it
to the list unless that exact line is already there, and the WHOLE list rides the event as
ordinary payload - so the machine applies it only when it accepts the press, the log holds the
absolute list for recovery, and every surface writes it back into its own box exactly as it does
for `adjust` (`controlModel.ts` `addedValue` / `removedValue` / `movedKeys`, the same rule
inlined in the exported panel and the production controller, `compileControls` resolving the
logical keys, the OGraf vendor block carrying both maps and the reader taking the list out of the
plain payload keys). `remove` takes the last line equal to the source back out. An empty source,
or a remove of a line the list does not hold, leaves the list off the wire, so a press can never
blank a board by mistake. The list must be a `lines` field; the source may be anything, since it
is only read. One road per field still holds: a list key rides as payload, adjusted, set, added
to or removed from, never two of those on one press.

The puzzle got a Guess box, "Reveal letter" and "Take back a letter" on a `letters` group of one
state (re-entering the entrance state would replay the entrance, so the press does not ride the
main path). The revealed letters became a line list, and the puzzle kind still reads them typed
on one line. The exported panel repaints a text box, a line list and a dropdown after a press now,
not only a number - a `set` on the survey's revealed switch had been landing in the panel's state
without lighting the segment.

**`row-set` is built, on a bingo caller** (`src/templates/behaviours/bingo.ts`,
`e2e/fixtures/svg-shows/bingo-board.svg`). The kind is §2c's line: a lines field whose lines are
row keys, `listed` / `unlisted` per row, plus `last` (the row the newest line names), the whole-list
facts `any` / `none`, and the derivations `count`, `last` and `key`. Calling a number is `add`, a
wrong call is `remove`, and the numerals the student draws are a per-row `write` role deriving the
row's own key - which is what keeps a named numeral out of the operator's fields (the second trap
below, answered for this recipe by naming and still open in general).

**The two-row-set question stays open.** The bingo grid did not answer it: twenty-five cells on a
five-by-five grid are ONE keyed repetition (the number), so one row set holds them. The bracket,
the Jeopardy board and the case board looked like two INDEPENDENT repetitions on one recipe
(teams and matches, categories and values), and nothing in the row-set work made the shape of
that declaration obvious. Recorded, not designed. **Designed the next day, and the answer was
that the premise was wrong** - see "The two-row-set question, dissolved rather than answered"
below.

**The two import traps are filed** (`docs/backlog/text-layer-named-after-its-own-copy-loses-its-name.md`,
`docs/backlog/decorative-numerals-arrive-as-fields.md`).

### The two-row-set question, dissolved rather than answered (2026-09-07)

Four independent designs for a two-row-set declaration, twelve adversarial reviews of them against
the real compiler, runtime, wizard and gates. Every design was refused on at least two of three
lenses, and the reviews converge on one conclusion: **two of the three graphics were never
two-row-set graphics, the third is not one either, and what actually blocks the bracket is a
different question entirely.** So the shape is not bent around the bracket; the question is
renamed.

**The Jeopardy board and the case board bind on the shipped one-row-set shape.** Two reviewers
wrote both boards out as ordinary recipes while looking for reasons a second row set was needed,
which is where the evidence came from. The Jeopardy board's rows are its CELLS, a keyed
repetition of the twenty or thirty clue squares exactly like the bingo grid, with a `row-set`
field for the ones already played and a `row-pick` for the one on air; the category is a
per-column heading field, not a second key. The case board's rows are its CASES, with two
`row-set` fields (opened, and the amounts gone) moved by one press carrying a two-entry `add`.
Neither needs a declaration that does not exist. What the Jeopardy board would still like is a
second row set for the CATEGORY AXIS - lighting a whole column, a button reading "Science 400" -
and that is a convenience, not the prize.

**The bracket is not a two-row-set graphic.** Its own fixture settles it: fifteen text slots named
`Team 1`..`Team 8`, `Semi 1`..`Semi 4`, `Final 1`, `Final 2`, `Champion` - a FLAT key space in
three role families, with no second coordinate drawn anywhere. A bracket's one repetition is its
matches. The "fixed sub-shape" a match holds is two sibling roles, which is what the survey's
`strike.1` / `strike.2` / `strike.3` and the quiz's `answer.selected` / `.correct` / `.wrong`
already are, so declaring slots as a concept buys nothing that dotted sibling roles do not.

**THE REAL BLOCKER: a value the runtime WRITES is not a FIELD, so a lookup cannot chain.** The
bracket's prize needs the winner of match 1 to appear in match 5 and the winner of match 5 to
appear in the final - three rounds, three hops. It dies after one, for four separate reasons, each
of them load-bearing on its own:

- `RecipeRole.kind` is exactly one of `field` or `layer`, and the compiler stamps only the layers
  (`behaviour.ts`, `markLayers`). A slot cannot be the thing an operator types AND the thing the
  runtime writes into.
- Every derivation reads a field through `noacgFieldFor` and then `document.getElementById(fN)`.
  A written value lives in `textContent` on a stamped artwork layer that kept the designer's own
  id, so the next lookup finds nothing. Round two of a three-round bracket is already empty.
- Binding one layer to both roles is refused by two shipped gates: `recipeBindingGaps` reports
  "one layer is picked for two things" across layers and fields together, and `naming.ts` keys
  `roleOf` by LAYER ID, so a layer takes exactly one role.
- And if it were forced through, the artwork would show a name that the operator's own box, a
  saved document and the OGraf return payload do not carry. That is the posture
  `docs/OGRAF_STATE_IN_FIELDS.md` exists to forbid, so the workaround is not a workaround.

There is a fifth, smaller one that would bite even a single hop: a write whose derived value is
empty is deliberately SKIPPED, so that an empty round cannot blank a board the designer filled in.
A slot the lookup filled therefore cannot be cleared by Reset - the previous tournament's winner
stays drawn.

**So the next design question is not how two row sets are declared. It is whether a DERIVED value
can BE a field** - written into a real `fN` holder, so the operator sees it, an export carries it,
a Reset clears it and the next derivation can read it. That touches
`docs/OGRAF_STATE_IN_FIELDS.md` and "data updates never cause transitions" and is worth its own
design, not a corner of this one. Named here, not answered.

**What a second row set would cost, for whoever wants the category axis.** Below the declaration
it is nearly free: the stored table's `rows` is ALREADY a map keyed by row role, the shape gate
already loops over every entry, and the runtime resolves a set by NAME (`noacgRowsOf`) with row
keys as opaque strings. The cost is all above it - `BehaviourRecipe.rows`, `RecipeContext.rows`,
one line of the compiler (`table.rows = { [ns(recipe.rows.role)]: rows }`), the wizard draft, and
NAMING. Naming is the hard half: `rowTokenOf` reads a key only when EXACTLY ONE token in the layer
name is a letter or a whole number, so `Category 2 Value 400` binds to nothing and every cell of a
crossing is a picker the student fills by hand. A four-by-five board is twenty pickers per crossing
role. Nothing in the three graphics needs it yet, so building it now would be building for a use
nobody has.

**Two smaller findings, both worth having before the next recipe.** The mapping step renders the
row-count select as every integer between the declaration's `min` and `max`, so a recipe whose
legal counts are 3, 7 and 15 (a single-elimination tree) cannot say so. And a `WriteRule` carries
only `write`, `rows` and `from` - there is no `when` - so a readout cannot be conditional, and a
board that wants one clue panel to print whichever cell is live needs a rule per cell.
