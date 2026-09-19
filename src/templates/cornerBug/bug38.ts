// bug38 "Sticker Mark" - the STICKER family's logo bug (types/identityBugs.ts, logo-bug), sibling
// of lt68 Sticker Strap. The show's mark on a small paper label: thick ink outline, hard offset
// shadow, leaning a couple of degrees like a sticker somebody pressed onto the corner of the
// picture. Nothing else - it is what stays up for the whole show.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineBugVariant } from './shared';
import { bugSlotCss, bugSlotField, bugSlotHtml } from './parts';

export const bug38: TemplateVariant = defineBugVariant(
  {
    id: 'bug38',
    category: 'corner-bug',
    name: 'Sticker Mark',
    styleTag: 'sticker',
    description: 'Logo only: the mark on a small paper label with a thick ink outline and a hard shadow.',
    // Logo-only by design: the graphic has no text fields, so the wizard offers none.
    maxLines: 0,
    suggestedLines: [],
    logo: 'built-in',
    animationPresets: ['pop-spring', 'fade', 'slide-down', 'slide-up', 'blur-in'],
    defaultPalette: paletteById('tangerine'),
    defaultFontId: 'archivo',
    defaultZone: 'top-right',
  },
  {
    name: 'Sticker Mark',
    description:
      'The neo-brutal logo bug. The show mark on a small flat paper label with a thick ink ' +
      'outline and a hard offset shadow, leaning slightly. Sibling of lt68 Sticker Strap.',
    uicolor: '2',
  },
  (o) => {
    // Logo-only: with no text lines the image field is the graphic's first (and only) field.
    const slot = {
      field: `f${o.lines.length + o.extraFields.length}`,
      path: o.logoAssetPath ?? '',
      title: 'Logo',
    };

    return {
      html: `    <!-- Sticker Mark: the logo on a small paper label. -->
    <div class="corner-bug-box">
${bugSlotHtml(slot, 'label')}
    </div>`,

      extraFields: [bugSlotField(slot)],

      css: `/* The box: presets animate THIS element, so it carries no lean of its own - the label is
   painted on the layer below, where no tween can flatten it. */
.corner-bug-box {
  position: relative;              /* anchors the painted label (::before) */
  z-index: 0;                      /* its own stacking context, so the label stays behind the mark */
  display: flex;                   /* one child, the mark */
  padding: calc(16px * var(--scale)) calc(20px * var(--scale));
  margin: 0 calc(10px * var(--scale)) calc(10px * var(--scale)) 0;  /* room for the hard shadow, which falls down-right */
}
.corner-bug-box::before {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  z-index: -1;
  background: var(--panel-bg);     /* the opaque light ground */
  box-shadow: inset 0 0 0 calc(4px * var(--scale)) var(--text-color),
              calc(7px * var(--scale)) calc(7px * var(--scale)) 0 var(--text-color);  /* the family outline and hard shadow, one size down for a bug */
  transform: rotate(2deg);         /* pressed on by hand */
}

${bugSlotCss({ width: 132, height: 84, mark: 'label', radius: '0' })}

/* The placeholder sits ON the label, so it needs neither its own frame nor a video shadow. */
.corner-bug-mark {
  border: 0;
  text-shadow: none;
  font-weight: 800;
}`,

      hasAccent: false, // the label is the whole design; there is no accent element to animate
    };
  },
);
