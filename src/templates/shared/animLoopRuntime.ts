import { LOOP_TIMING_JS } from '../../model/animLoopClock';

/** Opt-in cue-owned loop runtime. The base body remains byte-identical for legacy documents. */
export const AUTHORED_LOOP_RUNTIME_JS = String.raw`
// Capability: authored-cue-loops-v1.
${LOOP_TIMING_JS}
var noacgLoopHolds = new WeakMap();
var noacgStyledOut = null;
function noacgClearStyledOut() {
  if (noacgStyledOut) noacgStyledOut.kill();
  noacgStyledOut = null;
}
/** Keep native CSS interpolation out of wildcard Stop kills, on the same GSAP playhead. */
function noacgStyledOutTween(tl, element, vars) {
  var paintVars = Object.assign({}, vars, { paused: true, immediateRender: false, lazy: false });
  delete paintVars.onComplete;
  tl.to(element, paintVars);
  var painter = tl.recent();
  tl.remove(painter);
  var clock = {};
  Object.defineProperty(clock, 'position', {
    get: function () { return painter.progress(); },
    set: function (value) { painter.progress(value, true); }
  });
  tl.to(clock, { position: 1, duration: vars.duration, ease: 'none', onComplete: vars.onComplete });
}
function noacgClearLoopHolds() { noacgLoopHolds = new WeakMap(); }
// CSSPlugin resolves aliases to actual output channels, including each scale axis.
function noacgLoopChannels(property) {
  var css = gsap.plugins.css;
  return (css && css.aliases[property] || property).split(',').filter(function (channel) {
    return property !== 'autoAlpha' || channel !== 'visibility';
  });
}
function noacgTrackMap(map, element) {
  var tracks = map.get(element);
  if (!tracks) { tracks = Object.create(null); map.set(element, tracks); }
  return tracks;
}
// Identity modifiers observe GSAP's actual writes, even during suppressed seeks.
// Until a timeline becomes the real pose, its writes stay private to that timeline.
function noacgTrackModifiers(tl, property, looping, delayed) {
  var writes = tl.__noacgWrites || (tl.__noacgWrites = { pending: new Map(), claims: null });
  var marker = delayed ? {} : looping;
  var earlier = delayed ? new WeakMap() : null;
  var channels = noacgLoopChannels(property), modifiers = {};
  function write(element, channel) {
    var map = writes.claims === noacgLoopHolds ? writes.claims : writes.pending;
    if (!map) return;
    var tracks = noacgTrackMap(map, element);
    if (!delayed) { tracks[channel] = marker; return; }
    var previous = noacgTrackMap(earlier, element);
    if (tl.time() < delayed.startTime()) {
      // Backward seek before a delayed legacy child restores its input pose.
      if (tracks[channel] === marker) tracks[channel] = previous[channel];
      return;
    }
    var latest = tracks[channel];
    if (latest !== marker) {
      var inherited = map !== noacgLoopHolds && noacgLoopHolds.get(element);
      previous[channel] = latest === undefined && inherited ? inherited[channel] : latest;
    }
    tracks[channel] = marker;
  }
  channels.forEach(function (channel) {
    modifiers[channel] = function (value, element) { write(element, channel); return value; };
  });
  if (channels.indexOf(property) < 0) {
    modifiers[property] = function (value, element) {
      channels.forEach(function (channel) { write(element, channel); });
      return value;
    };
  }
  return modifiers;
}
function noacgAdoptCueTracks(tl) {
  var writes = tl && tl.__noacgWrites;
  if (!writes) return;
  if (writes.pending) writes.pending.forEach(function (tracks, element) {
    Object.assign(noacgTrackMap(noacgLoopHolds, element), tracks);
  });
  writes.pending = null;
  writes.claims = noacgLoopHolds;
}
function noacgReleaseCueTracks(tl) {
  if (tl && tl.__noacgWrites) tl.__noacgWrites.claims = null;
}
function noacgStillHoldsLoop(element, property) {
  var held = noacgLoopHolds.get(element);
  return !!held && noacgLoopChannels(property).some(function (channel) { return held[channel]; });
}
function noacgOwnLoop(tl, animation, paint) {
  (tl.__noacgLoops || (tl.__noacgLoops = [])).push({ animation: animation, paint: paint });
}
function noacgRecordHide(tl, selector) {
  var hides = tl.__noacgHides || (tl.__noacgHides = new WeakMap()), tween = tl.recent();
  Array.prototype.forEach.call(document.querySelectorAll(selector), function (element) { hides.set(element, tween); });
}

// GSAP owns the elapsed clock and the timeScale contract. Rendering from absolute time
// gives a silent backward seek the same value as a forward seek, including at a seam.
function noacgAddAuthoredLoop(tl, selector, prop, keys, loop, step, speed) {
  var bounds = noacgLoopWindow(loop);
  var spans = step.spans && step.spans[selector];
  // An explicit span owns visibility. autoAlpha still controls opacity inside it.
  var channel = prop === 'autoAlpha' && spans ? 'opacity' : prop;
  var opacityTrack = channel === 'opacity' || channel === 'autoAlpha';
  var loopWrites = noacgTrackModifiers(tl, channel, true);
  var hideWrites = opacityTrack && noacgTrackModifiers(tl, channel, false);
  var length = loop.repeat < 0 ? bounds.lap : bounds.total - (loop.phase || 0);
  var curves = keys.map(function (key) { return gsap.parseEase(noacgEaseOf(key.ease || step.ease)) || gsap.parseEase('power1.out'); });
  var clock = gsap.timeline({ smoothChildTiming: true });
  var elapsed = -loop.range[0];
  function paint() {
    var time = noacgLoopTime(loop, bounds, elapsed);
    var value = keys[0].value;
    for (var i = 1; i < keys.length && time > keys[i - 1].time; i++) {
      var left = keys[i - 1], right = keys[i];
      value = time >= right.time ? right.value :
        left.value + (right.value - left.value) * curves[i]((time - left.time) / (right.time - left.time));
    }
    var vars = { modifiers: loopWrites };
    vars[channel] = value;
    if (!opacityTrack || !tl.__noacgHides) { gsap.set(selector, vars); return; }
    Array.prototype.forEach.call(document.querySelectorAll(selector), function (element) {
      var hide = tl.__noacgHides.get(element);
      var hidden = hide && tl.time() >= hide.startTime();
      vars[channel] = hidden ? 0 : value;
      vars.modifiers = hidden ? hideWrites : loopWrites;
      gsap.set(element, vars);
    });
  }
  var driver = {};
  Object.defineProperty(driver, 'elapsed', {
    get: function () { return elapsed; },
    set: function (next) { elapsed = next; paint(); }
  });
  // The lead-in owns backward seeks before activation. Its negative clock writes
  // the first key and arrives at elapsed zero, where the chosen phase takes over.
  clock.to(driver, { elapsed: 0, duration: loop.range[0] / speed, ease: 'none' }, 0);
  clock.to(driver, {
    elapsed: length, duration: length / speed, repeat: loop.repeat < 0 ? -1 : 0,
    ease: 'none'
  }, loop.range[0] / speed);
  tl.add(clock, 0);
  noacgOwnLoop(tl, clock, paint);
}

function noacgRetireLoops(tl) {
  if (!tl || !tl.__noacgLoops) return;
  tl.__noacgLoops.forEach(function (loop) { loop.animation.kill(); });
  tl.__noacgLoops = [];
}
function noacgRetireGroupLoops() {
  Object.keys(noacgGroupTl).forEach(function (group) {
    var tl = noacgGroupTl[group];
    noacgRetireLoops(tl);
    noacgReleaseCueTracks(tl);
  });
}
function noacgRunningLoop(tl) {
  return !!tl && (tl.__noacgLoops || []).some(function (loop) {
    return tl.time() + 1e-7 < loop.animation.endTime(true);
  });
}
function noacgRunningGroupLoop() {
  return Object.keys(noacgGroupTl).some(function (group) { return noacgRunningLoop(noacgGroupTl[group]); });
}
function noacgRepaintOtherLoops(groupId) {
  Object.keys(noacgGroupTl).forEach(function (group) {
    var tl = noacgGroupTl[group];
    if (group === groupId || !tl) return;
    noacgAdoptCueTracks(tl);
    (tl.__noacgLoops || []).forEach(function (loop) {
      var at = tl.time();
      if (at >= loop.animation.startTime() && at < loop.animation.endTime(true)) loop.paint();
    });
  });
}
function noacgFiniteEnd(tl) {
  return tl.getChildren(false).reduce(function (end, child) {
    return child !== tl.__noacgTimerArm && child.totalDuration() < 1e9 ? Math.max(end, child.endTime(true)) : end;
  }, 0);
}
// Keep the callback on GSAP's clock and follow the finite children when their rate changes.
function noacgCallAtFiniteEnd(tl, arm) {
  var armed = false;
  tl.call(function () {
    if (!armed) armed = arm();
  }, null, noacgFiniteEnd(tl));
  var marker = tl.__noacgTimerArm = tl.recent();
  (tl.__noacgLoops || []).forEach(function (loop) {
    var clock = loop.animation;
    if (clock.totalDuration() >= 1e9) return;
    var timeScale = clock.timeScale;
    clock.timeScale = function (rate) {
      var result = timeScale.apply(this, arguments);
      if (arguments.length && rate > 0 && !armed) marker.startTime(noacgFiniteEnd(tl));
      return result;
    };
  });
}
function noacgLiveFiniteEnd() {
  var live = noacgGroupTl[noacgMachine.groups[0].id] || noacgLiveTimeline;
  return live ? noacgFiniteEnd(live) : 0;
}
function noacgSettleCue(tl) {
  tl.pause();
  if (tl.duration() < 1e9) tl.progress(1, true);
  else tl.time(noacgFiniteEnd(tl), true);
}
`;
