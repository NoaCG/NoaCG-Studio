// THE SPEAKING TIMER: two clocks, one floor (svg-template-library TL6; the built-in Debate Floor,
// types/speakingTimer.ts).
//
// The designer draws a time for each side, `Time A` and `Time B`, and may draw `Speaking A`,
// `Speaking B` (shown while that side holds the floor), `Penalty` (shown while a penalty is marked)
// and a `Speaking time` allowance. Everything that runs is the BUILT-IN's: its machine and controls
// (Switch speaker, Penalty, Reset clocks; the `floor` and `penalty` groups), filtered through
// `withRepaint`, and its two-clock engine (scoreboards/debateFloor.ts), pointed at this graphic's
// own fields. The clocks are stamped `data-speaking`, the attribute the control wire reads
// (control/matchClockWire.ts `speakingClocksFromHtml`), so a renderer rebuilt mid-speech resumes
// from the running clock's stamped origin exactly as the built-in board does.
//
// The clock fields carry the runtime kind `speaking` (their side), so a runtime without the engine
// refuses the table at export (behaviourReads.ts), and `time:expired` lights a side's time-up look.

import { speakingTimerType } from '../types/speakingTimer';
import type { TypeControlEvent } from '../types/graphicType';
import type { PaintRule } from '../../blocks/behaviourData';
import type { BehaviourRecipe, RecipeContext, RecipeField } from './recipe';
import { rolesOf, rowsOf, withRepaint } from './recipe';

const ENGINE_CALLS = ['runSpeakerA', 'runSpeakerB', 'resetClocks', 'applyPenalty', 'clearPenaltyMark'];

export const speakingRecipe: BehaviourRecipe = {
  id: 'speaking',
  name: 'Speaking timer',
  description: 'Two speakers, a clock each, and the floor passing between them: one clock runs at a time.',
  category: 'scoreboard',
  defaultZone: 'bottom-center',
  rows: rowsOf('speaking'),
  roles: rolesOf('speaking'),
  fields: (ctx: RecipeContext): RecipeField[] => [
    // The allowance both clocks reset to: the artwork's own `Speaking time` where drawn, else this.
    ...(ctx.bound('allowance')
      ? []
      : [{ key: 'allowance', label: 'Speaking time each', kind: 'text' as const, value: ctx.value('time', ctx.rows[0]).trim() || '05:00', attrs: { 'data-speaking': 'allowance' } }]),
    // The built-in's penalty field: input only, a number, ten seconds.
    { key: 'penalty', label: 'Penalty (seconds)', kind: 'number', value: '10', attrs: { 'data-speaking': 'penalty' } },
  ],
  path: () => ({ entrance: 'Debate', exitCalls: ['holdClocks'] }),
  machine: () => withRepaint(speakingTimerType.machine ?? {}, ENGINE_CALLS),
  controls: (): TypeControlEvent[] => speakingTimerType.controls ?? [],
  artworkKinds: (ctx) =>
    Object.fromEntries(ctx.rows.flatMap((key) => {
      const id = ctx.fieldId('time', key);
      return id ? [[id, { kind: 'speaking', side: key.toLowerCase() }]] : [];
    })),
  paint: (ctx): PaintRule[] => [
    ...ctx.rows.map((key): PaintRule => ({ look: 'time.speaking', row: key, when: { state: [`floor/speaker${key}`] } })),
    { look: 'penalty', when: { state: ['penalty/docked'] } },
    { look: 'time.out', rows: 'time', when: { facts: ['time:expired'] } },
  ],
};
