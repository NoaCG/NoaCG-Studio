// ls27 "Track Cue" — the programme item, numbered.
//
// Classical concerts, recitals, showcases and setlist streams all share a shape neither ls25
// nor ls26 covers: the performance is a NUMBERED PROGRAMME, and the graphic's job is to say
// where in it the audience currently is. "III. Allegro con brio" is not a track title with a
// number stuck on the front — the numeral is a position in a sequence, and every printed
// programme in the form sets it apart from the title as its own column.
//
// So the number is its own field in its own cell, right-aligned against the title so a run of
// items keeps a straight edge whether the numeral is I or VIII. The duration closes the row,
// because a programme tells you how long the movement is.

import { paletteById, type TemplateVariant } from '../../../model/wizard';
import { defineVariant } from '../shared';
import { TABULAR_FIGURES, hasLine, slot } from './shared';

export const ls27: TemplateVariant = defineVariant(
  {
    id: 'ls27',
    category: 'lower-third',
    name: 'Track Cue',
    styleTag: 'minimal',
    description: 'A numbered programme item: the numeral in its own cell, then the title and composer.',
    maxLines: 4,
    suggestedLines: [
      { title: 'Number', sample: 'III' },
      { title: 'Title', sample: 'Allegro con brio' },
      { title: 'Composer', sample: 'Ludwig van Beethoven' },
      { title: 'Duration', sample: '9:24' },
    ],
    logo: 'none',
    animationPresets: ['slide-up', 'fade', 'line-reveal', 'blur-in', 'mask-wipe', 'slide-down'],
    defaultPalette: paletteById('ivory'),
    defaultFontId: 'inter',
    defaultZone: 'bottom-left',
  },
  {
    name: 'Track Cue',
    description:
      'The programme strap: the item number set apart in its own right-aligned cell — a ' +
      'position in a sequence, not part of the title — with the title and composer beside it ' +
      'and the duration closing the row. Built for recitals, setlists and any performance ' +
      'that runs to a printed order.',
    uicolor: '1',
  },
  (o) => {
    // The column rule is unconditional — it is this design's .lower-third-accent node and the
    // animation data keyframes it by selector — and the numeral cell travels with it so the
    // title always starts at the same left edge whether or not the item is numbered.
    const number = `      <div class="lower-third-numcell">
${hasLine(o, 0) ? `${slot(o, 0, 'lower-third-name', '        ')}\n` : ''}      </div>
      <div class="lower-third-accent"></div>
`;
    const duration = hasLine(o, 3)
      ? `      <div class="lower-third-durcell">
${slot(o, 3, 'lower-third-extra', '        ')}
      </div>
`
      : '';

    return {
      html: `    <!-- The row: [numeral] | [rule] | [title · composer] | [duration]. -->
    <div class="lower-third-box">
${number}      <div class="lower-third-text">
${slot(o, 1, 'lower-third-title', '        ')}
${slot(o, 2, 'lower-third-composer', '        ')}
      </div>
${duration}    </div>`,

      css: `/* The row — a programme line, so it reads horizontally and keeps a straight left edge. */
.lower-third-box {
  display: flex;                    /* numeral, rule, title block, duration */
  align-items: stretch;             /* the rule runs the row's full height */
  background: var(--panel-bg);      /* the minimal family's quiet panel */
  border-radius: var(--panel-radius);  /* the family's corner radius */
  box-shadow: var(--panel-shadow);  /* the family's panel lift */
  min-width: calc(659px * var(--scale));  /* a run of items keeps ONE width, so the numeral
                                             column doesn't move between cues */
  max-width: calc(941px * var(--scale));  /* a long work title wraps rather than runs — and
                                             never past the category auto-fit cap */
}

/* The numeral cell — RIGHT-aligned, which is what keeps I, II and VIII on one edge. */
.lower-third-numcell {
  flex: 0 0 calc(99px * var(--scale));  /* a fixed column: the numeral never moves the title */
  display: flex;                    /* place the numeral in the cell */
  align-items: center;              /* vertically centred against the title block */
  justify-content: flex-end;        /* against the rule, so the sequence lines up */
  padding: calc(16px * var(--scale)) calc(19px * var(--scale)) calc(18px * var(--scale)) calc(26px * var(--scale));
}

/* The numeral (f0). */
.lower-third-name {
  font-size: calc(35px * var(--scale) * var(--type-scale));  /* a position marker, not a headline */
  font-weight: 600;                 /* semibold — it has to hold against the title */
  line-height: 1;                   /* one tight figure */
  letter-spacing: 0.04em;           /* roman numerals need air between the strokes */
  ${TABULAR_FIGURES}
  color: var(--accent);             /* the row's one dose of colour */
  text-align: right;                /* lines up down a sequence of cues */
  white-space: nowrap;              /* a numeral never wraps */
}

/* The rule between the numeral and the title — the graphic's accent node, and the column
   divider a printed programme would draw. */
.lower-third-accent {
  flex: none;                       /* never squeezed */
  width: calc(2px * var(--scale));  /* a hairline */
  margin: calc(16px * var(--scale)) 0;  /* inset from the row's edges — a rule, not a border */
  background: var(--accent);        /* the one accent surface */
  opacity: 0.45;                    /* quieter than the numeral it separates */
  transform-origin: center;         /* line-reveal scales it from the middle */
}

.lower-third-text {
  flex: 1 1 auto;                   /* absorbs the row's spare width */
  display: flex;                    /* stack title over composer */
  flex-direction: column;           /* top to bottom */
  justify-content: center;          /* vertically centred against the numeral */
  min-width: 0;                     /* let it shrink so long titles wrap instead of overflowing */
  padding: calc(15px * var(--scale)) calc(28px * var(--scale)) calc(16px * var(--scale));
}

/* The title (f1) — the row's headline. */
.lower-third-title {
  font-size: calc(33px * var(--scale) * var(--type-scale));  /* headline size (values are 1080p reference) */
  font-weight: 600;                 /* semibold: present without shouting */
  line-height: 1.15;                /* a work title wraps — give the rows air */
  letter-spacing: var(--display-tracking);  /* the family's display tracking */
  color: var(--text-color);         /* primary text color */
}

/* The composer or performer (f2). */
.lower-third-composer {
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* clearly below the title */
  font-weight: 400;                 /* regular — hierarchy comes from the title's weight */
  line-height: 1.3;                 /* room if a long name wraps */
  color: var(--text-dim);           /* dimmed — never the primary ink twice */
  margin-top: calc(4px * var(--scale));  /* tied to the title above it */
}

/* The duration cell — closes the row, in tabular figures so the colons line up. */
.lower-third-durcell {
  flex: 0 0 auto;                   /* sized by its figure */
  display: flex;                    /* place the figure in the cell */
  align-items: center;              /* vertically centred */
  padding: calc(16px * var(--scale)) calc(28px * var(--scale));
  border-left: 1px solid rgba(255, 255, 255, 0.12);  /* the cell divider */
}

/* The duration (f3). */
.lower-third-extra {
  font-size: calc(24px * var(--scale) * var(--type-scale));  /* reference, not billing */
  font-weight: 500;                 /* medium — a figure needs a little weight to read */
  line-height: 1;                   /* one tight figure */
  ${TABULAR_FIGURES}
  color: var(--label-color);        /* the family's label color */
  white-space: nowrap;              /* a duration never wraps */
}`,
      hasAccent: true,
      tokens: { labelColor: 'var(--text-dim)' },
    };
  },
);
