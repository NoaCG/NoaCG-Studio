// THE QUIZ, as a recipe: select, lock, reveal on artwork somebody else drew.
//
// This was the 2026-08-22 pilot module (docs/GRAPHIC_BEHAVIOUR_PLAN.md §10), and it is the first
// behaviour to become a declaration rather than a program (docs/SVG_BEHAVIOUR_PLAN.md phase 1).
// Nothing about what it does on air changed: the machine is still the catalog answer board's,
// filtered from the shipped declaration so the two boards cannot drift; the two dropdowns are
// still the answer key and the pick; the buttons are still Select answer, Lock it in, Reveal
// correct. What moved is the PAINT - the designer's hidden layers shown by the runtime - from a
// hand-written `qShow` script into four rules the runtime reads:
//
//   the pick     shows while the machine is in `selected` or `locked`, on the row the pick names;
//   the verdict  shows in `reveal`: the correct drawing on the row the answer key names, the wrong
//                one on every other row the key could have named;
//   the lock     shows in `locked` and in `sealed` (the hidden-pick flow).
//
// The pick is DATA (one `selected` state plus a row-pick field), which is why a board can have
// any number of rows without gaining a state - the model's central rule, unchanged.

import { ANSWER_BOARD_CONTROLS, ANSWER_BOARD_MACHINE } from '../types/answerBoard';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';
import type { TypeMachine } from '../types/graphicType';

/** The answer board's arc WITHOUT the audience branch: this binding has no drawn moment for
 *  percentages painted as chips. Filtered from the shipped declaration rather than restated. */
const QUIZ_MACHINE: TypeMachine = withRepaint({
  main: {
    ...ANSWER_BOARD_MACHINE.main,
    branches: (ANSWER_BOARD_MACHINE.main?.branches ?? []).filter((b) => b.id !== 'audience'),
  },
});

const letterOptions = (ctx: RecipeContext) => ctx.rows.map((letter) => ({ label: letter, value: letter }));

export const quizRecipe: BehaviourRecipe = {
  id: 'quiz',
  name: 'Quiz',
  description: 'Select an answer, lock it in, reveal the correct one.',
  category: 'quiz',
  defaultZone: 'mid-center',
  rows: rowsOf('quiz'),
  roles: rolesOf('quiz'),
  // The two dropdowns: the answer KEY (set by the producer before air, read by the reveal) and
  // the contestant's PICK. Both are row picks over the letters - the broadcast field policy's
  // dropdown exception, because four letters is a genuinely constrained choice.
  fields: (ctx) => [
    {
      key: 'correctAnswer',
      label: 'Correct answer',
      kind: 'select',
      value: ctx.rows[0] ?? 'A',
      options: letterOptions(ctx),
      spec: { kind: 'row-pick', rows: 'answer' },
    },
    {
      key: 'selectedAnswer',
      label: 'Selected answer',
      kind: 'select',
      // Empty until somebody picks - and the empty string is not a letter, which the row-pick
      // kind checks before any lookup.
      value: '',
      options: [{ label: '—', value: '' }, ...letterOptions(ctx)],
      spec: { kind: 'row-pick', rows: 'answer' },
    },
  ],
  // The reveal is a real STEP on the default path (SPX's Continue reaches it), and the entrance
  // is named for what it shows so the state chip reads "Question" rather than "Enter".
  path: () => ({ entrance: 'Question', steps: [{ name: 'Reveal', duration: 0.45 }] }),
  machine: () => QUIZ_MACHINE,
  controls: () => ANSWER_BOARD_CONTROLS,
  paint: () => [
    { look: 'answer.selected', rows: 'answer', when: { state: ['main/selected', 'main/locked'], facts: ['selectedAnswer:picked'] }, default: 'row-highlight', anchor: 'answer' },
    { look: 'answer.correct', rows: 'answer', when: { state: ['main/reveal'], facts: ['correctAnswer:picked'] }, default: 'row-mark:correct', anchor: 'answer' },
    { look: 'answer.wrong', rows: 'answer', when: { state: ['main/reveal'], facts: ['correctAnswer:unpicked'] }, default: 'row-mark:wrong', anchor: 'answer' },
    { look: 'locked', when: { state: ['main/locked', 'main/sealed'] }, default: 'badge:Locked in' },
  ],
};
