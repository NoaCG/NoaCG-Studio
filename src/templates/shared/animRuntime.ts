// Timeline v2 — the runtime interpreter emitted into every data-driven template
// (docs/TIMELINE_V2_PLAN.md §2). It reads the NOACG_ANIM data literal and defines the
// SAME builder globals the whole platform already depends on (buildInTimeline /
// buildOutTimeline / revealNextStep), so the simulator, wizard thumbnails, control
// engine, and every export work unchanged. Plain commented ES5, no dependencies beyond
// the bundled GSAP, no eval — a professional can read it, or delete the whole region
// and write raw GSAP (the timeline UI then steps aside).

import { ANIMATION_MARK_CLOSE, ANIMATION_MARK_OPEN } from '../lowerThirds/animPresets';
import { locateAnimData, serializeAnimData, spliceAnimData, type AnimData } from '../../blocks/animData';
import { ANIM_INTERPRETER_BEFORE_HOLD_HASH, ANIM_INTERPRETER_BEFORE_SHARED_EASE_HASH, ANIM_INTERPRETER_BEFORE_WHOLE_EASE_HASH, ANIM_INTERPRETER_PRE_OUT_JS } from './animRuntimeLegacy';
import { NOACG_EASE_JS, needsEaseRuntime, needsHoldRuntime } from './easeRuntime';
import { contentHash } from '../../model/contentHash';

/** The interpreter body — identical in every template. Kept as one exported string so the
 *  emitter, the AI prompt, and (later) the convert-on-edit path all ship the same code. */
export const ANIM_INTERPRETER_JS = `// ---- The interpreter (the same in every template — edit the DATA above instead) ----
// Steps play on the operator's cues: steps[0] on play(), each middle step on one next()
// press, the last step on stop(). Keyframe times sit on the step's local clock and are
// divided by the speed knob. A keyframe's ease is the ease INTO it (default: the step's).
// When the data carries a "machine", the same cues drive its default path, and the state
// engine below adds operator events (noacgDispatch), timers, and instant snap (noacgSnap).
${NOACG_EASE_JS}

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
function noacgBuildExit(step, interrupted, silent) {
  var speed = NOACG_ANIM.speed || 1;
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
  var effects = Object.assign({}, step, { layers: {}, spans: undefined, hides: undefined, loops: undefined });
  if (silent) { effects.calls = []; effects.dynamics = []; }
  var tl = buildStepTimeline(effects);
  // Gate only already-visible layers. Object targets survive legacy repeated stop().
  if (!interrupted) Object.keys(step.spans || {}).forEach(function (selector) {
    document.querySelectorAll(selector).forEach(function (element) {
      if (!noacgExitVisible(element, selector)) return;
      var spans = step.spans[selector], times = [0];
      var proxy = noacgExitProxy(element, 'visibility', getComputedStyle(element).visibility);
      spans.forEach(function (span) { times.push(span.start, span.end); });
      times.sort(function (a, b) { return a - b; }).forEach(function (time) {
        tl.set(proxy, { value: noacgSpanVisible(spans, time, step.duration) ? 'visible' : 'hidden' }, time / speed);
      });
    });
  });
  (step.hides || []).forEach(function (selector) {
    if (step.spans && step.spans[selector] !== undefined) return;
    document.querySelectorAll(selector).forEach(function (element) {
      tl.set(noacgExitProxy(element, 'opacity', gsap.getProperty(element, 'opacity')), { value: 0 }, step.duration / speed);
    });
  });
  entries.forEach(function (entry) {
    var keys = entry.keys;
    var proxy = noacgExitProxy(entry.element, entry.prop, entry.live);
    if (interrupted && keys.length > 1 && keys[keys.length - 1].time > keys[0].time) {
      var last = keys[keys.length - 1], ease = noacgWholeEase(last.ease || step.ease), shape = noacgEaseParse(ease);
      // A final jump (a Hold played backwards) happens where its own segment starts, as it does
      // when Out is not interrupted; until then the live value holds.
      var from = shape && shape.kind === 'jump' ? keys[keys.length - 2].time : keys[0].time;
      tl.to(proxy, { value: last.value, duration: (last.time - from) / speed, ease: noacgEaseOf(ease) }, from / speed);
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
  var tl = noacgBuildExit(step, interrupted, silent);
  // Press-revealed layers OUTSIDE the root miss its hide — fade them with the exit
  // (unless the Out step animates them itself). Containment is checked live.
  var root = document.querySelector(NOACG_ANIM.root);
  for (var s = 1; s < steps.length - 1; s++) {
    (steps[s].reveals || []).forEach(function (selector) {
      var el = document.querySelector(selector);
      if (el && root && !root.contains(el) && !steps[steps.length - 1].layers[selector]) {
        tl.to(noacgExitProxy(el, 'opacity', gsap.getProperty(el, 'opacity')), { value: 0, duration: Math.min(0.3, step.duration) / (NOACG_ANIM.speed || 1) }, 0);
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

// revealNextStep(): one default-path advance per next() press; null when only Out remains.
function revealNextStep() {
  if (NOACG_ANIM.machine) return noacgMachineNext();
  if (noacgStepsPlayed >= NOACG_ANIM.steps.length - 1) return null;
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
}`;

/** The data block's header comment — emitted above the literal (JSON carries no comments,
 *  so the explanation lives here, where hand edits preserve it). */
const DATA_HEADER = `// The graphic's animation as DATA. Steps play in order — the first on ▶ play(), each
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
// you: edit a number and press play.`;

/** Emit the full marked ANIMATION region for a data-driven template. */
export function emitAnimRegion(data: AnimData): string {
  return `${ANIMATION_MARK_OPEN}
${DATA_HEADER}
var NOACG_ANIM = ${serializeAnimData(data)};

${ANIM_INTERPRETER_JS}
${ANIMATION_MARK_CLOSE}`;
}

/** THE UPGRADE GATE: true when a template's frozen interpreter carries the state-machine
 *  engine. spliceAnimData replaces only the data literal — a saved template keeps whatever
 *  interpreter it was emitted with — so machine-bearing data must NEVER be spliced under an
 *  older interpreter that can't run it. A machine writer checks this first and re-emits the
 *  whole region (replaceRegionWithAnimData) when it is false. */
export function hasMachineRuntime(js: string): boolean {
  return /function noacgDispatch/.test(js);
}

/** Same pairing idea for TRANSITION STYLES: a `style` on an arrow needs the interpreter
 *  that consumes it (noacgStyleTimeline) — under an older one it would parse and silently
 *  never play. */
export function hasTransitionStyleRuntime(js: string): boolean {
  return /function noacgStyleTimeline/.test(js);
}

/** The 'cut' style landed after the first style runtime: a frozen interpreter with styles
 *  but no cut would silently play the entry timeline instead, so a cut-bearing write must
 *  re-emit the region. The emitted `known` map is the marker. */
export function hasCutStyleRuntime(js: string): boolean {
  return hasTransitionStyleRuntime(js) && /\bcut: 1\b/.test(js);
}

/** The materialised entrance/exit edges landed after the first style runtime: a styled
 *  lifecycle edge needs the interpreter whose play()/stop() consult it (noacgLifecycleEdge) —
 *  under an older one the style would parse and silently never play. */
export function hasLifecycleStyleRuntime(js: string): boolean {
  return /function noacgLifecycleEdge/.test(js);
}

/** Does any arrow carry a transition style (the reserved fields, now consumed)? */
export function dataUsesTransitionStyles(data: AnimData): boolean {
  return (data.machine?.groups ?? []).some((g) => g.transitions.some((t) => t.style !== undefined));
}

/** Does a LIFECYCLE edge carry a style (the newest pairing check — see above)? */
export function dataUsesLifecycleStyle(data: AnimData): boolean {
  return (data.machine?.groups ?? []).some((g) =>
    g.transitions.some((t) => t.trigger === 'lifecycle' && t.style !== undefined),
  );
}

/** Does any arrow carry the 'cut' style specifically (the newer pairing check)? */
export function dataUsesCutStyle(data: AnimData): boolean {
  return (data.machine?.groups ?? []).some((g) => g.transitions.some((t) => t.style === 'cut'));
}

/** True when the interpreter carries the shared ease runtime (G01, templates/shared/easeRuntime.ts). */
export function hasEaseRuntime(js: string): boolean {
  return /function noacgEase\(/.test(js);
}

/** True when the interpreter's ease grammar plays hold and jump (shared-ease-v2, R1.2a.2). */
export function hasHoldRuntime(js: string): boolean {
  return js.includes('Capability: shared-ease-v2.');
}

/** True when any ease in the data passes `needs`. */
function dataUses(data: AnimData, needs: (text: string) => boolean): boolean {
  const visit = (value: unknown): boolean => Array.isArray(value) ? value.some(visit)
    : !!value && typeof value === 'object' && Object.entries(value).some(([key, item]) =>
      key === 'ease' && typeof item === 'string' ? needs(item) : visit(item));
  return visit(data);
}
/** True when any ease in the data is a form only the shared ease runtime plays (cubic-bezier,
 *  slice, hold, jump): under an older interpreter GSAP would silently replace it with its default. */
export const dataUsesExactEase = (data: AnimData) => dataUses(data, needsEaseRuntime);
/** True when any ease in the data is hold or jump, which the G01 and R1.2a.1 grammars lack. */
export const dataUsesHoldEase = (data: AnimData) => dataUses(data, needsHoldRuntime);

/**
 * THE machine-safe write — what every editing surface should use.
 *
 * `spliceAnimData` replaces only the object literal, so a saved template keeps whatever
 * interpreter it was emitted with. That is fine until the data grows a MACHINE: machine-bearing
 * data under a pre-machine interpreter would parse and then do nothing. When that pairing would
 * break, re-emit the whole region instead (the same move the `hides` early-exit makes) — and
 * identically when the data grows a transition STYLE the frozen interpreter cannot play.
 */
export function writeAnimData(js: string, data: AnimData): string | null {
  if ((data.steps.some(step => step.spans) || dataUsesExactEase(data)) &&!js.replace(/\r\n/g, '\n').includes(ANIM_INTERPRETER_JS.replace(/\r\n/g, '\n'))) {
    return writeOutData(js, data);
  }
  if (data.machine && !hasMachineRuntime(js)) return replaceRegionWithAnimData(js, data);
  if (dataUsesTransitionStyles(data) && !hasTransitionStyleRuntime(js)) return replaceRegionWithAnimData(js, data);
  if (dataUsesCutStyle(data) && !hasCutStyleRuntime(js)) return replaceRegionWithAnimData(js, data);
  if (dataUsesLifecycleStyle(data) && !hasLifecycleStyleRuntime(js)) return replaceRegionWithAnimData(js, data);
  return spliceAnimData(js, data);
}

/** Exact known bodies only: a capability comment alone cannot authorize replacement. */
export function writeOutData(js: string, data: AnimData): string | null {
  const text = js.replace(/\r\n/g, '\n');
  const location = locateAnimData(text), start = text.indexOf(ANIMATION_MARK_OPEN), end = text.indexOf(ANIMATION_MARK_CLOSE);
  if (!location || start < 0 || end < location.end) return null;
  const prefix = text.slice(start, location.start).trim();
  if (prefix !== `${ANIMATION_MARK_OPEN}\n${DATA_HEADER}\nvar NOACG_ANIM =`.replace(/\r\n/g, '\n')) return null;
  const body = text.slice(location.end, end).replace(/^;\s*/, '').trim();
  if (body === ANIM_INTERPRETER_JS.replace(/\r\n/g, '\n').trim()) return spliceAnimData(js, data);
  const beforeSpans = ANIM_INTERPRETER_PRE_OUT_JS
    .replace(/\/\/ Visibility is independent of opacity\.[\s\S]*?\n}\n\n/, '')
    .replace(/ {2}Object\.keys\(step\.spans \|\| \{\}\)\.forEach[\s\S]*?\n {2}}\);\n/, '')
    .replace(/^ +if \(step(?:s\[0\])?\.spans[^\n]+\n/gm, '');
  if (![ANIM_INTERPRETER_PRE_OUT_JS, beforeSpans].some(known => body === known.replace(/\r\n/g, '\n').trim()) &&
      ![ANIM_INTERPRETER_BEFORE_SHARED_EASE_HASH, ANIM_INTERPRETER_BEFORE_WHOLE_EASE_HASH, ANIM_INTERPRETER_BEFORE_HOLD_HASH].includes(contentHash(body))) return null;
  return replaceRegionWithAnimData(js, data);
}

/** Swap a template's marked region for the data-driven emit (the converter's writer). */
export function replaceRegionWithAnimData(js: string, data: AnimData): string | null {
  const start = js.indexOf(ANIMATION_MARK_OPEN);
  const end = js.indexOf(ANIMATION_MARK_CLOSE);
  if (start === -1 || end === -1) return null;
  return js.slice(0, start) + emitAnimRegion(data) + js.slice(end + ANIMATION_MARK_CLOSE.length);
}
