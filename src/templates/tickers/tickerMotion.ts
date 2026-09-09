// The ticker's MEASURED motion — the travel a keyframe cannot describe.
//
// A marquee slides exactly one set-width; an item flip runs one segment per item. Both
// magnitudes come from the operator's text, which changes on air — so no static keyframe
// number can hold them (docs/DYNAMIC_MOTION_SCOPE.md). Instead each one is a named BUILDER:
// a plain function that measures the DOM and returns a GSAP object. The animation data just
// references it by name (`"dynamics": [{ "build": "tickerMarquee", … }]`) and the
// interpreter adds what it returns.
//
// These ship OUTSIDE the marked ANIMATION region — design-owned runtime, like the countdown
// clock engine — so the timeline never rewrites them and you can edit the travel speed here.
// Both builders ship in every ticker: the data names the live one, and swapping the motion
// preset just swaps that name.
//
// THE PACE HAS TWO OWNERS, and they are different knobs (owner walk 2026-08-28: "anything with
// scrolling graphics should have a speed setting in the control panel"). motionSpeed() is the
// AUTHOR's: it comes from the NOACG_ANIM data block, the Animation panel moves it, and it is
// baked into the template when the graphic is made. An operator sitting at a control page
// cannot reach it — and a strip's readable speed depends on the room, the rundown and whatever
// else is on air, so it is decided there. tickerSpeed() below is the operator's half, read
// from a field on the control page, and the two multiply.

import { motionSpeedJs } from '../shared/base';

/**
 * The ticker motion builders, emitted before the marked region in every ticker template.
 *
 * `speedFieldId` is the id of the operator's speed field (`f2`, or `f3` on a design that takes
 * a second cap). It is `null` for a design whose pace this code does not set: the timed
 * rotator, whose cadence is a machine timer rather than motion authored here. Such a design is
 * given no speed field at all, because an operator control page must never offer a field the
 * graphic cannot honour.
 */
export function tickerMotionJs(speedFieldId: string | null): string {
  return `// ---- Measured motion (the animation data references these by name) ----
${motionSpeedJs}

${speedFieldId
      ? `// tickerSpeed(): the OPERATOR's speed, read from the "${speedFieldId}" field on the control
// page. It is a PERCENTAGE of the pace this design ships at, so 100 is exactly the authored
// speed, 150 is half again as fast and 60 is a slow, readable crawl. Input only: the value
// lives in a hidden holder and is never drawn.
//
// Blank, non-numeric and zero all mean "as designed" rather than "stop": a strip frozen
// mid-word because someone typed 0 is a graphic stuck on air, and the clamp below is what
// keeps that from being one keystroke away.
function tickerSpeed() {
  var el = document.getElementById('${speedFieldId}');
  var percent = el ? parseFloat(el.textContent) : NaN;
  if (!isFinite(percent) || percent <= 0) return 1;      // blank or nonsense: the design's own speed
  return Math.min(400, Math.max(10, percent)) / 100;     // 10%–400%, so the strip always moves
}`
      : `// This design's cadence is its state machine's timer, not motion measured here, so it
// ships no speed field: there is nothing on this page for an operator percentage to scale,
// and a control page must never offer a field the graphic cannot honour. The builders below
// still read this, so it answers for the design.
function tickerSpeed() {
  return 1;
}`}

// The live pace: the design's authored speed multiplied by the operator's percentage. Both
// builders read this one function, so the two knobs can never disagree.
function tickerMotionSpeed() {
  return motionSpeed() * tickerSpeed();
}

// The running travel or cycle, and the speed it was built at. Both builders below set them, so
// tickerApplySpeed() can reach whichever one is live.
var tickerMotionLive = null;
var tickerMotionBuiltAt = 1;

${speedFieldId
      ? `// tickerApplySpeed(): make a speed change land on a strip that is ALREADY RUNNING.
//
// Both builders below measure once, at play(), because that is when the operator's text has a
// width. So a new speed arriving through update() would otherwise sit in the holder and change
// nothing until the next take, and the surfaces an operator actually uses promise better than
// that. The production dashboard's "± LIVE NUMBERS act on air" row picks up every number field
// a graphic has, this one included, and says one press changes the figure on the live graphic.
//
// A timeScale is what makes that true without a seam. Restarting the tween would honour the
// number and snap a half-scrolled strip back to its start, which is worse than ignoring it;
// scaling the running tween changes the pace from this frame on and never moves the strip.
// The ratio is against the speed the tween was BUILT at, so repeated changes compose correctly
// rather than each one measuring from the design's own rate.
function tickerApplySpeed() {
  if (!tickerMotionLive || !tickerMotionBuiltAt) return;
  tickerMotionLive.timeScale(tickerMotionSpeed() / tickerMotionBuiltAt);
}`
      : `// This design has no speed field (see tickerSpeed above), so there is nothing for an
// update() to change about its pace. update() calls this either way, so it exists and does
// nothing rather than being guarded at every call site.
function tickerApplySpeed() {}`}

// tickerShowNext(): the ROTATOR's beat — put the next item in the track, on its own.
//
// This is deliberately NOT measured motion. A marquee's travel has to be measured because its
// distance depends on the text; showing one item at a time does not — the movement is a fixed
// slide the timeline keyframes, and all this does is swap what the slot contains. That matters
// beyond tidiness: a state whose timeline never ends can never arm a timer (a call scheduled
// at the timeline's end never fires), so a machine-driven cycle cannot use endless motion.
// Advancing the index in a plain call, which adds no duration at all, is what lets the beat be
// a real timer transition.
var tickerIndex = 0;              // which item is showing (runtime data, never a state)

// The SAME parse the marquee runs (parseTickerItems, in the shared runtime above), so a
// kicker means the same thing whichever motion preset the design ships with. Reading the raw
// lines here instead is what would make "SPORT:" a story of its own in a rotating strip.
function tickerItems() {
  var source = document.getElementById('f0');
  if (!source) return [];
  return parseTickerItems(source.textContent);
}

function tickerShowNext() {
  tickerIndex = tickerIndex + 1;
  tickerShowCurrent();
}

// tickerShowCurrent(): put the CURRENT item in the slot without advancing — what a data
// update needs, so re-typing the items does not skip one.
function tickerShowCurrent() {
  var items = tickerItems();
  var track = document.getElementById('ticker-track');
  if (!track || items.length === 0) return;
  // tickerItemHtml() for the same reason rebuildTicker() uses it: it is where the item's two
  // halves are escaped, and where a design's own kicker markup is offered the chance to run.
  track.innerHTML = tickerItemHtml(items[tickerIndex % items.length]);
}

// tickerMarquee(): the classic endless travel. The track holds the items TWICE, so sliding
// exactly one set width and repeating reads as seamless — and the width is measured here,
// at play() time, because it depends on how much text the operator typed.
function tickerMarquee(target) {
  var track = document.querySelector(target);
  if (!track) return null;
  var oneSetWidth = track.scrollWidth / 2;        // the items are rendered twice
  // Travel speed. Edit the 140 to change what this design ships at; the operator's percentage
  // multiplies it, and a later change to that percentage reaches this tween through
  // tickerApplySpeed() rather than waiting for the next take.
  var speed = tickerMotionSpeed();
  var pixelsPerSecond = 140 * speed;
  if (oneSetWidth <= 0) return null;            // nothing to scroll yet

  var travel = gsap.fromTo(track,
    { x: 0 },
    {
      x: -oneSetWidth,                          // one full set = a perfect loop point
      duration: oneSetWidth / pixelsPerSecond,
      ease: 'none',                             // constant speed — never eased
      repeat: -1,                               // loop until stop()
    }
  );
  tickerMotionBuiltAt = speed;
  tickerMotionLive = travel;
  return travel;
}

// tickerFlipCycle(): items take turns — flip up in, hold long enough to read, flip out.
// One segment PER ITEM, so the sequence's length is the operator's line count: a content-
// driven shape, which is the other thing keyframes can't express.
function tickerFlipCycle(target) {
  var track = document.querySelector(target);
  if (!track) return null;
  var items = track.querySelectorAll('.ticker-item');
  if (!items.length) return null;
  // The hold IS this design's speed: nothing travels, so what an operator turns up is how
  // long each item stays. The flips either side of it scale with it, exactly as the credits'
  // paged preset does, so a faster strip is faster all through rather than snappy and patient.
  var speed = tickerMotionSpeed();
  var holdSeconds = 3.2 / speed;                // reading time per item

  var cycle = gsap.timeline({ repeat: -1 });    // the endless item rotation
  cycle.set(items, { opacity: 0 }, 0);          // all items start hidden
  items.forEach(function (item) {
    cycle.fromTo(item, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 / speed, ease: 'power3.out' });
    cycle.to(item, { y: -18, opacity: 0, duration: 0.35 / speed, ease: 'power2.in' }, '+=' + holdSeconds);
  });
  tickerMotionBuiltAt = speed;
  tickerMotionLive = cycle;
  return cycle;
}`;
}
