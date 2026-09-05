// THE COUNTDOWN, as a recipe: it starts on air, and the operator holds, resumes and resets it
// (docs/GRAPHIC_BEHAVIOUR_PLAN.md §13 records the module this replaces and its three decisions).
//
// IT BINDS NO CLOCK OF ITS OWN. The clock is already a field: a text layer whose sample reads
// `M:SS` is bound as a COUNTDOWN in the mapping step, which makes that node the readout and its
// field the length in minutes, and the assembler emits the shared clock engine for it. This recipe
// requires that binding and reads it - one answer to "which layer is the clock".
//
// THE TAKE STARTS THE COUNT (owner ruling, operator-stories-2026-08-27: "duration set beforehand,
// starts on TAKE, at zero HOLDS at 0:00 until taken out"). The parallel group rests in `running`,
// so the entrance's own `startClock` is what starts it; `armed` is what Reset needs - a real
// on-air look with the full length showing and nothing counting - because an event's effect is
// the destination state's calls, and "go again" and "back to the top" cannot both land in one
// state.
//
// THE PAINT HAS A THIRD DRIVER: the bar, the last stretch and the time-up plate follow the count,
// which changes on a runtime tick with neither a state nor a write. The runtime's `clock` kind
// reads the shared engine's own numbers and repaints on its paint hook; only the held mark is a
// state, because it is one - the operator pressed Pause.

import { countdownType } from '../types/clocks';
import type { TypeBranch, TypeGroup, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext } from './recipe';
import { withRepaint } from './recipe';

/** How long before zero the last-stretch look comes up when the operator has not said otherwise.
 *  Ten, not thirty: a class quiz runs thirty-second questions, and a warning armed at thirty is on
 *  from the first tick. A FIELD rather than a constant, so a show that wants thirty types thirty. */
const DEFAULT_WARN_SECONDS = 10;

const START_EVENT = 'start';
const PAUSE_EVENT = 'pause';
const RESET_EVENT = 'reset';

/** One state of the catalog countdown's clock group, its own edges replaced; the timing stays the
 *  catalog's, and `withRepaint` keeps the engine's own pause/resume calls beside the repaint. */
function clockState(group: TypeGroup | undefined, id: string, edges: TypeBranch['edges']): TypeBranch {
  const source = group?.states.find((s) => s.id === id);
  return { id, ...(source?.name ? { name: source.name } : {}), timeline: source?.timeline ?? null, edges };
}

function countdownMachine(): TypeMachine {
  const op = (from: string, to: string, event: string) => ({ from, to, trigger: 'operator' as const, event });
  const clock = (countdownType.machine?.parallel ?? []).find((g) => g.id === 'clock');
  return withRepaint(
    {
      parallel: [
        {
          id: 'clock',
          initial: 'running',
          states: [
            // ONE `start`, not a start and a resume: both mean go, and the structural guard greys
            // it while the clock runs.
            clockState(clock, 'running', [op('paused', 'running', START_EVENT), op('armed', 'running', START_EVENT)]),
            clockState(clock, 'paused', [op('running', 'paused', PAUSE_EVENT)]),
            {
              id: 'armed',
              name: 'Armed',
              // Its own timeline: entering `armed` has to UNDO whatever the last count left on
              // screen, and the clock kind's reset is what does it.
              timeline: { name: 'Reset', duration: 0.25, ease: 'out', calls: [{ time: 0, call: 'noacgClockReset' }], layers: {} },
              // Reset is legal everywhere, itself included: an event with no arrow out of the
              // current state is dropped, and a Reset that silently does nothing is worse than none.
              edges: [op('running', 'armed', RESET_EVENT), op('paused', 'armed', RESET_EVENT), op('armed', 'armed', RESET_EVENT)],
            },
          ],
        },
      ],
    },
    ['resumeClock', 'pauseClock', 'noacgClockReset'],
  );
}

export const countdownRecipe: BehaviourRecipe = {
  id: 'countdown',
  name: 'Countdown',
  description: 'The clock starts on air; the operator holds, resumes and resets it, and your drawings follow the count.',
  category: 'game-timer',
  defaultZone: 'top-center',
  roles: [
    // The clock: the artwork field bound as the countdown. Never matched by name - it is chosen
    // by setting the row's kind, and the recipe finds it.
    { id: 'clock', label: 'Clock', kind: 'field', required: true, countdown: true, words: /^$/ },
    { id: 'bar', label: 'Timer bar', kind: 'layer', paint: ['gauge'], distinctive: true, words: /timer bar|time bar|\bdrain\b|aikapalkki/i },
    { id: 'warning', label: 'Warning', kind: 'layer', paint: ['look'], distinctive: true, words: /\bwarn(?:ing)?\b|last (?:stretch|seconds)|\bhurry\b|varoitus/i },
    { id: 'paused', label: 'Paused', kind: 'layer', paint: ['look'], distinctive: true, words: /\bpaused?\b|\bhold\b|\bheld\b|tauko|tauolla/i },
    { id: 'expired', label: 'Time up', kind: 'layer', paint: ['look'], distinctive: true, words: /time.?s? up|\bexpired\b|\bfinished\b|aika loppu|^aika$/i },
  ],
  // The one owned field: the warning threshold, deliberately OUTSIDE the clock's own field
  // signature, so editing it on air moves the warning and never re-arms the count.
  fields: () => [{ key: 'warnAt', label: 'Warn at (seconds)', kind: 'number', value: String(DEFAULT_WARN_SECONDS) }],
  // The entrance resets the clock kind BEFORE the engine's own startClock (which the assembler
  // appends at the entrance's end), so the card arrives showing the full count with nothing lit.
  path: () => ({ entrance: 'On air', entranceCalls: ['noacgClockReset'] }),
  machine: countdownMachine,
  controls: () => [
    { event: START_EVENT, label: 'Start', section: 'Clock', order: 1 },
    { event: PAUSE_EVENT, label: 'Pause', section: 'Clock', order: 2 },
    // Destructive: it throws away a count that is on air, with no confirmation dialog anywhere
    // in this product - a danger control is how the surveyed tools guard exactly that.
    { event: RESET_EVENT, label: 'Reset', section: 'Clock', order: 3, destructive: true },
  ],
  paint: () => [
    { gauge: 'bar', from: 'clock:fraction' },
    { look: 'warning', when: { facts: ['clock:warning'] } },
    { look: 'expired', when: { facts: ['clock:expired'] } },
    { look: 'paused', when: { state: ['clock/paused'] } },
  ],
  artworkKinds: (ctx: RecipeContext) => {
    const clock = ctx.fieldId('clock');
    return clock ? { [clock]: { kind: 'clock', warnAt: ctx.fieldId('warnAt') ?? undefined } } : {};
  },
};
