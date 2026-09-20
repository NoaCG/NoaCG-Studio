// ss23 "Showtime Sign-off" - the SHOWTIME family's closing card (types/signOff.ts), sibling of
// lt69 Showtime Strap and qz14 Showtime Quiz.
//
// The curtain call. The full frame is a burgundy curtain lit from above (the family ground in
// shared.ts); the card is a marquee plaque with a bulb-coloured keyline, a dark surround and a
// row of bulbs chasing along its top and bottom. The closing line is billing caps, the thank-you
// is the family's serif, and the rule is a lit star.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { STAR_CLIP } from '../shared/gameShowShapes';
import { defineStartingSoonVariant } from './shared';
import { signOffDesign } from './signOffShared';

/** A strip of marquee bulbs: evenly spaced dots in the accent, drawn with one gradient. */
const BULBS = 'radial-gradient(circle, var(--accent) 0, var(--accent) calc(5px * var(--scale)), transparent calc(6.5px * var(--scale)))';

export const ss23: TemplateVariant = defineStartingSoonVariant(
  {
    id: 'ss23',
    category: 'starting-soon',
    name: 'Showtime Sign-off',
    styleTag: 'showtime',
    description: 'A bulb-lit marquee plaque on a burgundy curtain: billing caps, a serif thank-you, a lit star.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Closing line', sample: 'UNTIL NEXT TIME' },
      { title: 'Message', sample: 'Thanks for watching' },
      { title: 'Next broadcast', sample: 'Back Thursday at 19:00' },
    ],
    logo: 'optional',
    animationPresets: ['hold-still'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'mid-center',
  },
  {
    name: 'Showtime Sign-off',
    description:
      'The theatre-marquee closing card. A burgundy curtain lit from above, and on it a plaque ' +
      'with a bulb-coloured keyline and chasing bulbs: logo, closing line in billing caps, a ' +
      'serif thank-you, a lit star, and an optional next broadcast. Sibling of lt69 Showtime Strap.',
    uicolor: '6',
  },
  (o) => ({
    ...signOffDesign(o, {
      label: 'Showtime Sign-off',
      css: `${labelFontFaceCss(fontById('oswald'))}

/* The plaque: the family's deep ground lit from above, inside a bulb-coloured keyline and a
   dark surround. */
.starting-soon-box {
  position: relative;              /* anchors the two bulb strips */
  display: flex;                   /* a centred column: logo, billing, message, star, next */
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: calc(700px * var(--scale));
  padding: calc(64px * var(--scale)) calc(96px * var(--scale)) calc(66px * var(--scale));
  border-radius: calc(72px * var(--scale));  /* a plaque this tall cannot be the family's full pill - the ends would eat the words */
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 84%, #ffffff) 0%,
              var(--panel-bg) 50%,
              color-mix(in srgb, var(--panel-bg) 76%, #000000) 100%);
  box-shadow: var(--panel-keyline),
              0 0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--panel-bg) 55%, #000000),
              var(--panel-shadow);  /* keyline, the dark surround, then the lift */
}

/* The bulbs: one strip inside the top edge, one inside the bottom, clear of the round corners. */
.starting-soon-box::before,
.starting-soon-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  left: calc(84px * var(--scale));
  right: calc(84px * var(--scale));
  height: calc(14px * var(--scale));
  background: ${BULBS} 0 50% / calc(32px * var(--scale)) calc(14px * var(--scale)) repeat-x;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));  /* each bulb throws a little light */
  animation: starting-soon-bulb-chase 1s steps(2) infinite;  /* stepped: bulbs switch, they do not slide */
  pointer-events: none;
}
.starting-soon-box::before { top: calc(20px * var(--scale)); }
.starting-soon-box::after  { bottom: calc(20px * var(--scale)); animation-direction: reverse; }
@keyframes starting-soon-bulb-chase {
  from { background-position-x: 0; }
  to   { background-position-x: calc(32px * var(--scale)); }
}

/* The closing line - condensed billing caps in the bulb colour. */
.starting-soon-kicker {
  margin-top: calc(18px * var(--scale));
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(26px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.32;               /* Oswald stands tall: room for its full glyph box inside the mask */
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The thank-you - the family's serif, set like the title on a bill. */
.starting-soon-message {
  margin-top: calc(8px * var(--scale));
  font-size: calc(74px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.22;               /* tall enough for the serif's whole glyph box inside the mask */
  padding: 0.05em 0;               /* this face's glyph box is a little taller than the line: the room goes on the text, where the reveal mask counts it */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The rule - a lit star. A filter carries the light, because clip-path cuts a box-shadow away. */
.starting-soon-rule {
  width: calc(44px * var(--scale));
  height: calc(44px * var(--scale));
  margin: calc(18px * var(--scale)) 0 calc(16px * var(--scale));
  background: var(--accent);
  clip-path: ${STAR_CLIP};
  filter: drop-shadow(0 0 calc(8px * var(--scale)) var(--accent));
  will-change: transform;          /* the hold animates this element */
}

/* The next broadcast. */
.starting-soon-next {
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 600;
  line-height: 1.36;
  color: var(--text-dim);
}`,
    }),
    // The stage: the width the plaque holds a full-length thank-you at.
    stageWidth: 1080,
  }),
);
