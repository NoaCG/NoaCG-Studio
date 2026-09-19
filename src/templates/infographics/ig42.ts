// ig42 "Arcade Facts" - the ARCADE family's key-facts board (types/lists.ts, key-facts), sibling
// of lt70 Arcade Strap and qz15 Arcade Quiz. A show's "how to play" card.
//
// The instructions screen. A pixel-cornered panel with a glowing neon rim and scanlines: the
// heading in squared caps with phosphor bloom over a dashed rule of pixels, then each fact as a
// mono term in the neon over its explanation, with a dotted rule between facts.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so the panel
// is TWO clipped layers - the rim colour underneath, the ground inset on top - and the glow is a
// drop-shadow filter, which is applied after the clip and so follows the steps.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { KEY_FACTS_FIELDS } from '../pack4/content';
import { pixelCorners } from '../shared/gameShowShapes';
import { typeLines } from '../types/graphicType';
import { buildGameShowFacts, GAME_SHOW_FACTS_SAMPLES } from './pack4/gameShowFacts';
import { defineInfographicVariant } from './shared';

export const ig42: TemplateVariant = defineInfographicVariant(
  {
    id: 'ig42',
    category: 'infographic',
    name: 'Arcade Facts',
    styleTag: 'arcade',
    description: 'An instructions screen of key facts: squared-caps heading, mono terms in the neon - one "term | explanation" per line.',
    maxLines: 2,
    suggestedLines: typeLines(KEY_FACTS_FIELDS, GAME_SHOW_FACTS_SAMPLES),
    logo: 'none',
    animationPresets: ['rows-cascade'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'mid-center',
  },
  {
    name: 'Arcade Facts',
    description:
      'The cabinet-screen key-facts board. A pixel-cornered panel with a glowing neon rim and ' +
      'scanlines: a squared-caps heading over a rule of pixels, then each fact as a mono term ' +
      'in the neon over its explanation, split by dotted rules. One "term | explanation" per ' +
      'line. Sibling of lt70 Arcade Strap.',
    uicolor: '3',
  },
  (o) => ({
    ...buildGameShowFacts(o, `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The screen. Two clipped layers make the pixel-stepped rim (see the file header); the glow is
   a filter, because a box-shadow would be cut away by the clip. */
.infographic-box {
  position: relative;              /* anchors the rim (::before) and the ground (::after) */
  z-index: 0;                      /* its own stacking context, so the layers stay behind the words */
  padding: calc(40px * var(--scale)) calc(56px * var(--scale)) calc(36px * var(--scale));
  text-align: left;
  filter: drop-shadow(0 0 calc(18px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.infographic-box::before,
.infographic-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;
}
/* The rim: the whole shape, in the neon. */
.infographic-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(14)};
}
/* The ground: inset by the rim's weight, with scanlines running UNDER the type. */
.infographic-box::after {
  top: calc(6px * var(--scale)); right: calc(6px * var(--scale));
  bottom: calc(6px * var(--scale)); left: calc(6px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    radial-gradient(ellipse at 50% 0%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 60%),
    var(--panel-bg);
  clip-path: ${pixelCorners(10)};
}

/* The accent: a column of three stacked pixels beside the heading. */
.infographic-accent {
  position: absolute;
  left: calc(26px * var(--scale));
  top: calc(44px * var(--scale));
  width: calc(12px * var(--scale));
  height: calc(54px * var(--scale));
  background: linear-gradient(to bottom, var(--accent) 58%, transparent 58%) 0 0 / 100% calc(20px * var(--scale)) repeat-y;
  filter: drop-shadow(0 0 calc(6px * var(--scale)) var(--accent));
}

/* The heading - squared caps with phosphor bloom, over a dashed rule of pixels. */
.infographic-heading {
  padding-bottom: calc(16px * var(--scale));
  margin-bottom: calc(6px * var(--scale));
  background: linear-gradient(to right, var(--accent) 60%, transparent 60%) 0 100% / calc(20px * var(--scale)) calc(4px * var(--scale)) repeat-x;
  font-size: calc(44px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);
  line-height: 1.4;                /* Saira's glyph box is tall */
  letter-spacing: var(--display-tracking);
  text-transform: uppercase;       /* a screen shouts in caps */
  color: var(--text-color);
  text-shadow: 0 0 calc(14px * var(--scale)) color-mix(in srgb, var(--accent) 60%, transparent);
}

/* One fact: the term above, then what it means. */
.infographic-row {
  padding: calc(14px * var(--scale)) 0;
}
/* A dotted rule between facts - not above the first, never below the last. */
.infographic-row + .infographic-row {
  border-top: calc(3px * var(--scale)) dotted color-mix(in srgb, var(--accent) 50%, transparent);
}

/* The term - the family's mono, in the neon. */
.infographic-fact-term {
  display: block;                  /* its own row above the explanation */
  font-family: var(--font-label, var(--font-heading));
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.3;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;       /* reads as a label, whatever the operator types */
  color: var(--label-color);
}

/* The explanation - the fact itself, and the reason for the board. */
.infographic-fact-note {
  display: block;                  /* its own row under the term */
  margin-top: calc(2px * var(--scale));
  font-size: calc(32px * var(--scale) * var(--type-scale));
  font-weight: 600;
  line-height: 1.34;
  color: var(--text-color);
  overflow-wrap: break-word;       /* spaces first, and never a hyphen on air */
}`),
    // The stage: the width the screen holds a full-sentence fact at.
    stageWidth: 1040,
  }),
);
