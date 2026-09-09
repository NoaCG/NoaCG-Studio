---
v: 2
source: owner
kind: ask
raised: 2026-09-03
state: advanced
note: "the design pass (item 1) is docs/SVG_BEHAVIOUR_PLAN.md, 2026-09-05 - one binding format, recipes as declarations, switch/choice as the recipe-free floor; item 2 (publish the layer contract) becomes a page generated from the declarations in its phase 2"
asked: "what I would actually want is for us to put fable or just think and figure out a solution on how we can make the graphic work as we want without needing to use a ready-made template"
---
# Make any graphic behave, without a ready-made template for it

**Filed:** 2026-09-03. **Source:** owner walk of the SVG import corpus.

## Why

The import road works: a designer's own SVG comes in, text layers become editable fields, and the
graphic reaches the export gate. The owner confirmed that half in the same walk - *"if it has a
text field, then you can edit it, and that part seems to work quite well."* What he does not
believe is that the next step scales.

> what I would actually want is for us to have more special types of graphics, not just a quiz
> board that we can import with graphics that have special requirements, such as the "Who Wants to
> Be a Millionaire" type of animations when you select and lock an option in a quiz - it currently
> entails a lot of manual work.

> We need to determine what type of graphics are necessary and how they would function. Each
> individual graphic requires its own custom method for importing.

And then the argument that makes this a design problem rather than a drawing problem:

> For example, we could have templates like: this is a poll with five different animation steps,
> and this is a graphic with three different animation steps and two optional ones. You understand
> what I mean. It becomes impossible to create custom templates that you can choose from because
> the variation of what you might need is unlimited.

**He is right, and it is a counting argument.** Behaviours multiply with the number of states, the
number of optional steps and the artwork they are attached to. A shelf of ready-made behaviour
templates covers a fixed number of cells in a space that has no bound, so every show that does not
land on a cell falls back to manual work - which is exactly the Millionaire lock-and-reveal case he
names. `more-behaviours-than-poll-and-quiz.md` asks for more cells. This row asks whether cells are
the right shape at all.

> what I would actually want is for us to put fable or just think and figure out a solution on how
> we can make the graphic work as we want without needing to use a ready-made template.

## The constraints he set, which bound any answer

- **No AI in the import path.** *"The SVG import is crucial; we need to avoid using AI for this
  process. Instead, we can simply import an SVG and work with it using the different layers and
  such."* The layers the designer drew are the interface. This matches the pillar that generated
  code is deterministic and readable, and it means detection reads structure, never intent.
- **There has to be an authoring side.** *"we need to establish a system for creating these SVGs
  and enabling them to animate as desired."* Today `proposeSvgBehaviour` reads conventions like the
  poll's `Bar 1` and the quiz's `Answer A`, and those conventions are written down nowhere a
  designer can read - the same gap `run-a-real-audience-vote.md` names. A designer cannot draw for
  a contract that is not published.
- **The fall release is not this.** *"we need to have the quiz and the scoreboard for this fall at
  least."* Those two stay the NOW push commitment (`docs/GOALS.md`, `## NOW`) and are not blocked on
  anything in this row.

## What it would take

1. **A design pass, at the top of the model** - the piece he asked to hand to Fable. The question:
   what does an author describe, and in what vocabulary, so that a graphic nobody anticipated gets
   the behaviour its show needs? The existing model already answers a lot of it - states,
   transitions fired by operator events, structural guarding, no expression language
   (`docs/STATE_MACHINE_SCHEMA.md`) - so the real question is what sits between a drawn SVG and
   that machine, and whether it is composition (small behaviour parts a graphic assembles) rather
   than selection from a list.
2. **Publish the layer contract** the importer already reads, as a document a designer draws
   against, and make the importer's proposals explainable in those terms.
3. **Write down the special cases before generalising.** The Millionaire lock/select/reveal is the
   worked example he named; a handful more, described as what the operator does and what the
   graphic shows, is the test set any general answer has to satisfy.
4. **Keep improving the import in parallel.** *"We still need to refine it, remove the bugs, and
   ensure that the text is actually in the correct spot and reacts correctly to the background."*
   That work is already scoped in `docs/TEXT_BOX_BINDING.md` and is not waiting on this row.

## Evidence

Owner walk 2026-09-03, verbatim above; he asked for it to be taken up in nightly and daily waves
rather than answered on the spot.

Related and deliberately not merged into this file: `more-behaviours-than-poll-and-quiz.md` (add
the next behaviours, scoreboard first), `graphics-need-their-own-logic.md` (a ranking reorders
itself - the same instinct from the results board), `svg-deep-layer-addressability.md`.
The behaviour registry is `src/templates/importedDesign/behaviour.ts`; the layer-name detection is
`proposeSvgBehaviour` in `src/components/wizard/draft.ts`; the model is
`docs/STATE_MACHINE_SCHEMA.md` and `docs/CONTROL_LAYER.md`.
