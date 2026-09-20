// DUEL SCORE - two players, two numbers, kept up for a whole show.
//
// The catalog already had two score shapes and neither is this one. The founding scoreboard
// (scoreboard.ts) is a FOOTBALL strip: its control page says Goal and Full time, and a goal
// raises a flag. The podium board (podiumScore.ts) is for up to four contestants with a
// spotlight. A two-player quiz wants the first one's shape with the second one's vocabulary -
// names and points, one press per point, and a final call that shows who won.
//
// The model's rules, applied:
//   1. DATA IS NOT STATE. Both scores are fields, and a point is an event that also MOVES a
//      number (`adjust`), so the figure changes exactly when the press is accepted.
//   2. A PRESS THAT MUST NOT REPLAY THE ENTRANCE rides a parallel group of one state with
//      self-transitions. Scoring a point re-enters `counting`, which pulses the centre mark
//      and calls `scorePoint` - an event's payload is written straight into the element and
//      never passes through update(), so the pop and the leader mark are asked for by name.
//      The main group never moves, so the strip does not re-enter every time someone scores.
//   3. WHO LEADS IS NOT A STATE EITHER. It is read off the two numbers by the runtime
//      (scoreboards/duelShared.ts), so a correction typed into a score box moves the mark.
//
// WHERE IT SITS is the design's zone, not a field: top-centre by default, and the wizard's
// Position grid (or the editor's Style panel) moves it to the bottom. All three designs are
// drawn symmetric top-to-bottom for exactly that reason - none of them hangs from an edge.

import { paletteById } from '../../model/wizard';
import { sb26 } from '../scoreboards/sb26';
import { sb27 } from '../scoreboards/sb27';
import { sb28 } from '../scoreboards/sb28';
import { DUEL_NAMES } from '../scoreboards/duelShared';
import type { GraphicType, TypeEdge } from './graphicType';

/** A scoring press: around the one `counting` state, so nothing on the main walk moves. */
const press = (event: string): TypeEdge => ({ from: 'counting', to: 'counting', trigger: 'operator', event });

export const duelScoreType: GraphicType = {
  id: 'duel-score',
  name: 'Two-player score',
  description: 'Two names and two scores for a head-to-head game: one press per point, and a final call that marks the winner.',
  structuralScope:
    'Exactly two players, each a name and a number. No clock, no periods, no flag - a match with a clock is the scorebug, and three or four contestants is the podium board.',
  structure: {
    prefix: 'scoreboard',
    category: 'scoreboard',
    parts: [
      { id: 'box', selector: '.scoreboard-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.scoreboard-accent', kind: 'accent', required: true },
      { id: 'playerA', selector: '#f0', kind: 'line', required: true },
      { id: 'scoreA', selector: '#f1', kind: 'line', required: true },
      { id: 'playerB', selector: '#f2', kind: 'line', required: true },
      { id: 'scoreB', selector: '#f3', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'playerA', label: 'Player 1', kind: 'text', value: DUEL_NAMES[0], role: 'line' },
    { key: 'scoreA', label: 'Score 1', kind: 'number', value: '0', role: 'line' },
    { key: 'playerB', label: 'Player 2', kind: 'text', value: DUEL_NAMES[1], role: 'line' },
    { key: 'scoreB', label: 'Score 2', kind: 'number', value: '0', role: 'line' },
  ],
  machine: {
    parallel: [
      {
        id: 'points',
        initial: 'counting',
        states: [
          {
            id: 'counting',
            name: 'Counting',
            // Re-entered on every scoring press: the centre mark kicks, and `scorePoint` pops the
            // figure that changed and re-marks the leader.
            timeline: {
              name: 'Point',
              duration: 0.3,
              ease: 'in',
              calls: [{ time: 0, call: 'scorePoint' }],
              layers: { accent: { scale: [{ time: 0, value: 1 }, { time: 0.12, value: 1.35 }, { time: 0.3, value: 1 }] } },
            },
            edges: [press('pointA'), press('pointB'), press('undoA'), press('undoB'), press('newGame')],
          },
        ],
      },
      // The RESULT: live, or final. A decided game stays decided until somebody starts a NEW
      // one - which is the one way back, and it is the same press that puts both scores to 0,
      // so a board can never look live while it still shows the last game's figures. (This is
      // where a game show differs from a match: a match does not un-finish, a show has rounds.)
      {
        id: 'result',
        initial: 'live',
        states: [
          {
            id: 'live',
            name: 'Live',
            timeline: {
              name: 'Live',
              duration: 0.2,
              ease: 'out',
              calls: [{ time: 0, call: 'markLive' }],
              layers: {},
            },
            edges: [{ from: 'final', to: 'live', trigger: 'operator', event: 'newGame' }],
          },
          {
            id: 'final',
            name: 'Final score',
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
    { event: 'pointA', label: 'Point to player 1', section: 'Points', order: 1, adjust: { scoreA: 1 } },
    { event: 'pointB', label: 'Point to player 2', section: 'Points', order: 2, adjust: { scoreB: 1 } },
    { event: 'undoA', label: 'Take one back from player 1', section: 'Corrections', order: 3, adjust: { scoreA: -1 } },
    { event: 'undoB', label: 'Take one back from player 2', section: 'Corrections', order: 4, adjust: { scoreB: -1 } },
    { event: 'final', label: 'Final score', section: 'Game', order: 5 },
    { event: 'newGame', label: 'New game (both to 0)', section: 'Game', order: 6, destructive: true, set: { scoreA: '0', scoreB: '0' } },
  ],
  capabilities: {
    maxLines: 4,
    logo: 'none',
    animationPresets: ['slide-down', 'slide-up', 'mask-wipe', 'fade', 'snap-stinger', 'flip-3d'],
    defaultZone: 'top-center',
  },
  designs: [
    {
      id: 'sb26',
      name: 'Sticker Score',
      description: 'Neo-brutal two-player score: two outlined name labels with ink score blocks, a tilted accent diamond between them.',
      styleTag: 'sticker',
      palette: paletteById('tangerine'),
      fontId: 'archivo',
      animationPresets: ['snap-stinger', 'slide-down', 'slide-up', 'mask-wipe', 'fade'],
      create: (_type, options) => sb26.create(options),
    },
    {
      id: 'sb27',
      name: 'Showtime Score',
      description: 'Theatre-marquee two-player score: one long pill with a lit centre star, names in serif, scores in round medallions.',
      styleTag: 'showtime',
      palette: paletteById('marquee'),
      fontId: 'playfair-display',
      animationPresets: ['fade', 'slide-down', 'slide-up', 'mask-wipe', 'pop-spring'],
      create: (_type, options) => sb27.create(options),
    },
    {
      id: 'sb28',
      name: 'Arcade Score',
      description: 'Cabinet-screen two-player score: a pixel-cornered neon bar, mono player tags, big glowing figures either side of a pixel divider.',
      styleTag: 'arcade',
      palette: paletteById('neon-cyan'),
      fontId: 'saira',
      animationPresets: ['slide-down', 'slide-up', 'mask-wipe', 'fade', 'snap-stinger'],
      create: (_type, options) => sb28.create(options),
    },
  ],
};
