// The competition pack's MEASURED motion — the magnitudes a keyframe cannot hold.
//
// A results board cascades one row per team the operator typed; a comparison grows each bar to
// its own figure; a bracket walks one column per round. None of those counts exist until the
// data is in the DOM (docs/DYNAMIC_MOTION_SCOPE.md), so each is a named BUILDER: a plain
// function that measures the DOM and returns a GSAP object. The animation data only names it
// (`"dynamics": [{ "build": "compCascade", … }]`) and the interpreter adds what it returns.
//
// These ship OUTSIDE the marked ANIMATION region — design-owned runtime, like the countdown
// clock — so the timeline never rewrites them and they survive every export untouched. Every
// builder ships in every competition template: the data names the live one, so swapping the
// motion preset is a pure data edit.

import { motionSpeedJs } from '../shared/base';

/** The competition motion builders, emitted before the marked region in every design. */
export const COMP_MOTION_JS = `// ---- Measured motion (the animation data references these by name) ----
${motionSpeedJs}

// compChildren(): the direct children of a measured container, as a real array. The row count
// is the operator's data (five teams today, eight tomorrow), which is exactly why the stagger
// below cannot be written as keyframes.
function compChildren(target) {
  var host = document.querySelector(target);
  if (!host) return [];
  return Array.prototype.slice.call(host.children);
}

// compCascade(): the board's rows arrive one after another. Each row rises into place with a
// small overlap, so a three-row lineup and a twelve-row table both read as one movement
// instead of a list that takes twelve times as long: the per-row gap shrinks as rows are
// added, and the whole cascade is capped at ~1.1s.
//
// Each row lands on the opacity its design's CSS gives it (a map still to play rests dimmed) and
// is then handed back to the stylesheet: an inline opacity would outrank the rule that dims the
// rows out of focus when a row is spotlit later (#2272).
function compCascade(target, opts) {
  var rows = compChildren(target);
  var speed = motionSpeed();
  var tl = gsap.timeline();
  if (rows.length === 0) return tl;               // nothing typed yet — a valid, empty cascade
  var gap = Math.min(0.09, 1.1 / rows.length);    // tighten the stagger as the board grows
  var rest = rows.map(function (row) {
    row.style.removeProperty('opacity');          // a replay may interrupt the last cascade
    return parseFloat(getComputedStyle(row).opacity);
  });
  tl.fromTo(rows,
    { y: 26, opacity: 0 },
    {
      y: 0,
      opacity: function (i) { return rest[i]; },
      duration: 0.42 / speed,
      ease: (opts && opts.ease) || 'power3.out',
      stagger: gap / speed,
      clearProps: 'opacity'
    },
    0
  );
  // A row may carry its own measured bar (a comparison, a standings share). Grow those once
  // their row has landed — composing builders, the igMotion count-up precedent.
  tl.add(compBarsGrow(target, opts), Math.min(0.35, gap * rows.length) / speed);
  return tl;
}

// compBarsGrow(): every [data-value] fill inside the container grows from nothing to its own
// percentage. The percentage is the operator's number, written onto the element by the design's
// rebuild — so it is read here, at play time, and never baked into a keyframe.
function compBarsGrow(target, opts) {
  var speed = motionSpeed();
  var tl = gsap.timeline();
  var host = document.querySelector(target);
  if (!host) return tl;
  var fills = Array.prototype.slice.call(host.querySelectorAll('[data-value]'));
  if (fills.length === 0) return tl;              // a board without bars — an empty timeline
  fills.forEach(function (fill, i) {
    var pct = parseFloat(fill.getAttribute('data-value'));
    if (isNaN(pct)) return;
    tl.fromTo(fill,
      { width: '0%' },
      {
        width: pct + '%',
        duration: 0.6 / speed,
        ease: (opts && opts.ease) || 'power2.out'
      },
      (i * 0.05) / speed
    );
  });
  return tl;
}`;
