// THE STEP CONTROLS OF A FOREIGN OGraf GRAPHIC (docs/work-specs/playout-ograf-controls/spec.md,
// E2.2, AC-2): relative forward and backward, Goto, and `skipAnimation`, judged against what the
// runtime last said, never against a guess.
//
// OGraf's step model (Specification.md, `playAction`): `stepCount` 0 plays in and out by itself, 1
// (or absent) holds one step, more than 1 moves between steps, -1 is dynamic, so the count is the
// Graphic's own and can change while it airs. `playAction({goto})` or `({delta})` answers the
// step it is on, and no `currentStep` once it has played to its end. So:
//
//   - A fixed count refuses a Goto outside it, and a relative step that would leave it.
//   - A dynamic count refuses only what is plainly no step (below the first); a Goto past the end
//     is the Graphic's to answer, and its answer is where it is.
//   - A relative step needs a known position: before the Graphic has answered one, after it
//     played to its end, or after an answer that did not come, only Goto moves it.
//   - `skipAnimation` is OGraf's (every action MUST honour it). It is never NoaCG's Snap, and Snap
//     is never offered as a foreign Goto: a native graphic has a state machine, not steps, and its
//     Continue stays » Next.
//
// Pure, no DOM: the output stage (src/output/foreignOgraf.ts) asks it before every step it sends
// and folds every answer back in, and Node tests import it (scripts/ograf-steps.test.mjs).

/** One step the operator asks for: exactly one of `delta` and `goto`. */
export type OgrafStepOp = ({ delta: number; goto?: undefined } | { goto: number; delta?: undefined }) & { skipAnimation?: boolean };

/** Where the runtime is, as far as its answers say: a step, played to its end, or not known. */
export type OgrafStepAt = number | 'end' | null;

/** What a step is judged against: the manifest's declared count and the runtime's last answer. */
export interface OgrafStepRuntime {
  /** The manifest's `stepCount` as declared (undefined: absent, which OGraf reads as 1). */
  declared: unknown;
  at: OgrafStepAt;
}

/** The `playAction` parameters a step sends. */
export interface OgrafStepParams {
  goto?: number;
  delta?: number;
  skipAnimation?: true;
}

export type OgrafStepJudged = { ok: true; params: OgrafStepParams } | { ok: false; refusal: string };

/** The largest relative step and the furthest Goto a press may ask for: past these nothing an
 *  operator means is a step, and a runaway value never reaches a stranger's code. */
export const OGRAF_STEP_DELTA_MAX = 100;
export const OGRAF_STEP_GOTO_MAX = 9_999;

/** The count a manifest declares, as OGraf reads it: absent is 1; null when it is unreadable. */
export function declaredSteps(declared: unknown): number | null {
  if (declared === undefined) return 1;
  return typeof declared === 'number' && Number.isInteger(declared) && declared >= -1 ? declared : null;
}

/** A step for the operator: OGraf counts from 0, people from 1. */
const stepWord = (i: number) => `step ${i + 1}`;

/** Judge one step against the runtime: the `playAction` parameters to send, or why it is refused. */
export function ografStepFor(op: OgrafStepOp, runtime: OgrafStepRuntime): OgrafStepJudged {
  const hasDelta = op.delta !== undefined;
  const hasGoto = op.goto !== undefined;
  if (hasDelta === hasGoto) return { ok: false, refusal: 'A step is either a move or a Goto.' };
  if (op.skipAnimation !== undefined && typeof op.skipAnimation !== 'boolean') return { ok: false, refusal: 'Not a step.' };
  const skip = op.skipAnimation === true ? { skipAnimation: true as const } : {};
  const count = declaredSteps(runtime.declared);
  if (count === null) return { ok: false, refusal: 'Its step count is unreadable, so it takes no step.' };
  if (count === 0) return { ok: false, refusal: 'It plays in and out by itself; it has no steps.' };
  const at = runtime.at;
  if (hasGoto) {
    const goto = op.goto as number;
    if (!Number.isInteger(goto) || goto < 0 || goto > OGRAF_STEP_GOTO_MAX) return { ok: false, refusal: 'Not a step.' };
    if (count > 0 && goto >= count) return { ok: false, refusal: `It has ${count === 1 ? 'one step' : `steps 1 to ${count}`}; there is no ${stepWord(goto)}.` };
    return { ok: true, params: { goto, ...skip } };
  }
  const delta = op.delta as number;
  if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > OGRAF_STEP_DELTA_MAX) return { ok: false, refusal: 'Not a step.' };
  if (at === null) return { ok: false, refusal: 'Where it is is not known yet; Goto a step.' };
  if (at === 'end') return { ok: false, refusal: 'It has played to its end; Goto a step.' };
  const target = at + delta;
  if (target < 0) return { ok: false, refusal: `It is on ${stepWord(at)}; there is no step before the first.` };
  if (count > 0 && target >= count) return { ok: false, refusal: `It is on ${stepWord(at)} of ${count}; Out ends it.` };
  return { ok: true, params: { delta, ...skip } };
}

/** What a `playAction` answer says about where the runtime is. A success names its step, or none
 *  at the end; a refusal (4xx) moved nothing; anything else leaves the position unknown. */
export function ografStepAfter(at: OgrafStepAt, answer: { statusCode: number; currentStep?: number } | null): OgrafStepAt {
  if (!answer) return null;
  if (answer.statusCode >= 200 && answer.statusCode < 300) {
    const step = answer.currentStep;
    return typeof step === 'number' && Number.isInteger(step) && step >= 0 ? step : 'end';
  }
  if (answer.statusCode >= 400 && answer.statusCode < 500 && answer.statusCode !== 408) return at;
  return null;
}
