// Design-owned runtimes for the two corner-bug designs that DO something beyond sitting
// still: the live-status swap and the sponsor rotation.
//
// Both are emitted OUTSIDE the marked ANIMATION region (StandardDesign.runtimeExtraJs), the
// same doctrine as bug02's clock and the category motion runtimes: a preset swap in the
// Motion panel rewrites the region and can never touch this code, and it survives the data
// conversion and every export untouched.
//
// The state machine reaches them by NAME — a step/branch `call` is a bare identifier the
// interpreter fires through window[name] (blocks/animData.ts), never eval'd code. So the
// function names below are the contract the types in templates/types/identityBugs.ts declare.

/**
 * The live-status runtime. The machine calls one of the three entry points; each reads its own
 * operator-editable label field and paints it into the visible status element, then re-tags the
 * root so the CSS can recolour the bug.
 *
 * The label ids are passed in because a design's field numbering depends on how many text
 * lines the wizard emitted — the same reason every logo slot computes its own `fN`.
 */
export function liveStatusJs(ids: { status: string; live: string; replay: string; standby: string }): string {
  return `// ── Live status ─────────────────────────────────────────────────────────────
// Three words, one element. The operator's Live / Replay / Standby buttons dispatch the
// machine events; the machine calls one of these, which copies that mode's label (its own
// SPX field, so the wording is editable) into the visible status element and re-tags the
// graphic so the CSS can recolour it.
function setBugStatus(sourceId, mode) {
  var out = document.getElementById('${ids.status}');
  var source = document.getElementById(sourceId);
  if (!out || !source) return;
  out.textContent = source.textContent;   // the word the operator typed for this mode
  var root = document.querySelector('.corner-bug');
  if (!root) return;
  root.classList.remove('is-live', 'is-replay', 'is-standby');
  root.classList.add('is-' + mode);       // the CSS colours the dot and the chip from this
}

function bugStatusLive() { setBugStatus('${ids.live}', 'live'); }
function bugStatusReplay() { setBugStatus('${ids.replay}', 'replay'); }
function bugStatusStandby() { setBugStatus('${ids.standby}', 'standby'); }`;
}

/**
 * The sponsor-rotation runtime. One slot shows at a time; the machine's timer calls
 * `sponsorShowNext` at the midpoint of a crossfade, so the swap happens while nothing is
 * visible.
 *
 * EMPTY SLOTS ARE SKIPPED. A sponsor bug is usually filled in one at a time, and rotating
 * onto an unfilled slot would blank the strip for a beat. Until any file is picked, the
 * rotation runs over all slots so the design still demonstrates itself in the editor.
 *
 * THE CYCLE IS THE WALL CLOCK (docs/work-specs/obs-scenes/spec.md, OS4 R1-R6). Cycle k of the
 * machine's own length (hold plus crossfade, at the motion speed) shows slot k, so every copy of
 * the graphic shows the same partner at the same moment, however late it was loaded. The machine
 * is unchanged: while its rotation timer is ARMED (on air, entrance done, not held, not parked)
 * the runtime owns the timing - it swaps that timer for its own wait and, at a cycle boundary,
 * makes the timer's own transition, so the crossfade's midpoint lands on the boundary. A Take or
 * a reload keeps its logo until the next boundary (no extra change); a page throttled while
 * hidden rejoins on its first read.
 */
export const SPONSOR_ROTATION_JS = `// ── Sponsor rotation ────────────────────────────────────────────────────────
// The slots that actually carry a logo, in document order. setFieldValue puts .has-image on
// a slot the moment the operator picks a file, so this list is always current — no state to
// keep in step, and an empty slot is never rotated onto.
function sponsorSlots() {
  var all = document.querySelectorAll('.corner-bug-media');
  var filled = [];
  for (var i = 0; i < all.length; i++) {
    if (all[i].classList.contains('has-image')) filled.push(all[i]);
  }
  // Nothing picked yet (a fresh project): rotate the placeholders so the graphic still reads.
  return filled.length > 0 ? filled : Array.prototype.slice.call(all);
}

var sponsorIndex = 0;              // which slot is on screen
var sponsorCycle = null;           // the wall-clock cycle the live rotation is in
var sponsorBeatFor = null;         // the cycle a crossfade the runtime started is bringing in

// Show exactly one slot. The index wraps, so the rotation is endless by construction.
function sponsorShow(index) {
  var slots = sponsorSlots();
  if (slots.length === 0) return;
  sponsorIndex = ((index % slots.length) + slots.length) % slots.length;
  var all = document.querySelectorAll('.corner-bug-media');
  for (var i = 0; i < all.length; i++) all[i].classList.remove('is-showing');
  slots[sponsorIndex].classList.add('is-showing');
}

// The cycle's length and the crossfade's midpoint, in ms: the machine's own hold (its rotating
// state's timer) plus its crossfade, at the motion speed, read from the machine so an edited hold
// is the cycle every copy agrees on. 6 s + 0.5 s when there is no machine to read.
var sponsorTimingCache = null;     // the machine and its speed never change in a page: read once
function sponsorTiming() {
  if (sponsorTimingCache) return sponsorTimingCache;
  var hold = 6, beat = 0.5;
  try {
    var group = noacgMachine.groups[0];
    for (var i = 0; i < group.states.length; i++) {
      if (group.states[i].id === 'advance' && group.states[i].timeline) beat = group.states[i].timeline.duration;
    }
    for (var j = 0; j < group.transitions.length; j++) {
      var t = group.transitions[j];
      if (t.from === 'advance' && t.trigger === 'timer') hold = t.after;
    }
  } catch (e) {}
  var speed = (typeof motionSpeed === 'function' ? motionSpeed() : 1) || 1;
  sponsorTimingCache = { period: Math.max(0.5, hold + beat) * 1000 / speed, mid: beat * 500 / speed };
  return sponsorTimingCache;
}

// The machine's beat, at the midpoint of the crossfade. A crossfade the runtime started shows the
// wall clock's partner: its cycle's, or a later one's when the crossfade stalled across boundaries
// (drawing stopped in a hidden page while reads went on). Any other crossfade (Next sponsor,
// Resume, a snap into it) advances one, as it always did, and the next boundary rejoins the wall.
function sponsorShowNext() {
  if (sponsorBeatFor !== null) {
    sponsorShow(Math.max(sponsorBeatFor, Math.floor(Date.now() / sponsorTiming().period)));
    sponsorBeatFor = null;
  } else {
    sponsorShow(sponsorIndex + 1);
  }
}

// Five times a second. Only while the rotation's group has
// a timer armed - on air, entrance done, not held, not parked - and then the wall clock owns the
// beat: the machine's own timer (armed at whatever phase the Take had) is swapped for a wait that
// only this read ends, and a new cycle at the next crossfade's midpoint fires the timer's
// transition now. A late or throttled timer therefore never sets the beat.
function sponsorFollowWallClock() {
  if (typeof noacgTimers === 'undefined' || typeof noacgMachine === 'undefined' || typeof noacgDispatch !== 'function') return;
  var group = noacgMachine.groups[0];
  if (!group) return;
  var armed = noacgTimers[group.id];
  if (!armed) {
    if (noacgCurrent[group.id] !== 'advance') sponsorBeatFor = null;   // no crossfade of ours in flight
    return;
  }
  var timing = sponsorTiming();
  var cycle = Math.floor((Date.now() + timing.mid) / timing.period);
  if (!armed.noacgSponsorWait) {
    // Joining (a Take's entrance ended, a snap, a crossfade ended): this cycle is the one on screen.
    // The stand-in never fires by itself; anything that cancels timers (a transition, Hold, Out, a
    // snap) kills it like the timer it replaces, which is what ends "live".
    armed.kill();
    noacgTimers[group.id] = { noacgSponsorWait: true, kill: function () {} };
    // The cycle ON SCREEN, not the one the next crossfade would open: a join in the last moment
    // before a boundary must still fire that boundary's change.
    sponsorCycle = Math.floor(Date.now() / timing.period);
    return;
  }
  if (cycle === sponsorCycle) return;
  sponsorCycle = cycle;
  var slots = sponsorSlots();
  // Compared by element, not index: a logo picked on air reorders the filled slots.
  if (slots.length === 0 || slots[((cycle % slots.length) + slots.length) % slots.length].classList.contains('is-showing')) return;
  armed.kill();
  noacgTimers[group.id] = null;
  sponsorBeatFor = cycle;
  if (!noacgDispatch({ timerGroup: group.id, from: noacgCurrent[group.id] })) sponsorBeatFor = null;
}

// Show the first sponsor as soon as the DOM exists (template.js loads in <head> in exports).
function startSponsorRotation() {
  sponsorShow(0);
  // No document listener: in an OGraf renderer the document is the host page's. A page that was
  // hidden runs this read again within 200 ms of running at all.
  setInterval(sponsorFollowWallClock, 200);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startSponsorRotation);
} else {
  startSponsorRotation();          // DOM already parsed (e.g. an inline preview build)
}`;
