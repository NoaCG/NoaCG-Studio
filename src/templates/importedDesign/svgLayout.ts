// THE LAYOUT TABLE of an imported SVG (docs/SVG_IMPORT_PLAN.md §6c): the growth rules a design
// declares, normalized to one shape, and the `NOACG_LAYOUT` text the build emits from them. Pure:
// a `DesignSvg` in, rules or table text out, so it is tested in Node
// (scripts/svg-layout-table.test.mjs). The stamp the bind pass writes and the runtime reads is
// named here, so the three agree on one spelling.

import type { DesignSvg, DesignSvgField, DesignSvgFollower, DesignSvgGrowth } from '../../model/wizard';
import { countdownIndex } from './artworkFields';
import { creditsIndex } from './creditsRoll';

/** The runtime's anchor words as a reader is shown them - on the grid, on the caret, and in the
 *  emitted table's comments. One map, so the three cannot drift. */
export const SVG_ALIGN_WORD = { start: 'left', middle: 'centred', end: 'right' } as const;

/** The attribute every element a layout rule names carries. One stamp kind for the feature. */
export const LAYOUT_EL_ATTR = 'data-noacg-el';
/** The emitted relationship table's schema (docs/SVG_IMPORT_PLAN.md §6c). Additive optional
 *  fields never bump it; a breaking shape change bumps it and migrates on read in the SAME
 *  commit, the doctrine docs/STATE_MACHINE_SCHEMA.md §5 states and `blocks/animData.ts` keeps. */
const LAYOUT_VERSION = 1;
/** How close to the frame's edge a growing element may get, as a fraction of the frame. The
 *  hug's original constant: growing off the screen was never a fit (plan §3). Exported because
 *  it is the floor the wizard's cap line stops at (`stageMeasure.growCapOf`), and a second copy
 *  of it is how the limit a reader can reach and the limit the runtime keeps drift apart. */
export const PANEL_SAFE = 0.04;

export const growToken = (i: number) => `g${i}`;
export const followToken = (i: number, j: number) => `g${i}f${j}`;

/**
 * THE LAYOUT RELATIONSHIPS OF A DESIGN, in one shape (plan §6c).
 *
 * A NORMALIZING read, the same idiom `parseAnimData` uses: the hug's original one-rectangle
 * `stretch` becomes one axis-'x' rule with derived followers - which is exactly what it always
 * meant - so a draft, a saved wizard option or a project from before this change still builds
 * the graphic it described, and nothing downstream ever sees two shapes.
 */
export function layoutRules(svg: DesignSvg): DesignSvgGrowth[] {
  if (svg.growth?.length) return svg.growth;
  return svg.stretch ? [{ candidateId: svg.stretch.candidateId, axis: 'x' }] : [];
}

/** The bound lines the author said something about - an alignment, or the nudge - with the field
 *  index each one binds as. The one predicate for "this design has a `lines` list". The countdown
 *  layer and the credits sample are left out: each becomes a display the runtime paints and
 *  never carries the field id a row would name (`bindSvgMarkup`), so a declaration on it could
 *  reach nothing. */
export function saidLines(svg: DesignSvg): { f: DesignSvgField; i: number }[] {
  const clock = countdownIndex(svg);
  const credits = creditsIndex(svg);
  return svg.fields.map((f, i) => ({ f, i })).filter(({ f, i }) => i !== clock && i !== credits && (f.align || f.nudge));
}

/**
 * THE RELATIONSHIP TABLE, emitted as data the growth runtime (svg.ts) loops over (plan §6c).
 *
 * It is DATA, and versioned, because it is a persisted format: the author declares which
 * element grows, which way, how far and what travels with it, and principle 6 applies to
 * anything a saved template carries. Emitted as a HIDDEN model it would be the second scene
 * model the architecture forbids; emitted as a commented literal the code reads - and the code
 * still the truth - it is not. A reader can delete a row and the relationship is gone.
 */
export function layoutDataJs(svg: DesignSvg, labelOf: (candidateId: string) => string): string {
  const rules = layoutRules(svg);
  const rows = rules.map((rule, i) => {
    const axis = rule.axis ?? 'x';
    const way = axis === 'x' ? 'wider' : 'taller';
    const followers = rule.followers?.length
      ? `,\n      followers: [${rule.followers
          .map((f: DesignSvgFollower, j: number) => `{ el: '${followToken(i, j)}', mode: '${f.mode ?? 'move'}' }`)
          .join(', ')}]`
      : '';
    const note = rule.followers?.length
      ? `${rule.followers.length} layer(s) travel with it`
      : 'whatever is drawn past its moving edge travels with it';
    // THE LIMIT THE AUTHOR SET, where they set one: written as the margin it keeps, so the row
    // says the same thing the wizard's cap line showed them. A row without it keeps the
    // design's own margin mirrored, which is every graphic emitted before caps existed.
    const cap = rule.cap != null ? `, cap: ${Number(rule.cap.toFixed(4))}` : '';
    const stops = rule.cap != null
      ? ` It stops ${Math.round(rule.cap * 100)}% of the frame short of the edge it grows towards.`
      : '';
    return `    // "${labelOf(rule.candidateId)}" grows ${way}; ${note}.${stops}
    { el: '${growToken(i)}', axis: '${axis}', safe: ${PANEL_SAFE}${cap}${followers} }`;
  });
  // HOW A LINE SITS IN ITS BOX, for the lines the author SAID it about (docs/TEXT_BOX_BINDING.md,
  // "Alignment"). Every other line is read off the drawing at play time, so the list is left out
  // entirely where nobody touched the grid - an untouched import emits the bytes it always did.
  // ADDITIVE to version 1: a runtime from before this list existed simply never looks for it.
  const said = saidLines(svg).map(({ f, i }) => {
    const kept = f.nudge ? '; keeps the nudge it was drawn with' : '';
    return `    // "${f.title}" - ${f.align ? `${SVG_ALIGN_WORD[f.align.h]}, ${f.align.v}` : 'as drawn'}${kept}.
    { el: 'f${i}'${f.align ? `, h: '${f.align.h}', v: '${f.align.v}'` : ''}${f.nudge ? ', nudge: true' : ''} }`;
  });
  const lines = said.length
    ? `,
  // Which edge each of these lines fills from and where its block sits in its box, as the author
  // set it on the Fields step. A line not listed is aligned the way it was drawn. \`nudge: true\`
  // keeps the offset the designer left between the block and its anchor.
  lines: [
${said.join(',\n')}
  ]`
    : '';
  return `
// ── Layout relationships (SVG) ────────────────────────────────────────────────
// WHICH ELEMENT MAY GROW, WHICH WAY, HOW FAR, AND WHAT TRAVELS WITH IT.
//
// Nothing here is elastic by default: a graphic with an empty table never moves, which is what
// every board and every scorebug wants. Each row names one element by the data-noacg-el stamp
// it carries in the artwork above, the axis it may grow on, and how close to the frame's edge
// it may get (\`safe\`, a fraction of the frame). \`cap\` is a tighter limit the author set by
// hand: the margin the growing edge must leave on the side it grows towards, as a fraction of
// the frame. Leave it out and the element keeps the margin the design drew on its other side.
// A row with its own \`followers\` list moves
// exactly those layers; a row without one falls back to measuring what sits past the growing
// edge, which is a fair guess sideways and a poor one downwards - so a vertical rule is
// normally written with its followers spelled out.
//
// A follower travels by default (\`mode: 'move'\`): it keeps its distance and its size. Write
// \`mode: 'grow'\` instead and the layer is STRETCHED by what the panel gained, which is what a
// rail or a tint band wants. You rarely need to: furniture drawn to the panel's own two edges is
// measured and stretched automatically, and never appears in this list.
//
// Delete a row and that element stops growing. Edit \`axis\` and it grows the other way.
var NOACG_LAYOUT = {
  version: ${LAYOUT_VERSION},
  rules: [
${rows.join(',\n')}
  ]${lines}
};
`;
}
