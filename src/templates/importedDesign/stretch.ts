// The STRETCH runtime for an imported design in horizontal 9-slice mode (docs/IMPORT_MVP.md).
//
// The artwork's CSS makes it a 9-slice (see the `.imported-design-art` rule the assembler
// emits): drawn caps at fixed width, a plain middle band that stretches. This runtime decides
// HOW MUCH: it measures how far the operator's text overflows the room the drawn design gives
// it and widens the design by exactly that, capped a little inside the frame edge. ONE value
// drives everything — the `--stretch-x` custom property (design px) on the design box — read
// by the box width, the artwork's middle band, and every `[data-stretch]` slot's max-width.
//
// It composes with the text-fit runtime (templates/shared/textFit.ts) instead of fighting it:
// stretch runs FIRST and gives the room; the slots' max-width carries the stretch term, so
// fitPlacedText() then measures the GROWN slot and shrinks only whatever the safe-area cap
// could not give. Like textFit, this is design-owned JS emitted OUTSIDE the marked ANIMATION
// region — the timeline never rewrites it and it survives every export untouched.

/** The marker a stretch-capable template carries (the emit is idempotent against it). */
export const STRETCH_MARKER = 'function stretchDesignWidth';

/** The emitted runtime. Deliberately ES5 and comment-rich — it ships inside the user's
 *  template.js, where it has to read as ordinary code a professional can edit. */
export function stretchRuntimeJs(prefix: string): string {
  return `// ── Stretch-with-text (design-owned — the timeline never touches this) ──────────────
// The artwork is a horizontal 9-slice (see .${prefix}-art in template.css): its plain middle
// band stretches so the operator's text fits at FULL size before any shrinking. One value
// drives everything: --stretch-x (design px) on the design box — the box width, the artwork's
// middle band, and every [data-stretch] slot read it. Runs before fitPlacedText(): stretching
// gives the room, shrinking answers only what the frame's safe margin could not give.
var STRETCH_SAFE = 0.04;         // keep the stretched design 4% inside the frame edge

function stretchDesignWidth() {
  var box = document.querySelector('.${prefix}-box');
  if (!box) return;
  box.style.removeProperty('--stretch-x');       // measure the design at rest first
  var scale = parseFloat(getComputedStyle(document.documentElement)
    .getPropertyValue('--scale')) || 1;

  // The widest DEFICIT among the stretch-driving lines: how far each one's text overflows
  // the room the drawn design gives it. Layout metrics (scrollWidth/clientWidth) on purpose —
  // they ignore transforms, so an update() arriving mid-entrance still measures true.
  var need = 0;
  var slots = box.querySelectorAll('[data-stretch]');
  for (var i = 0; i < slots.length; i++) {
    var line = slots[i].querySelector('[data-fit="shrink"]');
    if (!line) continue;
    line.style.fontSize = '';                    // back to the design size before measuring
    var deficit = line.scrollWidth - slots[i].clientWidth;
    if (deficit <= 0) continue;                  // this line fits — it asks for nothing
    deficit += 1;                                // +1 absorbs integer px rounding
    if (deficit > need) need = deficit;
  }

  // The frame-edge cap. Which way the design grows depends on how its root is anchored (a
  // right-zone design grows LEFTWARD), so probe it: widen by a hair and see whether the left
  // edge moved. offsetLeft sums are transform-free — an entrance never skews this. The walk
  // stops at the canvas (body), the frame the cap below is measured in: inside an OGraf
  // renderer the body is the graphic's own element, and the page past it is the renderer's.
  function edgeLeft() {
    var x = 0;
    for (var el = box; el && el !== document.body; el = el.offsetParent) x += el.offsetLeft;
    return x;
  }
  var restLeft = edgeLeft();
  var restWidth = box.offsetWidth;
  box.style.setProperty('--stretch-x', '10px');
  var growsLeft = edgeLeft() < restLeft - 1;
  box.style.removeProperty('--stretch-x');
  var frame = document.body.clientWidth;
  var max = growsLeft
    ? restLeft - frame * STRETCH_SAFE
    : frame * (1 - STRETCH_SAFE) - restLeft - restWidth;

  var stretch = Math.min(need, Math.max(0, max));
  if (stretch > 0) box.style.setProperty('--stretch-x', (stretch / scale).toFixed(1) + 'px');
}

// Size the design to its sample text before any update() arrives. This file loads in <head>,
// so wait for the DOM — and run again once the webfonts are in (the first pass measured the
// fallback face; see the same doctrine in fitPlacedText below when it is present).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', stretchDesignWidth);
} else {
  stretchDesignWidth();
}
if (document.fonts && document.fonts.ready && document.fonts.ready.then) {
  document.fonts.ready.then(stretchDesignWidth);
}`;
}

/**
 * Wire the stretch runtime into a freshly assembled template's JS: the update() hook line
 * (BEFORE the text-fit hook — stretch gives the room, the fit answers the rest) plus the
 * runtime block appended after the scaffold. The hook regex matches the exact comment
 * runtimeJs (templates/shared/base.ts) emits; a hand-rewritten update() keeps its own
 * behaviour and the DOM-ready/fonts.ready passes still size the sample text.
 */
export function withStretchRuntime(js: string, prefix: string): string {
  if (js.includes(STRETCH_MARKER)) return js;
  const hooked = js.replace(
    /(\n {2}\/\/ Designs that fit text to a fixed slot re-measure here \(no-op otherwise\)\.)/,
    `\n  // A stretchable design re-measures its width FIRST (no-op otherwise) — stretching
  // gives the room, the text fit below answers only what the frame edge could not give.
  if (typeof stretchDesignWidth === 'function') stretchDesignWidth();$1`,
  );
  return `${hooked}
${stretchRuntimeJs(prefix)}
`;
}
