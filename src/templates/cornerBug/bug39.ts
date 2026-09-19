// bug39 "Showtime Mark" - the SHOWTIME family's logo bug (types/identityBugs.ts, logo-bug),
// sibling of lt69 Showtime Strap. The show's mark on a small marquee plaque: the family's deep
// ground lit from above, a bulb-coloured keyline inside the edge and a dark surround outside it.
// No bulbs here on purpose - a bug stays up for hours, and nothing on it should move.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineBugVariant } from './shared';
import { bugSlotCss, bugSlotField, bugSlotHtml } from './parts';

export const bug39: TemplateVariant = defineBugVariant(
  {
    id: 'bug39',
    category: 'corner-bug',
    name: 'Showtime Mark',
    styleTag: 'showtime',
    description: 'Logo only: the mark on a small marquee plaque with a bulb-coloured keyline.',
    // Logo-only by design: the graphic has no text fields, so the wizard offers none.
    maxLines: 0,
    suggestedLines: [],
    logo: 'built-in',
    animationPresets: ['fade', 'pop-spring', 'slide-down', 'slide-up', 'blur-in'],
    defaultPalette: paletteById('marquee'),
    defaultFontId: 'playfair-display',
    defaultZone: 'top-right',
  },
  {
    name: 'Showtime Mark',
    description:
      'The theatre-marquee logo bug. The show mark on a small plaque: a deep warm ground lit ' +
      'from above, a bulb-coloured keyline and a dark surround. Sibling of lt69 Showtime Strap.',
    uicolor: '6',
  },
  (o) => {
    // Logo-only: with no text lines the image field is the graphic's first (and only) field.
    const slot = {
      field: `f${o.lines.length + o.extraFields.length}`,
      path: o.logoAssetPath ?? '',
      title: 'Logo',
    };

    return {
      html: `    <!-- Showtime Mark: the logo on a small marquee plaque. -->
    <div class="corner-bug-box">
${bugSlotHtml(slot, 'label')}
    </div>`,

      extraFields: [bugSlotField(slot)],

      css: `/* The plaque: the family's deep ground, lit from above, inside a bulb-coloured keyline and a
   dark surround. */
.corner-bug-box {
  display: flex;                   /* one child, the mark */
  padding: calc(16px * var(--scale)) calc(30px * var(--scale));
  margin: calc(6px * var(--scale));  /* room for the surround, which sits outside the box */
  border-radius: calc(26px * var(--scale));  /* a soft plaque - the full pill would crop a square mark's corners */
  background: linear-gradient(to bottom,
              color-mix(in srgb, var(--panel-bg) 86%, #ffffff) 0%,
              var(--panel-bg) 55%,
              color-mix(in srgb, var(--panel-bg) 78%, #000000) 100%);
  box-shadow: inset 0 0 0 calc(2px * var(--scale)) var(--accent),
              0 0 0 calc(6px * var(--scale)) color-mix(in srgb, var(--panel-bg) 62%, #000000),
              var(--panel-shadow);  /* keyline, the dark surround, then the lift */
}

${bugSlotCss({ width: 132, height: 80, mark: 'label', radius: '0' })}

/* The placeholder sits ON the plaque, so it needs neither its own frame nor a video shadow. */
.corner-bug-mark {
  border: 0;
  text-shadow: none;
  color: var(--accent);
}`,

      hasAccent: false, // the plaque is the whole design; there is no accent element to animate
    };
  },
);
