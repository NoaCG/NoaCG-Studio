// The credits' MEASURED motion — the travel a keyframe cannot describe.
//
// A roll travels the height of its own content and runs it all the way off the top; a crawl
// travels its own width; a page swap runs one segment per page and holds each one long
// enough to read. Every one of those magnitudes comes from the operator's text, which
// changes on air — so no static keyframe number can hold them
// (docs/DYNAMIC_MOTION_SCOPE.md). Instead each is a named BUILDER: a plain function that
// measures the DOM and returns a GSAP object. The animation data references it by name
// (`"dynamics": [{ "build": "creditsRoll", … }]`) and the interpreter adds what it returns.
//
// These ship OUTSIDE the marked ANIMATION region — design-owned runtime, like the countdown
// clock engine — so the timeline never rewrites them and you can edit the reading speed
// here. All three ship in every credits template: the data names the live one, and swapping
// the motion preset just swaps that name.
//
// TWO THINGS ARE THE OPERATOR'S, not the author's (owner walk 2026-08-28):
//   - the SPEED, because a roll has to fit a music bed and that is decided at the desk;
//   - the fact that the list RUNS ALL THE WAY THROUGH, because a credit roll that stops with
//     the last names still on screen and the logo held in the middle is not what a credit
//     roll does anywhere else. The closing mark arrives afterwards, as its own beat.

import { motionSpeedJs } from '../shared/base';

/**
 * The credits motion builders, emitted before the marked region in every credits template.
 *
 * `speedFieldId` is the id of the operator's speed field (`f2` or `f3`, depending on whether
 * the design takes a logo). It is `null` for a design with no motion at all: the static board,
 * which is given no speed field because an operator control page must never offer a field the
 * graphic cannot use.
 */
export function creditsMotionJs(speedFieldId: string | null): string {
  return `// ---- Measured motion (the animation data references these by name) ----
${motionSpeedJs}

${speedFieldId
      ? `// creditsSpeed(): the OPERATOR's speed, read from the "${speedFieldId}" field on the control
// page. It is a PERCENTAGE of the reading speed this design ships at, so 100 is exactly the
// authored pace, 150 is half again as fast and 60 is a slow memorial roll. Input only: the
// value lives in a hidden holder and is never drawn.
//
// Blank, non-numeric or zero all mean "as designed" rather than "stop": a roll that never
// finishes because someone typed 0 is a graphic stuck on air, and the clamp below is what
// keeps that from being one keystroke away.
function creditsSpeed() {
  var el = document.getElementById('${speedFieldId}');
  var percent = el ? parseFloat(el.textContent) : NaN;
  if (!isFinite(percent) || percent <= 0) return 1;      // blank or nonsense: the design's own speed
  return Math.min(400, Math.max(10, percent)) / 100;     // 10%–400%, so it always finishes
}`
      : `// This design holds its list still (the static board preset), so it ships no speed
// field: there is nothing to speed up, and an operator control page must never offer a field
// the graphic cannot use. The builders below still read this, so it answers for the design.
function creditsSpeed() {
  return 1;
}`}

// The live pace: the design's authored speed multiplied by the operator's percentage. Every
// builder below reads this one function, so the two knobs can never disagree.
function creditsMotionSpeed() {
  return motionSpeed() * creditsSpeed();
}

// creditsEndBeat(): the closing mark's own beat, appended to a roll or a crawl.
//
// The logo + year block is NOT part of the scroll. The list runs all the way through, the
// last name leaving the frame entirely, and only then does the mark arrive, alone and
// centered in the viewport. That is what a credit roll does everywhere else, and it is why
// the travel above stops where the list ends rather than where the mark sits.
//
// No design has to move its end block for this: the block is measured where it already sits
// at the foot of the track, and the track is simply parked at the offset that puts it in the
// middle of the viewport. Everything that has already scrolled past is faded out first, so
// the names cannot come back with it. play() re-renders the track from scratch, so none of
// these inline values survive into the next take.
function creditsEndBeat(seq, track, box, endBlock, axis) {
  var pages = track.querySelectorAll('.credits-page');
  var trackRect = track.getBoundingClientRect();
  var endRect = endBlock.getBoundingClientRect();
  // Rect differences, not offsetTop: #credits-track is not a positioned element in every
  // design, so offsetParent is not reliably the track. Both rects carry the same travel
  // transform, so subtracting them cancels it.
  var park = axis === 'x'
    ? -((endRect.left - trackRect.left) + endRect.width / 2 - box.clientWidth / 2)
    : -((endRect.top - trackRect.top) + endRect.height / 2 - box.clientHeight / 2);

  if (pages.length) seq.set(pages, { opacity: 0 });      // the list has gone; it never returns
  seq.set(track, axis === 'x' ? { x: park } : { y: park });
  seq.fromTo(endBlock,
    { opacity: 0 },
    { opacity: 1, duration: 0.8 / creditsMotionSpeed(), ease: 'power2.out' }  // a plain arrival
  );
}

// creditsRoll(): the classic upward roll. Starts just below the viewport and travels until
// the last name has left the top. Both are measured here, at play() time, because they depend
// on how many names the operator listed. When the design carries a closing mark (a logo, a
// year, an end text), it arrives afterwards as its own beat; see creditsEndBeat().
function creditsRoll(target) {
  var track = document.querySelector(target);
  var box = document.querySelector('.credits-box');
  if (!track || !box) return null;
  var endBlock = track.querySelector('.credits-end');
  var hasEndBeat = !!endBlock && endBlock.getBoundingClientRect().height > 0;

  // How far the LIST reaches: to the closing mark when there is one (the mark is not part of
  // the roll), otherwise the whole track. Travel that far and the last row is off the top.
  var listHeight = hasEndBeat
    ? endBlock.getBoundingClientRect().top - track.getBoundingClientRect().top
    : track.scrollHeight;

  var startY = box.clientHeight;                              // enter from below the viewport…
  var endY = -listHeight;                                     // …and run right off the top
  var distance = startY - endY;
  var pixelsPerSecond = 90 * creditsMotionSpeed();            // reading speed — raise for faster credits
  if (distance <= 0) return null;

  var seq = gsap.timeline();
  if (hasEndBeat) seq.set(endBlock, { opacity: 0 }, 0);       // the mark waits its turn
  seq.fromTo(track,
    { y: startY },
    { y: endY, duration: distance / pixelsPerSecond, ease: 'none' },  // constant speed — never eased
    0
  );
  if (hasEndBeat) creditsEndBeat(seq, track, box, endBlock, 'y');
  return seq;
}

// creditsLoop(): the roll that never ends — a repeating production-credits reel for a
// holding screen, a sponsor wall, a donor list that plays all through an event.
//
// A seamless vertical loop needs the content to exist TWICE: travel exactly one copy's
// height and the second copy has arrived precisely where the first began, so the seam is
// not visible and there is no jump to hide. That is why this measures and clones rather
// than just repeating a tween — a bare repeat would snap the list back to the top.
//
// There is no end beat here, and there cannot be: a reel has no end to arrive after. The
// closing mark rides round with the list, which is what a sponsor wall wants anyway.
//
// The clone is rebuilt on every play(): rebuildCredits() replaces the track's children
// first, so there is never a stale or doubled copy to clean up.
function creditsLoop(target) {
  var track = document.querySelector(target);
  var box = document.querySelector('.credits-box');
  if (!track || !box) return null;

  // Wrap the real content in one "run", so a whole run can be cloned as a unit.
  var run = track.querySelector('.credits-loop-run');
  if (!run) {
    run = document.createElement('div');
    run.className = 'credits-loop-run';
    while (track.firstChild) run.appendChild(track.firstChild);
    track.appendChild(run);
  }
  var distance = run.offsetHeight;                  // exactly one run — the loop's travel
  if (distance <= 0) return null;

  // Enough copies that the viewport is always covered: a short list needs more than one.
  var copies = Math.max(1, Math.ceil(box.clientHeight / distance));
  var existing = track.querySelectorAll('.credits-loop-clone');
  for (var i = 0; i < existing.length; i++) track.removeChild(existing[i]);
  for (var c = 0; c < copies; c++) {
    var clone = run.cloneNode(true);
    clone.className = 'credits-loop-clone';
    clone.setAttribute('aria-hidden', 'true');      // a repeat of the same names, not new ones
    track.appendChild(clone);
  }

  var pixelsPerSecond = 90 * creditsMotionSpeed();  // reading speed — raise for a faster reel
  return gsap.fromTo(track,
    { y: 0 },
    { y: -distance, duration: distance / pixelsPerSecond, ease: 'none', repeat: -1 }
  );
}

// creditsCrawl(): a single-line horizontal crawl. Same idea as the roll, along x — the strip
// runs all the way off the left edge, and the closing mark arrives after it on its own.
// Flip the direction by swapping startX/endX.
function creditsCrawl(target) {
  var track = document.querySelector(target);
  var box = document.querySelector('.credits-box');
  if (!track || !box) return null;
  var endBlock = track.querySelector('.credits-end');
  var hasEndBeat = !!endBlock && endBlock.getBoundingClientRect().width > 0;

  // How far the LIST reaches along the line — up to the closing mark, or the whole track.
  var listWidth = hasEndBeat
    ? endBlock.getBoundingClientRect().left - track.getBoundingClientRect().left
    : track.scrollWidth;

  var startX = box.clientWidth;                               // enter from the right edge…
  var endX = -listWidth;                                      // …and run right off the left
  var distance = startX - endX;
  var pixelsPerSecond = 160 * creditsMotionSpeed();           // crawl speed
  if (distance <= 0) return null;

  var seq = gsap.timeline();
  if (hasEndBeat) seq.set(endBlock, { opacity: 0 }, 0);       // the mark waits its turn
  seq.fromTo(track,
    { x: startX },
    { x: endX, duration: distance / pixelsPerSecond, ease: 'none' },  // constant speed — never eased
    0
  );
  if (hasEndBeat) creditsEndBeat(seq, track, box, endBlock, 'x');
  return seq;
}

// creditsPages(): each section appears as a full page, holds, then swaps to the next. One
// segment PER PAGE, and each page's hold is derived from its own row count — a content-
// driven shape, which is the other thing keyframes can't express. The last page (logo +
// year) stays up until stop(). Nothing scrolls, so the operator's speed sets the READING
// TIME here instead of a travel rate: raise it and every page holds for less.
function creditsPages(target) {
  var track = document.querySelector(target);
  if (!track) return null;
  var pages = track.querySelectorAll('.credits-page, .credits-end');
  if (!pages.length) return null;
  var speed = creditsMotionSpeed();

  var seq = gsap.timeline();
  seq.set(pages, { opacity: 0 }, 0);            // all pages start hidden
  pages.forEach(function (page, i) {
    var rows = page.children.length;
    var holdSeconds = Math.max(2.5, rows * 0.9) / speed;      // longer pages hold longer
    seq.fromTo(page, { opacity: 0, y: 14 }, { opacity: 1, y: 0, duration: 0.5 / speed, ease: 'power2.out' });
    // Hold, then hand over to the next page. The final page holds until stop().
    if (i < pages.length - 1) {
      seq.to(page, { opacity: 0, duration: 0.4 / speed, ease: 'power2.in' }, '+=' + holdSeconds);
    }
  });
  return seq;
}`;
}
