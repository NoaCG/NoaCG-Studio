// THE EASE GRAMMAR AND CURVES, written once. `NOACG_EASE_JS` is plain ES5 that the animation
// interpreter emits inside the ANIMATION region, so every preview, simulator and export carries
// it beside the template's own data. The editor compiles the SAME text once below and samples,
// splits and reverses keys with it, so an ease the editor recognizes plays exactly as sampled
// and GSAP never receives it as a string it would silently replace with its default.
//
// It is a literal string, not Function.toString: a production build would minify a function
// body and change what every exported template carries (src/components/editorFoundation/runtime.ts).
// Keep it ES5 for the oldest playout engine (docs/CLOUD_PLAYOUT.md), without eval.

export const NOACG_EASE_JS = String.raw`// ---- Eases (shared with the editor, which samples, splits and reverses keys with this code) ----
// Capability: shared-ease-v1. noacgEase(text) returns the curve E(p) of an ease string, or null
// when the string is outside this grammar; the interpreter then hands the string to GSAP as it
// always did. A recognized ease reaches GSAP as this function, never as a string it could replace
// with its default.
//   none | linear, power0-4, quad, cubic, quart, quint, strong, sine, expo, circ, bounce, back(s)
//   or elastic(a, p), each with .in, .out or .inOut (bare means .out) | steps(n) | steps(n, true)
//   | cubic-bezier(x1, y1, x2, y2) with x1 and x2 in 0..1
//   | slice(ease, a, b): that ease between a and b, rescaled to run from 0 to 1.
// Named curves repeat GSAP 3.15's formulas in its operation order, so they match it exactly.
var noacgEaseCache = {};
var NOACG_EASE_POWER = { linear: 1, power0: 1, quad: 2, power1: 2, cubic: 3, power2: 3, quart: 4, power3: 4, quint: 5, power4: 5, strong: 5 };
var NOACG_EASE_SHAPED = { sine: 1, expo: 1, circ: 1, bounce: 1, back: 1, elastic: 1 };
var NOACG_EASE_TWO_PI = 2 * Math.PI;
function noacgEaseHas(map, name) { return Object.prototype.hasOwnProperty.call(map, name); }
function noacgEaseNumber(text) {
  return /^\s*[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?\s*$/i.test(text) ? Number(text) : NaN;
}
// An argument list split on its top-level commas: a slice carries a whole ease inside it.
function noacgEaseArgs(text) {
  var parts = [], depth = 0, from = 0;
  for (var i = 0; i < text.length; i++) {
    var c = text.charAt(i);
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(from, i)); from = i + 1; }
  }
  parts.push(text.slice(from));
  return parts;
}

// Describe an ease string, or return null. The text itself is never rewritten.
function noacgEaseParse(text) {
  if (typeof text !== 'string') return null;
  if (text === 'none') return { kind: 'none', text: text };
  var m = /^([a-z][a-z0-9]*(?:-[a-z]+)?)(?:\.(in|out|inOut))?(?:\((.*)\))?$/.exec(text);
  if (!m) return null;
  var name = m[1], side = m[2], called = m[3] !== undefined, args = called ? noacgEaseArgs(m[3]) : [], values = [], i;
  for (i = 0; i < args.length; i++) values.push(noacgEaseNumber(args[i]));
  if (noacgEaseHas(NOACG_EASE_POWER, name) || noacgEaseHas(NOACG_EASE_SHAPED, name)) {
    var most = name === 'back' ? 1 : name === 'elastic' ? 2 : 0;
    if (called && (args.length > most || values.some(function (v) { return !isFinite(v); }))) return null;
    return { kind: 'family', text: text, name: name, side: side || 'out', args: called ? values : [], argText: called ? '(' + m[3] + ')' : '' };
  }
  if (side || !called) return null;
  if (name === 'steps' && args.length <= 2) {
    var count = values[0];
    if (!(count >= 1 && count === Math.floor(count))) return null;
    if (args.length === 2 && args[1].replace(/^\s+|\s+$/g, '') !== 'true') return null;
    return { kind: 'steps', text: text, count: count, start: args.length === 2 };
  }
  if (name === 'cubic-bezier' && args.length === 4) {
    if (values.some(function (v) { return !isFinite(v); })) return null;
    // x1 and x2 inside 0..1 keep time monotonic, so every moment has one value.
    if (!(values[0] >= 0 && values[0] <= 1 && values[2] >= 0 && values[2] <= 1)) return null;
    return { kind: 'bezier', text: text, x1: values[0], y1: values[1], x2: values[2], y2: values[3] };
  }
  if (name === 'slice' && args.length === 3) {
    var base = noacgEaseParse(args[0]), from = values[1], to = values[2];
    if (!base || base.kind === 'slice' || base.kind === 'steps' || !(from >= 0 && from < to && to <= 1)) return null;
    var curve = noacgEaseCurve(base), low = curve(from), high = curve(to);
    // Equal ends leave nothing to rescale: no slice can carry motion between them.
    if (!isFinite(low) || !isFinite(high) || low === high) return null;
    return { kind: 'slice', text: text, base: base, from: from, to: to };
  }
  return null;
}

function noacgEaseBounceOut(t) {
  if (t < 1 / 2.75) return 7.5625 * t * t;
  if (t < 0.7272727272727273) return 7.5625 * Math.pow(t - 1.5 / 2.75, 2) + 0.75;
  if (t < 0.9090909090909092) { var u = t - 2.25 / 2.75; return 7.5625 * u * u + 0.9375; }
  return 7.5625 * Math.pow(t - 2.625 / 2.75, 2) + 0.984375;
}
// CSS cubic-bezier: solve x(s) = p (Newton, then bisection), then read y(s).
function noacgEaseBezier(x1, y1, x2, y2) {
  function at(a, b, s) { return ((1 - 3 * b + 3 * a) * s + 3 * b - 6 * a) * s * s + 3 * a * s; }
  function slope(a, b, s) { return 3 * (1 - 3 * b + 3 * a) * s * s + 2 * (3 * b - 6 * a) * s + 3 * a; }
  return function (p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    var s = p, i, x, d;
    for (i = 0; i < 8; i++) {
      x = at(x1, x2, s) - p;
      if (Math.abs(x) < 1e-12) return at(y1, y2, s);
      d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-9) break;
      s -= x / d;
      if (s < 0 || s > 1) break;
    }
    var low = 0, high = 1;
    for (s = p, i = 0; i < 100; i++) {
      x = at(x1, x2, s);
      if (Math.abs(x - p) < 1e-12) break;
      if (x < p) low = s; else high = s;
      s = (low + high) / 2;
    }
    return at(y1, y2, s);
  };
}

// The curve of a parsed ease. Named families follow GSAP: out(p) = 1 - in(1 - p) unless GSAP
// defines out directly (power, back, elastic, bounce), and inOut joins two halves at 0.5.
function noacgEaseCurve(e) {
  if (e.kind === 'none') return function (p) { return p; };
  if (e.kind === 'bezier') return noacgEaseBezier(e.x1, e.y1, e.x2, e.y2);
  if (e.kind === 'steps') {
    var share = 1 / e.count, levels = e.count + (e.start ? 0 : 1), lift = e.start ? 1 : 0;
    return function (p) { var c = p > 0.99999999 ? 0.99999999 : p < 0 ? 0 : p; return ((levels * c | 0) + lift) * share; };
  }
  if (e.kind === 'slice') {
    var base = noacgEaseCurve(e.base), a = e.from, b = e.to, low = base(a), span = base(b) - low;
    return function (p) { return p === 0 ? 0 : p === 1 ? 1 : (base(a + (b - a) * p) - low) / span; };
  }
  var name = e.name, easeIn, easeOut, easeInOut;
  if (noacgEaseHas(NOACG_EASE_POWER, name)) {
    var r = NOACG_EASE_POWER[name];
    easeIn = r === 1 ? function (p) { return p; } : function (p) { return Math.pow(p, r); };
    easeOut = function (p) { return 1 - Math.pow(1 - p, r); };
    easeInOut = function (p) { return p < 0.5 ? Math.pow(2 * p, r) / 2 : 1 - Math.pow(2 * (1 - p), r) / 2; };
  } else if (name === 'back' || name === 'elastic') {
    if (name === 'back') {
      var s = e.args.length ? e.args[0] : 1.70158;
      easeOut = function (p) { if (!p) return 0; var u = p - 1; return u * u * ((s + 1) * u + s) + 1; };
    } else {
      var type = e.side === 'inOut' ? undefined : e.side, amplitude = e.args[0], period = e.args[1];
      var amp = amplitude >= 1 ? amplitude : 1;
      var per = (period || (type ? 0.3 : 0.45)) / (amplitude < 1 ? amplitude : 1);
      var shift = per / NOACG_EASE_TWO_PI * (Math.asin(1 / amp) || 0), w = NOACG_EASE_TWO_PI / per;
      easeOut = function (p) { return p === 1 ? 1 : amp * Math.pow(2, -10 * p) * Math.sin((p - shift) * w) + 1; };
    }
    easeIn = function (p) { return 1 - easeOut(1 - p); };
    easeInOut = function (p) { return p < 0.5 ? (1 - easeOut(1 - 2 * p)) / 2 : 0.5 + easeOut(2 * (p - 0.5)) / 2; };
  } else {
    if (name === 'bounce') {
      easeOut = noacgEaseBounceOut;
      easeIn = function (p) { return 1 - noacgEaseBounceOut(1 - p); };
    } else {
      easeIn = name === 'sine' ? function (p) { return p === 1 ? 1 : 1 - Math.cos(p * (NOACG_EASE_TWO_PI / 4)); }
        : name === 'expo' ? function (p) { return Math.pow(2, 10 * (p - 1)) * p + p * p * p * p * p * p * (1 - p); }
        : function (p) { return -(Math.sqrt(1 - p * p) - 1); };
      easeOut = function (p) { return 1 - easeIn(1 - p); };
    }
    easeInOut = function (p) { return p < 0.5 ? easeIn(p * 2) / 2 : 1 - easeIn((1 - p) * 2) / 2; };
  }
  return e.side === 'in' ? easeIn : e.side === 'inOut' ? easeInOut : easeOut;
}

// The curve for an ease string, parsed once per string.
function noacgEase(text) {
  var key = '~' + text;
  if (!noacgEaseHas(noacgEaseCache, key)) {
    var parsed = noacgEaseParse(text);
    noacgEaseCache[key] = parsed ? noacgEaseCurve(parsed) : null;
  }
  return noacgEaseCache[key];
}
// What the interpreter hands GSAP: the shared curve when recognized, else the string as before.
function noacgEaseOf(text) { return noacgEase(text) || text; }`;

/** One parsed ease string, as the shared source describes it. */
export type EaseDescription =
  | { kind: 'none'; text: string }
  | { kind: 'family'; text: string; name: string; side: 'in' | 'out' | 'inOut'; args: number[]; argText: string }
  | { kind: 'steps'; text: string; count: number; start: boolean }
  | { kind: 'bezier'; text: string; x1: number; y1: number; x2: number; y2: number }
  | { kind: 'slice'; text: string; base: EaseDescription; from: number; to: number };

type SharedEase = { parse(text: string): EaseDescription | null; ease(text: string): ((p: number) => number) | null };
let compiled: SharedEase | undefined;
/** The emitted source compiled once, lazily, so a fault surfaces at first use rather than at boot. */
function shared(): SharedEase {
  return compiled ??= new Function(`${NOACG_EASE_JS}\nreturn { parse: noacgEaseParse, ease: noacgEase };`)() as SharedEase;
}

/** The curve E(p) of an ease string, or null when it is outside the shared grammar. */
export const easeCurve = (text: string) => shared().ease(text);
/** The shared description of an ease string, or null. */
export const parseEase = (text: string) => shared().parse(text);
/** Forms only the shared runtime can play: an interpreter without it would hand them to GSAP. */
export function needsEaseRuntime(text: string): boolean {
  const kind = parseEase(text)?.kind;
  return kind === 'bezier' || kind === 'slice';
}

/** Numbers in written forms: twelve significant digits, so 1 - 0.7 is written 0.3. */
const written = (n: number) => String(Number(n.toPrecision(12)) || 0);

export const IRREVERSIBLE_EASE = 'This entrance uses an ease that cannot yet be reversed exactly. Its source is preserved.';
export const SAME_VALUE = 'This part of the curve starts and ends at the same value, so no exact ease can carry its motion. Its source is preserved.';

function mirrored(e: EaseDescription): string | null {
  if (e.kind === 'none') return e.text;
  if (e.kind === 'steps') return null; // A jump lands on the other side of its instant when reversed.
  if (e.kind === 'bezier') return `cubic-bezier(${written(1 - e.x2)},${written(1 - e.y2)},${written(1 - e.x1)},${written(1 - e.y1)})`;
  if (e.kind === 'slice') {
    const base = mirrored(e.base);
    return base && `slice(${base},${written(1 - e.to)},${written(1 - e.from)})`;
  }
  // GSAP defines each .out as 1 - in(1 - p): swapping the side IS the mirror. inOut and the
  // exponent-1 family are symmetric already.
  if (e.side === 'inOut' || e.name === 'linear' || e.name === 'power0') return e.text;
  return `${e.name}.${e.side === 'in' ? 'out' : 'in'}${e.argText}`;
}

/** E_rev(u) = 1 - E(1 - u), written in the shared grammar; throws when no exact form exists. */
export function mirrorEase(text: string): string {
  const e = parseEase(text), result = e && mirrored(e);
  if (!result || !parseEase(result)) throw new Error(IRREVERSIBLE_EASE);
  return result;
}

/** The part of an ease between `from` and `to`, rescaled to 0..1 (a slice of a slice flattens). */
export function sliceEase(text: string, from: number, to: number): string {
  const e = parseEase(text);
  if (!e || e.kind === 'steps') throw new Error(`The ease "${text}" has no exact split form yet. Its source is preserved.`);
  const base = e.kind === 'slice' ? e.base : e;
  const a = e.kind === 'slice' ? e.from + (e.to - e.from) * from : from;
  const b = e.kind === 'slice' ? e.from + (e.to - e.from) * to : to;
  if (a === 0 && b === 1) return base.text;
  const curve = easeCurve(base.text)!, result = `slice(${base.text},${written(a)},${written(b)})`;
  // Ends that meet (or all but meet, where rescaling would amplify rounding) carry no motion.
  if (!(Math.abs(curve(b) - curve(a)) >= 1e-9) || !parseEase(result)) throw new Error(SAME_VALUE);
  return result;
}
