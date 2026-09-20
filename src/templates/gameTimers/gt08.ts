// gt08 "Showtime Clock" - the SHOWTIME family's countdown (types/clocks.ts, countdown), sibling
// of lt69 Showtime Strap and qz14 Showtime Quiz.
//
// A marquee pill: the round's name in condensed billing caps at the leading end, a lit star, and
// the clock in a dark well with its own bulb-coloured ring at the other. When time runs out the
// well lights up - it floods to the bulb colour and the numerals go dark.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { STAR_CLIP } from '../shared/gameShowShapes';
import { defineGameTimerVariant } from './shared';

export const gt08: TemplateVariant = defineGameTimerVariant(
  {
    id: 'gt08',
    category: 'game-timer',
    name: 'Showtime Clock',
    styleTag: 'showtime',
    description: 'A marquee pill: the round in billing caps, a lit star, and the clock in a ringed dark well.',
    maxLines: 1,
    suggestedLines: [{ title: 'Label', sample: 'ROUND 1' }],
    logo: 'none',
    animationPresets: ['timer-line-reveal', 'timer-run'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'top-center',
  },
  {
    name: 'Showtime Clock',
    description:
      'The theatre-marquee countdown. One deep warm pill with a bulb-coloured keyline: the ' +
      'round name in condensed billing caps, a lit star, and the clock in a dark well with its ' +
      'own ring. At zero the well floods to the bulb colour. Sibling of lt69 Showtime Strap.',
    uicolor: '6',
  },
  () => ({
    html: `    <!-- Showtime Clock: ( LABEL  star  [clock well] ) - one pill. -->
    <div class="game-timer-box">
      <!-- The label line - #f0 is the field, set in the family's billing caps. -->
      <div class="game-timer-mask"><span id="f0">ROUND 1</span></div>
      <!-- The star - the design's one accent moment. -->
      <div class="game-timer-accent"></div>
      <!-- The clock - the countdown runtime repaints this as M:SS. -->
      <div class="game-timer-clock">3:00</div>
    </div>`,
    css: `${labelFontFaceCss(fontById('oswald'))}

/* The pill: the family's deep ground, lit from above, inside a bulb-coloured keyline and a dark
   surround. */
.game-timer-box {
  display: flex;                   /* label, star, clock well - on one centre line */
  align-items: center;
  padding: calc(10px * var(--scale)) calc(12px * var(--scale)) calc(10px * var(--scale)) calc(40px * var(--scale));
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

/* The label - condensed billing caps in the bulb colour. */
.game-timer-mask {
  flex: 1 1 auto;                  /* the label takes what the star and the well leave */
  min-width: 0;
}
.game-timer-mask > span {
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.32;               /* Oswald stands tall: room for its full glyph box inside the mask */
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;       /* reads as a label, whatever the operator types */
  color: var(--label-color);
}

/* The star - lit. A filter carries the light, because clip-path cuts a box-shadow away. */
.game-timer-accent {
  flex: none;
  width: calc(34px * var(--scale));
  height: calc(34px * var(--scale));
  margin: 0 calc(22px * var(--scale));
  background: var(--accent);
  clip-path: ${STAR_CLIP};
  filter: drop-shadow(0 0 calc(7px * var(--scale)) var(--accent));
  will-change: transform;          /* line-reveal scales this */
}

/* The clock well - a darker pill inside the pill, ringed in the bulb colour. */
.game-timer-clock {
  flex: none;
  min-width: calc(190px * var(--scale));  /* four digits without the pill jumping */
  padding: calc(4px * var(--scale)) calc(30px * var(--scale));
  text-align: center;
  border-radius: var(--panel-radius);
  border: calc(3px * var(--scale)) solid var(--accent);
  background: color-mix(in srgb, var(--panel-bg) 68%, #000000);
  font-size: calc(64px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.24;               /* the figure's whole glyph box */
  font-variant-numeric: lining-nums tabular-nums;  /* serif figures: lining, and no jiggle */
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
  color: var(--accent);
  transition: background 0.3s ease, color 0.3s ease, box-shadow 0.3s ease;
  will-change: transform, opacity; /* presets fade this up */
}

/* Time's up - the well lights: it floods to the bulb colour and the numerals go dark. */
.game-timer-done .game-timer-clock {
  background: var(--accent);
  color: var(--accent-ink);
  box-shadow: var(--accent-glow);
  animation: game-timer-flash 1.2s ease-out 1;
}
@keyframes game-timer-flash {
  0%, 40%, 100% { opacity: 1; }    /* lit... */
  20%, 60% { opacity: 0.35; }      /* ...a flicker, twice, like a bulb catching - then steady */
}`,
    hasAccent: true,
    // The stage: a pill that holds a short round name beside a four-digit clock.
    stageWidth: 560,
  }),
);
