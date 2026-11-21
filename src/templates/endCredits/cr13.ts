// cr13 "Programme Roll" - the credits set the way a printed theatre programme sets them: a serif
// page, and every credit a ROW - role on the left, name on the right, a dotted leader between
// them. The credits sibling of lt59 and card80 (docs/DESIGN_LANGUAGE.md §8, editorial family).
//
// Two things make it a different graphic rather than a re-skin of cr01, and both are measured
// absences (docs/CATALOG_VARIETY.md §3):
//   - it is set in a serif, on paper. Zero of 459 designs were, though two serifs ship bundled
//     (absence 1), and every design in the catalog was drawn for light text on a dark surface
//     (absence 5). The category's programme background is category-owned CSS emitted BEFORE a
//     design's own, which is the seam this design repaints the surface through.
//   - no capitals are forced anywhere on it, and there is ONE font weight on the whole page.
//     A printed programme sets its headings and its role labels in roman and lets tracking and
//     colour carry them, and a single-weight text serif carries a page on size alone; 88.5% of
//     the catalog shouting somewhere in uppercase (absence 3) and its two-or-three-weight mode
//     are what make both worth spending a design on. ss18 makes the same two decisions, so the
//     two read as one printed package.
//   - the ROW itself. Every credits design in the catalog stacks the role above the name or sets
//     them in two fixed columns; a leader row is how a printed programme, a concert bill and a
//     book's front matter have set the same information for two centuries, and it reads
//     completely differently on air - the eye tracks along the line rather than down a stack.
//
// The leader is drawn by the ROW BUILDER, which is where a design's markup belongs: the parser
// hands back the same three entry kinds it hands every other design, and all three are answered.

import { paletteById, type TemplateVariant } from '../../model/wizard';
import { defineCreditsVariant } from './shared';

// A line ending in a colon is a role and every line beneath it is one of its names; "# X" is
// a heading; anything else is a plain line (see parseCredits in shared.ts).
const SAMPLE = [
  '# THE COMPANY',
  'Director | Alex Rivera',
  'Producer | Sam Chen',
  'Dramaturg | Priya Raman',
  '',
  '# THE ORCHESTRA',
  'Conductor | Maria Santos',
  'Leader | Jonas Berg',
  'Répétiteur | Wren Okafor',
  '',
  'With the thanks of the company to everyone who made this evening possible',
].join('\n');

export const cr13: TemplateVariant = defineCreditsVariant(
  {
    id: 'cr13',
    category: 'end-credits',
    name: 'Programme Roll',
    styleTag: 'editorial',
    description:
      'A printed programme on paper: serif credits set as leader rows, role left and name right.',
    maxLines: 2,
    suggestedLines: [
      { title: 'Credits', sample: SAMPLE },
      { title: 'Year / copyright', sample: '© 2026 Your Production' },
    ],
    // Optional, and deliberately so. A printed programme signs off with a rule and a line of
    // small print rather than a mark, so the mark is OFF by default and the roll carries two
    // fields - but this is the catalog's only serif-on-paper credit roll, and a channel or a
    // university ending its own show is exactly who wants a mark on one. 'none' would leave
    // them no printed roll that can carry it at all.
    //
    // The category used to declare the f2 logo field for every design whatever the variant
    // said, which made both 'none' and 'optional' a lie here; it is now conditional on
    // o.logoEnabled (endCredits/shared.ts), which is what makes this declaration mean anything.
    logo: 'optional',
    animationPresets: ['credits-roll'],
    defaultPalette: paletteById('broadsheet'),
    defaultFontId: 'source-serif-4',
    defaultZone: 'mid-center',
  },
  {
    name: 'Programme Roll',
    description:
      'The theatre programme as end credits: a paper page with a print register, section ' +
      'headings under their own rule, and every credit set as a leader row - the role on the ' +
      'left, a dotted leader across, the name on the right.',
    uicolor: '4',
  },
  (o) => ({
    html: `    <!-- Programme Roll: one masked viewport; rebuildCredits() fills the track. -->
    <div class="credits-box"><div id="credits-track"></div></div>`,
    css: `/* ── The desk. These three rules repaint the category's own programme background, which is
   authored for a dark screen; a design's CSS is emitted after it. ── */

/* The surface the programme lies on - the palette's paper, darkened, so the page reads as a
   page. The opaque base is a literal for the same reason the category's #070a0f is one: it
   guarantees the output is never see-through, and the palette's own tone is washed over it. */
.credits-background {
  background-color: #d6d3ca;  /* the opaque desk base - output is never transparent */
  background-image: linear-gradient(color-mix(in srgb, var(--text-color) 16%, var(--panel-bg)), color-mix(in srgb, var(--text-color) 16%, var(--panel-bg)));  /* the desk: the palette's paper darkened enough that the sheet on it reads as a sheet */
}

/* The light pool becomes a wash of ink rather than a glow - paper does not emit light. */
.credits-ambient {
  background: radial-gradient(circle at 12% 86%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 62%);
  opacity: 0.5;  /* very restrained: a long read must not sit on a bright patch */
}

/* The technical grid becomes the page's own margin rules: two verticals, in ink. */
.credits-grid {
  background-image: linear-gradient(90deg, color-mix(in srgb, var(--text-color) 8%, transparent) 1px, transparent 1px);
  background-size: calc(190px * var(--scale)) 100%;  /* a printed column measure, not a technical mesh */
  opacity: 0.5;  /* the rules are structure the eye barely registers */
}

/* ── The page ── */

/* The page. A narrower measure than a screen roll, because a leader row is read across and a
   wide one strands the name; and a real printed surface, so the list rolls THROUGH a sheet
   lying on the desk rather than across the whole frame. Its height is what the preset measures. */
.credits-box {
  width: calc(980px * var(--scale));  /* a book measure - the leader stays readable across it */
  height: calc(1010px * var(--scale));  /* tall window, inside the safe area */
  padding: 0 calc(58px * var(--scale));  /* the sheet's printed side margins */
  overflow: hidden;  /* the mask: rows appear at the bottom and leave at the top */
  background-color: var(--panel-bg);  /* the palette's paper - the sheet, brighter than the desk */
  background-image: repeating-linear-gradient(0deg, color-mix(in srgb, var(--text-color) 4%, transparent) 0 1px, transparent 1px calc(4px * var(--scale)));  /* the print register: how stock takes ink */
  border-radius: var(--panel-radius);  /* the family's corner language (editorial: square) */
  clip-path: polygon(0 0, calc(100% - 64px * var(--scale)) 0, 100% calc(64px * var(--scale)), 100% 100%, 0 100%);  /* the trimmed corner a printed proof carries - the pack's paper signature (card80, ss18) */
  filter: drop-shadow(0 calc(12px * var(--scale)) calc(36px * var(--scale)) rgba(0, 0, 0, 0.28));  /* the sheet lifts off the desk */
}
/* The shadow is a FILTER rather than the family's box-shadow token, and that is the trimmed
   corner's price: clip-path clips a box's paint, shadow included, so var(--panel-shadow)
   would simply never be drawn. drop-shadow follows the clipped silhouette instead. Its value
   is the editorial family's own (DESIGN_LANGUAGE §8) restated in filter syntax. */

/* The track - every row lives here; the preset animates its transform. */
#credits-track {
  will-change: transform;  /* hint the browser: this element travels every frame */
}

/* One section per .credits-page (rebuildCredits() wraps each parsed section). */
.credits-page {
  margin-bottom: calc(76px * var(--scale));  /* clear air between sections - bigger than any row gap */
}

/* Section heading - centred over its rows, under its own printed rule. */
.credits-heading {
  margin-top: calc(54px * var(--scale));  /* extra space above: a heading opens a chapter */
  margin-bottom: calc(34px * var(--scale));  /* then settles before its first credit */
  padding-bottom: calc(16px * var(--scale));  /* air between the words and their rule */
  border-bottom: var(--accent-weight) solid var(--accent);  /* the section's one accent dose */
  font-size: calc(28px * var(--scale) * var(--type-scale));  /* label scale, above the broadcast floor */
  font-weight: 400;  /* THE page weight - see the note under the page rule: this design has one */
  letter-spacing: var(--label-tracking);  /* the family's wide masthead tracking */
  text-align: center;  /* the heading is centred over the rows it introduces */
  color: var(--label-color);  /* the family's label colour - editorial accents its kickers */
}

/* A credit - the printed programme's leader row, read across rather than down. It is a GRID
   rather than a flex line because a programme's credits are a table: the leader column is the
   only elastic one, and stating that as a track keeps every row's dots on the same two edges. */
.credits-row {
  display: grid;  /* the row is a three-track table, not a flow of three boxes */
  grid-template-columns: auto minmax(calc(30px * var(--scale)), 1fr) auto;  /* role, leader, name */
  align-items: baseline;  /* all three sit on the printed baseline */
  margin-bottom: calc(22px * var(--scale));  /* the reading rhythm between credits */
}

/* The role - small tracked serif caps on the left of the line. */
.credits-role {
  min-width: 0;  /* a grid item refuses to shrink by default; a long role wraps instead */
  max-width: calc(400px * var(--scale));  /* an extreme role wraps rather than crushing the leader */
  font-size: calc(25px * var(--scale) * var(--type-scale));  /* clearly subordinate to the name */
  font-weight: 400;  /* the page weight - the tracking and the colour make it a label */
  letter-spacing: var(--label-tracking);  /* the family's own label tracking, reused rather than improvised */
  color: var(--text-dim);  /* secondary ink */
}

/* The leader - the dotted run between the role and the name. It carries no text, so it
   baselines on its own bottom edge, which is exactly where a printed leader sits. */
.credits-leader {
  height: calc(9px * var(--scale));  /* holds the dots just under the baseline */
  margin: 0 calc(14px * var(--scale));  /* air at both ends of the run */
  border-bottom: 2px dotted color-mix(in srgb, var(--text-color) 34%, transparent);  /* the printed leader */
}

/* The name - the star of the row, set in the page's own serif. */
.credits-name {
  min-width: 0;  /* the name column may shrink rather than push the row off the page */
  max-width: calc(470px * var(--scale));  /* a very long name wraps in place */
  font-size: calc(40px * var(--scale) * var(--type-scale));  /* ~1.6:1 over the role - clear hierarchy */
  font-weight: 400;  /* the page weight - a printed programme sets a name at reading weight */
  line-height: 1.14;  /* big serif type sits tight */
  text-align: right;  /* the name closes the line at the right margin */
  color: var(--text-color);  /* the ink */
  overflow-wrap: break-word;  /* break very long unbroken names */
}

/* A plain line inside a section - a name with no role, or a line of thanks. It takes the
   full measure and centres, because there is no second half for a leader to run to. */
.credits-entry {
  padding: calc(9px * var(--scale)) 0;  /* the list rhythm - tighter than a leader row */
  font-size: calc(30px * var(--scale) * var(--type-scale));  /* reading size, above the broadcast floor */
  font-weight: 400;  /* the page weight, like everything else on the sheet */
  line-height: 1.4;  /* prose leading - a thank-you is read, not scanned */
  text-align: center;  /* centred, like the closing paragraph of a programme */
  color: var(--text-color);  /* the ink */
  overflow-wrap: break-word;  /* break very long unbroken names */
}

/* The end block - the colophon: a rule, the mark if one was asked for, and the year. */
.credits-end {
  padding-top: calc(64px * var(--scale));  /* a long breath before the sign-off */
  padding-bottom: calc(16px * var(--scale));  /* a small tail so the measurement is not flush */
  text-align: center;  /* the colophon centres under the page */
}

/* The closing rule - the same printed rule the sections open on. */
.credits-rule {
  width: calc(180px * var(--scale));  /* short on purpose: a mark, not a divider */
  height: var(--accent-weight);  /* the family's printed-rule weight */
  margin: 0 auto calc(38px * var(--scale));  /* centred, with air before the mark */
  background: var(--accent);  /* the accent's last appearance */
}

/* The year line - the very last thing on the page. */
.credits-year {
  font-size: calc(24px * var(--scale) * var(--type-scale));  /* small print, still above the floor */
  font-weight: 400;  /* the page weight - nothing shouts on the way out */
  letter-spacing: 0.04em;  /* a touch of air for the short closing line */
  color: var(--text-dim);  /* secondary ink */
}${o.logoEnabled ? `

/* The delivered mark - modest, the way a colophon sets a printer's device. Emitted only when
   the wizard's logo toggle is on, so a roll without one carries no rule it never uses. */
.credits-logo {
  max-width: calc(330px * var(--scale));  /* wide marks shrink into the measure */
  max-height: calc(120px * var(--scale));  /* tall marks cap here - proportions preserved */
  margin-bottom: calc(28px * var(--scale));  /* air between the mark and the year line */
}

/* No mark picked yet - a quiet dashed slot, so the space is visibly reserved. */
.credits-logo-slot {
  display: inline-flex;  /* shrinks to its frame and centres its label */
  align-items: center;  /* the label sits in the vertical middle… */
  justify-content: center;  /* …and the horizontal middle */
  width: calc(260px * var(--scale));  /* a believable mark footprint */
  height: calc(110px * var(--scale));  /* roughly 2.4:1 - generic mark proportions */
  margin-bottom: calc(28px * var(--scale));  /* the same air the real mark would get */
  border: 1px dashed color-mix(in srgb, var(--text-color) 34%, transparent);  /* clearly a placeholder */
  font-size: calc(20px * var(--scale) * var(--type-scale));  /* the smallest type on the page */
  letter-spacing: 0.04em;  /* the same small-print tracking the year line takes */
  color: var(--text-dim);  /* dimmed - the placeholder never competes */
}` : ''}`,
    rowBuilderJs: `// ── Programme Roll row builders — rebuildCredits() calls these for every parsed entry ──

// renderCreditRow(entry): a section heading, a plain line, or a leader row.
function renderCreditRow(entry) {
  if (entry.type === 'heading') {
    // A marked heading — set centred over its own printed rule.
    return '<div class="credits-heading">' + entry.text + '</div>';
  }
  if (entry.type === 'entry') {
    // A plain line inside the section: a name with no role, or a line of thanks. There is no
    // second half for a leader to run to, so it takes the full measure instead.
    return '<div class="credits-entry">' + entry.text + '</div>';
  }
  // "Role | Name" — the printed programme's leader row. The middle element carries no text:
  // it is the run of dots, and it takes whatever width the two ends leave.
  return '<div class="credits-row">' +
           '<div class="credits-role">' + entry.role + '</div>' +
           '<div class="credits-leader"></div>' +
           '<div class="credits-name">' + entry.name + '</div>' +
         '</div>';
}

// renderEndBlock(yearHtml, logoSrc): the colophon the roll stops on — a printed rule, the mark
// if this project asked for one, and the year.${o.logoEnabled ? '' : `
// The wizard's logo toggle is off for this project, so there is no f2 field and no mark: the
// second argument is null for the life of this template (see endCredits/shared.ts).`}
function renderEndBlock(yearHtml${o.logoEnabled ? ', logoSrc' : ''}) {
  return '<div class="credits-end">' +
           '<div class="credits-rule"></div>' +${o.logoEnabled ? `
           (logoSrc
             ? '<img class="credits-logo" src="' + logoSrc + '" alt="Logo">'
             : '<div class="credits-logo-slot">Your logo</div>') +` : ''}
           '<div class="credits-year">' + yearHtml + '</div>' +
         '</div>';
}`,
  }),
);
