// The pack's two LIST BOARDS — key facts / explainers, and recaps / action items.
//
// They live in the infographic category rather than with the cards, and that is the accurate
// home rather than a convenience: their content is a LIST the operator types into one textarea
// and a runtime renders, exactly like the schedule board and the poll. That also means their
// motion is MEASURED — one cascade step per row the operator wrote — which is the thing the
// info-card contract cannot express and the infographic one can.
//
// Both share the pack's four family skins (templates/pack4/skin.ts), so a fact sheet and a
// title card made in the same project still read as siblings.

import type { SpxField } from '../../../model/types';
import type { ResolvedOptions } from '../../../model/wizard';
import {
  accentCss,
  accentInset,
  decl,
  labelCss,
  panelCss,
  px,
  readableTextCss,
  textLegibilityCss,
  typeSize,
  type BoxPad,
  type Pack4Skin,
} from '../../pack4/skin';
import type { IgDesign } from '../shared';
import { factRowsRuntimeJs, recapRowsRuntimeJs } from './listRuntimes';

const P = 'infographic';

/** The two operator fields both boards carry: the rows source, then the heading. */
export function boardFields(o: ResolvedOptions, rowsTitle: string, headingTitle: string): {
  fields: SpxField[];
  rowsText: string;
  headingText: string;
} {
  const rowsText = o.lines[0]?.sample ?? '';
  const headingText = o.lines[1]?.sample ?? '';
  return {
    rowsText,
    headingText,
    fields: [
      { field: 'f0', ftype: 'textarea', title: o.lines[0]?.title || rowsTitle, value: rowsText },
      { field: 'f1', ftype: 'textfield', title: o.lines[1]?.title || headingTitle, value: headingText },
    ],
  };
}

/** The shared board markup: a heading, then the rows the runtime renders, then the source. */
export function boardHtml(comment: string, headingText: string, rowsText: string, sourceLabel: string): string {
  return `    <!-- ${comment} -->
    <div class="${P}-box">
      <!-- The accent motif — the design's one loud color moment. -->
      <div class="${P}-accent"></div>
      <!-- Heading — SPX writes field f1 straight into this element. -->
      <div class="${P}-heading" id="f1">${headingText}</div>
      <!-- The rows — rendered by rebuildInfographic() from the hidden source below. -->
      <div id="${P}-rows"></div>
    </div>
    <!-- Hidden ${sourceLabel} source — SPX writes field f0 here; the runtime renders it.
         One row per line. -->
    <div id="f0" class="noacg-data-source">${rowsText}</div>`;
}

/** Padding per family, shared by both boards. */
const PAD = {
  clean: { top: 6, right: 0, bottom: 6, left: 30 },
  frost: { top: 40, right: 54, bottom: 36, left: 46 },
  volt: { top: 36, right: 56, bottom: 30, left: 46 },
  house: { top: 32, right: 52, bottom: 32, left: 38 },
} as const;

/** The panel + accent + heading every board of this pack shares. */
function boardChrome(skin: Pack4Skin, pad: BoxPad, headingSize: number, minWidth: number): string {
  return `${panelCss(
    skin,
    P,
    pad,
    [
      decl('min-width', px(minWidth), 'a board holds its shape even when every row is short'),
      decl('text-align', 'left', 'rows and their markers stay left-aligned in every anchor zone'),
    ].join('\n'),
  )}

${accentCss(skin, P, pad)}

${labelCss(`.${P}-heading`, headingSize, 'The heading (f1) — what this board IS. One tracked-caps line above the rows.')}

/* The board — one row under another; each row carries its own separator. */
#${P}-rows {
${decl('display', 'flex', 'a simple vertical stack')}
${decl('flex-direction', 'column', 'one row under the next')}
${decl('margin-top', px(18), 'clear air under the heading')}
}`;
}

// ── KEY FACTS ────────────────────────────────────────────────────────────────

/** Build a key-facts / explainer board in one of the pack's four looks. */
export function buildFactsBoard(skin: Pack4Skin, o: ResolvedOptions): IgDesign {
  const pad: BoxPad = { ...PAD[skin.id], left: accentInset(skin, PAD[skin.id].left) };
  const { fields, rowsText, headingText } = boardFields(o, 'Facts', 'Heading');
  const caps = skin.id === 'volt';
  const legibility = textLegibilityCss(skin, `.${P}-heading,\n.${P}-fact-term,\n.${P}-fact-note`);

  return {
    html: boardHtml(
      'Key facts: a heading over one "term | explanation" row per line.',
      headingText,
      rowsText,
      'facts',
    ),

    css: `${boardChrome(skin, pad, skin.id === 'volt' ? 22 : 20, 560)}

/* One fact: the term above, then what it means. Stacked rather than side by side, because an
   explanation is a sentence and a two-column row would squeeze it into a gutter. */
.${P}-row {
${decl('padding', `${px(14)} 0`, 'even vertical rhythm down the board')}
}

/* Thin separators between rows — not above the first, and never below the last. */
.${P}-row + .${P}-row {
${decl('border-top', '1px solid rgba(255, 255, 255, 0.12)', 'a keyline hairline between facts')}
}

/* The term (the part before the pipe) — the question this fact answers. */
.${P}-fact-term {
${decl('display', 'block', 'its own row above the explanation')}
${decl('font-family', 'var(--font-label)', "the family's label face")}
${decl('font-size', typeSize(20), 'small: the term labels the fact, it is not the fact')}
${decl('font-weight', '700', 'bold keeps small caps legible')}
${decl('line-height', '1.25', 'one tight label line')}
${decl('letter-spacing', 'var(--label-tracking)', "the family's label tracking")}
${decl('text-transform', 'uppercase', 'reads as a label, whatever the operator types')}
${decl('color', 'var(--accent)', 'the accent dose that threads the facts together')}
}

/* The explanation (everything after the pipe) — the fact itself, and the reason for the board. */
.${P}-fact-note {
${decl('display', 'block', 'its own row under the term')}
${decl('font-size', typeSize(caps ? 25 : 26), 'the largest type on the board — the fact is the content')}
${decl('font-weight', '500', 'medium: readable at distance without shouting')}
${decl('line-height', '1.35', 'a fact that wraps stays readable')}${
      caps ? `\n${decl('text-transform', 'uppercase', 'the sport board is shouted')}` : ''
    }
${decl('color', 'var(--text-color)', 'full strength — every fact matters equally')}
${decl('margin-top', px(6), 'term and fact read as one unit')}
}

${readableTextCss(`.${P}-fact-note`, 'How a fact wraps — spaces first, and never a hyphen on air.')}${
      legibility ? `\n\n${legibility}` : ''
    }`,

    fields,
    // rebuildInfographic(): render the fact rows from the hidden #f0 source. Shared by every
    // design of this type — see pack4/listRuntimes.ts.
    runtimeExtraJs: factRowsRuntimeJs(),
  };
}

// ── RECAP / ACTION ITEMS ─────────────────────────────────────────────────────

/** Build a recap / action-items board in one of the pack's four looks. */
export function buildRecapBoard(skin: Pack4Skin, o: ResolvedOptions): IgDesign {
  const pad: BoxPad = { ...PAD[skin.id], left: accentInset(skin, PAD[skin.id].left) };
  const { fields, rowsText, headingText } = boardFields(o, 'Items', 'Heading');
  const caps = skin.id === 'volt';
  const legibility = textLegibilityCss(skin, `.${P}-heading,\n.${P}-owner,\n.${P}-action`);

  return {
    html: boardHtml(
      'Recap / action items: a heading over one "owner | action" row per line.',
      headingText,
      rowsText,
      'action items',
    ),

    css: `${boardChrome(skin, pad, skin.id === 'volt' ? 22 : 20, 620)}

/* One action item: the owner's chip and the action on one line, sharing a baseline. */
.${P}-row {
${decl('display', 'flex', 'owner and action sit on one row')}
${decl('align-items', 'baseline', 'the two type sizes sit on one baseline')}
${decl('gap', px(20), 'clear air between the owner and the action')}
${decl('padding', `${px(13)} 0`, 'even vertical rhythm down the board')}
}

/* Thin separators between rows — not above the first, and never below the last. */
.${P}-row + .${P}-row {
${decl('border-top', '1px solid rgba(255, 255, 255, 0.12)', 'a keyline hairline between items')}
}

/* The owner (the part before the pipe) — who is doing it. A fixed-width column, so the
   actions line up down the board however long the names are. An item with no owner simply
   starts at the action, which is what an unassigned action should look like. */
.${P}-owner {
${decl('flex', '0 0 auto', 'the owner column never stretches')}
${decl('min-width', px(150), 'one shared column width — the actions align vertically')}
${decl('font-family', 'var(--font-label)', "the family's label face")}
${decl('font-size', typeSize(20), 'small: a name, not the item')}
${decl('font-weight', '700', 'bold keeps small caps legible')}
${decl('line-height', '1.3', 'one tight label line')}
${decl('letter-spacing', 'var(--label-tracking)', "the family's label tracking")}
${decl('text-transform', 'uppercase', 'reads as a label, whatever the operator types')}
${decl('color', 'var(--accent)', 'the accent dose that threads the owners together')}
${decl('overflow-wrap', 'break-word', 'a very long name breaks instead of pushing the column')}
}

/* The action (everything after the pipe) — what actually has to happen. */
.${P}-action {
${decl('min-width', '0', 'allow the action to shrink and wrap inside the row')}
${decl('font-size', typeSize(caps ? 24 : 25), 'the board’s main voice')}
${decl('font-weight', '500', 'medium: readable at distance without shouting')}
${decl('line-height', '1.35', 'an action that wraps stays readable')}${
      caps ? `\n${decl('text-transform', 'uppercase', 'the sport board is shouted')}` : ''
    }
${decl('color', 'var(--text-color)', 'full strength — the action is the content')}
}

${readableTextCss(`.${P}-action`, 'How an action wraps — spaces first, and never a hyphen on air.')}${
      legibility ? `\n\n${legibility}` : ''
    }`,

    fields,
    // rebuildInfographic(): render the action rows from the hidden #f0 source. Shared by every
    // design of this type — see pack4/listRuntimes.ts.
    runtimeExtraJs: recapRowsRuntimeJs(),
  };
}
