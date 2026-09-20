// ss22 "Sticker Sign-off" - the STICKER family's closing card (types/signOff.ts), sibling of
// lt68 Sticker Strap and qz13 Sticker Quiz.
//
// The full frame is a flat accent field printed with ink halftone dots (the family ground in
// shared.ts), and the card is one big paper label stuck onto it: thick ink outline, hard offset
// shadow, a fraction of a degree of lean. The closing line sits on its own ink strip, the way
// the family's lower third sets its title, and the rule between message and next broadcast is a
// solid outlined bar.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineStartingSoonVariant } from './shared';
import { signOffDesign } from './signOffShared';

export const ss22: TemplateVariant = defineStartingSoonVariant(
  {
    id: 'ss22',
    category: 'starting-soon',
    name: 'Sticker Sign-off',
    styleTag: 'sticker',
    description: 'A big paper label on a halftone accent field: closing line on an ink strip, a heavy thank-you, the next broadcast.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Closing line', sample: 'UNTIL NEXT TIME' },
      { title: 'Message', sample: 'Thanks for watching' },
      { title: 'Next broadcast', sample: 'Back Thursday at 19:00' },
    ],
    logo: 'optional',
    animationPresets: ['hold-still'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'mid-center',
  },
  {
    name: 'Sticker Sign-off',
    description:
      'The neo-brutal closing card. A flat accent field with ink halftone dots, and on it one big ' +
      'paper label with a thick outline and a hard offset shadow: logo, closing line on an ink ' +
      'strip, the thank-you, and an optional next broadcast. Sibling of lt68 Sticker Strap.',
    uicolor: '2',
  },
  (o) => ({
    ...signOffDesign(o, {
      label: 'Sticker Sign-off',
      css: `/* The halftone: the family ground's dot layer, tiled. The size lives here because the shared
   ground is a list of images and nothing else. */
.starting-soon-background {
  background-size: calc(26px * var(--scale)) calc(26px * var(--scale)), auto;
}

/* The label: the family's flat paper, thick ink outline and hard offset shadow. */
.starting-soon-box {
  display: flex;                   /* a centred column: logo, strip, message, bar, next */
  flex-direction: column;
  align-items: center;
  text-align: center;
  min-width: calc(640px * var(--scale));  /* a label with presence even around a short message */
  padding: calc(44px * var(--scale)) calc(64px * var(--scale)) calc(48px * var(--scale));
  background: var(--panel-bg);     /* the opaque light ground */
  border-radius: var(--panel-radius);  /* 0 - a sticker is cut square */
  box-shadow: var(--panel-keyline), calc(16px * var(--scale)) calc(16px * var(--scale)) 0 var(--text-color);  /* the outline, then a deeper shadow than a strap's: this label is the whole frame */
}

/* The closing line - on its own solid ink strip, like the price line on a shelf label. */
.starting-soon-kicker {
  margin-top: calc(18px * var(--scale));
  padding: calc(6px * var(--scale)) calc(16px * var(--scale));
  background: var(--text-color);   /* ink */
  color: var(--panel-bg);          /* paper-coloured words on it */
  font-size: calc(24px * var(--scale) * var(--type-scale));
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}

/* The thank-you - the heaviest thing in the frame. */
.starting-soon-message {
  margin-top: calc(18px * var(--scale));
  font-size: calc(76px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's 900 */
  line-height: 1.06;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* The rule - an accent bar with the family outline. */
.starting-soon-rule {
  width: calc(120px * var(--scale));
  height: calc(14px * var(--scale));
  margin: calc(26px * var(--scale)) 0 calc(22px * var(--scale));
  background: var(--accent);
  box-shadow: inset 0 0 0 calc(4px * var(--scale)) var(--text-color);
  will-change: transform;          /* the hold animates this element */
}

/* The next broadcast. */
.starting-soon-next {
  font-size: calc(28px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-dim);
}`,
    }),
    // The stage: the width the label holds a full-length thank-you at.
    stageWidth: 1000,
  }),
);
