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
