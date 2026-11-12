// The shared countdown-clock runtime, used by the starting-soon and game-timer categories.
// It emits teachable ES5 that lives OUTSIDE the marked ANIMATION region (it is playout
// logic, not motion): the animation presets only call startClock() / stopClock().
//
// Contract with the design:
//   - a hidden <div id="fN" class="noacg-data-source"> holds the duration in whole minutes
//     (decimals allowed: "0.5" is thirty seconds) — SPX writes into it like any field.
//     The hider is a CSS rule, never an inline style: the editor's entrance reset clears
//     inline props (base.ts DATA_SOURCE_CLASS), which would un-hide an inline-hidden holder
//   - OPTIONALLY a second hidden field holds a wall-clock START TIME ("19:30"). When the
//     operator fills it in it WINS over the duration, which is what "counts down to the
//     start of the show" actually means: the number on screen agrees with the clock on
//     the wall, however long the graphic has been up. The same field also takes an absolute
//     deadline with its offset ("2026-11-14T19:00:00+02:00"): it counts to that instant on
//     every page, and holds at 0:00 once it has passed.
//   - a .{prefix}-clock element displays the remaining time (M:SS, or H:MM:SS past an hour)
//   - when the clock hits zero the root gets a .{prefix}-done class, so the design's CSS
//     can flash, recolor, or swap text without any extra JS
//
// UPDATE RE-ARMS THE CLOCK (owner walk, 2026-08-29). The length a countdown counts is DATA -
// the operator types it into a field like any other - so a new value takes effect the moment
// they press Update, running or not. That is not a state change and does not need one: the
// graphic stays in exactly the state it was in and re-derives what it displays, the same way a
// name field re-derives the name (docs/STATE_MACHINE_SCHEMA.md - update() writes fields, events
// move states). Before this, a running clock read its length once at startClock() and ignored
// every later value, so the only way to correct a countdown on air was to take it out and back
// in - the one thing an operator cannot do to a screen the audience is watching.
// The safety is in `clockDataUpdated()` below: it re-arms only when the clock's OWN fields
// changed, so an Update carrying a new headline never restarts the count under it.
//
// ACCURACY: the count is anchored to a DEADLINE timestamp, not decremented once per tick.
// A holding screen can sit on air for an hour, and `setInterval` drifts — it is throttled in
// a background tab, coalesced on a loaded playout machine, and never fires early. Recomputing
// the remaining time from the deadline on every tick makes a late tick self-correcting instead
// of cumulative, so the clock still agrees with the wall at 0:00. (Under the render service's
// virtual clock, Date.now() is virtualized too — src/render/runtimeScript.ts — so a rendered
// countdown stays a pure function of the frame.)

/** Emit the clock runtime functions for a category (prefix) and its duration field.
 *  `targetFieldId` opts the design into the wall-clock start-time field described above;
 *  omit it and the runtime reads the duration only (what every clock did before). */
export function clockRuntimeJs(prefix: string, minutesFieldId: string, targetFieldId?: string): string {
  // Where a count is anchored. A design with the start-time field anchors to the deadline
  // itself when there is one, so the painted second flips on the deadline's own second on every
  // page; every other clock emits exactly what it always did.
  const anchor = targetFieldId ? 'clockAnchor()' : 'Date.now() + clockSecondsLeft * 1000';
  const targetBlock = targetFieldId
    ? `
// Seconds until the wall-clock start time in #${targetFieldId} ("19:30", 24-hour), or 0 when the
// operator left it empty — which is how this field stays OPTIONAL: empty means "just count
// the duration". A time that has already gone past today counts to TOMORROW, so an overnight
// show holding at 23:50 for a 00:15 start shows 0:25:00 and never a negative number.
function clockTargetSeconds() {
  var text = clockFieldText('${targetFieldId}');
  var parts = /^(\\d{1,2})[:.](\\d{2})$/.exec(text);
  if (!parts) return 0;                       // empty or not a time — fall back to the duration
  var hours = parseInt(parts[1], 10);
  var minutes = parseInt(parts[2], 10);
  if (hours > 23 || minutes > 59) return 0;   // "25:99" is a typo, not a start time
  var now = new Date();
  var target = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0, 0);
  var seconds = Math.round((target.getTime() - now.getTime()) / 1000);
  if (seconds <= 0) seconds += 24 * 60 * 60;  // already past today — the show starts tomorrow
  return seconds;
}

// An ABSOLUTE DEADLINE in the same field: an ISO 8601 date and time WITH its offset
// ("2026-11-14T19:00:00+02:00", or "Z"), the form a caller writes for "in 5 minutes" so a write
// stays absolute (docs/work-specs/obs-scenes/spec.md, Clocks). It is the same instant on every
// page in every timezone, and a reload re-derives the same number. The ms timestamp, or NaN
// for anything else: a date with no offset is not a deadline (no zone is guessed), and an
// impossible date ("11-31") is a typo, read as an empty field like any other.
function clockDeadlineAt() {
  var m = /^(\\d{4})-(\\d{2})-(\\d{2})T(\\d{2}):(\\d{2})(?::(\\d{2})(?:\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})$/.exec(clockFieldText('${targetFieldId}'));
  if (!m) return NaN;
  var y = +m[1], mo = +m[2], d = +m[3], h = +m[4], mi = +m[5], s = m[6] ? +m[6] : 0;
  var days = new Date(Date.UTC(y, mo, 0)).getUTCDate();    // the month's own length
  if (mo < 1 || mo > 12 || d < 1 || d > days || h > 23 || mi > 59 || s > 59) return NaN;
  return Date.parse(m[0]);
}

// How long to count, right now: a deadline when there is one (0 once it has passed: it holds
// at 0:00, never the duration and never tomorrow), else the start time, else the duration.
function clockSeconds() {
  var at = clockDeadlineAt();
  if (at === at) return Math.max(0, Math.ceil((at - Date.now()) / 1000));
  return clockTargetSeconds() || clockDurationSeconds();
}

// The instant a count just derived from clockSeconds() ends: the deadline itself (now, once it
// has passed), else that many seconds from now.
function clockAnchor() {
  var at = clockDeadlineAt();
  return at === at ? Math.max(at, Date.now()) : Date.now() + clockSecondsLeft * 1000;
}`
    : `
// How long to count, right now. (This design has no start-time field, so it is simply the
// duration — the function exists so every clock reads its length through one name.)
function clockSeconds() {
  return clockDurationSeconds();
}`;

  return `// ── Countdown clock ─────────────────────────────────────────────────────
// The duration lives in the hidden #${minutesFieldId} field (whole minutes; "0.5" = 30 s).
// startClock()/stopClock() are called by the animation preset below.
var clockTimer = null;        // the polling interval while the clock runs
var clockSecondsLeft = 0;     // what renderClock() paints
var clockDeadline = 0;        // ms timestamp the count is anchored to (see the header note)
var clockPaused = false;      // held by pauseClock(): a PAUSED clock is not a stopped one
var clockFinished = false;    // ran out, and holds 0:00 until it is taken out (stopClock)
var clockArmedFrom = null;    // the field text the count was last derived from (see below)

// The raw text of one of the clock's own fields. Reading the TEXT rather than the derived
// seconds is what lets clockDataUpdated() tell "the operator changed the length" from "a
// second went by": a start-time clock derives a different number on every call.
function clockFieldText(id) {
  var source = document.getElementById(id);
  return source ? String(source.textContent).trim() : '';
}

// Everything the clock's length is derived from, as one comparable string.
function clockFieldSignature() {
  return clockFieldText('${minutesFieldId}')${targetFieldId ? ` + '|' + clockFieldText('${targetFieldId}')` : ''};
}

// How many seconds the operator asked for.
function clockDurationSeconds() {
  var source = document.getElementById('${minutesFieldId}');
  var minutes = source ? parseFloat(source.textContent) : NaN;
  if (!(minutes > 0)) minutes = 5;            // blank or nonsense — a sane five minutes
  return Math.max(1, Math.round(minutes * 60));
}
${targetBlock}

// M:SS, or H:MM:SS once there is an hour or more to wait.
function formatClock(total) {
  var hours = Math.floor(total / 3600);
  var minutes = Math.floor((total % 3600) / 60);
  var seconds = total % 60;
  var pad = function (n) { return n < 10 ? '0' + n : String(n); };
  return hours > 0 ? hours + ':' + pad(minutes) + ':' + pad(seconds) : minutes + ':' + pad(seconds);
}

// Paint the remaining time into the clock element. A design without one (a holding screen
// that shows no numbers) simply has nothing to paint — never an error.
function renderClock() {
  var el = document.querySelector('.${prefix}-clock');
  if (el) el.textContent = formatClock(clockSecondsLeft);
  // A design that draws MORE than the digits — a minute ruler, a drain ring, a progress arc —
  // defines this and gets told on the same beat the number changes. It is the one paint point
  // in this runtime, so a hook here fires for the idle preview, every tick, a pause and a
  // resume alike; a design polling on its own would have to guess all four. Guarded, so a
  // countdown that only shows numbers emits nothing extra and behaves exactly as before.
  if (typeof clockPainted === 'function') clockPainted(clockSecondsLeft, clockSeconds());
}

// One tick: recompute from the deadline (self-correcting — see the header), and at zero stop
// and let the design's CSS say "time's up".
function tickClock() {
  clockSecondsLeft = Math.max(0, Math.ceil((clockDeadline - Date.now()) / 1000));
  if (clockSecondsLeft <= 0) {
    stopClock();
    clockFinished = true;
    var root = document.querySelector('.${prefix}');
    if (root) root.classList.add('${prefix}-done');
  }
  renderClock();
}

// Reset to the full length and start counting.
function startClock() {
  stopClock();
  var root = document.querySelector('.${prefix}');
  if (root) root.classList.remove('${prefix}-done');
  clockSecondsLeft = clockSeconds();
  clockArmedFrom = clockFieldSignature();
  clockDeadline = ${anchor};
  renderClock();
  // Polled four times a second so the painted second flips within a quarter second of the
  // real one; the value itself comes from the deadline, so the poll rate is only smoothness.
  clockTimer = setInterval(tickClock, 250);
}

function stopClock() {
  if (clockTimer) { clearInterval(clockTimer); clockTimer = null; }
  clockPaused = false;
  clockFinished = false;
}

// update() calls this after writing the fields (the design's own update() hook). THE LENGTH IS
// DATA: a new value takes effect at once, whether the clock is running, paused, or still idle.
// See the header note for why that is a data change and not a state change.
//
// It re-arms ONLY when the clock's own fields actually changed, which is what makes it safe to
// do on air: an Update that carries a new headline and the same duration must leave the count
// exactly where it is. Anything else would make every text correction restart the clock.
function clockDataUpdated() {
  var signature = clockFieldSignature();
  var changed = signature !== clockArmedFrom;
  clockArmedFrom = signature;

  if (!clockTimer) {
    // Not counting. A PAUSED clock is holding a remaining time the operator chose to freeze, and
    // a FINISHED one holds 0:00 until it is taken out, so both re-derive only when the operator
    // changes the length; an idle one previews it either way. (A finished clock is neither
    // counting nor paused, so without its own flag a caption fix put the full count back.)
    if (!(clockPaused || clockFinished) || changed) {
      clockFinished = false;
      clockSecondsLeft = clockSeconds();
      renderClock();
      // A count put back to a length is not finished: drop the time-up styling rather than
      // painting a fresh number under it. It still waits for the next startClock().
      var idleRoot = document.querySelector('.${prefix}');
      if (idleRoot) idleRoot.classList.remove('${prefix}-done');
    }
    return;
  }

  if (!changed) return;
  // Running: re-anchor the deadline to the new length. The graphic does not move, only the
  // number it is counting down.
  var root = document.querySelector('.${prefix}');
  if (root) root.classList.remove('${prefix}-done');
  clockSecondsLeft = clockSeconds();
  clockDeadline = ${anchor};
  renderClock();
}

// pauseClock()/resumeClock(): hold the count where it is and pick it up again. Unlike
// stopClock()/startClock() these keep the remaining time, which is what an operator means by
// pausing a game clock. The countdown type's machine drives them from a parallel state group.
function pauseClock() {
  if (!clockTimer) return;
  clearInterval(clockTimer);
  clockTimer = null;
  clockPaused = true;             // held, not stopped: clockDataUpdated() reads the difference
  clockSecondsLeft = Math.max(0, Math.ceil((clockDeadline - Date.now()) / 1000));
  renderClock();
}

function resumeClock() {
  if (clockTimer || clockSecondsLeft <= 0) return;
  clockPaused = false;
  clockDeadline = Date.now() + clockSecondsLeft * 1000;   // re-anchor from where it was paused
  clockTimer = setInterval(tickClock, 250);
}

// Show the full length on load (before the first play()), so previews look right.
// This file loads in <head>, before the clock elements exist — wait for the DOM.
function paintIdleClock() {
  clockSecondsLeft = clockSeconds();
  clockArmedFrom = clockFieldSignature();
  renderClock();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', paintIdleClock);
} else {
  paintIdleClock();               // DOM already parsed (e.g. an inline preview build)
}`;
}
