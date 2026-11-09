// es02 "House Series" — the NoaCG scorebug, sibling of sb03 House Score and lt11 House Strap.
// The house void: a blurred near-black panel with an amber top edge, an amber accent bar down
// the left, mono labels, and amber map scores in void chips. The series pips sit in the middle
// where the colon would be on a two-team scoreboard.

import { fontById, labelFontFaceCss } from '../../../model/fonts';
import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { compFieldsFor } from '../shared';
import {
  P,
  SCORE_FIELDS,
  SCORE_RUNTIME_JS,
  defineEsportsVariant,
  scoreMarkup,
  scoreStructureCss,
} from './shared';

const MARKUP = { logos: true, center: 'pips' as const };

export const es02: TemplateVariant = defineEsportsVariant(
  {
    id: 'es02',
    category: 'esports-score',
    name: 'House Series',
    styleTag: 'noacg',
    description: 'The house scorebug: void panel, amber edge, amber map scores and series pips.',
    maxLines: 5,
    suggestedLines: [
      { title: 'Team A', sample: 'TEAM LIQUID' },
      { title: 'Score A', sample: '1' },
      { title: 'Team B', sample: 'NAVI' },
      { title: 'Score B', sample: '1' },
      { title: 'Stage / map', sample: 'MAP 3 · MIRAGE' },
    ],
    logo: 'none',
    animationPresets: ['comp-rise', 'comp-impact', 'comp-bloom'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'top-center',
  },
  {
    name: 'House Series',
    description:
      'The NoaCG series scorebug, sibling of sb03 House Score: a void blur panel with an ' +
      'amber top edge and left accent bar, mono stage and phase labels, amber map scores in ' +
      'void chips, and amber series pips in the middle.',
    uicolor: '4',
  },
  (o) => ({
    html: scoreMarkup(o, MARKUP),
    fields: compFieldsFor(SCORE_FIELDS, o),
    hasAccent: true,
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    stageWidth: 1150,
    runtimeExtraJs: SCORE_RUNTIME_JS,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

${scoreStructureCss(MARKUP)}

/* The strip — the house void, with the family's amber top edge. */
.${P}-box {
  display: flex;                   /* head above body */
  flex-direction: column;          /* stacked */
  gap: calc(13px * var(--scale));  /* air between the head and the score row */
  padding: calc(16px * var(--scale)) calc(38px * var(--scale)) calc(19px * var(--scale)) calc(48px * var(--scale));
  background: var(--panel-bg);     /* void rgba(10,12,16,.86) */
  backdrop-filter: var(--panel-blur);  /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  box-shadow: var(--panel-shadow); /* one deep lifting shadow */
  border-top: calc(3px * var(--scale)) solid color-mix(in srgb, var(--accent) 50%, transparent);
  min-width: calc(1150px * var(--scale));  /* the strip holds its measure as scores change */
}

/* The accent bar — amber, fused to the left edge, wearing the house glow. */
.${P}-accent {
  position: absolute;              /* pinned over the strip's left edge */
  left: 0;
  top: 0;
  bottom: 0;
  width: var(--accent-weight);     /* the family's bar weight */
  background: var(--accent);
  box-shadow: var(--accent-glow);  /* the house glow — follows the accent color */
  transform-origin: left center;   /* the impact preset flashes it from its own edge */
}

/* The stage line — mono, wide-tracked: the house label voice. */
.${P}-stage {
  font-family: var(--font-label);  /* JetBrains Mono, the house label face */
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);       /* amber, per the family */
}

/* The phase chip — a void tile with a thin amber keyline. */
.${P}-status {
  padding: calc(4px * var(--scale)) calc(14px * var(--scale));
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-dim);
  background: rgba(10, 12, 16, 0.6);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
  flex-shrink: 0;
}

/* The team name — house display type on the void. */
.${P}-team {
  font-size: calc(40px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.08;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The score chip — a denser void tile with an amber keyline (the house chip). */
.${P}-chip {
  min-width: calc(75px * var(--scale));
  padding: calc(6px * var(--scale)) calc(19px * var(--scale));
  border-radius: calc(8px * var(--scale));  /* the house chip radius */
  background: rgba(10, 12, 16, 0.6);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 40%, transparent);
}

.${P}-figure {
  font-size: calc(48px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--accent);            /* amber figures */
  font-variant-numeric: tabular-nums;
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
}

/* The logo slot — a void plate until the operator picks a file. */
.${P}-logo {
  border-radius: calc(8px * var(--scale));
  background: rgba(10, 12, 16, 0.55);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}
.${P}-logo.has-image {
  background: transparent;
  box-shadow: none;
}

/* The series pips — amber for a won map, with the house glow on the leading side. */
.${P}-pip-a,
.${P}-pip-b {
  background: var(--accent);
  box-shadow: var(--accent-glow);
}

.${P}-series-label {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 500;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* ── Phase marks (the machine's states apply these; data never does). ── */

.${P}-live .${P}-status {
  color: var(--accent-ink);        /* dark ink on the amber chip */
  background: var(--accent);
  box-shadow: var(--accent-glow);
}

.${P}-final .${P}-figure {
  color: var(--text-color);        /* at full time the scores settle to paper white */
}
.${P}-final .${P}-status {
  color: var(--panel-bg);
  background: var(--text-color);
  box-shadow: none;
}

.${P}-paused .${P}-status {
  color: var(--panel-bg);
  background: var(--text-dim);
  box-shadow: none;
}
.${P}-paused .${P}-body {
  filter: opacity(0.55);           /* the match is on hold; a filter, since the entrance writes the body's opacity inline (#2275) */
}`,
  }),
);
