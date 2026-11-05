// The DEBATE FLOOR's shared parts: the field contract, and the two-clock engine that runs it.
//
// It lives beside the boards rather than in the type, because a field list and a runtime are
// things a DESIGN emits — but the speaking-timer TYPE has to declare exactly the same fields it
// will compile against, and two hand-kept copies of one contract is how they come to disagree.
// So the contract is declared once here in the type's own `TypeField` vocabulary, the type
// spreads it, and the design compiles it to SPX DataFields through `typeFieldsToSpx`.
//
// The import points scoreboards/ -> types/graphicType.ts, which is a leaf: it reaches into
// model/ and blocks/ and never back into templates/, so there is no cycle to boot into.

import { typeFieldsToSpx, type TypeField } from '../types/graphicType';
import type { SpxField } from '../../model/types';

/**
 * The debate floor's ten fields.
 *
 * The ORDER is load-bearing twice over. `typeFieldsToSpx` numbers them f0..f9 in declaration
 * order and throws if a `line` field follows a non-line one; and the animation presets
 * choreograph `#f0 … #f{lineCount-1}`, so every field with a visible span has to come before
 * the one that does not. The penalty size is therefore last: it is the only value nothing
 * paints.
 *
 * WHY THE CLOCKS ARE FIELDS the operator can type into: the same reason the match clock is
 * (shared/matchClock.ts). A speaking clock drifts from the chair's stopwatch, and a clock that
 * cannot be corrected is one the chair stops trusting. Typing a time re-anchors the count.
 */
export const DEBATE_FLOOR_FIELDS: TypeField[] = [
  { key: 'round', label: 'Round label', kind: 'text', value: 'OPENING STATEMENTS', role: 'line' },
  { key: 'sideA', label: 'Side A', kind: 'text', value: 'PROPOSITION', role: 'line' },
  { key: 'speakerA', label: 'Speaker A', kind: 'text', value: 'MAYA OKONKWO', role: 'line' },
  { key: 'sideB', label: 'Side B', kind: 'text', value: 'OPPOSITION', role: 'line' },
  { key: 'speakerB', label: 'Speaker B', kind: 'text', value: 'LUCAS BERG', role: 'line' },
  // The two clocks. `data`, not `line`: they are numbers the engine paints and the chair
  // corrects, not text the wizard's line editor should be offering to rewrite.
  { key: 'clockA', label: 'Clock A', kind: 'text', value: '05:00', role: 'data' },
  { key: 'clockB', label: 'Clock B', kind: 'text', value: '05:00', role: 'data' },
  // The allowance is the number the clocks RESET to, and it is on screen: the audience reads
  // the same figure the chair typed, so nobody has to be told what "reset" will do.
  { key: 'allowance', label: 'Speaking time each', kind: 'text', value: '05:00', role: 'data' },
  { key: 'allowanceWord', label: 'Allowance word', kind: 'text', value: 'EACH', role: 'data' },
  // Input only — it lives in a display:none holder, so `hidden` is the honest role. `number`
  // is the control: a penalty is lengthened far more often than it is retyped.
  { key: 'penalty', label: 'Penalty (seconds)', kind: 'number', value: '10', role: 'hidden' },
];

/** The debate floor's fields as SPX DataFields — what the assembler writes into the definition. */
export const debateFloorSpxFields = (): SpxField[] => typeFieldsToSpx(DEBATE_FLOOR_FIELDS);

/** The `fN` id one logical key compiled to. Hand-written here so the runtime below can name
 *  its own elements without the design repeating the field order a third time. */
const idOf = (key: string): string => `f${DEBATE_FLOOR_FIELDS.findIndex((f) => f.key === key)}`;

/**
 * THE TWO-CLOCK ENGINE — playout, not motion, so the design emits it OUTSIDE the marked
 * ANIMATION region and the timeline can never rewrite it (the shared/clock.ts rule).
 *
 * The machine only CALLS into it by name: `runSpeakerA` / `runSpeakerB` when the floor passes,
 * `resetClocks` when the chair re-arms, `applyPenalty` / `clearPenaltyMark` for a docked speaker,
 * `holdClocks` on the way off air.
 *
 * TICKING IS DISPLAY, NOT STATE — the same rule the match clock states (matchClock.ts §4). The
 * running count is a DEADLINE recomputed every tick rather than a counter decremented once a
 * second, so a late or coalesced interval is self-correcting instead of cumulative and a
 * five-minute speech still ends at 00:00 in a throttled background tab.
 *
 * THE DEADLINE IS ANCHORED TO THE EVENT, not to this browser. `debateNow()` reads the instant
 * the operator event actually happened — the log row's own server time, which every renderer of
 * a production sees identically (control/controlModel.ts). Two browser sources handed the same
 * `switch` row therefore paint the same second however far apart they received it, and a
 * renderer replaying a missed row resumes the speech from where it really started rather than
 * from the moment it caught up.
 *
 * THE RUNNING CLOCK'S VALUE ON THE WIRE IS ORIGIN-STAMPED, exactly as the single match clock's
 * is (`"03:12@<epoch>"`, control/matchClockWire.ts). It has to be: a renderer that rebuilds from
 * a report snapshot taken AFTER the switch it needed has no row left to replay, and a plain time
 * would put the field's last written value on air mid-speech. `speakingClockUpdate` below is
 * this engine's half of that — the same three-way reading the match clock's `matchClockUpdate`
 * makes, over two clocks instead of one.
 *
 * WHICH of the two is running is not asked of the machine. **The stamp IS the pointer**: at most
 * one clock field carries one, and that one is running. The wire keeps that invariant without
 * reading a state graph (the argument is in matchClockWire.ts), and this engine reads it back
 * the same way. `data-speaking="a" | "b" | "allowance" | "penalty"` on the design's own markup
 * is the whole contract between them.
 */
export function debateFloorRuntimeJs(): string {
  return `// ---- The debate floor's two clocks (playout, not motion — the machine calls into this) ----
// One clock runs at a time: whoever holds the floor. The truth about how much time a speaker
// has left is the number ON SCREEN, which is also the field the chair can retype mid-debate.
var DEBATE_TICK_MS = 250;        // four times a second — a retyped correction is adopted fast
var debateTimer = null;          // the repaint interval while a clock runs, else null
var debateActive = null;         // 'a', 'b', or null when nobody holds the floor
var debateDeadline = 0;          // ms timestamp the running count is anchored to
var debateLastPaint = { a: '', b: '' };   // what WE last wrote (anything else is the operator)
var debateExpired = { a: false, b: false };
var debateDocked = null;         // the side wearing a just-taken penalty, or null
var debateOffAir = false;        // the board has gone down, and no Take or snap has brought it back

function debateClockEl(side) { return document.getElementById(side === 'a' ? '${idOf('clockA')}' : '${idOf('clockB')}'); }

// WHEN the thing that is happening happened. Inside an operator event forwarded by a renderer
// this is the log row's own server time — the same instant every renderer of the production
// reads — and outside one it is simply now. Anchoring a speech to it rather than to this
// browser's clock is what stops two browser sources of the same debate drifting apart, and what
// lets a renderer replaying a missed row resume the speech from where it really started instead
// of from the moment it caught up.
function debateNow() {
  return (typeof noacgEventAt === 'number' && noacgEventAt > 0) ? noacgEventAt : Date.now();
}

// The value without its origin stamp — what a person reads, and what a held clock carries.
// The stamp is OURS, not the chair's, so it is this half a resend is judged against.
function debatePlainTime(text) {
  var raw = String(text == null ? '' : text);
  var at = raw.indexOf('@');
  return (at === -1 ? raw : raw.slice(0, at)).replace(/\\s+/g, '');
}

// The epoch ms an "@"-stamped value was true, or 0 for a plain (held) one. A stamp that is not
// a number reads as absent: a broken stamp must degrade to a held clock showing the right time,
// never to one counting from 1970.
function debateWireOrigin(text) {
  var raw = String(text == null ? '' : text);
  var at = raw.indexOf('@');
  if (at === -1) return 0;
  var stamp = parseInt(raw.slice(at + 1), 10);
  return stamp > 0 ? stamp : 0;
}

// "05:00" -> 300 · "5:00" -> 300 · "300" -> 300 (a bare number is seconds). Anything else is 0,
// which is how a half-typed value stops the count instead of racing to a nonsense deadline.
function debateParseTime(text) {
  var raw = debatePlainTime(text);
  if (!raw) return 0;
  var parts = raw.split(':');
  var total;
  if (parts.length === 1) {
    if (!/^\\d+$/.test(parts[0])) return 0;
    total = parseInt(parts[0], 10);
  } else {
    if (!/^\\d+$/.test(parts[0]) || !/^\\d+$/.test(parts[1])) return 0;
    total = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  return total > 0 ? total : 0;
}

// Is this text a time at all? "00:00" and "3:x" both parse to zero, and they must not be treated
// alike: one is a clock that has run out, the other a half-finished edit to leave alone.
function debateIsTime(text) {
  var raw = debatePlainTime(text);
  return /^\\d+$/.test(raw) || /^\\d+:\\d+$/.test(raw);
}

function debateFormat(total) {
  var pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return pad(Math.floor(total / 60)) + ':' + pad(total % 60);
}

// Paint one side's remaining time, and remember that it is out of time when it is.
function debatePaint(side, seconds) {
  var left = Math.max(0, seconds);
  var el = debateClockEl(side);
  if (el) {
    el.textContent = debateFormat(left);
    debateLastPaint[side] = el.textContent;
  }
  debateExpired[side] = left <= 0;
  debatePaintClockColors();
}

function debateRemaining(side) {
  var el = debateClockEl(side);
  return debateParseTime(el ? el.textContent : '');
}

// The allowance each speaker gets, and the size of one penalty.
function debateAllowance() {
  var el = document.getElementById('${idOf('allowance')}');
  var seconds = debateParseTime(el ? el.textContent : '');
  return seconds > 0 ? seconds : 300;
}

function debatePenaltySeconds() {
  var el = document.getElementById('${idOf('penalty')}');
  var seconds = parseInt(el ? String(el.textContent).replace(/\\s+/g, '') : '', 10);
  return seconds > 0 ? seconds : 10;
}

// Whose clock is running is said in COLOUR: the accent while it runs, the danger colour when it
// has just been docked or has run out, plain text otherwise. The machine's states carry the same
// colours as keyframes, so a parked or thumbnailed frame is right with no clock running at all;
// the engine re-asserts them here whenever the truth underneath changes.
function debateClockColorFor(side) {
  if (debateExpired[side] || debateDocked === side) return 'var(--penalty-color)';
  return (debateActive === side && debateTimer) ? 'var(--accent)' : 'var(--text-color)';
}

function debatePaintClockColors() {
  var sides = ['a', 'b'];
  for (var i = 0; i < sides.length; i++) {
    var el = debateClockEl(sides[i]);
    if (el) el.style.color = debateClockColorFor(sides[i]);
  }
}

function debateStopTimer() {
  if (debateTimer) { clearInterval(debateTimer); debateTimer = null; }
}

// One tick: recompute from the deadline rather than decrementing a counter, so nothing
// accumulates. If the number on screen is not the one we painted, the chair (or an update) has
// typed into the clock — adopt that as the new truth, and leave anything that is not a time
// exactly where they put it rather than overwriting a half-finished edit.
function debateTick() {
  if (!debateActive) return;
  var el = debateClockEl(debateActive);
  var shown = el ? String(el.textContent).replace(/\\s+/g, '') : '';
  if (shown !== debateLastPaint[debateActive]) {
    var typed = debateParseTime(shown);
    if (typed <= 0) { debateStopTimer(); debatePaintClockColors(); return; }
    debateDeadline = Date.now() + typed * 1000;
  }
  var left = Math.max(0, Math.ceil((debateDeadline - Date.now()) / 1000));
  debatePaint(debateActive, left);
  if (left <= 0) { debateStopTimer(); debatePaintClockColors(); }
}

// Freeze whoever is speaking at the value on screen.
function debateHold() {
  if (debateActive && debateTimer) {
    debatePaint(debateActive, Math.max(0, Math.ceil((debateDeadline - debateNow()) / 1000)));
  }
  debateStopTimer();
}

// Give one side the floor: the other stops where it is, this one picks up from its OWN number.
// That is the whole point of two clocks — a speaker who is interrupted does not lose the time.
function debateStart(side) {
  // ALREADY RUNNING THIS SIDE: the wire got here first. On a hosted production the switch row's
  // clock values are written BEFORE the event that consumes them, so speakingClockUpdate has
  // already adopted the stamp and anchored the count to the row's own instant. Re-anchoring here
  // would subtract the elapsed time a second time, and on a REPLAYED row — a renderer catching
  // up on a speech that began minutes ago — that lands the clock at zero. The other way here is a
  // Take on air putting the floor back on the speaker still counting (below), which changes nothing
  // either.
  if (debateActive === side && debateTimer) { debatePaintClockColors(); return; }
  if (debateOffAir) return;
  debateHold();
  debateActive = side;
  var left = debateRemaining(side);
  debateDeadline = debateNow() + left * 1000;
  debatePaint(side, left);
  if (left > 0) debateTimer = setInterval(debateTick, DEBATE_TICK_MS);
  debatePaintClockColors();
}

function runSpeakerA() { debateStart('a'); }
function runSpeakerB() { debateStart('b'); }

// The exit's call: nobody holds the floor once the board is off air, and nobody takes it there. A
// Switch that reaches a board already down starts nothing; the wire ignores it too. Only a machine
// runtime can end that, below: a hand-written region has no such Take to bring the board back.
function holdClocks() {
  debateHold();
  debateActive = null;
  debateOffAir = typeof noacgMachinePlay === 'function';
  debatePaintClockColors();
}

// A TAKE ON AIR DOES NOT TAKE THE FLOOR AWAY. play() rests every machine group at its initial state,
// which for the floor is armed, but a speaker still counting through a Take has not stopped: this
// engine and the wire's stamp both say who it is. Left armed, the next Switch would start A whoever
// the wire handed the floor to, and the two would name different speakers from then on. So the floor
// goes straight back to that speaker. debateStart then finds that side already running and changes
// nothing, so this holds in a boot's recovery too, where play() follows the report's data with no
// data after it. A board that has been off air holds nobody, and neither does a first Take.
if (typeof noacgMachinePlay === 'function') {
  var debateMachinePlay = noacgMachinePlay;
  noacgMachinePlay = function () {
    debateOffAir = false;
    var entrance = debateMachinePlay();
    for (var g = 0; debateActive && g < noacgMachine.groups.length; g++) {
      if (noacgMachine.groups[g].id === 'floor') noacgFire(noacgMachine.groups[g], { to: debateActive === 'a' ? 'speakerA' : 'speakerB' });
    }
    return entrance;
  };
}

// A SNAP TO ARMED MEANS IT: nobody speaks, and each clock holds what it reads. A snap skips a group
// bound for its initial state, so armed's own call never runs and the count would outlive the pose.
// The wire banks the same row (control/matchClockWire.ts). The numbers are not reset: that is Reset.
if (typeof noacgSnap === 'function') {
  var debateMachineSnap = noacgSnap;
  noacgSnap = function (assignments, opts) {
    debateOffAir = false;
    var pose = debateMachineSnap(assignments, opts);
    if (debateActive && pose.groups.floor === 'armed') {
      debateStopTimer();
      debateActive = null;
      debatePaintClockColors();
    }
    return pose;
  };
}

// Both clocks back to the set allowance, nothing running — the reset button's whole job.
// RESET IS TWO OPERATIONS and this is the DATA half: it puts the numbers back. The floor group
// walking to its own armed state is the visual half, and the machine owns that.
function resetClocks() {
  debateStopTimer();
  debateActive = null;
  var full = debateAllowance();
  debatePaint('a', full);
  debatePaint('b', full);
  debatePaintClockColors();
  clearPenaltyMark();
}

// Dock the penalty from whoever is speaking. The running clock keeps running, just shorter —
// a penalty is a deduction, not a stoppage.
function applyPenalty() {
  var badge = document.querySelector('.scoreboard-penalty');
  var cost = debatePenaltySeconds();
  if (badge) badge.textContent = '-' + cost;
  if (!debateActive) return;
  var live = debateTimer
    ? Math.max(0, Math.ceil((debateDeadline - debateNow()) / 1000))
    : debateRemaining(debateActive);
  var left = Math.max(0, live - cost);
  debatePaint(debateActive, left);
  if (left > 0) debateDeadline = debateNow() + left * 1000;
  else debateStopTimer();
  debateDocked = debateActive;
  debatePaintClockColors();
}

// The penalty group's other state calls this when the flash is over.
function clearPenaltyMark() {
  debateDocked = null;
  debatePaintClockColors();
}

// ---- The wire's own clock values (control/matchClockWire.ts) ----
//
// speakingClockUpdate(key, value): called from update() for every field written, and the one
// place a clock's value ARRIVING is read. Three kinds reach it, told apart by the "@" stamp:
//
//   "03:12@1755600000000"  a RUNNING clock: it read 03:12 at that instant, and this side holds
//                          the floor. Adopt both — the derived time is right however long ago
//                          that was, which is what brings a reconnecting browser source back
//                          mid-speech instead of at the allowance.
//   "03:12"                a HELD time: the wire banking a stopped clock, or the chair typing a
//                          correction into a running one.
//   "04:00@/05:00/05:00"   the same held time on /output, after the time it also carries what the
//                          cue last sent, which is the wire's to read. A stamped value carries it
//                          too. Every parser here stops at the "@" or the "/", so it reads as above.
//   a plain value equal to the last one delivered — a RESEND, not an edit. Every Take, ✎ Update
//                          and Snap sends the cue's WHOLE value set, and a cue stores the plain
//                          allowance forever, so a penalty in the fourth minute re-sends
//                          "05:00" over a clock that has run down to 01:12. Adopting that would
//                          pull the speech back to full time on every press.
//
// It is the PLAIN HALF that is compared, for the reason the match clock states at length: the
// stamp is ours, and the chair's "05:00" has not changed just because we stamped it. The honest
// limit is the same one too — the chair cannot re-apply a time the clock already holds, and
// returning to a known figure is what Reset is for.
var debateSent = { a: null, b: null };   // the last value the WIRE delivered, not the painted time

function debateSideOfField(key) {
  if (key === '${idOf('clockA')}') return 'a';
  if (key === '${idOf('clockB')}') return 'b';
  return null;
}

// Put the side's REAL time back on screen. setFieldValue has already written the wire's raw text
// into the element for every field alike, so a stamped value would otherwise sit on air reading
// "03:12@1755600000000", and a resent one would show a stale time until the next tick.
function debateRepaintSide(side) {
  if (debateActive === side && debateTimer) {
    debatePaint(side, Math.max(0, Math.ceil((debateDeadline - Date.now()) / 1000)));
  } else {
    debatePaint(side, debateParseTime(debateLastPaint[side]));
  }
}

function speakingClockUpdate(key, value) {
  var side = debateSideOfField(key);
  if (!side) return;
  var incoming = String(value == null ? '' : value);
  var origin = debateWireOrigin(incoming);
  if (!origin && debateSent[side] !== null && debatePlainTime(incoming) === debatePlainTime(debateSent[side])) {
    debateRepaintSide(side);
    return;
  }
  debateSent[side] = incoming;
  var base = debateParseTime(incoming);
  if (origin) {
    // The wire says this side is running, and what it read when. Anchoring to the origin rather
    // than to this browser is what makes two browser sources of the same debate paint the same
    // second, and what lets a renderer that boots mid-speech land on the right one.
    debateStopTimer();
    debateActive = side;
    var left = Math.max(0, base - Math.max(0, Math.floor((Date.now() - origin) / 1000)));
    debateDeadline = Date.now() + left * 1000;
    debatePaint(side, left);
    if (left > 0) debateTimer = setInterval(debateTick, DEBATE_TICK_MS);
    debatePaintClockColors();
    return;
  }
  // Not a time at all — a half-finished edit in the studio's Content panel. Leave it exactly
  // where the chair put it and stop counting; their text is theirs.
  if (!debateIsTime(incoming)) {
    if (debateActive === side) debateStopTimer();
    debatePaintClockColors();
    return;
  }
  // A plain time. Held, unless this side is the one speaking — in which case it is the chair
  // correcting a running clock, which must correct it without stopping it.
  debatePaint(side, base);
  if (debateActive !== side) return;
  if (base <= 0) { debateStopTimer(); debatePaintClockColors(); return; }
  debateDeadline = Date.now() + base * 1000;
  if (!debateTimer) { debateTimer = setInterval(debateTick, DEBATE_TICK_MS); debatePaintClockColors(); }
}

// Show the allowance on both clocks before the first play(), so a preview and the studio's
// parked view look like the board will. This file loads in <head> — wait for the DOM.
function paintIdleDebateClocks() {
  var full = debateAllowance();
  debatePaint('a', full);
  debatePaint('b', full);
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paintIdleDebateClocks);
} else {
  paintIdleDebateClocks();
}
`;
}
