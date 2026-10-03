// SCOREBOARD — the type that proves the model's hardest claim, so it is worth reading as an
// argument rather than a config file.
//
// A scorebug is where a naive state machine explodes. Score, clock, possession, flag, period,
// and result are all "state" in the everyday sense, and one machine holding every combination
// of them would need hundreds of states. The model's answer is two rules working together:
//
//   1. DATA IS NOT STATE. The scores are fields. Changing one repaints a number and moves no
//      pointer anywhere — the design's own update() pops the digit, exactly as before. Nothing
//      here declares a state for "home team leads".
//   2. INDEPENDENT THINGS GET INDEPENDENT GROUPS. A flag is up or it is not; a clock runs or
//      it is held; a result is live or it is final. Three small graphs, three pointers, no
//      combinatorics — 2 + 2 + 2 states instead of 8.
//
// The main group carries no authored transitions at all: a scoreboard has no reveal sequence,
// it just comes on air and stays. Everything interesting is beside the default path, which is
// the shape the goals document's scorebug test describes.
//
// A GOAL IS AN EVENT THAT ALSO MOVES A NUMBER (owner, 2026-08-23, said twice while running a
// match: "no reason to play the goal animation if the number doesn't change"). Rule 1 still
// holds - the score is data and the flag group has no state for "home leads" - but the +1 must
// ride the SAME press as the flag, never arrive as a second update the operator has to
// remember. The control's `adjust` carries it: the surface sends the event with that side's
// score moved by one as its payload, so the machine applies the new figure exactly when it
// accepts the flag (and drops both if it does not), the command log holds the absolute score
// for recovery, and the operator's field box reads the new value the moment the flag goes up.
// Nothing in the template counts; a snap into "Flag" replays a pose and bumps nothing.

import { paletteById } from '../../model/wizard';
import { sb01 } from '../scoreboards/sb01';
import { sb02 } from '../scoreboards/sb02';
import { sb03 } from '../scoreboards/sb03';
import { sb04 } from '../scoreboards/sb04';
import type { GraphicType } from './graphicType';

export const scoreboardType: GraphicType = {
  id: 'scoreboard',
  name: 'Scoreboard',
  description: 'The score strip: teams and scores, a goal press that raises the flag and moves the score, and a full-time call.',
  frequency: 5,
  structure: {
    prefix: 'scoreboard',
    category: 'scoreboard',
    parts: [
      { id: 'box', selector: '.scoreboard-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.scoreboard-accent', kind: 'accent', required: true },
      { id: 'teamA', selector: '#f0', kind: 'line', required: true },
      { id: 'scoreA', selector: '#f1', kind: 'line', required: true },
      { id: 'teamB', selector: '#f2', kind: 'line', required: true },
      { id: 'scoreB', selector: '#f3', kind: 'line', required: true },
    ],
  },
  // Every one of these is DATA. None of them is a state, and none of them causes a transition:
  // an operator typing a new score changes a number on air and nothing else moves.
  fields: [
    { key: 'teamA', label: 'Team A', kind: 'text', value: 'HOME', role: 'line' },
    { key: 'scoreA', label: 'Score A', kind: 'number', value: '0', role: 'line' },
    { key: 'teamB', label: 'Team B', kind: 'text', value: 'AWAY', role: 'line' },
    { key: 'scoreB', label: 'Score B', kind: 'number', value: '0', role: 'line' },
  ],
  machine: {
    parallel: [
      // The FLAG: the goal marker. A goal on either side raises it (and the control's `adjust`
      // moves that side's score with the same press); `clearFlag` takes it down. Two states,
      // not one per side - WHICH side scored is the number that changed, never a state - and
      // the goal arrows exist from BOTH states: a second goal while the flag is still up is
      // the self-transition, which replays the flag-in and bumps again instead of being
      // dropped. (A marker with no side to credit would be a flag that plays and changes
      // nothing, which is the complaint this type exists to answer; there is none.)
      {
        id: 'flag',
        initial: 'none',
        states: [
          {
            id: 'none',
            name: 'No flag',
            timeline: {
              name: 'Flag out',
              duration: 0.22,
              ease: 'out',
              layers: { accent: { opacity: [{ time: 0, value: 1 }, { time: 0.22, value: 0.35 }] } },
            },
            edges: [{ from: 'shown', to: 'none', trigger: 'operator', event: 'clearFlag' }],
          },
          {
            id: 'shown',
            name: 'Flag',
            timeline: {
              name: 'Flag in',
              duration: 0.28,
              ease: 'in',
              layers: {
                accent: {
                  opacity: [{ time: 0, value: 0.35 }, { time: 0.28, value: 1 }],
                  scaleY: [{ time: 0, value: 1 }, { time: 0.14, value: 1.3 }, { time: 0.28, value: 1 }],
                },
              },
            },
            edges: [
              { from: 'none', to: 'shown', trigger: 'operator', event: 'goalA' },
              { from: 'shown', to: 'shown', trigger: 'operator', event: 'goalA' },
              { from: 'none', to: 'shown', trigger: 'operator', event: 'goalB' },
              { from: 'shown', to: 'shown', trigger: 'operator', event: 'goalB' },
            ],
          },
        ],
      },
      // NO CLOCK GROUP HERE, deliberately. This type's four designs (sb01-sb04) draw a score
      // and no time, so the Start/Stop clock buttons it used to declare were controls that
      // could not do anything: the machine's calls looked up a `.scoreboard-clock` element that
      // is not in the markup. Worse than inert — `startMatchClock` reached its
      // `setInterval` because the count-direction guard in front of it is skipped when there is
      // no element, so pressing Start left a one-second timer running for the life of the
      // graphic, painting nothing. The sports pack's own scorebug and match board (which DO
      // draw a clock, `types/sportsBugs.ts`) carry the three-state clock group instead.
      // The RESULT: live, or final. One way only — a match does not un-finish.
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
  // A goal raises the flag AND moves that side's score by one, on the same press (`adjust`):
  // the panel sends the event carrying the new figure, and the machine applies both together
  // or neither. The ± live-number steppers stay the correction road (a disallowed goal).
  controls: [
    { event: 'goalA', label: 'Goal {teamA|A}', section: 'Goal', order: 1, adjust: { scoreA: 1 } },
    { event: 'goalB', label: 'Goal {teamB|B}', section: 'Goal', order: 2, adjust: { scoreB: 1 } },
    { event: 'clearFlag', label: 'Clear flag', section: 'Goal', order: 3 },
    { event: 'final', label: 'Full time', section: 'Result', order: 4 },
  ],
  capabilities: {
    maxLines: 1,
    logo: 'none',
    animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
    defaultZone: 'top-center',
  },
  designs: [
    {
      id: 'sb01',
      name: 'Match Strip',
      description: 'The sport score strip: team names against big scores, one accent edge.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => sb01.create(options),
    },
    {
      id: 'sb02',
      name: 'Quiet Score',
      description: 'Panel-free corner stack - two quiet rows split by a hairline, accent rule on the edge.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      // A quiet corner stack reveals its lines; it must not inherit the sport strip's slam
      // just because the sport design happens to be this type's first.
      // A quiet corner stack reveals its lines; it must not inherit the sport strip's slam
      // just because the sport design happens to be this type's first.
      animationPresets: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      // A panel-free corner stack, drawn against the top-left edge rather than centred.
      defaultZone: 'top-left',
      create: (_type, options) => sb02.create(options),
    },
    {
      // Designed FOR this cell: no noacg scoreboard existed. The house void strip with an
      // amber accent edge that doubles as the flag marker — sibling of lt11 House Strap.
      id: 'sb03',
      name: 'House Score',
      description: 'The house score strip: void panel, amber accent edge, scores in void chips.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb03.create(options),
    },
    {
      // Designed FOR this cell: no glass scoreboard existed. A frosted strip with a soft accent
      // bar that doubles as the flag marker — sibling of lt08 Frosted Card.
      id: 'sb04',
      name: 'Frost Score',
      description: 'A frosted score strip: soft accent bar, team names, scores in glass chips.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
      create: (_type, options) => sb04.create(options),
    },
  ],
};
