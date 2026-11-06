// The RESULTS BOARD types — the four graphics that render a list the operator typed.
//
// All four answer the same question in the same way. The LIST is data: how many players, how
// many teams, how many rounds, how many cars is what the operator types, and none of it is a
// state. What IS a state is which row the show is talking about, and whether the table is
// still provisional.
//
// So each type is one state plus a field:
//
//   roster        `spotlight` + the player number   — moving the spotlight is a self-transition
//   standings     `highlighted` + the row number    — plus `final`, which is what turns a
//                                                     standings board into a result table
//   bracket       `advanced` + the round name       — plus `crowned`, the one-way end of a tree
//   timing-tower  `focused` + the competitor number — plus a PARALLEL `session` group, because
//                                                     a chequered flag must not disturb where
//                                                     the commentary's focus had got to
//
// Ten teams do not need ten states, and an eleventh adds none. That is the whole argument the
// scoreboard type makes about scores, applied to lists.

import { paletteById } from '../../model/wizard';
import { br01 } from '../competition/results/br01';
import { br02 } from '../competition/results/br02';
import { br03 } from '../competition/results/br03';
import { br04 } from '../competition/results/br04';
import { rs01 } from '../competition/results/rs01';
import { rs02 } from '../competition/results/rs02';
import { rs03 } from '../competition/results/rs03';
import { rs04 } from '../competition/results/rs04';
import { rs05 } from '../competition/results/rs05';
import { st01 } from '../competition/results/st01';
import { st02 } from '../competition/results/st02';
import { st03 } from '../competition/results/st03';
import { st04 } from '../competition/results/st04';
import { tt01 } from '../competition/results/tt01';
import { tt02 } from '../competition/results/tt02';
import { tt03 } from '../competition/results/tt03';
import { tt04 } from '../competition/results/tt04';
import {
  BRACKET_FIELDS,
  ROSTER_FIELDS,
  STANDINGS_FIELDS,
  TIMING_FIELDS,
} from '../competition/results/shared';
import type { GraphicType } from './graphicType';

export const rosterType: GraphicType = {
  id: 'roster',
  name: 'Roster / ordered list',
  description: 'An ordered list with an operator-controlled focus row.',
  structure: {
    prefix: 'results-board',
    category: 'results-board',
    parts: [
      { id: 'box', selector: '.results-board-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.results-board-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.results-board-head', kind: 'block', required: true },
      { id: 'rows', selector: '.results-board-body', kind: 'block', required: true },
      { id: 'title', selector: '#f0', kind: 'line', required: true },
      { id: 'team', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: ROSTER_FIELDS,
  machine: {
    main: {
      branches: [
        {
          id: 'spotlight',
          name: 'Player spotlit',
          timeline: {
            name: 'Spotlight',
            duration: 0.38,
            ease: 'in',
            calls: [{ time: 0, call: 'applySpotlight' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'spotlight', trigger: 'operator', event: 'spotlight' },
            // Moving down the line-up: the same state, a new number in the payload.
            { from: 'spotlight', to: 'spotlight', trigger: 'operator', event: 'spotlight' },
            { from: 'level', to: 'spotlight', trigger: 'operator', event: 'spotlight' },
          ],
        },
        {
          // Kept although « Back from a lit row and ⟲ Reset also level the line-up (#2200): they
          // exist only on the production and hosted pages. On the per-graphic control page, an
          // exported control panel, an OGraf host or Companion this press is the one way to level
          // a lit line-up without Out and Take.
          id: 'level',
          name: 'Whole line-up',
          timeline: {
            name: 'Clear spotlight',
            duration: 0.3,
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
  },
  controls: [
    { event: 'spotlight', label: 'Focus row', section: 'Order', order: 1, payload: ['spotlight'] },
    { event: 'clear', label: 'Show all rows', section: 'Order', order: 2 },
  ],
  capabilities: {
    maxLines: 2,
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-impact'],
    defaultZone: 'mid-left',
  },
  designs: [
    {
      id: 'rs01',
      name: 'Starting Line-up',
      description: 'A team line-up with roles — and a spotlight the caster moves down it.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => rs01.create(options),
    },
    {
      id: 'rs02',
      name: 'House Roster',
      description: 'The house line-up: void rows, mono roles, an amber spotlight block.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      create: (_type, options) => rs02.create(options),
    },
    {
      id: 'rs03',
      name: 'Clean Line-up',
      description: 'A panel-free line-up: hairline rows, roles in small caps, a quiet spotlight.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      create: (_type, options) => rs03.create(options),
    },
    {
      id: 'rs05',
      name: 'Frost Roster',
      description: 'A frosted line-up board with rounded rows and an accent-ringed spotlight.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-cascade', 'comp-bloom', 'comp-rise'],
      create: (_type, options) => rs05.create(options),
    },
    {
      id: 'rs04',
      name: 'Initiative Order',
      description: 'A tabletop turn order with status notes and an operator-controlled current turn.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: {
        title: 'INITIATIVE ORDER',
        team: 'THE SUNKEN CITADEL - LOWER VAULT',
        players:
          'SERAPHINA MOONWHISPER | 18 HP\n' +
          'CAPTAIN ALDRIC VON STURM | CONCENTRATING\n' +
          'ANCIENT CRIMSON OWLBEAR | BLOODIED\n' +
          'THANE IRONHEART | DODGING',
        spotlight: '2',
        crest: '',
      },
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      semantics:
        'Combatants use the roster\'s ordered rows, editable notes and one parameterized focus ' +
        'event. Calling that focus the current turn does not change its structure or behavior.',
      create: (_type, options) => rs04.create(options),
    },
  ],
};

export const standingsType: GraphicType = {
  id: 'standings',
  name: 'Standings / result table',
  description: 'A table of any columns, with a highlighted row and a final state.',
  structure: {
    prefix: 'results-board',
    category: 'results-board',
    parts: [
      { id: 'box', selector: '.results-board-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.results-board-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.results-board-head', kind: 'block', required: true },
      { id: 'rows', selector: '.results-board-body', kind: 'block', required: true },
      { id: 'title', selector: '#f0', kind: 'line', required: true },
      { id: 'subtitle', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: STANDINGS_FIELDS,
  machine: {
    main: {
      // whole table -> final table -> out: Next walks the board end to end and Back walks it back.
      // The FINAL is the claim that turns a standings board into a RESULT table, so it is the
      // board's one step; which row is being talked about is data, and stays a branch.
      pathEvents: ['final'],
      exitOnNext: true,
      branches: [
        {
          id: 'highlighted',
          name: 'Row highlighted',
          timeline: {
            name: 'Highlight row',
            duration: 0.36,
            ease: 'in',
            calls: [{ time: 0, call: 'applyHighlight' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'highlighted', trigger: 'operator', event: 'highlight' },
            { from: 'highlighted', to: 'highlighted', trigger: 'operator', event: 'highlight' },
            // Either press declares the result from a highlighted table, as from the whole one.
            { from: 'highlighted', to: { waypoint: 1 }, trigger: 'operator', event: 'final' },
            { from: 'highlighted', to: { waypoint: 1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'highlight', label: 'Highlight row', section: 'Table', order: 1, payload: ['highlight'] },
    { event: 'final', label: 'Final table', section: 'Table', order: 2 },
  ],
  capabilities: {
    maxLines: 2,
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-impact'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'st01',
      name: 'League Table',
      description: 'A standings table with any columns you declare — and a FINAL state.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => st01.create(options),
    },
    {
      id: 'st02',
      name: 'House Standings',
      description: 'The house table: void rows, mono headers, amber positions and final mark.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      create: (_type, options) => st02.create(options),
    },
    {
      id: 'st03',
      name: 'Frost Leaderboard',
      description: 'A frosted leaderboard: ranked glass tiles with the position in an accent ring.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-cascade', 'comp-bloom', 'comp-rise'],
      // A leaderboard is written around ranking language, not league language.
      samples: { title: 'LEADERBOARD', subtitle: 'AFTER ROUND 4' },
      create: (_type, options) => st03.create(options),
    },
    {
      id: 'st04',
      name: 'Clean Results',
      description: 'A quiet result table: hairline rules, tabular figures, nothing boxed.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      // This design is authored as the RESULT table of the family, so it says so.
      samples: { title: 'FINAL RESULTS', subtitle: 'GRAND FINAL · BEST OF 5' },
      create: (_type, options) => st04.create(options),
    },
  ],
};

export const bracketType: GraphicType = {
  id: 'bracket',
  name: 'Bracket',
  description: 'A knockout tree in round columns, with a live round and a champion.',
  structuralScope:
    'One single-elimination knockout tree: rounds in columns from one list, winners ' +
    'advancing to a single final. No losers bracket, no double elimination, no grand-final ' +
    'reset, no group stage or round robin.',
  structure: {
    prefix: 'results-board',
    category: 'results-board',
    parts: [
      { id: 'box', selector: '.results-board-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.results-board-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.results-board-head', kind: 'block', required: true },
      { id: 'rounds', selector: '.results-board-body', kind: 'block', required: true },
      { id: 'title', selector: '#f0', kind: 'line', required: true },
    ],
  },
  fields: BRACKET_FIELDS,
  machine: {
    main: {
      branches: [
        {
          id: 'advanced',
          name: 'Round live',
          timeline: {
            name: 'Advance round',
            duration: 0.36,
            ease: 'in',
            calls: [{ time: 0, call: 'applyRound' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'advanced', trigger: 'operator', event: 'advance' },
            { from: 'advanced', to: 'advanced', trigger: 'operator', event: 'advance' },
          ],
        },
        {
          // One way only: a bracket does not un-finish. The champion's name is DATA — the
          // event says the moment came, the field says who it was.
          id: 'crowned',
          name: 'Champion',
          timeline: {
            name: 'Crown the champion',
            duration: 0.5,
            ease: 'in',
            calls: [{ time: 0, call: 'crownChampion' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'crowned', trigger: 'operator', event: 'crown' },
            { from: 'advanced', to: 'crowned', trigger: 'operator', event: 'crown' },
            { from: 'crowned', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'advance', label: 'Advance round', section: 'Bracket', order: 1, payload: ['round'] },
    { event: 'crown', label: 'Crown champion', section: 'Bracket', order: 2, payload: ['champion'] },
  ],
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-impact'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'br01',
      name: 'Playoff Bracket',
      description: 'A knockout tree in round columns, with a cursor and a champion banner.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => br01.create(options),
    },
    {
      id: 'br02',
      name: 'House Bracket',
      description: 'The house knockout tree: void ties, mono rounds, an amber cursor and crown.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      create: (_type, options) => br02.create(options),
    },
    {
      id: 'br03',
      name: 'Clean Bracket',
      description: 'A panel-free knockout tree with hairline ties and a quiet live-round cursor.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      create: (_type, options) => br03.create(options),
    },
    {
      id: 'br04',
      name: 'Frost Bracket',
      description: 'A frosted knockout tree with glass ties and an accent-ringed live round.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-cascade', 'comp-bloom', 'comp-rise'],
      create: (_type, options) => br04.create(options),
    },
  ],
};

/**
 * THE TIMING TOWER — the live order of a timed session, and the one board in this category
 * that stays on air WHILE its content moves.
 *
 * A standings table is a claim about a finished set of matches; a tower is the session
 * happening. That difference is the whole design:
 *
 *  - **the order is data, and it is the operator's typing.** One textarea, one competitor per
 *    line, position taken from the line's place in the field. Twenty cars are not twenty
 *    fields, adding a car adds no states, and nothing in the graphic sorts anything — the
 *    timing feed is the authority on who is third, and a tower that re-sorted would start
 *    disagreeing with it the moment a lap time was mis-keyed.
 *  - **the focus is a state plus a row number.** The pack's recurring shape: the caster picks
 *    someone up, moves down the field, drops back to the whole order.
 *  - **the flag is a PARALLEL group**, not a branch on the main path. A session ending must not
 *    disturb where the commentary's focus had got to — the notice-card's argument
 *    (docs/PUBLIC_SERVICE_PACK.md §4) at the point where it applies most obviously — and a
 *    group entered by transition or by snap restores with the rest after a control-page
 *    refresh.
 *
 * The type is sport-neutral because its second field says WHAT THE TIMES MEAN: gaps to the
 * leader, intervals, lap times, splits. Its four designs each ship the content of a different
 * session for that reason, and none of them is a different graphic.
 */
export const timingTowerType: GraphicType = {
  id: 'timing-tower',
  name: 'Timing tower',
  description: 'The live order of a timed session — position, competitor, time — with a focus and a flag.',
  structure: {
    prefix: 'results-board',
    category: 'results-board',
    parts: [
      { id: 'box', selector: '.results-board-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.results-board-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.results-board-head', kind: 'block', required: true },
      { id: 'rows', selector: '.results-board-body', kind: 'block', required: true },
      { id: 'title', selector: '#f0', kind: 'line', required: true },
      { id: 'subtitle', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: TIMING_FIELDS,
  machine: {
    main: {
      branches: [
        {
          id: 'focused',
          name: 'Competitor in focus',
          timeline: {
            name: 'Focus competitor',
            duration: 0.34,
            ease: 'in',
            calls: [{ time: 0, call: 'applyFocus' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'focused', trigger: 'operator', event: 'focus' },
            // Moving down the field: the same state, a new number in the payload.
            { from: 'focused', to: 'focused', trigger: 'operator', event: 'focus' },
            { from: 'level', to: 'focused', trigger: 'operator', event: 'focus' },
          ],
        },
        {
          id: 'level',
          name: 'Whole field',
          timeline: {
            name: 'Clear focus',
            duration: 0.3,
            ease: 'out',
            calls: [{ time: 0, call: 'clearFocus' }],
            layers: {},
          },
          edges: [
            { from: 'focused', to: 'level', trigger: 'operator', event: 'clear' },
            { from: 'focused', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
    parallel: [
      {
        // The session's own pointer. Both states are runtime CALLS rather than keyframes, so
        // the resting pose needs no rest refine (the trap src/templates/AGENTS.md records for
        // parallel groups): it is the CSS default, and play()'s compClearMarks() is what puts
        // a replay back to a running session.
        id: 'session',
        initial: 'running',
        states: [
          {
            id: 'running',
            name: 'Session running',
            timeline: {
              name: 'Back to running',
              duration: 0.3,
              ease: 'out',
              calls: [{ time: 0, call: 'clearFinal' }],
              layers: {},
            },
            // A red flag, or a result declared a lap early: rare, real, and one press back.
            edges: [{ from: 'final', to: 'running', trigger: 'operator', event: 'provisional' }],
          },
          {
            id: 'final',
            name: 'Session final',
            timeline: {
              name: 'Session final',
              duration: 0.4,
              ease: 'in',
              calls: [{ time: 0, call: 'markFinal' }],
              layers: {},
            },
            edges: [{ from: 'running', to: 'final', trigger: 'operator', event: 'final' }],
          },
        ],
      },
    ],
  },
  controls: [
    { event: 'focus', label: 'Focus competitor', section: 'Order', order: 1, payload: ['focus'] },
    { event: 'clear', label: 'Whole field', section: 'Order', order: 2 },
    { event: 'final', label: 'Session final', section: 'Session', order: 3 },
    { event: 'provisional', label: 'Back to running', section: 'Session', order: 4 },
  ],
  capabilities: {
    maxLines: 2,
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-impact'],
    defaultZone: 'top-left',
  },
  designs: [
    {
      id: 'tt01',
      name: 'Timing Tower',
      description: 'The live running order of a timed session — position, competitor, gap.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => tt01.create(options),
    },
    {
      id: 'tt02',
      name: 'House Timing',
      description: 'The house timing tower: void rows, mono times, an amber focus keyline.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      // A qualifying sheet rather than a race: the time column is a lap, not a gap.
      samples: { title: 'QUALIFYING · Q3', subtitle: 'BEST LAP' },
      create: (_type, options) => tt02.create(options),
    },
    {
      id: 'tt03',
      name: 'Frost Splits',
      description: 'A frosted timing column: ringed positions, frosted rows, split times.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-cascade', 'comp-bloom', 'comp-rise'],
      // The pool's version of the same tower: elapsed time at a split, not a gap to anyone.
      samples: { title: '200M FREE · FINAL', subtitle: 'SPLIT AT 150M' },
      create: (_type, options) => tt03.create(options),
    },
    {
      id: 'tt04',
      name: 'Clean Timing',
      description: 'A quiet timing column: hairline rows, tabular gaps, no panel at all.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      // A road stage: the same gap column, measured in minutes rather than thousandths.
      samples: { title: 'STAGE 11 · KM 148', subtitle: 'GAP TO LEADER' },
      create: (_type, options) => tt04.create(options),
    },
  ],
};
