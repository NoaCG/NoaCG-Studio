import type { AnimKeyframe, AnimLoop, AnimStep } from './animData';
import { LOOP_TIMING_JS } from '../model/animLoopClock';

export { hasAuthoredLoop, usesAuthoredLoops } from '../model/animLoopClock';

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
