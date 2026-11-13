// RESULT BOARD: the vote's result in three layouts and three placements (interaction spec
// AC-12, `poll/results.ts`). The live vote's arc, buttons, structure and four fields, plus one
// more: Figures, which says whether each option shows its share, its count or both. A type of its
// own because a type declares one field list (types/AGENTS.md), and the live vote's is four.

import { paletteById } from '../../model/wizard';
import { POLL_FIGURES_CHOICES } from '../poll/shared';
import { RESULT_BOARD_GRID, RESULT_BOARD_SAMPLES, RESULT_BOARDS_CATALOG } from '../poll/results';
import type { GraphicType } from './graphicType';
import { LIVE_POLL_CONTROLS, LIVE_POLL_MACHINE, livePollType } from './livePoll';

export const resultBoardType: GraphicType = {
  id: 'result-board',
  name: 'Vote result',
  description: 'A vote’s result as bars across, bars up or a donut, full screen, as a lower third or at the side.',
  structure: livePollType.structure,
  fields: [
    { key: 'question', label: 'Question', kind: 'text', value: RESULT_BOARD_SAMPLES.question, role: 'line' },
    { key: 'options', label: 'Options', kind: 'lines', value: RESULT_BOARD_SAMPLES.options, role: 'line' },
    { key: 'footnote', label: 'Vote count', kind: 'text', value: RESULT_BOARD_SAMPLES.footnote, role: 'line' },
    { key: 'cue', label: 'Vote badge', kind: 'text', value: RESULT_BOARD_SAMPLES.cue, role: 'line' },
    {
      key: 'figures',
      label: 'Figures',
      kind: 'select',
      value: 'percent',
      role: 'data',
      options: POLL_FIGURES_CHOICES.map((c) => ({ label: c.label, value: c.value })),
    },
  ],
  machine: LIVE_POLL_MACHINE,
  controls: LIVE_POLL_CONTROLS,
  capabilities: { ...livePollType.capabilities, defaultZone: 'mid-center' },
  designs: RESULT_BOARD_GRID.map((g, i) => {
    const variant = RESULT_BOARDS_CATALOG[i];
    return {
      id: g.id,
      name: variant.name,
      description: variant.description,
      styleTag: 'noacg' as const,
      palette: paletteById('noacg'),
      fontId: 'space-grotesk',
      samples: RESULT_BOARD_SAMPLES,
      defaultZone: variant.defaultZone,
      create: (_type, options) => variant.create(options),
    };
  }),
};
