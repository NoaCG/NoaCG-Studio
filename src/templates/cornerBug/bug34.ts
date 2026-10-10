// bug34 "Frost Location Chip" — the GLASS location/status chip: one frosted pill holding the
// place and the status, divided by a small accent dot. The compact overlay a travel, IRL or
// remote-interview stream leaves up while the location matters. Sibling of lt08 Frosted Card.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineBugVariant, bugLineMasks } from './shared';

export const bug34: TemplateVariant = defineBugVariant(
  {
    id: 'bug34',
    category: 'corner-bug',
    name: 'Frost Location Chip',
    styleTag: 'glass',
    description: 'A frosted pill: the location and the status, split by a small accent dot.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Location', sample: 'Lisbon' },
      { title: 'Status', sample: 'ON LOCATION' },
    ],
    logo: 'none',
    animationPresets: ['blur-in', 'fade', 'pop-spring', 'slide-right', 'slide-down'],
    defaultPalette: paletteById('frost'),
    defaultFontId: 'manrope',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Frost Location Chip',
    description:
      'A compact frosted pill carrying where we are and what is happening there: the place in ' +
      'the display voice, a small accent dot, then the status as a soft caps label. Small ' +
      'enough to sit under a lower third without competing with it.',
    uicolor: '3',
  },
  (o) => ({
    html: `    <!-- Frost Location Chip: the location, an accent dot, then the status. -->
    <div class="corner-bug-box">
${bugLineMasks(o)}
    </div>`,

    css: `/* The pill — translucent glass, heavy blur, hairline keyline, one soft lift. */
.corner-bug-box {
  display: flex;                   /* the two words sit side by side */
  align-items: center;             /* both on one baseline */
  gap: calc(15px * var(--scale));  /* air around the divider dot */
  padding: calc(10px * var(--scale)) calc(25px * var(--scale));  /* even air inside the pill */
  background: var(--panel-bg);     /* translucent white — the glass tint */
  backdrop-filter: var(--panel-blur);  /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  border-radius: 999px;            /* fully rounded — the glass family's pill */
  box-shadow: var(--panel-keyline), var(--panel-shadow);  /* the family's keyline and lift */
}

/* The location (f0) — the word the viewer reads first. */
.corner-bug-name {
  font-size: calc(21px * var(--scale) * var(--type-scale));   /* compact — a chip, not a strap */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.15;               /* tight */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);        /* primary text */
  white-space: nowrap;             /* the chip is one row: neither word wraps */
}

/* The divider — an accent dot between the place and what is happening there. It is drawn on
   the status line's own mask, so the two always travel together however the graphic animates. */
.corner-bug-mask + .corner-bug-mask {
  display: flex;                   /* the dot and the status word share one row */
  align-items: center;             /* the dot sits on the word's optical centre */
}
.corner-bug-mask + .corner-bug-mask::before {
  content: '';                     /* pseudo-elements need content to render */
  width: calc(8px * var(--scale)); /* a small dot… */
  height: calc(8px * var(--scale));/* …round */
  margin-right: calc(15px * var(--scale));  /* air between the dot and the status */
  border-radius: 50%;              /* the glass dot */
  background: var(--accent);       /* the one accent moment */
  flex: none;                      /* never squeezed by the word beside it */
}

/* The status (f1) — a soft caps label, clearly subordinate to the place. */
.corner-bug-title,
.corner-bug-extra {
  font-size: calc(16px * var(--scale) * var(--type-scale));   /* small label size */
  font-weight: 600;                /* semibold keeps small caps crisp */
  line-height: 1.2;                /* compact label leading */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;       /* label voice */
  color: var(--label-color);       /* glass carries the accent in the label */
  white-space: nowrap;             /* the chip is one row: neither word wraps */
}`,

    hasAccent: false, // the accent moment is the divider dot, drawn on the second line's mask
  }),
);
