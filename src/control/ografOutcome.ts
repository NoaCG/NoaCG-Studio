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
import { describeOgraf, typedWithDefaults } from '../model/ografTyped.ts';
import type { ControlSendItem } from './hostedControl.ts';
import { clearCueItems, COMMAND_BATCH_MAX } from './cueItems.ts';

/** What one call came to (output/foreignOgraf.ts `OgrafAnswer`), or a package the output holds no
 *  frame for. */
const STATUSES = ['done', 'rejected', 'timeout', 'gone', 'refused'] as const;
export type OgrafOutcomeStatus = (typeof STATUSES)[number] | 'unmounted';

/**
 * A PUBLISHED FOREIGN PACKAGE'S LAST WORD on a stage. `i` is the mounted instance (its frame's
 * `data-instance`), `call` and `status` its last settled call, `on` whether its last Take or Out the
 * Graphic accepted left it up, and `step` where its answers put it (a step, `end`, or null when
 * unknown). `unmounted` is a package the stage holds no frame for, `msg` saying why.
 *
 * RECOVERY (E3.2b, AC-3): `acted` is set while an action sent since its last Take may have changed
 * it, which no restart repeats; `unknown` says why its state after a restart is not proven, until
 * the operator's next Take or Out; `was` names the instance it replaced on the same output, whose
 * later word is then stale (`acceptOutcome`).
 */
export type OgrafOutcome =
  | { i: string; call: OgrafCall; status: Exclude<OgrafOutcomeStatus, 'unmounted'>; code?: number; msg?: string; step: number | 'end' | null; on: boolean; acted?: true; unknown?: string; was?: string }
  | { i: null; status: 'unmounted'; msg: string; on: false };

/** One line of the page: what an output said, and how it is drawn. */
export interface OutcomeLine {
  text: string;
  tone: 'ok' | 'bad' | 'unknown';
}

const CALLS: readonly string[] = ['mount', 'play', 'stop', 'update', 'custom'];
const MSG_MAX = 200;
const INSTANCE = /^[0-9a-f]{1,32}$/;
/** A mounted instance's id as a report may name it (a frame's `data-instance`). */
export const isOgrafInstance = (v: unknown): v is string => typeof v === 'string' && INSTANCE.test(v);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A report's `state.ograf`, read: anything malformed is no word at all, never a success. */
export function readOgrafOutcome(state: unknown): OgrafOutcome | null {
  if (!isRecord(state) || !isRecord(state.ograf)) return null;
  const o = state.ograf;
  const msg = typeof o.msg === 'string' ? o.msg.slice(0, MSG_MAX) : undefined;
  const on = o.on === true;
  if (o.status === 'unmounted') return { i: null, status: 'unmounted', msg: msg || 'not loaded', on: false };
  if (typeof o.i !== 'string' || !INSTANCE.test(o.i) || typeof o.status !== 'string' || (STATUSES as readonly string[]).indexOf(o.status) < 0) return null;
  if (typeof o.call !== 'string' || CALLS.indexOf(o.call) < 0) return null;
  const step = o.step === 'end' ? 'end' : typeof o.step === 'number' && Number.isInteger(o.step) && o.step >= 0 ? o.step : null;
  const code = typeof o.code === 'number' && Number.isInteger(o.code) ? o.code : undefined;
  const unknown = typeof o.unknown === 'string' && o.unknown ? o.unknown.slice(0, MSG_MAX) : undefined;
  const was = typeof o.was === 'string' && INSTANCE.test(o.was) && o.was !== o.i ? o.was : undefined;
  return {
    i: o.i,
    call: o.call as OgrafCall,
    status: o.status as Exclude<OgrafOutcomeStatus, 'unmounted'>,
    ...(code !== undefined ? { code } : {}),
    ...(msg ? { msg } : {}),
    step,
    on,
    ...(o.acted === true ? { acted: true as const } : {}),
    ...(unknown ? { unknown } : {}),
    ...(was ? { was } : {}),
  };
}

/**
 * LATE WORD FROM A REPLACED INSTANCE IS REFUSED (E3.2b, AC-3). An output that mounts a package again
 * (its reload, a re-cue after its frame stopped answering) names the instance it replaced (`was`);
 * from then on a report about that old instance, a write that was still on its way when the output
 * reloaded, is stale and changes nothing. `replaced` is the page's own record, per graphic, kept by
 * this fold. Returns whether `next` stands and the record after it.
 */
export function acceptOutcome(replaced: readonly string[], next: OgrafOutcome): { accept: boolean; replaced: string[] } {
  if (next.i !== null && replaced.includes(next.i)) return { accept: false, replaced: [...replaced] };
  if (next.i === null || !next.was || replaced.includes(next.was)) return { accept: true, replaced: [...replaced] };
  // Bounded: a long show's reloads cannot grow it, and only the recent instances can still write.
  return { accept: true, replaced: [...replaced, next.was].slice(-REPLACED_KEPT) };
}
const REPLACED_KEPT = 16;

const CALL_WORD: Record<string, string> = { mount: 'its load', play: 'the Take', stop: 'the Out', update: 'the update', custom: 'the action' };

/**
 * The page's line for it: what the OUTPUT says, never what this page sent. `tone` is how it is drawn:
 * `ok` on or off as asked, `bad` refused or never loaded, `unknown` no answer or a replaced instance.
 */
export function ografOutcomeWords(name: string, o: OgrafOutcome): OutcomeLine {
  if (o.status === 'unmounted') return { text: `${name}: the output could not load it (${o.msg})`, tone: 'bad' };
  if (o.unknown) return { text: `${name}: not known on the output (${o.unknown})`, tone: 'unknown' };
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
export function confirmedLines(foreignNames: readonly string[], reported: Readonly<Record<string, OgrafOutcome>>): (OutcomeLine & { name: string })[] {
  return foreignNames.flatMap((name) => (reported[name] ? [{ name, ...ografOutcomeWords(name, reported[name]) }] : []));
}

/**
 * THE SAME-LAYER RULE FOR AN IMPORTED OGRAF PACKAGE (E3.2a): the graphics a Take of `graphic`
 * replaces on its layer. A package replaces whatever else shares its layer, and a Take on a
 * package's layer replaces the package, as one CG layer holds one thing on a playout server. NoaCG
 * graphics among themselves are left as they were: they stack on a browser output, and the rundown's
 * clash warning says they replace each other elsewhere, so no native production changes here.
 */
export function packageLayerPeers(graphics: readonly { name: string; layer: number; foreign: boolean }[], graphic: string): string[] {
  const taken = graphics.find((g) => g.name === graphic);
  if (!taken) return [];
  return graphics.filter((g) => g.name !== graphic && g.layer === taken.layer && (g.foreign || taken.foreign)).map((g) => g.name);
}

/** A Take's command batches with the Outs of the `peers` it replaces (`packageLayerPeers`, those up
 *  now): in the Take's own batch when they fit one command call, else in batches of their own sent
 *  first, so none is left on air. The one builder every surface's Take goes through. */
export function withPeersOff(peers: readonly string[], take: ControlSendItem[]): ControlSendItem[][] {
  const clears = peers.flatMap(clearCueItems);
  if (clears.length + take.length <= COMMAND_BATCH_MAX) return [[...clears, ...take]];
  const batches: ControlSendItem[][] = [];
  for (let i = 0; i < clears.length; i += COMMAND_BATCH_MAX) batches.push(clears.slice(i, i + COMMAND_BATCH_MAX));
  return [...batches, take];
}

/** What a published package's `load()` starts from: the defaults its schema declares (model/
 *  ografTyped.ts `typedWithDefaults`), so a Graphic that builds itself from its data in `load()` has
 *  what its manifest says it starts with. A cue's own values follow with its Take. */
export function ografLoadData(manifest: unknown): Record<string, unknown> {
  const fields = describeOgraf(manifest).fields;
  return fields ? typedWithDefaults(fields, {}).values : {};
}

/** A published package's READY check, from the output's first word about it (control/readiness.ts
 *  `GraphicCheck`): its `load()` answered done is prepared, a refused, unanswered or replaced load
 *  or a package with no frame is a failure named in its own words; no word yet is still preparing
 *  (null). A package has no fonts or images of ours to count. */
export function ografCheck(outcome: OgrafOutcome | undefined): { done: true; error: string | null; silent: boolean; fontsFailed: string[]; fontsLoading: string[]; imagesBroken: string[] } | null {
  if (!outcome) return null;
  const empty = { fontsFailed: [], fontsLoading: [], imagesBroken: [] };
  if (outcome.status === 'unmounted') return { done: true, error: `not loaded: ${outcome.msg}`, silent: false, ...empty };
  if (outcome.call !== 'mount') return null;
  if (outcome.status === 'done') return { done: true, error: null, silent: false, ...empty };
  if (outcome.status === 'timeout') return { done: true, error: null, silent: true, ...empty };
  return { done: true, error: `its load() ${outcome.status === 'gone' ? 'was replaced before it answered' : `refused${outcome.msg ? `: ${outcome.msg}` : ''}`}`, silent: false, ...empty };
}
