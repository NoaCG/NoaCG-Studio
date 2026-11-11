import { LOOP_TIMING_JS } from '../../blocks/animLoopTiming';

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
function noacgClearLoopHolds() { noacgLoopHolds = new WeakMap(); }
// These are the actual CSSPlugin destinations after the anchor/SVG adapters have run.
function noacgLoopChannels(property) {
  var css = gsap.plugins.css;
  return (css && css.aliases[property] || property).split(',').filter(function (channel) {
    return property !== 'autoAlpha' || channel !== 'visibility';
  });
}
function noacgTrackWriter(tl, selector, property, loop) {
  var writer = { selector: selector, channels: noacgLoopChannels(property), loop: loop };
  (tl.__noacgTracks || (tl.__noacgTracks = [])).push(writer);
  return writer;
}
function noacgOwnLoop(tl, animation, selector, property, paint) {
  var loop = { parent: tl, animation: animation, paint: paint };
  loop.writer = noacgTrackWriter(tl, selector, property, loop);
  (tl.__noacgLoops || (tl.__noacgLoops = [])).push(loop);
}
function noacgLoopPainted(loop) {
  return loop.parent ? loop.parent.time() >= loop.animation.startTime() : loop.painted;
}
function noacgHeldLoop(claim) {
  return claim && (noacgLoopPainted(claim.loop) ? claim.loop : claim.previous);
}
function noacgAdoptWriter(writer) {
  Array.prototype.forEach.call(document.querySelectorAll(writer.selector), function (element) {
    var held = noacgLoopHolds.get(element) || Object.create(null);
    writer.channels.forEach(function (channel) {
      if (writer.loop) {
        held[channel] = { loop: writer.loop, previous: noacgHeldLoop(held[channel]) };
      } else {
        delete held[channel];
      }
    });
    noacgLoopHolds.set(element, held);
  });
}
function noacgAdoptCueTracks(tl) {
  if (tl && tl.__noacgTracks) tl.__noacgTracks.forEach(noacgAdoptWriter);
}
function noacgStillHoldsLoop(element, property) {
  var held = noacgLoopHolds.get(element);
  return !!held && noacgLoopChannels(property).some(function (channel) { return noacgHeldLoop(held[channel]); });
}
function noacgRecordHide(tl, selector) {
  (tl.__noacgHides || (tl.__noacgHides = Object.create(null)))[selector] = tl.recent();
}

// GSAP owns the elapsed clock and the timeScale contract. Rendering from absolute time
// gives a silent backward seek the same value as a forward seek, including at a seam.
function noacgAddAuthoredLoop(tl, selector, prop, keys, loop, step, speed) {
  var bounds = noacgLoopWindow(loop);
  var spans = step.spans && step.spans[selector];
  // An explicit span owns visibility. autoAlpha still controls opacity inside it.
  var channel = prop === 'autoAlpha' && spans ? 'opacity' : prop;
  var opacityTrack = channel === 'opacity' || channel === 'autoAlpha';
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
    var vars = {};
    var hide = opacityTrack && tl.__noacgHides && tl.__noacgHides[selector];
    vars[channel] = hide && tl.time() >= hide.startTime() ? 0 : value;
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
  noacgOwnLoop(tl, clock, selector, channel, paint);
}

function noacgRetireLoops(tl) {
  if (!tl || !tl.__noacgLoops) return;
  tl.__noacgLoops.forEach(function (loop) {
    loop.painted = noacgLoopPainted(loop);
    loop.animation.kill();
    loop.parent = loop.animation = loop.paint = loop.writer = null;
  });
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
    var tl = noacgGroupTl[group];
    if (group === groupId || !tl) return;
    (tl.__noacgLoops || []).forEach(function (loop) {
      if (!noacgLoopPainted(loop)) return;
      loop.paint();
      noacgAdoptWriter(loop.writer);
    });
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
