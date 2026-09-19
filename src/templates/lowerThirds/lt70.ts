// lt70 "Arcade Strap" - the ARCADE family's lower third, sibling of qz15 Arcade Quiz and sb28
// Arcade Score. It fills the lower-third type's arcade cell: a real accent element, the two
// lines the type declares, and the shared optional logo band.
//
// A player tag from a cabinet screen: a pixel-cornered bar with a glowing neon rim and scanlines
// under the type, the name in squared caps with phosphor bloom, the title in the family's mono.
// The accent is a column of three pixels at the leading edge.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so the bar is
// TWO clipped layers - the rim colour underneath, the ground inset on top - and the glow is a
// drop-shadow filter, which is applied after the clip and so follows the steps.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineVariant, lineMasks } from './shared';
import { pixelCorners } from '../shared/gameShowShapes';

export const lt70: TemplateVariant = defineVariant(
  {
    id: 'lt70',
    category: 'lower-third',
    name: 'Arcade Strap',
    styleTag: 'arcade',
    description: 'A pixel-cornered neon player tag with scanlines - the name in squared caps, the title in mono.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Name', sample: 'Mika Storm' },
      { title: 'Title', sample: 'Player one · 3 wins' },
    ],
    logo: 'optional',
    // A screen draws itself on: the wipe leads, and the stinger is there for a harder cut.
    animationPresets: ['mask-wipe', 'snap-stinger', 'slide-up', 'fade', 'slide-down'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Arcade Strap',
    description:
      'The cabinet-screen lower third. A pixel-cornered bar with a glowing neon rim and ' +
      'scanlines: the name in squared caps with phosphor bloom, the title in mono, a column ' +
      'of pixels at the leading edge. Sibling of qz15 Arcade Quiz and sb28 Arcade Score.',
    uicolor: '3',
  },
  (o) => ({
    // The accent rides INSIDE the box so every preset moves it with the bar.
    html: `    <!-- Arcade Strap: one pixel-cornered bar, a column of pixels at its leading edge. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
${lineMasks(o)}
    </div>`,
    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The bar. Two clipped layers make the pixel-stepped rim (see the file header); the glow is a
   filter, because a box-shadow would be cut away by the clip. */
.lower-third-box {
  position: relative;              /* anchors the rim, the ground and the pixel column */
  padding: calc(20px * var(--scale)) calc(44px * var(--scale)) calc(22px * var(--scale)) calc(64px * var(--scale));  /* the wide left clears the pixels */
  filter: drop-shadow(0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.lower-third-box::before,
.lower-third-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;                     /* behind the text and the pixels */
}
/* The rim: the whole shape, in the neon. */
.lower-third-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(10)};
}
/* The ground: inset by the rim's weight, with scanlines running UNDER the type. */
.lower-third-box::after {
  top: calc(5px * var(--scale)); right: calc(5px * var(--scale));
  bottom: calc(5px * var(--scale)); left: calc(5px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    var(--panel-bg);
  clip-path: ${pixelCorners(7)};
}

/* The accent: three stacked pixels, drawn with one gradient so they stay three at any height. */
.lower-third-accent {
  position: absolute;
  left: calc(28px * var(--scale));
  top: 50%;
  width: calc(14px * var(--scale));
  height: calc(62px * var(--scale));
  margin-top: calc(-31px * var(--scale));  /* centred on the bar, whatever its height */
  background: linear-gradient(to bottom, var(--accent) 58%, transparent 58%) 0 0 / 100% calc(24px * var(--scale)) repeat-y;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));
  will-change: transform;          /* line-reveal can grow this */
}

/* Name - squared caps with phosphor bloom. */
.lower-third-name {
  font-size: calc(44px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.46;               /* Saira's glyph box is tall, and the bloom needs room inside the reveal mask */
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;       /* a screen shouts in caps */
  color: var(--text-color);
  text-shadow: 0 0 calc(12px * var(--scale)) color-mix(in srgb, var(--accent) 60%, transparent);
}

/* Title - the family's mono, in the neon. */
.lower-third-title,
.lower-third-extra {
  margin-top: calc(6px * var(--scale));
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.25;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}`,
    hasAccent: true,
  }),
);
