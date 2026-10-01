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
// scaling the running tween changes the pace from this frame on, from where the strip is.
// The ratio is against the speed the tween was BUILT at, so repeated changes compose correctly
// rather than each one measuring from the design's own rate.
//
// The builder's tween sits INSIDE the step's timeline, which has no smoothChildTiming, and
// without it GSAP jumps the child to where the new pace would have had it (287px on tk01 at
// 300%). The flag is lent for the one call - but only to a PLAYING parent: on a paused one (a
// settled preview, an editor scrub) GSAP answers a slow-down by moving the parent's start to
// -Infinity, so a paused strip takes the plain timeScale and the next seek shows it. The
// credit rolls do the same in creditsApplySpeed().
function tickerApplySpeed() {
  var live = tickerMotionLive;
  if (!live || !tickerMotionBuiltAt) return;
  var scale = tickerMotionSpeed() / tickerMotionBuiltAt;
  var parent = live.parent;
  if (!parent || parent.paused()) { live.timeScale(scale); return; }
  var smooth = parent.smoothChildTiming;
  parent.smoothChildTiming = true;
  live.timeScale(scale);
  parent.smoothChildTiming = smooth;
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
  if (oneSetWidth <= 0) return null;            // nothing to scroll yet
  tickerMotionLive = tickerMarqueeLoop(track, oneSetWidth);
  return tickerMotionLive;
}

// tickerMarqueeLoop(): one set width of travel, repeated forever.
function tickerMarqueeLoop(track, oneSetWidth) {
  // Travel speed. Edit the 140 to change what this design ships at; the operator's percentage
  // multiplies it, and a later change to that percentage reaches this tween through
  // tickerApplySpeed() rather than waiting for the next take.
  var speed = tickerMotionSpeed();
  var pixelsPerSecond = 140 * speed;
  var travel = gsap.fromTo(track,
    { x: 0 },
    {
      x: -oneSetWidth,                          // one full set = a perfect loop point
      duration: oneSetWidth / pixelsPerSecond,
      ease: 'none',                             // constant speed — never eased
      repeat: -1,                               // loop until stop()
    }
  );
  travel.noacgMarquee = { track: track, width: oneSetWidth, pixelsPerSecond: pixelsPerSecond };
  tickerMotionBuiltAt = speed;
  return travel;
}

// tickerFlipCycle(): items take turns — flip up in, hold long enough to read, flip out.
// One segment PER ITEM, so the sequence's length is the operator's line count: a content-
// driven shape, which is the other thing keyframes can't express.
function tickerFlipCycle(target) {
  var track = document.querySelector(target);
  if (!track) return null;
  var items = Array.prototype.slice.call(track.querySelectorAll('.ticker-item'));
  if (!items.length) return null;
  tickerMotionLive = tickerFlipLoop(track, items, 0);
  return tickerMotionLive;
}

// tickerFlipLoop(): the endless rotation, starting at item number \`first\` of the list.
function tickerFlipLoop(track, items, first) {
  // The hold IS this design's speed: nothing travels, so what an operator turns up is how
  // long each item stays. The flips either side of it scale with it, exactly as the credits'
  // paged preset does, so a faster strip is faster all through rather than snappy and patient.
  var speed = tickerMotionSpeed();
  var holdSeconds = 3.2 / speed;                // reading time per item
  var order = [];                               // list positions, in the order they show
  for (var k = 0; k < items.length; k++) order.push((first + k) % items.length);

  var cycle = gsap.timeline({ repeat: -1 });    // the endless item rotation
  cycle.set(items, { opacity: 0 }, 0);          // all items start hidden
  order.forEach(function (index) {
    var item = items[index];
    cycle.fromTo(item, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 / speed, ease: 'power3.out' });
    cycle.to(item, { y: -18, opacity: 0, duration: 0.35 / speed, ease: 'power2.in' }, '+=' + holdSeconds);
  });
  // What tickerItemsChanged() reads to find the item on screen. \`lead\` is how long a story from
  // before an edit still has on screen before this cycle starts: none, when play() built it.
  cycle.noacgFlip = { track: track, cycle: cycle, items: items, order: order, lead: 0 };
  tickerMotionBuiltAt = speed;
  return cycle;
}

// tickerItemsChanged(): new ITEMS reach a strip that is already running.
//
// update() calls this when it has just re-rendered the track. Both builders measured at play(),
// so without it the running motion kept working on what it measured then. A flip cycle went on
// fading the old item nodes, which were gone, and the strip was blank until the next take
// (measured on tk03 in Chromium: 1 item visible before an update, 0 in every sample for 4 s
// after it). A marquee went on sliding the OLD set width, so with a list of another length its
// loop point no longer landed on the second copy and the strip jumped once a loop.
//
// So the running motion is swapped for a handover built on the new items, from where the strip
// is. It goes into the same parent at the parent's current time, so nothing before it moves, and
// it becomes the live motion, so a speed press or a second edit reaches it the same way.
function tickerItemsChanged() {
  var live = tickerMotionLive;
  if (!live || !live.parent) return;            // nothing on air: the next take builds fresh
  if (live.noacgFlip) tickerFlipHandover(live);
  else if (live.noacgMarquee) tickerMarqueeHandover(live);
}

// A marquee keeps its PICTURE: the offset into one set of the old items is where the same
// stories stand in the new track, since an edit rarely moves the ones already passing. It
// travels to the end of the new set and the endless loop starts there, a whole new set wide,
// so the loop point lands on the second copy again.
function tickerMarqueeHandover(live) {
  var info = live.noacgMarquee, track = info.track, parent = live.parent;
  var into = (((-gsap.getProperty(track, 'x')) % info.width) + info.width) % info.width;
  var oneSetWidth = track.scrollWidth / 2;
  tickerMotionEnd();
  if (oneSetWidth <= 0) { gsap.set(track, { x: 0 }); return; }   // every item removed
  into = into % oneSetWidth;                    // a shorter list can end before the picture
  var loop = tickerMarqueeLoop(track, oneSetWidth);
  var handover = gsap.timeline();
  handover.fromTo(track, { x: -into }, {
    x: -oneSetWidth, duration: (oneSetWidth - into) / loop.noacgMarquee.pixelsPerSecond, ease: 'none',
  });
  handover.add(loop);
  handover.noacgMarquee = loop.noacgMarquee;
  parent.add(handover, parent.time());
  tickerMotionLive = handover;
}

// A flip lets the story on screen FINISH: it stays for the rest of its hold and flips out on
// time, and the new list starts at that boundary with the story after the one that was showing.
// That one is found by its text, so a story added above it does not make the strip repeat
// itself; an item edited in place is not found, and the one after its old place comes next.
function tickerFlipHandover(live) {
  var flip = live.noacgFlip, track = flip.track, parent = live.parent;
  var now = live.time(), showing, position, endsAt;
  if (now < flip.lead) {                        // still finishing a story from an earlier edit
    showing = flip.leadItem; position = flip.leadPosition; endsAt = flip.lead;
  } else {
    var turn = flip.cycle.duration() / flip.order.length;
    var into = flip.cycle.time();
    var k = Math.min(flip.order.length - 1, Math.floor(into / turn));
    position = flip.order[k]; showing = flip.items[position];
    endsAt = now + (k + 1) * turn - into;
  }
  var items = Array.prototype.slice.call(track.querySelectorAll('.ticker-item'));
  live.pause();
  parent.remove(live);
  tickerMotionLive = null;
  if (!items.length) { live.kill(); return; }   // every item removed: the strip empties
  var next = position + 1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].textContent === showing.textContent) { next = i + 1; break; }
  }
  gsap.set(items, { opacity: 0 });              // the new items wait for their turn
  track.insertBefore(showing, track.firstChild);   // the story on screen stays until its turn ends
  var handover = gsap.timeline();
  // The rest of its turn is played off the old cycle itself, so it eases out exactly as it was
  // going to, at the pace it was running.
  handover.add(live.tweenFromTo(now, endsAt), 0);
  var lead = handover.duration();
  handover.call(function () { if (showing.parentNode) showing.parentNode.removeChild(showing); }, null, lead);
  var cycle = tickerFlipLoop(track, items, next % items.length);
  handover.add(cycle, lead);
  handover.noacgFlip = {
    track: track, cycle: cycle, items: items, order: cycle.noacgFlip.order,
    lead: lead, leadItem: showing, leadPosition: position,
  };
  parent.add(handover, parent.time());
  tickerMotionLive = handover;
}

// tickerMotionEnd(): drop the running motion. A take builds its own, and a strip taken off air
// has nothing left for an edit to reach.
function tickerMotionEnd() {
  if (tickerMotionLive) tickerMotionLive.kill();
  tickerMotionLive = null;
}`;
}
