# The contract has no worked pattern for four common graphic behaviours

**Filed:** 2026-10-02. **Source:** measurement, the session logs of the four-brief walk
(`docs/research/plugin-graphics-quality-2026-10-02/README.md`, failure 5). Spec:
`docs/work-specs/plugin-design-quality/spec.md` AC-7.

## Why

Each behaviour-bearing brief needed a shape the contract does not show, and each agent read the
~1100-line interpreter or guessed. Guesses that validate are still guesses an operator meets live.

- An optional line that collapses when empty (news lower third: location). The agent invented a
  class toggle in `update()` and was unsure a prefixed class on the mask is allowed.
- A second state group beside the main lifecycle (quiz timer). §5's worked machine has one group;
  the agent learned from the interpreter that `play()` resets other groups' pointers but not their
  inline styles, that an initial state never plays its timeline, and that snap fires the target's
  calls.
- A graphic ending its own timed state (hockey power play ends at 0:00). Timer arrows are fixed
  delays; the agent dispatched its own operator event and did not know if that is allowed.
- An action that stays enabled in every state (Goal). The agent copied a one-state self-loop
  group from the scoreboard type.

## What it would take

One short worked pattern each in `cli/skill/noacg-graphic/references/contract.md` §5, each backed
by a fixture package that validates clean and a test that pins it. Check each against the rule
store first (`npm run rules -- src/templates/`): parallel groups are sanctioned
(`root/keep-graphic-data-fields-plus-more`) and data never causes a transition
(`root/never-let-data-update-cause-transition`), which is why the optional line is a repaint and
not a state.

## Evidence

Session logs summarised per brief in the research README; frames `brief-1-news/cli/no-location.png`,
`brief-4-quiz/03-timer-running-program.png`, `brief-2-hockey/03-goal-a-then-pp-b-program.png`.
