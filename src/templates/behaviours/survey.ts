// THE SURVEY BOARD: reveal answers in any order, count strikes, sum the round
// (docs/SVG_BEHAVIOUR_SHOWS.md, the Family Feud board; challenge brief C5's shape with a count).
//
// The board is painted from DATA and the machine is nearly empty, which is C5's whole lesson:
// one `board` state whose reveal arrows are SELF-TRANSITIONS carrying nothing but the press, and
// the row that was revealed is a FIELD per answer (`Answer 3 revealed`, on or off) that the
// button SETS - so a controller that can only send data reveals a row by writing "on", and the
// look on that row binds to the field, never to a state (docs/OGRAF_STATE_IN_FIELDS.md). A
// reveal cannot be taken back by a button, on purpose: the show never un-reveals, and the row's
// own field on the control page is the correction.
//
// THE STRIKES ARE A COUNTER WITH A CEILING, and the ceiling is the machine's. A `strikes` group
// walks s0 -> s1 -> s2 -> s3 on the same `strike` event that carries `+1` on the strikes field,
// so the fourth press is greyed by the structural guard and the operator's box can never run
// past the three X's the artwork has (the drift the handoff refused to ship). The X's bind to the
// field through the runtime's `counter` kind - `strikes:reached:2` lights the second X - so a
// controller writing "2" paints two X's without any event.
//
// THE ANSWERS ARE ONE FIELD, "Toaster | 32" per line (the vote's wire, the owner's rule for lists:
// rows pasted as one field), written into the layers the designer drew and shown as each is
// revealed; the round total is the runtime's sum over the revealed rows, never a figure the
// operator has to keep in step.

import type { TypeControlEvent, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext, RecipeField } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

/** Three strikes, as the show has: the artwork's three X layers are the ceiling. */
export const SURVEY_STRIKES = 3;

const REVEALED = 'revealed';
const STRIKES = 'strikes';
const revealEvent = (key: string): string => `reveal${key}`;
const STRIKE_EVENT = 'strike';
const UNSTRIKE_EVENT = 'unstrike';
const CLEAR_STRIKES_EVENT = 'clearStrikes';
const RESET_EVENT = 'reset';

function surveyMachine(ctx: RecipeContext): TypeMachine {
  const op = (from: string, to: string, event: string) => ({ from, to, trigger: 'operator' as const, event });
  const s = (n: number): string => `s${n}`;
  const strikes = Array.from({ length: SURVEY_STRIKES + 1 }, (_, n) => n);
  return withRepaint({
    parallel: [
      {
        id: 'board',
        initial: 'live',
        states: [
          {
            id: 'live',
            name: 'Board',
            timeline: null,
            // Every reveal re-enters the one state, which is what replays the reveal's pop and
            // lands the press's `set` before the repaint asks which rows are on.
            edges: [...ctx.rows.map((key) => op('live', 'live', revealEvent(key))), op('live', 'live', RESET_EVENT)],
          },
        ],
      },
      {
        id: STRIKES,
        initial: s(0),
        states: strikes.map((n) => ({
          id: s(n),
          name: n === 0 ? 'No strikes' : `${n} ${n === 1 ? 'strike' : 'strikes'}`,
          timeline: null,
          edges: [
            ...(n > 0 ? [op(s(n - 1), s(n), STRIKE_EVENT)] : []),
            ...(n < SURVEY_STRIKES ? [op(s(n + 1), s(n), UNSTRIKE_EVENT)] : []),
            ...(n === 0 ? strikes.filter((m) => m > 0).map((m) => op(s(m), s(0), CLEAR_STRIKES_EVENT)) : []),
            ...(n === 0 ? strikes.map((m) => op(s(m), s(0), RESET_EVENT)) : []),
          ],
        })),
      },
    ],
  });
}

function surveyControls(ctx: RecipeContext): TypeControlEvent[] {
  const revealedKey = (key: string): string => ctx.fieldKey(REVEALED, key)!;
  return [
    ...ctx.rows.map((key, i): TypeControlEvent => ({
      event: revealEvent(key),
      label: `Reveal ${key}`,
      section: 'Answers',
      order: i + 1,
      set: { [revealedKey(key)]: 'on' },
    })),
    { event: STRIKE_EVENT, label: 'Strike', section: 'Strikes', order: 100, adjust: { [STRIKES]: 1 } },
    { event: UNSTRIKE_EVENT, label: 'Take back a strike', section: 'Strikes', order: 101, adjust: { [STRIKES]: -1 } },
    { event: CLEAR_STRIKES_EVENT, label: 'Clear strikes', section: 'Strikes', order: 102, set: { [STRIKES]: '0' } },
    {
      event: RESET_EVENT,
      label: 'Reset board',
      section: 'Board',
      order: 900,
      destructive: true,
      set: { ...Object.fromEntries(ctx.rows.map((key) => [revealedKey(key), 'off'])), [STRIKES]: '0' },
    },
  ];
}

export const surveyRecipe: BehaviourRecipe = {
  id: 'survey',
  name: 'Survey board',
  description: 'Reveal the answers in any order, count the strikes, and the round total adds itself up.',
  category: 'quiz',
  defaultZone: 'mid-center',
  rows: rowsOf('survey'),
  roles: rolesOf('survey'),
  fields: (ctx): RecipeField[] => [
    {
      key: 'answers',
      label: 'Answers',
      kind: 'lines',
      value: '',
      // The sum counts a row only while its own revealed field reads on.
      spec: { kind: 'list', rows: 'answer', when: REVEALED },
    },
    ...ctx.rows.map((key): RecipeField => ({
      key: `${REVEALED}-${key}`,
      label: `Answer ${key} revealed`,
      kind: 'select',
      value: 'off',
      options: [
        { label: 'Hidden', value: 'off' },
        { label: 'Revealed', value: 'on' },
      ],
      spec: { kind: 'select' },
      row: { role: REVEALED, key },
    })),
    { key: STRIKES, label: 'Strikes', kind: 'number', value: '0', spec: { kind: 'counter', min: '0', max: String(SURVEY_STRIKES) } },
  ],
  path: () => ({ entrance: 'On air' }),
  machine: surveyMachine,
  controls: surveyControls,
  paint: () => [
    { write: 'answer', rows: 'answer', from: 'answers:label' },
    { write: 'points', rows: 'answer', from: 'answers:figure' },
    { look: 'answer', rows: 'answer', when: { facts: [`${REVEALED}:is:on`] }, enter: 'pop' },
    { look: 'points', rows: 'answer', when: { facts: [`${REVEALED}:is:on`] }, enter: 'pop' },
    { look: 'answer.revealed', rows: 'answer', when: { facts: [`${REVEALED}:is:on`] }, enter: 'pop' },
    ...Array.from({ length: SURVEY_STRIKES }, (_, i) => ({
      look: `strike.${i + 1}`,
      when: { facts: [`${STRIKES}:reached:${i + 1}`] },
      enter: 'pop' as const,
    })),
    { write: 'total', from: 'answers:total' },
  ],
};
