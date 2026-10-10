// bug33 "House Location Chip" — the NoaCG location/status chip: where we are and what is
// happening, on one small void chip split by an amber dot. The compact overlay a live desk
// leaves up while a reporter is on location. Sibling of lt11 House Strap and bug09 House Live.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { fontById, labelFontFaceCss } from '../../model/fonts';
import { defineBugVariant, bugLineMasks } from './shared';

export const bug33: TemplateVariant = defineBugVariant(
  {
    id: 'bug33',
    category: 'corner-bug',
    name: 'House Location Chip',
    styleTag: 'noacg',
    description: 'A compact house chip: the location and the status, split by an amber dot.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Location', sample: 'OSLO' },
      { title: 'Status', sample: 'ON LOCATION' },
    ],
    logo: 'none',
    animationPresets: ['slide-right', 'fade', 'blur-in', 'pop-spring', 'slide-down'],
    defaultPalette: paletteById('noacg'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'bottom-left',
  },
  {
    name: 'House Location Chip',
    description:
      'The house location chip: the place in display caps and the status in the mono label ' +
      'voice, divided by a small amber dot on the void panel. Small enough to sit under a ' +
      'lower third without competing with it.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- House Location Chip: the location, an amber dot, then the status. -->
    <div class="corner-bug-box">
${bugLineMasks(o)}
    </div>`,

    css: `${labelFontFaceCss(fontById('jetbrains-mono'))}

/* The chip — the house void tint holding both words on one row. */
.corner-bug-box {
  display: flex;                   /* the two words sit side by side */
  align-items: center;             /* both on one baseline */
  gap: calc(15px * var(--scale));  /* air around the divider dot */
  padding: calc(10px * var(--scale)) calc(20px * var(--scale));  /* even air inside the chip */
  background: var(--panel-bg);     /* the void panel */
  backdrop-filter: var(--panel-blur);  /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  border-radius: var(--panel-radius);  /* the house chip is square-cornered */
  box-shadow: var(--panel-shadow); /* the family's lift */
}

/* The location (f0) — display caps: the word the viewer reads first. */
.corner-bug-name {
  font-size: calc(21px * var(--scale) * var(--type-scale));   /* compact — a chip, not a strap */
  font-weight: var(--display-weight);  /* the family's display weight */
  line-height: 1.15;               /* tight */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  text-transform: uppercase;       /* place names read as marks here */
  color: var(--text-color);        /* primary text */
  white-space: nowrap;             /* the chip is one row: neither word wraps */
}

/* The divider — an amber dot between the place and what is happening there. It is drawn on
   the status line's own mask, so the two always travel together however the graphic animates. */
.corner-bug-mask + .corner-bug-mask {
  display: flex;                   /* the dot and the status word share one row */
  align-items: center;             /* the dot sits on the word's optical centre */
}
.corner-bug-mask + .corner-bug-mask::before {
  content: '';                     /* pseudo-elements need content to render */
  width: calc(6px * var(--scale)); /* a small dot… */
  height: calc(6px * var(--scale));/* …round */
  margin-right: calc(15px * var(--scale));  /* air between the dot and the status */
  border-radius: 50%;              /* the divider dot */
  background: var(--accent);       /* the one accent moment */
  box-shadow: var(--accent-glow);  /* the house glow, on the accent only */
  flex: none;                      /* never squeezed by the word beside it */
}

/* The status (f1) — the mono house label voice, clearly subordinate. */
.corner-bug-title,
.corner-bug-extra {
  font-family: var(--font-label);  /* the house mono label face */
  font-size: calc(16px * var(--scale) * var(--type-scale));   /* small label size */
  font-weight: 500;                /* medium keeps tracked caps crisp */
  line-height: 1.2;                /* compact label leading */
  letter-spacing: var(--label-tracking);  /* the house label tracking */
  text-transform: uppercase;       /* label voice */
  color: var(--label-color);       /* the house carries the accent in the label */
  white-space: nowrap;             /* the chip is one row: neither word wraps */
}`,

    hasAccent: false, // the accent moment is the divider dot, drawn on the second line's mask
  }),
);
