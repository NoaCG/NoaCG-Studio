// The LIST BOARD types — key facts / explainers, and recaps / action items.
//
// Both belong with the agenda and the poll rather than with the pack's cards: their content is
// a LIST the operator types into one textarea and a design-owned runtime renders, and their
// motion is MEASURED from that list (one cascade step per row). Neither needs a state machine —
// the derived linear machine walks their single step, and the measured builder rides alongside
// it untouched, which is the same arrangement the two data boards already prove.

import { paletteById } from '../../model/wizard';
import { ig14 } from '../infographics/ig14';
import { ig15 } from '../infographics/ig15';
import { ig16 } from '../infographics/ig16';
import { ig17 } from '../infographics/ig17';
import { ig18 } from '../infographics/ig18';
import { ig19 } from '../infographics/ig19';
import { ig20 } from '../infographics/ig20';
import { ig21 } from '../infographics/ig21';
import { ig40 } from '../infographics/ig40';
import { ig41 } from '../infographics/ig41';
import { ig42 } from '../infographics/ig42';
import { GAME_SHOW_FACTS_SAMPLES } from '../infographics/pack4/gameShowFacts';
import {
  IG14_SAMPLES,
  IG15_SAMPLES,
  IG16_SAMPLES,
  IG17_SAMPLES,
  IG18_SAMPLES,
  IG19_SAMPLES,
  IG20_SAMPLES,
  IG21_SAMPLES,
  KEY_FACTS_FIELDS,
  RECAP_FIELDS,
} from '../pack4/content';
import { CLEAN, FROST, HOUSE, VOLT } from '../pack4/skin';
import type { GraphicType } from './graphicType';

/** KEY FACTS / EXPLAINER — the terms and what they mean, one row per fact. */
export const keyFactsType: GraphicType = {
  id: 'key-facts',
  name: 'Key facts',
  description: 'The facts behind a story, as a term and its explanation per row.',
  structure: {
    prefix: 'infographic',
    category: 'infographic',
    parts: [
      { id: 'box', selector: '.infographic-box', kind: 'panel', required: true },
      { id: 'rows', selector: '#infographic-rows', kind: 'block', required: true },
    ],
  },
  fields: KEY_FACTS_FIELDS,
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 2,
    logo: 'none',
    // Measured motion: the cascade IS the entrance, and its length is the operator's content.
    animationPresets: ['rows-cascade'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'ig14',
      name: 'Fact Sheet',
      description: 'A panel-free key-facts board — one "term | explanation" per line.',
      styleTag: 'minimal',
      palette: CLEAN.palette,
      fontId: CLEAN.fontId,
      samples: IG14_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-center',
      create: (_type, options) => ig14.create(options),
    },
    {
      id: 'ig15',
      name: 'Frost Facts',
      description: 'A frosted good-to-know board — one "term | explanation" per line.',
      styleTag: 'glass',
      palette: FROST.palette,
      fontId: FROST.fontId,
      samples: IG15_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-center',
      create: (_type, options) => ig15.create(options),
    },
    {
      id: 'ig16',
      name: 'Volt Facts',
      description: 'A sport key-numbers board — one "term | number" per line, in heavy caps.',
      styleTag: 'sport',
      palette: VOLT.palette,
      fontId: VOLT.fontId,
      samples: IG16_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-left',
      create: (_type, options) => ig16.create(options),
    },
    {
      id: 'ig17',
      name: 'House Facts',
      description: 'The house explainer board — one "term | explanation" per line in the void panel.',
      styleTag: 'noacg',
      palette: HOUSE.palette,
      fontId: HOUSE.fontId,
      samples: IG17_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-right',
      create: (_type, options) => ig17.create(options),
    },
    // The three GAME-SHOW cells (sticker, showtime, arcade). Each was designed FOR this type, as
    // one graphic of the quiz show kit (packs.ts, 'quiz-show').
    {
      id: 'ig40',
      name: 'Sticker Facts',
      description: 'A paper label of key facts: heading on an ink strip, each term on an accent chip.',
      styleTag: 'sticker',
      palette: paletteById('tangerine'),
      fontId: 'archivo',
      samples: GAME_SHOW_FACTS_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-center',
      create: (_type, options) => ig40.create(options),
    },
    {
      id: 'ig41',
      name: 'Showtime Facts',
      description: 'A playbill of key facts on a marquee plaque: serif heading, terms in billing caps.',
      styleTag: 'showtime',
      palette: paletteById('marquee'),
      fontId: 'playfair-display',
      samples: GAME_SHOW_FACTS_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-center',
      create: (_type, options) => ig41.create(options),
    },
    {
      id: 'ig42',
      name: 'Arcade Facts',
      description: 'An instructions screen of key facts: squared-caps heading, mono terms in the neon.',
      styleTag: 'arcade',
      palette: paletteById('neon-cyan'),
      fontId: 'saira',
      samples: GAME_SHOW_FACTS_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-center',
      create: (_type, options) => ig42.create(options),
    },
  ],
};

/** RECAP / ACTION ITEMS — who owns what, one row per item. */
export const recapType: GraphicType = {
  id: 'recap-card',
  name: 'Recap / actions',
  description: 'What was agreed and who is doing it, one row per item.',
  structure: {
    prefix: 'infographic',
    category: 'infographic',
    parts: [
      { id: 'box', selector: '.infographic-box', kind: 'panel', required: true },
      { id: 'rows', selector: '#infographic-rows', kind: 'block', required: true },
    ],
  },
  fields: RECAP_FIELDS,
  machine: {},
  controls: [],
  capabilities: {
    maxLines: 2,
    logo: 'none',
    animationPresets: ['rows-cascade'],
    defaultZone: 'mid-center',
  },
  designs: [
    {
      id: 'ig18',
      name: 'Recap Board',
      description: 'A panel-free recap board — one "owner | action" per line.',
      styleTag: 'minimal',
      palette: CLEAN.palette,
      fontId: CLEAN.fontId,
      samples: IG18_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-center',
      create: (_type, options) => ig18.create(options),
    },
    {
      id: 'ig19',
      name: 'Frost Recap',
      description: 'A frosted recap board — one "owner | action" per line.',
      styleTag: 'glass',
      palette: FROST.palette,
      fontId: FROST.fontId,
      samples: IG19_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-center',
      create: (_type, options) => ig19.create(options),
    },
    {
      id: 'ig20',
      name: 'Volt Recap',
      description: 'A sport half-time board — one "unit | note" per line, in heavy caps.',
      styleTag: 'sport',
      palette: VOLT.palette,
      fontId: VOLT.fontId,
      samples: IG20_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-left',
      create: (_type, options) => ig20.create(options),
    },
    {
      id: 'ig21',
      name: 'House Actions',
      description: 'The house action board — one "owner | action" per line in the void panel.',
      styleTag: 'noacg',
      palette: HOUSE.palette,
      fontId: HOUSE.fontId,
      samples: IG21_SAMPLES,
      animationPresets: ['rows-cascade'],
      defaultZone: 'mid-right',
      create: (_type, options) => ig21.create(options),
    },
  ],
};
