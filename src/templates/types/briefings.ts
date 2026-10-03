// The BRIEFING types — the title/topic/information pack's five new graphic types, all built on
// the info-card assembler because all five are words in a panel rather than data in a board.
//
// Four of them declare NO machine, and that is the model working rather than a shortcut: the
// derived one-group linear machine already walks a card's steps, so a now/next card, a headline
// card, a process card and a statement card each compile to exactly the code they would have
// emitted before graphic types existed.
//
// The fifth, the NOTICE, is the exception that earns its machine. A notice has a LEVEL, the
// level changes while the graphic is on air, and re-taking the card to change it would blank
// the screen at the worst possible moment. A parallel `level` group holds `standard` and
// `urgent`, two operator events move between them, and the main path is untouched — the
// operator can still walk the notice's steps with Continue while the level sits where they
// left it. That independence is the whole reason parallel groups exist
// (docs/STATE_MACHINE_SCHEMA.md).

import { card18 } from '../infoCards/card18';
import { card19 } from '../infoCards/card19';
import { card20 } from '../infoCards/card20';
import { card21 } from '../infoCards/card21';
import { card22 } from '../infoCards/card22';
import { card23 } from '../infoCards/card23';
import { card24 } from '../infoCards/card24';
import { card25 } from '../infoCards/card25';
import { card26 } from '../infoCards/card26';
import { card27 } from '../infoCards/card27';
import { card28 } from '../infoCards/card28';
import { card29 } from '../infoCards/card29';
import { card30 } from '../infoCards/card30';
import { card31 } from '../infoCards/card31';
import { card32 } from '../infoCards/card32';
import { card33 } from '../infoCards/card33';
import { card34 } from '../infoCards/card34';
import { card35 } from '../infoCards/card35';
import { card36 } from '../infoCards/card36';
import { card37 } from '../infoCards/card37';
import {
  card60,
  card61,
  card62,
  card63,
  EDITORIAL_EXPLAINER_SAMPLES,
  EDITORIAL_FACT_CHECK_SAMPLES,
  EDITORIAL_NOTICE_SAMPLES,
  EDITORIAL_NOW_NEXT_SAMPLES,
} from '../infoCards/infoSystems/editorial';
import {
  card68,
  card69,
  CINEMATIC_NOW_PLAYING_SAMPLES,
  CINEMATIC_QUOTE_SAMPLES,
} from '../infoCards/infoSystems/cinematic';
import {
  CARD18_SAMPLES,
  CARD19_SAMPLES,
  CARD20_SAMPLES,
  CARD21_SAMPLES,
  CARD22_SAMPLES,
  CARD23_SAMPLES,
  CARD24_SAMPLES,
  CARD25_SAMPLES,
  CARD26_SAMPLES,
  CARD27_SAMPLES,
  CARD28_SAMPLES,
  CARD29_SAMPLES,
  CARD30_SAMPLES,
  CARD31_SAMPLES,
  CARD32_SAMPLES,
  CARD33_SAMPLES,
  CARD34_SAMPLES,
  CARD35_SAMPLES,
  CARD36_SAMPLES,
  CARD37_SAMPLES,
  HEADLINE_FIELDS,
  NOTICE_FIELDS,
  NOW_NEXT_FIELDS,
  PROCESS_FIELDS,
  STATEMENT_FIELDS,
} from '../pack4/content';
import { CLEAN, FROST, HOUSE, VOLT } from '../pack4/skin';
import { paletteById } from '../../model/wizard';
import { optionalLine } from './graphicType';
import type { GraphicType, TypeTimeline } from './graphicType';

/** The four families' motion vocabularies, shared by every type in this pack. A design is
 *  authored for one of them, and `TypeDesign.animationPresets` is what keeps it. */
const MOTION = {
  clean: ['line-reveal', 'mask-wipe', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
  frost: ['pop-spring', 'blur-in', 'slide-up', 'fade', 'slide-down', 'flip-3d'],
  volt: ['snap-stinger', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
  house: ['line-reveal', 'slide-up', 'mask-wipe', 'fade', 'slide-down', 'flip-3d'],
} as const;

// ── NOW / NEXT ───────────────────────────────────────────────────────────────

/** NOW / NEXT — what is on air and what follows it, in one card. */
export const nowNextType: GraphicType = {
  id: 'now-next',
  name: 'Now / Next',
  description: 'What is playing now, and what comes after it.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('now', '#f1'),
      { id: 'divider', selector: '.info-card-divider', kind: 'block', required: true },
    ],
  },
  fields: NOW_NEXT_FIELDS,
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 5,
    logo: 'optional',
    animationPresets: [...MOTION.clean],
    defaultZone: 'bottom-left',
  },
  designs: [
    {
      id: 'card18',
      name: 'Now & Next',
      description: 'What is on air now, a hairline, and what follows it — panel-free.',
      styleTag: 'minimal',
      palette: CLEAN.palette,
      fontId: CLEAN.fontId,
      samples: CARD18_SAMPLES,
      animationPresets: [...MOTION.clean],
      defaultZone: 'bottom-left',
      create: (_type, options) => card18.create(options),
    },
    {
      id: 'card19',
      name: 'Frost Now Next',
      description: 'A frosted now-playing card: the track and artist, then what is coming up.',
      styleTag: 'glass',
      palette: FROST.palette,
      fontId: FROST.fontId,
      samples: CARD19_SAMPLES,
      animationPresets: [...MOTION.frost],
      defaultZone: 'bottom-center',
      create: (_type, options) => card19.create(options),
    },
    {
      id: 'card20',
      name: 'Volt Now Next',
      description: 'A sport slab: the event on now with its detail, then the next one up.',
      styleTag: 'sport',
      palette: VOLT.palette,
      fontId: VOLT.fontId,
      samples: CARD20_SAMPLES,
      animationPresets: [...MOTION.volt],
      defaultZone: 'bottom-left',
      create: (_type, options) => card20.create(options),
    },
    {
      id: 'card21',
      name: 'House Now Next',
      description: 'The house now/next card: amber bar and void panel, the session now and the one after.',
      styleTag: 'noacg',
      palette: HOUSE.palette,
      fontId: HOUSE.fontId,
      samples: CARD21_SAMPLES,
      animationPresets: [...MOTION.house],
      defaultZone: 'bottom-right',
      create: (_type, options) => card21.create(options),
    },
    {
      id: 'card60',
      name: 'Rundown Column',
      description: 'Editorial topic and coming-up hierarchy organised by a printed column rule.',
      styleTag: 'editorial',
      palette: paletteById('vermilion'),
      fontId: 'archivo',
      samples: EDITORIAL_NOW_NEXT_SAMPLES,
      animationPresets: ['line-reveal', 'fade', 'slide-up', 'mask-wipe'],
      defaultZone: 'mid-left',
      create: (_type, options) => card60.create(options),
    },
    {
      id: 'card68',
      name: 'Now Playing Scrim',
      description: 'Cinematic current and next cue on a low letterbox scrim with one hairline.',
      styleTag: 'cinematic',
      palette: paletteById('ember'),
      fontId: 'manrope',
      samples: CINEMATIC_NOW_PLAYING_SAMPLES,
      animationPresets: ['fade', 'line-reveal', 'slide-up'],
      defaultZone: 'bottom-left',
      create: (_type, options) => card68.create(options),
    },
  ],
};

// ── HEADLINE + BODY ──────────────────────────────────────────────────────────

/** HEADLINE CARD — a headline and the paragraph under it. */
export const headlineCardType: GraphicType = {
  id: 'headline-card',
  name: 'Headline card',
  description: 'A headline, the story under it, and where it came from.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('headline', '#f1'),
      optionalLine('body', '#f2'),
    ],
  },
  fields: HEADLINE_FIELDS,
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 4,
    logo: 'optional',
    animationPresets: [...MOTION.clean],
    defaultZone: 'mid-left',
  },
  designs: [
    {
      id: 'card22',
      name: 'News Headline',
      description: 'A panel-free headline card: kicker, headline, the story under it, then the byline.',
      styleTag: 'minimal',
      palette: CLEAN.palette,
      fontId: CLEAN.fontId,
      samples: CARD22_SAMPLES,
      animationPresets: [...MOTION.clean],
      defaultZone: 'mid-left',
      create: (_type, options) => card22.create(options),
    },
    {
      id: 'card23',
      name: 'Frost Headline',
      description: 'A frosted announcement card: the news, the detail, and where to act on it.',
      styleTag: 'glass',
      palette: FROST.palette,
      fontId: FROST.fontId,
      samples: CARD23_SAMPLES,
      animationPresets: [...MOTION.frost],
      defaultZone: 'mid-center',
      create: (_type, options) => card23.create(options),
    },
    {
      id: 'card24',
      name: 'Volt Headline',
      description: 'A sport report card: a caps headline over the match report and its source.',
      styleTag: 'sport',
      palette: VOLT.palette,
      fontId: VOLT.fontId,
      samples: CARD24_SAMPLES,
      animationPresets: [...MOTION.volt],
      defaultZone: 'mid-left',
      create: (_type, options) => card24.create(options),
    },
    {
      id: 'card25',
      name: 'House Headline',
      description: 'The house headline card: a mono kicker, the news, the paragraph, then where to read more.',
      styleTag: 'noacg',
      palette: HOUSE.palette,
      fontId: HOUSE.fontId,
      samples: CARD25_SAMPLES,
      animationPresets: [...MOTION.house],
      defaultZone: 'mid-right',
      create: (_type, options) => card25.create(options),
    },
    {
      id: 'card61',
      name: 'Fact Check Desk',
      description: 'Editorial claim, finding, context and source on a flat printed fact-check sheet.',
      styleTag: 'editorial',
      palette: paletteById('broadsheet'),
      fontId: 'archivo',
      samples: EDITORIAL_FACT_CHECK_SAMPLES,
      animationPresets: ['line-reveal', 'fade', 'slide-up', 'mask-wipe'],
      defaultZone: 'mid-left',
      create: (_type, options) => card61.create(options),
    },
    {
      id: 'card62',
      name: 'Explainer Folio',
      description: 'Editorial headline and readable explanation set beside a printed column rule.',
      styleTag: 'editorial',
      palette: paletteById('vermilion'),
      fontId: 'archivo',
      samples: EDITORIAL_EXPLAINER_SAMPLES,
      animationPresets: ['line-reveal', 'fade', 'slide-up', 'mask-wipe'],
      defaultZone: 'mid-right',
      create: (_type, options) => card62.create(options),
    },
  ],
};

// ── STEPS, PROCESSES AND CHECKLISTS ──────────────────────────────────────────

/**
 * PROCESS / CHECKLIST — a heading and up to four ordered steps.
 *
 * The pack's one STEPPED type. `defaultSteps` is a capability, not a preference: created
 * single-step, a process card shows its last step on the first frame, which is the opposite of
 * what it is for. The default path the preset builds is what SPX Continue then walks, so this
 * needs no machine either — the stepping model already IS the default path.
 */
export const processStepsType: GraphicType = {
  id: 'process-steps',
  name: 'Process / checklist',
  description: 'An ordered set of steps, revealed one at a time.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('heading', '#f0'),
      optionalLine('firstStep', '#f1'),
    ],
  },
  fields: PROCESS_FIELDS,
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 5,
    logo: 'optional',
    animationPresets: [...MOTION.clean],
    defaultZone: 'mid-left',
    defaultSteps: true,
  },
  designs: [
    {
      id: 'card26',
      name: 'Clean Steps',
      description: 'A numbered process: a heading and up to four steps, one revealed per Continue.',
      styleTag: 'minimal',
      palette: CLEAN.palette,
      fontId: CLEAN.fontId,
      samples: CARD26_SAMPLES,
      animationPresets: [...MOTION.clean],
      defaultZone: 'mid-left',
      create: (_type, options) => card26.create(options),
    },
    {
      id: 'card27',
      name: 'Frost Checklist',
      description: 'A frosted checklist: drawn tick boxes, one item revealed per Continue.',
      styleTag: 'glass',
      palette: FROST.palette,
      fontId: FROST.fontId,
      samples: CARD27_SAMPLES,
      animationPresets: [...MOTION.frost],
      defaultZone: 'mid-center',
      create: (_type, options) => card27.create(options),
    },
    {
      id: 'card28',
      name: 'Volt Process',
      description: 'A sport runsheet: accent-chip numbers, heavy caps steps, one per Continue.',
      styleTag: 'sport',
      palette: VOLT.palette,
      fontId: VOLT.fontId,
      samples: CARD28_SAMPLES,
      animationPresets: [...MOTION.volt],
      defaultZone: 'mid-left',
      create: (_type, options) => card28.create(options),
    },
    {
      id: 'card29',
      name: 'House Runbook',
      description: 'The house process card: mono step numbers in the void panel, one per Continue.',
      styleTag: 'noacg',
      palette: HOUSE.palette,
      fontId: HOUSE.fontId,
      samples: CARD29_SAMPLES,
      animationPresets: [...MOTION.house],
      defaultZone: 'mid-right',
      create: (_type, options) => card29.create(options),
    },
  ],
};

// ── PUBLIC INFORMATION AND SAFETY NOTICES ────────────────────────────────────

/** Raising the level: the accent wash fades up over the whole notice. */
const RAISE_ALERT: TypeTimeline = {
  name: 'Urgent',
  duration: 0.35,
  ease: 'out',
  layers: {
    alert: {
      opacity: [
        { time: 0, value: 0 },
        { time: 0.35, value: 1 },
      ],
    },
  },
};

/** Standing down: the wash fades away again, and the notice is an ordinary notice. */
const CLEAR_ALERT: TypeTimeline = {
  name: 'Standard',
  duration: 0.3,
  ease: 'in',
  layers: {
    alert: {
      opacity: [
        { time: 0, value: 1 },
        { time: 0.3, value: 0 },
      ],
    },
  },
};

/**
 * NOTICE — the public-information card, and the pack's one state machine.
 *
 * The `level` group is PARALLEL to the main path on purpose. Escalating a notice is not a step
 * in its reveal: the operator may escalate before the card is fully out, or three minutes
 * later, or never, and doing so must not disturb where the main walk has got to. A parallel
 * group has its own pointer, so it does exactly that — and because the group's states are
 * entered by transition or by snap like any other, a control page that reconnects after a
 * refresh restores the level along with everything else.
 */
export const noticeCardType: GraphicType = {
  id: 'notice-card',
  name: 'Public notice',
  description: 'A public-information or safety notice, with an escalatable level.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('headline', '#f1'),
      optionalLine('action', '#f3'),
      // The layer the level group animates. Required, and correctly so: it is STATIC markup a
      // notice design always emits (never a line), so no line-count reduction can drop it —
      // and without it the machine's states would compile against an element no design carries
      // and the escalate button would do nothing.
      { id: 'alert', selector: '.info-card-alert', kind: 'block', required: true },
    ],
  },
  fields: NOTICE_FIELDS,
  machine: {
    parallel: [
      {
        id: 'level',
        initial: 'standard',
        states: [
          {
            id: 'standard',
            name: 'Standard',
            timeline: CLEAR_ALERT,
            edges: [{ from: 'standard', to: 'urgent', trigger: 'operator', event: 'escalate' }],
          },
          {
            id: 'urgent',
            name: 'Urgent',
            timeline: RAISE_ALERT,
            edges: [{ from: 'urgent', to: 'standard', trigger: 'operator', event: 'standDown' }],
          },
        ],
      },
    ],
  },
  controls: [
    { event: 'escalate', label: 'Urgent', section: 'Notice level', order: 1 },
    { event: 'standDown', label: 'Standard', section: 'Notice level', order: 2 },
  ],
  capabilities: {
    maxLines: 5,
    logo: 'optional',
    animationPresets: [...MOTION.clean],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'card30',
      name: 'Public Advisory',
      description: 'A public-information notice: authority chip, headline, detail, and what to do.',
      styleTag: 'minimal',
      palette: CLEAN.palette,
      fontId: CLEAN.fontId,
      samples: CARD30_SAMPLES,
      animationPresets: [...MOTION.clean],
      defaultZone: 'mid-center',
      create: (_type, options) => card30.create(options),
    },
    {
      id: 'card31',
      name: 'Frost Advisory',
      description: 'A frosted venue advisory: the policy, the detail, and what the audience should do.',
      styleTag: 'glass',
      palette: FROST.palette,
      fontId: FROST.fontId,
      samples: CARD31_SAMPLES,
      animationPresets: [...MOTION.frost],
      defaultZone: 'mid-center',
      create: (_type, options) => card31.create(options),
    },
    {
      id: 'card32',
      name: 'Alert Slab',
      description: 'A stadium announcement: caps headline, the detail, and the instruction in its own rule.',
      styleTag: 'sport',
      palette: VOLT.palette,
      fontId: VOLT.fontId,
      samples: CARD32_SAMPLES,
      animationPresets: [...MOTION.volt],
      defaultZone: 'bottom-center',
      create: (_type, options) => card32.create(options),
    },
    {
      id: 'card33',
      name: 'House Notice',
      description: 'The house service notice: what has happened, and what the viewer should do.',
      styleTag: 'noacg',
      palette: HOUSE.palette,
      fontId: HOUSE.fontId,
      samples: CARD33_SAMPLES,
      animationPresets: [...MOTION.house],
      defaultZone: 'mid-center',
      create: (_type, options) => card33.create(options),
    },
    {
      id: 'card63',
      name: 'Public Notice Sheet',
      description: 'Editorial official notice with a printed authority header, action line and contact.',
      styleTag: 'editorial',
      palette: paletteById('broadsheet'),
      fontId: 'archivo',
      samples: EDITORIAL_NOTICE_SAMPLES,
      animationPresets: ['line-reveal', 'fade', 'slide-up', 'mask-wipe'],
      defaultZone: 'mid-center',
      create: (_type, options) => card63.create(options),
    },
  ],
};

// ── LONG TEXT AND SECOND LANGUAGES ───────────────────────────────────────────

/** STATEMENT — one long passage, optionally repeated in a second language. */
export const statementCardType: GraphicType = {
  id: 'statement-card',
  name: 'Statement',
  description: 'A long passage, optionally in two languages, with its attribution.',
  structure: {
    prefix: 'info-card',
    category: 'info-card',
    parts: [
      { id: 'box', selector: '.info-card-box', kind: 'panel', required: true },
      optionalLine('primary', '#f1'),
      optionalLine('secondary', '#f2'),
    ],
  },
  fields: STATEMENT_FIELDS,
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 4,
    logo: 'optional',
    animationPresets: [...MOTION.clean],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'card34',
      name: 'Statement Card',
      description: 'A long statement with a second language under it, and its attribution.',
      styleTag: 'minimal',
      palette: CLEAN.palette,
      fontId: CLEAN.fontId,
      samples: CARD34_SAMPLES,
      animationPresets: [...MOTION.clean],
      defaultZone: 'mid-center',
      create: (_type, options) => card34.create(options),
    },
    {
      id: 'card35',
      name: 'Reading Card',
      description: 'A frosted reading card: the passage, a second language, then the reference.',
      styleTag: 'glass',
      palette: FROST.palette,
      fontId: FROST.fontId,
      samples: CARD35_SAMPLES,
      animationPresets: [...MOTION.frost],
      defaultZone: 'mid-center',
      create: (_type, options) => card35.create(options),
    },
    {
      id: 'card36',
      name: 'Translation Slab',
      description: 'A quote and its translation on a sport slab, with the speaker underneath.',
      styleTag: 'sport',
      palette: VOLT.palette,
      fontId: VOLT.fontId,
      samples: CARD36_SAMPLES,
      animationPresets: [...MOTION.volt],
      defaultZone: 'mid-left',
      create: (_type, options) => card36.create(options),
    },
    {
      id: 'card37',
      name: 'House Statement',
      description: 'The house statement card: a long passage, a second language, an attribution.',
      styleTag: 'noacg',
      palette: HOUSE.palette,
      fontId: HOUSE.fontId,
      samples: CARD37_SAMPLES,
      animationPresets: [...MOTION.house],
      defaultZone: 'mid-left',
      create: (_type, options) => card37.create(options),
    },
    {
      id: 'card69',
      name: 'Documentary Quote',
      description: 'Cinematic quotation with a field-note label and attribution on a soft scrim.',
      styleTag: 'cinematic',
      palette: paletteById('noir'),
      fontId: 'inter',
      samples: CINEMATIC_QUOTE_SAMPLES,
      animationPresets: ['fade', 'line-reveal', 'slide-up'],
      defaultZone: 'mid-left',
      create: (_type, options) => card69.create(options),
    },
  ],
};
