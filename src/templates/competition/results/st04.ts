// st04 "Clean Results" — the minimal result table, sibling of lt01 Hairline and card01
// Hairline Card. A newspaper table: hairline rules, tabular figures, nothing boxed. This is the
// design to reach for when the board IS the story — a full result list on screen for ten
// seconds — and the FINAL state is what turns it from "standings" into "result".

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  P,
  STANDINGS_FIELDS,
  STANDINGS_RUNTIME_JS,
  STANDINGS_STEPS,
  boardStructureCss,
  defineResultsVariant,
  standingsMarkup,
} from './shared';

export const st04: TemplateVariant = defineResultsVariant(
  {
    id: 'st04',
    category: 'results-board',
    name: 'Clean Results',
    styleTag: 'minimal',
    description: 'A quiet result table: hairline rules, tabular figures, nothing boxed.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Title', sample: 'FINAL RESULTS' },
      { title: 'Subtitle', sample: 'GRAND FINAL · BEST OF 5' },
    ],
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'mid-center',
  },
  {
    name: 'Clean Results',
    description:
      'The quiet result table: no panel, hairline-ruled rows, tabular figures in declared ' +
      'columns, a soft highlight for the row being discussed, and an accent rule under the ' +
      'winner once the result is final.',
    uicolor: '7',
  },
  (o) => ({
    html: standingsMarkup(o),
    fields: compFieldsFor(STANDINGS_FIELDS, o),
    hasAccent: true,
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    stageWidth: 1000,
    runtimeExtraJs: STANDINGS_RUNTIME_JS,
    revealSteps: STANDINGS_STEPS,
    css: `${boardStructureCss()}

/* No panel — a table of type over a soft scrim. */
.${P}-box {
  display: flex;
  flex-direction: column;
  gap: calc(18px * var(--scale));
  padding: calc(5px * var(--scale)) 0 0;
  min-width: calc(1000px * var(--scale));  /* footprint floor — a board reads as data at a glance, never as a note */
  text-shadow: 0 calc(3px * var(--scale)) calc(15px * var(--scale)) rgba(0, 0, 0, 0.55);
}

/* The accent — a hairline under the heading, the table's only rule. */
.${P}-accent {
  height: var(--accent-weight);
  background: var(--accent);
  transform-origin: left center;
}

/* The heading. */
.${P}-title {
  font-size: calc(38px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.08;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

.${P}-kicker {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The column headers. */
.${P}-col {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* One row — a hairline rule beneath, nothing else. */
.${P}-row {
  padding: calc(10px * var(--scale)) 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}

.${P}-row-index {
  min-width: calc(30px * var(--scale));
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  color: var(--text-dim);
}

.${P}-row-name {
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.14;
  color: var(--text-color);
}

.${P}-cell {
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 500;
  color: var(--text-dim);
}

.${P}-cell:last-child {
  color: var(--text-color);
  font-weight: 700;
}

/* ── The highlight and the final mark (machine states, never data writes). ── */

.${P}-spotlit .${P}-row {
  opacity: 0.4;
}

.${P}-spotlit .${P}-row-on {
  opacity: 1;
  border-bottom-color: var(--accent);
}

.${P}-spotlit .${P}-row-on .${P}-row-index {
  color: var(--accent);
}

/* FINAL — the winner's row takes the accent rule and its name the accent colour. */
.${P}-final .${P}-row:first-child {
  border-bottom-color: var(--accent);
}
.${P}-final .${P}-row:first-child .${P}-row-name,
.${P}-final .${P}-row:first-child .${P}-row-index {
  color: var(--accent);
}
.${P}-final .${P}-kicker::after {
  content: " · FINAL";
  color: var(--accent);
}`,
  }),
);
