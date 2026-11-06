// st01 "League Table" — the sport standings board. Any set of columns the operator declares
// (W · L · +/- · PTS by default, but a medal table or a prize list works the same way), one
// row per team, a highlighted row for whoever is being talked about, and a FINAL state that
// turns the same board from a standings table into a result table.

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

export const st01: TemplateVariant = defineResultsVariant(
  {
    id: 'st01',
    category: 'results-board',
    name: 'League Table',
    styleTag: 'sport',
    description: 'A standings table with any columns you declare — and a FINAL state.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Title', sample: 'GROUP A · STANDINGS' },
      { title: 'Subtitle', sample: 'AFTER MATCHDAY 4' },
    ],
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-impact'],
    defaultPalette: paletteById('volt'),
    defaultFontId: 'oswald',
    defaultZone: 'mid-center',
  },
  {
    name: 'League Table',
    description:
      'The sport standings board: a titled table whose columns come from the operator’s own ' +
      'header line, a highlighted row for the team being discussed, and a FINAL mark for when ' +
      'the table stops being provisional.',
    uicolor: '5',
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

/* The board — a square-cut sport panel. */
.${P}-box {
  display: flex;
  flex-direction: column;
  gap: calc(20px * var(--scale));
  padding: calc(28px * var(--scale)) calc(33px * var(--scale)) calc(30px * var(--scale));
  background: var(--panel-bg);
  border-radius: var(--panel-radius);
  box-shadow: var(--panel-shadow);
  min-width: calc(1000px * var(--scale));  /* footprint floor — a board reads as data at a glance, never as a note */
}

/* The accent rule between the heading and the table. */
.${P}-accent {
  height: calc(4px * var(--scale));
  background: var(--accent);
  transform-origin: left center;
}

/* The heading. */
.${P}-title {
  font-size: calc(43px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.05;
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;
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
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* One table row. */
.${P}-row {
  position: relative;
  padding: calc(10px * var(--scale)) calc(18px * var(--scale));
  background: rgba(0, 0, 0, 0.32);
}

.${P}-row-index {
  min-width: calc(33px * var(--scale));
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  color: var(--accent);
}

.${P}-row-name {
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.1;
  text-transform: uppercase;
  color: var(--text-color);
}

/* The value cells. */
.${P}-cell {
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: 600;
  color: var(--text-dim);
}

/* The last column is the one that matters most — points, time, prize. */
.${P}-cell:last-child {
  color: var(--text-color);
  font-weight: var(--display-weight);
}

/* ── The highlight and the final mark (machine states, never data writes). ── */

.${P}-spotlit .${P}-row {
  opacity: 0.45;
}

.${P}-spotlit .${P}-row-on {
  opacity: 1;
  background: rgba(0, 0, 0, 0.62);
}

.${P}-row-on::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(6px * var(--scale));
  background: var(--accent);
}

/* FINAL — the table stops being provisional: the leader's row takes the accent outright and
   the heading says so. */
.${P}-final .${P}-row:first-child {
  background: var(--accent);
}
.${P}-final .${P}-row:first-child .${P}-row-name,
.${P}-final .${P}-row:first-child .${P}-cell,
.${P}-final .${P}-row:first-child .${P}-row-index {
  color: var(--accent-ink);
}
.${P}-final .${P}-kicker::after {
  content: " · FINAL";             /* the subtitle says what the state means */
  color: var(--accent);
}`,
  }),
);
