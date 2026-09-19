// gt09 "Arcade Clock" - the ARCADE family's countdown (types/clocks.ts, countdown), sibling of
// lt70 Arcade Strap and qz15 Arcade Quiz.
//
// The timer from the top of a cabinet screen: a pixel-cornered panel with a glowing neon rim and
// scanlines, the round's name in the family's mono, a big glowing clock, and a row of pixels
// under it. When time runs out the clock turns the semantic warning colour and blinks in hard
// steps, the way a game tells you the round is over.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so the panel
// is TWO clipped layers - the rim colour underneath, the ground inset on top - and the glow is a
// drop-shadow filter, which is applied after the clip and so follows the steps.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { pixelCorners } from '../shared/gameShowShapes';
import { defineGameTimerVariant } from './shared';

export const gt09: TemplateVariant = defineGameTimerVariant(
  {
    id: 'gt09',
    category: 'game-timer',
    name: 'Arcade Clock',
    styleTag: 'arcade',
    description: 'A pixel-cornered neon panel: mono round name, a big glowing clock, a row of pixels.',
    maxLines: 1,
    suggestedLines: [{ title: 'Label', sample: 'ROUND 1' }],
    logo: 'none',
    animationPresets: ['timer-line-reveal', 'timer-run'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'top-center',
  },
  {
    name: 'Arcade Clock',
    description:
      'The cabinet-screen countdown. A pixel-cornered panel with a glowing neon rim and ' +
      'scanlines: the round name in mono, a big glowing clock, a row of pixels under it. At ' +
      'zero the clock turns the warning colour and blinks in hard steps. Sibling of lt70 Arcade Strap.',
    uicolor: '3',
  },
  () => ({
    html: `    <!-- Arcade Clock: [mono label] / [big clock] / [row of pixels]. -->
    <div class="game-timer-box">
      <!-- The label line - #f0 is the field, set in the family's mono. -->
      <div class="game-timer-mask"><span id="f0">ROUND 1</span></div>
      <!-- The clock - the countdown runtime repaints this as M:SS. -->
      <div class="game-timer-clock">3:00</div>
      <!-- The row of pixels - the design's one accent moment. -->
      <div class="game-timer-accent"></div>
    </div>`,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The panel. Two clipped layers make the pixel-stepped rim (see the file header); the glow is a
   filter, because a box-shadow would be cut away by the clip. */
.game-timer-box {
  position: relative;              /* anchors the rim (::before) and the ground (::after) */
  z-index: 0;                      /* its own stacking context, so the layers stay behind the clock */
  display: flex;                   /* label, clock, pixels - top to bottom */
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: calc(18px * var(--scale)) calc(34px * var(--scale)) calc(22px * var(--scale));
  filter: drop-shadow(0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.game-timer-box::before,
.game-timer-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;
}
/* The rim: the whole shape, in the neon. */
.game-timer-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(10)};
}
/* The ground: inset by the rim's weight, with scanlines running UNDER the type. */
.game-timer-box::after {
  top: calc(5px * var(--scale)); right: calc(5px * var(--scale));
  bottom: calc(5px * var(--scale)); left: calc(5px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    var(--panel-bg);
  clip-path: ${pixelCorners(7)};
}

/* The label - the family's mono, in the neon. */
.game-timer-mask > span {
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;       /* reads as a label, whatever the operator types */
  color: var(--label-color);
}

/* The clock - big, in the display face, with phosphor bloom. */
.game-timer-clock {
  font-size: calc(96px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.2;                /* Saira's glyph box is tall */
  letter-spacing: var(--display-tracking);
  font-variant-numeric: lining-nums tabular-nums;  /* every digit the same width - no jiggle */
  font-family: var(--font-numeric);  /* a face whose digits are all one width */
  color: var(--text-color);
  text-shadow: 0 0 calc(16px * var(--scale)) color-mix(in srgb, var(--accent) 75%, transparent);
  will-change: transform, opacity; /* presets fade this up */
}

/* The row of pixels, drawn with one gradient. */
.game-timer-accent {
  width: calc(144px * var(--scale));
  height: calc(10px * var(--scale));
  background: linear-gradient(to right, var(--accent) 58%, transparent 58%) 0 0 / calc(24px * var(--scale)) 100% repeat-x;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));
  will-change: transform;          /* line-reveal scales this */
}

/* Time's up - the clock turns the warning colour and blinks in hard steps. */
.game-timer-done .game-timer-clock {
  color: #ff3d7f;                  /* semantic "over" - never a second brand accent */
  text-shadow: 0 0 calc(16px * var(--scale)) rgba(255, 61, 127, 0.75);
  animation: game-timer-flash 0.9s steps(1) 1;
}
@keyframes game-timer-flash {
  0%, 34%, 68%, 100% { opacity: 1; }  /* on... */
  17%, 51%, 85% { opacity: 0; }       /* ...off - three hard blinks, then steady */
}`,
    hasAccent: true,
    // The stage: a panel that holds a four-digit clock under a short round name.
    stageWidth: 360,
  }),
);
