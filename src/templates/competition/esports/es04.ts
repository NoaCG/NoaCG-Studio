// es04 "Clean Series" — the minimal scorebug, sibling of lt01 Hairline and sb02 Quiet Score.
// No panel: two names either side of a plain divider, a hairline accent rule down the left,
// and the phase said in small caps rather than shouted on a chip. The analytical end of the
// pack — for a desk segment or a tournament stream that keeps its frame quiet.
//
// The logo slots are still here (every design of the type carries the type's fields), just
// drawn small and plateless: an operator who has crests can use them, and one who hasn't sees
// nothing at all rather than an empty grey square.

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

const MARKUP = { logos: true, center: 'divider' as const };

export const es04: TemplateVariant = defineEsportsVariant(
  {
    id: 'es04',
    category: 'esports-score',
    name: 'Clean Series',
    styleTag: 'minimal',
    description: 'A panel-free match strip: two names, a divider, and a quiet phase line.',
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
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'top-left',
  },
  {
    name: 'Clean Series',
    description:
      'The quiet series scorebug: no panel, a hairline accent rule under the stage line, two ' +
      'team names around a plain divider, and the match phase set in small caps.',
    uicolor: '7',
  },
  (o) => ({
    html: scoreMarkup(o, MARKUP),
    fields: compFieldsFor(SCORE_FIELDS, o),
    hasAccent: true,
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    stageWidth: 950,
    runtimeExtraJs: SCORE_RUNTIME_JS,
    css: `${scoreStructureCss(MARKUP)}

/* No panel at all — the strip is type on a rule, drawn against the frame. */
.${P}-box {
  display: flex;                   /* head above body */
  flex-direction: column;          /* stacked */
  gap: calc(13px * var(--scale));  /* air between the stage line and the scores */
  padding-left: calc(23px * var(--scale));  /* room for the accent rule on the left */
  min-width: calc(950px * var(--scale));
  text-shadow: 0 calc(3px * var(--scale)) calc(13px * var(--scale)) rgba(0, 0, 0, 0.5);  /* legibility over video, with no panel to sit on */
}

/* The accent — a hairline rule down the left, the only mark the design makes. */
.${P}-accent {
  position: absolute;              /* pinned along the left of the block */
  left: 0;
  top: calc(5px * var(--scale));   /* stops a hair short, top and bottom */
  bottom: calc(5px * var(--scale));
  width: var(--accent-weight);     /* the family's hairline weight */
  background: var(--accent);
  transform-origin: left center;
}

/* The stage line — small caps, wide-tracked, dim. */
.${P}-stage {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 600;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The phase — said, not shouted: no chip, just the accent's colour when live. */
.${P}-status {
  font-family: var(--font-label);
  font-size: calc(20px * var(--scale) * var(--type-scale));
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--text-dim);
  flex-shrink: 0;
}

/* The team name — the minimal family's quiet display type. */
.${P}-team {
  font-size: calc(35px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.1;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* No chip plate — the figure stands on its own beside the name. */
.${P}-chip {
  min-width: calc(55px * var(--scale));
}

.${P}-figure {
  font-size: calc(38px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1;
  color: var(--accent);
  font-variant-numeric: tabular-nums;
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
}

/* The logo slot — plateless and small: an empty one shows nothing at all. */
.${P}-logo {
  width: calc(38px * var(--scale));
  height: calc(38px * var(--scale));
}

/* The divider between the two sides. */
.${P}-divider {
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 400;
  line-height: 1;
  color: var(--text-dim);
}

/* ── Phase marks (the machine's states apply these; data never does). ── */

.${P}-live .${P}-status {
  color: var(--accent);            /* live simply turns the word the accent's colour */
}

.${P}-final .${P}-status {
  color: var(--text-color);
}
.${P}-final .${P}-figure {
  color: var(--text-color);        /* the decided score settles to the text colour */
}

.${P}-paused .${P}-status {
  color: var(--text-dim);
  font-style: italic;              /* a pause is an aside, not an announcement */
}
.${P}-paused .${P}-body {
  filter: opacity(0.55);           /* the match is on hold; a filter, since the entrance writes the body's opacity inline (#2275) */
}`,
  }),
);
