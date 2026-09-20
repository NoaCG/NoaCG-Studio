// ig41 "Showtime Facts" - the SHOWTIME family's key-facts board (types/lists.ts, key-facts),
// sibling of lt69 Showtime Strap and qz14 Showtime Quiz. A show's "how to play" card.
//
// The playbill. A marquee plaque with a bulb-coloured keyline and a row of bulbs along the top:
// the heading in the family's serif, each fact as a term in condensed billing caps over its
// explanation, and a fine bulb-coloured rule between facts.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { KEY_FACTS_FIELDS } from '../pack4/content';
import { typeLines } from '../types/graphicType';
import { buildGameShowFacts, GAME_SHOW_FACTS_SAMPLES } from './pack4/gameShowFacts';
import { defineInfographicVariant } from './shared';

/** A strip of marquee bulbs: evenly spaced dots in the accent, drawn with one gradient. */
const BULBS = 'radial-gradient(circle, var(--accent) 0, var(--accent) calc(5px * var(--scale)), transparent calc(6.5px * var(--scale)))';

export const ig41: TemplateVariant = defineInfographicVariant(
  {
    id: 'ig41',
    category: 'infographic',
    name: 'Showtime Facts',
    styleTag: 'showtime',
    description: 'A playbill of key facts on a marquee plaque: serif heading, terms in billing caps - one "term | explanation" per line.',
    maxLines: 2,
    suggestedLines: typeLines(KEY_FACTS_FIELDS, GAME_SHOW_FACTS_SAMPLES),
    logo: 'none',
    animationPresets: ['rows-cascade'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'mid-center',
  },
  {
    name: 'Showtime Facts',
    description:
      'The theatre-marquee key-facts board. A deep warm plaque with a bulb-coloured keyline ' +
      'and a row of bulbs: a serif heading, then each fact as a term in condensed billing caps ' +
      'over its explanation, split by fine rules. One "term | explanation" per line. Sibling ' +
      'of lt69 Showtime Strap.',
    uicolor: '6',
  },
  (o) => ({
    ...buildGameShowFacts(o, `${labelFontFaceCss(fontById('oswald'))}

/* The plaque: the family's deep ground lit from above, inside a bulb-coloured keyline and a
   dark surround. */
.infographic-box {
  position: relative;              /* anchors the bulb strip */
  padding: calc(66px * var(--scale)) calc(72px * var(--scale)) calc(44px * var(--scale));
  margin: calc(12px * var(--scale));  /* room for the surround, which sits outside the box */
  text-align: center;              /* a playbill is centred, top to bottom */
  border-radius: calc(56px * var(--scale));  /* a plaque this tall cannot be the family's full pill - the ends would eat the words */
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 84%, #ffffff) 0%,
              var(--panel-bg) 40%,
              color-mix(in srgb, var(--panel-bg) 76%, #000000) 100%);
  box-shadow: var(--panel-keyline),
              0 0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--panel-bg) 55%, #000000),
              var(--panel-shadow);  /* keyline, the dark surround, then the lift */
}

/* The accent: a row of bulbs inside the top edge, clear of the round corners. */
.infographic-accent {
  position: absolute;
  top: calc(24px * var(--scale));
  left: calc(70px * var(--scale));
  right: calc(70px * var(--scale));
  height: calc(14px * var(--scale));
  background: ${BULBS} 0 50% / calc(32px * var(--scale)) calc(14px * var(--scale)) repeat-x;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));  /* each bulb throws a little light */
  animation: infographic-bulb-chase 1s steps(2) infinite;  /* stepped: bulbs switch, they do not slide */
}
@keyframes infographic-bulb-chase {
  from { background-position-x: 0; }
  to   { background-position-x: calc(32px * var(--scale)); }
}

/* The heading - the family's serif, set like the title on a bill. */
.infographic-heading {
  margin-bottom: calc(10px * var(--scale));
  font-size: calc(52px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.22;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* One fact: the term above, then what it means. */
.infographic-row {
  padding: calc(16px * var(--scale)) 0;
}
/* A fine bulb-coloured rule between facts - not above the first, never below the last. */
.infographic-row + .infographic-row {
  border-top: calc(2px * var(--scale)) solid color-mix(in srgb, var(--accent) 45%, transparent);
}

/* The term - condensed billing caps in the bulb colour. */
.infographic-fact-term {
  display: block;                  /* its own row above the explanation */
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.32;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;       /* reads as a label, whatever the operator types */
  color: var(--label-color);
}

/* The explanation - the fact itself, and the reason for the board. */
.infographic-fact-note {
  display: block;                  /* its own row under the term */
  margin-top: calc(2px * var(--scale));
  font-size: calc(34px * var(--scale) * var(--type-scale));
  font-weight: 600;
  line-height: 1.32;
  color: var(--text-color);
  overflow-wrap: break-word;       /* spaces first, and never a hyphen on air */
}`),
    // The stage: the width the plaque holds a full-sentence fact at.
    stageWidth: 1080,
  }),
);
