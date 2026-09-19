// ss24 "Arcade Sign-off" - the ARCADE family's closing card (types/signOff.ts), sibling of lt70
// Arcade Strap and qz15 Arcade Quiz.
//
// The game-over screen. The full frame is a violet screen with scanlines and a horizon glow (the
// family ground in shared.ts); the card is a pixel-cornered panel with a glowing neon rim. The
// closing line is the family's mono in the neon, the thank-you is squared caps with phosphor
// bloom, and the rule is a row of pixels.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so the panel
// is TWO clipped layers - the rim colour underneath, the ground inset on top - and the glow is a
// drop-shadow filter, which is applied after the clip and so follows the steps.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { pixelCorners } from '../shared/gameShowShapes';
import { defineStartingSoonVariant } from './shared';
import { signOffDesign } from './signOffShared';

export const ss24: TemplateVariant = defineStartingSoonVariant(
  {
    id: 'ss24',
    category: 'starting-soon',
    name: 'Arcade Sign-off',
    styleTag: 'arcade',
    description: 'A pixel-cornered neon panel on a scanline screen: mono closing line, squared-caps thank-you, a row of pixels.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Closing line', sample: 'UNTIL NEXT TIME' },
      { title: 'Message', sample: 'Thanks for watching' },
      { title: 'Next broadcast', sample: 'Back Thursday at 19:00' },
    ],
    logo: 'optional',
    animationPresets: ['hold-still'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'mid-center',
  },
  {
    name: 'Arcade Sign-off',
    description:
      'The cabinet-screen closing card. A violet screen with scanlines and a horizon glow, and ' +
      'on it a pixel-cornered panel with a glowing neon rim: logo, mono closing line, a ' +
      'squared-caps thank-you, a row of pixels, and an optional next broadcast. Sibling of lt70 Arcade Strap.',
    uicolor: '3',
  },
  (o) => ({
    ...signOffDesign(o, {
      label: 'Arcade Sign-off',
      css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The panel. Two clipped layers make the pixel-stepped rim (see the file header); the glow is a
   filter, because a box-shadow would be cut away by the clip. */
.starting-soon-box {
  position: relative;              /* anchors the rim (::before) and the ground (::after) */
  z-index: 0;                      /* its own stacking context, so the layers stay behind the words */
  display: flex;                   /* a centred column: logo, mono line, message, pixels, next */
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: calc(680px * var(--scale));
  padding: calc(52px * var(--scale)) calc(80px * var(--scale)) calc(56px * var(--scale));
  filter: drop-shadow(0 0 calc(22px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.starting-soon-box::before,
.starting-soon-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;                     /* behind the words */
}
/* The rim: the whole shape, in the neon. */
.starting-soon-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(16)};
}
/* The ground: inset by the rim's weight, with scanlines running UNDER the type. */
.starting-soon-box::after {
  top: calc(6px * var(--scale)); right: calc(6px * var(--scale));
  bottom: calc(6px * var(--scale)); left: calc(6px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    var(--panel-bg);
  clip-path: ${pixelCorners(12)};
}

/* The closing line - the family's mono, in the neon. */
.starting-soon-kicker {
  margin-top: calc(18px * var(--scale));
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* The thank-you - squared caps with phosphor bloom. */
.starting-soon-message {
  margin-top: calc(6px * var(--scale));
  font-size: calc(68px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.14;               /* tight, so a wrapped title stays one block */
  padding: 0.2em 0;                /* Saira's glyph box is taller than that line: the room goes on the text, where the reveal mask counts it, not between the lines */
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;       /* a screen shouts in caps */
  color: var(--text-color);
  text-shadow: 0 0 calc(16px * var(--scale)) color-mix(in srgb, var(--accent) 60%, transparent);
}

/* The rule - a row of pixels, drawn with one gradient. */
.starting-soon-rule {
  width: calc(168px * var(--scale));
  height: calc(12px * var(--scale));
  margin: calc(10px * var(--scale)) 0 calc(20px * var(--scale));
  background: linear-gradient(to right, var(--accent) 58%, transparent 58%) 0 0 / calc(24px * var(--scale)) 100% repeat-x;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));
  will-change: transform;          /* the hold animates this element */
}

/* The next broadcast - mono, dimmed. */
.starting-soon-next {
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(26px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.35;
  text-transform: uppercase;
  color: var(--text-dim);
}`,
    }),
    // The stage: the width the panel holds a full-length thank-you at.
    stageWidth: 1080,
  }),
);
