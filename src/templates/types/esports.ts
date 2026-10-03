// The ESPORTS types — the two graphics that live on screen while a match runs.
//
// SERIES SCOREBUG. The scoreboard type's argument, applied to a tournament match: the scores
// are DATA (typing 2 into "Score A" repaints a number and moves no pointer), and the things
// that genuinely have states get one small group each. There are two:
//
//   phase  pre-match -> live -> final -> live again for the next map of the series.
//   pause  running / paused, the technical pause.
//
// Two groups of 3 and 2 states, never one group of 6. A pause during the pre-match show and a
// pause at match point are the same pause; the phase is not part of what it means.
//
// MAP / ROUND INDICATOR. The series card. Which map is being played is a CURSOR — a number the
// operator advances — so it is data too, and the machine's job is only to say that the cursor
// MOVED (an event carrying the new number, so the change is atomic) and that the series is
// decided. That is one branch each, off a two-step walk.

import { paletteById } from '../../model/wizard';
import { es01 } from '../competition/esports/es01';
import { es02 } from '../competition/esports/es02';
import { es03 } from '../competition/esports/es03';
import { es04 } from '../competition/esports/es04';
import { mr01 } from '../competition/esports/mr01';
import { mr02 } from '../competition/esports/mr02';
import { mr03 } from '../competition/esports/mr03';
import { mr04 } from '../competition/esports/mr04';
import { mr05 } from '../competition/esports/mr05';
import { MAP_FIELDS, SCORE_FIELDS } from '../competition/esports/shared';
import type { GraphicType } from './graphicType';

export const esportsScoreType: GraphicType = {
  id: 'esports-score',
  name: 'Esports scorebug',
  description: 'The match strip: two teams, the map score, the series pips, and the match phase.',
  structure: {
    prefix: 'esports-score',
    category: 'esports-score',
    parts: [
      { id: 'box', selector: '.esports-score-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.esports-score-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.esports-score-head', kind: 'block', required: true },
      { id: 'body', selector: '.esports-score-body', kind: 'block', required: true },
      { id: 'teamA', selector: '#f0', kind: 'line', required: true },
      { id: 'scoreA', selector: '#f1', kind: 'line', required: true },
      { id: 'teamB', selector: '#f2', kind: 'line', required: true },
      { id: 'scoreB', selector: '#f3', kind: 'line', required: true },
    ],
  },
  fields: SCORE_FIELDS,
  machine: {
    parallel: [
      // THE PHASE. A match runs pre-match -> live -> final; a series then starts the next map,
      // which is the arrow back from final to live. There is deliberately no arrow back to
      // pre-match: that is what play() does, and reset is not an operator event.
      {
        id: 'phase',
        initial: 'pre',
        states: [
          {
            id: 'pre',
            name: 'Pre-match',
            // Pose-only: the pre-match look is what the graphic comes on air wearing, and
            // play()'s mark clearing is what restores it. Nothing to animate on entry.
            timeline: null,
            edges: [],
          },
          {
            id: 'live',
            name: 'Live',
            timeline: {
              name: 'Go live',
              duration: 0.35,
              ease: 'in',
              calls: [{ time: 0, call: 'markLive' }],
              layers: {},
            },
            edges: [
              { from: 'pre', to: 'live', trigger: 'operator', event: 'goLive' },
              // The next map of the series: from a decided map straight back to live.
              { from: 'final', to: 'live', trigger: 'operator', event: 'nextMap' },
            ],
          },
          {
            id: 'final',
            name: 'Final',
            timeline: {
              name: 'Full time',
              duration: 0.4,
              ease: 'in',
              calls: [{ time: 0, call: 'markFinal' }],
              layers: {},
            },
            edges: [{ from: 'live', to: 'final', trigger: 'operator', event: 'final' }],
          },
        ],
      },
      // THE PAUSE. Its own group, because a technical pause can happen in any phase and must
      // not multiply the phase states.
      {
        id: 'pause',
        initial: 'running',
        states: [
          {
            id: 'running',
            name: 'Running',
            timeline: {
              name: 'Resume',
              duration: 0.25,
              ease: 'in',
              calls: [{ time: 0, call: 'markRunning' }],
              layers: {},
            },
            edges: [{ from: 'paused', to: 'running', trigger: 'operator', event: 'resume' }],
          },
          {
            id: 'paused',
            name: 'Paused',
            timeline: {
              name: 'Technical pause',
              duration: 0.25,
              ease: 'in',
              calls: [{ time: 0, call: 'markPaused' }],
              layers: {},
            },
            edges: [{ from: 'running', to: 'paused', trigger: 'operator', event: 'pause' }],
          },
        ],
      },
    ],
  },
  controls: [
    { event: 'goLive', label: 'Go live', section: 'Match', order: 1 },
    { event: 'final', label: 'Map final', section: 'Match', order: 2 },
    { event: 'nextMap', label: 'Next map', section: 'Match', order: 3 },
    { event: 'pause', label: 'Technical pause', section: 'Break', order: 4 },
    { event: 'resume', label: 'Resume', section: 'Break', order: 5 },
  ],
  capabilities: {
    maxLines: 5,
    logo: 'none',
    animationPresets: ['comp-impact', 'comp-rise', 'comp-bloom'],
    defaultZone: 'top-center',
  },
  designs: [
    {
      id: 'es01',
      name: 'Series Scorebug',
      description: 'The match-night strip: logos, big map scores, and a series pip row.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => es01.create(options),
    },
    {
      id: 'es02',
      name: 'House Series',
      description: 'The house scorebug: void panel, amber edge, amber map scores and series pips.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      // The house strip rises into its corner; it is not a sport slam.
      animationPresets: ['comp-rise', 'comp-impact', 'comp-bloom'],
      create: (_type, options) => es02.create(options),
    },
    {
      id: 'es03',
      name: 'Frost Series',
      description: 'A frosted match strip: glass score chips, a soft accent rule, series pips.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
      create: (_type, options) => es03.create(options),
    },
    {
      id: 'es04',
      name: 'Clean Series',
      description: 'A panel-free match strip: two names, a divider, and a quiet phase line.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
      // A panel-free strip is drawn against the frame's top-left corner, not centred.
      defaultZone: 'top-left',
      create: (_type, options) => es04.create(options),
    },
  ],
};

export const mapRoundType: GraphicType = {
  id: 'map-round',
  name: 'Map / round / veto indicator',
  description: 'A map sequence with an operator-controlled current row and a completed state.',
  structure: {
    prefix: 'esports-score',
    category: 'esports-score',
    parts: [
      { id: 'box', selector: '.esports-score-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.esports-score-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.esports-score-head', kind: 'block', required: true },
      { id: 'rows', selector: '.esports-score-body', kind: 'block', required: true },
      { id: 'title', selector: '#f0', kind: 'line', required: true },
    ],
  },
  fields: MAP_FIELDS,
  machine: {
    main: {
      branches: [
        // THE CURSOR MOVE. Which map is live is a number, not a state — so this is ONE state
        // that repaints from the data, re-entered every time the operator advances. The new
        // number rides in as the event's payload, which is what makes "advance to map 4" a
        // single atomic change instead of a data write the graphic might animate ahead of.
        {
          id: 'advanced',
          name: 'Map advanced',
          timeline: {
            name: 'Advance',
            duration: 0.35,
            ease: 'in',
            calls: [{ time: 0, call: 'applyMapCursor' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'advanced', trigger: 'operator', event: 'advance' },
            // Advancing again from the same state — a self-transition replays the effect,
            // which is why "map 4, then map 5" needs no second state.
            { from: 'advanced', to: 'advanced', trigger: 'operator', event: 'advance' },
          ],
        },
        // THE SERIES RESULT. One way only: a series does not un-finish. Reachable from both
        // the opening state and mid-series, because either is where the last map ends.
        {
          id: 'decided',
          name: 'Series decided',
          timeline: {
            name: 'Series final',
            duration: 0.4,
            ease: 'in',
            calls: [{ time: 0, call: 'markSeriesFinal' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'decided', trigger: 'operator', event: 'seriesFinal' },
            { from: 'advanced', to: 'decided', trigger: 'operator', event: 'seriesFinal' },
            // The rejoin: an operator who decided the series can still press Next to take
            // the card off along the default path.
            { from: 'decided', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'advance', label: 'Advance', section: 'Map sequence', order: 1, payload: ['current'] },
    { event: 'seriesFinal', label: 'Complete', section: 'Map sequence', order: 2 },
  ],
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-impact'],
    defaultZone: 'mid-right',
  },
  designs: [
    {
      id: 'mr01',
      name: 'Map Ladder',
      description: 'The series as a ladder: every map, who took it, and where play is now.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => mr01.create(options),
    },
    {
      id: 'mr02',
      name: 'House Maps',
      description: 'The house map card: void rows, mono numbers, an amber cursor on the live map.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      create: (_type, options) => mr02.create(options),
    },
    {
      id: 'mr03',
      name: 'Round Strip',
      description: 'The series as a row of game chips — for the top of the frame during play.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      // A strip of game chips belongs across the top of the frame, not down its side.
      defaultZone: 'top-center',
      create: (_type, options) => mr03.create(options),
    },
    {
      id: 'mr05',
      name: 'Clean Maps',
      description: 'A panel-free map ladder with hairline rows and a quiet live-map cursor.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
      create: (_type, options) => mr05.create(options),
    },
    {
      id: 'mr04',
      name: 'Map Veto',
      description: 'A pick-and-ban ladder with the current decision moved atomically by the operator.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: {
        title: 'MAP VETO - GRAND FINAL',
        maps: 'ANCIENT | BAN A\nDUST II | BAN B\nMIRAGE | PICK A\nNUKE | PICK B\nINFERNO | -',
        current: '5',
        teamA: 'TEAM LIQUID',
        teamB: 'NATUS VINCERE',
      },
      semantics:
        'The cursor, completion state, field ordering and operator flow are the map-round ' +
        'structure. Only each row\'s editable status changes from a played-map winner to a ' +
        'draft action.',
      create: (_type, options) => mr04.create(options),
    },
  ],
};
