// al09 "Breaking Banner" — the newsroom's loudest strap. A solid accent kicker block
// ("BREAKING", "URGENT", "DEVELOPING" — the operator's word, not ours) followed by the
// headline and, under it, the attribution.
//
// No severity flag and no level machine: breaking is not a ladder. It is one state, and the
// only thing that ever changes is the word in the kicker — which is why the kicker is an
// ordinary editable field rather than a fixed set of states.
//
// Field roles here are positional, as everywhere in the standard contract: f0 is the kicker
// (`.alert-name`), f1 the headline (`.alert-title`), f2 the attribution (`.alert-extra`).

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { alertLineMasks, defineAlertVariant } from './shared';

export const al09: TemplateVariant = defineAlertVariant(
  {
    id: 'al09',
    category: 'alert',
    name: 'Breaking Banner',
    styleTag: 'minimal',
    description: 'The breaking-news strap: an accent kicker block, the headline, the attribution.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Kicker', sample: 'Breaking' },
      { title: 'Headline', sample: 'Parliament dissolved ahead of an autumn election' },
      { title: 'Attribution', sample: 'Live from the parliament building' },
    ],
    logo: 'none',
    animationPresets: ['snap-stinger', 'slide-up', 'mask-wipe', 'fade'],
    defaultPalette: paletteById('signal'),
    defaultFontId: 'inter',
    defaultZone: 'bottom-center',
  },
  {
    name: 'Breaking Banner',
    description:
      'The breaking strap: a solid accent kicker block on the reading edge, the headline in ' +
      'the largest type the band will hold, and a quiet attribution line beneath. The kicker ' +
      'word is the operator’s — Breaking, Urgent, Developing, or their own.',
    uicolor: '1',
  },
  (o) => ({
    html: `    <!-- Breaking Banner: accent kicker block left, headline and attribution right. -->
    <div class="alert-box">
      <div class="alert-lines">
${alertLineMasks(o)}
      </div>
    </div>`,
    css: `/* The band — flat and opaque, edged along the top by the accent. */
.alert-box {
  display: flex;                   /* one row: the kicker block and the text stack */
  align-items: stretch;            /* the kicker block spans the band's height */
  width: calc(1680px * var(--scale));  /* near full-width, inside the safe areas */
  min-height: calc(126px * var(--scale)); /* the band grows if the headline wraps */
  max-width: none;                 /* this design sets its own width, not the auto-fit cap */
  background: var(--panel-bg);     /* near-black — never pure #000 */
  border-top: var(--accent-weight) solid var(--accent); /* the strap's accent edge */
  box-shadow: var(--panel-shadow); /* the family's lift off the picture */
}

/* The text stack is a GRID, not a column: the kicker occupies the first column across both
   rows, so the headline and the attribution align to the same left edge beside it.

   THE PLACEMENT RULES BELONG TO THE MASKS, not to the spans inside them. Every line the
   assembler emits is wrapped in an .alert-mask reveal wrapper, so the masks are the grid's
   children and a grid-column on a span would place nothing — which is exactly what it did:
   the kicker sat as a chip in a stacked column and the headline inherited the anchor zone's
   centring. Hence the positional selectors. */
.alert-lines {
  display: grid;                   /* kicker column + text column */
  grid-template-columns: auto 1fr; /* the kicker takes what it needs, the text the rest */
  align-items: center;             /* everything on the band's centreline */
  width: 100%;                     /* the stack fills the band */
  min-width: 0;                    /* let a long headline wrap instead of stretching the grid */
  text-align: left;                /* a strap reads left to right, whatever the zone */
}

/* The kicker's cell — the one solid accent surface, spanning both text rows. */
.alert-lines > .alert-mask:nth-child(1) {
  grid-column: 1;                  /* the reading edge */
  grid-row: 1 / span 2;            /* full height beside the two text rows */
  align-self: stretch;             /* fill the band's height */
  display: flex;                   /* centre the word inside the block */
  align-items: center;             /* vertical centring */
  padding: 0 calc(34px * var(--scale)); /* generous breathing room around a short word */
  background: var(--accent);       /* the one solid accent surface */
}
/* The headline's cell. */
.alert-lines > .alert-mask:nth-child(2) {
  grid-column: 2;                  /* the text column */
  grid-row: 1;                     /* the top row */
  padding: calc(18px * var(--scale)) calc(34px * var(--scale)) 0;
  min-width: 0;                    /* wrap rather than widen the band */
}
/* The attribution's cell. */
.alert-lines > .alert-mask:nth-child(3) {
  grid-column: 2;                  /* the text column */
  grid-row: 2;                     /* under the headline */
  padding: calc(4px * var(--scale)) calc(34px * var(--scale)) calc(18px * var(--scale));
  min-width: 0;                    /* wrap rather than widen the band */
}

/* The kicker word. */
.alert-name {
  font-family: var(--font-label);  /* the family's label face */
  font-size: calc(28px * var(--scale) * var(--type-scale)); /* read before the headline */
  font-weight: 800;                /* heavy caps carry at a distance */
  letter-spacing: var(--label-tracking);  /* tracked caps breathe */
  text-transform: uppercase;       /* reads as a stamp, whatever the operator types */
  white-space: nowrap;             /* the kicker never wraps */
  color: var(--accent-ink);        /* the family's ink on an accent-filled block */
}

/* The headline — the largest type the band will hold. */
.alert-title {
  font-size: calc(38px * var(--scale) * var(--type-scale)); /* the loudest text in the graphic */
  font-weight: var(--display-weight);  /* the family's heading weight */
  letter-spacing: var(--display-tracking); /* big text tightens */
  line-height: 1.12;               /* a wrapped headline stays one block */
  color: var(--text-color);        /* primary text color */
}

/* The attribution — where this is coming from. */
.alert-extra {
  font-family: var(--font-label);  /* the family's label face */
  font-size: calc(20px * var(--scale) * var(--type-scale)); /* the quietest voice in the graphic */
  font-weight: 600;                /* small caps need weight to hold */
  letter-spacing: var(--label-tracking);  /* tracked caps breathe */
  text-transform: uppercase;       /* reads as an attribution stamp */
  color: var(--label-color);       /* the family's label colour */
}`,
    hasAccent: false,
    // The stage: the width this design holds a full-length value at, so the panel
    // stops re-sizing itself between one piece of content and the next.
    stageWidth: 1680,
  }),
);
