// PODIUM SCORE — the game-show score board: up to four contestants, each a name and a number,
// with a spotlight the host's operator moves between them.
//
// It exists because the two shipped score shapes both miss the game show. The scorebug is a
// TWO-SIDED graphic — its whole layout argues one side against the other — and the standings
// board is a LIST the operator retypes, which is the wrong grain for points that change on
// every question. A game show needs per-contestant number fields (so every control surface
// gives each score its own steppers, and a point is one press) on a board that is not a duel.
//
// The model's two founding rules, applied to people:
//   1. DATA IS NOT STATE. Four names and four scores are fields. A cleared name COLLAPSES its
//      podium (the runtime's rebuild), so two, three or four contestants are one design — the
//      answer-board argument ("2, 3 and 4 answers are one machine") without even needing a
//      machine to make it.
//   2. The SPOTLIGHT is the roster's arc verbatim: one state plus an index field, self-refiring
//      so re-pressing it moves the light. Four contestants need no four states.
//
// The parallel `result` group is the founding scoreboard's: live, then final, one way — a
// decided game does not un-decide. `markFinal` and the `.scoreboard-final` repaint already
// exist in every scoreboard runtime, so the group costs this type nothing new.

import { paletteById } from '../../model/wizard';
import { sb21 } from '../scoreboards/sb21';
import { sb22 } from '../scoreboards/sb22';
import type { GraphicType } from './graphicType';

export const podiumScoreType: GraphicType = {
  id: 'podium-score',
  name: 'Podium scores',
  description: 'Game-show contestant scores: up to four podiums, per-player steppers, a movable spotlight.',
  structure: {
    prefix: 'scoreboard',
    category: 'scoreboard',
    parts: [
      { id: 'box', selector: '.scoreboard-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.scoreboard-accent', kind: 'accent', required: true },
      { id: 'heading', selector: '#f0', kind: 'line', required: true },
      { id: 'name1', selector: '#f1', kind: 'line', required: true },
      { id: 'score1', selector: '#f2', kind: 'line', required: true },
      { id: 'name2', selector: '#f3', kind: 'line', required: true },
      { id: 'score2', selector: '#f4', kind: 'line', required: true },
      { id: 'name3', selector: '#f5', kind: 'line', required: true },
      { id: 'score3', selector: '#f6', kind: 'line', required: true },
      { id: 'name4', selector: '#f7', kind: 'line', required: true },
      { id: 'score4', selector: '#f8', kind: 'line', required: true },
    ],
  },
  // Names and scores are all DATA — none of them is a state, and a score bump moves no pointer.
  // The spotlight index is data too: WHICH podium is lit rides the event's payload, so one
  // state carries any of the four (the roster's argument, made about people).
  fields: [
    { key: 'heading', label: 'Heading', kind: 'text', value: 'SCORES', role: 'line' },
    { key: 'name1', label: 'Player 1', kind: 'text', value: 'MAYA', role: 'line' },
    { key: 'score1', label: 'Score 1', kind: 'number', value: '0', role: 'line' },
    { key: 'name2', label: 'Player 2', kind: 'text', value: 'JONAS', role: 'line' },
    { key: 'score2', label: 'Score 2', kind: 'number', value: '0', role: 'line' },
    { key: 'name3', label: 'Player 3', kind: 'text', value: 'PRIYA', role: 'line' },
    { key: 'score3', label: 'Score 3', kind: 'number', value: '0', role: 'line' },
    { key: 'name4', label: 'Player 4', kind: 'text', value: 'SAM', role: 'line' },
    { key: 'score4', label: 'Score 4', kind: 'number', value: '0', role: 'line' },
    { key: 'spotlight', label: 'Spotlit podium (1-4, 0 = none)', kind: 'number', value: '0', role: 'data' },
  ],
  machine: {
    main: {
      branches: [
        {
          id: 'spotlight',
          name: 'Podium spotlit',
          timeline: {
            name: 'Spotlight',
            duration: 0.3,
            ease: 'in',
            calls: [{ time: 0, call: 'applySpotlight' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'spotlight', trigger: 'operator', event: 'spotlight' },
            // Moving the light: the same state, a new podium in the payload.
            { from: 'spotlight', to: 'spotlight', trigger: 'operator', event: 'spotlight' },
            { from: 'level', to: 'spotlight', trigger: 'operator', event: 'spotlight' },
          ],
        },
        {
          id: 'level',
          name: 'All podiums level',
          timeline: {
            name: 'Clear spotlight',
            duration: 0.25,
            ease: 'out',
            calls: [{ time: 0, call: 'clearSpotlight' }],
            layers: {},
          },
          edges: [
            { from: 'spotlight', to: 'level', trigger: 'operator', event: 'clear' },
            { from: 'spotlight', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
    parallel: [
      // The RESULT: live, or final. One way only — a decided game does not un-decide.
      {
        id: 'result',
        initial: 'live',
        states: [
          { id: 'live', name: 'Live', timeline: null, edges: [] },
          {
            id: 'final',
            name: 'Final',
            timeline: {
              name: 'Final',
              duration: 0.35,
              ease: 'in',
              calls: [{ time: 0, call: 'markFinal' }],
              layers: { box: { scale: [{ time: 0, value: 1 }, { time: 0.18, value: 1.04 }, { time: 0.35, value: 1 }] } },
            },
            edges: [{ from: 'live', to: 'final', trigger: 'operator', event: 'final' }],
          },
        ],
      },
    ],
  },
  controls: [
    { event: 'spotlight', label: 'Spotlight', section: 'Podiums', order: 1, payload: ['spotlight'] },
    { event: 'clear', label: 'All level', section: 'Podiums', order: 2 },
    { event: 'final', label: 'Final scores', section: 'Result', order: 3 },
  ],
  capabilities: {
    maxLines: 9,
    logo: 'none',
    animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down'],
    defaultZone: 'bottom-center',
  },
  designs: [
    {
      id: 'sb21',
      name: 'Volt Podiums',
      description: 'Four-contestant game-show scores: a volt slab of name-over-points columns with a movable spotlight.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => sb21.create(options),
    },
    {
      id: 'sb22',
      name: 'House Podiums',
      description: 'Four-contestant game-show scores on the house void strip: amber figures, a movable spotlight.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      // The house strip reveals rather than slams — sb03's vocabulary, not the sport lead.
      animationPresets: ['slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb22.create(options),
    },
  ],
};
