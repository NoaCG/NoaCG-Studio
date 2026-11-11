import type { AnimData, AnimKeyframe, AnimLoop, AnimStep } from './animData';

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

export type RangedLoop = AnimLoop & { range: [number, number] };
interface LoopWindow { period: number; cycle: number; lap: number; total: number }
interface LoopTiming {
  end(step: AnimStep, includeLegacy: boolean, speed: number): number;
  window(loop: RangedLoop): LoopWindow;
  time(loop: RangedLoop, window: LoopWindow, elapsed: number): number;
}
let timing: LoopTiming | undefined;
function shared(): LoopTiming {
  return timing ??= new Function(`${LOOP_TIMING_JS}\nreturn { end: noacgAuthoredCueEnd, window: noacgLoopWindow, time: noacgLoopTime };`)() as LoopTiming;
}

export function loopElapsed(loop: RangedLoop): number {
  const window = shared().window(loop);
  return loop.repeat < 0 ? window.lap : window.total - (loop.phase ?? 0);
}

export function authoredLoopTime(loop: RangedLoop, cueTime: number): number {
  return shared().time(loop, shared().window(loop), cueTime - loop.range[0]);
}

/** The cue keeps its stored duration as a floor, even if an authored finite loop runs longer. */
export function authoredCueEnd(step: AnimStep, includeLegacy = false, speed = 1): number {
  return step.loops ? shared().end(step, includeLegacy, speed) : step.duration;
}

export const hasAuthoredLoop = (step: AnimStep) =>
  Object.values(step.loops ?? {}).some(tracks => Object.values(tracks).some(loop => loop.range));

export const usesAuthoredLoops = (data: AnimData) => data.steps.some(hasAuthoredLoop) ||
  !!data.machine?.groups.some(group => group.states.some(state => state.timeline && hasAuthoredLoop(state.timeline)));

export function validAuthoredLoop(loop: RangedLoop, duration: number, keys: readonly AnimKeyframe[]): boolean {
  if (!Array.isArray(loop.range) || loop.range.length !== 2) return false;
  const [from, to] = loop.range;
  if (!Number.isFinite(from) || !Number.isFinite(to) || from < 0 || to <= from || to > duration ||
      keys.length < 2 || !Number.isSafeInteger(loop.repeat)) return false;
  if (!keys.every((key, index) => Number.isFinite(key.value) && key.time >= from && key.time <= to &&
      (index === 0 || key.time > keys[index - 1].time))) return false;
  const phase = loop.phase ?? 0, window = shared().window(loop);
  return Number.isFinite(phase) && phase >= 0 && phase < (loop.repeat < 0 ? window.lap : window.total) &&
    (loop.repeat < 0 || window.total < 1e7);
}
