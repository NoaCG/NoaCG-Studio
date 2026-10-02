// Pub Quiz - SPX calls update(), play(), stop(), next(). ES5 only (CasparCG's Chromium).
//
// What the operator does live: Take shows the question, "Start timer" runs the countdown
// (length from the hidden Timer seconds field), "Reveal answer" (or Continue) lights the
// correct row and dims the other three, Out clears.

function motionSpeed() {
  if (typeof NOACG_ANIM !== 'undefined' && NOACG_ANIM.speed) return NOACG_ANIM.speed;
  return 1;
}

// Text fields get plain text: operator input never runs as markup.
function setFieldValue(el, value) {
  if (el.tagName === 'IMG') {
    if (value) { el.src = value; el.style.display = ''; }
    else { el.removeAttribute('src'); el.style.display = 'none'; }
  } else {
    el.textContent = (value == null) ? '' : String(value);
  }
}

function quizText(id) {
  var el = document.getElementById(id);
  return el ? String(el.textContent || '').trim() : '';
}

function quizState(group) {
  if (typeof noacgMachineState !== 'function') return '';
  var groups = noacgMachineState().groups || {};
  return groups[group] || '';
}

// ---- Word sources: the broadcaster's words for ROUND, QUESTION and TIME'S UP ----
function paintWord(selector, fieldId) {
  var shown = document.querySelector(selector);
  if (shown) shown.textContent = quizText(fieldId);
}
function paintWords() {
  paintWord('.quiz-round-word', 'f9');
  paintWord('.quiz-qnum-word', 'f10');
  paintWord('.quiz-timer-word', 'f11');
}

// ---- The reveal ----
// quizRow(letter): the answer row a letter names, or null. The empty string is not a letter
// ('ABCD'.indexOf('') is 0), so it is rejected before the lookup.
function quizRow(letter) {
  var name = String(letter || '').trim().toUpperCase();
  var index = (name.length === 1) ? 'ABCD'.indexOf(name) : -1;
  var rows = document.querySelectorAll('.quiz-option');
  return index === -1 ? null : (rows[index] || null);
}

function clearReveal() {
  var rows = document.querySelectorAll('.quiz-option');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.remove('quiz-correct');
    rows[i].classList.remove('quiz-dim');
  }
}

// revealAnswer(): light the correct row, dim the other three. Safe to run twice (snap).
// The reveal also ends a running timer: time is up once the answer is out.
function revealAnswer() {
  var correct = quizRow(quizText('f5'));
  if (!correct) return;                       // no correct letter set: change nothing on air
  clearReveal();
  var rows = document.querySelectorAll('.quiz-option');
  for (var i = 0; i < rows.length; i++) {
    rows[i].classList.add(rows[i] === correct ? 'quiz-correct' : 'quiz-dim');
  }
  gsap.fromTo(correct, { scale: 1.08, rotation: -1.5 },
    { scale: 1, rotation: 0, duration: 0.55 / motionSpeed(), ease: 'back.out(2.2)' });
  if (quizState('timer') === 'running' && typeof noacgDispatch === 'function') noacgDispatch('timerEnd');
}

// Repaint from the machine state after a data write. A typo fix in the question never
// re-pops the reveal; a corrected answer letter moves the mark to the right row at once.
function paintQuizState() {
  if (quizState('main') === 'reveal') {
    var marked = document.querySelector('.quiz-option.quiz-correct');
    if (!marked || marked !== quizRow(quizText('f5'))) revealAnswer();
  } else {
    clearReveal();
  }
}

// ---- The timer (its own state group: idle -> running -> done) ----
var quizTimerInterval = null;
var quizTimerEnd = 0;
var quizTimerShown = -1;

function timerSeconds() {
  var n = parseInt(quizText('f8'), 10);
  return (n > 0 && n <= 3600) ? n : 30;
}

function paintTimer(seconds) {
  var root = document.querySelector('.quiz');
  var num = document.querySelector('.quiz-timer-num');
  if (num) num.textContent = String(seconds);
  if (root) root.classList.toggle('quiz-hurry', seconds > 0 && seconds <= 5);
  if (seconds !== quizTimerShown && seconds > 0 && seconds <= 5 && num) {
    gsap.fromTo(num, { scale: 1.3 }, { scale: 1, duration: 0.4 / motionSpeed(), ease: 'back.out(2)' });
  }
  quizTimerShown = seconds;
}

function stopTimerClock() {
  if (quizTimerInterval) { clearInterval(quizTimerInterval); quizTimerInterval = null; }
  gsap.killTweensOf('.quiz-timebar-fill');
}

function timerTick() {
  var left = Math.ceil((quizTimerEnd - Date.now()) / 1000);
  if (left <= 0) {
    paintTimer(0);
    stopTimerClock();                           // cleared first, so timerEnd is sent once
    if (typeof noacgDispatch === 'function') noacgDispatch('timerEnd');
    return;
  }
  if (left !== quizTimerShown) paintTimer(left);
}

// The "running" state's call.
function startTimer() {
  stopTimerClock();
  var seconds = timerSeconds();
  var root = document.querySelector('.quiz');
  if (root) root.classList.remove('quiz-timeup');
  quizTimerShown = -1;
  quizTimerEnd = Date.now() + seconds * 1000;
  paintTimer(seconds);
  gsap.fromTo('.quiz-timebar-fill', { scaleX: 1 }, { scaleX: 0, duration: seconds, ease: 'none' });
  quizTimerInterval = setInterval(timerTick, 100);
}

// The "done" state's call: freeze the clock and show the time-up word.
function stopTimer() {
  stopTimerClock();
  var root = document.querySelector('.quiz');
  if (root) {
    root.classList.remove('quiz-hurry');
    root.classList.add('quiz-timeup');
  }
  paintWords();
}

// The first step's call: Take puts every group back to its initial state without undoing what
// the timer's timelines left, so the resting look is restored here.
function resetOnTake() {
  stopTimerClock();
  var root = document.querySelector('.quiz');
  if (root) {
    root.classList.remove('quiz-timeup');
    root.classList.remove('quiz-hurry');
  }
  gsap.set(['.quiz-timer', '.quiz-timebar'], { opacity: 0 });
  gsap.set('.quiz-timebar-fill', { scaleX: 1 });
  quizTimerShown = -1;
  paintTimer(timerSeconds());
  clearReveal();
  paintWords();
}

// ---- The lifecycle ----
function update(data) {
  var fields = (typeof data === 'string') ? JSON.parse(data) : data;
  for (var key in fields) {
    var el = document.getElementById(key);
    if (el) setFieldValue(el, fields[key]);
  }
  paintWords();
  if (!quizTimerInterval && quizState('timer') !== 'done') paintTimer(timerSeconds());
  paintQuizState();
}

function play() {
  gsap.killTweensOf('*');
  stopTimerClock();
  clearReveal();
  buildInTimeline();
}

function stop() {
  gsap.killTweensOf('*');
  stopTimerClock();
  buildOutTimeline();
}

function next() {
  return (typeof revealNextStep === 'function') ? revealNextStep() : null;
}

// template.js loads in <head>: paint the words once the markup exists.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () { paintWords(); paintTimer(timerSeconds()); });
} else {
  paintWords();
  paintTimer(timerSeconds());
}

/* == ANIMATION (generated — the Animation panel rewrites this block) == */
// The graphic's animation as DATA. Steps play in order — the first on ▶ play(), each
// middle step on one » next() press (SPX Continue), the last on ■ stop(). Each layer's
// properties are keyframe lists on the step's local clock: { "time", "value", "ease" }.
// "reveals" names the layers that first become visible in that step; "hides" names the
// layers that leave in it; "calls" fires named template functions (a clock engine's
// startClock/stopClock) at their moment on the step's clock; "loops" makes a layer's track
// repeat (repeat -1 = forever, yoyo = breathe back and forth); "dynamics" adds MEASURED
// motion — a named builder function (defined below, outside this block) reads the DOM and
// returns the tween, which is how a marquee travels exactly one track-width no matter how
// much text the operator types. An optional "machine" adds a STATE GRAPH over the steps:
// parallel groups of states (each state's content is a timeline — the steps are the default
// path's, in order), transitions fired by operator events (noacgDispatch) or timers, and
// instant snap to any state (noacgSnap). Without it the steps ARE the machine: a linear
// walk driven by play/next/stop. The timeline UI reads and writes this block — and so can
// you: edit a number and press play.
// Two groups. "main" is the lifecycle: Take shows the question, Reveal answer (or Continue)
// lights the correct row, Out clears. "timer" runs beside it: Start timer, Stop timer, and the
// runtime sends timerEnd itself when the count reaches zero or the answer is revealed.
var NOACG_ANIM = {
  "version": 2,
  "root": ".quiz",
  "speed": 1,
  "steps": [
    {
      "name": "Question",
      "duration": 1.45,
      "ease": "power3.out",
      "calls": [
        { "time": 0, "call": "resetOnTake" }
      ],
      "layers": {
        ".quiz-box": {
          "opacity": [
            { "time": 0, "value": 0 },
            { "time": 0.4, "value": 1 }
          ],
          "y": [
            { "time": 0, "value": 48 },
            { "time": 0.55, "value": 0 }
          ],
          "scale": [
            { "time": 0, "value": 0.94 },
            { "time": 0.55, "value": 1, "ease": "back.out(1.6)" }
          ]
        },
        ".quiz-chip-round": {
          "opacity": [
            { "time": 0.25, "value": 0 },
            { "time": 0.5, "value": 1 }
          ],
          "y": [
            { "time": 0.25, "value": -36 },
            { "time": 0.65, "value": 0, "ease": "back.out(2)" }
          ]
        },
        ".quiz-chip-qnum": {
          "opacity": [
            { "time": 0.35, "value": 0 },
            { "time": 0.6, "value": 1 }
          ],
          "y": [
            { "time": 0.35, "value": -36 },
            { "time": 0.75, "value": 0, "ease": "back.out(2)" }
          ]
        },
        "#f0": {
          "yPercent": [
            { "time": 0.35, "value": 110 },
            { "time": 0.85, "value": 0 }
          ]
        },
        ".quiz-option-1": {
          "opacity": [
            { "time": 0.6, "value": 0 },
            { "time": 0.8, "value": 1 }
          ],
          "scale": [
            { "time": 0.6, "value": 0.8 },
            { "time": 1.05, "value": 1, "ease": "back.out(1.8)" }
          ]
        },
        ".quiz-option-2": {
          "opacity": [
            { "time": 0.7, "value": 0 },
            { "time": 0.9, "value": 1 }
          ],
          "scale": [
            { "time": 0.7, "value": 0.8 },
            { "time": 1.15, "value": 1, "ease": "back.out(1.8)" }
          ]
        },
        ".quiz-option-3": {
          "opacity": [
            { "time": 0.8, "value": 0 },
            { "time": 1.0, "value": 1 }
          ],
          "scale": [
            { "time": 0.8, "value": 0.8 },
            { "time": 1.25, "value": 1, "ease": "back.out(1.8)" }
          ]
        },
        ".quiz-option-4": {
          "opacity": [
            { "time": 0.9, "value": 0 },
            { "time": 1.1, "value": 1 }
          ],
          "scale": [
            { "time": 0.9, "value": 0.8 },
            { "time": 1.35, "value": 1, "ease": "back.out(1.8)" }
          ]
        }
      }
    },
    {
      "name": "Reveal",
      "duration": 0.55,
      "ease": "power3.out",
      "calls": [
        { "time": 0, "call": "revealAnswer" }
      ],
      "layers": {}
    },
    {
      "name": "Out",
      "duration": 0.4,
      "ease": "power2.in",
      "layers": {
        ".quiz-box": {
          "opacity": [
            { "time": 0, "value": 1 },
            { "time": 0.4, "value": 0 }
          ],
          "y": [
            { "time": 0, "value": 0 },
            { "time": 0.4, "value": 32 }
          ],
          "scale": [
            { "time": 0, "value": 1 },
            { "time": 0.4, "value": 0.96 }
          ]
        }
      }
    }
  ],
  "machine": {
    "groups": [
      {
        "id": "main",
        "initial": "off",
        "defaultPath": ["question", "reveal", "out"],
        "states": [
          { "id": "off", "name": "Off" },
          { "id": "question", "name": "Question" },
          { "id": "reveal", "name": "Answer revealed" },
          { "id": "out", "name": "Out" }
        ],
        "transitions": [
          { "from": "question", "to": "reveal", "trigger": "operator", "event": "judge" }
        ]
      },
      {
        "id": "timer",
        "initial": "idle",
        "states": [
          { "id": "idle", "name": "Timer hidden" },
          {
            "id": "running",
            "name": "Timer running",
            "timeline": {
              "name": "Start timer",
              "duration": 0.45,
              "ease": "power3.out",
              "calls": [
                { "time": 0, "call": "startTimer" }
              ],
              "layers": {
                ".quiz-timer": {
                  "opacity": [
                    { "time": 0, "value": 0 },
                    { "time": 0.2, "value": 1 }
                  ],
                  "scale": [
                    { "time": 0, "value": 0.6 },
                    { "time": 0.45, "value": 1, "ease": "back.out(2.2)" }
                  ]
                },
                ".quiz-timebar": {
                  "opacity": [
                    { "time": 0, "value": 0 },
                    { "time": 0.3, "value": 1 }
                  ]
                }
              }
            }
          },
          {
            "id": "done",
            "name": "Time up",
            "timeline": {
              "name": "Time up",
              "duration": 2.2,
              "ease": "power2.out",
              "calls": [
                { "time": 0, "call": "stopTimer" }
              ],
              "layers": {
                ".quiz-timer": {
                  "scale": [
                    { "time": 0, "value": 1 },
                    { "time": 0.15, "value": 1.18 },
                    { "time": 0.5, "value": 1, "ease": "back.out(2)" }
                  ],
                  "opacity": [
                    { "time": 0, "value": 1 },
                    { "time": 1.7, "value": 1 },
                    { "time": 2.2, "value": 0 }
                  ]
                },
                ".quiz-timebar": {
                  "opacity": [
                    { "time": 0, "value": 1 },
                    { "time": 1.7, "value": 1 },
                    { "time": 2.2, "value": 0 }
                  ]
                }
              }
            }
          }
        ],
        "transitions": [
          { "from": "idle", "to": "running", "trigger": "operator", "event": "timerStart" },
          { "from": "running", "to": "done", "trigger": "operator", "event": "timerEnd" },
          { "from": "done", "to": "idle", "trigger": "timer", "after": 0.2 },
          { "from": "running", "to": "running", "trigger": "operator", "event": "timerStart" }
        ]
      }
    ],
    "controls": [
      { "event": "judge", "label": "Reveal answer", "order": 1, "section": "Answer", "payload": ["f5"] },
      { "event": "timerStart", "label": "Start timer", "order": 2, "section": "Timer" },
      { "event": "timerEnd", "label": "Stop timer", "order": 3, "section": "Timer" }
    ]
  }
};

// ---- The interpreter (the same in every template — edit the DATA above instead) ----
// Steps play on the operator's cues: steps[0] on play(), each middle step on one next()
// press, the last step on stop(). Keyframe times sit on the step's local clock and are
// divided by the speed knob. A keyframe's ease is the ease INTO it (default: the step's).
// When the data carries a "machine", the same cues drive its default path, and the state
// engine below adds operator events (noacgDispatch), timers, and instant snap (noacgSnap).
// ---- Eases (shared with the editor, which samples, splits and reverses keys with this code) ----
// Capability: shared-ease-v2. noacgEase(text) returns the curve E(p) of an ease string, or null
// when the string is outside this grammar; the interpreter then hands the string to GSAP as it
// always did. A recognized ease reaches GSAP as this function, never as a string it could replace
// with its default.
//   none | linear, power0-4, quad, cubic, quart, quint, strong, sine, expo, circ, bounce, back(s)
//   or elastic(a, p), each with .in, .out or .inOut (bare means .out) | steps(n) | steps(n, true)
//   | cubic-bezier(x1, y1, x2, y2) with x1 and x2 in 0..1
//   | slice(ease, a, b): that ease between a and b, rescaled to run from 0 to 1
//   | hold: keep the departing key's value, then jump to the arriving key's (a Hold keyframe)
//   | jump: jump to the arriving key's value at once, then keep it (a Hold played backwards).
// Named curves repeat GSAP 3.15's formulas in its operation order, so they match it exactly.
var noacgEaseCache = {};
// GSAP rounds timeline times to 1e-7 s, so at a key's exact time the segment arriving there can
// read 0.9999987 rather than 1. A hold jumps in the last 1e-5 of its segment, which that rounding
// still reaches for any segment of 10 ms or more, and a jump mirrors it at the start.
var NOACG_EASE_EDGE = 1e-5;
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
  if ((name === 'hold' || name === 'jump') && !side && !called) return { kind: name, text: text };
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
    // A slice rescales a moving part; a step, a hold or a jump has only flat parts and one instant.
    if (!base || base.kind === 'slice' || base.kind === 'steps' || base.kind === 'hold' || base.kind === 'jump' || !(from >= 0 && from < to && to <= 1)) return null;
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
  if (e.kind === 'hold') return function (p) { return p >= 1 - NOACG_EASE_EDGE ? 1 : 0; };
  if (e.kind === 'jump') return function (p) { return p > NOACG_EASE_EDGE ? 1 : 0; };
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
function noacgEaseOf(text) { return noacgEase(text) || text; }

// A dynamics builder takes the step's ease as a string (its API). It gets the shared curve only
// when GSAP cannot read a string the shared grammar recognizes, so nothing it builds defaults.
function noacgEaseForBuilder(text) {
  return typeof gsap.parseEase(text) === 'function' ? text : noacgEaseOf(text);
}

var noacgStepsPlayed = 0; // how many steps have run (play() = the first)
var noacgLiveTimeline = null;
var noacgOutTimeline = null;

// Capability: live-pose-out-v1. Capture before killing or applying any first key.
function noacgOutActive() { return !!noacgOutTimeline; }
function noacgRememberEntrance(tl) {
  if (noacgOutTimeline) noacgOutTimeline.kill();
  noacgOutTimeline = null;
  noacgLiveTimeline = tl;
  return tl;
}

// Exit motion uses object targets so an older stop() scaffold's killTweensOf('*')
// cannot destroy a repeated Out. The property setter also runs during silent seek.
function noacgExitProxy(element, prop, value) {
  var proxy = {};
  Object.defineProperty(proxy, 'value', {
    get: function () { return value; },
    set: function (next) { value = next; var vars = {}; vars[prop] = next; gsap.set(element, vars); }
  });
  return proxy;
}
function noacgExitVisible(element, selector) {
  for (var el = element; el; el = el.parentElement) {
    var style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') return false;
  }
  for (var s = noacgStepsPlayed; s < NOACG_ANIM.steps.length - 1; s++) {
    if ((NOACG_ANIM.steps[s].reveals || []).indexOf(selector) >= 0) return false;
  }
  return true;
}
// An interrupted exit stretches its last ease over the whole way from the live pose. A slice is
// part of a curve rescaled to its own ends, so stretched that far it can swing well past both;
// the interruption plays the whole curve it was cut from instead.
function noacgWholeEase(text) {
  var parsed = noacgEaseParse(text);
  return parsed && parsed.kind === 'slice' ? parsed.base.text : text;
}
function noacgBuildExit(step, interrupted, silent, early) {
  var speed = NOACG_ANIM.speed || 1;
  // Out's first "carried" seconds finish the motion of the cue before it, which Set Out cut
  // mid-motion; the exit proper starts after them. Out pressed at an earlier step never reached
  // that cue, so it skips them and the exit starts at the press.
  var skip = early ? step.carried || 0 : 0;
  var at = function (time) { return Math.max(0, time - skip); };
  var entries = [];
  Object.keys(step.layers).forEach(function (selector) {
    document.querySelectorAll(selector).forEach(function (element) {
      if (!noacgExitVisible(element, selector)) return;
      Object.keys(step.layers[selector]).forEach(function (prop) {
        var keys = step.layers[selector][prop];
        if (keys.length) entries.push({ element: element, prop: prop, keys: keys, live: gsap.getProperty(element, prop) });
      });
    });
  });
  if (noacgLiveTimeline) noacgLiveTimeline.kill();
  gsap.killTweensOf('*');
  var effects = Object.assign({}, step, { duration: at(step.duration), layers: {}, spans: undefined, hides: undefined, loops: undefined });
  if (silent) { effects.calls = []; effects.dynamics = []; }
  var tl = buildStepTimeline(effects);
  // Gate only already-visible layers. Object targets survive legacy repeated stop(). An
  // interrupted exit keeps each layer's visibility until it ends and then takes the Out's end
  // state, which also reaches a layer outside the root that the root's own hide cannot.
  Object.keys(step.spans || {}).forEach(function (selector) {
    document.querySelectorAll(selector).forEach(function (element) {
      if (!noacgExitVisible(element, selector)) return;
      var spans = step.spans[selector], times = [interrupted ? step.duration : 0];
      var proxy = noacgExitProxy(element, 'visibility', getComputedStyle(element).visibility);
      if (!interrupted) spans.forEach(function (span) { times.push(span.start, span.end); });
      times.sort(function (a, b) { return a - b; }).forEach(function (time) {
        tl.set(proxy, { value: noacgSpanVisible(spans, time, step.duration) ? 'visible' : 'hidden' }, at(time) / speed);
      });
    });
  });
  (step.hides || []).forEach(function (selector) {
    if (step.spans && step.spans[selector] !== undefined) return;
    document.querySelectorAll(selector).forEach(function (element) {
      tl.set(noacgExitProxy(element, 'opacity', gsap.getProperty(element, 'opacity')), { value: 0 }, at(step.duration) / speed);
    });
  });
  entries.forEach(function (entry) {
    var keys = entry.keys;
    var proxy = noacgExitProxy(entry.element, entry.prop, entry.live);
    var last = keys[keys.length - 1], first = 0;
    // Skipping carried time, the track's exit starts at its first key after it: the key that ends
    // the carried motion there only starts the exit when the exit moves on from it at once.
    if (skip) {
      while (first < keys.length - 1 && keys[first].time < skip) first++;
      if (keys[first].time === skip && first > 0 && first < keys.length - 1 && keys[first - 1].value !== keys[first].value && keys[first + 1].value === keys[first].value) first++;
    }
    if (interrupted && keys.length > 1 && last.time > keys[first].time) {
      var ease = noacgWholeEase(last.ease || step.ease), shape = noacgEaseParse(ease);
      // A final jump (a Hold played backwards) happens where its own segment starts, as it does
      // when Out is not interrupted; until then the live value holds.
      var from = at(shape && shape.kind === 'jump' ? keys[keys.length - 2].time : keys[first].time);
      tl.to(proxy, { value: last.value, duration: (at(last.time) - from) / speed, ease: noacgEaseOf(ease) }, from / speed);
    } else if (early) {
      // A one-key or zero-time track has no span to leave on. From an earlier step its value may be
      // a pose the viewer never saw, so it holds the live value and takes its own as the exit ends.
      // So does a track whose motion is all carried.
      tl.set(proxy, { value: last.value }, at(step.duration) / speed);
    } else {
      tl.set(proxy, { value: keys[0].value }, 0);
      for (var k = 1; k < keys.length; k++) {
        tl.to(proxy, { value: keys[k].value, duration: (keys[k].time - keys[k - 1].time) / speed,
          ease: noacgEaseOf(keys[k].ease || step.ease) }, keys[k - 1].time / speed);
      }
    }
  });
  return tl;
}

// Visibility is independent of opacity. At an arriving hold keep the interval's
// endpoint; a new cue's timeline owns its departing zero. Disjoint sets seek both ways.
function noacgSpanVisible(spans, time, duration) {
  return spans.some(function (span) {
    return time >= span.start && (time < span.end || time === duration && span.end === duration);
  });
}

// Build one step's GSAP timeline from its keyframe data. The first keyframe of a track
// is the starting state, applied instantly at the step start (it "holds backward" —
// the familiar keyframe convention); later keyframes tween from the previous one.
// Takes a step index — or a state's inline timeline object, which plays the same way.
function buildStepTimeline(index) {
  var step = typeof index === 'number' ? NOACG_ANIM.steps[index] : index;
  var speed = NOACG_ANIM.speed || 1;
  var tl = gsap.timeline();
  Object.keys(step.spans || {}).forEach(function (selector) {
    var spans = step.spans[selector];
    var times = [0];
    spans.forEach(function (span) { times.push(span.start, span.end); });
    times.sort(function (a, b) { return a - b; }).forEach(function (time) {
      tl.set(selector, { visibility: noacgSpanVisible(spans, time, step.duration) ? 'visible' : 'hidden' }, time / speed);
    });
  });
  Object.keys(step.layers).forEach(function (selector) {
    var tracks = step.layers[selector];
    Object.keys(tracks).forEach(function (prop) {
      var kfs = tracks[prop];
      if (!kfs.length) return;
      var loop = step.loops && step.loops[selector] && step.loops[selector][prop];
      if (loop) {
        // A looping track plays in its own repeating sub-timeline (a breathing pulse, a
        // marquee-style cycle): the sub-timeline's length is the loop period, and it is
        // added to the step at the track's first keyframe time. repeat -1 = forever.
        var sub = gsap.timeline({
          repeat: loop.repeat,
          yoyo: !!loop.yoyo,
          repeatDelay: (loop.repeatDelay || 0) / speed
        });
        var s0 = {};
        s0[prop] = kfs[0].value;
        sub.set(selector, s0, 0);
        for (var j = 1; j < kfs.length; j++) {
          var lv = {};
          lv[prop] = kfs[j].value;
          lv.duration = (kfs[j].time - kfs[j - 1].time) / speed;
          lv.ease = noacgEaseOf(kfs[j].ease || step.ease);
          sub.to(selector, lv, (kfs[j - 1].time - kfs[0].time) / speed);
        }
        tl.add(sub, kfs[0].time / speed);
        return;
      }
      var start = {};
      start[prop] = kfs[0].value;
      tl.set(selector, start, 0);
      for (var i = 1; i < kfs.length; i++) {
        var vars = {};
        vars[prop] = kfs[i].value;
        vars.duration = (kfs[i].time - kfs[i - 1].time) / speed;
        vars.ease = noacgEaseOf(kfs[i].ease || step.ease);
        tl.to(selector, vars, kfs[i - 1].time / speed);
      }
    });
  });
  // Layers that LEAVE in this step: hide them at the step's end. Their keyframes above
  // animate the exit; this makes the departure definitive (the twin of reveals' pre-hide),
  // so a layer can leave before the final Out. Replay re-arms it (resetGraphic clears the
  // inline props, then step 0 shows it again).
  (step.hides || []).forEach(function (selector) {
    if (step.spans && step.spans[selector] !== undefined) return;
    tl.set(selector, { opacity: 0 }, step.duration / speed);
  });
  // Step calls: named template functions fire at their moment on the step's clock (the
  // clock engine's startClock/stopClock — the timeline never owns that logic). Resolved by
  // name at fire time so hand edits and load order never matter; a missing function is a
  // silent no-op. Scrub/settle inherit GSAP's own callback suppression (progress(1, true)),
  // so a settled state never re-fires the clock.
  for (var c = 0; c < (step.calls || []).length; c++) {
    (function (name, at) {
      tl.call(function () {
        var fn = window[name];
        if (typeof fn === 'function') fn();
      }, null, at / speed);
    })(step.calls[c].call, step.calls[c].time);
  }
  // Dynamic motion: a design-owned builder MEASURES the DOM and returns a GSAP
  // tween/timeline (a marquee's width-derived travel, a credits roll, one flip per item).
  // The keyframe data above cannot describe motion whose magnitude depends on the
  // operator's content, so it names a builder instead — the logic stays readable JS,
  // outside this region, where you can edit it. Resolved by name at build time (no eval);
  // a missing builder is a silent no-op.
  //
  // THE LEAD, and why a builder may want it (templates/infographics/igMotion.ts states the rule
  // in full under THE ZERO RULE). A dynamic's time is a HEAD START: the step reveals the graphic
  // at 0 and the measured motion begins a few tenths later, once the panel has settled. A
  // builder that only MOVES things is happy to be added at that offset. A builder that owns a
  // READOUT is not: the operator's data is written before the graphic is taken (SPX, CasparCG
  // and the playout dashboard all call update() and then play()), so a figure emptied to zero
  // when its own count begins is on screen showing the real number until then, and then snaps
  // back to zero to count up to it. So the head start is handed over as opts.lead as well, and
  // a builder that positions its own contents from it says so by marking the timeline it
  // returns - that one is added at 0, where its opening zero lands on the step's first frame.
  // Everything else is added exactly where it always was.
  for (var d = 0; d < (step.dynamics || []).length; d++) {
    (function (name, target, at) {
      var build = window[name];
      if (typeof build !== 'function') return;
      var lead = (at || 0) / speed;
      var segment = build(target, { speed: speed, ease: noacgEaseForBuilder(step.ease), lead: lead });
      if (segment) tl.add(segment, segment.noacgLeadApplied ? 0 : lead);
    })(step.dynamics[d].build, step.dynamics[d].target, step.dynamics[d].time);
  }
  // Pad to the step's full duration — settled air at the end is part of the step.
  // (A dynamic segment may run LONGER than this: its length is measured at play time, so
  // the step's authored duration is a floor, not a cap.)
  tl.set({ noacgPad: 0 }, { noacgPad: 1 }, step.duration / speed);
  return tl;
}

// Layers revealed by a later step start hidden: pre-apply their reveal step's first
// keyframe values (their "from" state; plain opacity 0 when the step gives them no
// keyframes). Runs inside play()'s timeline, so every replay re-arms the reveals.
function noacgApplyReveals(tl) {
  var steps = NOACG_ANIM.steps;
  for (var s = 1; s < steps.length - 1; s++) {
    (steps[s].reveals || []).forEach(function (selector) {
      var tracks = steps[s].layers[selector];
      if (steps[0].spans && steps[0].spans[selector] !== undefined) return;
      var hidden = false;
      if (tracks) Object.keys(tracks).forEach(function (prop) {
        if (!tracks[prop].length) return;
        var vars = {};
        vars[prop] = tracks[prop][0].value;
        tl.set(selector, vars, 0);
        // transformOrigin is static pivot chrome, not entrance motion — it doesn't pre-hide.
        if (prop !== 'transformOrigin') hidden = true;
      });
      if (!hidden) tl.set(selector, { opacity: 0 }, 0);
    });
  }
}

// noacgPaintFirstFrame(tl): put the timeline's opening values in the DOM NOW, not on the next
// animation frame. Returns the timeline, so a builder can end on it.
//
// Every opening value this interpreter writes is a set() ON the timeline (buildStepTimeline
// above, the root reveal and the reveal pre-arm below), and a GSAP timeline renders nothing
// until the ticker next runs. The operator's cue - play(), next(), a dispatched event - is ONE
// synchronous task, so the browser paints once between that task ending and the first tick. What
// it paints is the graphic exactly as it already was.
//
// Off air that paints nothing, because the root sits at opacity 0. ON AIR it paints everything,
// and a graphic is on air for most of these cues: the studio canvas and the Rehearse panel both
// settle a graphic and then take it, a dashboard, SPX or CasparCG take of a graphic that is
// still up re-enters from a visible state, and EVERY next() and every event transition is by
// definition a cue on a graphic the viewer is already watching.
//
// Measured 2026-09-03 on a settled ig05 "Rising Total": play() returned with #f0 still reading
// its real 124,213 at opacity 1, and the entrance's zero landed 14 ms later. That is the owner's
// 2026-08-28 walk report exactly - the full figure on take, a snap to zero, then the count - and
// it is the frame the ZERO RULE (templates/infographics/igMotion.ts) cannot reach, because the
// zero rule moved the emptying onto the entrance's first frame and the first frame was itself a
// frame late. Eleven readouts across ten designs painted their settled figure that way.
//
// This writes precisely what the next tick would have written, with events suppressed, so timing
// and content are unchanged - only the moment the opening values reach the DOM moves, by one
// frame, onto the cue itself. Callbacks are NOT fired here (a step call at time 0 still runs on
// the first real tick, which is what keeps a clock engine's start unaffected).
function noacgPaintFirstFrame(tl) {
  if (tl) tl.render(0, true, true);
  return tl;
}

// The entrance recipe: step 0, the root reveal, and the reveal pre-arm — shared by play(),
// the machine's entrance, and snap's pose composition, so they can never drift apart.
function noacgEntranceTimeline() {
  var tl = buildStepTimeline(0);
  tl.set(NOACG_ANIM.root, { opacity: 1 }, 0); // reveal the (CSS-hidden) graphic
  noacgApplyReveals(tl);
  return noacgRememberEntrance(noacgPaintFirstFrame(tl));
}

// The exit recipe — the Out step plus the off-air cleanup, shared the same way.
function noacgExitTimeline(interrupted, silent) {
  if (!silent && noacgOutTimeline) return noacgOutTimeline;
  var steps = NOACG_ANIM.steps;
  var step = steps.length > 1 ? steps[steps.length - 1] : { duration: 0, ease: 'none', layers: {} };
  if (interrupted === undefined) interrupted = !!noacgLiveTimeline && noacgLiveTimeline.time() < noacgLiveTimeline.duration();
  // Out from an earlier step, with a Next cue not yet played, leaves from what is on screen as an
  // interrupted Out does: never through the last step's pose or motion the viewer has not seen.
  // A machine's states are an authored graph, not a linear reveal, so it keeps its own exit.
  var early = !NOACG_ANIM.machine && noacgStepsPlayed > 0 && noacgStepsPlayed < steps.length - 1;
  if (early) interrupted = true;
  var tl = noacgBuildExit(step, interrupted, silent, early);
  // Press-revealed layers OUTSIDE the root miss its hide — fade them with the exit
  // (unless the Out step animates them itself). Containment is checked live. The exit starts
  // after the motion Out carries, which Out pressed at an earlier step skips; motion carried
  // on such a layer is not the exit animating it.
  var root = document.querySelector(NOACG_ANIM.root), carried = step.carried || 0;
  var exits = function (selector) {
    var tracks = step.layers[selector] || {};
    return Object.keys(tracks).some(function (prop) { return tracks[prop].some(function (key) { return key.time > carried; }); });
  };
  for (var s = 1; s < steps.length - 1; s++) {
    (steps[s].reveals || []).forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el && root && !root.contains(el) && !exits(selector)) {
        tl.to(noacgExitProxy(el, 'opacity', gsap.getProperty(el, 'opacity')), { value: 0, duration: Math.min(0.3, step.duration - carried) / (NOACG_ANIM.speed || 1) }, (early ? 0 : carried) / (NOACG_ANIM.speed || 1));
      }
    });
  }
  if (root) tl.set(noacgExitProxy(root, 'opacity', gsap.getProperty(root, 'opacity')), { value: 0 }); // fully hidden; ready to play again
  if (!silent) noacgOutTimeline = tl;
  return noacgPaintFirstFrame(tl);
}

// buildInTimeline(): the entrance. Called by play(). With a machine, play() is the built-in
// reset-and-enter event; without one, the classic linear walk (byte-for-byte).
function buildInTimeline() {
  if (noacgOutTimeline) noacgOutTimeline.kill();
  noacgOutTimeline = null;
  noacgLiveTimeline = null;
  if (NOACG_ANIM.machine) return noacgMachinePlay();
  noacgStepsPlayed = 1;
  var tl = noacgEntranceTimeline();
  noacgTrackPath(); // pointer bookkeeping only — playback is untouched
  return tl;
}

// revealNextStep(): one default-path advance per next() press; null when only Out remains, and
// once Out has started, until the next play(): a Next cue never plays on the way out.
function revealNextStep() {
  if (NOACG_ANIM.machine) return noacgMachineNext();
  if (noacgOutTimeline || noacgStepsPlayed >= NOACG_ANIM.steps.length - 1) return null;
  // Paint the step's opening values on the press, not a frame after it: next() is pressed on a
  // graphic the viewer is already watching, so a frame of the previous step's end pose is the
  // most visible case of all (noacgPaintFirstFrame above).
  var tl = noacgPaintFirstFrame(buildStepTimeline(noacgStepsPlayed++));
  noacgLiveTimeline = tl;
  noacgTrackPath();
  return tl;
}

// buildOutTimeline(): the exit. Called by stop() — the built-in event that is legal from
// EVERY state (an operator can always take the graphic off air).
function buildOutTimeline() {
  if (noacgOutTimeline) return noacgOutTimeline;
  if (NOACG_ANIM.machine) return noacgMachineStop();
  var tl = noacgExitTimeline();
  noacgResetPointers();
  return tl;
}

// ---- The state machine (docs/STATE_MACHINE_SCHEMA.md) ----
// States are what the graphic looks like (each one's content is a timeline); transitions are
// arrows fired by operator events or timers; parallel groups run independent small graphs.
// When NOACG_ANIM.machine is absent, the implicit ONE-GROUP linear machine is derived from
// the step chain (mirrors blocks/animMachine.ts deriveMachine — keep them in agreement) and
// playback still runs the classic statements above; the derived machine exists so
// noacgDispatch / noacgSnap / noacgMachineState answer for every template.
var noacgMachine = (function () {
  if (NOACG_ANIM.machine) return NOACG_ANIM.machine;
  function slug(name) {
    var s = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return s || 'state';
  }
  var used = { off: true };
  var states = [{ id: 'off', name: 'Off' }];
  var path = [];
  for (var i = 0; i < NOACG_ANIM.steps.length; i++) {
    var stepName = NOACG_ANIM.steps[i].name;
    var id = slug(stepName);
    for (var n = 2; used[id]; n++) id = slug(stepName) + '-' + n;
    used[id] = true;
    states.push({ id: id, name: stepName });
    path.push(id);
  }
  var transitions = [{ from: 'off', to: path[0], trigger: 'lifecycle', event: 'play' }];
  for (var j = 0; j + 2 < path.length; j++) {
    transitions.push({ from: path[j], to: path[j + 1], trigger: 'operator', event: 'next' });
  }
  if (path.length >= 2) {
    transitions.push({ from: path[path.length - 2], to: path[path.length - 1], trigger: 'lifecycle', event: 'stop' });
  }
  return { groups: [{ id: 'main', initial: 'off', defaultPath: path, states: states, transitions: transitions }] };
})();

var noacgCurrent = {};      // group id -> current state id (pointers move SYNCHRONOUSLY)
var noacgGroupTl = {};      // group id -> that group's running entry timeline
var noacgTimers = {};       // group id -> the armed gsap.delayedCall (timer transitions)
var noacgQueue = [];        // the serial event queue — one event at a time, FIFO
var noacgDraining = false;  // re-entrancy guard: a dispatch during a drain queues behind
(function () {
  for (var g = 0; g < noacgMachine.groups.length; g++) {
    noacgCurrent[noacgMachine.groups[g].id] = noacgMachine.groups[g].initial;
  }
})();

function noacgPathIndex(stateId) {
  var path = noacgMachine.groups[0].defaultPath || [];
  for (var i = 0; i < path.length; i++) if (path[i] === stateId) return i;
  return -1;
}

// Keep the main pointer in step with the classic walk (machine-less playback).
function noacgTrackPath() {
  var main = noacgMachine.groups[0];
  noacgCurrent[main.id] = noacgStepsPlayed > 0 ? main.defaultPath[noacgStepsPlayed - 1] : main.initial;
}

function noacgStateOf(group, id) {
  for (var i = 0; i < group.states.length; i++) if (group.states[i].id === id) return group.states[i];
  return null;
}

function noacgOperatorEdge(group, from, event) {
  for (var i = 0; i < group.transitions.length; i++) {
    var t = group.transitions[i];
    if (t.from === from && t.trigger === 'operator' && t.event === event) return t;
  }
  return null;
}

function noacgTimerEdge(group, from) {
  for (var i = 0; i < group.transitions.length; i++) {
    var t = group.transitions[i];
    if (t.from === from && t.trigger === 'timer') return t;
  }
  return null;
}

// The materialised entrance/exit edge ('play' or 'stop'), looked up POSITIONALLY at its one
// canonical seat — play: initial → the first waypoint; stop: between the last two waypoints.
// This is how the entrance and the exit carry a transition style; a lifecycle edge anywhere
// else never fires (the editor's validator says so out loud). next() never sees these: the
// walk fires OPERATOR arrows only, so stop's edge never makes another press legal.
function noacgLifecycleEdge(event) {
  var main = noacgMachine.groups[0];
  var path = main.defaultPath || [];
  if (path.length < 2) return null;
  var from = event === 'play' ? main.initial : path[path.length - 2];
  var to = event === 'play' ? path[0] : path[path.length - 1];
  for (var i = 0; i < main.transitions.length; i++) {
    var t = main.transitions[i];
    if (t.trigger === 'lifecycle' && t.event === event && t.from === from && t.to === to) return t;
  }
  return null;
}

function noacgCancelTimer(groupId) {
  if (noacgTimers[groupId]) { noacgTimers[groupId].kill(); noacgTimers[groupId] = null; }
}

function noacgCancelAllTimers() {
  for (var g = 0; g < noacgMachine.groups.length; g++) noacgCancelTimer(noacgMachine.groups[g].id);
}

function noacgResetPointers() {
  for (var g = 0; g < noacgMachine.groups.length; g++) {
    noacgCurrent[noacgMachine.groups[g].id] = noacgMachine.groups[g].initial;
  }
}

// The step a state's content comes from: a default-path state's positional step, an off-path
// state's inline timeline, or null for a pose-only state.
function noacgStepFor(group, stateId) {
  if (group === noacgMachine.groups[0]) {
    var idx = noacgPathIndex(stateId);
    if (idx >= 0) return NOACG_ANIM.steps[idx];
  }
  var state = noacgStateOf(group, stateId);
  return state && state.timeline ? state.timeline : null;
}

// The timeline ENTERING a state plays: a default-path state plays its positional step (the
// first through the entrance recipe, the last through the exit recipe), an off-path state
// its inline timeline, a pose-only state nothing (instant).
function noacgEnterTimeline(group, stateId) {
  if (group === noacgMachine.groups[0]) {
    var idx = noacgPathIndex(stateId);
    if (idx === 0) return noacgEntranceTimeline();
    if (idx > 0 && idx === (group.defaultPath || []).length - 1) return noacgExitTimeline();
  }
  var step = noacgStepFor(group, stateId);
  // Same reason as next(): an event transition is fired on a graphic that is already on air, so
  // the state's opening values have to land on the press rather than a frame later - a quiz sent
  // back from Revealed to Question would otherwise paint one more frame with the answer up.
  return step ? noacgPaintFirstFrame(buildStepTimeline(step)) : null;
}

// Run a step's lifecycle calls once, immediately. Snap composes a pose with SUPPRESSED
// callbacks, which is what keeps clocks and loops idle along the route — but a state whose
// look is painted by a call (a quiz's lock dim) would then snap to an incomplete pose. So
// the TARGET state's own calls run once the pose is composed; the states merely passed
// THROUGH stay suppressed, so nothing replays a side effect on the way.
function noacgFireCalls(step) {
  var calls = (step && step.calls) || [];
  for (var i = 0; i < calls.length; i++) {
    var fn = window[calls[i].call];
    if (typeof fn === 'function') fn();
  }
}

// A timer transition arms when its state's entry timeline SETTLES (a tl.call at the authored
// end). gsap.delayedCall rides the GSAP clock, so time-scaling and callback suppression hold:
// a settled or scrubbed graphic (progress(1, true)) never arms a timer and never
// auto-advances under the operator.
function noacgArmTimer(group, stateId, tl) {
  var edge = noacgTimerEdge(group, stateId);
  if (!edge) return;
  var arm = function () {
    noacgCancelTimer(group.id);
    noacgTimers[group.id] = gsap.delayedCall(edge.after / (NOACG_ANIM.speed || 1), function () {
      noacgTimers[group.id] = null;
      noacgDispatch({ timerGroup: group.id, from: stateId });
    });
  };
  if (tl) tl.call(arm, null, tl.duration());
  else arm();
}

// Payload fields ride an ACCEPTED event, written through the same helper update() uses —
// a bare update() still never causes a transition.
function noacgApplyPayload(payload) {
  for (var key in payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    var el = document.getElementById(key);
    if (!el) continue;
    if (typeof setFieldValue === 'function') setFieldValue(el, payload[key]);
    else el.textContent = payload[key];
  }
}

// A STYLED transition (the arrow's own "style": fade, push-left/right/up/down,
// wipe-left/right): the arrow's animated change plays INSTEAD of the target state's entry
// timeline. Two phases on the root — the old pose leaves, the target pose is composed
// instantly (the snap recipe, suppressed callbacks), the new pose arrives — landing exactly
// where the entry timeline would have settled, so a styled entry and a snap agree on every
// pose. An unknown style returns null and the entry timeline plays: honest degradation.
function noacgStyleTimeline(group, edge) {
  var style = edge.style;
  var root = document.querySelector(NOACG_ANIM.root);
  var known = { cut: 1, fade: 1, 'push-left': 1, 'push-right': 1, 'push-up': 1, 'push-down': 1, 'wipe-left': 1, 'wipe-right': 1 };
  if (!style || !root || !known[style]) return null;
  var speed = NOACG_ANIM.speed || 1;
  var half = ((edge.duration || 0.6) / speed) / 2;
  var ease = noacgEaseOf(edge.ease || 'power2.inOut');
  var isPush = style.indexOf('push-') === 0;
  var axis = style === 'push-left' || style === 'push-right' ? 'xPercent' : 'yPercent';
  var sign = style === 'push-left' || style === 'push-up' ? -1 : 1;
  var pose = { v: 0 };
  var swapped = false;
  // The pose swap: compose the CURRENT pointers' pose from a clean slate — the SNAP recipe
  // (clear, then replay every group's canonical route with suppressed callbacks). Composing
  // only the target's entry timeline would be wrong twice over: a pose-only branch state
  // (the quiz's Selected) plays nothing, and the entrance's root reveal lives on the ROUTE,
  // not on the target. Idempotent and exposed on the timeline (__noacgSwap): an interrupting
  // event finishes this timeline with SUPPRESSED callbacks, which would skip a tl.call — so
  // the interrupter runs the swap by hand and the pointer's state is always the DOM's.
  var swap = function () {
    if (swapped) return;
    swapped = true;
    noacgResetGraphic();
    noacgStepsPlayed = 0;
    for (var g = 0; g < noacgMachine.groups.length; g++) {
      var gr = noacgMachine.groups[g];
      var target = noacgCurrent[gr.id];
      if (target === gr.initial) continue;
      var route = noacgCanonicalPath(gr, target);
      if (!route) continue;
      for (var s = 0; s < route.length; s++) {
        var enter = noacgEnterTimeline(gr, route[s]);
        if (enter) { enter.pause(0); enter.progress(1, true); enter.kill(); }
        if (gr === noacgMachine.groups[0]) {
          var idx = noacgPathIndex(route[s]);
          if (idx >= 0) noacgStepsPlayed = idx + 1;
        }
      }
    }
    noacgFireCalls(noacgStepFor(group, edge.to));
  };
  var tl = gsap.timeline();
  // Settling a timeline (progress(1, true) — the editor's parked view, thumbnails, the
  // scrub chain) SUPPRESSES callbacks, which would skip the swap and leave the wrong pose.
  // So the styled timeline's own progress() runs the idempotent swap whenever it is seeked
  // to the end — every consumer of the settle recipe lands right with no caller changes.
  var finishAware = function (built) {
    var origProgress = built.progress;
    built.progress = function (v) {
      var r = origProgress.apply(this, arguments);
      if (typeof v === 'number' && v >= 1) swap();
      return r;
    };
    built.__noacgSwap = swap;
    return built;
  };
  // CUT: the broadcast hard cut — the pose swap alone, no tween on either side. A
  // zero-duration timeline whose one call runs the swap; duration/ease are ignored.
  if (style === 'cut') {
    tl.call(swap);
    return finishAware(tl);
  }
  // Phase 1: the old pose leaves.
  if (style === 'fade') {
    tl.to(root, { opacity: 0, duration: half, ease: ease });
  } else if (isPush) {
    var outVars = { duration: half, ease: ease };
    outVars[axis] = sign * 120;
    tl.to(root, outVars);
  } else {
    tl.to(root, { clipPath: style === 'wipe-left' ? 'inset(0% 100% 0% 0%)' : 'inset(0% 0% 0% 100%)', duration: half, ease: ease });
  }
  // The swap, plus parking the root at the IN phase's starting offset (entering from the
  // side the old pose left toward — a continuous push, a continuous wipe).
  tl.call(function () {
    swap();
    if (style === 'fade') {
      pose.v = Number(gsap.getProperty(root, 'opacity'));
      gsap.set(root, { opacity: 0 });
    } else if (isPush) {
      pose.v = Number(gsap.getProperty(root, axis)) || 0;
      var park = {};
      park[axis] = pose.v - sign * 120;
      gsap.set(root, park);
    } else {
      gsap.set(root, { clipPath: style === 'wipe-left' ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)' });
    }
  });
  // Phase 2: the new pose arrives, ending on the CAPTURED pose values (function-based ends
  // read them after the swap ran).
  if (style === 'fade') {
    tl.to(root, { opacity: function () { return pose.v; }, duration: half, ease: ease });
  } else if (isPush) {
    var inVars = { duration: half, ease: ease };
    inVars[axis] = function () { return pose.v; };
    tl.to(root, inVars);
  } else {
    tl.to(root, {
      clipPath: 'inset(0% 0% 0% 0%)',
      duration: half,
      ease: ease,
      onComplete: function () { gsap.set(root, { clearProps: 'clipPath' }); }
    });
  }
  return finishAware(tl);
}

// Fire one transition: the pointer moves SYNCHRONOUSLY (an event arriving mid-animation
// evaluates against the NEW state), the previous group timeline finishes instantly with
// suppressed callbacks (nothing double-fires), the target state's timeline plays, and the
// target's entry timer arms. Entering the exit state takes the graphic off air.
function noacgFire(group, edge) {
  noacgCancelTimer(group.id);
  var prev = noacgGroupTl[group.id];
  if (prev) {
    if (prev.progress() < 1) prev.progress(1, true);
    if (prev.__noacgSwap) prev.__noacgSwap(); // a suppressed finish skipped the pose swap
    prev.kill();
    noacgGroupTl[group.id] = null;
  }
  noacgCurrent[group.id] = edge.to;
  var main = noacgMachine.groups[0];
  if (group === main) {
    var idx = noacgPathIndex(edge.to);
    if (idx >= 0) noacgStepsPlayed = idx + 1;
  }
  var tl = noacgStyleTimeline(group, edge) || noacgEnterTimeline(group, edge.to);
  if (tl) noacgGroupTl[group.id] = tl;
  var path = main.defaultPath || [];
  if (group === main && edge.to === path[path.length - 1]) {
    // The exit was reached (an authored next-drives-out arrow): off air, like stop().
    noacgCancelAllTimers();
    noacgResetPointers();
  } else {
    noacgArmTimer(group, edge.to, tl);
  }
  return tl;
}

// next() under a machine: the default-path walk. On-path it enters the next waypoint
// (whatever event name the authored arrow carries); the arrow INTO the exit is an authored
// opt-in (without one, next() no-ops when only Out remains — the classic contract). Off-path
// it fires an authored 'next' rejoin arrow if the author drew one; otherwise a deterministic
// no-op.
function noacgProcessNext() {
  var main = noacgMachine.groups[0];
  var path = main.defaultPath || [];
  var cur = noacgCurrent[main.id];
  var i = noacgPathIndex(cur);
  if (i < 0 && cur === main.initial && path.length > 0) {
    // Off air: next() does nothing — play() is how the graphic enters.
    return null;
  }
  if (i >= 0) {
    if (i + 1 >= path.length) return null;
    var target = path[i + 1];
    var authored = null;
    for (var k = 0; k < main.transitions.length; k++) {
      var t = main.transitions[k];
      if (t.from === cur && t.to === target && t.trigger === 'operator') { authored = t; break; }
    }
    if (i + 1 === path.length - 1 && !authored) return null;
    return noacgFire(main, authored || { from: cur, to: target, trigger: 'operator' });
  }
  var rejoin = noacgOperatorEdge(main, cur, 'next');
  return rejoin ? noacgFire(main, rejoin) : null;
}

// Process one queued entry. Timer firings re-check their arming state — the graphic may have
// moved while they sat in the queue — so a stale timer is dropped, never misfired.
function noacgProcessOne(e) {
  if (e.timerGroup) {
    for (var g = 0; g < noacgMachine.groups.length; g++) {
      var tg = noacgMachine.groups[g];
      if (tg.id !== e.timerGroup) continue;
      if (noacgCurrent[tg.id] !== e.from) return null;
      var timerEdge = noacgTimerEdge(tg, e.from);
      return timerEdge ? noacgFire(tg, timerEdge) : null;
    }
    return null;
  }
  if (e.pathStep) return noacgProcessNext();
  if (!NOACG_ANIM.machine) {
    // Machine-less templates keep the classic playback exactly; 'next' is their one event.
    return e.event === 'next' ? revealNextStep() : null;
  }
  // Structural guarding: only groups whose CURRENT state has an arrow for this event fire —
  // several may (parallel groups), none means the event is illegal right now and is dropped.
  var firing = [];
  for (var g2 = 0; g2 < noacgMachine.groups.length; g2++) {
    var group = noacgMachine.groups[g2];
    var edge = noacgOperatorEdge(group, noacgCurrent[group.id], e.event);
    if (edge) firing.push({ group: group, edge: edge });
  }
  if (firing.length === 0) return null;
  if (e.payload) noacgApplyPayload(e.payload);
  var last = null;
  for (var f = 0; f < firing.length; f++) {
    var tl = noacgFire(firing[f].group, firing[f].edge);
    if (tl) last = tl;
  }
  return last;
}

// noacgDispatch(event, payload?): send one operator event through the SERIAL queue. Events
// resolve one at a time in arrival order — near-simultaneous events and multi-part updates
// land deterministically and atomically. The optional payload is a flat {field: value} map
// applied only when the event is accepted. Returns the last timeline the event started
// (null when guarded out or queued behind a running drain).
function noacgDispatch(event, payload) {
  noacgQueue.push(typeof event === 'string' ? { event: event, payload: payload } : event);
  if (noacgDraining) return null;
  noacgDraining = true;
  var last = null;
  while (noacgQueue.length > 0) {
    var tl = noacgProcessOne(noacgQueue.shift());
    if (tl) last = tl;
  }
  noacgDraining = false;
  return last;
}

// play() under a machine: the built-in reset-and-enter — every group to its initial state,
// the queue cleared, the entrance played, the first waypoint's timer armed. A STYLE on the
// materialised play edge (cut/fade/push/wipe) plays the styled change instead of the
// entrance timeline, landing on the same settled pose (the swap composes the pointers'
// pose, set below before the timeline runs).
function noacgMachinePlay() {
  noacgCancelAllTimers();
  noacgQueue.length = 0;
  noacgGroupTl = {};
  noacgResetPointers();
  noacgStepsPlayed = 1;
  var main = noacgMachine.groups[0];
  noacgCurrent[main.id] = (main.defaultPath || [])[0];
  var edge = noacgLifecycleEdge('play');
  var tl = (edge && edge.style !== undefined ? noacgStyleTimeline(main, edge) : null) || noacgEntranceTimeline();
  noacgGroupTl[main.id] = tl;
  noacgArmTimer(main, noacgCurrent[main.id], tl);
  return tl;
}

function noacgMachineNext() {
  return noacgDispatch({ pathStep: true });
}

// stop() under a machine: the built-in out — legal from every state, cancels timers, flushes
// the queue, plays the exit, and rests every group at its initial state. A STYLE on the
// materialised stop edge plays the styled change instead of the Out timeline, from WHEREVER
// the graphic is: the pointers rest first, so the swap composes the off pose — and the Out
// step's lifecycle calls still run once at the swap (a clock's stopClock must not be skipped
// just because the exit was styled).
function noacgMachineStop() {
  noacgCancelAllTimers();
  noacgQueue.length = 0;
  var edge = noacgLifecycleEdge('stop');
  var styled = edge && edge.style !== undefined ? noacgStyleTimeline(noacgMachine.groups[0], edge) : null;
  var tl = styled || noacgExitTimeline();
  noacgGroupTl = {};
  noacgResetPointers();
  return tl;
}

// The canonical route to a state: for a main-group waypoint, the default-path prefix; else
// BFS shortest path from the group's initial over authored operator/timer arrows
// (data-condition never fires) plus the walk's own edges, ties resolved by declaration
// order. Mirrors blocks/animMachine.ts canonicalPath — keep them in agreement.
function noacgCanonicalPath(group, targetId) {
  if (targetId === group.initial) return [];
  var isMain = group === noacgMachine.groups[0];
  var path = group.defaultPath || [];
  if (isMain) {
    var pi = noacgPathIndex(targetId);
    if (pi >= 0) return path.slice(0, pi + 1);
  }
  var edges = [];
  if (isMain && path.length > 0) {
    edges.push({ from: group.initial, to: path[0] });
    for (var w = 0; w + 1 < path.length; w++) edges.push({ from: path[w], to: path[w + 1] });
  }
  for (var i = 0; i < group.transitions.length; i++) {
    if (group.transitions[i].trigger !== 'data-condition') edges.push(group.transitions[i]);
  }
  var cameFrom = {};
  var seen = {};
  seen[group.initial] = true;
  var queue = [group.initial];
  while (queue.length > 0) {
    var at = queue.shift();
    for (var e = 0; e < edges.length; e++) {
      var edge = edges[e];
      if (edge.from !== at || seen[edge.to]) continue;
      seen[edge.to] = true;
      cameFrom[edge.to] = at;
      if (edge.to === targetId) {
        var route = [];
        var id = targetId;
        while (id !== group.initial) { route.unshift(id); id = cameFrom[id]; }
        return route;
      }
      queue.push(edge.to);
    }
  }
  return null;
}

// Return the graphic to its CSS rest: clear every inline style the animations wrote.
// Self-contained (no editor needed), so snap works identically in exports.
function noacgResetGraphic() {
  if (noacgOutTimeline) noacgOutTimeline.kill();
  noacgOutTimeline = null;
  noacgLiveTimeline = null;
  var root = document.querySelector(NOACG_ANIM.root);
  if (root) {
    gsap.set(root, { clearProps: 'all' });
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) gsap.set(all[i], { clearProps: 'all' });
  }
  // clearProps wipes INLINE styles, and one of them is not the animation's to wipe: an image
  // field with no picture is hidden inline (setFieldValue removes the src and sets
  // display:none), so clearing it turns an empty field into a 52px broken-image box on air.
  // Re-hide every srcless field image — the data layer's truth, restated after the reset.
  var imgs = document.querySelectorAll('img[id]');
  for (var m = 0; m < imgs.length; m++) {
    if (!imgs[m].getAttribute('src')) imgs[m].style.display = 'none';
  }
  // Press-revealed layers can sit OUTSIDE the root — clear them too.
  for (var s = 1; s < NOACG_ANIM.steps.length - 1; s++) {
    var reveals = NOACG_ANIM.steps[s].reveals || [];
    for (var r = 0; r < reveals.length; r++) {
      var el = document.querySelector(reveals[r]);
      if (el) gsap.set(el, { clearProps: 'all' });
    }
  }
}

// noacgSnap(assignments, opts?): enter states INSTANTLY — no animation replay. assignments
// is a {groupId: stateId} map; groups not named keep their current state; null means every
// group to its initial — the VISUAL half of reset (data reset stays update()'s job, the two
// are never conflated). The pose is composed by replaying each group's canonical path with
// suppressed callbacks, so clocks, loops and timers stay silent during composition. Entry
// timers then arm by default (recovery: a snapped-into ticker resumes cycling); pass
// { timers: false } to park the graphic (the editor's preview does).
function noacgSnap(assignments, opts) {
  opts = opts || {};
  var want = {};
  var g, group;
  for (g = 0; g < noacgMachine.groups.length; g++) {
    group = noacgMachine.groups[g];
    var target = assignments === null || assignments === undefined
      ? group.initial
      : (assignments[group.id] !== undefined ? assignments[group.id] : noacgCurrent[group.id]);
    if (!noacgStateOf(group, target)) target = group.initial;
    want[group.id] = target;
  }
  noacgCancelAllTimers();
  noacgQueue.length = 0;
  gsap.killTweensOf('*');
  noacgGroupTl = {};
  noacgResetGraphic();
  noacgStepsPlayed = 0;
  noacgResetPointers();
  for (g = 0; g < noacgMachine.groups.length; g++) {
    group = noacgMachine.groups[g];
    if (want[group.id] === group.initial) continue;
    var route = noacgCanonicalPath(group, want[group.id]);
    if (!route) continue; // unreachable — the group rests at its initial state
    for (var s = 0; s < route.length; s++) {
      var tl = noacgEnterTimeline(group, route[s]);
      if (tl) { tl.pause(0); tl.progress(1, true); tl.kill(); }
      noacgCurrent[group.id] = route[s];
      if (group === noacgMachine.groups[0]) {
        var idx = noacgPathIndex(route[s]);
        if (idx >= 0) noacgStepsPlayed = idx + 1;
      }
    }
    noacgFireCalls(noacgStepFor(group, want[group.id])); // the target state's own effects
    if (opts.timers !== false) noacgArmTimer(group, want[group.id], null);
  }
  return noacgMachineState();
}

// A copy of the machine's pointers — for tests, the editor's state chip, and recovery.
function noacgMachineState() {
  var out = { groups: {} };
  for (var g = 0; g < noacgMachine.groups.length; g++) {
    var id = noacgMachine.groups[g].id;
    out.groups[id] = noacgCurrent[id];
  }
  return out;
}
/* == END ANIMATION == */
