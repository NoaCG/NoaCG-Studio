// bug40 "Arcade Mark" - the ARCADE family's logo bug (types/identityBugs.ts, logo-bug), sibling
// of lt70 Arcade Strap. The show's mark in a small pixel-cornered frame with a glowing neon rim
// and scanlines under it - the corner of a cabinet screen where the game's own logo sits.
//
// A pixel corner cannot be a border-radius and a clip-path cuts off any box-shadow, so the frame
// is TWO clipped layers - the rim colour underneath, the ground inset on top - and the glow is a
// drop-shadow filter, which is applied after the clip and so follows the steps.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { pixelCorners } from '../shared/gameShowShapes';
import { defineBugVariant } from './shared';
import { bugSlotCss, bugSlotField, bugSlotHtml } from './parts';

export const bug40: TemplateVariant = defineBugVariant(
  {
    id: 'bug40',
    category: 'corner-bug',
    name: 'Arcade Mark',
    styleTag: 'arcade',
    description: 'Logo only: the mark in a small pixel-cornered frame with a glowing neon rim.',
    // Logo-only by design: the graphic has no text fields, so the wizard offers none.
    maxLines: 0,
    suggestedLines: [],
    logo: 'built-in',
    animationPresets: ['fade', 'slide-down', 'slide-up', 'pop-spring', 'blur-in'],
    defaultPalette: paletteById('neon-cyan'),
    defaultFontId: 'saira',
    defaultZone: 'top-right',
  },
  {
    name: 'Arcade Mark',
    description:
      'The cabinet-screen logo bug. The show mark in a small pixel-cornered frame with a ' +
      'glowing neon rim and scanlines under it. Sibling of lt70 Arcade Strap.',
    uicolor: '3',
  },
  (o) => {
    // Logo-only: with no text lines the image field is the graphic's first (and only) field.
    const slot = {
      field: `f${o.lines.length + o.extraFields.length}`,
      path: o.logoAssetPath ?? '',
      title: 'Logo',
    };

    return {
      html: `    <!-- Arcade Mark: the logo in a small pixel-cornered neon frame. -->
    <div class="corner-bug-box">
${bugSlotHtml(slot, 'label')}
    </div>`,

      extraFields: [bugSlotField(slot)],

      css: `/* The frame. Two clipped layers make the pixel-stepped rim (see the file header); the glow
   is a filter, because a box-shadow would be cut away by the clip. */
.corner-bug-box {
  position: relative;              /* anchors the rim (::before) and the ground (::after) */
  z-index: 0;                      /* its own stacking context, so the layers stay behind the mark */
  display: flex;                   /* one child, the mark */
  padding: calc(16px * var(--scale)) calc(22px * var(--scale));
  filter: drop-shadow(0 0 calc(10px * var(--scale)) color-mix(in srgb, var(--accent) 55%, transparent));
}
.corner-bug-box::before,
.corner-bug-box::after {
  content: '';                     /* pseudo-elements render only with content set */
  position: absolute;
  z-index: -1;
}
/* The rim: the whole shape, in the neon. */
.corner-bug-box::before {
  top: 0; right: 0; bottom: 0; left: 0;  /* longhands, not inset - an older CEF drops inset */
  background: var(--accent);
  clip-path: ${pixelCorners(8)};
}
/* The ground: inset by the rim's weight, with scanlines running under the mark. */
.corner-bug-box::after {
  top: calc(4px * var(--scale)); right: calc(4px * var(--scale));
  bottom: calc(4px * var(--scale)); left: calc(4px * var(--scale));
  background:
    repeating-linear-gradient(0deg, transparent 0, transparent calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(3px * var(--scale)), rgba(0, 0, 0, 0.3) calc(4px * var(--scale))),
    var(--panel-bg);
  clip-path: ${pixelCorners(6)};
}

${bugSlotCss({ width: 132, height: 80, mark: 'label', radius: '0' })}

/* The placeholder sits IN the frame, so it needs neither its own frame nor a video shadow. */
.corner-bug-mark {
  border: 0;
  text-shadow: none;
  color: var(--accent);
}`,

      hasAccent: false, // the frame is the whole design; there is no accent element to animate
    };
  },
);
