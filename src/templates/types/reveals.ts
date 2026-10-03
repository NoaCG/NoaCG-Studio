// The REVEAL types — four graphics whose whole job is one moment.
//
// They are the pack's proof that the ordered walk and the branch model compose. Each has a
// Continue press that IS the moment (a real middle STEP firing a named call, so `next` alone
// runs the graphic under any playout server), and a branch beside the walk for the beat an
// operator calls by hand: suspense before a winner, a celebration after a result.
//
// The verdict card is the one without a walk press, and deliberately so: a ruling is not a
// step in a sequence, it is a state the operator enters when the decision is made — and it is
// ONE state, `judged`, carrying either verdict as data. A show that later needs a third ruling
// ("under review") adds a field value and a CSS rule, not a state and not a graphic.

import { paletteById } from '../../model/wizard';
import { aw01 } from '../competition/reveal/aw01';
import { aw02 } from '../competition/reveal/aw02';
import { aw03 } from '../competition/reveal/aw03';
import { aw04 } from '../competition/reveal/aw04';
import { nm01 } from '../competition/reveal/nm01';
import { nm02 } from '../competition/reveal/nm02';
import { nm03 } from '../competition/reveal/nm03';
import { nm04 } from '../competition/reveal/nm04';
import { vd01 } from '../competition/reveal/vd01';
import { vd02 } from '../competition/reveal/vd02';
import { vd03 } from '../competition/reveal/vd03';
import { vd04 } from '../competition/reveal/vd04';
import { wn01 } from '../competition/reveal/wn01';
import { wn02 } from '../competition/reveal/wn02';
import { wn03 } from '../competition/reveal/wn03';
import { wn04 } from '../competition/reveal/wn04';
import {
  AWARD_FIELDS,
  NOMINEE_FIELDS,
  VERDICT_FIELDS,
  WINNER_FIELDS,
} from '../competition/reveal/shared';
import type { GraphicType } from './graphicType';

export const nomineeRevealType: GraphicType = {
  id: 'nominee-reveal',
  name: 'Nominee reveal',
  description: 'The finalists, a suspense hold, and then the winner.',
  structure: {
    prefix: 'reveal',
    category: 'reveal',
    parts: [
      { id: 'box', selector: '.reveal-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.reveal-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.reveal-head', kind: 'block', required: true },
      { id: 'nominees', selector: '.reveal-body', kind: 'block', required: true },
      { id: 'category', selector: '#f0', kind: 'line', required: true },
      { id: 'kicker', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: NOMINEE_FIELDS,
  machine: {
    main: {
      // The walk is nominees -> winner -> out, so Continue alone runs the whole moment.
      pathEvents: ['reveal'],
      branches: [
        {
          // The beat before the name. A state rather than a fixed delay: the room decides how
          // long it lasts, and the operator holds it.
          id: 'suspense',
          name: 'Suspense',
          timeline: {
            name: 'Hold the room',
            duration: 0.6,
            ease: 'in',
            calls: [{ time: 0, call: 'markSuspense' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'suspense', trigger: 'operator', event: 'suspense' },
            // From the hold, the reveal is the same event the walk uses — so the control page
            // has one "Reveal winner" button whichever route the operator took.
            { from: 'suspense', to: { waypoint: 1 }, trigger: 'operator', event: 'reveal' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'suspense', label: 'Suspense', section: 'Reveal', order: 1 },
    { event: 'reveal', label: 'Reveal winner', section: 'Reveal', order: 2, payload: ['winner'] },
  ],
  capabilities: {
    maxLines: 2,
    logo: 'none',
    animationPresets: ['comp-bloom', 'comp-cascade', 'comp-rise'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'nm01',
      name: 'House Nominees',
      description: 'The finalists on a void stage — then the winner lifts into amber.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => nm01.create(options),
    },
    {
      id: 'nm02',
      name: 'Frost Nominees',
      description: 'Finalists on frosted tiles — the winner rings in the accent.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      create: (_type, options) => nm02.create(options),
    },
    {
      id: 'nm03',
      name: 'Clean Nominees',
      description: 'A quiet finalist list — the winner is said with a rule, not a flood.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-cascade', 'comp-bloom', 'comp-rise'],
      create: (_type, options) => nm03.create(options),
    },
    {
      id: 'nm04', name: 'Volt Nominees', description: 'A hard-edged finalist board where the winner takes the accent slab.',
      styleTag: 'sport', palette: paletteById('volt'), fontId: 'oswald',
      animationPresets: ['comp-impact', 'comp-cascade', 'comp-rise'],
      // The sport board is drawn around a PLAYER award rather than a play of the tournament,
      // which is what its own line says - so the wizard offers the design's words, not the
      // type's (the samples gate, docs/GRAPHIC_TYPES.md §5).
      samples: { category: 'PLAYER OF THE FINAL' },
      create: (_type, options) => nm04.create(options),
    },
  ],
};

export const verdictCardType: GraphicType = {
  id: 'verdict-card',
  name: 'Verdict card',
  description: 'Correct or incorrect — one state, and a field that says which.',
  structure: {
    prefix: 'reveal',
    category: 'reveal',
    parts: [
      { id: 'box', selector: '.reveal-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.reveal-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.reveal-head', kind: 'block', required: true },
      { id: 'body', selector: '.reveal-body', kind: 'block', required: true },
      { id: 'prompt', selector: '#f0', kind: 'line', required: true },
      { id: 'answer', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: VERDICT_FIELDS,
  machine: {
    main: {
      branches: [
        {
          // ONE judged state. Correct and incorrect are the same MOMENT with different data,
          // so they are the same state — and a correction is a self-transition, not a
          // second graphic.
          id: 'judged',
          name: 'Ruled',
          timeline: {
            name: 'Rule',
            duration: 0.5,
            ease: 'in',
            calls: [{ time: 0, call: 'applyVerdict' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 0 }, to: 'judged', trigger: 'operator', event: 'judge' },
            { from: 'judged', to: 'judged', trigger: 'operator', event: 'judge' },
            { from: 'unjudged', to: 'judged', trigger: 'operator', event: 'judge' },
          ],
        },
        {
          id: 'unjudged',
          name: 'No ruling',
          timeline: {
            name: 'Clear the ruling',
            duration: 0.3,
            ease: 'out',
            calls: [{ time: 0, call: 'clearVerdict' }],
            layers: {},
          },
          edges: [
            { from: 'judged', to: 'unjudged', trigger: 'operator', event: 'clear' },
            // The rejoin: after a ruling, Next still takes the card off air.
            { from: 'judged', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'judge', label: 'Rule', section: 'Verdict', order: 1, payload: ['verdict'] },
    { event: 'clear', label: 'Clear ruling', section: 'Verdict', order: 2, destructive: true },
  ],
  capabilities: {
    maxLines: 3,
    logo: 'none',
    animationPresets: ['comp-impact', 'comp-bloom', 'comp-rise'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'vd01',
      name: 'Call Verdict',
      description: 'A ruling card: the question, then a full-frame tick or cross.',
      styleTag: 'sport',
      palette: paletteById('signal'),
      fontId: 'oswald',
      create: (_type, options) => vd01.create(options),
    },
    {
      id: 'vd02',
      name: 'House Verdict',
      description: 'The house ruling: void stage, mono labels, amber tick or red cross.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['comp-bloom', 'comp-impact', 'comp-rise'],
      // Written around a quiz ruling rather than a sports call.
      samples: {
        prompt: 'IS THAT ANSWER CORRECT?',
        answer: 'THE RED PLANET IS MARS',
        note: 'CONFIRMED BY THE JUDGES',
      },
      create: (_type, options) => vd02.create(options),
    },
    {
      id: 'vd03',
      name: 'Clean Verdict',
      description: 'A quiet ruling: the mark set in type, the word under a hairline.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
      // The analytical use of the same card: a fact check, not a referee call.
      samples: {
        prompt: 'IS THAT CLAIM TRUE?',
        answer: 'THE RECORD WAS SET IN 2019',
        note: 'SOURCE: OFFICIAL RESULTS',
      },
      create: (_type, options) => vd03.create(options),
    },
    {
      id: 'vd04',
      name: 'Frost Verdict',
      description: 'A frosted ruling card with the verdict held in a softly-ringed medallion.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-bloom', 'comp-impact', 'comp-rise'],
      samples: {
        prompt: 'IS THAT ANSWER CORRECT?',
        answer: 'THE RED PLANET IS MARS',
        note: 'CONFIRMED BY THE JUDGES',
      },
      create: (_type, options) => vd04.create(options),
    },
  ],
};

export const winnerCardType: GraphicType = {
  id: 'winner-card',
  name: 'Winner card',
  description: 'The final result: the champion, then the score, then the celebration.',
  structure: {
    prefix: 'reveal',
    category: 'reveal',
    parts: [
      { id: 'box', selector: '.reveal-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.reveal-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.reveal-head', kind: 'block', required: true },
      { id: 'result', selector: '.reveal-body', kind: 'block', required: true },
      { id: 'kicker', selector: '#f0', kind: 'line', required: true },
      { id: 'winner', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: WINNER_FIELDS,
  machine: {
    main: {
      // champion -> result -> out: Continue alone runs the card end to end.
      pathEvents: ['result'],
      branches: [
        {
          id: 'celebrating',
          name: 'Celebration',
          timeline: {
            name: 'Celebrate',
            duration: 0.55,
            ease: 'in',
            calls: [{ time: 0, call: 'markCelebration' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 1 }, to: 'celebrating', trigger: 'operator', event: 'celebrate' },
            { from: 'plain', to: 'celebrating', trigger: 'operator', event: 'celebrate' },
            { from: 'celebrating', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
        {
          id: 'plain',
          name: 'Plain result',
          timeline: {
            name: 'Settle',
            duration: 0.3,
            ease: 'out',
            calls: [{ time: 0, call: 'clearCelebration' }],
            layers: {},
          },
          edges: [
            { from: 'celebrating', to: 'plain', trigger: 'operator', event: 'settle' },
            { from: 'plain', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'result', label: 'Reveal result', section: 'Result', order: 1 },
    { event: 'celebrate', label: 'Celebrate', section: 'Result', order: 2 },
    { event: 'settle', label: 'Settle', section: 'Result', order: 3 },
  ],
  capabilities: {
    maxLines: 3,
    logo: 'none',
    animationPresets: ['comp-impact', 'comp-bloom', 'comp-rise'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'wn01',
      name: 'Champion Card',
      description: 'The champion fills the frame — the score lands on the press.',
      styleTag: 'sport',
      palette: paletteById('volt'),
      fontId: 'oswald',
      create: (_type, options) => wn01.create(options),
    },
    {
      id: 'wn02',
      name: 'House Champion',
      description: 'The house result card: void stage, mono kicker, amber score on the press.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      animationPresets: ['comp-bloom', 'comp-rise', 'comp-impact'],
      create: (_type, options) => wn02.create(options),
    },
    {
      id: 'wn03',
      name: 'Frost Champion',
      description: 'The result on one frosted panel — the score arrives on the press.',
      styleTag: 'glass',
      palette: paletteById('frost'),
      fontId: 'manrope',
      animationPresets: ['comp-bloom', 'comp-rise', 'comp-impact'],
      create: (_type, options) => wn03.create(options),
    },
    {
      id: 'wn04',
      name: 'Clean Champion',
      description: 'A quiet result card where a hairline separates the champion from the score.',
      styleTag: 'minimal',
      palette: paletteById('ivory'),
      fontId: 'inter',
      animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
      create: (_type, options) => wn04.create(options),
    },
  ],
};

export const awardRevealType: GraphicType = {
  id: 'award-reveal',
  name: 'Award / launch reveal',
  description: 'A sealed category, opened on the press — an award, an induction, a launch.',
  structure: {
    prefix: 'reveal',
    category: 'reveal',
    parts: [
      { id: 'box', selector: '.reveal-box', kind: 'panel', required: true },
      { id: 'accent', selector: '.reveal-accent', kind: 'accent', required: true },
      { id: 'head', selector: '.reveal-head', kind: 'block', required: true },
      { id: 'subject', selector: '.reveal-body', kind: 'block', required: true },
      { id: 'kicker', selector: '#f0', kind: 'line', required: true },
      { id: 'category', selector: '#f1', kind: 'line', required: true },
    ],
  },
  fields: AWARD_FIELDS,
  machine: {
    main: {
      // sealed -> opened -> out.
      pathEvents: ['open'],
      branches: [
        {
          id: 'celebrating',
          name: 'Applause',
          timeline: {
            name: 'Applause',
            duration: 0.5,
            ease: 'in',
            calls: [{ time: 0, call: 'markCelebration' }],
            layers: {},
          },
          edges: [
            { from: { waypoint: 1 }, to: 'celebrating', trigger: 'operator', event: 'celebrate' },
            { from: 'settled', to: 'celebrating', trigger: 'operator', event: 'celebrate' },
            { from: 'celebrating', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
        {
          id: 'settled',
          name: 'Settled',
          timeline: {
            name: 'Settle',
            duration: 0.3,
            ease: 'out',
            calls: [{ time: 0, call: 'clearCelebration' }],
            layers: {},
          },
          edges: [
            { from: 'celebrating', to: 'settled', trigger: 'operator', event: 'settle' },
            { from: 'settled', to: { waypoint: -1 }, trigger: 'operator', event: 'next' },
          ],
        },
      ],
    },
  },
  controls: [
    { event: 'open', label: 'Open envelope', section: 'Reveal', order: 1 },
    { event: 'celebrate', label: 'Applause', section: 'Reveal', order: 2 },
    { event: 'settle', label: 'Settle', section: 'Reveal', order: 3 },
  ],
  capabilities: {
    maxLines: 3,
    logo: 'none',
    animationPresets: ['comp-bloom', 'comp-rise', 'comp-impact'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'aw01',
      name: 'House Award',
      description: 'The sealed envelope: category on screen, subject revealed on the press.',
      styleTag: 'noacg',
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      create: (_type, options) => aw01.create(options),
    },
    {
      id: 'aw02',
      name: 'Frost Award',
      description: 'A frosted category plate — the subject blooms out on the press.',
      styleTag: 'glass',
      palette: paletteById('orchid'),
      fontId: 'manrope',
      create: (_type, options) => aw02.create(options),
    },
    {
      id: 'aw03',
      name: 'Launch Reveal',
      description: 'A teaser line, then the name lands — the launch take on the envelope.',
      styleTag: 'sport',
      palette: paletteById('inferno'),
      fontId: 'archivo',
      animationPresets: ['comp-impact', 'comp-bloom', 'comp-rise'],
      // The launch use of the same card: an announcement, not a prize.
      samples: {
        kicker: 'ANNOUNCING',
        category: 'THE 2026 SEASON PARTNER',
        subject: 'NOACG STUDIO',
      },
      semantics:
        'A launch reveal and an award reveal are the same graphic: a sealed category opened ' +
        'on a press. Only the copy differs, which is why this design declares samples rather ' +
        'than a type of its own.',
      create: (_type, options) => aw03.create(options),
    },
    {
      id: 'aw04', name: 'Clean Award', description: 'A restrained envelope reveal where a hairline category gives way to the winning name.',
      styleTag: 'minimal', palette: paletteById('ivory'), fontId: 'inter',
      animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
      samples: { kicker: 'THE AWARD FOR', category: 'OUTSTANDING LIVE PRODUCTION', subject: 'NORTHLIGHT MEDIA' },
      create: (_type, options) => aw04.create(options),
    },
  ],
};
