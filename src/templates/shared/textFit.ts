// Fit-to-slot for PLACED text lines (the imported-design contract, docs/IMPORT_MVP.md).
//
// A placed line sits at a fixed spot on artwork that was drawn around it, so the operator's
// value has to stay inside the room the design gives it. The wrapper's `max-width` is that
// room; how the text answers when it runs out is the line's FIT MODE, and two of the three
// are pure CSS:
//
//   overflow  no cap at all — the line runs as far as it likes (the original behaviour, and
//             still right for a line whose length the designer controls)
//   wrap      the cap plus `white-space: normal` — the text flows onto more rows
//   shrink    the cap plus `white-space: nowrap` and `data-fit="shrink"` — the text stays on
//             ONE row and condenses to fit, which is what a broadcast CG does with a name in
//             a drawn slot: reflowing it would push it into artwork it has to sit inside
//
// Only `shrink` needs code, because CSS cannot size text to its container. This runtime is
// design-owned JS: it is emitted OUTSIDE the marked ANIMATION region (like shared/clock.ts
// and the category motion runtimes), so the timeline never rewrites it and it survives every
// export untouched. The shared update() calls `fitPlacedText()` when it exists — the same
// optional-hook idiom next() uses for revealNextStep — and blocks/designLayout.ts injects
// this block, once, the first time a line asks for shrink.

/** The marker `ensureTextFitRuntime` tests for — present means the runtime is already in. */
export const TEXT_FIT_MARKER = 'function fitPlacedText';

/**
 * The marker of the OTHER fit — the imported-SVG FIT LADDER
 * (templates/importedDesign/svg.ts, docs/SVG_IMPORT_PLAN.md §6b).
 *
 * An imported SVG runs ONE fit: the ladder measures its placed lines too, so this runtime must
 * not be added to such a template. A second fit there would be worse than redundant — both
 * hooks run on every update(), each re-measures from a size the other just changed, and only
 * one of the two can report a value as too long (`noacgTextOverflow()`), so the operator's
 * overflow warning would go quiet on exactly the fields the ladder was extended to cover.
 * Named here rather than imported from importedDesign/ so blocks/ keeps its one edge into
 * templates/shared.
 */
export const SVG_TEXT_FIT_MARKER = 'function fitSvgText';

// The complete known old fitter, retained only to recognize its emitted runtime.
const FIT_ONE_PLACED_LINE_V1 = `function fitOnePlacedLine(el) {
  var slot = el.parentNode;
  if (!slot || !slot.getBoundingClientRect) return;
  el.style.fontSize = '';                       // back to the design size before measuring
  var room = slot.getBoundingClientRect().width;
  var design = parseFloat(window.getComputedStyle(el).fontSize);
  if (!room || !design) return;
  var floor = design * FIT_MIN_RATIO;
  for (var pass = 0; pass < 3; pass++) {
    var natural = el.getBoundingClientRect().width;
    if (natural <= room + 0.5) return;          // it fits — leave the design size alone
    var current = parseFloat(window.getComputedStyle(el).fontSize);
    var next = Math.max(floor, current * (room / natural));
    el.style.fontSize = next + 'px';
    if (next === floor) return;                 // at the floor: as small as it may go
  }
}`;

const FIT_ONE_PLACED_LINE = `function fitOnePlacedLine(el) {
  var slot = el.parentNode;
  if (!slot || !slot.getBoundingClientRect) return;
  el.style.fontSize = '';                       // refit from the authored design size
  var room = slot.getBoundingClientRect().width;
  var design = parseFloat(window.getComputedStyle(el).fontSize);
  if (!room || !design) return;
  var floor = design * FIT_MIN_RATIO;
  for (var pass = 0; pass < 3; pass++) {
    var natural = el.getBoundingClientRect().width;
    if (natural <= room) return;
    var current = parseFloat(window.getComputedStyle(el).fontSize);
    var next = Math.max(floor, current * (room / natural));
    el.style.fontSize = next + 'px';
    if (next === floor) return;                 // unreadable type is not a fit
  }
  if (el.getBoundingClientRect().width <= room) return;

  // Hinting can make glyph widths change in steps instead of proportionally (#775).
  // Bracket the actual width: lower fits, upper overflows. Twelve measurements bound
  // the remaining size interval to 1/4096, without a pixel margin or unbounded loop.
  var upper = parseFloat(window.getComputedStyle(el).fontSize);
  var lower = floor;
  el.style.fontSize = lower + 'px';
  if (el.getBoundingClientRect().width > room) return; // the floor itself cannot fit
  for (var settle = 0; settle < 12; settle++) {
    var middle = (lower + upper) / 2;
    el.style.fontSize = middle + 'px';
    if (el.getBoundingClientRect().width <= room) lower = middle;
    else upper = middle;
  }
  el.style.fontSize = lower + 'px';              // a size actually measured to fit
}`;

/**
 * The emitted runtime. Deliberately ES5 and comment-rich: it ships inside the user's
 * template.js, where it has to read as ordinary code a professional can edit.
 *
 * It shrinks by REDUCING FONT-SIZE rather than squeezing the glyphs horizontally. A
 * horizontal condense is the older hardware-CG trick, but it distorts the typeface the user
 * chose - and the typeface is part of the design they imported (docs/DESIGN_LANGUAGE.md).
 * Size is the honest lever; the floor stops it from shrinking into illegibility.
 */
const TEXT_FIT_RUNTIME_V1 = `// Fit every "shrink" line to the room its design gives it. Called after each update()
// (see update() above) and once when the DOM is ready, so the sample text fits too.
//
// How it works: the line's WRAPPER carries the max-width — the slot. The line itself is an
// inline-block that keeps its natural width, so comparing the two says whether the value
// overflows. If it does, the font-size comes down by the same ratio (a couple of passes,
// because type does not scale perfectly linearly) but never below FIT_MIN_RATIO of the
// design size — past that the line would be unreadable on air, which is worse than tight.
var FIT_MIN_RATIO = 0.55;        // never shrink below 55% of the size the design asks for

function fitPlacedText() {
  var lines = document.querySelectorAll('[data-fit="shrink"]');
  for (var i = 0; i < lines.length; i++) fitOnePlacedLine(lines[i]);
}

${FIT_ONE_PLACED_LINE_V1}

// The static sample text needs fitting too, before any update() arrives. This file loads in
// <head>, so the lines do not exist yet - wait for the DOM.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', fitPlacedText);
} else {
  fitPlacedText();                              // DOM already parsed (e.g. an inline preview build)
}

// …and again once the webfonts are in. The design's face loads with font-display: swap, so
// the first pass would otherwise measure the FALLBACK font - usually narrower than the real
// one, which leaves the fitted line overflowing its slot the moment the face swaps in.
if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
  document.fonts.ready.then(fitPlacedText);
}`;

/** Current emitted fitter; the surrounding readiness/update hooks are unchanged. */
export const TEXT_FIT_RUNTIME_JS = TEXT_FIT_RUNTIME_V1.replace(FIT_ONE_PLACED_LINE_V1, () => FIT_ONE_PLACED_LINE);

/** Prepare only a known emitted raster fit for OUTPUT. No source/store write belongs here.
 * A changed, partial, duplicated or SVG runtime remains its author's code. LF and CRLF
 * blocks are recognized independently so bytes outside the replaced block stay untouched. */
export function preparePlacedTextOutput(js: string): string {
  if (js.includes(SVG_TEXT_FIT_MARKER) || js.split(TEXT_FIT_MARKER).length !== 2) return js;
  const old = js.includes(TEXT_FIT_RUNTIME_V1) ? TEXT_FIT_RUNTIME_V1 : TEXT_FIT_RUNTIME_V1.replace(/\n/g, '\r\n');
  if (!js.includes(old)) return js;
  const live = old === TEXT_FIT_RUNTIME_V1 ? TEXT_FIT_RUNTIME_JS : TEXT_FIT_RUNTIME_JS.replace(/\n/g, '\r\n');
  return js.replace(old, () => live);
}

/**
 * The one line the shared update() uses to call the runtime. `ensureTextFitRuntime` adds it
 * to a template whose update() predates the hook (anything created before the fit contract),
 * so picking shrink works on a saved project too.
 */
export const TEXT_FIT_HOOK = `  // Designs that fit text to a fixed slot re-measure here (no-op otherwise).
  if (typeof fitPlacedText === 'function') fitPlacedText();`;
