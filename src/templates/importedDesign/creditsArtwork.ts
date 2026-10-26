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

export function creditsArtworkRuntimeJs(prefix: string, frameHeight: number): string {
  return `
// Original SVG credits: one complete roll per play, preserving the text as drawn.
var noacgCreditsTween = null;
var noacgCreditsStart = null;
var noacgCreditsLast = null;
var noacgCreditsGeneration = 0;
var noacgCreditsBuiltAt = 1;

function creditsArtwork() {
  var text = document.querySelector('.${creditsClass(prefix)}');
  if (!text || !text.parentNode) return null;
  var travel = text.parentNode;
  if (!travel.classList.contains('${prefix}-credits-travel')) {
    travel = document.createElementNS(text.namespaceURI, 'g');
    travel.setAttribute('class', '${prefix}-credits-travel');
    text.parentNode.insertBefore(travel, text);
    travel.appendChild(text);
  }
  return { text: text, travel: travel };
}

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
  if (artwork) {
    artwork.travel.removeAttribute('data-noacg-rolling');
    artwork.travel.setAttribute('data-noacg-stopped', '');
  }
}

function noacgCreditsRoll() {
  stopCreditsRoll();
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
    var parent = travel.parentNode;
    var matrix = parent.getScreenCTM && parent.getScreenCTM();
    var text = artwork.text.getBoundingClientRect();
    var frame = document.body.getBoundingClientRect();
    if (!matrix || !(text.height > 0) || !(frame.height > 0)) return;
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
    travel.removeAttribute('data-noacg-stopped');
    travel.setAttribute('data-noacg-rolling', '');
    noacgCreditsBuiltAt = speed;
    noacgCreditsLast = {
      startY: startY, endY: endY, distance: distance, duration: duration,
      boxed: false, artwork: true,
      parentMatrix: [matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f]
    };
    noacgCreditsTween = gsap.to(position, { y: endY, duration: duration, ease: 'none', onUpdate: paint });
  };
  var afterPaint = function () {
    if (generation !== noacgCreditsGeneration) return;
    // The root and its box can both have entrance tracks. Their actual GSAP playheads are
    // authoritative: a duration-based timer may land between their last render ticks.
    var text = document.querySelector('.${creditsClass(prefix)}');
    for (var node = text; node; node = node.parentElement) {
      var tweens = gsap.getTweensOf(node, true);
      for (var i = 0; i < tweens.length; i++) {
        var span = tweens[i].totalDuration();
        if (span > 0 && span < 1e9) { requestAnimationFrame(afterPaint); return; }
      }
    }
    noacgCreditsStart = null;
    ready.then(measure);
  };
  var begin = function () {
    requestAnimationFrame(afterPaint);
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
