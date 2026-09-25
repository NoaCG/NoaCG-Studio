# src/templates/types - the graphic TYPE registry

## types/ - the GRAPHIC TYPE registry (docs/GRAPHIC_TYPES.md)

A **type** declares what a graphic IS - structure contract, fields, state groups and default
path, control events - independent of what it looks like; a **design** is one look. A type is a
DECLARATION, not a second way to build a template: `variantsFromType` compiles one into
ordinary TemplateVariants that go through the category assemblers below, so
`variant.create(options)` stays the single contract the wizard, the AI, the sweeps and every
spec speak. `catalog.ts` merges them with `mergeCatalog`, REPLACING BY ID, so a type that
promotes an existing variant keeps that variant's id and its slot in the browse grid.

**THE RULE:** *persist a machine only when the derived one is wrong.* `deriveMachine` already
gives every template a correct one-group linear machine, so a type with no branches, parallel
groups or event overrides compiles to NO `machine` key and emits byte-identical output. Nine
of the twenty types are in that class - including two of the five AUDIENCE types
(`viewer-question`, `community-request`), which is the rule showing its work at the point where
modelling for its own sake would be most tempting: they are different GRAPHICS from each other
(different fields, different meaning, different control page) with genuinely the same two beats
on air. `e2e/audience-pack.spec.ts` pins exactly which two, so a later edit that quietly adds a
machine has to say why.

`TypeMachine.main.edges` is for arrows that belong to the GRAPHIC rather than to any one branch
state - the chat highlight's self-dismiss timer from the entrance to the exit. Declaring them
there keeps a branch's `edges` meaning "the ways in and out of THIS state".

**IF AN OPERATOR HAS TO SEE IT, IT IS A FIELD - the machine holds what the operator DOES, not what
they read.** A field is in the SPX definition, in the OGraf manifest's `schema`, and in every
generated form anywhere; machine state crosses no boundary this product has, because OGraf v1 has
no return channel and `ReturnPayload.result` is undeclared on every GraphicInstance action response
(`ebu/ograf` issue 82). So a fact an operator reads is modelled as data the CONTROLLER owns and the
graphic obeys - a hidden input-only field the runtime writes into the artwork AND reads back - never
as machine state a controller would have to ask about. The consequence that bites hardest:
**a behaviour meant to survive export owns no fact its controller cannot observe**, so no `timer`
edge may change operator-visible state; that timer belongs to the controller. Binding, with the
reasoning and the honest limits (legality cannot be expressed at all): **`docs/OGRAF_STATE_IN_FIELDS.md`**.

**A type declares ONE field list, which is a real limit worth knowing before reaching for one.**
A family whose field COUNT varies across its designs cannot be a single type: the factory's
fields gate compares each design's emitted count against the declaration, and rightly. Three
families in the catalog are in that class and stay hand-written variants - camera frames (2-4
fields), the sponsor strips (4 vs 6 slots) and the location cards (one has a picture slot). That
is a legitimate state, not debt to pay off in a hurry: `card04`, `vs01` and `ig01`-`ig07` have
always lived there. Optional type fields would fix it and are a change to this contract, not to
a design (docs/PACK_TAXONOMY.md, "Known limitations").

Fields are declared with LOGICAL keys and a `role` (`line` first, `logo` last - both enforced
with a throw, because the order is what keeps the compiled `fN` ids in step with the assembler
that emits them). The main group's default path is DERIVED, never declared: its length must
equal the step count, which depends on the preset and the line count. `attachMachine` puts the
compiled machine on after assembly and THROWS if it is off-shape - unlike `convertToDataRegion`
it is compiling our own declaration, so degrading would ship a control page whose buttons do
nothing. One clamp sits BEFORE that gate: a caller passing FEWER lines than the type declares
(an AI/Lite spec asking for a one-line lower third) gets the missing lines filled in - the
declared field still exists and stays editable, and the missing-parts throw stays reserved for a
design that genuinely fails to emit a declared part (found by the Lite benchmark's one-line
challenge brief). **WITH WHAT is decided by the FIELD PLAN, and the two answers are opposites:**
a `lines` plan pads with EMPTY text (an empty value collapses via the `:empty` mask rule - a
shorter lower third), a `fixed` plan keeps the design's OWN default, because a quiz board with
two of its four answers blanked is not a smaller quiz, it is a broken one.

**A type's line CAPACITY is derived, never below its own count of `line` fields, and the
caller's lines are written into those fields after assembly** (`variantsFromType`,
`withLineValues`). Both halves were load-bearing, measured 2026-08-09: nine types - the three
answer boards and every sports board - declared 3 to 6 line fields against a hand-authored
`capabilities.maxLines` of 1, so `specToTemplate`'s `slice(0, variant.maxLines)` threw the rest
away before `create()` saw them; and those same fixed-contract assemblers build their fields
from a baked content declaration rather than from `o.lines`, so they carried NONE of what a
caller asked for. A generated quiz came back as the catalog's own planets question with four
planets for answers. The post-pass writes value and static text together (`setFieldDefault`), so
the control page and the pre-play frame cannot disagree; TITLES stay the type's, because a fixed
contract's labels are what its own row dropdowns are declared against. Pinned by
`e2e/lite-line-content.spec.ts`, registry-wide and mutation-tested.

**`WizardOptions.content` is the channel for everything a LINE cannot carry** - which answer a
quiz marks correct, how long a countdown runs, a live poll's options: all `role: 'data'` or
`'hidden'`, none of them reachable through `lines`. It is keyed by the type's own LOGICAL keys
(`{ correctAnswer: 'C' }`), never by `fN`, and only a type-compiled variant honours it, because
only a type declares those keys and the kind to clamp each value against; a hand-written variant
ignores it rather than guessing what its ids mean. **Every value is clamped to what the field
declares and an illegal one is DROPPED** - a `select` takes only an option it offers, so a
correct-answer field can never name a row that does not exist (which would reveal nothing, with
no error anywhere). `DesignSpec.content` is the same data as a LIST of pairs, because a JSON
Schema with `additionalProperties: false` cannot describe an open key set; `specToTemplate` folds
it into the map.

**The trap to know:** a timer never arms on a timeline that never ends (the arming call is
scheduled at the timeline's end). A `repeat: -1` loop or a measured `dynamics` builder makes
that unreachable, so `validateMachine` errors on it. This is why the ticker type is a rotator
with its own `ticker-rotate` preset rather than the endless marquee - and, from the other side,
why the TRANSITION type's self-clear is legal: its cover is a short finite entrance.

`TypeMachine.main.edges` is the one arrow shape branches cannot express - an arrow BETWEEN two
waypoints of the default path, since a branch's edges always have the branch at one end. The
transition type is its only user (`{ waypoint: 0 } → { waypoint: -1 }`, trigger `timer`);
modelling that as a branch would have meant inventing an off-path "cleared" state duplicating
the exit, i.e. a second way to be off air.

## types/neutralDesign.ts - the NEUTRAL scaffold (a type without a look)

`neutralDesignFor(type)` returns a `TypeDesign` that carries the type's SEMANTICS - its fields,
its machine and interpreter, the runtime the machine calls (the match clock), every required
part - on a deliberately plain spine: one box, system-neutral type, the brand accent as the only
colour. It is what an agent or a user gets when they want the type's behaviour and intend to
design the look themselves (docs/AGENT_CLI.md; `scaffold --design neutral`). It is NOT a catalog
design and never appears in Browse.

- Built through the REAL category assemblers (`defineVariant`, `defineCardVariant`,
  `defineBugVariant`, `defineScoreboardVariant`), so the structure spine, the `:root` contract,
  the ANIMATION region and the four platform passes in `variantFromType` apply unchanged - the
  neutral scaffold validates and benches like any catalog template.
- `hasNeutralDesign(type)` is HONEST about coverage: a standard-category type qualifies only if
  its machine calls no runtime function; a scoreboard type qualifies only if every call is the
  match-clock/status runtime the scoreboard assembler supplies (`SCOREBOARD_RUNTIME_CALL`). A
  type outside that (live-bug, sponsor-rotator, podium-score with its spotlight runtime) reports
  `neutral: false` and the bridge offers its catalog designs instead - never a scaffold whose
  machine would call functions that do not exist.
- `neutralSpineFor(fields)` is the TYPELESS scaffold: an ad-hoc field list (label + kind)
  becomes a `blank`-type template with the implicit lifecycle machine - one `id="fN"` element
  per field, text kinds as lines, the rest as extra fields. The control layer renders it with
  every field + Take/Update/Next/Out, which is the category-agnostic promise pinned by
  `e2e/ograf-contract.spec.ts`.
