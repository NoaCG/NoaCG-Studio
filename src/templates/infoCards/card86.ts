// card86 "Arcade Title" - the ARCADE family's title card (types/cards.ts, title-card), sibling
// of lt70 Arcade Strap and qz15 Arcade Quiz.
//
// The title screen. A pixel-cornered panel with a glowing neon rim and scanlines: the kicker in
// the family's mono, the title in squared caps with phosphor bloom, a row of pixels, and the
// subtitle in mono again - the screen a cabinet shows before anybody presses start.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so the panel
// is TWO clipped layers - the rim colour underneath, the ground inset on top - and the glow is a
// drop-shadow filter, which is applied after the clip and so follows the steps.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { pixelCorners } from '../shared/gameShowShapes';
import { defineCardVariant, cardLineClass } from './shared';

export const card86: TemplateVariant = defineCardVariant(
  {
    id: 'card86',
    category: 'info-card',
    name: 'Arcade Title',
    styleTag: 'arcade',
    description: 'A pixel-cornered neon title screen: mono kicker, a big glowing squared-caps title, a row of pixels.',
    maxLines: 5,
    suggestedLines: [
      { title: 'Title', sample: 'Quiz Night Live' },
      { title: 'Kicker', sample: 'Round one' },
      { title: 'Subtitle', sample: 'Two players · ten questions' },
    ],
    logo: 'optional',
    // A screen draws itself on: the wipe leads.
    animationPresets: ['mask-wipe', 'snap-stinger', 'fade', 'slide-up', 'slide-down'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'mid-center',
  },
  {
    name: 'Arcade Title',
    description:
      'The cabinet-screen show opener. A pixel-cornered panel with a glowing neon rim and ' +
      'scanlines: the kicker in mono, a big squared-caps title with phosphor bloom, a row of ' +
      'pixels, and a mono subtitle. Sibling of lt70 Arcade Strap.',
    uicolor: '3',
  },
  (o) => {
    // Visual order is kicker (f1), title (f0), pixels, subtitle (f2), then anything extra, so the
    // masks are emitted by hand; field ids stay f0/f1/f2 whatever the visual order.
    const mask = (i: number) =>
      `      <!-- ${o.lines[i].title} (f${i}) - the field's value is written straight into this element. -->\n` +
      `      <div class="info-card-mask"><span id="f${i}" class="${cardLineClass(i)}">${o.lines[i].sample}</span></div>`;
    const kicker = o.lines.length > 1 ? `${mask(1)}\n` : '';
    const rest = o.lines.slice(2).map((_, k) => `\n${mask(k + 2)}`).join('');

    return {
      html: `    <!-- Arcade Title: a title screen - kicker, title, a row of pixels, subtitle. -->
    <div class="info-card-box">
${kicker}${mask(0)}
      <div class="info-card-accent"></div>${rest}
    </div>`,
      css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The panel. Two clipped layers make the pixel-stepped rim (see the file header); the glow is a
   filter, because a box-shadow would be cut away by the clip. */
.info-card-box {
  position: relative;              /* anchors the rim (::before) and the ground (::after) */
  z-index: 0;                      /* its own stacking context, so the layers stay behind the words */
  display: flex;                   /* a centred column */
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: calc(52px * var(--scale)) calc(84px * var(--scale)) calc(56px * var(--scale));
  filter: drop-shadow(0 0 calc(22px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.info-card-box::before,
.info-card-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;
}
/* The rim: the whole shape, in the neon. */
.info-card-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(16)};
}
/* The ground: inset by the rim's weight, with scanlines running UNDER the type. */
.info-card-box::after {
  top: calc(6px * var(--scale)); right: calc(6px * var(--scale));
  bottom: calc(6px * var(--scale)); left: calc(6px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 62%),
    var(--panel-bg);
  clip-path: ${pixelCorners(12)};
}

/* Kicker - the family's mono, in the neon. */
.info-card-title {
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(26px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
  color: var(--label-color);
}

/* Title - squared caps with phosphor bloom. */
.info-card-name {
  font-size: calc(96px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.14;               /* tight, so a wrapped title stays one block */
  padding: 0.2em 0;                /* Saira's glyph box is taller than that line: the room goes on the text, where the reveal mask counts it, not between the lines */
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;       /* a screen shouts in caps */
  color: var(--text-color);
  text-shadow: 0 0 calc(18px * var(--scale)) color-mix(in srgb, var(--accent) 60%, transparent);
}

/* The accent - a row of pixels, drawn with one gradient. */
.info-card-accent {
  width: calc(216px * var(--scale));
  height: calc(12px * var(--scale));
  margin: calc(4px * var(--scale)) 0 calc(20px * var(--scale));
  background: linear-gradient(to right, var(--accent) 58%, transparent 58%) 0 0 / calc(24px * var(--scale)) 100% repeat-x;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));
  will-change: transform;          /* line-reveal can grow this */
}

/* Subtitle, and any extra line under it - mono, dimmed. */
.info-card-extra {
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 500;
  line-height: 1.35;
  text-transform: uppercase;
  color: var(--text-dim);
}`,
      hasAccent: true,
      // The stage: the width the screen holds a three-word title at.
      stageWidth: 1240,
    };
  },
);
