// THE SCORE TRACKER, as a recipe: a point, a flash, a correction, full time, on artwork somebody
// else drew (docs/backlog/scoreboard-behaviour.md; the module it replaces is recorded in
// docs/GRAPHIC_BEHAVIOUR_PLAN.md and docs/SCORE_CONTROL_SURVEY.md).
//
// TWO OR MORE TEAMS, NEVER TWO (owner, 2026-09-03). A row is a team's name and its figure, both
// the operator's own fields - typed, and bumped by the `+1` beside them - and a flash the designer
// drew for the moment a point lands. The recipe owns no fields: every value it drives is a layer
// the designer already drew and the importer already bound, and a shadow copy would give the
// operator two boxes for one number.
//
// WHICH ROW FLASHED IS DATA, NOT A STATE. One `Flash` state in a parallel group; the row is the
// figure that ROSE, which the runtime's `number` kind latches per group (`score:moved`). The
// payload lands before the state's repaint runs, so by the time the rule asks, the score that
// moved has moved. A bare ± correction fires no event and therefore flashes nothing, which is
// right twice over: data never causes a transition, and a mis-press is not a moment.
//
// THE BUTTONS ARE THE SURVEY'S (docs/SCORE_CONTROL_SURVEY.md): `+1` per row carrying the point
// with the flash (`adjust`), `−1` per row as the correction that also takes the flash down, Clear
// flash, Full time, and New game - which zeroes every score through `set`, the only road that can
// say "make it this", so the operator's own boxes move with the board.

import { scoreboardType } from '../types/scoreboard';
import type { TypeBranch, TypeControlEvent, TypeGroup, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

/**
 * How many teams a board may carry. Eight: every row earns two buttons, so eight teams is already
 * a wall of nineteen - the point at which a board stops being operable live, which is the only
 * thing worth capping on (the survey agrees from both sides). Declared in words.json beside the
 * words; read here so the mapping step's count picker and the recipe cannot disagree.
 */
export const SCORE_MAX_ROWS = rowsOf('score')!.max;

const scoreEvent = (row: number): string => `score${row + 1}`;
const unscoreEvent = (row: number): string => `unscore${row + 1}`;
const CLEAR_EVENT = 'clearFlag';
const FINAL_EVENT = 'final';
const NEW_GAME_EVENT = 'newGame';

/** The catalog scoreboard's own group, by id - the shape, the durations and the eases this
 *  recipe reuses rather than re-chooses. */
function catalogGroup(id: string): TypeGroup | undefined {
  return (scoreboardType.machine?.parallel ?? []).find((g) => g.id === id);
}

/** One state of a catalog group, its own edges replaced. The timings survive - the catalog board's,
 *  and this recipe has no better opinion about how long a goal flash lasts - and `withRepaint`
 *  drops the layer tracks (they animate parts we did not draw) and puts the repaint on. */
function stateOf(group: TypeGroup | undefined, id: string, edges: TypeBranch['edges']): TypeBranch {
  const source = group?.states.find((s) => s.id === id);
  return { id, ...(source?.name ? { name: source.name } : {}), timeline: source?.timeline ?? null, edges };
}

/**
 * The board's arc, derived from the catalog scoreboard's: two parallel groups (a flash is up or
 * it is not; a match is live or it is final), with the edges regenerated for however many rows
 * the designer drew. `unscoreN` lands in `none` from either state: a correction leaves nothing of
 * itself behind. `live` gets a real timeline here where the catalog's is pose-only, because New
 * game exists and a state that plays nothing would leave the full-time mark up after it.
 */
function scoreMachine(ctx: RecipeContext): TypeMachine {
  const rows = ctx.rows.map((_, i) => i);
  const flag = catalogGroup('flag');
  const result = catalogGroup('result');
  const op = (from: string, to: string, event: string) => ({ from, to, trigger: 'operator' as const, event });
  return withRepaint({
    parallel: [
      {
        id: 'flag',
        initial: 'none',
        states: [
          stateOf(flag, 'none', [
            op('shown', 'none', CLEAR_EVENT),
            // Both ends, so a correction and a new game are legal wherever the board is - an event
            // with no arrow out of the current state is DROPPED, and a minus button that silently
            // does nothing is worse than none.
            ...rows.flatMap((i) => [op('shown', 'none', unscoreEvent(i)), op('none', 'none', unscoreEvent(i))]),
            op('shown', 'none', NEW_GAME_EVENT),
            op('none', 'none', NEW_GAME_EVENT),
          ]),
          // A second point while the flash is still up is the SELF-TRANSITION: it replays the
          // flash and bumps again rather than being dropped.
          stateOf(flag, 'shown', rows.flatMap((i) => [op('none', 'shown', scoreEvent(i)), op('shown', 'shown', scoreEvent(i))])),
        ],
      },
      {
        id: 'result',
        initial: 'live',
        states: [
          stateOf(result, 'live', [op('final', 'live', NEW_GAME_EVENT), op('live', 'live', NEW_GAME_EVENT)]),
          stateOf(result, 'final', [op('live', 'final', FINAL_EVENT)]),
        ],
      },
    ],
  });
}

function scoreControls(ctx: RecipeContext): TypeControlEvent[] {
  const perRow = ctx.rows.flatMap((key, i): TypeControlEvent[] => {
    // ONE SECTION PER TEAM, named with the designer's own word for that team; the label is the
    // signed amount and nothing else - the survey's label finding exactly.
    const section = ctx.label('team', key);
    const score = ctx.fieldKey('score', key)!;
    return [
      { event: scoreEvent(i), label: '+1', section, order: i * 2 + 1, adjust: { [score]: 1 } },
      { event: unscoreEvent(i), label: '−1', section, order: i * 2 + 2, adjust: { [score]: -1 } },
    ];
  });
  return [
    ...perRow,
    // Ordered past any row's pair: the board's own verbs come last on every surface.
    { event: CLEAR_EVENT, label: 'Clear flash', section: 'Board', order: 900 },
    { event: FINAL_EVENT, label: 'Full time', section: 'Board', order: 901, destructive: true },
    {
      event: NEW_GAME_EVENT,
      label: 'New game',
      section: 'Board',
      order: 902,
      destructive: true,
      // ZERO, never the figure the designer drew: a sample "12" shows what the board looks like
      // mid-match, it does not say where a game starts.
      set: Object.fromEntries(ctx.rows.map((key) => [ctx.fieldKey('score', key)!, '0'])),
    },
  ];
}

export const scoreRecipe: BehaviourRecipe = {
  id: 'score',
  name: 'Score tracker',
  description: 'A point per team with the flash you drew, a correction, full time and a new game.',
  category: 'scoreboard',
  defaultZone: 'top-center',
  rows: rowsOf('score'),
  roles: rolesOf('score'),
  fields: () => [],
  // Named for what a score board IS on air; no extra step, because a scoreboard has no reveal
  // sequence - everything interesting is beside the path, in the two parallel groups.
  path: () => ({ entrance: 'On air' }),
  machine: scoreMachine,
  controls: scoreControls,
  paint: () => [
    { look: 'team.flash', rows: 'team', when: { state: ['flag/shown'], facts: ['score:moved'] }, enter: 'pop' },
    { look: 'final', when: { state: ['result/final'] } },
  ],
  // Every team's figure is a number in ONE group, so "moved" is the row that rose most recently.
  artworkKinds: (ctx) => Object.fromEntries(ctx.rows.flatMap((key) => {
    const id = ctx.fieldId('score', key);
    return id ? [[id, { kind: 'number', group: 'score' }]] : [];
  })),
};
