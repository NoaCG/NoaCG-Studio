// ls07 "Booth Line" — the commentary pair on ONE line.
//
// The minimal answer to the same job as ls06, and the one that works when the picture is
// busy: a single rail across the bottom, the segment word set off at the left in the accent,
// then both callers inline behind it. No stacking, no column blocks — the whole credit is one
// horizontal read, which is what lets it sit under a wide shot without covering any of it.
//
// It is genuinely a different graphic from ls06 rather than a restyle: the booth strap builds
// a block that the eye stops on, this one builds a rail the eye passes along. Shows that keep
// commentary credits up during play use this shape; shows that cut to them use ls06's.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { defineVariant } from '../shared';
import { hasLine, slot } from './shared';

export const ls07: TemplateVariant = defineVariant(
  {
    id: 'ls07',
    category: 'lower-third',
    name: 'Booth Line',
    styleTag: 'minimal',
    description: 'One rail: the segment word in the accent, then both callers set inline.',
    maxLines: 3,
    suggestedLines: [
      { title: 'Label', sample: 'Commentary' },
      { title: 'Caller 1', sample: 'Ray Okonkwo' },
      { title: 'Caller 2', sample: 'Mia Halvorsen' },
    ],
    logo: 'none',
    // A rail should arrive along its own axis. Slide-left travels the way the line reads.
    animationPresets: ['slide-left', 'mask-wipe', 'fade', 'slide-up', 'line-reveal', 'slide-down'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Booth Line',
    description:
      'The single-rail commentary credit: a small accent label, then both callers set inline ' +
      'behind drawn separators. Each caller is an independent SPX field — the ampersand and ' +
      'the divider are CSS, so nobody has to punctuate a name field. Built to stay on screen ' +
      'during play, where a stacked block would cover the action.',
    uicolor: '1',
  },
  (o) => {
    // Every element after the label is a caller, so the "&" is drawn before each one BUT the
    // first — which is what makes the rail read correctly whether there are two names or one.
    return {
      html: `    <!-- One rail: the label, then the callers inline. -->
    <div class="lower-third-box">
${hasLine(o, 0) ? `${slot(o, 0, 'lower-third-name')}\n` : ''}      <!-- The accent tick is emitted UNCONDITIONALLY: it is this design's
           .lower-third-accent node, and the animation data keyframes it by selector, so an
           element that came and went with the label would leave the timeline addressing
           something that isn't there. Without a label it reads as a leading mark. -->
      <div class="lower-third-accent"></div>
      <div class="lower-third-callers">
${slot(o, 1, 'lower-third-caller', '        ')}
${slot(o, 2, 'lower-third-caller', '        ')}
      </div>
    </div>`,

      css: `/* The rail — a single horizontal run. Baseline alignment across the whole row is what
   makes a label, a divider and two names read as ONE credit rather than as parts. */
.lower-third-box {
  display: flex;                    /* label · divider · callers, in a row */
  align-items: baseline;            /* every piece shares one baseline */
  gap: calc(20px * var(--scale));
  padding: calc(15px * var(--scale)) calc(30px * var(--scale)) calc(18px * var(--scale));
  background: var(--panel-bg);      /* the minimal family's quiet panel */
  border-radius: var(--panel-radius);  /* the family's corner radius */
  box-shadow: var(--panel-shadow);  /* the family's panel lift */
}

/* The label (f0) — small, tracked, in the accent: it names the segment, not a person. */
.lower-third-name {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* label size — deliberately the smallest thing here */
  font-weight: 700;                 /* bold — small tracked caps need the weight to hold */
  line-height: 1.2;                 /* single tight label line */
  letter-spacing: var(--label-tracking);  /* the family's label tracking */
  text-transform: uppercase;        /* COMMENTARY, whatever the operator types */
  color: var(--accent);             /* the rail's one dose of colour */
  white-space: nowrap;              /* the label never wraps — it would break the rail */
}

/* The label's own mask never shrinks. A reveal mask is overflow:hidden, and that switches OFF a
   flex item's automatic minimum size — so the label, which may not wrap, was squeezed below its
   own width and CUT instead. The callers wrap for a living; the label absorbs nothing. */
.lower-third-box > .lower-third-mask {
  flex: none;                       /* the label keeps its width; the rail gives way elsewhere */
}

/* The divider between the label and the names — the graphic's accent NODE, so the
   line-reveal preset has something real to draw. A vertical tick, not a rule. */
.lower-third-accent {
  align-self: center;               /* centred against the row, not on the baseline */
  width: calc(3px * var(--scale));  /* a tick */
  height: calc(25px * var(--scale));  /* tall enough to read, short enough to stay quiet */
  background: var(--accent);        /* the same one colour */
  opacity: 0.55;                    /* quieter than the label it follows */
  transform-origin: center;         /* the line-reveal preset scales it from the middle */
  flex: none;                       /* never squeezed by a long name beside it */
}

/* The callers, inline. */
.lower-third-callers {
  display: flex;                    /* the names sit in a row… */
  flex-wrap: wrap;                  /* …wrapping only when the rail genuinely runs out */
  align-items: baseline;            /* shared baseline with the label */
  gap: calc(13px * var(--scale));   /* the drawn ampersand sits in this gap */
  min-width: 0;                     /* allow shrinking — long names wrap rather than overflow */
}
.lower-third-callers > .lower-third-mask {
  display: flex;                    /* each mask hugs its own name… */
  align-items: baseline;            /* …and shares ONE baseline with the drawn "&" inside it.
                                       Without this the mask's own baseline is taken from its
                                       first item — the smaller ampersand — which drops the
                                       second caller's name below the first one's baseline. */
  min-width: 0;                     /* …and may shrink */
}

/* Each caller — one weight, one size: on the call, neither voice outranks the other. */
.lower-third-caller {
  font-size: calc(35px * var(--scale) * var(--type-scale));  /* the rail's primary voice (1080p reference) */
  font-weight: 600;                 /* semibold: present without shouting */
  line-height: 1.15;                /* single tight name row */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* The ampersand between the callers is DRAWN, never typed into a name field — and it is
   drawn on the SECOND caller's mask, so a rail with only one name has no dangling "&". */
.lower-third-callers > .lower-third-mask + .lower-third-mask::before {
  content: "&";                     /* the join, owned by the design */
  align-self: baseline;             /* sits on the names' baseline */
  margin-right: calc(13px * var(--scale));  /* balances the flex gap on the other side */
  font-size: calc(28px * var(--scale) * var(--type-scale));  /* smaller than the names it joins */
  font-weight: 400;                 /* regular — a connector, not a word */
  color: var(--text-dim);           /* dimmed so the names lead */
}`,
      hasAccent: true,
      tokens: { labelColor: 'var(--text-dim)' },
    };
  },
);
