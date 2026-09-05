// THE ONE PAINT RUNTIME for behaviour on imported artwork (docs/SVG_BEHAVIOUR_PLAN.md §6a).
//
// Emitted ES5, once, into every imported template that carries a NOACG_BEHAVIOUR table
// (blocks/behaviourData.ts), in design-owned JS outside the marked ANIMATION region - the same
// posture as the growth runtime and the shared clock engine. It does four things and nothing
// recipe-specific:
//
//   1. noacgRepaint() reads the machine's pointers and every field the table names, asks each
//      field's KIND for its facts and derivations, evaluates every paint rule, and applies the
//      result: looks by class, gauges by a scale measured at rest, readouts by text.
//   2. The FIELD-KIND LIBRARY - `row-pick`, `select`, `number`, `share`, `clock`, `vote-status`
//      - each a small function from a holder's text to facts and derived values. This is the one
//      place a comparison lives, and it is not authorable: a recipe names a fact, never a test.
//   3. Three DRIVERS, because five behaviours needed all three: a state entry (every recipe
//      state's timeline calls noacgRepaint), a data write (update() calls noacgRepaintData) and
//      the clock's own tick (clockPainted calls noacgRepaintTick).
//   4. Measurement AT REST for gauges - measure once, remember, never re-read a pose an earlier
//      pass moved (the lesson the vote board's bars and the growth runtime both paid for).
//
// A recipe adds no JS. If a new behaviour needs a line here, it is a missing field kind.
//
// CLASSES, NEVER INLINE STYLES, for a look: a snap clears inline styles but never classes, so a
// look painted inline would vanish on recovery while the machine still held it (the trap
// quiz/shared.ts documents, paid for once).

import { motionSpeedJs } from '../shared/base';
import { BEHAVIOUR_ROLE_ATTR, serializeBehaviourData, type BehaviourData } from '../../blocks/behaviourData';
import { BAR_GROW, BAR_STAGGER } from '../poll/pollMotion';
import { PREFIX } from './shared';

/** The class every drawn LOOK carries - hidden, waiting for its rule. One pair for every recipe
 *  from now on; the per-behaviour pairs of the module era live only in files already exported. */
export const LOOK_CLASS = `${PREFIX}-look`;
/** Added beside LOOK_CLASS while the look is showing. */
export const LOOK_ON_CLASS = `${PREFIX}-on`;

/** The two rules that make a drawn layer a look. `inline` rather than `block`: these are SVG
 *  elements, and inline is the initial value SVG content is laid out with. */
export const lookCss = `/* ── Drawn looks (the behaviour) ──
   Each layer below is artwork the DESIGNER drew for one moment - a pick, a lock, a verdict, a
   flash, a badge. NoaCG only decides when each is visible, by the rules in NOACG_BEHAVIOUR in
   template.js; nothing here is redrawn or generated. Delete the first rule to see every look
   at once. */
.${LOOK_CLASS} {
  display: none;                   /* drawn, and waiting for its rule */
}
.${LOOK_CLASS}.${LOOK_ON_CLASS} {
  display: inline;                 /* SVG content lays out inline - never block */
  visibility: visible;             /* beats the exporter's own hiding class (two classes win) */
}`;

/** THE UPGRADE GATE for the table: true when the template carries this runtime. A table must
 *  never be written under a template that lacks it (the frozen-interpreter pairing rule,
 *  docs/STATE_MACHINE_SCHEMA.md §5); the validator refuses the pair. */
export function hasBehaviourRuntime(js: string): boolean {
  return /function noacgRepaint\(/.test(js);
}

const DATA_HEADER = `// ── The behaviour binding, as DATA ──────────────────────────────────────────
// Which layer plays which ROLE is stamped on the artwork itself (data-noacg-role="…"); this
// table says what each role means: "fields" is the fN each role compiled to, "kinds" is what
// the runtime treats a field as (a row pick, a share of a vote, a clock), and "paint" is the
// rules - a LOOK shows while any of its rules holds (any of the listed states, and all of the
// listed field facts), a GAUGE is scaled by the value a field derives, a WRITE prints one.
// Edit a rule and press Update. The runtime below reads this and nothing else.`;

/** The table, emitted. */
export function behaviourDataJs(data: BehaviourData): string {
  return `${DATA_HEADER}
var NOACG_BEHAVIOUR = ${serializeBehaviourData(data)};
`;
}

/**
 * The runtime. `withClock` emits the clock's own paint hook, so a tick repaints; only a design
 * whose table names a clock kind asks for it (a second definition would shadow a catalog one).
 */
export function behaviourRuntimeJs(withClock: boolean): string {
  return `
// ── The behaviour runtime ───────────────────────────────────────────────────
// Reads NOACG_BEHAVIOUR (above) and the machine's state, and paints YOUR drawings: a look is
// shown or hidden by class, a gauge is scaled from the length you drew it at, a readout is
// written. Nothing here is specific to a quiz, a score board or a vote - the table is.

${motionSpeedJs}

// What the runtime remembers between repaints: measured gauge lengths (at rest, once), each
// number field's last value and which one rose most recently, and a finished clock's length.
var noacgBehaviourMemory = { gauges: {}, numbers: {}, rose: {}, clockRanOut: 0 };

// noacgRoleEls(role, key): every layer stamped with this role token.
function noacgRoleToken(role, key) {
  return key ? role + '/' + key : role;
}
function noacgRoleEls(role, key) {
  var token = noacgRoleToken(role, key).replace(/"/g, '');
  return document.querySelectorAll('[${BEHAVIOUR_ROLE_ATTR}~="' + token + '"]');
}

// noacgFieldText(id): a field's value as text. Through svgFitValue where the fit ladder is
// present, because a wrapped block holds its value one tspan per line.
function noacgFieldText(id) {
  var el = document.getElementById(id);
  if (!el) return '';
  var text = typeof svgFitValue === 'function' ? svgFitValue(el) : el.textContent;
  return String(text === null || text === undefined ? '' : text);
}

function noacgRowsOf(name) {
  return (NOACG_BEHAVIOUR.rows && NOACG_BEHAVIOUR.rows[name]) || [];
}

function noacgKindOf(fieldId) {
  return (NOACG_BEHAVIOUR.kinds && NOACG_BEHAVIOUR.kinds[fieldId]) || { kind: 'text' };
}

// ── The field kinds ─────────────────────────────────────────────────────────
// Each kind answers two questions about one field: fact(name, rowKey) - does this named truth
// hold (for this row) - and derive(name, rowKey) - a value the field derives. The comparisons
// live here and nowhere else.

var noacgKinds = {};

noacgKinds.text = {
  fact: function () { return false; },
  derive: function (id, spec, name) { return name === 'text' ? noacgFieldText(id) : null; }
};

// select: a dropdown. The one fact is "is:<value>".
noacgKinds.select = {
  fact: function (id, spec, name) {
    if (name.indexOf('is:') !== 0) return false;
    return noacgFieldText(id).trim().toLowerCase() === name.slice(3).toLowerCase();
  },
  derive: noacgKinds.text.derive
};

// row-pick: a dropdown over a row set's keys. "picked" holds on the row the value names;
// "unpicked" on every OTHER row the value could have named - never on any row when nothing
// is picked, so an empty key reveals no verdict rather than marking every row wrong.
noacgKinds['row-pick'] = {
  fact: function (id, spec, name, rowKey) {
    var value = noacgFieldText(id).trim().toUpperCase();
    var keys = noacgRowsOf(spec.rows);
    var named = value !== '' && keys.indexOf(value) !== -1;
    if (name === 'picked') return named && value === rowKey;
    if (name === 'unpicked') return named && value !== rowKey;
    return false;
  },
  derive: noacgKinds.text.derive
};

// number: a figure. "moved" holds on the field that ROSE most recently within its group (a
// score board's rows) - latched until another rises, so a repaint that changes nothing keeps the
// flash where it was; "zero" holds at 0.
function noacgNumberOf(id) {
  return parseInt(noacgFieldText(id).replace(/[^0-9-]/g, ''), 10) || 0;
}
noacgKinds.number = {
  fact: function (id, spec, name) {
    if (name === 'moved') return noacgBehaviourMemory.rose[spec.group || id] === id;
    if (name === 'zero') return noacgNumberOf(id) === 0;
    return false;
  },
  derive: function (id, spec, name) { return name === 'text' ? noacgFieldText(id) : name === 'value' ? noacgNumberOf(id) : null; }
};

// noacgRememberNumbers(): compare every number field against its last value and latch the one
// that rose, then remember them all. Runs at the START of every repaint, so a payload that rode
// an event has already landed when the flash rule asks which row it was.
function noacgRememberNumbers() {
  var kinds = NOACG_BEHAVIOUR.kinds || {};
  for (var id in kinds) {
    if (!Object.prototype.hasOwnProperty.call(kinds, id) || kinds[id].kind !== 'number') continue;
    var now = noacgNumberOf(id);
    var last = noacgBehaviourMemory.numbers[id];
    if (last !== undefined && now > last) noacgBehaviourMemory.rose[kinds[id].group || id] = id;
    noacgBehaviourMemory.numbers[id] = now;
  }
}

// share: a "Label | count" list, one line per row (the vote's wire). Facts: "leader" on the row
// with the most votes - never on a tie, because a projected winner picked from two equal rows is
// untrue - and "listed" on a row the list has a line for. Derives each row's label, its share of
// the whole (0..1) and that share as a percentage; and REPORTS a list longer than the rows the
// designer drew through the fit ladder's own too-long channel, so the operator hears about a
// round the board cannot hold before the take.
function noacgShareRows(id) {
  var out = [];
  var lines = noacgFieldText(id).split('\\n');
  for (var i = 0; i < lines.length; i++) {
    var raw = lines[i].trim();
    if (raw === '') continue;
    var at = raw.lastIndexOf('|');
    var label = at === -1 ? raw : raw.slice(0, at).trim();
    var count = at === -1 ? 0 : parseFloat(raw.slice(at + 1).replace(/[^0-9.\\-]/g, ''));
    out.push({ label: label, count: isNaN(count) ? 0 : Math.max(0, count) });
  }
  return out;
}
function noacgShareLeader(rows) {
  var best = -1, at = -1, tied = false;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].count > best) { best = rows[i].count; at = i; tied = false; }
    else if (rows[i].count === best) tied = true;
  }
  return at === -1 || tied || best <= 0 ? -1 : at;
}
function noacgPercentText(percent) {
  var rounded = Math.round(percent * 10) / 10;
  return (rounded % 1 === 0 ? rounded.toFixed(0) : rounded.toFixed(1)) + '%';
}
noacgKinds.share = {
  fact: function (id, spec, name, rowKey) {
    var rows = noacgShareRows(id);
    var keys = noacgRowsOf(spec.rows);
    var at = keys.indexOf(rowKey);
    if (name === 'listed') return at !== -1 && at < rows.length;
    if (name === 'leader') {
      var lead = noacgShareLeader(rows);
      // The winner may be a row this board never drew; there is no honest mark for that.
      return lead !== -1 && lead < keys.length && lead === at;
    }
    return false;
  },
  derive: function (id, spec, name, rowKey) {
    var rows = noacgShareRows(id);
    var keys = noacgRowsOf(spec.rows);
    var at = keys.indexOf(rowKey);
    var total = 0;
    for (var i = 0; i < rows.length; i++) total += rows[i].count;
    var row = at === -1 ? null : rows[at];
    var share = row && total > 0 ? row.count / total : 0;
    if (name === 'label') return row ? row.label : '';
    if (name === 'share') return share;
    if (name === 'percent') return noacgPercentText(share * 100);
    return null;
  },
  report: function (id, spec) {
    if (typeof svgFitOver === 'undefined') return;
    svgFitOver[id] = noacgShareRows(id).length > noacgRowsOf(spec.rows).length;
  }
};

// vote-status: an "open" / "closed" token a controller writes (docs/OGRAF_STATE_IN_FIELDS.md).
// Empty means "not stated", and then - and only then - the human count line in the fallback
// field is read, so a board exported before the token existed still closes on the sentence it
// always closed on. A stated value that is neither token reads as CLOSED: a board wrongly
// inviting votes nobody counts is the worse failure.
noacgKinds['vote-status'] = {
  fact: function (id, spec, name) {
    var status = noacgFieldText(id).trim().toLowerCase();
    var closed = status !== '' ? status !== 'open' : /voting\\s+closed/i.test(spec.fallback ? noacgFieldText(spec.fallback) : '');
    if (name === 'closed') return closed;
    if (name === 'open') return !closed;
    return false;
  },
  derive: noacgKinds.text.derive
};

// clock: the shared countdown engine's own numbers (templates/shared/clock.ts). Facts: "warning"
// inside the threshold the warnAt field holds, "expired" at zero; derives "fraction", the share
// of the count still to run. ONCE IT HAS RUN OUT IT STAYS RUN OUT (owner ruling: at zero it
// holds at 0:00 until taken out) - an unrelated update re-derives the full length in the shared
// runtime, and this refuses to repaint that; a NEW length is the one thing that un-finishes it.
noacgKinds.clock = {
  left: function () { return typeof clockSecondsLeft === 'number' ? clockSecondsLeft : 0; },
  total: function () { return typeof clockSeconds === 'function' ? clockSeconds() : 0; },
  ranOut: function () {
    var total = this.total();
    var memory = noacgBehaviourMemory;
    if (memory.clockRanOut > 0) {
      if (total === memory.clockRanOut) return true;
      memory.clockRanOut = 0;
    }
    if (this.left() <= 0) memory.clockRanOut = total;
    return this.left() <= 0;
  },
  fact: function (id, spec, name) {
    var up = this.ranOut();
    if (name === 'expired') return up;
    if (name === 'warning') {
      var warn = spec.warnAt ? parseFloat(noacgFieldText(spec.warnAt)) : NaN;
      if (!(warn >= 0)) warn = 10;
      return !up && this.left() <= warn;
    }
    return false;
  },
  derive: function (id, spec, name) {
    if (name !== 'fraction') return null;
    var total = this.total();
    var share = total > 0 ? this.left() / total : 0;
    return share < 0 ? 0 : share > 1 ? 1 : share;
  },
  // noacgClockReset(): Reset. Stop the count, put it back to the length the operator asked for,
  // and forget that it ran out - so the plate and the bar the last run left can be repainted.
  reset: function () {
    noacgBehaviourMemory.clockRanOut = 0;
    if (typeof stopClock === 'function') stopClock();
    var root = document.querySelector('.${PREFIX}');
    if (root) root.classList.remove('${PREFIX}-done');
    if (typeof paintIdleClock === 'function') paintIdleClock();
  }
};
function noacgClockReset() { noacgKinds.clock.reset(); }

// ── Conditions ──────────────────────────────────────────────────────────────

function noacgFactHolds(token, rowKey) {
  var at = token.indexOf(':');
  var id = token.slice(0, at);
  var name = token.slice(at + 1);
  var spec = noacgKindOf(id);
  var kind = noacgKinds[spec.kind];
  return kind ? !!kind.fact(id, spec, name, rowKey) : false;
}

function noacgDerive(token, rowKey) {
  var at = token.indexOf(':');
  var id = token.slice(0, at);
  var name = token.slice(at + 1);
  var spec = noacgKindOf(id);
  var kind = noacgKinds[spec.kind];
  return kind ? kind.derive(id, spec, name, rowKey) : null;
}

// noacgHolds(when, rowKey): the two-slot condition. Any of the states, and all of the facts.
function noacgHolds(when, rowKey) {
  if (!when) return true;
  if (when.state && when.state.length > 0) {
    var groups = typeof noacgMachineState === 'function' ? noacgMachineState().groups || {} : {};
    var any = false;
    for (var i = 0; i < when.state.length; i++) {
      var pair = when.state[i].split('/');
      if (groups[pair[0]] === pair[1]) { any = true; break; }
    }
    if (!any) return false;
  }
  var facts = when.facts || [];
  for (var j = 0; j < facts.length; j++) {
    if (!noacgFactHolds(facts[j], rowKey)) return false;
  }
  return true;
}

// ── Applying ────────────────────────────────────────────────────────────────

// noacgLookShow(el, on): one drawn look, visible or not. Classes only (see the header).
function noacgLookShow(el, on) {
  var was = el.classList.contains('${LOOK_ON_CLASS}');
  if (on) el.classList.add('${LOOK_ON_CLASS}');
  else el.classList.remove('${LOOK_ON_CLASS}');
  // A LOOK THAT HAS JUST APPEARED IS NEWLY MEASURABLE: until now it was display:none, so any
  // text bound inside it had no box and the fit ladder left it owed a measurement. Pay it now,
  // for this layer, not the whole document.
  if (on && !was && typeof svgFitDue === 'function' && svgFitDue(el) && typeof fitSvgText === 'function') fitSvgText();
  return on && !was;
}

// noacgPop(el): the small platform pop when a look lands on a state entry - a flash, a winner
// mark. The drawing is the designer's; the pop is ours.
function noacgPop(el) {
  if (typeof gsap === 'undefined') return;
  gsap.fromTo(el, { scale: 1.04 }, { scale: 1, duration: 0.3 / motionSpeed(), ease: 'back.out(2)' });
}

// noacgGaugeFull(el): the layer as the designer drew it, which is what 100% means. Measured at
// rest, once, and only a REAL measurement is remembered: getBBox throws in some engines and
// answers zero in others while the element is unlaid-out, and caching that would retire the
// gauge for the life of the page.
function noacgGaugeFull(el, token) {
  var memory = noacgBehaviourMemory.gauges;
  if (memory[token] > 0) return memory[token];
  var w = el.hasAttribute('width') ? parseFloat(el.getAttribute('width')) : NaN;
  if (isNaN(w) || !(w > 0)) {
    try { w = el.getBBox().width; } catch (e) { w = 0; }
  }
  if (w > 0) memory[token] = w;
  return w > 0 ? w : 0;
}

// noacgGauge(el, token, share, motion): one gauge at one share. A RECTANGLE'S WIDTH IS SET,
// NEVER ITS SCALE - scaling squashes a rounded cap; anything else the designer drew is scaled
// about its own left edge, so it grows or drains from where it starts.
function noacgGauge(el, token, share, motion) {
  var full = noacgGaugeFull(el, token);
  if (!(full > 0) || typeof gsap === 'undefined') return;
  if (share < 0) share = 0;
  if (share > 1) share = 1;
  var to;
  if (el.hasAttribute('width')) to = { attr: { width: full * share } };
  else {
    var box;
    try { box = el.getBBox(); } catch (e) { return; }
    to = { scaleX: share, svgOrigin: box.x + ' ' + (box.y + box.height / 2) };
  }
  if (!motion) return gsap.set(el, to);
  to.duration = motion.duration; to.ease = motion.ease; to.delay = motion.delay || 0;
  if (motion.overwrite) to.overwrite = true;
  gsap.to(el, to);
}

// How a gauge travels, by what drives it. A SHARE (a vote) grows on the vote board's numbers -
// ${BAR_GROW}s per bar, ${BAR_STAGGER}s between them, power3.out, never an overshoot - and only
// on a DATA repaint: the graphic arriving is not a change in the vote, and a bar that travelled
// on the entrance would open every vote collapsing from full. A CLOCK fraction drains linearly
// over the tick interval, whatever the motion knob says: it is a picture of the clock, not
// motion, and an eased or slowed drain would disagree with the digits beside it.
function noacgGaugeMotion(token, reason, row) {
  var spec = noacgKindOf(token.slice(0, token.indexOf(':')));
  if (spec.kind === 'clock') return { duration: 0.25, ease: 'none', overwrite: true };
  if (reason !== 'data') return null;
  var speed = motionSpeed();
  return { duration: ${BAR_GROW} / speed, ease: 'power3.out', delay: (row * ${BAR_STAGGER}) / speed };
}

// noacgRepaintWith(reason): the whole graphic, from the table. ONE function for every driver,
// so a state entry, a data write, a tick and a snap recovery cannot describe the same board
// four different ways - they differ only in what travels.
function noacgRepaintWith(reason) {
  if (typeof NOACG_BEHAVIOUR === 'undefined') return;
  noacgRememberNumbers();
  var kinds = NOACG_BEHAVIOUR.kinds || {};
  for (var kid in kinds) {
    if (Object.prototype.hasOwnProperty.call(kinds, kid) && noacgKinds[kinds[kid].kind] && noacgKinds[kinds[kid].kind].report) {
      noacgKinds[kinds[kid].kind].report(kid, kinds[kid]);
    }
  }
  var rules = NOACG_BEHAVIOUR.paint || [];
  // Looks first: any rule naming a token turns it on; a token no rule holds for goes off.
  var lit = {}, pops = {}, seen = {};
  var r, rule, keys, k;
  for (r = 0; r < rules.length; r++) {
    rule = rules[r];
    if (!rule.look) continue;
    keys = rule.rows ? noacgRowsOf(rule.rows) : [null];
    for (k = 0; k < keys.length; k++) {
      var token = noacgRoleToken(rule.look, keys[k]);
      seen[token] = true;
      if (noacgHolds(rule.when, keys[k])) {
        lit[token] = true;
        if (rule.enter === 'pop' && reason === 'state') pops[token] = true;
      }
    }
  }
  for (var t in seen) {
    if (!Object.prototype.hasOwnProperty.call(seen, t)) continue;
    var slash = t.indexOf('/');
    var els = noacgRoleEls(slash === -1 ? t : t.slice(0, slash), slash === -1 ? null : t.slice(slash + 1));
    for (var e = 0; e < els.length; e++) {
      noacgLookShow(els[e], !!lit[t]);
      if (lit[t] && pops[t]) noacgPop(els[e]);
    }
  }
  // Gauges and readouts: from the data, every time.
  for (r = 0; r < rules.length; r++) {
    rule = rules[r];
    if (!rule.gauge && !rule.write) continue;
    keys = rule.rows ? noacgRowsOf(rule.rows) : [null];
    for (k = 0; k < keys.length; k++) {
      var targets = noacgRoleEls(rule.gauge || rule.write, keys[k]);
      if (targets.length === 0) continue;
      var value = noacgDerive(rule.from, keys[k]);
      for (var g = 0; g < targets.length; g++) {
        if (rule.gauge) noacgGauge(targets[g], noacgRoleToken(rule.gauge, keys[k]), typeof value === 'number' ? value : 0, noacgGaugeMotion(rule.from, reason, k));
        // A readout with nothing to say is left as drawn - an empty round must not blank a
        // board the designer filled in.
        else if (value !== null && value !== undefined && value !== '') targets[g].textContent = String(value);
      }
    }
  }
}

// noacgRepaint(): a STATE was entered - named by every recipe state's timeline. Snap replays
// states with callbacks suppressed and then runs the target's own calls, so this is also what
// puts the drawings back after a recovery.
function noacgRepaint() { noacgRepaintWith('state'); }
// noacgRepaintData(): update() wrote fields. A vote landing moves the bars without any
// transition firing; a live edit never erases a look the machine still holds.
function noacgRepaintData() { noacgRepaintWith('data'); }
// noacgRepaintTick(): the clock's own beat, with neither a state nor a write.
function noacgRepaintTick() { noacgRepaintWith('tick'); }${withClock ? `
// clockPainted(): the shared clock runtime's paint hook (templates/shared/clock.ts) - the idle
// preview, every tick, a pause, a resume and an Update all pass through it, so everything the
// count drives is decided on one beat.
function clockPainted() { noacgRepaintTick(); }` : ''}
`;
}
