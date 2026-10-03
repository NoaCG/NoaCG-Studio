// The SCOREBOARD-category sports types: the compact scorebug, the full match board, the
// status/final-score card, and the match-event card.
//
// These are the pack's stateful graphics, and every one of them is an argument for the same
// two rules the scoreboard type already proves (docs/GRAPHIC_TYPES.md, STATE_MACHINE_SCHEMA.md):
//
//   1. DATA IS NOT STATE. The scores, the clock's VALUE, the period name, the club colours and
//      the crests are all fields. Changing any of them repaints something and moves no pointer.
//      There is no "3-1" state and no "second half" state, which is why one scorebug covers
//      every sport instead of one per competition format.
//   2. INDEPENDENT THINGS GET INDEPENDENT GROUPS. Whether the clock is running, whether play is
//      in an interval, and whether the match is over are three unrelated facts. As three
//      2-state groups that is 2+2+2 states; as one combined graph it would be eight, and the
//      eighth ("finished, at half time, clock running") is nonsense nobody would ever author.
//
// The one thing worth calling out as NEW here is the clock group's third state. A scorebug's
// clock is not just running-or-held: before kick-off and after a reset it sits ARMED at the
// period's starting value, which is a different thing from being paused mid-period, and an
// operator who cannot get back to it has to reload the graphic to start the second half.

import { paletteById } from '../../model/wizard';
import { sb05 } from '../scoreboards/sb05';
import { sb06 } from '../scoreboards/sb06';
import { sb07 } from '../scoreboards/sb07';
import { sb08 } from '../scoreboards/sb08';
import { sb09 } from '../scoreboards/sb09';
import { sb10 } from '../scoreboards/sb10';
import { sb11 } from '../scoreboards/sb11';
import { sb12 } from '../scoreboards/sb12';
import { sb13 } from '../scoreboards/sb13';
import { sb14 } from '../scoreboards/sb14';
import { sb15 } from '../scoreboards/sb15';
import { sb16 } from '../scoreboards/sb16';
import { sb17 } from '../scoreboards/sb17';
import { sb18 } from '../scoreboards/sb18';
import { sb19 } from '../scoreboards/sb19';
import { sb20 } from '../scoreboards/sb20';
import { sb23 } from '../scoreboards/sb23';
import { sb24 } from '../scoreboards/sb24';
import { sb25 } from '../scoreboards/sb25';
import type { GraphicType, TypeControlEvent, TypeField, TypeGroup } from './graphicType';

// ── The shared groups ────────────────────────────────────────────────────────

/**
 * THE MATCH CLOCK group: armed · running · stopped.
 *
 * `armed` is the initial state and the one that makes this usable across a whole match: it
 * means "at the period's starting value, not running". Reset from either other state returns
 * here, so starting the second half is one button rather than a reload — and because a
 * parallel group's initial state never plays its timeline at play(), arming costs nothing on
 * air (the clock element already shows its own starting value).
 *
 * The three timelines carry only their CALLS: starting a clock is an effect, not a movement.
 */
function matchClockGroup(): TypeGroup {
  return {
    id: 'clock',
    initial: 'armed',
    states: [
      {
        id: 'armed',
        name: 'At period start',
        timeline: {
          name: 'Reset clock',
          duration: 0.1,
          ease: 'out',
          calls: [{ time: 0, call: 'resetMatchClock' }],
          layers: {},
        },
        edges: [
          { from: 'running', to: 'armed', trigger: 'operator', event: 'clockReset' },
          { from: 'stopped', to: 'armed', trigger: 'operator', event: 'clockReset' },
        ],
      },
      {
        id: 'running',
        name: 'Clock running',
        timeline: {
          name: 'Start clock',
          duration: 0.1,
          ease: 'in',
          calls: [{ time: 0, call: 'startMatchClock' }],
          layers: {},
        },
        edges: [
          { from: 'armed', to: 'running', trigger: 'operator', event: 'clockStart' },
          { from: 'stopped', to: 'running', trigger: 'operator', event: 'clockStart' },
        ],
      },
      {
        id: 'stopped',
        name: 'Clock stopped',
        timeline: {
          name: 'Stop clock',
          duration: 0.1,
          ease: 'out',
          calls: [{ time: 0, call: 'stopMatchClock' }],
          layers: {},
        },
        edges: [{ from: 'running', to: 'stopped', trigger: 'operator', event: 'clockStop' }],
      },
    ],
  };
}

/**
 * THE PLAY group: in play · interval.
 *
 * An interval is not "the clock is stopped" — the clock stops for an injury too, and the board
 * should not announce half time because someone is being treated. Entering the interval holds
 * the clock as well, which is the one place these two groups touch, and it touches in the safe
 * direction: the interval implies a held clock, a held clock implies nothing.
 */
function playGroup(): TypeGroup {
  return {
    id: 'play',
    initial: 'inPlay',
    states: [
      {
        id: 'inPlay',
        name: 'In play',
        timeline: {
          name: 'Resume play',
          duration: 0.25,
          ease: 'in',
          calls: [{ time: 0, call: 'markInPlay' }],
          layers: {},
        },
        edges: [{ from: 'interval', to: 'inPlay', trigger: 'operator', event: 'resumePlay' }],
      },
      {
        id: 'interval',
        name: 'Interval',
        timeline: {
          name: 'Interval',
          duration: 0.25,
          ease: 'out',
          calls: [{ time: 0, call: 'markBreak' }],
          layers: {},
        },
        edges: [{ from: 'inPlay', to: 'interval', trigger: 'operator', event: 'interval' }],
      },
    ],
  };
}

/**
 * THE RESULT group: live · final. One way only — a match does not un-finish, so there is no
 * arrow back and an accidental second press is dropped by the structural guard rather than by
 * a confirmation dialog nobody reads under pressure.
 */
function resultGroup(): TypeGroup {
  return {
    id: 'result',
    initial: 'live',
    states: [
      { id: 'live', name: 'Live', timeline: null, edges: [] },
      {
        id: 'final',
        name: 'Full time',
        timeline: {
          name: 'Full time',
          duration: 0.35,
          ease: 'in',
          calls: [{ time: 0, call: 'markFinal' }],
          layers: { box: { scale: [{ time: 0, value: 1 }, { time: 0.18, value: 1.03 }, { time: 0.35, value: 1 }] } },
        },
        edges: [{ from: 'live', to: 'final', trigger: 'operator', event: 'final' }],
      },
    ],
  };
}

/** The buttons the three groups above earn, in the order an operator reaches for them. */
const MATCH_CONTROLS: TypeControlEvent[] = [
  { event: 'clockStart', label: 'Start clock', section: 'Clock', order: 1 },
  { event: 'clockStop', label: 'Stop clock', section: 'Clock', order: 2 },
  { event: 'clockReset', label: 'Reset clock', section: 'Clock', order: 3 },
  { event: 'interval', label: 'Interval', section: 'Match', order: 4 },
  { event: 'resumePlay', label: 'Resume play', section: 'Match', order: 5 },
  { event: 'final', label: 'Full time', section: 'Match', order: 6, destructive: true },
];

/**
 * The four visible lines every two-team board shares, as the type's logical fields.
 *
 * THE SCORES ARE NUMBERS, and that is a control decision rather than a typing one: a score is
 * bumped far more often than it is typed, so the field renderers give a `number` field +/−
 * steppers and an operator adds a goal with one press instead of selecting "1" and typing "2".
 * The cost is real and accepted — a number input cannot hold a composite score ("3 (4)" for a
 * shootout, "241/6" for cricket), so those belong in the period or note line, or in a design
 * that declares its own fields. The CLOCK stays a text field for the same reason inverted:
 * `matchClockUpdate` parses it on ':' and "43:12" is not a number.
 */
const TEAM_LINES: TypeField[] = [
  { key: 'teamA', label: 'Team A', kind: 'text', value: 'HOME', role: 'line' },
  { key: 'scoreA', label: 'Score A', kind: 'number', value: '0', role: 'line' },
  { key: 'teamB', label: 'Team B', kind: 'text', value: 'AWAY', role: 'line' },
  { key: 'scoreB', label: 'Score B', kind: 'number', value: '0', role: 'line' },
];

/** The two club colours. `color` is a reserved SPX field type, and a club colour is exactly
 *  the constrained choice it is reserved for (src/templates/CLAUDE.md's field policy). */
const TEAM_COLOURS: TypeField[] = [
  { key: 'colourA', label: 'Team A colour', kind: 'color', value: '#f6a623', role: 'data' },
  { key: 'colourB', label: 'Team B colour', kind: 'color', value: '#7dd3fc', role: 'data' },
];

// ── SCOREBUG — the strip that stays on air ───────────────────────────────────

/** COMPACT SCOREBUG — score, clock and period in the smallest honest strip. */
export const scorebugType: GraphicType = {
  id: 'scorebug',
  name: 'Scorebug',
  description: 'The persistent match strip: two teams, the score, the period and a running clock.',
  structure: {
    prefix: 'scoreboard',
    category: 'scoreboard',
    parts: [
      { id: 'box', selector: '.scoreboard-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.scoreboard-accent', kind: 'accent', required: true },
      { id: 'clock', selector: '.scoreboard-clock', kind: 'block', required: true },
      { id: 'teamA', selector: '#f0', kind: 'line', required: true },
      { id: 'scoreA', selector: '#f1', kind: 'line', required: true },
      { id: 'teamB', selector: '#f2', kind: 'line', required: true },
      { id: 'scoreB', selector: '#f3', kind: 'line', required: true },
      { id: 'period', selector: '#f4', kind: 'line', required: true },
    ],
  },
  fields: [
    ...TEAM_LINES,
    { key: 'period', label: 'Period', kind: 'text', value: '1H', role: 'line' },
    // The clock's VALUE is a field, not a readout: every live clock drifts from the stadium's,
    // and an operator who cannot correct the one on air stops trusting it.
    { key: 'clock', label: 'Clock', kind: 'text', value: '0:00', role: 'line' },
    ...TEAM_COLOURS,
  ],
  machine: { parallel: [matchClockGroup(), playGroup(), resultGroup()] },
  controls: MATCH_CONTROLS,
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
    defaultZone: 'top-center',
  },
  designs: [
    {
      id: 'sb05',
      name: 'House Scorebug',
      description: 'The house scorebug: colour chips, two teams, a period chip and a running clock.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => sb05.create(options),
    },
    {
      id: 'sb06',
      name: 'Volt Scorebug',
      description: 'A hard sport slab bug: colour bars behind team codes, scores, and a shot-style countdown.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: { teamA: 'LAL', scoreA: '88', teamB: 'BOS', scoreB: '84', period: 'Q4', clock: '12:00' },
      animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      defaultZone: 'top-left',
      create: (_type, options) => sb06.create(options),
    },
    {
      id: 'sb07',
      name: 'Frost Scorebug',
      description: 'A frosted scorebug pill: soft colour dots, a centred score pair, period and clock.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: { teamA: 'Sweden', scoreA: '24', teamB: 'Denmark', scoreB: '26', period: '2H', clock: '30:00' },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb07.create(options),
    },
    {
      id: 'sb08',
      name: 'Club Scorebug',
      description: 'The amateur club bug: full team names, a hairline stack, and a count-up clock.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: {
        teamA: 'Ashton United', scoreA: '1', teamB: 'Marske Town', scoreB: '1',
        period: '2nd half', clock: '58:00',
      },
      animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      defaultZone: 'top-left',
      create: (_type, options) => sb08.create(options),
    },
    {
      id: 'sb23',
      name: 'Wire Bug',
      description: 'A flat wire-service bug: club-colour name cells, paper score cells, an ink clock.',
      styleTag: 'editorial',
      palette: paletteById('broadsheet'),
      fontId: 'archivo',
      samples: {
        teamA: 'ARC', scoreA: '2', teamB: 'YLE', scoreB: '1', period: '2ND', clock: '67:14',
        colourA: '#12409f', colourB: '#6b2fa0',
      },
      animationPresets: ['mask-wipe', 'line-reveal', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      defaultZone: 'top-left',
      create: (_type, options) => sb23.create(options),
    },
    {
      id: 'sb24',
      name: 'Arena Board',
      description: 'The venue board: leaning club plates with lit score wells around a period-over-clock column.',
      styleTag: 'sport',
      palette: paletteById('inferno'),
      fontId: 'oswald',
      samples: {
        teamA: 'HOME', scoreA: '87', teamB: 'GUEST', scoreB: '82',
        period: 'PERIOD 4', clock: '03:14', colourA: '#1c4fd8', colourB: '#c8202e',
      },
      animationPresets: ['pop-spring', 'snap-stinger', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      defaultZone: 'top-center',
      create: (_type, options) => sb24.create(options),
    },
  ],
};

// ── MATCH BOARD — the full scoreboard ────────────────────────────────────────

/** FULL MATCH BOARD — the scorebug plus crests, club colours and the period breakdown. */
export const matchBoardType: GraphicType = {
  id: 'match-board',
  name: 'Match board',
  description: 'The full scoreboard: crests, club names, the score, the clock and a period breakdown.',
  structure: {
    prefix: 'scoreboard',
    category: 'scoreboard',
    parts: [
      { id: 'box', selector: '.scoreboard-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.scoreboard-accent', kind: 'accent', required: true },
      { id: 'clock', selector: '.scoreboard-clock', kind: 'block', required: true },
      { id: 'periods', selector: '#scoreboard-periods', kind: 'block', required: true },
      { id: 'teamA', selector: '#f0', kind: 'line', required: true },
      { id: 'scoreA', selector: '#f1', kind: 'line', required: true },
      { id: 'teamB', selector: '#f2', kind: 'line', required: true },
      { id: 'scoreB', selector: '#f3', kind: 'line', required: true },
    ],
  },
  fields: [
    ...TEAM_LINES,
    { key: 'period', label: 'Period', kind: 'text', value: '1H', role: 'line' },
    { key: 'clock', label: 'Clock', kind: 'text', value: '0:00', role: 'line' },
    // THE REPEATING FIELD. Quarters, periods, sets and rounds are one shape — "label | home |
    // away" — so one board serves basketball, ice hockey and tennis, and the sport is what the
    // operator types rather than which template they picked.
    { key: 'periods', label: 'Period breakdown', kind: 'lines', value: 'Q1 | 0 | 0', role: 'data' },
    ...TEAM_COLOURS,
    // Two image slots, so `role: 'logo'` (which is single, and drives applyLogoSlot) is the
    // wrong tool: these are ordinary image DATA the design places itself.
    { key: 'logoA', label: 'Team A logo', kind: 'image', value: '', role: 'data' },
    { key: 'logoB', label: 'Team B logo', kind: 'image', value: '', role: 'data' },
  ],
  machine: { parallel: [matchClockGroup(), playGroup(), resultGroup()] },
  controls: MATCH_CONTROLS,
  capabilities: {
    maxLines: 1,
    logo: 'built-in',
    animationPresets: ['slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'sb09',
      name: 'House Match Board',
      description: 'The house match board: crests, club names, the score pair, clock and period breakdown.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      samples: {
        scoreA: '88', scoreB: '84', period: 'Q4', clock: '10:00',
        periods: 'Q1 | 24 | 19\nQ2 | 22 | 25\nQ3 | 30 | 21\nQ4 | 12 | 19',
      },
      create: (_type, options) => sb09.create(options),
    },
    {
      id: 'sb10',
      name: 'Volt Match Board',
      description: 'A stadium slab board: club-colour bands, big crests, a huge score pair, period cells.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: {
        teamA: 'RANGERS', scoreA: '4', teamB: 'BRUINS', scoreB: '3',
        period: '3RD PERIOD', clock: '20:00', periods: 'P1 | 1 | 0\nP2 | 1 | 2\nP3 | 2 | 1',
      },
      animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb10.create(options),
    },
    {
      id: 'sb11',
      name: 'Frost Match Board',
      description: 'A frosted card board: competitors stacked as rows, set columns, and a match clock.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: {
        teamA: 'Świątek', scoreA: '2', teamB: 'Sabalenka', scoreB: '1',
        period: 'Set 3 · 5-5', clock: '2:14', periods: 'SET 1 | 6 | 4\nSET 2 | 3 | 6\nSET 3 | 7 | 5',
      },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb11.create(options),
    },
    {
      id: 'sb12',
      name: 'Club Match Board',
      description: 'The amateur full-time board: full club names, a flat panel, halves along the bottom.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: {
        teamA: 'Ashton United', scoreA: '2', teamB: 'Marske Town', scoreB: '2',
        period: 'Full time', clock: '90:00', periods: '1st half | 1 | 0\n2nd half | 1 | 2',
      },
      animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb12.create(options),
    },
    {
      id: 'sb25',
      name: 'Court Board',
      description: 'A corner board: club plates stacked with fused score cells, a chamfered clock module.',
      styleTag: 'sport',
      palette: paletteById('inferno'),
      fontId: 'oswald',
      samples: {
        teamA: 'TIGERS', scoreA: '98', teamB: 'FALCONS', scoreB: '101',
        period: 'Q4', clock: '01:32',
        periods: 'FOULS | 4 | 2\nTIMEOUTS | 2 | 3\nBONUS | YES | NO',
        colourA: '#d4470f', colourB: '#12409f',
      },
      animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      defaultZone: 'top-left',
      create: (_type, options) => sb25.create(options),
    },
  ],
};

// ── MATCH STATUS — where the match stands, and the final score ───────────────

/**
 * MATCH STATUS / FINAL SCORE — one card for live, the interval and the result.
 *
 * This type's whole point is that the status TEXT and the status STATE are different things.
 * The operator writes what the card says ("HALF TIME", "ABANDONED — WATERLOGGED", "AET"); the
 * machine holds whether it is live, held or finished. Typing "FULL TIME" cannot end a match,
 * and ending a match cannot overwrite an explanation the operator wrote — which is exactly the
 * separation that lets one graphic serve three moments instead of three graphics serving one
 * each.
 *
 * Three states in ONE group here, unlike the boards above, because these three genuinely are
 * mutually exclusive: a card cannot be at half time and finished at once.
 */
export const matchStatusType: GraphicType = {
  id: 'match-status',
  name: 'Match status',
  description: 'Where the match stands — live, at the interval, or the final score.',
  structure: {
    prefix: 'scoreboard',
    category: 'scoreboard',
    parts: [
      { id: 'box', selector: '.scoreboard-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.scoreboard-accent', kind: 'accent', required: true },
      { id: 'pip', selector: '.scoreboard-pip', kind: 'block', required: true },
      { id: 'teamA', selector: '#f0', kind: 'line', required: true },
      { id: 'scoreA', selector: '#f1', kind: 'line', required: true },
      { id: 'teamB', selector: '#f2', kind: 'line', required: true },
      { id: 'scoreB', selector: '#f3', kind: 'line', required: true },
      { id: 'status', selector: '#f4', kind: 'line', required: true },
    ],
  },
  fields: [
    ...TEAM_LINES,
    { key: 'status', label: 'Status', kind: 'text', value: 'HALF TIME', role: 'line' },
    { key: 'note', label: 'Note', kind: 'text', value: 'Matchday 24', role: 'line' },
    ...TEAM_COLOURS,
  ],
  machine: {
    parallel: [
      {
        id: 'status',
        initial: 'live',
        states: [
          {
            id: 'live',
            name: 'Live',
            timeline: {
              name: 'Back to live',
              duration: 0.25,
              ease: 'in',
              calls: [{ time: 0, call: 'markLive' }],
              layers: { pip: { opacity: [{ time: 0, value: 0.4 }, { time: 0.25, value: 1 }] } },
            },
            edges: [{ from: 'interval', to: 'live', trigger: 'operator', event: 'resumePlay' }],
          },
          {
            id: 'interval',
            name: 'Interval',
            timeline: {
              name: 'Interval',
              duration: 0.25,
              ease: 'out',
              calls: [{ time: 0, call: 'markBreak' }],
              layers: { pip: { opacity: [{ time: 0, value: 1 }, { time: 0.25, value: 0.55 }] } },
            },
            edges: [{ from: 'live', to: 'interval', trigger: 'operator', event: 'interval' }],
          },
          {
            id: 'final',
            name: 'Full time',
            timeline: {
              name: 'Full time',
              duration: 0.4,
              ease: 'in',
              calls: [{ time: 0, call: 'markFinal' }],
              layers: { box: { scale: [{ time: 0, value: 1 }, { time: 0.2, value: 1.03 }, { time: 0.4, value: 1 }] } },
            },
            // Reachable from live OR from the interval: a match can be abandoned at half time,
            // and the card that says so is this one.
            edges: [
              { from: 'live', to: 'final', trigger: 'operator', event: 'final' },
              { from: 'interval', to: 'final', trigger: 'operator', event: 'final' },
            ],
          },
        ],
      },
    ],
  },
  controls: [
    { event: 'interval', label: 'Interval', section: 'Match', order: 1 },
    { event: 'resumePlay', label: 'Back to live', section: 'Match', order: 2 },
    { event: 'final', label: 'Full time', section: 'Match', order: 3, destructive: true },
  ],
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'sb13',
      name: 'House Status Card',
      description: 'The house status card: a live pip, the status line, the score pair, and a note.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      samples: { scoreA: '1', note: 'Emirates Stadium · Matchday 24' },
      create: (_type, options) => sb13.create(options),
    },
    {
      id: 'sb14',
      name: 'Volt Status Card',
      description: 'A sport result slate: a solid accent status banner over the clubs and a huge score.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: {
        teamA: 'ARSENAL', scoreA: '3', teamB: 'CHELSEA', scoreB: '1',
        status: 'FULL TIME', note: 'PREMIER LEAGUE · MATCHDAY 24',
      },
      animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb14.create(options),
    },
    {
      id: 'sb15',
      name: 'Frost Status Card',
      description: 'A frosted result card: a status pill, competitors stacked with scores, and a note.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: {
        teamA: 'Adesanya', scoreA: '48', teamB: 'Pereira', scoreB: '47',
        status: 'DECISION', note: 'Middleweight title · 5 rounds',
      },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb15.create(options),
    },
    {
      id: 'sb16',
      name: 'Club Status Card',
      description: 'The amateur result card: a hairline status row, full club names, and the score.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: {
        teamA: 'Ashton United', scoreA: '2', teamB: 'Marske Town', scoreB: '2',
        status: 'Full time', note: 'Northern League Division One',
      },
      animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb16.create(options),
    },
  ],
};

// ── MATCH EVENT — the transient card ─────────────────────────────────────────

/**
 * MATCH EVENT — a substitution, a booking, a penalty, a goal.
 *
 * The only type in the pack whose interesting state is ON the default path, and the pack's one
 * timer transition. An event card is transient by nature, so it CLEARS ITSELF: seven seconds
 * after it settles, the machine walks it into the exit. That is not a convenience — a card
 * left on air through the next passage of play is the single most common live-graphics
 * mistake, and the fix belongs in the graphic rather than in the operator's memory.
 *
 * Two escapes from the timer, because both are real:
 *   - `next` clears it EARLY (the replay is coming, get it off now);
 *   - `hold` moves it to a pose-only branch with no timer, so a red card can stay up until the
 *     operator decides otherwise. Entering `held` plays nothing, which is the point: holding a
 *     card must not re-animate it.
 *
 * The trap this design had to respect (docs/GRAPHIC_TYPES.md §4): a timer is armed by a call
 * scheduled at the end of the FROM state's entry timeline, so a state whose timeline never ends
 * never arms one. The entrance here is an ordinary preset with a finite length, so it does.
 */
export const matchEventType: GraphicType = {
  id: 'match-event',
  name: 'Match event',
  description: 'The transient card: a substitution, a booking, a penalty or a goal, with its minute.',
  structure: {
    prefix: 'scoreboard',
    category: 'scoreboard',
    parts: [
      { id: 'box', selector: '.scoreboard-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.scoreboard-accent', kind: 'accent', required: true },
      { id: 'event', selector: '#f0', kind: 'line', required: true },
      { id: 'minute', selector: '#f1', kind: 'line', required: true },
      { id: 'club', selector: '#f2', kind: 'line', required: true },
      { id: 'detail', selector: '#f3', kind: 'line', required: true },
      { id: 'player', selector: '#f4', kind: 'line', required: true },
    ],
  },
  fields: [
    { key: 'event', label: 'Event', kind: 'text', value: 'SUBSTITUTION', role: 'line' },
    { key: 'minute', label: 'Minute', kind: 'text', value: "67'", role: 'line' },
    { key: 'team', label: 'Team', kind: 'text', value: 'HOME', role: 'line' },
    { key: 'detail', label: 'Out / detail', kind: 'text', value: 'M. ØDEGAARD', role: 'line' },
    { key: 'player', label: 'In / player', kind: 'text', value: 'K. HAVERTZ', role: 'line' },
    { key: 'colour', label: 'Team colour', kind: 'color', value: '#f6a623', role: 'data' },
  ],
  machine: {
    main: {
      // `next` takes the card off air, which is the SPX Continue an operator already has.
      exitOnNext: true,
      // THE AUTO-CLEAR. Seven speed-relative seconds after the entrance settles, the card walks
      // itself into the exit. A card left up through the next passage of play is the commonest
      // live-graphics mistake there is, and the fix belongs in the graphic, not in a memory.
      edges: [{ from: { waypoint: -2 }, to: { waypoint: -1 }, trigger: 'timer', after: 7 }],
      branches: [
        {
          id: 'held',
          name: 'Held on air',
          // Pose-only: holding a card must not replay its entrance. Entering this state does
          // nothing except take the graphic out of reach of the auto-clear timer.
          timeline: null,
          edges: [
            { from: { waypoint: -2 }, to: 'held', trigger: 'operator', event: 'hold' },
            { from: 'held', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
    parallel: [],
  },
  controls: [
    { event: 'hold', label: 'Hold on air', section: 'Card', order: 1 },
    { event: 'next', label: 'Clear card', section: 'Card', order: 2 },
  ],
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'sb17',
      name: 'House Event Card',
      description: 'The house event card: substitutions, bookings and penalties, with a minute stamp.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      samples: { team: 'ARSENAL' },
      create: (_type, options) => sb17.create(options),
    },
    {
      id: 'sb18',
      name: 'Volt Event Card',
      description: 'A sport event strap: a colour minute block, an accent kind bar, and the two facts.',
      styleTag: 'sport',
      palette: paletteById('inferno'),
      fontId: 'oswald',
      samples: {
        event: 'PENALTY', minute: "34'", team: 'TAMPA BAY',
        detail: 'TRIPPING · 2 MIN', player: 'V. HEDMAN',
      },
      animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb18.create(options),
    },
    {
      id: 'sb19',
      name: 'Frost Event Card',
      description: 'A frosted event card: a minute chip, a tracked event label, and the two facts.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      samples: {
        minute: "72'", team: 'Norway', detail: 'S. Solberg', player: 'H. Reistad',
      },
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb19.create(options),
    },
    {
      id: 'sb20',
      name: 'Club Event Card',
      description: 'The amateur event card: minute, event and club on one row, the two names below.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      samples: {
        event: 'Substitution', minute: "58'", team: 'Ashton United',
        detail: 'Dan Whitehead', player: 'Joe Ferguson',
      },
      animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb20.create(options),
    },
  ],
};
