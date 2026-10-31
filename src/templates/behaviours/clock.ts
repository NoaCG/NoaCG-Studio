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
// declares the machine and the controls; row 8 binds the readout (`clockReadout`, read by
// importedDesign/svgBind.ts and svg.ts, which emit the match-clock runtime for it). The namespaced
// wire and recovery (row 9), the target instant (row 10) and the per-mode control polish (row 11)
// land on this declaration.

import { scorebugType } from '../types/sportsBugs';
import type { TypeBranch, TypeControlEvent, TypeGroup, TypeMachine } from '../types/graphicType';
import type { BehaviourRecipe, RecipeContext, RecipePath } from './recipe';
import { withRepaint } from './recipe';

/** The modes a clock is imported in, as the proposal contract names them (SVG_INTENT.clock). */
export type ClockMode = 'count-up' | 'duration' | 'target-time';

/** The modes in the order the picker offers them: the picker's words, and the summary's. */
export const CLOCK_MODES: readonly { mode: ClockMode; label: string; summary: string }[] = [
  { mode: 'count-up', label: 'Counts up. You start it.', summary: 'a clock counting up' },
  { mode: 'duration', label: 'Counts down from its time. Starts on Take, holds at zero.', summary: 'a clock counting down from its time' },
  { mode: 'target-time', label: 'Counts down to a set time.', summary: 'a clock counting down to a set time' },
];

/** The modes the import step OFFERS: a control is offered only when it can change the graphic
 *  (wizard/offer-control-can-change-graphic-front), and a target time has no instant to count to
 *  until row 10 resolves one, so it waits for that row. A stored one still compiles. */
export const CLOCK_PICKER_MODES = CLOCK_MODES.filter((m) => m.mode !== 'target-time');

/** The one name a clock instance carries: a graphic has one clock, so it needs no other. */
export const CLOCK_NAME = 'Clock';

/**
 * THE READOUT'S TWO ATTRIBUTES, as the match-clock runtime reads them off its element
 * (templates/shared/matchClock.ts): which way it counts, and the time Reset returns to. The time is
 * the one the designer drew, as a native scorebug's is its period length; a duration counts down
 * from it, and so does a target time until its instant lands (row 10).
 */
export function clockReadout(mode: ClockMode, drawn: string): { count: 'up' | 'down'; start: string } {
  return { count: mode === 'count-up' ? 'up' : 'down', start: drawn.trim() };
}

/** A time the match clock reads as written: minutes and seconds ("12:08"). It parses "1:30:00"
 *  as 1:30, so a layer drawn in hours is not offered the clock, and is never a duration's length. */
export const CLOCK_TIME = /^\d{1,2}:\d{2}$/;

/** The role: the text layer that shows the time, which the operator can also type to correct. */
const ROLE = 'clock';

/** The native match clock's event -> this instance's event suffix. */
const EVENTS: Record<string, string> = { clockStart: 'start', clockStop: 'pause', clockReset: 'reset' };

/** The engine's own calls, kept beside the repaint (`withRepaint`). */
const ENGINE_CALLS = ['startMatchClock', 'stopMatchClock', 'resetMatchClock'];

/** A persisted mode as the clock reads it: one it does not know counts up, never a guessed countdown. */
export function asClockMode(mode: unknown): ClockMode {
  return mode === 'duration' || mode === 'target-time' ? mode : 'count-up';
}

export function clockMode(ctx: RecipeContext): ClockMode {
  return asClockMode(ctx.options.mode);
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
  // clock, never which way it counts (spec: recognition does not imply clock direction). The
  // words match nothing, not even an unnamed layer, so joining the name proposal's list changes
  // nothing.
  roles: [{ id: ROLE, label: 'Time', kind: 'field', pool: 'text', required: true, words: /(?!)/ }],
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
