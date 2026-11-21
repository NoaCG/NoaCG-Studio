// cr02 "Column Roll" — a down-the-page credits roll on a frosted glass panel, sibling of
// lt10 "Soft Stack" (docs/DESIGN_LANGUAGE.md §8, glass family). Each credit is a two-column
// grid — role right-aligned and dimmed on the left column, name left-aligned and semibold on
// the right — so the gutter forms a calm central axis the eye can rest on. Section headings
// span both columns, centered, led by lt10's small accent dot. The roll ends on a centered
// block: dot, logo slot, year. Calm and editorial, like its lower-third sibling.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineCreditsVariant } from './shared';

export const cr02: TemplateVariant = defineCreditsVariant(
  {
    id: 'cr02',
    category: 'end-credits',
    name: 'Column Roll',
    styleTag: 'glass',
    description:
      'Two-column end credits on frosted glass — roles right-aligned left, names left-aligned right.',
    maxLines: 2,
    suggestedLines: [
      {
        title: 'Credits',
        // A line ending in a colon is a role; every line beneath it is one of that role's
        // names (see parseCredits in shared.ts, and docs/END_CREDITS.md).
        sample: [
          '# PRODUCTION',
          'Director: Alex Rivera',
          'Producer: Sam Chen',
          '',
          '# CAMERA',
          'Director of Photography: Maria Santos',
          'Camera Operators:',
          'Jonas Berg',
          'Lena Fors',
          'Petri Salo',
          '',
          'Special thanks to everyone who made this show possible',
        ].join('\n'),
      },
      { title: 'Year / copyright', sample: '© 2026 Your Production' },
    ],
    logo: 'built-in',
    animationPresets: ['credits-roll'],
    defaultPalette: paletteById('mint'),
    defaultFontId: 'space-grotesk',
    defaultZone: 'mid-center',
  },
  {
    name: 'Column Roll',
    description:
      'The glass-family end credits, sibling of lt10 Soft Stack: a frosted panel (blur 18, ' +
      '16 px radius, one soft wide shadow) carrying a two-column grid — dimmed roles ' +
      'right-aligned toward the gutter, semibold names left-aligned from it. Section ' +
      'headings center across both columns behind a small accent dot (the lt10 motif), and ' +
      'the roll ends on a centered dot / logo / year block. Calm and editorial.',
    uicolor: '3',
  },
  () => ({
    html: `      <!-- Column Roll: the frosted viewport and the moving track. Credit rows are NOT
           authored here — rebuildCredits() injects .credits-page sections (headings + rows)
           and the final .credits-end block into #credits-track at runtime. -->
      <div class="credits-box"><div id="credits-track"></div></div>`,

    css: `/* The viewport — a frosted glass panel, the direct sibling of lt10's card: same blur,
   the same soft wide lift, the same rounded calm. overflow:hidden turns it into the
   window the track rolls through; the preset measures its clientHeight for the travel. */
.credits-box {
  width: calc(1100px * var(--scale));      /* the reading column: generous but not full-frame */
  height: calc(900px * var(--scale));      /* the roll window — travel distance comes from this */
  overflow: hidden;                /* the track scrolls through, never past, this window */
  padding: 0 calc(70px * var(--scale));    /* side air only — rows may roll under top/bottom edges */
  border-radius: var(--panel-radius);                            /* the family's panel radius */
  background-color: var(--panel-bg);       /* the retintable glass layer */
  backdrop-filter: var(--panel-blur);      /* the family's backdrop treatment */
  -webkit-backdrop-filter: var(--panel-blur);  /* Safari spelling of the same effect */
  box-shadow: var(--panel-shadow);         /* the panel's authored lift */
}

/* The track — the element the preset actually moves (gsap animates its y). */
#credits-track {
  will-change: transform;          /* promote to its own layer: jank-free travel */
}

/* One section of credits (rebuildCredits wraps each heading+rows group in this). */
.credits-page {
  margin-bottom: calc(55px * var(--scale));        /* clear air between sections while rolling */
}

/* A section heading — spans the full width, centered, led by the accent dot. */
.credits-heading {
  text-align: center;              /* headings sit on the panel's center axis */
  font-family: var(--font-label);  /* the family's label face */
  font-size: calc(25px * var(--scale) * var(--type-scale));    /* a label, not a headline — the names lead */
  font-weight: 600;                /* semibold keeps small uppercase type crisp (lt10's label) */
  letter-spacing: var(--label-tracking);  /* the heading's authored tracking */
  text-transform: uppercase;       /* label styling, whatever case the operator types */
  color: var(--label-color);        /* the heading's authored color */
  margin-bottom: calc(23px * var(--scale));        /* air before the section's first credit row */
}

/* The accent dot — lt10's motif, the design's single sharp dose of brand color. */
.credits-dot {
  display: inline-block;           /* rides inline before the heading text */
  width: calc(10px * var(--scale));         /* small on purpose: a signal, not a shape */
  height: calc(10px * var(--scale));        /* same as width — a circle needs a square */
  border-radius: 50%;              /* turn the square into a perfect circle */
  background: var(--accent);       /* the one accent color */
  vertical-align: middle;          /* optically centers on the heading's cap height */
}

/* Inside a heading the dot needs air before the text; in the end block it stands alone. */
.credits-heading .credits-dot {
  margin-right: calc(15px * var(--scale)); /* air between the dot and the heading text */
}

/* One credit — a role and everyone credited with it, as a two-column grid whose gutter forms
   the roll's quiet central axis. A role with five names is ONE row: the role stays alone on
   the left and the names stack on the right, which is the whole reason this layout is worth
   having over a centered one. */
.credits-row {
  display: grid;                   /* two columns meeting at the middle */
  grid-template-columns: 1fr 1fr;  /* equal halves: roles left, names right */
  column-gap: calc(60px * var(--scale));   /* the central gutter both columns align to */
  align-items: baseline;           /* the role sits on the FIRST name's baseline, not the block's middle */
  margin-bottom: calc(26px * var(--scale));        /* the beat between credits — wider than the gap between names sharing one role */
}

/* The right column — the names credited with the role opposite them. */
.credits-names {
  min-width: 0;                    /* let a long name wrap inside the grid track */
}

/* Names sharing one role sit closer to each other than one row sits to the next — that
   spacing is the only thing telling the audience these three people share one credit. */
.credits-name + .credits-name {
  margin-top: calc(6px * var(--scale));
}

/* The role — quieter through lighter weight and a dimmed color, pushed to the gutter. */
.credits-role {
  text-align: right;               /* right-aligned: every role ends at the central axis */
  font-size: calc(28px * var(--scale) * var(--type-scale));    /* clearly smaller than the name: hierarchy */
  font-weight: 400;                /* regular weight steps back */
  line-height: 1.3;                /* smaller text gets more air */
  color: var(--text-dim);          /* dimmed so the name leads (lt10's title treatment) */
  overflow-wrap: break-word;       /* very long unbroken roles wrap instead of overflowing */
}

/* The name — the strongest voice in the roll; everything else defers to it. */
.credits-name {
  text-align: left;                /* left-aligned: every name starts at the central axis */
  font-size: calc(33px * var(--scale) * var(--type-scale));    /* the biggest running text in the roll */
  font-weight: 600;                /* strong but not shouty — lt10's name weight */
  line-height: 1.3;                /* matches the role so both columns share a baseline */
  color: var(--text-color);        /* primary text color */
  overflow-wrap: break-word;       /* very long unbroken names wrap instead of overflowing */
}

/* A plain line inside a section — a name with no role, so no column to align against:
   it centers on the same axis the two-column gutter forms. */
.credits-entry {
  padding: calc(6px * var(--scale)) 0;  /* the list rhythm, tighter than a credit row */
  text-align: center;              /* centered on the roll's own axis */
  font-size: calc(33px * var(--scale) * var(--type-scale));  /* sized with the names beside it */
  font-weight: 600;                /* strong but not shouty — matches .credits-name */
  line-height: 1.3;                /* shares the roll's baseline rhythm */
  color: var(--text-color);        /* primary text color */
  overflow-wrap: break-word;       /* very long unbroken names wrap instead of overflowing */
}

/* The end block — dot, logo, year stacked on the center axis; the roll parks on this. */
.credits-end {
  display: flex;                   /* a simple vertical stack */
  flex-direction: column;          /* dot above logo above year */
  align-items: center;             /* everything on the panel's center axis */
  gap: calc(28px * var(--scale));          /* even breathing room between the three pieces */
  padding: calc(38px * var(--scale)) 0;    /* air around the finale while it holds on screen */
}

/* The imported logo — capped so any drop-in file sits politely above the year. */
.credits-logo {
  max-width: calc(350px * var(--scale));   /* never wider than the reading column's heart */
  max-height: calc(150px * var(--scale));  /* never taller than a clean end-card lockup */
}

/* The placeholder shown until a logo is imported — an intentional, softly outlined slot. */
.credits-logo-slot {
  width: calc(350px * var(--scale));       /* same footprint the real logo will occupy */
  height: calc(150px * var(--scale));      /* so the finale's layout doesn't shift on import */
  display: flex;                   /* centers the slot label */
  align-items: center;             /* label centered vertically */
  justify-content: center;         /* label centered horizontally */
  border: calc(1px * var(--scale)) solid rgba(255, 255, 255, 0.18);  /* the glass-family keyline */
  border-radius: calc(18px * var(--scale));        /* rounded like everything in this family */
  font-family: var(--font-label);  /* the family's label face */
  font-size: calc(20px * var(--scale) * var(--type-scale));    /* a quiet label, not content */
  font-weight: 600;                /* semibold keeps the small uppercase label crisp */
  letter-spacing: var(--label-tracking);  /* matches the heading label's tracking */
  text-transform: uppercase;       /* label styling */
  color: var(--text-dim);          /* dimmed — it is a hint, not a credit */
}

/* The year / copyright line — the roll's last, quietest word. */
.credits-year {
  font-size: calc(25px * var(--scale) * var(--type-scale));    /* small and dignified */
  font-weight: 400;                /* regular weight — nothing left to compete with */
  color: var(--text-dim);          /* dimmed, like the roles above it */
}`,

    // The variant's row markup: shared.ts calls these from rebuildCredits(). Plain ES5,
    // returns HTML strings — no DOM work here, the runtime injects the result.
    rowBuilderJs: `// renderCreditGroup(group): one role and EVERY name credited with it, as one grid row —
// the dimmed role right-aligned in the left column, its names stacked left-aligned in the
// right. "Camera:" over three operators is a single row here, with one role beside all three.
function renderCreditGroup(group) {
  var names = '';
  group.names.forEach(function (name) {
    names += '<div class="credits-name">' + name + '</div>';
  });
  return '<div class="credits-row">' +
    '<div class="credits-role">' + group.role + '</div>' +
    '<div class="credits-names">' + names + '</div>' +
  '</div>';
}

// renderCreditRow(entry): everything that is not a group — a department heading, or a line
// belonging to no role at all.
function renderCreditRow(entry) {
  if (entry.type === 'heading') {
    // Department heading: centered across both columns, led by the accent dot (lt10's motif).
    return '<div class="credits-heading"><span class="credits-dot"></span>' + entry.text + '</div>';
  }
  if (entry.type === 'entry') {
    // A line with no role above it. It sits centered across both columns — there is no role
    // to put opposite it, and a half-empty grid row reads broken.
    return '<div class="credits-entry">' + entry.text + '</div>';
  }
  // One role paired with one name — the same row a group draws, holding a single name.
  return renderCreditGroup({ role: entry.role, names: [entry.name] });
}

// renderEndBlock(yearHtml, logoSrc): the centered finale the roll parks on —
// accent dot, then the logo (or its placeholder), then the year line.
function renderEndBlock(yearHtml, logoSrc) {
  var logo;
  if (logoSrc) {
    logo = '<img class="credits-logo" src="' + logoSrc + '" alt="">';
  } else {
    // No logo imported yet: a styled slot with the same footprint, so dropping a logo
    // in via the import flow never shifts the finale's layout.
    logo = '<div class="credits-logo-slot">Your logo</div>';
  }
  return '<div class="credits-end">' +
    '<div class="credits-dot"></div>' +
    logo +
    '<div class="credits-year">' + yearHtml + '</div>' +
  '</div>';
}`,
    tokens: {
      panelShadow: '0 calc(25px * var(--scale)) calc(75px * var(--scale)) rgba(0, 0, 0, 0.35)',
      labelTracking: '0.1em',
      labelColor: 'var(--text-color)',
    },
  }),
);
