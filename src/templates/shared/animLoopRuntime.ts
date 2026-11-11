import { LOOP_TIMING_JS } from '../../blocks/animLoopTiming';

/** Opt-in cue-owned loop runtime. The base body remains byte-identical for legacy documents. */
export const AUTHORED_LOOP_RUNTIME_JS = String.raw`
// Capability: authored-cue-loops-v1.
${LOOP_TIMING_JS}
function noacgOwnLoop(tl, animation, paint) {
  (tl.__noacgLoops || (tl.__noacgLoops = [])).push({ animation: animation, paint: paint });
}

// GSAP owns the elapsed clock and the timeScale contract. Rendering from absolute time
// gives a silent backward seek the same value as a forward seek, including at a seam.
function noacgAddAuthoredLoop(tl, selector, prop, keys, loop, ease, speed) {
  var bounds = noacgLoopWindow(loop);
  var length = loop.repeat < 0 ? bounds.lap : bounds.total - (loop.phase || 0);
  var curves = keys.map(function (key) { return gsap.parseEase(noacgEaseOf(key.ease || ease)) || gsap.parseEase('power1.out'); });
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
    var vars = {};
    vars[prop] = value;
    gsap.set(selector, vars);
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
  Object.keys(noacgGroupTl).forEach(function (group) { noacgRetireLoops(noacgGroupTl[group]); });
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
    if (group === groupId) return;
    (noacgGroupTl[group].__noacgLoops || []).forEach(function (loop) { loop.paint(); });
  });
}
function noacgFiniteEnd(tl) {
  return tl.getChildren(false).reduce(function (end, child) {
    return child.totalDuration() < 1e9 ? Math.max(end, child.endTime(true)) : end;
  }, 0);
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
