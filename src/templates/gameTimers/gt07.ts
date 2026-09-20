// gt07 "Sticker Clock" - the STICKER family's countdown (types/clocks.ts, countdown), sibling of
// lt68 Sticker Strap and qz13 Sticker Quiz.
//
// An answer clock as a shelf label: a solid ink strip across the top carrying the round's name,
// a big heavy clock printed on the paper under it, and a thick accent bar along the bottom inside
// the outline. When time runs out the paper floods accent and the clock blinks in hard steps -
// the family snaps, it never eases.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineGameTimerVariant } from './shared';

export const gt07: TemplateVariant = defineGameTimerVariant(
  {
    id: 'gt07',
    category: 'game-timer',
    name: 'Sticker Clock',
    styleTag: 'sticker',
    description: 'A paper label with an ink title strip, a big heavy clock and an accent bar along the bottom.',
    maxLines: 1,
    suggestedLines: [{ title: 'Label', sample: 'ROUND 1' }],
    logo: 'none',
    animationPresets: ['timer-line-reveal', 'timer-run'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'top-center',
  },
  {
    name: 'Sticker Clock',
    description:
      'The neo-brutal countdown. A flat paper label with a thick outline and a hard offset ' +
      'shadow: the round name on a solid ink strip, a big heavy clock under it, an accent bar ' +
      'along the bottom. At zero the paper floods accent and the clock blinks in hard steps. ' +
      'Sibling of lt68 Sticker Strap.',
    uicolor: '2',
  },
  () => ({
    html: `    <!-- Sticker Clock: [ink strip with the label] / [big clock] / [accent bar]. -->
    <div class="game-timer-box">
      <!-- The label line - #f0 is the field; it sits on the ink strip. -->
      <div class="game-timer-mask"><span id="f0">ROUND 1</span></div>
      <!-- The clock - the countdown runtime repaints this as M:SS. -->
      <div class="game-timer-clock">3:00</div>
      <!-- The accent bar - the design's one accent moment, inside the outline. -->
      <div class="game-timer-accent"></div>
    </div>`,
    css: `/* The box: presets animate THIS element, so it carries no lean of its own - the label is
   painted on the layer below, where no tween can flatten it. */
.game-timer-box {
  position: relative;              /* anchors the painted label (::before) */
  z-index: 0;                      /* its own stacking context, so the paper stays behind the clock */
  display: flex;                   /* strip, clock, bar - top to bottom */
  flex-direction: column;
  align-items: stretch;            /* the strip and the bar run the label's full width */
  text-align: center;
  padding: calc(5px * var(--scale));  /* the outline's weight - the strip starts where the paper does */
  margin: 0 calc(12px * var(--scale)) calc(12px * var(--scale)) 0;  /* room for the hard shadow, which falls down-right */
}
.game-timer-box::before {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  z-index: -1;
  background: var(--panel-bg);     /* the opaque light ground */
  box-shadow: var(--panel-keyline), var(--panel-shadow);  /* the outline, then the offset shadow */
  transform: rotate(-1deg);        /* hand-placed, not machine-aligned */
  transition: background-color 0.12s steps(2);
}

/* The label - paper-coloured caps on a solid ink strip. */
.game-timer-mask {
  background: var(--text-color);   /* ink */
  padding: calc(6px * var(--scale)) calc(18px * var(--scale));
}
.game-timer-mask > span {
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;       /* reads as a label, whatever the operator types */
  color: var(--panel-bg);
}

/* The clock - the heaviest thing on the label. */
.game-timer-clock {
  padding: calc(10px * var(--scale)) calc(26px * var(--scale)) calc(8px * var(--scale));
  font-size: calc(104px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's 900 */
  line-height: 1.04;
  letter-spacing: var(--display-tracking);
  font-variant-numeric: lining-nums tabular-nums;  /* every digit the same width - no jiggle */
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
  color: var(--text-color);
  will-change: transform, opacity; /* presets fade this up */
}

/* The accent bar - along the bottom, inside the outline. */
.game-timer-accent {
  height: var(--accent-weight);    /* the family's 14px slab */
  background: var(--accent);
  box-shadow: inset 0 calc(4px * var(--scale)) 0 var(--text-color);  /* an ink line where the bar meets the paper */
  will-change: transform;          /* line-reveal scales this */
}

/* Time's up - the paper floods accent and the clock blinks in hard steps. */
.game-timer-done .game-timer-box::before {
  background: var(--accent);
}
.game-timer-done .game-timer-clock {
  color: var(--accent-ink);
  animation: game-timer-flash 0.8s steps(1) 1;
}
@keyframes game-timer-flash {
  0%, 50%, 100% { opacity: 1; }    /* on... */
  25%, 75% { opacity: 0; }         /* ...off - two hard blinks, then steady */
}`,
    hasAccent: true,
    // The stage: a label that holds a four-digit clock (10:00) under a short round name.
    stageWidth: 340,
  }),
);
