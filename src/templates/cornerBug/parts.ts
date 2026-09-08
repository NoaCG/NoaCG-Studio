// Shared authoring parts for corner-bug designs — the pieces that are IDENTICAL across the
// family and would otherwise be re-typed in thirty variant files: the logo slot's SPX field,
// its markup (placeholder mark + <img>), and the CSS that stacks the two.
//
// This is authoring-side reuse only. The EMITTED code stays exactly what a hand-written
// variant emits — commented CSS, one declaration per line — because generated code is the
// product (`root/emit-clean-commented-code-person-can`). A design that wants a bespoke slot
// still hand-authors one,
// exactly like bug01 and bug02 do.
//
// The contract every slot follows (setFieldValue in shared/base.ts does the toggling):
//   <div class="corner-bug-media">      the square that holds both states
//     <div class="corner-bug-mark">     the placeholder, shown while the field is empty
//     <img id="fN" class="corner-bug-logo">   the picked file; .has-image hides the mark

import type { SpxField } from '../../model/types';

/**
 * The placeholder drawn while a logo slot is empty — one per style family's geometry.
 * 'bars' is the house three-bar mark, 'diamond' the glass tile's accent lozenge, 'slab' the
 * sport block, 'keyline' the minimal outline, 'ring' the award/event circle.
 *
 * 'label' is the odd one out, and it exists for the LOGO-ONLY designs: a graphic whose only
 * content is an image has nothing on screen at all until a file is picked, so its empty slot
 * says so in words ("LOGO" in a keyline box). That is both the clearer affordance — the whole
 * graphic IS the slot — and the honest answer to "is anything on air?", which the runtime
 * bench asks by looking for visible text and image leaves.
 */
export type BugMark = 'bars' | 'diamond' | 'slab' | 'keyline' | 'ring' | 'label';

export interface BugSlot {
  /** The `fN` id the SPX image field carries (computed by the design, after every other field). */
  field: string;
  /** The picked file's path — '' while the slot is empty. */
  path: string;
  /** Operator-facing field title ("Logo", "Sponsor 1", …). */
  title: string;
  /** An extra class on the media box, so a design with several slots can address one. */
  extraClass?: string;
}

/** The SPX image field behind a logo slot: "filelist" lists the project's images/ folder. */
export function bugSlotField(slot: BugSlot): SpxField {
  return {
    field: slot.field,
    ftype: 'filelist',
    title: slot.title,
    value: slot.path,
    assetfolder: './images/',
    extension: 'png',
  };
}

/** One logo slot's markup: the placeholder mark and the <img> stacked in one media box.
 *  `mark` decides what the placeholder draws; `indent` matches the surrounding block. */
export function bugSlotHtml(slot: BugSlot, mark: BugMark, indent = '      '): string {
  const cls = `corner-bug-media${slot.extraClass ? ` ${slot.extraClass}` : ''}`;
  const bars = mark === 'bars' ? '\n' + `${indent}    <i></i><i></i><i></i>` + `\n${indent}  ` : '';
  // The 'label' placeholder writes the slot's own name — a REAL text node, not generated
  // content, so it counts as something on screen (see BugMark).
  const inner = mark === 'label' ? slot.title.toUpperCase() : bars;
  return (
    `${indent}<!-- ${slot.title} (image field ${slot.field}) over its placeholder mark.\n` +
    `${indent}     A picked file adds .has-image, and the CSS hides the placeholder. -->\n` +
    `${indent}<div class="${cls}${slot.path ? ' has-image' : ''}">\n` +
    `${indent}  <div class="corner-bug-mark">${inner}</div>\n` +
    `${indent}  <img id="${slot.field}" class="corner-bug-logo"` +
    `${slot.path ? ` src="${slot.path}"` : ' style="display: none"'} alt="" />\n` +
    `${indent}</div>`
  );
}

export interface BugSlotCss {
  /** Media box width, in design px (before --scale). */
  width: number;
  /** Media box height, in design px. */
  height: number;
  /** The placeholder geometry — pairs with the `mark` passed to bugSlotHtml. */
  mark: BugMark;
  /** Corner radius for the logo image, as a complete CSS value. Defaults to the family radius. */
  radius?: string;
  /** Where a logo that does not fill the box sits ('left center' hugs a left-aligned stack). */
  align?: string;
}

/** The CSS for the media box, its placeholder mark, and the logo image. */
export function bugSlotCss(o: BugSlotCss): string {
  const radius = o.radius ?? 'var(--panel-radius)';
  const align = o.align ?? 'center';
  return `/* The mark area — one box holding both the placeholder and the picked logo, so the
   design keeps its shape whether or not a file has been chosen yet. */
.corner-bug-media {
  position: relative;              /* the placeholder and the logo stack inside this box */
  width: calc(${o.width}px * var(--scale));   /* mark area width */
  height: calc(${o.height}px * var(--scale));  /* mark area height */
  flex: none;                      /* never squeezed by the text beside it */
}

${markCss(o.mark)}
.corner-bug-media.has-image .corner-bug-mark {
  display: none;                   /* a picked logo replaces the placeholder */
}

/* The logo — fills the mark area without cropping (a wide wordmark stays whole). */
.corner-bug-logo {
  position: absolute;              /* covers the mark area */
  inset: 0;                        /* all four edges */
  width: 100%;                     /* fill the box… */
  height: 100%;                    /* …both ways */
  border-radius: ${radius};  /* the logo follows the design's corner treatment */
  object-fit: contain;             /* show the whole logo, never crop it */
  object-position: ${align};       /* where a logo narrower than the box sits */
}`;
}

/** The placeholder's own rules — the one part that differs per style family. */
function markCss(mark: BugMark): string {
  // The solid sport block is inset a little so it reads as a MARK inside the slot rather than
  // as a filled panel; every other placeholder draws its own shape and fills the box.
  const inset =
    mark === 'slab'
      ? '  inset: 14%;                      /* a mark inside the slot, not a fill */'
      : '  inset: 0;                        /* all four edges */';
  const head = `/* The placeholder — what the slot shows until a logo file is picked. */
.corner-bug-mark {
  position: absolute;              /* fills the mark area */
${inset}`;
  switch (mark) {
    case 'bars':
      return `${head}
  display: flex;                   /* the three house bars stack… */
  flex-direction: column;          /* …top to bottom */
  justify-content: center;         /* centered in the mark box */
  gap: calc(7px * var(--scale));   /* air between the bars */
}
.corner-bug-mark i {
  display: block;                  /* each <i> is one bar */
  height: calc(11px * var(--scale));   /* bar thickness */
  border-radius: calc(4px * var(--scale));  /* softly rounded bar ends */
}
.corner-bug-mark i:nth-child(1) {
  width: 100%;                     /* the full-length accent bar on top */
  background: var(--accent);       /* the one accent moment */
  box-shadow: var(--accent-glow);  /* the house glow, on the accent only */
}
.corner-bug-mark i:nth-child(2) {
  width: 66%;                      /* the middle bar steps in */
  background: var(--text-color);   /* paper */
}
.corner-bug-mark i:nth-child(3) {
  width: 40%;                      /* the shortest bar closes the mark */
  background: var(--text-dim);     /* dimmed — the quietest bar */
}`;
    case 'diamond':
      return `${head}
}
.corner-bug-mark::before {
  content: '';                     /* pseudo-elements need content to render */
  position: absolute;              /* centered inside the mark box */
  left: 50%;                       /* to the middle… */
  top: 50%;                        /* …both ways */
  height: 62%;                     /* the lozenge is sized off the box HEIGHT… */
  width: auto;                     /* …and takes its width from the ratio below */
  aspect-ratio: 1;                 /* a real square: a wide slot must not skew it into a slash */
  transform: translate(-50%, -50%) rotate(45deg);  /* center it, then turn it into a diamond */
  background: var(--accent);       /* the one accent moment on the tile */
  border-radius: 18%;              /* softened points — proportional, so small slots keep the shape */
}`;
    case 'slab':
      return `${head}
  background: var(--accent);       /* sport fills its shapes — a solid accent block */
}`;
    case 'ring':
      return `${head}
  border: var(--accent-weight) solid var(--accent);  /* the one accent moment, drawn as a ring */
  border-radius: 50%;              /* a circle — the award/ceremony geometry */
}`;
    case 'label':
      return `${head}
  display: flex;                   /* the slot's name sits in the middle of the box */
  align-items: center;             /* vertically… */
  justify-content: center;         /* …and horizontally */
  border: var(--accent-weight) solid var(--accent);  /* the one accent moment, as an outline */
  border-radius: var(--panel-radius);  /* the family's corner treatment */
  font-size: calc(16px * var(--scale) * var(--type-scale));  /* small: it is a hint, not content */
  font-weight: 600;                /* semibold keeps tracked caps crisp */
  letter-spacing: 0.16em;          /* tracked caps — label voice */
  color: var(--text-color);        /* readable: this is what a fresh graphic shows */
  text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);  /* readable over bright footage */
}`;
    case 'keyline':
    default:
      return `${head}
  border: var(--accent-weight) solid var(--accent);  /* minimal draws lines, never fills */
  border-radius: var(--panel-radius);  /* the family's near-square radius */
}`;
  }
}

/** The `fN` ids a design's own fields take: everything the wizard emitted comes first. */
export function designFieldBase(lineCount: number, extraCount: number): number {
  return lineCount + extraCount;
}
