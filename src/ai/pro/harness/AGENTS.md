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

## Knowledge (`knowledge.ts`, `typeSemantics.ts`)

**EXPERIMENT.** Fourteen universal cards, written as inspection (what earns a pass), loaded by
trigger with a six-card core; type semantics read live from the registry and `AI_CATEGORIES`.
**Numbers that are legibility rules stay in `src/model/designRules.ts`** and reach the model
through `designRulesPromptBlock`; a card never copies one. A card's taste numbers are
`docs/DESIGN_LANGUAGE.md`'s ratified ranges - change both or neither. `typeSemantics.ts` imports
the registry and is kept OUT of the pure test path; the `TypeSemantics` interface lives in
`workbench.ts` for that reason.

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
