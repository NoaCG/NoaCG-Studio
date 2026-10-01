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
// A flip story kept on screen after an edit until its turn ends (see tickerFlipHandover).
var tickerLeftover = null;

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
  tickerTakeStart();
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
  // What tickerItemsChanged() reads when the items change with the strip running.
  travel.noacgTicker = { kind: 'marquee', track: track, width: oneSetWidth, pixelsPerSecond: pixelsPerSecond };
  tickerMotionBuiltAt = speed;
  return travel;
}

// tickerFlipCycle(): items take turns — flip up in, hold long enough to read, flip out.
// One segment PER ITEM, so the sequence's length is the operator's line count: a content-
// driven shape, which is the other thing keyframes can't express.
function tickerFlipCycle(target) {
  var track = document.querySelector(target);
  if (!track) return null;
  tickerTakeStart();
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
  // before an edit still has on screen before the cycle starts: none, when a take built it.
  cycle.noacgTicker = { kind: 'flip', track: track, cycle: cycle, items: items, order: order, lead: 0 };
  tickerMotionBuiltAt = speed;
  return cycle;
}

// tickerItemsChanged(): new ITEMS reach a strip that is already running.
//
// update() calls this when it has just re-rendered the track. Both builders measured at play(),
// so without it the running motion kept working on what it measured then. A flip cycle went on
// fading the old item nodes, which were gone, and the strip was blank until the next take
// (measured on tk03 in Chromium: 1 item visible before an update, 0 in every sample for 20 s
// after it). A marquee went on sliding the OLD set width, so with a list of another length its
// loop point no longer landed on the second copy and the strip jumped once a loop (888 px on
// tk01).
//
// So the running motion is swapped for a HANDOVER built on the new items, from where the strip
// is. It goes into the same parent at the parent's current time, so nothing before it moves, and
// it becomes the live motion, so a speed press or a second edit reaches it the same way. An edit
// during the entrance, before the motion has begun, rebuilds it where it was going to start. An
// emptied list leaves an empty handover in place, so the stories typed next still reach it.
function tickerItemsChanged() {
  var live = tickerMotionLive;
  if (!live || !tickerOnAir(live)) return;      // nothing on air: the next take builds fresh
  var parent = live.parent, begun = parent.time() >= live.startTime();
  var at = begun ? parent.time() : live.startTime();
  if (live.noacgTicker.kind === 'flip') tickerFlipHandover(live, parent, at, begun);
  else tickerMarqueeHandover(live, parent, at, begun);
}

// On air means still reachable from GSAP's root. Another entrance path (the simulator, a snap,
// a render) can kill the step this motion sits in, and an edit must not build on that.
function tickerOnAir(motion) {
  while (motion.parent) motion = motion.parent;
  return motion === gsap.globalTimeline;
}

// The handover takes the old motion's place: the same parent, the live handle, today's pace.
// With no items left it still has to run forever, as the loop it replaces did: a step whose
// children all end completes, GSAP's root lets it go, and the stories typed next reach nothing.
function tickerHandoverPlace(parent, handover, at, loop) {
  if (!loop) {
    handover.to({}, { duration: 1, repeat: -1 }, handover.duration());
    tickerMotionBuiltAt = tickerMotionSpeed();  // a loop sets this itself when it is built
  }
  parent.add(handover, at);
  tickerMotionLive = handover;
}

// A marquee keeps its PICTURE: the offset into one set of the old items is where the same
// stories stand in the new track, since an edit rarely moves the ones already passing. It
// travels to the end of the new set and the endless loop starts there, a whole new set wide,
// so the loop point lands on the second copy again.
function tickerMarqueeHandover(live, parent, at, begun) {
  var info = live.noacgTicker, track = info.track;
  var into = begun && info.width ? (((-gsap.getProperty(track, 'x')) % info.width) + info.width) % info.width : 0;
  live.kill();
  var oneSetWidth = track.scrollWidth / 2;
  var handover = gsap.timeline(), loop = null;
  if (oneSetWidth > 0) {
    into = into % oneSetWidth;                  // a shorter list can end before the picture
    loop = tickerMarqueeLoop(track, oneSetWidth);
    handover.fromTo(track, { x: -into }, {
      x: -oneSetWidth, duration: (oneSetWidth - into) / loop.noacgTicker.pixelsPerSecond, ease: 'none',
    });
    handover.add(loop);
  } else {
    gsap.set(track, { x: 0 });                  // every item removed
  }
  handover.noacgTicker = loop ? loop.noacgTicker : { kind: 'marquee', track: track, width: 0 };
  tickerHandoverPlace(parent, handover, at, loop);
}

// A flip lets the story on screen FINISH: it stays for the rest of its hold and flips out on
// time, and the new list starts at that boundary (tickerFlipNext says with which story).
function tickerFlipHandover(live, parent, at, begun) {
  var info = live.noacgTicker, track = info.track;
  var showing = begun ? tickerFlipShowing(live) : null;
  var items = Array.prototype.slice.call(track.querySelectorAll('.ticker-item'));
  var handover = gsap.timeline(), lead = 0, loop = null;
  if (showing) {
    // The rest of its turn is played off the motion that was running it, so it eases out exactly
    // as it was going to, at the pace it was running. That is the old cycle, or, when the story
    // was already finishing after an earlier edit, the same cycle that edit kept: handovers do
    // not nest, however fast the edits come.
    var source = showing.source;
    if (source === live) { live.pause(); parent.remove(live); } else live.kill();
    var rest = source.tweenFromTo(showing.from, showing.to, { duration: showing.left });
    handover.add(rest, 0);
    lead = showing.left;
    var item = showing.item;
    track.insertBefore(item, track.firstChild);   // the story on screen stays until its turn ends
    tickerLeftover = item;
    handover.call(function () {
      if (item.parentNode) item.parentNode.removeChild(item);
      if (tickerLeftover === item) tickerLeftover = null;
      handover.noacgTicker.leadItem = null;
      rest.kill(); source.kill();               // let the old motion and its story go
      rest = source = item = null;
    }, null, lead);
  } else {
    live.kill();
  }
  if (items.length) {
    gsap.set(items, { opacity: 0 });            // the new items wait for their turn
    loop = tickerFlipLoop(track, items, tickerFlipNext(showing, items, info.items));
    handover.add(loop, lead);
  }
  handover.noacgTicker = {
    kind: 'flip', track: track, cycle: loop, items: items, order: loop ? loop.noacgTicker.order : [],
    lead: lead, leadItem: showing && showing.item, leadPosition: showing && showing.position,
    restOf: showing && showing.source, restTo: showing && showing.to,
  };
  tickerHandoverPlace(parent, handover, at, loop);
}

// The story on a flip's screen now and where it sits in its list, with the rest of its turn:
// the motion that runs it, the span of that motion left, and how long that takes on air. Null
// when nothing is showing (the list was emptied).
function tickerFlipShowing(live) {
  var info = live.noacgTicker, now = live.time();
  if (now < info.lead) {                        // still finishing a story from an earlier edit
    return { item: info.leadItem, position: info.leadPosition, source: info.restOf,
      from: info.restOf.time(), to: info.restTo, left: (info.lead - now) / live.timeScale() };
  }
  if (!info.cycle) return null;
  var turn = info.cycle.duration() / info.order.length, into = info.cycle.time();
  var k = Math.min(info.order.length - 1, Math.floor(into / turn));
  var ends = now + (k + 1) * turn - into;
  return { item: info.items[info.order[k]], position: info.order[k], source: live,
    from: now, to: ends, left: (ends - now) / live.timeScale() };
}

// Which story of the new list comes next: the one after the story on screen, found by its text
// (the copy nearest its old place, if it appears twice), so a story added above it does not
// make the strip repeat itself. Not found, it was edited in place and the one after its old
// place comes next - unless no story of the old list is left, and a new list starts at its top.
function tickerFlipNext(showing, items, before) {
  if (!showing) return 0;
  var texts = items.map(function (item) { return item.textContent; });
  var found = -1;
  for (var i = 0; i < texts.length; i++) {
    if (texts[i] !== showing.item.textContent) continue;
    if (found < 0 || Math.abs(i - showing.position) < Math.abs(found - showing.position)) found = i;
  }
  if (found >= 0) return (found + 1) % items.length;
  var kept = before.some(function (item) { return texts.indexOf(item.textContent) >= 0; });
  return kept ? (showing.position + 1) % items.length : 0;
}

// tickerTakeStart(): a take starts from clean items. A story an edit was still finishing when
// the strip was stopped goes (play() re-renders the track anyway; an entrance that skips play()
// does not), and the handle lets go of the last take's motion.
function tickerTakeStart() {
  if (tickerLeftover && tickerLeftover.parentNode) tickerLeftover.parentNode.removeChild(tickerLeftover);
  tickerLeftover = null;
  tickerMotionLive = null;
}

// tickerMotionEnd(): stop the running motion. A strip taken off air has nothing left for an
// edit to reach. A story still finishing its turn stays where it is, for the strip's fade.
function tickerMotionEnd() {
  if (tickerMotionLive) tickerMotionLive.kill();
  tickerMotionLive = null;
}`;
}
