# src/templates/behaviours - the behaviour RECIPES

Loaded alongside the root `AGENTS.md` and `src/templates/AGENTS.md`. Add a RULE here; leave the
reasoning in the code's own comments and the design in **`docs/SVG_BEHAVIOUR_PLAN.md`**.

A recipe is a DECLARATION of one behaviour an imported graphic can carry (`recipe.ts`): its roles
(what a layer IS to it), its one keyed row set, the hidden fields it owns, the `TypeMachine` and
`TypeControlEvent[]` a catalog type would declare, and its PAINT RULES - when a look shows, what a
gauge scales by, what a readout prints. `importedDesign/behaviour.ts` compiles every recipe the
same way; `registry.ts` is the list.

- **A recipe emits NO JavaScript.** A behaviour that needs a line is a missing FIELD KIND in
  `importedDesign/behaviourRuntime.ts`, where every comparison lives, once, for every recipe.
- **A rule is picks only**: any of some `group/state`, and all of some `role:fact` a field's kind
  exposes (`selectedAnswer:picked`, `score:moved`, `clock:warning`). No expression, ever.
- **Role words live in `words.json`**, read by the recipes (`rolesOf`), the proposal (`naming.ts`)
  and `scripts/behaviour-docs.mjs`, which generates `docs/SVG_AUTHORING.md` §5b and fails the
  build when the page and the words disagree. A new full recipe adds an entry there AND a marker
  block on that page, then `npm run write:behaviour-docs`.
- **Distinctive evidence is what proposes a recipe**: mark the role only THIS behaviour has (a
  bar, a numeric team figure, a drawn quiz moment); `weak` binds a role without being evidence.
  Declare roles general to specific - a name matching two takes the LAST.
- **Reuse a catalog machine, filtered, through `withRepaint`** - never restate its arcs - and
  keep only the engine's own calls (`pauseClock`) beside the repaint; every recipe state repaints.
- **Options are arrows** a checkbox adds or removes, authored in `machine(ctx)`; more than four on
  one recipe is the signal for the sentence board, not a fifth.
- **An instanced recipe** (`switch`, `choice`) namespaces roles and field keys with `ctx.ns` and
  group ids and EVENTS with `ctx.nsId` (a bare identifier - the machine's shape gate refuses a
  dot). One FULL recipe per graphic; instanced ones compose freely (`composeParts`).
- **If an operator has to SEE it, it is a field** (docs/OGRAF_STATE_IN_FIELDS.md): a switch's or a
  choice's look binds to the reported `select` its button `set`s, never to the group.
- **A recipe may own a field PER ROW** (`RecipeField.row`: the survey's "Answer 3 revealed"), and a
  rule may be about ONE row (`row` beside `rows`: the top ten's entry that stays up from its own
  step on). **A counter's ceiling is the machine's**: a group of states greys the button; the
  runtime's `counter` kind only clamps what is painted.
- **The row role must be a real role** (`rows.role` names a declared role id), or the proposal
  finds no rows and the wizard shows none.

E2E: `e2e/import-svg-behaviour.spec.ts` (every recipe, the composition, the defaults, the options)
and `e2e/student-rehearsal.spec.ts`.
