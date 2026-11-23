// Artwork credits move the original text, including every Illustrator run and gap. They never
// pass through the editable credits parser. The wrapper owns motion so the text's transform,
// styling, ids and references remain the designer's.
import { CREDITS_SPEED_KEY } from '../behaviours/credits';
import { creditsClass } from './creditsRoll';

export function creditsArtworkCss(prefix: string): string {
  return `/* The output frame clips the roll; the SVG must retain text beyond its artboard. */
.${prefix}-art { overflow: visible; }
.${prefix}-credits-travel[data-noacg-stopped] { visibility: hidden; }`;
}

/** `block`: the credits are drawn as separate role and name layers (`creditsArtworkLayers`), and
 *  every one of them scrolls. Each layer keeps its own wrapper where it was drawn, so its parent's
 *  transform and its place in the drawing order stay the designer's; one tween moves them all by
 *  the same screen distance, measured over the whole block. Without it the runtime is exactly what
 *  one drawn text has always built. */
export function creditsArtworkRuntimeJs(prefix: string, frameHeight: number, block = false): string {
  const cls = creditsClass(prefix);
  const one = (single: string, many: string) => (block ? many : single);
  return `
// Original SVG credits: one complete roll per play, preserving the text as drawn.
var noacgCreditsTween = null;
var noacgCreditsStart = null;
var noacgCreditsLast = null;
var noacgCreditsGeneration = 0;
var noacgCreditsBuiltAt = 1;

${one(`function creditsArtwork() {
  var text = document.querySelector('.${cls}');
  if (!text || !text.parentNode) return null;
  var travel = text.parentNode;
  if (!travel.classList.contains('${prefix}-credits-travel')) {
    travel = document.createElementNS(text.namespaceURI, 'g');
    travel.setAttribute('class', '${prefix}-credits-travel');
    text.parentNode.insertBefore(travel, text);
    travel.appendChild(text);
  }
  return { text: text, travel: travel };
}`, `// Every role and name layer of the drawing, each in its own wrapper where it was drawn.
function creditsArtwork() {
  var texts = document.querySelectorAll('.${cls}');
  var travels = [];
  for (var i = 0; i < texts.length; i++) {
    var text = texts[i];
    if (!text.parentNode) continue;
    var travel = text.parentNode;
    if (!travel.classList.contains('${prefix}-credits-travel')) {
      travel = document.createElementNS(text.namespaceURI, 'g');
      travel.setAttribute('class', '${prefix}-credits-travel');
      text.parentNode.insertBefore(travel, text);
      travel.appendChild(text);
    }
    travels.push(travel);
  }
  return travels.length ? { texts: texts, travels: travels } : null;
}`)}

function creditsLiveSpeed() {
  var id = typeof noacgFieldFor === 'function' ? noacgFieldFor('${CREDITS_SPEED_KEY}', null) : null;
  var field = id ? document.getElementById(id) : null;
  var percent = field ? parseFloat(field.textContent) : NaN;
  if (!isFinite(percent) || percent <= 0) percent = 100;
  return Math.min(400, Math.max(10, percent)) / 100 * (typeof motionSpeed === 'function' ? motionSpeed() : 1);
}

// Invalidate a take still waiting for fonts as well as a take already moving.
function stopCreditsRoll() {
  noacgCreditsGeneration++;
  if (noacgCreditsStart) noacgCreditsStart.kill();
  noacgCreditsStart = null;
  if (noacgCreditsTween) noacgCreditsTween.kill();
  noacgCreditsTween = null;
  var artwork = creditsArtwork();
${one(`  if (artwork) {
    artwork.travel.removeAttribute('data-noacg-rolling');
    artwork.travel.setAttribute('data-noacg-stopped', '');
  }`, `  for (var i = 0; artwork && i < artwork.travels.length; i++) {
    artwork.travels[i].removeAttribute('data-noacg-rolling');
    artwork.travels[i].setAttribute('data-noacg-stopped', '');
  }`)}
}

function noacgCreditsRoll() {
  stopCreditsRoll();
  noacgCreditsLast = null;
  var generation = noacgCreditsGeneration;
  if (typeof gsap === 'undefined') return;
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  var measure = function () {
    if (generation !== noacgCreditsGeneration || typeof gsap === 'undefined') return;
${one(`    var artwork = creditsArtwork();
    if (!artwork) return;
    var travel = artwork.travel;
    travel.removeAttribute('transform');
    var parent = travel.parentNode;
    var matrix = parent.getScreenCTM && parent.getScreenCTM();
    // A visibility-hidden SVG can retain glyph metrics from the entrance's earlier scale.
    // Reveal and position in this one synchronous callback: its first visible paint is below
    // the frame, while the measurement sees the text's actual visible layout.
    travel.removeAttribute('data-noacg-stopped');
    var text = artwork.text.getBoundingClientRect();
    var frame = document.body.getBoundingClientRect();
    if (!matrix || !(text.height > 0) || !(frame.height > 0)) {
      travel.setAttribute('data-noacg-stopped', '');
      return;
    }
    var inverse = matrix.inverse();
    // Measure the entire original object, including names outside its SVG viewBox. A screen
    // vertical vector mapped into the parent's coordinates also handles rotated/scaled groups.
    var startY = frame.bottom - text.top;
    var endY = frame.top - text.bottom;
    var distance = startY - endY;
    var speed = creditsLiveSpeed();
    var duration = distance / (90 * frame.height / ${frameHeight} * speed);
    var position = { y: startY };
    var paint = function () {
      travel.setAttribute('transform', 'translate(' + (inverse.c * position.y) + ' ' + (inverse.d * position.y) + ')');
    };
    paint();
    travel.setAttribute('data-noacg-rolling', '');
    noacgCreditsBuiltAt = speed;
    noacgCreditsLast = {
      startY: startY, endY: endY, distance: distance, duration: duration,
      boxed: false, artwork: true,
      parentMatrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
    };
`, `    var artwork = creditsArtwork();
    if (!artwork) return;
    var travels = artwork.travels;
    var matrices = [];
    var i;
    for (i = 0; i < travels.length; i++) {
      travels[i].removeAttribute('transform');
      var parent = travels[i].parentNode;
      matrices.push(parent.getScreenCTM && parent.getScreenCTM());
    }
    // A visibility-hidden SVG can retain glyph metrics from the entrance's earlier scale.
    // Reveal and position in this one synchronous callback: its first visible paint is below
    // the frame, while the measurement sees the block's actual visible layout.
    for (i = 0; i < travels.length; i++) travels[i].removeAttribute('data-noacg-stopped');
    // The whole drawn block: the highest top and the lowest bottom of its layers, on screen.
    var top = Infinity;
    var bottom = -Infinity;
    for (i = 0; i < artwork.texts.length; i++) {
      var box = artwork.texts[i].getBoundingClientRect();
      if (!(box.height > 0)) continue;
      top = Math.min(top, box.top);
      bottom = Math.max(bottom, box.bottom);
    }
    var frame = document.body.getBoundingClientRect();
    var placed = true;
    for (i = 0; i < matrices.length; i++) if (!matrices[i]) placed = false;
    if (!placed || !(bottom > top) || !(frame.height > 0)) {
      for (i = 0; i < travels.length; i++) travels[i].setAttribute('data-noacg-stopped', '');
      return;
    }
    // One screen vertical vector, mapped into each layer's own parent: a layer in a rotated or
    // scaled group moves exactly as far on screen as one drawn level.
    var inverses = [];
    for (i = 0; i < matrices.length; i++) inverses.push(matrices[i].inverse());
    var startY = frame.bottom - top;
    var endY = frame.top - bottom;
    var distance = startY - endY;
    var speed = creditsLiveSpeed();
    var duration = distance / (90 * frame.height / ${frameHeight} * speed);
    var position = { y: startY };
    var paint = function () {
      for (var k = 0; k < travels.length; k++) {
        travels[k].setAttribute('transform', 'translate(' + (inverses[k].c * position.y) + ' ' + (inverses[k].d * position.y) + ')');
      }
    };
    paint();
    for (i = 0; i < travels.length; i++) travels[i].setAttribute('data-noacg-rolling', '');
    noacgCreditsBuiltAt = speed;
    var matrix = matrices[0];
    noacgCreditsLast = {
      startY: startY, endY: endY, distance: distance, duration: duration,
      boxed: false, artwork: true, layers: travels.length,
      parentMatrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
    };
`)}    noacgCreditsTween = gsap.to(position, { y: endY, duration: duration, ease: 'none', onUpdate: paint });
  };
  var afterEntrance = function () {
    if (generation !== noacgCreditsGeneration) return;
    // The root and its box can both have entrance tracks. Their actual GSAP playheads are
    // authoritative: a duration-based timer may land between their last render ticks.
${one(`    var text = document.querySelector('.${cls}');
    for (var node = text; node; node = node.parentElement) {
      var tweens = gsap.getTweensOf(node, true);
      for (var i = 0; i < tweens.length; i++) {
        var span = tweens[i].totalDuration();
        if (span > 0 && span < 1e9) { requestAnimationFrame(afterEntrance); return; }
      }
    }`, `    // A staggered entrance tracks each layer of the block on its own.
    var texts = document.querySelectorAll('.${cls}');
    for (var t = 0; t < texts.length; t++) {
      for (var node = texts[t]; node; node = node.parentElement) {
        var tweens = gsap.getTweensOf(node, true);
        for (var i = 0; i < tweens.length; i++) {
          var span = tweens[i].totalDuration();
          if (span > 0 && span < 1e9) { requestAnimationFrame(afterEntrance); return; }
        }
      }
    }`)}
    // GSAP has written the final CSS scale, but this frame has not painted it yet. SVG text
    // can still report glyph metrics from the preceding scale. Let that repaint finish before
    // measuring, rather than calibrating several positions against the same stale metrics.
    requestAnimationFrame(function () {
      if (generation !== noacgCreditsGeneration) return;
      noacgCreditsStart = null;
      ready.then(measure);
    });
  };
  var begin = function () {
    requestAnimationFrame(afterEntrance);
  };
  // Read the FINAL animation data at play time. Preset changes may lengthen the entrance after
  // assembly, so an assembly-time end-call could still measure a moving/scaling ancestor.
  var entrance = typeof NOACG_ANIM !== 'undefined' && NOACG_ANIM.steps && NOACG_ANIM.steps[0];
  var pace = typeof motionSpeed === 'function' ? motionSpeed() : 1;
  noacgCreditsStart = gsap.delayedCall(entrance ? entrance.duration / pace : 0, begin);
}

// Only pace is editable. Data updates never reconstruct or reflow the imported text.
function creditsDataUpdated() {
  if (noacgCreditsTween) noacgCreditsTween.timeScale(creditsLiveSpeed() / noacgCreditsBuiltAt);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', creditsArtwork);
else creditsArtwork();
`;
}

/** What a whole-artwork roll measures: every element that can draw, outside what only defines
 *  (gradients, clips, masks, patterns, markers, symbols). Shared with the import step's own mirror
 *  of the rule (components/wizard/import/stageMeasure.ts `drawnOutsideArtboard`). */
export const CREDITS_DRAWN_SELECTOR = 'text, image, rect, path, circle, ellipse, line, polyline, polygon, use, foreignObject';
export const CREDITS_DEFINES_SELECTOR = 'defs, clipPath, mask, pattern, marker, symbol';

/** THE WHOLE ARTWORK ROLLS (`DesignSvgRecipeBehaviour.wholeArtwork`; the Rules are
 *  docs/work-specs/svg-template-library/evidence/full-roll.md). Everything the file draws moves as
 *  one picture: one wrapper around every drawing child of the artwork's root `<svg>`, one tween,
 *  the same pace and speed field as the text roll. Its own function, so the text and block
 *  variants above emit exactly the bytes they always have (R2).
 *
 *  Where it differs from the text roll, and why:
 *  - The roll IS the entrance (R6): the wrapper holds the whole graphic, so it stays hidden from
 *    Take until the In has landed, and the wait reads every wrapped element's own tweens, because a
 *    staggered In moves sibling layers the Credits text is not inside.
 *  - Out freezes the roll and lets the graphic's own Out play over it (R5); hiding the wrapper at
 *    Out would hide the whole graphic at once. Take hides it again before it starts.
 *  - The extent is what PAINTS (R7): an artboard rectangle with no fill, a hidden or transparent
 *    layer, would otherwise add blank seconds at the start and the end.
 *  - A re-fit during the roll measures at rest (R11): the fit ladder cuts a line's room to the
 *    frame, and a line rolled off it would read as having none. */
export function creditsWholeRuntimeJs(prefix: string, frameHeight: number): string {
  const cls = creditsClass(prefix);
  return `
// Original SVG credits, the whole artwork: everything drawn rolls as one picture, one complete
// roll per play.
var noacgCreditsTween = null;
var noacgCreditsStart = null;
var noacgCreditsLast = null;
var noacgCreditsGeneration = 0;
var noacgCreditsBuiltAt = 1;
// What never draws stays where the file put it, outside the rolled group.
var noacgCreditsInert = { defs: 1, style: 1, title: 1, desc: 1, metadata: 1, script: 1 };

function creditsArtwork() {
  var root = document.querySelector('svg.${prefix}-art');
  if (!root || !document.querySelector('.${cls}')) return null;
  var travel = null;
  for (var i = 0; i < root.children.length; i++) {
    if (root.children[i].classList.contains('${prefix}-credits-travel')) travel = root.children[i];
  }
  if (!travel) {
    travel = document.createElementNS(root.namespaceURI, 'g');
    travel.setAttribute('class', '${prefix}-credits-travel');
    travel.setAttribute('data-noacg-whole', '');
    var kids = Array.prototype.slice.call(root.children);
    for (i = 0; i < kids.length; i++) {
      if (!noacgCreditsInert[kids[i].localName]) travel.appendChild(kids[i]);
    }
    root.appendChild(travel);
  }
  return { root: root, travel: travel };
}

// The element's own computed style when it paints anything, else null: displayed, visible, not
// transparent, and for a shape a fill or a stroke that shows. Visibility is inherited, so the
// element's own value answers for its ancestors. A transparent hit area (fill-opacity 0) paints
// nothing.
function creditsPaints(node, travel) {
  for (var e = node; e && e !== travel; e = e.parentNode) {
    var cs = getComputedStyle(e);
    if (cs.display === 'none' || parseFloat(cs.opacity) === 0) return null;
  }
  var own = getComputedStyle(node);
  if (own.visibility !== 'visible') return null;
  var tag = node.localName;
  if (tag === 'image' || tag === 'use' || tag === 'foreignObject') return own;
  var fills = own.fill !== 'none' && parseFloat(own.fillOpacity) !== 0;
  var strokes = own.stroke !== 'none' && parseFloat(own.strokeOpacity) !== 0 && parseFloat(own.strokeWidth) !== 0;
  return fills || strokes ? own : null;
}

// The screen top and bottom of everything the wrapper paints, or null.
function creditsPaintedBox(travel) {
  var nodes = travel.querySelectorAll('${CREDITS_DRAWN_SELECTOR}');
  var top = Infinity;
  var bottom = -Infinity;
  for (var i = 0; i < nodes.length; i++) {
    var n = nodes[i];
    if (n.closest('${CREDITS_DEFINES_SELECTOR}')) continue;
    var box = n.getBoundingClientRect();
    // A flat rule has no height but paints; a stroke paints half its width outside the box.
    if (!(box.height > 0 || box.width > 0)) continue;
    var style = creditsPaints(n, travel);
    if (!style) continue;
    var m = n.getScreenCTM && n.getScreenCTM();
    var pad = style.stroke !== 'none' && m ? parseFloat(style.strokeWidth) / 2 * Math.sqrt(m.c * m.c + m.d * m.d) : 0;
    if (!(pad > 0)) pad = 0;
    top = Math.min(top, box.top - pad);
    bottom = Math.max(bottom, box.bottom + pad);
  }
  return bottom > top ? { top: top, bottom: bottom } : null;
}

function creditsLiveSpeed() {
  var id = typeof noacgFieldFor === 'function' ? noacgFieldFor('${CREDITS_SPEED_KEY}', null) : null;
  var field = id ? document.getElementById(id) : null;
  var percent = field ? parseFloat(field.textContent) : NaN;
  if (!isFinite(percent) || percent <= 0) percent = 100;
  return Math.min(400, Math.max(10, percent)) / 100 * (typeof motionSpeed === 'function' ? motionSpeed() : 1);
}

// Out, and the start of every take and snap: invalidate a take still waiting for fonts as well as
// a take already moving. The pose stays, so the graphic's own Out plays over the frozen roll.
function stopCreditsRoll() {
  noacgCreditsGeneration++;
  if (noacgCreditsStart) noacgCreditsStart.kill();
  noacgCreditsStart = null;
  if (noacgCreditsTween) noacgCreditsTween.kill();
  noacgCreditsTween = null;
  var artwork = creditsArtwork();
  if (artwork) artwork.travel.removeAttribute('data-noacg-rolling');
  return artwork;
}

function noacgCreditsRoll() {
  var held = stopCreditsRoll();
  if (held) held.travel.setAttribute('data-noacg-stopped', '');
  noacgCreditsLast = null;
  var generation = noacgCreditsGeneration;
  if (typeof gsap === 'undefined') return;
  var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  var measure = function () {
    if (generation !== noacgCreditsGeneration || typeof gsap === 'undefined') return;
    var artwork = creditsArtwork();
    if (!artwork) return;
    var travel = artwork.travel;
    travel.removeAttribute('transform');
    var matrix = artwork.root.getScreenCTM && artwork.root.getScreenCTM();
    // Reveal and position in this one synchronous callback: the first visible paint is below the
    // frame, while the measurement sees the artwork's actual visible layout.
    travel.removeAttribute('data-noacg-stopped');
    var drawn = creditsPaintedBox(travel);
    var frame = document.body.getBoundingClientRect();
    if (!matrix || !drawn || !(frame.height > 0)) {
      travel.setAttribute('data-noacg-stopped', '');
      return;
    }
    var inverse = matrix.inverse();
    var startY = frame.bottom - drawn.top;
    var endY = frame.top - drawn.bottom;
    var distance = startY - endY;
    var speed = creditsLiveSpeed();
    var duration = distance / (90 * frame.height / ${frameHeight} * speed);
    var position = { y: startY };
    var paint = function () {
      travel.setAttribute('transform', 'translate(' + (inverse.c * position.y) + ' ' + (inverse.d * position.y) + ')');
    };
    paint();
    travel.setAttribute('data-noacg-rolling', '');
    noacgCreditsBuiltAt = speed;
    noacgCreditsLast = {
      startY: startY, endY: endY, distance: distance, duration: duration,
      boxed: false, artwork: true, whole: true,
      parentMatrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
    };
    noacgCreditsTween = gsap.to(position, { y: endY, duration: duration, ease: 'none', onUpdate: paint });
  };
  // The In's actual GSAP playheads are authoritative: on the wrapper's ancestors (the box) and on
  // every wrapped element (a staggered In moves the layers one by one). Listed once per take.
  var targets = null;
  var afterEntrance = function () {
    if (generation !== noacgCreditsGeneration) return;
    if (!targets) {
      var artwork = creditsArtwork();
      if (!artwork) return;
      targets = [];
      for (var node = artwork.travel; node; node = node.parentElement) targets.push(node);
      var inner = artwork.travel.querySelectorAll('*');
      for (var k = 0; k < inner.length; k++) targets.push(inner[k]);
    }
    var tweens = gsap.getTweensOf(targets, true);
    for (var i = 0; i < tweens.length; i++) {
      var span = tweens[i].totalDuration();
      if (span > 0 && span < 1e9) { requestAnimationFrame(afterEntrance); return; }
    }
    // Let the final frame of the In paint before measuring, as the text roll does.
    requestAnimationFrame(function () {
      if (generation !== noacgCreditsGeneration) return;
      noacgCreditsStart = null;
      ready.then(measure);
    });
  };
  var begin = function () {
    requestAnimationFrame(afterEntrance);
  };
  var entrance = typeof NOACG_ANIM !== 'undefined' && NOACG_ANIM.steps && NOACG_ANIM.steps[0];
  var pace = typeof motionSpeed === 'function' ? motionSpeed() : 1;
  noacgCreditsStart = gsap.delayedCall(entrance ? entrance.duration / pace : 0, begin);
}

// Only pace is editable. A picture the operator replaces moves with the rest (R6).
function creditsDataUpdated() {
  if (noacgCreditsTween) noacgCreditsTween.timeScale(creditsLiveSpeed() / noacgCreditsBuiltAt);
}

// The fit ladder measures the artwork at rest, never where the roll has moved it (R11). Both doors
// are wrapped: refitSvgText re-measures (and reaches fitSvgText already at rest), while a data
// write calls fitSvgText alone.
function creditsFitAtRest(fit) {
  return function () {
    var artwork = creditsArtwork();
    var pose = artwork && artwork.travel.getAttribute('transform');
    if (pose) artwork.travel.removeAttribute('transform');
    try { return fit.apply(this, arguments); } finally { if (pose) artwork.travel.setAttribute('transform', pose); }
  };
}
if (typeof refitSvgText === 'function') refitSvgText = creditsFitAtRest(refitSvgText);
// A snap (recovery, the editor's park, a reset) shows the artwork at its drawn pose (R13): the roll
// is a plain object tween and a delayed call, which the snap's own killTweensOf cannot reach, and
// its pose and hiding live in attributes no style reset clears. Rested first, so a snap into an
// on-air state may start a roll of its own.
if (typeof noacgSnap === 'function') {
  var noacgCreditsWholeSnapOf = noacgSnap;
  noacgSnap = function (assignments, opts) {
    var artwork = stopCreditsRoll();
    if (artwork) {
      artwork.travel.removeAttribute('transform');
      artwork.travel.removeAttribute('data-noacg-stopped');
    }
    return noacgCreditsWholeSnapOf(assignments, opts);
  };
}
if (typeof fitSvgText === 'function') fitSvgText = creditsFitAtRest(fitSvgText);

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', creditsArtwork);
else creditsArtwork();
`;
}
