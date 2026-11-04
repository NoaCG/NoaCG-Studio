// THE MATCH CLOCK'S TIME ORIGIN, as vanilla JS for the GENERATED operator pages.
//
// `matchClockWire.ts` is the same arithmetic as a TypeScript module, and it is what the app and
// the hosted `/output` renderer import. The two generated operator surfaces — the standalone
// `controlpanel.html` and the exported production `controller.html` — cannot import anything:
// they ship as one self-contained file inside a zip. So the arithmetic exists twice, on purpose,
// and this module is the single copy of the SECOND one, shared by both pages rather than
// hand-written into each.
//
// THE WIRE FORMAT IS THE CONTRACT between the two implementations: a clock value is either a
// held time ("45:00") or a running one carrying the instant it was true ("45:00@1755600000000").
// Change one side and change the other, or an exported package and a hosted renderer will
// disagree about what a clock reads — which is a thing that shows on air and nowhere else.
//
// Emitted into a page's <script> as-is, so: no backticks and no `${`, both of which would end
// the template literal that carries it.

/**
 * The pure clock functions every generated operator page needs: read a value's plain half, read
 * its origin stamp, parse, format, and derive what it reads at a given instant; then the wire's
 * decision itself, `clockAfterUpdate` and `clockRowStep` (`clockValueAfterUpdate` and
 * `clockRowEffect`), pinned equal to the TS by scripts/clock-page-wire.test.mjs. Where a page keeps
 * the clock's held value, and when it sends, is each page's own.
 */
export const MATCH_CLOCK_PAGE_JS = `// ---- Match clock: the time origin (control/matchClockPageJs.ts) ----
// A clock is the one value that keeps moving with nobody commanding it, so a log of what was
// SENT cannot rebuild it: a graphic reloaded 67 minutes into a match came back at whatever the
// last Take carried and re-ran from there — on air, at the moment something has already gone
// wrong. So a clock value carries the instant it was true ("45:00@1755600000000"), the runtime
// paints value +/- elapsed (templates/shared/matchClock.ts), and the operator page stamps it.
// A plain value with no "@" is a HELD time, which is what a typed correction sends.

// clockPlain(): the value a person reads, without the origin stamp.
function clockPlain(raw) {
  var t = String(raw == null ? '' : raw).trim();
  var at = t.indexOf('@');
  return at === -1 ? t : t.slice(0, at).trim();
}

// clockOrigin(): the stamp in epoch ms, or null for a held value. A stamp that is not a number
// reads as absent — a broken stamp must degrade to a held clock showing the right time, never
// to a clock counting from 1970.
function clockOrigin(raw) {
  var t = String(raw == null ? '' : raw);
  var at = t.indexOf('@');
  if (at === -1) return null;
  var stamp = parseInt(t.slice(at + 1), 10);
  return isFinite(stamp) && stamp > 0 ? stamp : null;
}

// clockSeconds(): "45:00" -> 2700 - "90" -> 90. The runtime's own parser, kept identical.
function clockSeconds(raw) {
  var parts = clockPlain(raw).split(':');
  var mins = parseInt(parts[0], 10) || 0;
  if (parts.length < 2) return Math.max(0, mins);      // a bare number is seconds
  return Math.max(0, mins * 60 + (parseInt(parts[1], 10) || 0));
}

// clockFormat(): 2700 -> "45:00". Minutes are never zero-padded (broadcast reads "7:05");
// seconds always are.
function clockFormat(total) {
  if (total < 0) total = 0;
  var s = total % 60;
  return Math.floor(total / 60) + ':' + (s < 10 ? '0' + s : s);
}

// clockValueAt(): what a clock value reads at that instant — a held value as it stands, a
// stamped one plus (or minus) the seconds since its origin.
function clockValueAt(raw, down, now) {
  var origin = clockOrigin(raw);
  var base = clockSeconds(raw);
  if (origin === null) return clockFormat(base);
  var elapsed = Math.floor((now - origin) / 1000);
  if (elapsed < 0) elapsed = 0;                        // a clock stamped in the future holds
  return clockFormat(down ? Math.max(0, base - elapsed) : base + elapsed);
}

// ---- The wire's clock DECISION (control/matchClockWire.ts clockValueAfterUpdate, clockRowEffect) ----
// What an Update writes to the clock field, and what one row does to the clock and WHEN relative
// to the row: the same decision the hosted renderer makes, so an operator switching between the
// hosted dashboard and an exported page gets the same clock (#1887). An imported clock's value
// carries its length and what the cue last SENT after its origin ("0:18@/0:30/0:25": held at 0:18,
// length 0:30, last sent 0:25; the origin slot is a number when it runs, "out" when an Out held
// it, "0" for a time corrected while it runs until its row stamps it). Pinned equal to the TS by
// scripts/clock-page-wire.test.mjs. The stamp here is the press's own instant: this page is the
// only sender its graphics have.

// clockSlots(): an imported clock's value read apart, or null for a plain or native value.
function clockSlots(raw) {
  var t = String(raw == null ? '' : raw).trim();
  var at = t.indexOf('@');
  if (at === -1) return null;
  var parts = t.slice(at + 1).split('/');
  if (parts.length < 2 || parts.length > 3) return null;
  return { time: t.slice(0, at).trim(), slot: parts[0], length: parts[1], sent: parts.length > 2 ? parts[2] : parts[1] };
}

function clockSlotValue(time, origin, length, sent) {
  return time + '@' + (origin == null ? '' : origin) + '/' + length + '/' + sent;
}

// clockAfterUpdate(): the clock field's value after an Update carrying "incoming". A resend never
// erases an origin; a correction while it runs is marked "0" for its row to stamp.
function clockAfterUpdate(held, incoming) {
  if (clockOrigin(incoming) !== null) return incoming;
  if (clockSlots(incoming)) return incoming;
  var read = clockSlots(held);
  if (read) {
    var time = clockPlain(incoming);
    if (read.slot === 'out') return clockSlotValue(time, 'out', time, time);
    if (time === read.sent) return held;
    if (time === read.time && clockOrigin(held) === null) return clockSlotValue(read.time, read.slot, read.length, time);
    return clockSlotValue(time, clockOrigin(held) === null ? '' : '0', read.length, time);
  }
  if (held == null || clockOrigin(held) === null) return incoming;
  return clockPlain(held) === clockPlain(incoming) ? held : incoming;
}

// clockRowStep(): what one row does to the clock, { value, when } or null. "held" is the clock
// field's value on the wire (the design's seed when nothing was sent), "at" the row's instant.
function clockRowStep(clock, msg, held, at) {
  return clockSlottedStep(clock, msg, held == null ? clock.seed : held, at);
}

// Every match clock: its verbs, a duration's Take and Out, and a running correction. A native clock
// (no "events") answers to clockStart, clockStop and clockReset, and its length is its reset time.
var CLOCK_NATIVE_EVENTS = { start: 'clockStart', stop: 'clockStop', reset: 'clockReset' };
function clockSlottedStep(clock, msg, from, at) {
  if (msg.t !== 'update' && msg.t !== 'play' && msg.t !== 'stop' && msg.t !== 'event') return null;
  if (clock.fixedInstant) return (msg.t === 'update' || msg.t === 'play') && from !== clock.seed ? { value: clock.seed, when: 'after' } : null;
  var events = clock.events || CLOCK_NATIVE_EVENTS;
  var read = clockSlots(from);
  var time = (read ? read.time : clockPlain(from)) || clock.resetTo;
  var length = !clock.events ? clock.resetTo : read ? read.length : (clock.startsOnTake ? time : clock.resetTo);
  var sent = read ? read.sent : time;
  var offAir = !!read && read.slot === 'out';
  if (msg.t === 'play') {
    if (!clock.startsOnTake) return null;
    // Off air the next Take counts the field, even when it resends an on-air correction (#1884).
    var taken = offAir ? sent : read ? length : time;
    return { value: clockSlotValue(taken, at, taken, sent), when: 'before' };
  }
  if (msg.t === 'stop') {
    if (!clock.startsOnTake || offAir) return null;
    return { value: clockSlotValue(clockValueAt(from, true, at), 'out', length, sent), when: 'after' };
  }
  if (msg.t === 'update') return read && read.slot === '0' ? { value: clockSlotValue(time, at, length, sent), when: 'after' } : null;
  if (msg.event === events.start) return { value: clockSlotValue(clockValueAt(from, clock.countsDown, at), at, length, sent), when: 'before' };
  if (msg.event === events.stop) return { value: clockSlotValue(clockValueAt(from, clock.countsDown, at), offAir ? 'out' : '', length, sent), when: 'after' };
  if (msg.event === events.reset) return { value: clockSlotValue(length, offAir ? 'out' : '', length, sent), when: 'after' };
  return null;
}

// relayLogWalk(): read a local relay's log from "after" to its head, in the relay's pages of up to
// 500 rows, handing each row to onRow, then done(the last id read). A page walks it from 0 when it
// boots, so it knows where each imported clock stands however far back its last clock row is.
function relayLogWalk(after, onRow, done) {
  fetch('/relay/log?after=' + after)
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (data) {
      var rows = data && data.rows ? data.rows : [];
      for (var i = 0; i < rows.length; i++) { after = rows[i].id; onRow(rows[i]); }
      if (rows.length > 0 && data.head > after) relayLogWalk(after, onRow, done);
      else done(after);
    })
    .catch(function () { done(after); });
}

// clockFollower(): where one imported clock stands for a page that shares a local relay with other
// pages (the production controller, other panels), starting from "held". The relay's log is the
// record every relay-driven output follows, so:
//  - f.held is the clock this page computes its next press from;
//  - f.confirmed is the last clock the log showed (this page's own row coming back, or another's);
//  - f.sent(value) notes a clock value this page put on the relay, and answers what to call if the
//    relay refuses it;
//  - f.row(value) takes a clock row of the log, in log order: a row before this page's own pending
//    send is older than that press and is kept aside (skipped); the page's own row coming back
//    confirms it, and is the clock when nothing newer of its own is still out;
//  - f.settle() drops sends refused or not back within 7 s; once none is out, the clock is the
//    newest row another page sent meanwhile, else the last confirmed clock, which is what the
//    relay's outputs still hold.
function clockFollower(held) {
  var f = { held: held, confirmed: held, own: [], skipped: null };
  f.settle = function (drop) {
    var now = Date.now();
    var was = f.own.length;
    f.own = f.own.filter(function (o) { return o !== drop && now - o.at < 7000; });
    if (f.own.length > 0 || f.own.length === was) return;
    if (f.skipped !== null) { f.confirmed = f.skipped; f.skipped = null; }
    f.held = f.confirmed;
  };
  f.sent = function (value) {
    var own = { value: value, at: Date.now() };
    f.settle(null);
    f.own.push(own);
    return function () { f.settle(own); };
  };
  f.row = function (value) {
    f.settle(null);
    for (var i = 0; i < f.own.length; i++) {
      if (f.own[i].value === value) {
        f.own = f.own.slice(i + 1);
        f.skipped = null;
        f.confirmed = value;
        // Nothing of this page's still out (a newer send was refused meanwhile): this is the clock.
        if (f.own.length === 0) f.held = value;
        return;
      }
    }
    if (f.own.length === 0) { f.held = value; f.confirmed = value; }
    else f.skipped = value;
  };
  return f;
}`;
