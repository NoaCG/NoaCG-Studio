// LIVE VOTE — the type that has to hold a vote OPEN, and then close it.
//
// The reference data already has a `poll` type (dataBoards.ts): a finished result chart, one
// look, no arc. This is the other half of the same subject — the vote while it is happening —
// and the difference is entirely in the states:
//
//     voting ──(timer: the window runs out)──▶ closed ──▶ result ──▶ called
//        │      ──(operator: "Close voting")──▶            ▲
//        └──────────────── next / "Show result" ───────────┘
//
// TWO WAYS TO CLOSE, and that is the point. The window is a real `timer` transition — a
// `gsap.delayedCall` armed by the interpreter when the entrance timeline settles, so the bench's
// timeScale and the render pipeline's virtual clock drive it for free, and a scrubbed or settled
// board never arms one and so can never close the vote under the operator. The manual "Close
// voting" button is the same arrow drawn by hand, because on air the presenter's "that's it,
// voting is closed" is what actually ends a vote; the window is the safety net behind it.
//
// KNOWN LIMIT, stated rather than hidden: the window's length is AUTHORED data on the arrow
// (editable in the node editor, or in the JSON), not a field the operator sets per play. Timer
// transitions carry a fixed `after`, and inventing a second, field-driven clock that could
// disagree with it would be worse than saying so. Shows that need a per-play window close by
// hand — which is the button above, and the commoner workflow anyway.
//
// The WINNER is a call, not a keyframe, for the same reason the quiz's answer reveal is: which
// row wins depends on the counts the operator typed, so it has no fixed target. Everything else
// the board does — the badge leaving, the figures arriving, the bars growing — stays in
// keyframes and measured builders, which is what makes a snap straight to the result show the
// result (docs/STATE_MACHINE_SCHEMA.md §3, "Snap").

import { paletteById } from '../../model/wizard';
import { pl01 } from '../poll/pl01';
import { pl02 } from '../poll/pl02';
import { pl03 } from '../poll/pl03';
import { pl04 } from '../poll/pl04';
import { pl05, PL05_SAMPLES } from '../poll/pl05';
import { POLL_CONTENT } from '../poll/shared';
import type { GraphicType, TypeControlEvent, TypeMachine } from './graphicType';

/** The voting window, in speed-relative seconds: how long the board holds the vote open before
 *  closing it by itself. Short enough that a preview shows the whole arc without a wait, and
 *  the one number to change when a show wants a longer window. */
const VOTING_WINDOW = 20;

/**
 * THE LIVE VOTE'S ARC, exported so imported artwork can walk it too
 * (docs/GRAPHIC_BEHAVIOUR_PLAN.md §12). A student's own poll board is the same graphic drawn by
 * somebody else: the vote is open, it closes, the figures land, a winner is called. Sharing the
 * declaration rather than restating it is the same move the answer board's machine made for the
 * quiz pilot, and it has the same payoff — a binding that needs a different arc FILTERS this one
 * (the imported board drops the automatic window below), so the two can never drift.
 */
export const LIVE_POLL_MACHINE: TypeMachine = {
  main: {
    // The walk is board -> result -> out, so `next` alone still runs the whole thing: a vote
    // dropped into any playout server without a control page degrades to "show the options,
    // show the result, take it off" and nothing breaks.
    pathEvents: ['result'],
    branches: [
      {
        id: 'closed',
        name: 'Voting closed',
        // Closing the vote takes the badge away and nothing else — the figures are still the
        // result's job. Real keyframes, so a snap into this state lands the same pose.
        timeline: {
          name: 'Close voting',
          duration: 0.35,
          ease: 'out',
          layers: {
            cue: {
              opacity: [{ time: 0, value: 1 }, { time: 0.35, value: 0 }],
              y: [{ time: 0, value: 0 }, { time: 0.35, value: -10 }],
            },
          },
        },
        edges: [
          // The window: armed when the entrance settles, and cancelled the moment the
          // operator leaves the state by any other arrow.
          { from: { waypoint: 0 }, to: 'closed', trigger: 'timer', after: VOTING_WINDOW },
          // The presenter's own "that's it" — the same arrow, drawn by hand.
          { from: { waypoint: 0 }, to: 'closed', trigger: 'operator', event: 'close' },
          { from: 'closed', to: { waypoint: 1 }, trigger: 'operator', event: 'result' },
          // And the rejoin, so an operator who closed the vote can still just press Next.
          { from: 'closed', to: { waypoint: 1 }, trigger: 'operator', event: 'next' },
        ],
      },
      {
        id: 'called',
        name: 'Winner called',
        timeline: {
          name: 'Call winner',
          duration: 0.45,
          ease: 'in',
          calls: [{ time: 0, call: 'pollCallWinner' }],
          layers: {},
        },
        // Only from the result: calling a winner off a board that has not shown its figures
        // would be a projection with nothing on screen to back it. Structural, as always —
        // there is simply no arrow from anywhere else.
        edges: [{ from: { waypoint: 1 }, to: 'called', trigger: 'operator', event: 'call' }],
      },
    ],
  },
};

/** The live vote's buttons, exported for the same reason the machine is. `compileControls`
 *  drops a control whose event no arrow carries, so a filtered machine needs no second list. */
export const LIVE_POLL_CONTROLS: TypeControlEvent[] = [
  { event: 'close', label: 'Close voting', section: 'Vote', order: 1 },
  { event: 'result', label: 'Show result', section: 'Vote', order: 2 },
  { event: 'call', label: 'Call the winner', section: 'Vote', order: 3 },
];

export const livePollType: GraphicType = {
  id: 'live-poll',
  name: 'Live vote',
  description: 'A question, the options an audience is voting on, and the moment the vote closes.',
  structure: {
    prefix: 'poll',
    category: 'poll',
    parts: [
      { id: 'box', selector: '.poll-box', kind: 'panel', required: true },
      { id: 'question', selector: '#f0', kind: 'line', required: true },
      { id: 'cue', selector: '.poll-cue', kind: 'block', required: true },
      { id: 'rows', selector: '#poll-rows', kind: 'block', required: true },
    ],
  },
  fields: [
    { key: 'question', label: 'Question', kind: 'text', value: POLL_CONTENT.question, role: 'line' },
    // The options are the CONTENT, held in a hidden source the runtime renders from — one
    // "Label | count" per line. `lines` maps to an SPX textarea and to the control page's
    // multi-line editor, so an operator retypes the running counts in one box.
    { key: 'options', label: 'Options', kind: 'lines', value: POLL_CONTENT.options, role: 'line' },
    { key: 'footnote', label: 'Vote count', kind: 'text', value: POLL_CONTENT.footnote, role: 'line' },
    // The badge's words. The board's STATE says voting is open; what the badge prints while
    // it is open belongs to the broadcaster — an SMS poll says "TEXT TO VOTE", a room count
    // says "HANDS UP", and neither is English everywhere. Only the badge LEAVING is
    // choreography (a keyframe on .poll-cue), and that is untouched by the wording.
    { key: 'cue', label: 'Vote badge', kind: 'text', value: POLL_CONTENT.cue, role: 'line' },
  ],
  machine: LIVE_POLL_MACHINE,
  controls: LIVE_POLL_CONTROLS,
  capabilities: {
    maxLines: 4,
    logo: 'none',
    // Only the one preset: the board's other three moments are state timelines, and a preset
    // that re-choreographed the entrance would still leave them exactly as they are.
    animationPresets: ['poll-open'],
    defaultZone: 'mid-left',
  },
  designs: [
    {
      id: 'pl01',
      name: 'House Vote',
      description: 'The house live-vote board: a void panel, amber edge, a VOTE NOW badge and growing amber bars.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => pl01.create(options),
    },
    {
      id: 'pl02',
      name: 'Volt Vote',
      description: 'A results-night slab: condensed caps options, square accent bars, a called winner.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      samples: {
        question: 'WHO TAKES THE FINAL?',
        options: 'NORTH SIDE | 2140\nSOUTH SIDE | 1780',
        footnote: '3,920 VOTES · 74% REPORTING',
      },
      create: (_type, options) => pl02.create(options),
    },
    {
      id: 'pl03',
      name: 'Frost Vote',
      description: 'A frosted live-vote board: a soft VOTE NOW pill over rounded glass bars.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      create: (_type, options) => pl03.create(options),
    },
    {
      id: 'pl04',
      name: 'Clean Vote',
      description: 'A quiet live-vote board: an accent VOTE NOW label, a keyline, and slim growing bars.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      create: (_type, options) => pl04.create(options),
    },
    {
      // The fifth board is not a fifth LOOK - the four family cells above are full. It is the
      // one that is not a card: a wide band at the foot of frame with the options running
      // horizontally, so a vote can sit under the action instead of beside it. Declared `noacg`
      // and listed LAST on purpose - `resolvePack` takes the first design of a family, so the
      // house kit still resolves to pl01 and this one is reached through Browse.
      id: 'pl05',
      name: 'Floor Vote',
      description: 'The live vote as a wide band: the ask on the left, the options running across on the right.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'inter',
      samples: PL05_SAMPLES,
      // Drawn for the foot of frame; the other four are mid-left cards.
      defaultZone: 'bottom-center',
      create: (_type, options) => pl05.create(options),
    },
  ],
};
