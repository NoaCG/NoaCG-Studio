// WHAT AN OUTPUT SAYS A PUBLISHED FOREIGN OGRAF PACKAGE DID (docs/work-specs/playout-ograf-rundown/
// spec.md, E3.2a, AC-2).
//
// The output stage mounts a stranger's package and hears every call's answer (output/foreignOgraf.ts);
// its report carries the latest as `state.ograf` (output/main.ts). The production page reads it back
// off the log's `live` rows and shows it apart from its own PROGRAM monitor, which is a simulation
// that never loads a package. Only this is "confirmed": a Take the server accepted is sent, not on
// air, and an HTTP 200 or a logged row says nothing about what the Graphic did.
//
// Pure and DOM-free: scripts/ograf-outcome.test.mjs runs it in Node.

import type { OgrafCall } from './ografHost.ts';

/** What one call came to (output/foreignOgraf.ts `OgrafAnswer`), or a package the output holds no
 *  frame for. */
export type OgrafOutcomeStatus = 'done' | 'rejected' | 'timeout' | 'gone' | 'refused' | 'unmounted';

/**
 * A PUBLISHED FOREIGN PACKAGE'S LAST WORD on a stage. `i` is the mounted instance (its frame's
 * `data-instance`), `call` and `status` its last settled call, `on` whether its last Take or Out the
 * Graphic accepted left it up, `step` where its answers put it (a step, `end`, or null when unknown),
 * and `data` the values it accepted last, as it was given them (typed values stay typed).
 * `unmounted` is a package the stage holds no frame for, `msg` saying why.
 */
export type OgrafOutcome =
  | { i: string; call: OgrafCall; status: Exclude<OgrafOutcomeStatus, 'unmounted'>; code?: number; msg?: string; step: number | 'end' | null; on: boolean; data?: Record<string, unknown> }
  | { i: null; status: 'unmounted'; msg: string; on: boolean };

const STATUSES: readonly string[] = ['done', 'rejected', 'timeout', 'gone', 'refused'];
const CALLS: readonly string[] = ['mount', 'play', 'stop', 'update', 'custom'];
const MSG_MAX = 200;
const INSTANCE = /^[0-9a-f]{1,32}$/;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A report's `state.ograf`, read: anything malformed is no word at all, never a success. The values
 *  are not kept here: the page shows what the Graphic did, not what it holds. */
export function readOgrafOutcome(state: unknown): OgrafOutcome | null {
  if (!isRecord(state) || !isRecord(state.ograf)) return null;
  const o = state.ograf;
  const msg = typeof o.msg === 'string' ? o.msg.slice(0, MSG_MAX) : undefined;
  const on = o.on === true;
  if (o.status === 'unmounted') return { i: null, status: 'unmounted', msg: msg || 'not loaded', on: false };
  if (typeof o.i !== 'string' || !INSTANCE.test(o.i) || typeof o.status !== 'string' || STATUSES.indexOf(o.status) < 0) return null;
  if (typeof o.call !== 'string' || CALLS.indexOf(o.call) < 0) return null;
  const step = o.step === 'end' ? 'end' : typeof o.step === 'number' && Number.isInteger(o.step) && o.step >= 0 ? o.step : null;
  const code = typeof o.code === 'number' && Number.isInteger(o.code) ? o.code : undefined;
  return {
    i: o.i,
    call: o.call as OgrafCall,
    status: o.status as Exclude<OgrafOutcomeStatus, 'unmounted'>,
    ...(code !== undefined ? { code } : {}),
    ...(msg ? { msg } : {}),
    step,
    on,
  };
}

const CALL_WORD: Record<string, string> = { mount: 'its load', play: 'the Take', stop: 'the Out', update: 'the update', custom: 'the action' };

/**
 * The page's line for it: what the OUTPUT says, never what this page sent. `tone` is how it is drawn:
 * `ok` on or off as asked, `bad` refused or never loaded, `unknown` no answer or a replaced instance.
 */
export function ografOutcomeWords(name: string, o: OgrafOutcome): { text: string; tone: 'ok' | 'bad' | 'unknown' } {
  if (o.status === 'unmounted') return { text: `${name}: the output could not load it (${o.msg})`, tone: 'bad' };
  const what = CALL_WORD[o.call] || 'a call';
  const said = o.msg ? `: ${o.msg}` : '';
  if (o.status === 'rejected') return { text: `${name}: the graphic refused ${what}${o.code ? ` (${o.code}${said})` : said}`, tone: 'bad' };
  if (o.status === 'refused') return { text: `${name}: ${what} was not sent${said}`, tone: 'bad' };
  if (o.status === 'timeout') return { text: `${name}: no answer to ${what}`, tone: 'unknown' };
  if (o.status === 'gone') return { text: `${name}: replaced before it answered ${what}`, tone: 'unknown' };
  if (!o.on) return { text: `${name}: off air on the output`, tone: 'ok' };
  const at = o.step === 'end' ? ', at its end' : typeof o.step === 'number' ? `, step ${o.step + 1}` : '';
  return { text: `${name}: on air on the output${at}`, tone: 'ok' };
}

/** The PROGRAM monitor's confirmed lines: one per foreign package the outputs have reported on, in
 *  pool order, apart from the monitor's own picture (a simulation that never loads a package). */
export function confirmedLines(foreignNames: readonly string[], reported: Readonly<Record<string, OgrafOutcome>>): { name: string; text: string; tone: 'ok' | 'bad' | 'unknown' }[] {
  const out: { name: string; text: string; tone: 'ok' | 'bad' | 'unknown' }[] = [];
  for (const name of foreignNames) {
    const o = reported[name];
    if (o) out.push({ name, ...ografOutcomeWords(name, o) });
  }
  return out;
}
