// ig40 "Sticker Facts" - the STICKER family's key-facts board (types/lists.ts, key-facts), sibling
// of lt68 Sticker Strap and qz13 Sticker Quiz. A show's "how to play" card.
//
// One paper label with a thick ink outline and a hard offset shadow. The heading sits on a solid
// ink strip, each fact is its term on a small accent chip over the explanation, and thick ink
// rules separate the facts - a printed notice, not a slide.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { KEY_FACTS_FIELDS } from '../pack4/content';
import { typeLines } from '../types/graphicType';
import { buildGameShowFacts, GAME_SHOW_FACTS_SAMPLES } from './pack4/gameShowFacts';
import { defineInfographicVariant } from './shared';

export const ig40: TemplateVariant = defineInfographicVariant(
  {
    id: 'ig40',
    category: 'infographic',
    name: 'Sticker Facts',
    styleTag: 'sticker',
    description: 'A paper label of key facts: heading on an ink strip, each term on an accent chip - one "term | explanation" per line.',
    maxLines: 2,
    suggestedLines: typeLines(KEY_FACTS_FIELDS, GAME_SHOW_FACTS_SAMPLES),
    logo: 'none',
    animationPresets: ['rows-cascade'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'mid-center',
  },
  {
    name: 'Sticker Facts',
    description:
      'The neo-brutal key-facts board. One flat paper label with a thick outline and a hard ' +
      'offset shadow: the heading on a solid ink strip, then each fact as a term on an accent ' +
      'chip over its explanation, split by thick ink rules. One "term | explanation" per line. ' +
      'Sibling of lt68 Sticker Strap.',
    uicolor: '2',
  },
  (o) => ({
    ...buildGameShowFacts(o, `/* The box: presets animate THIS element, so it carries no lean of its own - the label is
   painted on the layer below, where no tween can flatten it. */
.infographic-box {
  position: relative;              /* anchors the painted label (::before) */
  z-index: 0;                      /* its own stacking context, so the paper stays behind the words */
  padding: calc(40px * var(--scale)) calc(52px * var(--scale)) calc(34px * var(--scale));
  text-align: left;                /* printed matter reads from the left edge, whatever the zone centres */
}
.infographic-box::before {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  z-index: -1;
  background: var(--panel-bg);     /* the opaque light ground */
  border-radius: var(--panel-radius);  /* 0 - a sticker is cut square */
  box-shadow: var(--panel-keyline), calc(14px * var(--scale)) calc(14px * var(--scale)) 0 var(--text-color);  /* the outline, then the offset shadow */
  transform: rotate(-0.6deg);      /* hand-placed, not machine-aligned */
}

/* The accent: a square tab stuck over the top-right corner, at its own angle. */
.infographic-accent {
  position: absolute;
  right: calc(-22px * var(--scale));
  top: calc(-26px * var(--scale));
  width: calc(60px * var(--scale));
  height: calc(60px * var(--scale));
  background: var(--accent);
  box-shadow: inset 0 0 0 calc(5px * var(--scale)) var(--text-color),
              calc(6px * var(--scale)) calc(6px * var(--scale)) 0 var(--text-color);
  transform: rotate(-10deg);
}

/* The heading - paper-coloured caps on a solid ink strip. */
.infographic-heading {
  display: inline-block;           /* the strip hugs the words */
  padding: calc(6px * var(--scale)) calc(16px * var(--scale));
  margin-bottom: calc(14px * var(--scale));
  background: var(--text-color);   /* ink */
  color: var(--panel-bg);
  font-size: calc(30px * var(--scale) * var(--type-scale));
  font-weight: 800;
  line-height: 1.2;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;
}

/* One fact: the term above, then what it means. */
.infographic-row {
  padding: calc(16px * var(--scale)) 0;
}
/* Thick ink rules between facts - not above the first, never below the last. */
.infographic-row + .infographic-row {
  border-top: calc(4px * var(--scale)) solid var(--text-color);
}

/* The term - on a small accent chip with the family outline. */
.infographic-fact-term {
  display: inline-block;           /* the chip hugs the term */
  padding: calc(3px * var(--scale)) calc(12px * var(--scale));
  background: var(--accent);
  box-shadow: inset 0 0 0 calc(3px * var(--scale)) var(--text-color);
  font-size: calc(22px * var(--scale) * var(--type-scale));
  font-weight: 800;
  line-height: 1.3;
  letter-spacing: var(--label-tracking);
  text-transform: uppercase;       /* reads as a label, whatever the operator types */
  color: var(--accent-ink);
}

/* The explanation - the fact itself, and the reason for the board. */
.infographic-fact-note {
  display: block;                  /* its own row under the term */
  margin-top: calc(8px * var(--scale));
  font-size: calc(34px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.25;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
  overflow-wrap: break-word;       /* spaces first, and never a hyphen on air */
}`),
    // The stage: the width the label holds a full-sentence fact at.
    stageWidth: 1040,
  }),
);
