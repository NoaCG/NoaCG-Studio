# src/templates/pack4 - the TITLE / TOPIC / INFORMATION pack

## pack4/ - the TITLE / TOPIC / INFORMATION pack

36 designs over nine graphic types - openers (title-card), topic and chapter cards (topic-card),
and the seven types `types/briefings.ts` + `types/lists.ts` add: now/next, headline + body,
process/checklist, public notice, statement (long text + a second language), key facts, and
recap/actions. NOTHING here is a new mechanism: the word-shaped ones build on the info-card
assembler, the two LIST boards build on the infographic one (their content is a textarea the
runtime renders and their motion is measured), and both go through the ordinary graphic-type
registry.

- **pack4/skin.ts** - the pack's shared style vocabulary: four `Pack4Skin` records (clean =
  minimal, frost = glass, volt = sport, house = noacg) plus the emitters every design composes -
  `panelCss` (the family's panel treatment), `accentCss` (its leading motif: hairline rule /
  short stroke / top rail / glowing amber bar), `labelCss`, `dividerCss`, `measureCss` (a
  design's own text measure, overriding the category cap - running text wants a narrower one
  than a headline), `textLegibilityCss` (the panel-less family's halo over live video) and
  `readableTextCss`. `decl(prop, value, comment)` is the aligned declaration formatter every
  emitter uses - the first draft hand-padded and silently ate the semicolon of every long value.
- **pack4/content.ts** - the pack's WORDS: each type's `TypeField[]` and every design's sample
  text, declared ONCE. The variant reads it through `typeLines(FIELDS, SAMPLES)` and the type
  declares the same `SAMPLES`, so the two sides the factory's samples gate compares cannot
  drift. title-card's and topic-card's field arrays moved here for the same reason.
- **pack4/markup.ts** - `maskLine` (index-safe, so a design handed fewer lines than it draws for
  emits fewer), `emptyLineCss`, and `maskScoped`. TWO RULES the whole pack follows: every
  vertical margin sits on the line's SPAN (never its mask) and every span carries `:empty {
  display: none }`, so a field the operator clears takes NO space - that is what makes "half the
  fields filled" a supported state and, in the process card, what keeps the CSS step counters
  contiguous (a display:none box is skipped by counters). `maskScoped` exists because the
  category already styles `.{prefix}-mask > span` including `text-wrap: balance`; a design that
  wants a paragraph's wrapping has to say so at the same specificity.
- **infoCards/pack4/*.ts** - one builder per type (titles, topics, nowNext, headline, process,
  notice, statement); **infographics/pack4/** - `boards.ts` (facts + recap) and `listRuntimes.ts`
  (their `rebuildInfographic()`, the dataRuntimes.ts pattern). Unlike the schedule board, a line
  with NO pipe still renders here: a fact with no term and an action with no owner are real
  content, not malformed rows.

Two things in the pack are worth knowing before touching it:

- **process-steps is the catalog's first STEPPED-by-default type** (`TemplateVariant.defaultSteps`
  / `TypeCapabilities.defaultSteps`, honoured in `resolveOptions`). The wizard draft's steps flag
  is tri-state now (`null` = the design decides) - a hard `false` there had been overriding every
  design that knows better. `scripts/factory.mjs` gates steps drift alongside motion and position.
- **notice-card is the pack's one state machine**: a PARALLEL `level` group (standard / urgent)
  with `escalate` / `standDown` operator events fading a `.info-card-alert` wash. Parallel, not a
  branch on the main path, because escalating must not disturb where the operator's walk has got
  to - and because a group entered by transition or by snap restores with the rest after a
  control-page refresh.

**The second trap:** a state's entry timeline applies each track's FIRST keyframe as a hard
`set` at time 0 (animRuntime `buildStepTimeline`), so a state can only CROSS-FADE when every
route into it leaves the layers at the same starting pose. `alertLevelType` has four levels and
three possible predecessors each, so its level change is a CUT plus an acknowledgement dip;
`publicNoticeType` has two languages, exactly one predecessor per state, and a graph authored to
keep it that way - so it fades honestly. Full reasoning in docs/PUBLIC_SERVICE_PACK.md §4.

**The third trap:** a PARALLEL group resting at its initial state replays nothing (that is what
"initial" means), so the resting pose must be established in CSS *and* in the entrance step or a
replay keeps whatever was last on air. `alertLevelRestRefine` / `piLanguageRestRefine` are that,
and a new parallel-group type needs its own - nothing mechanical will remind you.
