// The OPERATOR ACTION LOG (docs/CLOUD_PLAYOUT.md §4b): the command log, read back in the words
// an operator would use.
//
// The log has always existed — it is what makes recovery possible (docs/CONTROL_LAYER.md) — and
// nothing ever showed it to the person driving the show. "Did that take actually go?" was a
// question the system could answer and did not.
//
// What it shows is COMMANDS: what somebody asked the production to do. The two meta rows are
// deliberately absent. `staged` is typing (debounced, one row per few keystrokes, per operator)
// and would drown everything else; `live` is the RENDERER reporting back, which is a different
// fact with its own surfaces — the live chips and the renderer-connected indicator. Mixing all
// three produced a feed nobody could read, which is the failure mode of most event logs.

import type { ControlEventRow } from './hostedControl';
import type { ControlButton } from '../blocks/animMachine';

/** One readable line of the log. `at` is null when the row's time is genuinely unknown. */
export interface LogEntry {
  /** The log row id, or a negative counter for a rehearsal's own local entries. */
  id: number;
  at: string | null;
  graphic: string;
  /** `note` is the one kind no LOG ROW produces: it is the surface saying something the operator
   *  asked for did not happen — a combined control's step the machine dropped, or a tail an Out
   *  cancelled (docs/CONTROL_PANEL_ANY_GRAPHIC.md §6b). Those are not commands and were never
   *  written to the log, so the feed is the only place on the surface that can say them. */
  kind: 'take' | 'out' | 'update' | 'next' | 'play' | 'stop' | 'event' | 'snap' | 'note';
  text: string;
}

/** How many entries a page keeps. A 24/7 production would otherwise grow this without bound,
 *  and nobody scrolls past a few hundred lines of an operator log looking for anything. */
export const LOG_LIMIT = 200;

/**
 * Turn one log row into a readable line, or null when it is not an operator action.
 * `cueLabel` resolves a cue id to its name — the operator wrote that name, so it is what they
 * will look for; the raw id is meaningless to them and is never shown.
 *
 * `eventLabel` does the same for a ⚡ action: the wire carries the machine's event id (`judge`),
 * and the operator pressed a button called "Reveal correct". Printing the id told a student the
 * log was about something other than what they did. Without a label (a graphic this surface
 * cannot read, a control since removed) the id is still better than nothing, so it falls back.
 */
export function describeLogRow(
  row: ControlEventRow,
  cueLabel: (cueId: string) => string | null,
  eventLabel?: (graphic: string, event: string) => string | null,
): LogEntry | null {
  const msg = row.msg;
  const base = { id: row.id, at: row.created_at ?? null, graphic: row.graphic };
  switch (msg.t) {
    case 'cue':
      return msg.cue
        ? { ...base, kind: 'take', text: `Took “${cueLabel(msg.cue) ?? 'a cue'}”` }
        : { ...base, kind: 'out', text: 'Out' };
    case 'update': {
      const n = Object.keys(msg.data ?? {}).length;
      return { ...base, kind: 'update', text: n === 1 ? 'Updated 1 field' : `Updated ${n} fields` };
    }
    case 'play':
      return { ...base, kind: 'play', text: 'Played in' };
    case 'stop':
      return { ...base, kind: 'stop', text: 'Played out' };
    case 'next':
      return { ...base, kind: 'next', text: 'Next step' };
    case 'event':
      return { ...base, kind: 'event', text: `Pressed “${eventLabel?.(row.graphic, msg.event) ?? msg.event}”` };
    case 'snap':
      return { ...base, kind: 'snap', text: 'Snapped to a state (recovery)' };
    default:
      // 'staged', 'live', 'hello', and anything a future version adds. Unknown rows are DROPPED
      // rather than printed raw: a log that prints JSON at an operator has stopped being a log.
      return null;
  }
}

/**
 * The name a ⚡ press goes by in the log: the label on the button the operator pressed. Two
 * buttons of one graphic can share a label - a panel of scores has a "+1" per panelist - so a
 * shared label carries its section too ("Panelist 2 · +1"), or two different presses would read
 * as the same one. Null when the graphic declares no such event.
 */
export function eventLogLabel(buttons: ControlButton[], event: string): string | null {
  const button = buttons.find((b) => b.event === event);
  if (!button) return null;
  const shared = buttons.some((b) => b !== button && b.label === button.label);
  return shared && button.section ? `${button.section} · ${button.label}` : button.label;
}

/** Newest first, capped, and idempotent on row id — a re-delivered row (the tail refill after a
 *  socket gap replays what the socket already brought) must not appear twice. */
export function appendLogEntries(current: LogEntry[], incoming: LogEntry[]): LogEntry[] {
  if (incoming.length === 0) return current;
  const seen = new Set(current.map((e) => e.id));
  const fresh = incoming.filter((e) => !seen.has(e.id));
  if (fresh.length === 0) return current;
  return [...fresh.reverse(), ...current].slice(0, LOG_LIMIT);
}

/** The clock an operator reads: local wall time, seconds included, because the question is
 *  always "was that the take I just did or the one before it?". Undated rows say so. */
export function logTime(at: string | null): string {
  if (!at) return '—';
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? '—'
    : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}
