/** The authored clock, shared verbatim by the editor and emitted interpreter. */
export const LOOP_TIMING_JS = String.raw`function noacgLoopWindow(loop) {
  var period = loop.range[1] - loop.range[0], delay = loop.repeatDelay || 0;
  var cycle = period + delay;
  return {
    period: period,
    cycle: cycle,
    lap: cycle * (loop.yoyo ? 2 : 1),
    total: loop.repeat < 0 ? Infinity : loop.repeat * cycle + period
  };
}
function noacgLoopTime(loop, window, elapsed) {
  if (elapsed < 0) return loop.range[0];
  var cursor = Math.min(window.total, elapsed + (loop.phase || 0));
  var pass = Math.floor(cursor / window.cycle);
  var within = cursor - pass * window.cycle;
  // The arriving sample owns a pass boundary, including a zero-delay repeat.
  // Allow for GSAP's rounding at the boundary of two decimal time ranges.
  if (pass > 0 && within < 1e-7) { pass--; within = window.cycle; }
  var offset = Math.min(window.period, within);
  return loop.range[0] + (loop.yoyo && pass % 2 ? window.period - offset : offset);
}
function noacgAuthoredCueEnd(step, includeLegacy, speed) {
  var end = step.duration;
  Object.keys(step.loops || {}).forEach(function (selector) {
    var tracks = step.loops[selector];
    Object.keys(tracks).forEach(function (prop) {
      var loop = tracks[prop];
      if (loop.repeat < 0) return;
      if (loop.range) {
        end = Math.max(end, loop.range[0] + noacgLoopWindow(loop).total - (loop.phase || 0));
      } else if (includeLegacy) {
        var keys = step.layers[selector] && step.layers[selector][prop];
        if (!keys || !keys.length) return;
        var first = keys[0].time, period = keys[keys.length - 1].time - first;
        var length = (loop.repeat + 1) * period + loop.repeat * (loop.repeatDelay || 0);
        if (length / speed < 1e9) end = Math.max(end, first + length);
      }
    });
  });
  return end;
}`;

interface LoopTracks {
  loops?: Record<string, Record<string, { range?: readonly number[] }>>;
}

interface LoopDocument {
  steps: readonly LoopTracks[];
  machine?: { groups: readonly { states: readonly { timeline?: LoopTracks }[] }[] };
}

export const hasAuthoredLoop = (step: LoopTracks) =>
  Object.values(step.loops ?? {}).some(tracks => Object.values(tracks).some(loop => loop.range));

export const usesAuthoredLoops = (data: LoopDocument) => data.steps.some(hasAuthoredLoop) ||
  !!data.machine?.groups.some(group => group.states.some(state => state.timeline && hasAuthoredLoop(state.timeline)));
