// The MATCH CLOCK — the sports clock a scorebug runs, and the sports pack's one piece of
// genuinely stateful playout logic.
//
// It is design-owned runtime JS, emitted OUTSIDE the marked ANIMATION region exactly like
// shared/clock.ts, for the same reason: a clock is playout, not motion. The state machine's
// `clock` group only CALLS into it (`startMatchClock` / `stopMatchClock` / `resetMatchClock`),
// so the timeline can rewrite the entrance all it likes and the clock keeps running.
//
// Three things make this an operator tool rather than a decoration:
//
//   1. IT COUNTS BOTH WAYS. Football counts up to 45:00, basketball and hockey count DOWN to
//      0:00, and a period that reaches zero has to stop itself and say so. The direction is a
//      DESIGN decision, declared on the clock element as `data-count="up" | "down"` — an
//      operator never has to pick it, and a template cannot end up in the wrong sport.
//   2. THE OPERATOR OWNS THE VALUE. The clock element IS a data field (`id="fN"`), so typing
//      "43:12" into the control page re-seeds the running clock. Every live clock drifts from
//      the stadium's, and a scorebug you cannot correct is a scorebug you stop trusting.
//   3. RESET IS A SEPARATE OPERATION. `resetMatchClock` returns to the element's own
//      `data-start`, never to zero-by-assumption — the same "reset is two operations" rule the
//      state machine holds for visual state and data (docs/STATE_MACHINE_SCHEMA.md).
//   4. TICKING IS DISPLAY, NOT STATE (2026-08-19). The clock's truth is a TIME ORIGIN — a value
//      and the instant it was true — and every renderer paints `origin value ± elapsed`. It used
//      to be a counter each renderer incremented once a second in its own memory, which is three
//      live faults at once: two renderers started a second apart stayed a second apart forever
//      and drifted further whenever either was throttled (a browser source in a background tab
//      is throttled to roughly one timer a minute); a monitor that unmounted and came back
//      restarted from the seed; and a browser-source RELOAD at 67 minutes aired 0:00, because
//      the only copy of "67" was in the memory that had just been thrown away.
//
//      The origin travels as the clock FIELD's own value, with the instant appended:
//      `"45:00@1755600000000"`. That syntax is why the fix needs no new field, no new message
//      and no new report — a clock value already rides every Take, Update and boot recovery, and
//      an origin-stamped one is IDEMPOTENT: re-sending it a minute later still resolves to the
//      right time, where re-sending a counter's snapshot pulled the clock backwards. A plain
//      value with no `@` is a HELD time, which is exactly what every existing template, export
//      and typed correction already sends.
//
// Everything here is prefix-parameterized, so a scoreboard-category board and an
// infographic-category match centre share one implementation.

/**
 * The match-clock runtime for a category prefix ('scoreboard', 'infographic').
 *
 * Contract with the design:
 *   - one `.{prefix}-clock` element, which SHOULD also carry a field id so the operator can
 *     correct it; `data-count="down"` counts down (default is up), `data-start="45:00"` is
 *     what `resetMatchClock` returns to (default is the element's initial text);
 *   - the root `.{prefix}` gains `.{prefix}-final` at full time, `.{prefix}-break` during an
 *     interval, and `.{prefix}-expired` when a counting-down clock reaches zero, so a design
 *     styles each of the three without any of them being a separate state to animate.
 *
 * `hours` paints an hour or more as "3:39:30" rather than "219:30" (an imported clock counting
 * down to a set time, jev-svg-import row 11, AC-9). Only the PAINT changes: the field and the wire
 * keep minutes and seconds, which every parser reads. Without it the emitted runtime is byte for
 * byte what every native board already ships, where 67 minutes reads "67:00".
 */
export function matchClockJs(prefix: string, opts: { hours?: boolean } = {}): string {
  return `// ---- Match clock (playout, not motion — the machine's clock group calls into this) ----
// The clock element also carries a data field id, so an operator can correct a drifting
// clock by typing into it; matchClockUpdate() below re-seeds the tick from what they typed.

// THE CLOCK'S TRUTH IS TWO NUMBERS, not one counter: a value and, while it runs, the instant
// that value was true. Everything painted is derived from them, so nothing accumulates and
// nothing is lost by a renderer that was not there when the clock started.
var matchClockTimer = null;      // the 1-second repaint, or null while the clock is held
var matchClockBase = 0;          // the clock's value in seconds AT the origin below
var matchClockAt = null;         // epoch ms the base was true, or null while the clock is held
var matchClockReady = false;     // true once the element has been read for its starting value

// matchClockEl(): the one clock element, or null on a design that has no clock.
function matchClockEl() {
  return document.querySelector('.${prefix}-clock');
}

// matchClockDown(): does this design's clock count DOWN? A design decision, on the element.
function matchClockDown() {
  var el = matchClockEl();
  return !!el && el.getAttribute('data-count') === 'down';
}

// parseMatchClock(): "45:00" -> 2700 · "90" -> 90 seconds. An "@<epoch ms>" suffix is the time
// ORIGIN and is stripped here; matchClockOriginOf() below reads it. Anything unparseable reads
// as 0 rather than NaN, so a typo blanks the clock instead of painting "NaN:aN" on air.
function parseMatchClock(text) {
  var raw = String(text == null ? '' : text).trim();
  var at = raw.indexOf('@');
  if (at !== -1) raw = raw.slice(0, at);
  var parts = raw.trim().split(':');
  var mins = parseInt(parts[0], 10) || 0;
  if (parts.length < 2) return Math.max(0, mins);          // a bare number is seconds
  return Math.max(0, mins * 60 + (parseInt(parts[1], 10) || 0));
}

// matchClockOriginOf(): the epoch ms an "@"-stamped value was true, or null for a plain (held)
// value. A stamp that is not a number is treated as absent — a broken stamp must degrade to a
// held clock showing the right time, never to a clock counting from 1970.
function matchClockOriginOf(text) {
  var raw = String(text == null ? '' : text);
  var at = raw.indexOf('@');
  if (at === -1) return null;
  var stamp = parseInt(raw.slice(at + 1), 10);
  return isFinite(stamp) && stamp > 0 ? stamp : null;
}

// matchClockPlain(): the value without its origin stamp — what a person reads, and what the
// operator's own field holds. It is what a resend is judged against; see matchClockUpdate().
function matchClockPlain(text) {
  var raw = String(text == null ? '' : text).trim();
  var at = raw.indexOf('@');
  return at === -1 ? raw : raw.slice(0, at).trim();
}

// matchClockValue(): what the clock reads RIGHT NOW. Held, that is the base; running, it is the
// base plus (or minus) the seconds since the origin — recomputed from the wall clock every
// time, which is what makes a throttled tab catch up instead of falling behind.
function matchClockValue() {
  if (matchClockAt === null) return matchClockBase;
  var elapsed = Math.floor((Date.now() - matchClockAt) / 1000);
  if (elapsed < 0) elapsed = 0;                            // a clock stamped in the future holds
  if (matchClockDown()) return Math.max(0, matchClockBase - elapsed);
  return matchClockBase + elapsed;
}

${opts.hours ? HOURS_FORMAT : MINUTES_FORMAT}

// initMatchClock(): read the element's own starting value once. The field's default text IS
// the starting value, so a design never repeats the number in two places.
function initMatchClock() {
  var el = matchClockEl();
  if (!el || matchClockReady) return;
  var seed = el.getAttribute('data-start') || el.textContent;
  matchClockBase = parseMatchClock(seed);
  matchClockAt = matchClockOriginOf(seed);          // a design never ships one; a recovery might
  matchClockReady = true;
  paintMatchClock();
}

// paintMatchClock(): write the clock's DERIVED value into the element. A clock that has counted
// down to zero marks the root .${prefix}-expired so the design can flash it — the period is
// over whether or not anyone pressed a button.
function paintMatchClock() {
  var el = matchClockEl();
  if (!el) return;                                  // a design without a clock: nothing to paint
  var now = matchClockValue();
  el.textContent = formatMatchClock(now);
  var root = document.querySelector('.${prefix}');
  if (!root) return;
  if (matchClockDown() && now === 0) root.classList.add('${prefix}-expired');
  else root.classList.remove('${prefix}-expired');
}

// tickMatchClock(): one REPAINT. It computes nothing and remembers nothing — the value comes
// from the origin, so a missed or late tick costs a frame of freshness and never a second of
// match time. A counting-down clock that has reached zero holds there for good; nothing below
// zero is a valid time.
function tickMatchClock() {
  paintMatchClock();
  if (matchClockDown() && matchClockValue() === 0) stopMatchClock();
}

// startMatchClock(): run from where the clock STANDS. A restart after a stoppage must never
// send the match back to 0:00 — that is what resetMatchClock() is for.
//
// Starting MINTS a local origin, which is what keeps a template driven by nothing but SPX
// (play(), a Continue, an exported package with no control log behind it) working exactly as
// before. Where a control log IS behind it, an origin already arrived with the clock value and
// this is a no-op over it — see matchClockUpdate().
function startMatchClock() {
  initMatchClock();
  var el = matchClockEl();
  if (!el) return;                                  // no clock on this design: never start a timer for it
  if (matchClockAt === null) {                      // held: anchor the value to this instant
    if (matchClockDown() && matchClockBase === 0) return;   // nothing left to run
    matchClockAt = Date.now();
  }
  if (matchClockTimer) return;                      // already repainting: starting twice is a no-op
  matchClockTimer = setInterval(tickMatchClock, 1000);
  paintMatchClock();
}

// stopMatchClock(): hold the clock where it is. The value survives — a held clock is still the
// match time, it just is not moving — so the derived value is BANKED into the base as the
// origin is dropped.
function stopMatchClock() {
  matchClockBase = matchClockValue();
  matchClockAt = null;
  if (matchClockTimer) { clearInterval(matchClockTimer); matchClockTimer = null; }
}

// resetMatchClock(): back to the period's own starting value, held. Reset is deliberately a
// separate operation from stop, and it never assumes zero for a design that says otherwise: a
// period that counts down from 12:00 resets to 12:00, not to nothing.
//
// It reads data-start ALONE — falling back to the element's text would be wrong here, because
// by reset time that text is the RUNNING time and a reset would return the clock to wherever it
// had got to. Every generated clock carries the attribute (scoreboards/scorebugShared.ts writes
// it and the text together), so the zero fallback is for markup that never ships.
function resetMatchClock() {
  stopMatchClock();
  var el = matchClockEl();
  if (!el) return;
  matchClockBase = parseMatchClock(el.getAttribute('data-start') || '0');
  matchClockAt = null;
  paintMatchClock();
}

// matchClockUpdate(key, value): called from update() for every field written. When the value
// lands in the CLOCK element it is the clock's own truth, and this adopts it.
//
// TWO KINDS OF VALUE ARRIVE HERE, and they are told apart by the "@" origin stamp:
//
//   "47:12"                 a HELD time. The operator typed a correction, or the wire is
//                           reporting a stopped clock. Adopt it as the base.
//   "45:00@1755600000000"   a RUNNING clock: it read 45:00 at that instant. Adopt both, and
//                           the derived value is right however long ago that was — which is
//                           what makes a reopened browser source come back at the real match
//                           time instead of at the seed.
//
// A STAMPED value is safe to adopt every single time, because it is time-relative: re-sending
// it a minute later still resolves to the right second. A PLAIN one is not, which is what the
// guard below is for. Every Take, ✎ Update and Snap sends the cue's WHOLE value set
// (control/hostedControl.ts), so a score bump in the 64th minute resends the clock field
// carrying whatever was last TYPED into it — adopting that would pull a running clock back to
// its typed value on every goal. Comparing against the element's own text cannot tell a resend
// from a correction either: the element holds the RUNNING time, so a resend differs from it
// every second. What distinguishes a correction is that the value the wire carries CHANGED.
//
// IT IS THE PLAIN HALF THAT MUST BE COMPARED (fixed 2026-08-21, measured on air). The guard used
// to compare against the whole of the last value received, and once a control surface began
// stamping the origin that was no longer the operator's value: the wire had delivered
// "20:00@1755600000000", the cue still stored "20:00", and the two differ — so a goal in the
// 5th minute read as a correction and re-anchored a running clock back to 20:00. The stamp is
// OURS, not the operator's, and the operator's value had not changed at all.
//
// The honest limit, unchanged: re-sending a plain value identical to the last one received is a
// no-op, so an operator cannot re-apply the time the clock already holds. No control surface can
// express that anyway (the field already holds that text, so there is no edit to send), and
// returning to a known value is what resetMatchClock() is for.
var matchClockSent = null;       // the last clock value the wire delivered, not the painted time

function matchClockUpdate(key, value) {
  var el = matchClockEl();
  if (!el || el.id !== key) return;
  var incoming = String(value == null ? '' : value);
  var stamp = matchClockOriginOf(incoming);
  if (stamp === null && matchClockSent !== null && incoming === matchClockPlain(matchClockSent)) {
    // A resend of a plain value, not an edit. update() has ALREADY written that stale text into
    // the element (setFieldValue runs first, for every field alike), so returning quietly would
    // leave the typed time on air until the next repaint — a visible jump backwards on a
    // running clock, and a permanent wrong time on a held one. Paint the real value back.
    if (matchClockReady) paintMatchClock();
    return;
  }
  matchClockSent = incoming;
  var wasRunning = matchClockAt !== null;
  matchClockBase = parseMatchClock(incoming);
  // A stamp says when the value was true. A plain value is true NOW: held if the clock was held,
  // and re-anchored to this instant if it was running — the operator's typed correction, which
  // must correct the clock without stopping it.
  matchClockAt = stamp !== null ? stamp : (wasRunning ? Date.now() : null);
  matchClockReady = true;
  // A stamped value arriving at a held clock means the wire says it is running (a recovery, or a
  // start this document did not see). Repaint on the same second everyone else does.
  if (matchClockAt !== null && !matchClockTimer) matchClockTimer = setInterval(tickMatchClock, 1000);
  // The raw wire text is what setFieldValue just wrote, so a stamped value would sit on air as
  // "45:00@1755600000000" until the next repaint. Paint the real time back now.
  paintMatchClock();
}

// ---- Match state markers (what the machine's non-clock groups call) ----
// Each is a CLASS on the root, never a separate animated state: "at full time" and "during the
// interval" are things the board LOOKS like, and a design decides what that means in CSS.

// markLive(): the match is running — clear the interval AND the full-time treatment. Used by
// a graphic whose status is a single group, where "back to live" really does undo both.
function markLive() {
  var root = document.querySelector('.${prefix}');
  if (root) { root.classList.remove('${prefix}-final'); root.classList.remove('${prefix}-break'); }
}

// markInPlay(): the interval is over — clear ONLY the interval treatment.
//
// This exists because a board's "is the clock running" and "is the match over" are separate
// parallel groups, and a group must answer for itself alone. If resuming play also cleared
// full time, an operator who ended the match and then resumed the clock by habit would take a
// finished board back to looking live — a group reaching into another group's state.
function markInPlay() {
  var root = document.querySelector('.${prefix}');
  if (root) root.classList.remove('${prefix}-break');
}

// markBreak(): an interval (half time, end of a quarter, between sets). The clock holds; the
// scores stay on air, because a viewer joining at half time still needs them.
function markBreak() {
  stopMatchClock();
  var root = document.querySelector('.${prefix}');
  if (root) { root.classList.add('${prefix}-break'); root.classList.remove('${prefix}-final'); }
}

// markFinal(): the match is over. The clock stops for good and the design's own full-time
// treatment takes over.
function markFinal() {
  stopMatchClock();
  var root = document.querySelector('.${prefix}');
  if (root) { root.classList.add('${prefix}-final'); root.classList.remove('${prefix}-break'); }
}

// Seed the clock once the elements exist. This file loads in <head> in an exported package,
// so the DOM may not be parsed yet (the shared/clock.ts guard pattern).
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initMatchClock);
} else {
  initMatchClock();                // DOM already parsed (e.g. an inline preview build)
}`;
}

/** The native formatter, unchanged: minutes past 60 stay minutes ("67:00"). */
const MINUTES_FORMAT = `// formatMatchClock(): 2700 -> "45:00". Minutes are never zero-padded (broadcast reads "7:05",
// not "07:05"); seconds always are.
function formatMatchClock(total) {
  if (total < 0) total = 0;
  var s = total % 60;
  return Math.floor(total / 60) + ':' + (s < 10 ? '0' + s : s);
}`;

/** The hours formatter: under an hour exactly the native one, from an hour "3:39:30". */
const HOURS_FORMAT = `// formatMatchClock(): 2700 -> "45:00" · 13170 -> "3:39:30". Under an hour it reads as the native
// clock does; from an hour the hours lead and the minutes are padded. Only the paint: the field
// and the wire keep "<minutes>:<ss>", which parseMatchClock reads.
function formatMatchClock(total) {
  if (total < 0) total = 0;
  var s = total % 60;
  var m = Math.floor(total / 60);
  if (m < 60) return m + ':' + (s < 10 ? '0' + s : s);
  var mm = m % 60;
  return Math.floor(m / 60) + ':' + (mm < 10 ? '0' + mm : mm) + ':' + (s < 10 ? '0' + s : s);
}`;
