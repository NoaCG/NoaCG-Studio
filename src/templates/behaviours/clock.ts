// THE CLOCK, as an INSTANCED recipe (docs/work-specs/jev-svg-import/spec.md, rows 7-11, AC-8).
//
// The countdown (countdown.ts) is a FULL recipe: it owns the default path, so a graphic that
// carries it cannot also carry a score tracker, and a scorebug drawn as one piece of artwork had
// to choose between its scores and its clock. This recipe is the clock as a PART - instanced, so
// it composes beside any one full recipe under the unchanged one-full-recipe guard - and it is the
// match clock a native scorebug already runs, never a third engine: its group is the scorebug's
// own three states (armed, running, stopped), read from the catalog type and namespaced, and its
// calls are the match-clock runtime's (templates/shared/matchClock.ts).
//
// ONE CLOCK PER GRAPHIC. The match-clock runtime drives one clock element, so the compiler refuses
// a second clock part and a clock beside the countdown recipe (importedDesign/behaviour.ts) rather
// than emitting two engines over one readout.
//
// THE MODE IS THE AUTHOR'S, PERSISTED, AND NEVER SWITCHED LIVE (spec "Clock"): counting up starts
// when the operator presses Start; a duration starts on Take and holds at zero; a target time counts
// down to a fixed instant with nothing to pause or reset. Saved countdown graphics keep their own
// recipe and engine - nothing here reads or converts one.
//
// WHAT THIS ROW DECLARES AND WHAT LATER ROWS ADD. Row 7 persists the instance and its mode and
// declares the machine and the controls. The readout's runtime binding (row 8), the namespaced
// wire and recovery (row 9), the target instant (row 10) and the per-mode control polish (row 11)
// land on this declaration; until row 8 the machine's calls find no runtime and do nothing.

import { scorebugType } from '../types/sportsBugs';
import type { TypeBranch, TypeControlEvent, TypeGroup, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext, RecipePath } from './recipe';
import { withRepaint } from './recipe';

/** The modes a clock is imported in, as the proposal contract names them (SVG_INTENT.clock). */
export type ClockMode = 'count-up' | 'duration' | 'target-time';

/** The modes in the order the picker offers them, each in the words the operator reads. */
export const CLOCK_MODES: readonly { mode: ClockMode; label: string }[] = [
  { mode: 'count-up', label: 'Counts up. You start it.' },
  { mode: 'duration', label: 'Counts down from its time. Starts on Take, holds at zero.' },
  { mode: 'target-time', label: 'Counts down to a set time.' },
];

/** The one name a clock instance carries: a graphic has one clock, so it needs no other. */
export const CLOCK_NAME = 'Clock';

/** The role: the text layer that shows the time, which the operator can also type to correct. */
const ROLE = 'clock';

/** The native match clock's event -> this instance's event suffix. */
const EVENTS: Record<string, string> = { clockStart: 'start', clockStop: 'pause', clockReset: 'reset' };

/** The engine's own calls, kept beside the repaint (`withRepaint`). */
const ENGINE_CALLS = ['startMatchClock', 'stopMatchClock', 'resetMatchClock'];

export function clockMode(ctx: RecipeContext): ClockMode {
  const mode = ctx.options.mode;
  return mode === 'duration' || mode === 'target-time' ? mode : 'count-up';
}

/** The scorebug's own clock group, namespaced: its states, timelines and arcs unchanged. */
function clockGroup(ctx: RecipeContext): TypeGroup {
  const native = (scorebugType.machine?.parallel ?? []).find((g) => g.id === 'clock');
  if (!native) throw new Error('Clock: the scorebug type no longer declares its clock group.');
  const mode = clockMode(ctx);
  const rename = (s: TypeBranch): TypeBranch => ({
    ...s,
    edges: s.edges.map((e) => ({ ...e, event: e.event ? ctx.nsId(EVENTS[e.event] ?? e.event) : e.event })),
  });
  if (mode === 'target-time') {
    // A fixed instant has nothing to hold or go back to: one running state, no arrow in.
    const running = native.states.find((s) => s.id === 'running')!;
    return { id: ctx.nsId('clock'), initial: 'running', states: [{ ...running, edges: [] }] };
  }
  // A duration is running from the Take; the entrance's calls are what start it (`path`).
  return { id: ctx.nsId('clock'), initial: mode === 'duration' ? 'running' : native.initial, states: native.states.map(rename) };
}

export const clockRecipe: BehaviourRecipe = {
  id: 'clock',
  name: CLOCK_NAME,
  description: 'A match clock on your own time layer, beside any other behaviour: up or down, started, paused, reset and corrected.',
  category: 'scoreboard',
  defaultZone: 'top-center',
  instanced: true,
  // Bound by the picker, never by a layer name: a clock-shaped sample says a layer COULD be a
  // clock, never which way it counts (spec: recognition does not imply clock direction).
  roles: [{ id: ROLE, label: 'Time', kind: 'field', pool: 'text', required: true, words: /^$/ }],
  fields: () => [],
  path: (ctx): RecipePath =>
    clockMode(ctx) === 'count-up'
      ? {}
      // Starts on Take, from its own time: back to the top first, so a second Take is a new count.
      : { entranceCalls: clockMode(ctx) === 'duration' ? ['resetMatchClock', 'startMatchClock'] : ['startMatchClock'] },
  machine: (ctx): TypeMachine => withRepaint({ parallel: [clockGroup(ctx)] }, ENGINE_CALLS),
  controls: (ctx): TypeControlEvent[] =>
    clockMode(ctx) === 'target-time'
      ? []
      : [
          { event: ctx.nsId('start'), label: 'Start', section: CLOCK_NAME, order: 1 },
          { event: ctx.nsId('pause'), label: 'Pause', section: CLOCK_NAME, order: 2 },
          // Destructive for the countdown's reason: it throws away a count that is on air.
          { event: ctx.nsId('reset'), label: 'Reset', section: CLOCK_NAME, order: 3, destructive: true },
        ],
  paint: () => [],
};
