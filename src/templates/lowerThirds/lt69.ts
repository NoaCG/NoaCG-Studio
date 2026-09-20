// lt69 "Showtime Strap" - the SHOWTIME family's lower third, sibling of qz14 Showtime Quiz and
// sb27 Showtime Score. It fills the lower-third type's showtime cell: a real accent element,
// the two lines the type declares, and the shared optional logo band.
//
// A marquee pill: a deep warm ground lit from above, a bulb-coloured keyline inside its edge and
// a dark surround outside it. The name is set in the family's serif, the title under it in
// condensed billing caps, and the accent is a lit five-point star at the pill's leading end.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineVariant, lineMasks } from './shared';
import { STAR_CLIP } from '../shared/gameShowShapes';

export const lt69: TemplateVariant = defineVariant(
  {
    id: 'lt69',
    category: 'lower-third',
    name: 'Showtime Strap',
    styleTag: 'showtime',
    description: 'A theatre-marquee pill led by a lit star - the name in serif over a title in billing caps.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Name', sample: 'Vivian Laine' },
      { title: 'Title', sample: 'Host of the evening' },
    ],
    logo: 'optional',
    // A marquee lights up; it does not slam. The fade leads and the spring is there for a bow.
    animationPresets: ['fade', 'pop-spring', 'slide-up', 'mask-wipe', 'slide-down'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Showtime Strap',
    description:
      'The theatre-marquee lower third. A deep warm pill with a bulb-coloured keyline and a ' +
      'dark surround, led by a lit star: the name in a high-contrast serif, the title in ' +
      'condensed billing caps. Sibling of qz14 Showtime Quiz and sb27 Showtime Score.',
    uicolor: '6',
  },
  (o) => ({
    // The accent rides INSIDE the box so every preset moves it with the pill.
    html: `    <!-- Showtime Strap: one pill, a lit star at its leading end. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
${lineMasks(o)}
    </div>`,
    css: `${labelFontFaceCss(fontById('oswald'))}

/* The pill: the family's deep ground, lit from above, inside a bulb-coloured keyline and a dark
   surround - the way a sign's lettering sits inside its frame. */
.lower-third-box {
  position: relative;              /* anchors the star */
  padding: calc(20px * var(--scale)) calc(64px * var(--scale)) calc(22px * var(--scale)) calc(104px * var(--scale));  /* the wide left clears the star */
  margin: calc(8px * var(--scale));  /* room for the surround, which sits outside the box */
  border-radius: var(--panel-radius);  /* the family's full pill */
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 86%, #ffffff) 0%,
              var(--panel-bg) 55%,
              color-mix(in srgb, var(--panel-bg) 78%, #000000) 100%);
  box-shadow: var(--panel-keyline),
              0 0 0 calc(8px * var(--scale)) color-mix(in srgb, var(--panel-bg) 62%, #000000),
              var(--panel-shadow);  /* keyline, the dark surround, then the lift */
}

/* The accent: a five-point star cut from a square, lit. A filter carries the light, because
   clip-path would cut a box-shadow away. */
.lower-third-accent {
  position: absolute;
  left: calc(34px * var(--scale));
  top: 50%;
  width: calc(46px * var(--scale));
  height: calc(46px * var(--scale));
  margin-top: calc(-23px * var(--scale));  /* centred on the pill, whatever its height */
  background: var(--accent);
  clip-path: ${STAR_CLIP};
  filter: drop-shadow(0 0 calc(8px * var(--scale)) var(--accent));
  will-change: transform;          /* line-reveal can grow this */
}

/* Name - the family's serif, set like a name on a bill. */
.lower-third-name {
  font-size: calc(46px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.26;             /* tall enough for this face's whole glyph box - a tighter line lets the reveal mask shave the descenders */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* Title - condensed billing caps in the bulb colour. */
.lower-third-title,
.lower-third-extra {
  margin-top: calc(6px * var(--scale));
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(23px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.32;               /* Oswald stands tall: room for its full glyph box inside the mask */
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}`,
    hasAccent: true,
  }),
);
