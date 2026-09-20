// card84 "Sticker Title" - the STICKER family's title card (types/cards.ts, title-card), sibling
// of lt68 Sticker Strap and qz13 Sticker Quiz.
//
// The show opener as one big paper label: thick ink outline, hard offset shadow, a fraction of a
// degree of lean. The kicker sits on a solid ink strip, the title is set huge and tight under
// it, and the accent is a square tab stuck over the top-left corner at its own angle - the
// lower third's motif at opener scale.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineCardVariant, cardLineClass } from './shared';

export const card84: TemplateVariant = defineCardVariant(
  {
    id: 'card84',
    category: 'info-card',
    name: 'Sticker Title',
    styleTag: 'sticker',
    description: 'A big paper label as the show opener: kicker on an ink strip, a huge tight title, an accent tab on the corner.',
    maxLines: 5,
    suggestedLines: [
      { title: 'Title', sample: 'Quiz Night Live' },
      { title: 'Kicker', sample: 'Round one' },
      { title: 'Subtitle', sample: 'Two players · ten questions' },
    ],
    logo: 'optional',
    // The family snaps: the stinger leads, and nothing here eases in softly.
    animationPresets: ['snap-stinger', 'mask-wipe', 'slide-up', 'fade', 'slide-down'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'mid-center',
  },
  {
    name: 'Sticker Title',
    description:
      'The neo-brutal show opener. One big flat paper label with a thick outline and a hard ' +
      'offset shadow, leaning slightly: the kicker on a solid ink strip, a huge tight title, a ' +
      'subtitle, and an accent tab stuck over the corner. Sibling of lt68 Sticker Strap.',
    uicolor: '2',
  },
  (o) => {
    // Visual order is kicker (f1), title (f0), subtitle (f2), then anything extra, so the masks
    // are emitted by hand; field ids stay f0/f1/f2 whatever the visual order.
    const mask = (i: number) =>
      `      <!-- ${o.lines[i].title} (f${i}) - the field's value is written straight into this element. -->\n` +
      `      <div class="info-card-mask"><span id="f${i}" class="${cardLineClass(i)}">${o.lines[i].sample}</span></div>`;
    const kicker = o.lines.length > 1 ? `${mask(1)}\n` : '';
    const rest = o.lines.slice(2).map((_, k) => `\n${mask(k + 2)}`).join('');

    return {
      html: `    <!-- Sticker Title: one paper label, an accent tab stuck over its corner. -->
    <div class="info-card-box">
      <div class="info-card-accent"></div>
${kicker}${mask(0)}${rest}
    </div>`,
      css: `/* The box: presets animate THIS element, so it carries no lean of its own - the label is
   painted on the layer below, where no tween can flatten it. */
.info-card-box {
  position: relative;              /* anchors the painted label (::before) and the accent tab */
  z-index: 0;                      /* its own stacking context, so the paper stays behind the words */
  padding: calc(44px * var(--scale)) calc(64px * var(--scale)) calc(48px * var(--scale));
  text-align: left;                /* printed matter reads from the left edge, whatever the zone centres */
}
.info-card-box::before {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  z-index: -1;
  background: var(--panel-bg);     /* the opaque light ground */
  border-radius: var(--panel-radius);  /* 0 - a sticker is cut square */
  box-shadow: var(--panel-keyline), calc(16px * var(--scale)) calc(16px * var(--scale)) 0 var(--text-color);  /* the outline, then a deeper shadow than a strap's */
  transform: rotate(-1deg);        /* hand-placed, not machine-aligned */
}

/* The accent: a square tab stuck over the top-left corner, at its own angle. */
.info-card-accent {
  position: absolute;
  left: calc(-26px * var(--scale));
  top: calc(-30px * var(--scale));
  width: calc(72px * var(--scale));
  height: calc(72px * var(--scale));
  background: var(--accent);
  box-shadow: inset 0 0 0 calc(5px * var(--scale)) var(--text-color),
              calc(7px * var(--scale)) calc(7px * var(--scale)) 0 var(--text-color);
  transform: rotate(12deg);
  will-change: transform;          /* line-reveal can grow this */
}

/* Kicker - paper-coloured caps on a solid ink strip. */
.info-card-title {
  padding: calc(6px * var(--scale)) calc(16px * var(--scale));
  background: var(--text-color);   /* ink */
  color: var(--panel-bg);
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}
.info-card-title:empty { padding: 0; }  /* an emptied kicker takes its ink strip with it */

/* Title - huge, heavy and tight. */
.info-card-name {
  margin-top: calc(16px * var(--scale));
  font-size: calc(112px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's 900 */
  line-height: 1.02;
  padding: 0.05em 0;               /* this face's glyph box is a little taller than the line: the room goes on the text, where the reveal mask counts it */
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* Subtitle, and any extra line under it. */
.info-card-extra {
  margin-top: calc(16px * var(--scale));
  font-size: calc(34px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.25;
  color: var(--text-dim);
}`,
      hasAccent: true,
      // The stage: the width the label holds a three-word title at.
      stageWidth: 1180,
    };
  },
);
