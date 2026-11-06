// st02 "House Standings" — the NoaCG standings board, sibling of ig08 House Schedule and rs02
// House Roster. Void rows, mono column headers, amber positions, and an amber keyline on the
// highlighted row. At FINAL the leader's row takes the amber fill: the house's way of saying
// the table is decided without adding a word.

import { fontById, labelFontFaceCss } from '../../../model/fonts';
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

export const st02: TemplateVariant = defineResultsVariant(
  {
    id: 'st02',
    category: 'results-board',
    name: 'House Standings',
    styleTag: 'noacg',
    description: 'The house table: void rows, mono headers, amber positions and final mark.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Title', sample: 'GROUP A · STANDINGS' },
      { title: 'Subtitle', sample: 'AFTER MATCHDAY 4' },
    ],
    logo: 'none',
    animationPresets: ['comp-cascade', 'comp-rise', 'comp-bloom'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'mid-center',
  },
  {
    name: 'House Standings',
    description:
      'The NoaCG standings board: a void blur panel with an amber top edge, mono column ' +
      'headers, amber positions, an amber-keylined highlighted row, and an amber leader row ' +
      'once the table is final.',
    uicolor: '4',
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
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

${boardStructureCss()}

/* The board — the house void with its amber top edge. */
.${P}-box {
  display: flex;
  flex-direction: column;
  gap: calc(20px * var(--scale));
  padding: calc(25px * var(--scale)) calc(30px * var(--scale)) calc(28px * var(--scale));
  background: var(--panel-bg);
  backdrop-filter: var(--panel-blur);
  -webkit-backdrop-filter: var(--panel-blur);
  box-shadow: var(--panel-shadow);
  border-top: calc(3px * var(--scale)) solid color-mix(in srgb, var(--accent) 50%, transparent);
  min-width: calc(1000px * var(--scale));  /* footprint floor — a board reads as data at a glance, never as a note */
}

/* The accent rule between the heading and the table. */
.${P}-accent {
  height: calc(3px * var(--scale));
  background: var(--accent);
  box-shadow: var(--accent-glow);
  transform-origin: left center;
}

/* The heading. */
.${P}-title {
  font-size: calc(39px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.06;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

.${P}-kicker {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The column headers — mono, dim. */
.${P}-col {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--text-dim);
}

/* One table row — a denser void tile. */
.${P}-row {
  position: relative;
  padding: calc(10px * var(--scale)) calc(18px * var(--scale));
  border-radius: calc(8px * var(--scale));
  background: rgba(10, 12, 16, 0.5);
}

.${P}-row-index {
  min-width: calc(33px * var(--scale));
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: var(--label-tracking);
  color: var(--accent);
}

.${P}-row-name {
  font-size: calc(29px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.12;
  color: var(--text-color);
}

.${P}-cell {
  font-size: calc(25px * var(--scale) * var(--type-scale));
  font-weight: 500;
  color: var(--text-dim);
}

.${P}-cell:last-child {
  color: var(--accent);            /* the deciding column wears the accent */
  font-weight: var(--display-weight);
}

/* ── The highlight and the final mark (machine states, never data writes). ── */

.${P}-spotlit .${P}-row {
  opacity: 0.42;
}

.${P}-spotlit .${P}-row-on {
  opacity: 1;
  background: rgba(10, 12, 16, 0.78);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
}

.${P}-row-on::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: calc(5px * var(--scale));
  border-radius: calc(8px * var(--scale)) 0 0 calc(8px * var(--scale));
  background: var(--accent);
  box-shadow: var(--accent-glow);
}

/* FINAL — the leader takes the amber fill and the subtitle says the table is decided. */
.${P}-final .${P}-row:first-child {
  background: var(--accent);
  box-shadow: var(--accent-glow);
}
.${P}-final .${P}-row:first-child .${P}-row-name,
.${P}-final .${P}-row:first-child .${P}-cell,
.${P}-final .${P}-row:first-child .${P}-row-index {
  color: var(--accent-ink);
}
.${P}-final .${P}-kicker::after {
  content: " · FINAL";
  color: var(--accent);
}`,
  }),
);
