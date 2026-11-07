// es03 "Frost Series" — the glass scorebug, sibling of lt08 Frosted Card and sb04 Frost Score.
// A frosted, softly-rounded strip: the panel blurs whatever is behind it, the accent is a soft
// bar under the head rather than a slab, and the map scores sit in glass chips. Analytical
// rather than aggressive — the studio-desk take on a match strip.

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

export const es03: TemplateVariant = defineEsportsVariant(
  {
    id: 'es03',
    category: 'esports-score',
    name: 'Frost Series',
    styleTag: 'glass',
    description: 'A frosted match strip: glass score chips, a soft accent rule, series pips.',
    maxLines: 5,
    suggestedLines: [
      { title: 'Team A', sample: 'TEAM LIQUID' },
      { title: 'Score A', sample: '1' },
      { title: 'Team B', sample: 'NAVI' },
      { title: 'Score B', sample: '1' },
      { title: 'Stage / map', sample: 'MAP 3 · MIRAGE' },
    ],
    logo: 'none',
    animationPresets: ['comp-rise', 'comp-bloom', 'comp-impact'],
    defaultPalette: paletteById('frost'),
    defaultFontId: 'manrope',
    defaultZone: 'top-center',
  },
  {
    name: 'Frost Series',
    description:
      'The glass series scorebug: a frosted, softly-rounded strip with a soft accent rule ' +
      'under the stage line, team logos, map scores in glass chips, and the series pips ' +
      'between them.',
    uicolor: '2',
  },
  (o) => ({
    html: scoreMarkup(o, MARKUP),
    fields: compFieldsFor(SCORE_FIELDS, o),
    hasAccent: true,
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    stageWidth: 1130,
    runtimeExtraJs: SCORE_RUNTIME_JS,
    css: `${scoreStructureCss(MARKUP)}

/* The strip — frosted glass, softly rounded, lifted on a wide shadow. */
.${P}-box {
  display: flex;                   /* head above body */
  flex-direction: column;          /* stacked */
  gap: calc(15px * var(--scale));  /* generous air — the glass family breathes */
  padding: calc(20px * var(--scale)) calc(38px * var(--scale)) calc(23px * var(--scale));
  background: var(--panel-bg);     /* the translucent glass surface */
  backdrop-filter: var(--panel-blur);  /* blur whatever is behind it */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  border-radius: var(--panel-radius);  /* the family's soft corners */
  box-shadow: var(--panel-shadow), var(--panel-keyline);  /* lift, plus the 1px inner edge */
  min-width: calc(1125px * var(--scale));
}

/* The accent — a soft rule between the head and the scores, not a slab down the edge. */
.${P}-accent {
  width: 100%;                     /* it spans the panel's text measure */
  height: var(--accent-weight);    /* the family's rule weight */
  border-radius: 999px;            /* fully rounded — a glass rule has no hard ends */
  background: linear-gradient(90deg,
    color-mix(in srgb, var(--accent) 85%, transparent),
    color-mix(in srgb, var(--accent) 15%, transparent));  /* fades toward the far end */
  transform-origin: left center;   /* the rise preset draws it out from the left */
}

/* The stage line — the glass label voice: accent-tinted, wide-tracked. */
.${P}-stage {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);       /* the accent, per the family */
}

/* The phase chip — a glass tile with a hairline edge. */
.${P}-status {
  padding: calc(5px * var(--scale)) calc(15px * var(--scale));
  border-radius: 999px;            /* a pill, the family's chip shape */
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--text-dim);
  background: rgba(255, 255, 255, 0.12);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18);
  flex-shrink: 0;
}

/* The team name — the glass family's lighter display type. */
.${P}-team {
  font-size: calc(38px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.1;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The score chip — a rounded glass tile. */
.${P}-chip {
  min-width: calc(75px * var(--scale));
  padding: calc(8px * var(--scale)) calc(20px * var(--scale));
  border-radius: calc(15px * var(--scale));
  background: rgba(255, 255, 255, 0.14);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2);
}

.${P}-figure {
  font-size: calc(43px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--text-color);        /* white on glass; the accent stays in the pips */
  font-variant-numeric: tabular-nums;
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
}

/* The logo slot — a glass plate until a file lands in it. */
.${P}-logo {
  border-radius: calc(13px * var(--scale));
  background: rgba(255, 255, 255, 0.1);
}
.${P}-logo.has-image {
  background: transparent;
}

/* The series pips — a won map takes the accent. */
.${P}-pip {
  height: calc(6px * var(--scale));  /* a finer mark than the sport strip's */
}
.${P}-pip-a,
.${P}-pip-b {
  background: var(--accent);
}

.${P}-series-label {
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* ── Phase marks (the machine's states apply these; data never does). ── */

.${P}-live .${P}-status {
  color: var(--accent-ink);        /* the family's ink on an accent-filled chip */
  background: var(--accent);
  box-shadow: none;
}

.${P}-final .${P}-figure {
  color: var(--accent);            /* on glass the decided score takes the accent */
}
.${P}-final .${P}-status {
  color: var(--panel-bg);
  background: var(--text-color);
  box-shadow: none;
}

.${P}-paused .${P}-status {
  color: var(--panel-bg);
  background: var(--text-dim);
}
.${P}-paused .${P}-body {
  filter: opacity(0.55);           /* the match is on hold; a filter, since the entrance writes the body's opacity inline (#2275) */
}`,
  }),
);
