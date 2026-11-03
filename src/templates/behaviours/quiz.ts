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

import { ANSWER_BOARD_CONTROLS, ANSWER_BOARD_MACHINE, ANSWER_PICK_LOCK_OPTIONAL_SECTION, ANSWER_PICK_SECTION } from '../types/answerBoard';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';
import type { TypeBranch, TypeMachine } from '../types/graphicType';

/** How long after the lock a self-revealing board waits, in speed-relative seconds. */
const AUTO_REVEAL_AFTER = 5;

/** A look rule, read off the recipe declaration rather than imported from the blocks layer. */
type LookRule = Extract<ReturnType<BehaviourRecipe['paint']>[number], { look: string }>;

/** The heading of a no-Lock board's pick: there is nothing between the pick and the reveal. */
const NO_LOCK_PICK_SECTION = 'Pick, then reveal';

/**
 * THE TRUE NO-LOCK VARIANT (jev-svg-import AC-12). `lock: false` keeps the lock as an optional
 * beat, and every quiz saved that way must keep doing so. `noLock` is a different board: the
 * lock does not exist. Its states (`locked`, `sealed`), its events (`lock`, `revealChoice`), its
 * buttons and its look are gone, so no arrow, button or rule can reach them.
 *
 * It is NOT a declared `options` entry on purpose: the compiler fills every declared option's
 * default into the emitted table, so declaring it would add `noLock: false` to every saved
 * quiz's bytes. Only a board that chose it carries the key.
 *
 * The five-second timer leaves `locked`, which this board does not have. Moving it onto the pick
 * would change when a board reveals itself, so the pair is refused rather than resolved quietly.
 */
export function quizHasNoLock(options: Record<string, unknown> | undefined): boolean {
  return options?.noLock === true;
}

function assertNoLockSupported(ctx: RecipeContext): void {
  if (quizHasNoLock(ctx.options) && ctx.options.autoReveal === true) {
    throw new Error('Behaviour: a quiz without a lock has no automatic reveal (the timer starts at the lock).');
  }
}

/**
 * The answer board's arc WITHOUT the audience branch (this binding has no drawn moment for
 * percentages painted as chips), with the two OPTIONS applied as arrows rather than as flags:
 *
 *   `lock` off  - the reveal is legal straight from a pick: an arrow from `selected` to the reveal
 *                 joins the one the board already draws from the question. "What if I don't want
 *                 to be able to lock it?" (owner, 2026-08-22) is this one checkbox.
 *   `autoReveal` - a TIMER arrow from `locked` to the reveal, so a board reveals by itself a few
 *                 seconds after the lock - and a late Reveal press still works before it fires.
 *
 * Filtered and extended from the shipped declaration rather than restated, so the arcs that
 * survive can never drift from the catalog's.
 */
function quizMachine(ctx: RecipeContext): TypeMachine {
  assertNoLockSupported(ctx);
  const noLock = quizHasNoLock(ctx.options);
  // A no-Lock board drops the lock's two states, so no arrow can reach them.
  const dropped = noLock ? ['audience', 'locked', 'sealed'] : ['audience'];
  const branches: TypeBranch[] = (ANSWER_BOARD_MACHINE.main?.branches ?? [])
    .filter((b) => !dropped.includes(b.id))
    .map((b) => {
      if (b.id === 'selected' && (noLock || ctx.options.lock === false)) {
        const edges: TypeBranch['edges'] = [...b.edges, { from: 'selected', to: { waypoint: 1 }, trigger: 'operator', event: 'judge' }];
        // With no lock to press first, Next rejoins the walk from the pick, as it does from
        // `locked` on a board with one: a playout server's Continue must get past a pick.
        if (noLock) edges.push({ from: 'selected', to: { waypoint: 1 }, trigger: 'operator', event: 'next' });
        return { ...b, edges };
      }
      if (b.id === 'locked' && ctx.options.autoReveal === true) {
        return { ...b, edges: [...b.edges, { from: 'locked', to: { waypoint: 1 }, trigger: 'timer', after: AUTO_REVEAL_AFTER }] };
      }
      return b;
    });
  return withRepaint({ main: { ...ANSWER_BOARD_MACHINE.main, branches } });
}

const letterOptions = (ctx: RecipeContext) => ctx.rows.map((letter) => ({ label: letter, value: letter }));

export const quizRecipe: BehaviourRecipe = {
  id: 'quiz',
  name: 'Quiz',
  description: 'Select an answer, lock it in, reveal the correct one.',
  category: 'quiz',
  defaultZone: 'mid-center',
  rows: rowsOf('quiz'),
  roles: rolesOf('quiz'),
  options: [
    { key: 'lock', label: 'Require lock before reveal', hint: 'Off, and Reveal correct works straight from a pick.', default: true },
    { key: 'autoReveal', label: 'Reveal by itself a few seconds after the lock', hint: 'A five-second timer; Reveal correct still works sooner.', default: false },
  ],
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
      options: [{ label: '-', value: '' }, ...letterOptions(ctx)],
      spec: { kind: 'row-pick', rows: 'answer' },
    },
  ],
  // The reveal is a real STEP on the default path (SPX's Continue reaches it), and the entrance
  // is named for what it shows so the state chip reads "Question" rather than "Enter".
  path: () => ({ entrance: 'Question', steps: [{ name: 'Reveal', duration: 0.45 }] }),
  machine: quizMachine,
  // The board's own buttons; with the lock option off the heading says the lock is optional.
  controls: (ctx) =>
    quizHasNoLock(ctx.options)
      ? ANSWER_BOARD_CONTROLS.filter((c) => c.event !== 'lock' && c.event !== 'revealChoice').map((c) =>
          c.section === ANSWER_PICK_SECTION ? { ...c, section: NO_LOCK_PICK_SECTION } : c,
        )
      : ctx.options.lock === false
      ? ANSWER_BOARD_CONTROLS.map((c) => (c.section === ANSWER_PICK_SECTION ? { ...c, section: ANSWER_PICK_LOCK_OPTIONAL_SECTION } : c))
      : ANSWER_BOARD_CONTROLS,
  paint: (ctx) => {
    const rules: LookRule[] = [
      { look: 'answer.selected', rows: 'answer', when: { state: ['main/selected', 'main/locked'], facts: ['selectedAnswer:picked'] }, default: 'row-highlight', anchor: 'answer' },
      { look: 'answer.correct', rows: 'answer', when: { state: ['main/reveal'], facts: ['correctAnswer:picked'] }, default: 'row-mark:correct', anchor: 'answer' },
      { look: 'answer.wrong', rows: 'answer', when: { state: ['main/reveal'], facts: ['correctAnswer:unpicked'] }, default: 'row-mark:wrong', anchor: 'answer' },
      { look: 'locked', when: { state: ['main/locked', 'main/sealed'] }, default: 'badge:Locked in' },
    ];
    if (!quizHasNoLock(ctx.options)) return rules;
    // No lock: its look goes, and no rule names a state the machine no longer has.
    return rules
      .filter((r) => r.look !== 'locked')
      .map((r) => (r.when?.state ? { ...r, when: { ...r.when, state: r.when.state.filter((st) => st !== 'main/locked' && st !== 'main/sealed') } } : r));
  },
};
