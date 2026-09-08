# src/ai/pro/harness - the Pro Harness loop

Loaded alongside the root `AGENTS.md`, `src/ai/AGENTS.md` and `src/ai/pro/AGENTS.md` when working
in this directory (Claude reads it via this directory's `CLAUDE.md` import; Codex reads it
directly). Keep it accurate. **Every `##` section states its STATUS in its first line.**

Design and record: `docs/PRO_HARNESS_PLAN.md`. Add a RULE here; leave the reasoning in the code's
own comments and the plan.

## The loop (`agent.ts`, `tools.ts`)

**EXPERIMENT - bench-only; no product path reaches it.** A `ToolLoopAgent` (the AI SDK, `ai@7`)
over seven tools and a `Workbench`: understand -> `startGraphic` -> `applyDesign` (which renders,
validates, benches and measures without being asked) -> repair -> `finishGraphic` or
`stopGraphic`. Rules that bind:

- **The measurement decides, never the model.** `finishGraphic` is offered only when the last
  inspection has no blocking finding; `toolsForPhase` gates every step's tools and `prepareStep`
  applies it. A prompt line asking the model to behave is not a substitute for a gate.
- **A repair round needs NEW EVIDENCE** (`findings.ts` `verdictFor`): a round that fixed nothing
  and introduced nothing is `stalled` and the loop stops; a nearly clean round answered by a
  worse one is `regressed` and the best round ships. Do not add a "look again" pass. The owner
  measured it as useless (2026-09-05) and the recreate archives measured the flat-score stop as
  unsafe (docs/NOACG_PRO_PLAN.md §26.3).
- **Every bound is a `stopWhen` condition or a phase rule, never prose**: rounds, steps, money,
  critiques. Defaults in `DEFAULT_BUDGET`.
- **Escalation is once, on a stall, and recorded** (`modelByStep`). A stronger model is never
  the first call.
- **An exception ends the run as a refusal carrying the best round.** Paid rounds are never
  thrown away.

## Findings (`findings.ts`)

**EXPERIMENT.** One shape for every instrument. Identity is `source:code:frame:locus`, never the
message, so a defect re-measured a pixel apart stays one defect and the diff can say what a
repair fixed, left and introduced. Blocking findings are listed first and capped; advisories are
shown with a judgement note and never counted.

## The patch (`patch.ts`)

**EXPERIMENT.** The model writes three regions - design css (replaced whole under
`DESIGN_CSS_MARKER`), the box's inner html, the ANIMATION region in the authoring grammar - and
`applyGraphicPatch` refuses everything else with a sentence per breach. Pure string work with the
prefix passed in, so it runs in Node; the DOM-bearing checks are the workbench's inspection. A
type whose machine lives in the region has a platform-owned region (the bench workbench refuses
`animation` there).

## The animation region (`blocks/animationRegion.ts` `animationBreach`)

**EXPERIMENT.** The region is the model's to write wherever the type's machine does not live in it,
and it is the one region whose acceptance test is a SHAPE READER rather than a renderer:
`blocks/timelineModel.ts` `parseTimeline` looks for seven literal things in the text and gives up
on the first it cannot find. Two rules follow, both bought with real money on 2026-09-06.

- **A refused region names the precondition it missed, never the grammar.** `animationBreach`
  walks the importer's checks in the importer's own order and returns the first unmet one, quoting
  the form required. Restating the grammar is what the finding did before, and it cost a correct
  timeline four rounds and $0.072 - the model had written the grammar it was being told to write,
  and the two missing `var` lines were never mentioned. This is `docs/PRO_HARNESS_PLAN.md` §6's
  rule (a blocking finding carries its reading and one fix hint) applied to the one finding that
  did not obey it, and `docs/AI_ATTEMPTS.md` already carried the standing instruction: state a
  machine-checked precondition as a requirement rather than showing it in an example.
- **It lives in `blocks/`, beside the importer it explains, because TWO doors ask it.** The Pro
  Harness's `animation-unconvertible` finding is one; `bridgeApi.normalize` - what a coding agent
  driving the `noacg` CLI hits - is the other, and it was still handing back the generic sentence
  this lane had just stopped using. A refusal that reads differently through two doors is two
  answers to one question.
- **`animationBreach` is PINNED to the importer, not to a copy of its rules**
  (`scripts/pro-harness.test.mjs`): over a table of regions it returns `null` exactly when the
  region converts - and the predicate is the one `importAnimData` applies, not `parseTimeline`
  alone, because a region can parse and still be refused. Widen the importer and the pin fails
  until the sentence follows.

**When the harness measures a defect in a SHARED module, fix it there.** The same round found the
importer reading single-quoted selectors only, and inventing `'?'` for a target it could not read -
a converter failing open, handing back a graphic that threw on air, through the door the agent CLI
drives too. That is a platform bug the harness merely happened to be holding; `catalog:affected`
and `check-catalog-emit` are what say whether the fix moved the catalog with it (the first attempt
moved four corner bugs and was wrong).

## Knowledge (`knowledge.ts`, `typeSemantics.ts`, `exemplars.ts`)

**EXPERIMENT.** Fourteen universal cards, written as inspection (what earns a pass), loaded by
trigger with a six-card core; type semantics read live from the registry and `AI_CATEGORIES`.
**Numbers that are legibility rules stay in `src/model/designRules.ts`** and reach the model
through `designRulesPromptBlock`; a card never copies one. A card's taste numbers are
`docs/DESIGN_LANGUAGE.md`'s ratified ranges - change both or neither. `typeSemantics.ts` imports
the registry and is kept OUT of the pure test path; the `TypeSemantics` interface lives in
`workbench.ts` for that reason.

**`exemplars.ts` is the THIRD kind of number, and it is an OBSERVATION, never a rule.** What the
shipped designs of one kind of graphic set - type sizes by the part they name, paddings, gaps,
radii, tracking, line-height - as min/median/max with the sample count on every line, so it reads
as a distribution and not as a target. Three rules bind it:

- **Never a design's code, selector, id or name.** A model handed a stylesheet copies the
  composition, and a named design reads as a thing to reproduce (the anti-anchoring rule,
  `src/ai/AGENTS.md`). Numbers and the role WORD are the whole payload.
- **The constant is DERIVED, never edited.** `scripts/pro-harness-exemplars.test.mjs` (in
  `npm run build`) re-derives it from the live catalog through the module's own exported
  derivation and fails on any drift, writing the regenerated block out to paste. A number moved
  by hand is a number the next catalog change will contradict.
- **It stays PURE and imports nothing** - the corpus reaches it as a checked-in constant, so
  `typeSemantics.ts` is still the only module here that touches the catalog or the registry.

## The critique (`critique.ts`)

**EXPERIMENT.** `docs/VISUAL_TASTE_REVIEW.md`'s nine questions as an `Output.object` schema,
each answer with evidence. Advisory only, after a clean deterministic gate, once per generation
(`critiqueBudget`). A question may block only after a calibration like
`benchmarks/design-rules/CRITIC-CALIBRATION-2026-08-19.md` clears it.

## Dual-tree imports

**EXPERIMENT.** Relative imports in this directory carry `.js` suffixes (the `src/model/types.ts`
convention) because `scripts/pro-harness.test.mjs` and the bench compile the harness with
`buildApiRuntime` and run it in Node. Keep `typeSemantics.ts` the only module that imports the
catalog or the registry.

## Verifying

**EXPERIMENT.** `npm run test:pro-harness` (in `npm run build`) is the zero-token control of the
loop. `npm run queue -- "node scripts/pro-harness-spike.mjs --control"` is the zero-token control
of the browser workbench and runs after any workbench change, before anything is spent. A paid
round needs the owner's OK with a cap stated in the same message.
