// rs04 "Initiative Order" - the roster structure used as a tabletop turn tracker. Combatant
// count and status notes remain editable data; the existing spotlight event moves the current
// turn atomically and snap recovery can restore any legal state.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import type { TypeField } from '../../types/graphicType';
import { cleanRosterDesign } from './rs03';
import { defineResultsVariant } from './shared';

const INITIATIVE_FIELDS: TypeField[] = [
  { key: 'title', label: 'Title', kind: 'text', value: 'INITIATIVE ORDER', role: 'line' },
  {
    key: 'team',
    label: 'Encounter',
    kind: 'text',
    value: 'THE SUNKEN CITADEL - LOWER VAULT',
    role: 'line',
  },
  {
    key: 'players',
    label: 'Combatants (one per line: "Name | status")',
    kind: 'lines',
    value:
      'SERAPHINA MOONWHISPER | 18 HP\n' +
      'CAPTAIN ALDRIC VON STURM | CONCENTRATING\n' +
      'ANCIENT CRIMSON OWLBEAR | BLOODIED\n' +
      'THANE IRONHEART | DODGING',
    role: 'data',
  },
  { key: 'spotlight', label: 'Current turn', kind: 'number', value: '2', role: 'data' },
  { key: 'crest', label: 'Encounter emblem', kind: 'image', value: '', role: 'data' },
];

export const rs04: TemplateVariant = defineResultsVariant(
  {
    id: 'rs04',
    category: 'results-board',
    name: 'Initiative Order',
    styleTag: 'minimal',
    description: 'A tabletop turn order with status notes and an operator-controlled current turn.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Title', sample: 'INITIATIVE ORDER' },
      { title: 'Encounter', sample: 'THE SUNKEN CITADEL - LOWER VAULT' },
    ],
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'mid-left',
  },
  {
    name: 'Initiative Order',
    description:
      'A tabletop turn tracker with one row per combatant, an editable condition or hit-point ' +
      'note, and an operator-controlled current turn.',
    uicolor: '7',
  },
  (o) => ({
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    ...cleanRosterDesign(o, INITIATIVE_FIELDS),
    stageWidth: 1080,
  }),
);
