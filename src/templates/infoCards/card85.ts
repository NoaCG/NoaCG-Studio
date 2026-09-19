// card85 "Showtime Title" - the SHOWTIME family's title card (types/cards.ts, title-card),
// sibling of lt69 Showtime Strap and qz14 Showtime Quiz.
//
// The name over the theatre door: a marquee plaque with a bulb-coloured keyline, a dark surround
// and bulbs chasing along its top and bottom. The kicker is condensed billing caps, the title is
// the family's serif at full size, and a lit star sits between the title and the subtitle.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { STAR_CLIP } from '../shared/gameShowShapes';
import { defineCardVariant, cardLineClass } from './shared';

/** A strip of marquee bulbs: evenly spaced dots in the accent, drawn with one gradient. */
const BULBS = 'radial-gradient(circle, var(--accent) 0, var(--accent) calc(5px * var(--scale)), transparent calc(6.5px * var(--scale)))';

export const card85: TemplateVariant = defineCardVariant(
  {
    id: 'card85',
    category: 'info-card',
    name: 'Showtime Title',
    styleTag: 'showtime',
    description: 'A bulb-lit marquee plaque as the show opener: billing-caps kicker, a big serif title, a lit star.',
    maxLines: 5,
    suggestedLines: [
      { title: 'Title', sample: 'Quiz Night Live' },
      { title: 'Kicker', sample: 'Round one' },
      { title: 'Subtitle', sample: 'Two players · ten questions' },
    ],
    logo: 'optional',
    // A marquee lights up; it does not slam.
    animationPresets: ['fade', 'blur-in', 'mask-wipe', 'slide-up', 'slide-down'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'mid-center',
  },
  {
    name: 'Showtime Title',
    description:
      'The theatre-marquee show opener. A deep warm plaque with a bulb-coloured keyline, a dark ' +
      'surround and chasing bulbs: the kicker in condensed billing caps, a big serif title, a ' +
      'lit star, and a subtitle. Sibling of lt69 Showtime Strap.',
    uicolor: '6',
  },
  (o) => {
    // Visual order is kicker (f1), title (f0), star, subtitle (f2), then anything extra, so the
    // masks are emitted by hand; field ids stay f0/f1/f2 whatever the visual order.
    const mask = (i: number) =>
      `      <!-- ${o.lines[i].title} (f${i}) - the field's value is written straight into this element. -->\n` +
      `      <div class="info-card-mask"><span id="f${i}" class="${cardLineClass(i)}">${o.lines[i].sample}</span></div>`;
    const kicker = o.lines.length > 1 ? `${mask(1)}\n` : '';
    const rest = o.lines.slice(2).map((_, k) => `\n${mask(k + 2)}`).join('');

    return {
      html: `    <!-- Showtime Title: a marquee plaque - kicker, title, a lit star, subtitle. -->
    <div class="info-card-box">
${kicker}${mask(0)}
      <div class="info-card-accent"></div>${rest}
    </div>`,
      css: `${labelFontFaceCss(fontById('oswald'))}

/* The plaque: the family's deep ground lit from above, inside a bulb-coloured keyline and a
   dark surround. */
.info-card-box {
  position: relative;              /* anchors the two bulb strips */
  display: flex;                   /* a centred column */
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: calc(66px * var(--scale)) calc(110px * var(--scale)) calc(64px * var(--scale));
  margin: calc(12px * var(--scale));  /* room for the surround, which sits outside the box */
  border-radius: calc(80px * var(--scale));  /* a plaque this tall cannot be the family's full pill - the ends would eat the words */
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 84%, #ffffff) 0%,
              var(--panel-bg) 50%,
              color-mix(in srgb, var(--panel-bg) 76%, #000000) 100%);
  box-shadow: var(--panel-keyline),
              0 0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--panel-bg) 55%, #000000),
              var(--panel-shadow);  /* keyline, the dark surround, then the lift */
}

/* The bulbs: one strip inside the top edge, one inside the bottom, clear of the round corners. */
.info-card-box::before,
.info-card-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  left: calc(92px * var(--scale));
  right: calc(92px * var(--scale));
  height: calc(14px * var(--scale));
  background: ${BULBS} 0 50% / calc(32px * var(--scale)) calc(14px * var(--scale)) repeat-x;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));  /* each bulb throws a little light */
  animation: info-card-bulb-chase 1s steps(2) infinite;  /* stepped: bulbs switch, they do not slide */
  pointer-events: none;
}
.info-card-box::before { top: calc(22px * var(--scale)); }
.info-card-box::after  { bottom: calc(22px * var(--scale)); animation-direction: reverse; }
@keyframes info-card-bulb-chase {
  from { background-position-x: 0; }
  to   { background-position-x: calc(32px * var(--scale)); }
}

/* Kicker - condensed billing caps in the bulb colour. */
.info-card-title {
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.32;               /* Oswald stands tall: room for its full glyph box inside the mask */
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* Title - the family's serif, set like the title on a bill. */
.info-card-name {
  margin-top: calc(6px * var(--scale));
  font-size: calc(104px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.2;                /* tall enough for the serif's whole glyph box inside the mask */
  padding: 0.05em 0;               /* this face's glyph box is a little taller than the line: the room goes on the text, where the reveal mask counts it */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The accent - a lit star. A filter carries the light, because clip-path cuts a box-shadow away. */
.info-card-accent {
  width: calc(44px * var(--scale));
  height: calc(44px * var(--scale));
  margin: calc(12px * var(--scale)) 0 calc(10px * var(--scale));
  background: var(--accent);
  clip-path: ${STAR_CLIP};
  filter: drop-shadow(0 0 calc(8px * var(--scale)) var(--accent));
  will-change: transform;          /* line-reveal can grow this */
}

/* Subtitle, and any extra line under it. */
.info-card-extra {
  font-size: calc(34px * var(--scale) * var(--type-scale));
  font-weight: 600;
  line-height: 1.36;
  color: var(--text-dim);
}`,
      hasAccent: true,
      // The stage: the width the plaque holds a three-word title at.
      stageWidth: 1240,
    };
  },
);
