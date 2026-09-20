// lt68 "Sticker Strap" - the STICKER family's lower third, sibling of qz13 Sticker Quiz and
// sb26 Sticker Score. It fills the lower-third type's sticker cell: a real accent element, the
// two lines the type declares, and the shared optional logo band.
//
// A flat paper label with a thick ink outline and a hard offset shadow, leaning a fraction of a
// degree. The name is printed on the paper; the title sits on its own solid ink strip under it,
// like the price line on a shelf label. The accent is a square tab stuck over the top-left
// corner at its own angle.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineVariant, lineMasks } from './shared';

export const lt68: TemplateVariant = defineVariant(
  {
    id: 'lt68',
    category: 'lower-third',
    name: 'Sticker Strap',
    styleTag: 'sticker',
    description: 'A flat paper label with a thick ink outline and a hard shadow - the name on paper, the title on an ink strip.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Name', sample: 'Alex Rivera' },
      { title: 'Title', sample: 'Contestant · Helsinki' },
    ],
    logo: 'optional',
    // The family snaps: the stinger leads, and nothing here eases in softly.
    animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade', 'slide-down'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Sticker Strap',
    description:
      'The neo-brutal lower third. A flat label with a thick outline and a hard offset shadow, ' +
      'leaning slightly: the name printed on the paper, the title on a solid ink strip, and ' +
      'an accent tab stuck over the corner. Sibling of qz13 Sticker Quiz and sb26 Sticker Score.',
    uicolor: '2',
  },
  (o) => ({
    // The accent rides INSIDE the box so every preset moves it with the label.
    html: `    <!-- Sticker Strap: one paper label, an accent tab stuck over its corner. -->
    <div class="lower-third-box">
      <div class="lower-third-accent"></div>
${lineMasks(o)}
    </div>`,
    css: `/* The box: presets animate THIS element, so it carries no tilt of its own - the label is
   painted on the layer below, where no tween can flatten it. */
.lower-third-box {
  position: relative;              /* anchors the painted label (::before) and the accent tab */
  padding: calc(20px * var(--scale)) calc(38px * var(--scale)) calc(22px * var(--scale)) calc(34px * var(--scale));
  margin: calc(22px * var(--scale)) calc(12px * var(--scale)) calc(12px * var(--scale)) calc(20px * var(--scale));  /* room for the tab, which overhangs up-left, and the hard shadow, which falls down-right */
}

/* The painted label: the family's flat panel, thick outline and hard shadow. */
.lower-third-box::before {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;              /* fills the box exactly ... */
  top: 0; right: 0; bottom: 0; left: 0;  /* ... edge to edge (longhands - an older CEF drops inset) */
  z-index: -1;                     /* behind the text and the tab */
  background: var(--panel-bg);     /* the opaque light ground */
  border-radius: var(--panel-radius);  /* 0 - a sticker is cut square */
  box-shadow: var(--panel-keyline), var(--panel-shadow);  /* the outline, then the offset shadow */
  transform: rotate(-0.8deg);      /* hand-placed, not machine-aligned */
}

/* The accent: a square tab stuck over the top-left corner, at its own angle. */
.lower-third-accent {
  position: absolute;
  left: calc(-18px * var(--scale));
  top: calc(-20px * var(--scale));
  width: calc(44px * var(--scale));
  height: calc(44px * var(--scale));
  background: var(--accent);
  box-shadow: inset 0 0 0 calc(5px * var(--scale)) var(--text-color),
              calc(5px * var(--scale)) calc(5px * var(--scale)) 0 var(--text-color);
  transform: rotate(12deg);
  will-change: transform;          /* line-reveal can grow this */
}

/* Name - printed on the paper, heavy and tight. */
.lower-third-name {
  font-size: calc(46px * var(--scale) * var(--type-scale));
  font-weight: var(--display-weight);  /* the family's 900 */
  line-height: 1.08;
  letter-spacing: var(--display-tracking);
  color: var(--text-color);
}

/* Title - on its own solid ink strip, like the price line on a shelf label. */
.lower-third-title,
.lower-third-extra {
  margin-top: calc(8px * var(--scale));
  padding: calc(5px * var(--scale)) calc(12px * var(--scale));
  background: var(--text-color);   /* ink */
  color: var(--panel-bg);          /* paper-coloured words on it */
  font-size: calc(23px * var(--scale) * var(--type-scale));
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: var(--label-tracking);
}
/* An emptied title takes its ink strip with it. */
.lower-third-title:empty,
.lower-third-extra:empty {
  padding: 0;
  margin-top: 0;
}`,
    hasAccent: true,
  }),
);
