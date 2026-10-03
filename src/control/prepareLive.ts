// PREPARE FOR LIVE (Phase 6 Step 3 landing b: docs/work-specs/playout-ready/spec.md AC-8 to AC-11;
// the design is docs/PLAYOUT_ISOLATION_RESEARCH.md §9.4).
//
// An optional button on the production page that gives the operator a named moment: checked, the
// show is ready. It publishes what changed (and says beforehand that unpublished changes will be
// included), asks every output to prepare that version (R3, R4), checks NoaCG Bridge and CasparCG
// when they are configured (read-only), and ends in a stamp both surfaces show. It never freezes
// editing, and nothing waits for it: READY is a status, never permission.
//
// This file holds the decisions, pure: when an output has finished preparing, what each checklist
// line says, the stamp and its words. The production page runs the flow
// (components/control/PrepareForLive.tsx); scripts/prepare-live.test.mjs runs this in Node.

import type { LiveEntry } from './livePath';
import type { PlayoutResult } from './playoutLink';
import type { SlotState } from './playoutProtocol';
import { NOT_ANSWERING_MS, clockWords, plural, type ExpectedOutput, type HeldVersion, type OutputLine, type ReadyStamp, type ReadyTone } from './readiness.ts';

/** What the production page asks the outputs to prepare, in its own Presence entry (R4). A fresh
 *  id per press, so pressing again runs everything again. */
export interface PrepRequest {
  id: string;
  n: number;
  h: string;
}

/** A prepare request off the wire, or undefined. */
export function readPrepRequest(value: unknown): PrepRequest | undefined {
  const p = value as Partial<PrepRequest> | null;
  if (!p || typeof p !== 'object' || typeof p.id !== 'string' || typeof p.n !== 'number' || typeof p.h !== 'string') return undefined;
  return { id: p.id.slice(0, 40), n: p.n, h: p.h.slice(0, 40) };
}

/** How long Prepare for Live waits for every output to settle before it stamps what it has. */
export const PREPARE_WAIT_MS = 60_000;

// ── THE COMMAND PATH PING (R9, AC-12; migration 0072) ──────────────────────────────────────────

/** How long an output has to answer a ping before its line says commands did not reach it. */
export const PING_WAIT_MS = 15_000;

/** An output's answer to a ping, in its Presence entry: the ping's id, and how long after the
 *  server wrote the row it arrived there (null when the two clocks cannot be compared honestly).
 *  An output that can answer always carries one (id '' until a ping arrives); an entry without it
 *  is an output loaded before the ping existed. */
export interface PingAck {
  id: string;
  ms: number | null;
}

/** A ping answer off the wire, or undefined. */
export function readPingAck(value: unknown): PingAck | undefined {
  const a = value as Partial<PingAck> | null;
  if (!a || typeof a !== 'object' || typeof a.id !== 'string') return undefined;
  return { id: a.id.slice(0, 40), ms: typeof a.ms === 'number' && a.ms >= 0 ? Math.round(a.ms) : null };
}

/** How long after the server's `at` a ping arrived, on the output's clock. A negative or huge
 *  figure is the two clocks disagreeing, not the road: then there is no figure to give. */
export function pingDelay(at: number, now: number): number | null {
  const ms = now - at;
  return ms >= 0 && ms < 60_000 ? Math.round(ms) : null;
}

/** The ping as the production page sent it. */
export interface PingSent {
  id: string;
  /** When this page sent it, on its own clock. */
  sentAt: number;
  state: 'sending' | 'sent' | 'unavailable' | 'failed';
  detail?: string;
}

/** Has this output finished with the ping: answered, or past the wait, or there is no ping. The
 *  wait runs from the send even while the send has not answered: a request that hangs must not
 *  keep the run open. */
export function pingSettled(entry: LiveEntry | undefined, ping: PingSent | null, now: number): boolean {
  if (!ping || ping.state === 'unavailable' || ping.state === 'failed') return true;
  if (!entry || !entry.ack) return true;
  if (entry.ack && entry.ack.id === ping.id) return true;
  return now - ping.sentAt >= PING_WAIT_MS;
}

/**
 * THE COMMAND PATH, ON EACH OUTPUT'S OWN LINE (AC-12: "its line reads 'command path 110 ms'"):
 * "Desk A: Ready for playout · command path 110 ms", amber "· commands did not reach it in 15 s"
 * for one that has not answered in PING_WAIT_MS, and a note for one loaded before the ping existed.
 * An output that has gone is already "not answering"; its line is left as it is. A server without
 * the ping, or a ping that could not be sent, is one line of its own after the outputs.
 */
export function withPing(checks: readonly CheckLine[], peers: readonly LiveEntry[], ping: PingSent | null, now: number): CheckLine[] {
  if (!ping) return checks.slice();
  if (ping.state === 'unavailable') {
    return checks.concat({
      key: 'ping',
      tone: 'idle',
      note: true,
      label: 'The command path check is not on this server yet',
      advice: 'It arrives with a database update (0072). Take and every other verb work as before.',
    });
  }
  if (ping.state === 'failed') {
    return checks.concat({ key: 'ping', tone: 'warn', label: 'Could not send the command path check', advice: ping.detail ?? 'Press Check readiness again.' });
  }
  return checks.map((check): CheckLine => {
    if (check.key.indexOf('output-') !== 0) return check;
    const id = check.key.slice('output-'.length);
    const entry = peers.filter((p) => p.kind === 'output' && p.id === id).sort((a, b) => b.at - a.at)[0];
    if (!entry) return check;
    if (!entry.ack) {
      return {
        ...check,
        label: `${check.label} · cannot answer the command path check`,
        advice: check.advice ?? 'It was loaded before the check existed. Reload it when nothing is on air to include it.',
      };
    }
    if (entry.ack.id === ping.id) {
      return { ...check, label: `${check.label} · ${entry.ack.ms === null ? 'commands reach it' : `command path ${entry.ack.ms} ms`}` };
    }
    if (now - ping.sentAt >= PING_WAIT_MS) {
      return {
        ...check,
        tone: check.tone === 'bad' ? 'bad' : 'warn',
        label: `${check.label} · commands did not reach it in ${PING_WAIT_MS / 1000} s`,
        advice: (check.tone === 'ok' ? undefined : check.advice) ?? 'It may be reading commands only every 30 s. Reload it, or check its network.',
      };
    }
    return { ...check, tone: check.tone === 'ok' ? 'running' : check.tone, label: `${check.label} · checking the command path` };
  });
}

/** One line of the checklist. `note` lines inform and are not counted in the stamp. */
export interface CheckLine {
  key: string;
  tone: ReadyTone | 'running';
  label: string;
  advice?: string;
  note?: true;
}

/**
 * HAS THIS OUTPUT FINISHED PREPARING `target` FOR REQUEST `request`? Ready on it; or, answering
 * this very request, a change failed or everything prepared but something is on air (both final:
 * the line says what to do); or it was loaded before READY (it cannot say more); or it is gone past
 * the not-answering threshold. An output that has just left is not finished: preparing reloads it,
 * and it comes back. The last run's answer never counts: the same version pressed again after an
 * Out must wait for the reload that answer did not make (seen on four real hosts).
 */
export function outputSettled(entry: LiveEntry | undefined, target: HeldVersion, goneFor: number | null, request?: string): boolean {
  if (!entry) return goneFor !== null && goneFor >= NOT_ANSWERING_MS;
  const ready = entry.ready;
  if (!ready) return true;
  const chg = ready.chg;
  const answersThis = !!chg && (request === undefined || chg.id === request);
  if (chg && answersThis && chg.v.h === target.h && (chg.s === 'failed' || chg.s === 'waiting')) return true;
  return !!ready.v && ready.v.h === target.h && ready.n >= ready.of && !(chg && chg.s === 'preparing');
}

/** Every output Prepare for Live waits for: the expected ones and any other present, by id. */
export function preparedOutputs(peers: readonly LiveEntry[], expected: readonly ExpectedOutput[]): string[] {
  const ids = expected.map((e) => e.id);
  for (const p of peers) if (p.kind === 'output' && ids.indexOf(p.id) < 0) ids.push(p.id);
  return ids;
}

/**
 * THE OUTPUT LINES OF THE CHECKLIST, from READY's own lines (readiness.ts `describeReadiness`): a
 * settled output keeps its tone and words; one still preparing is `running`, or amber once the
 * wait is over. No output at all is a warning of its own: a show cannot be ready for no screen.
 */
export function outputChecks(lines: readonly OutputLine[], settled: ReadonlySet<string>, timedOut: boolean): CheckLine[] {
  if (lines.length === 0) {
    return [
      {
        key: 'outputs-none',
        tone: 'warn',
        label: 'No output is connected to this production',
        advice: 'Load the output URL in your browser source (OBS, vMix) or put it on air on CasparCG, then press Check readiness again.',
      },
    ];
  }
  return lines.map((line): CheckLine => {
    if (settled.has(line.id)) return { key: `output-${line.id}`, tone: line.tone, label: `${line.name}: ${line.state}`, advice: line.detail[0] };
    return timedOut
      ? { key: `output-${line.id}`, tone: 'warn', label: `${line.name}: still preparing after ${PREPARE_WAIT_MS / 1000} s`, advice: 'It may be slow or stuck. Reload it, then press Check readiness again.' }
      : { key: `output-${line.id}`, tone: 'running', label: `${line.name}: ${line.state}` };
  });
}

/** The stamp for a finished checklist. `idle` lines (an output that cannot say, one that just left)
 *  count as warnings; `note` lines do not count. */
export function stampOf(lines: readonly CheckLine[], target: HeldVersion, now: number): ReadyStamp {
  const counted = lines.filter((l) => !l.note);
  const outputs = counted.filter((l) => l.key.indexOf('output-') === 0);
  return {
    at: now,
    v: { n: target.n, h: target.h },
    outputs: outputs.length,
    ready: outputs.filter((l) => l.tone === 'ok').length,
    warnings: counted.filter((l) => l.tone === 'warn' || l.tone === 'idle' || l.tone === 'running').length,
    problems: counted.filter((l) => l.tone === 'bad').length,
  };
}

/**
 * THE STAMP IN WORDS, the plan's: "Ready for Live, checked 14:02 (v12)". It keeps its honesty
 * after a change: "Checked 14:02 on v12, 1 change since", counting the publishes since and any
 * edit not published yet. With warnings or problems it counts them instead of claiming ready.
 */
export function stampWords(stamp: ReadyStamp, published: HeldVersion | null, unpublished: boolean): string {
  const at = clockWords(stamp.at);
  const since = (published && published.h !== stamp.v.h ? Math.max(1, published.n - stamp.v.n) : 0) + (unpublished ? 1 : 0);
  if (since > 0) return `Checked ${at} on v${stamp.v.n}, ${plural(since, 'change')} since`;
  if (stamp.problems > 0) return `Not ready, checked ${at} (v${stamp.v.n}): ${plural(stamp.problems, 'problem')}`;
  if (stamp.warnings > 0) return `Checked ${at} (v${stamp.v.n}): ${plural(stamp.warnings, 'warning')}`;
  return `Ready for Live, checked ${at} (v${stamp.v.n})`;
}

/** What Prepare for Live found about NoaCG Bridge and CasparCG, gathered by the page (read-only). */
export interface BridgeFacts {
  /** The studio has a Bridge and a server set up (playoutLink.ts `playoutConfigured`). */
  configured: boolean;
  /** Server cues require Bridge even if it has not been configured yet. */
  required?: boolean;
  /** Browser graphics with server media do not expect the NoaCG graphics slot. */
  outputExpected?: boolean;
  /** A real VERSION round trip through the Bridge (`testConnection`). */
  status: PlayoutResult | null;
  /** The output slot as the server holds it, or undefined when it could not be read. */
  slot?: SlotState | null;
  outputSlug: string | null;
  channel: number;
  layer: number;
  /** The server clips and templates the rundown cues. */
  items: { kind: 'template' | 'media'; name: string }[];
  /** The server's library by kind; null when it could not be listed. */
  media?: string[] | null;
  templates?: string[] | null;
  /** Why a library could not be listed, in the Bridge's words (a CasparCG without its media
   *  scanner answers CLS with 501). */
  listProblem?: string;
}

/**
 * What the NoaCG output's slot on the server holds, for this production: its own output (`ours`),
 * another production's output (`other`), or anything else, nothing included (`empty`). The one
 * reading Prepare for Live and the production page's status both use.
 */
export function slotHolds(slot: SlotState | null, outputSlug: string | null): 'ours' | 'other' | 'empty' {
  const file = slot?.producer === 'html' ? (slot.file ?? '') : '';
  // The slug must END where the parameter does: `production=ab12` inside `production=ab12x9` is
  // another production.
  const param = outputSlug ? `production=${encodeURIComponent(outputSlug)}` : '';
  const at = param ? file.indexOf(param) : -1;
  if (at >= 0 && /^(?:$|[&#])/.test(file.slice(at + param.length))) return 'ours';
  return file.indexOf('/output?production=') >= 0 ? 'other' : 'empty';
}

/** "NoaCG Bridge and CasparCG answer (CasparCG 2.5.0)": the Bridge line, in Prepare for Live's
 *  checklist and the production page's status alike. */
export function bridgeAnswersLabel(version?: string): string {
  return `NoaCG Bridge and CasparCG answer${version ? ` (CasparCG ${version.split(' ')[0]})` : ''}`;
}

/** A fresh prepare request id: twelve lowercase alphanumerics. */
export function requestId(): string {
  let id = '';
  while (id.length < 12) id += Math.random().toString(36).slice(2);
  return id.slice(0, 12);
}

/**
 * THE BRIDGE AND CASPARCG LINES (AC-10). Nothing configured, nothing said: a production played
 * through a browser source alone has nothing to check here. The output layer holding another
 * production's output is a problem; an empty one is only a note, because the output may run in
 * OBS or vMix instead.
 */
export function bridgeChecks(f: BridgeFacts): CheckLine[] {
  if (!f.configured && !f.required) return [];
  const where = `${f.channel}-${f.layer}`;
  if (!f.status || f.status.state !== 'ok') {
    return [{ key: 'bridge', tone: 'bad', label: 'NoaCG Bridge or CasparCG is not answering', advice: f.status?.detail ?? 'Start NoaCG Bridge on this computer.' }];
  }
  const lines: CheckLine[] = [
    { key: 'bridge', tone: 'ok', label: bridgeAnswersLabel(f.status.version) },
  ];
  if (f.outputExpected !== false && f.slot !== undefined) {
    const holds = slotHolds(f.slot, f.outputSlug);
    if (holds === 'ours') lines.push({ key: 'bridge-layer', tone: 'ok', label: `Layer ${where} holds this production's output` });
    else if (holds === 'other') {
      lines.push({
        key: 'bridge-layer',
        tone: 'bad',
        label: `Layer ${where} holds another production's output`,
        advice: 'Put this production on air in Playout settings, or check which production this layer should show.',
      });
    } else {
      lines.push({
        key: 'bridge-layer',
        tone: 'idle',
        note: true,
        label: `Layer ${where} does not show this production's output`,
        advice: 'If the output should run on CasparCG, press Put on air in Playout settings. If it runs in OBS or vMix, there is nothing to do.',
      });
    }
  }
  for (const kind of ['media', 'template'] as const) {
    const cued = f.items.filter((i) => i.kind === kind);
    if (cued.length === 0) continue;
    const words = kind === 'media' ? 'clip' : 'template';
    const listed = kind === 'media' ? f.media : f.templates;
    if (!listed) {
      lines.push({ key: `bridge-${kind}`, tone: 'warn', label: `Could not list the server's ${words}s`, advice: f.listProblem ?? 'Check the server in Playout settings.' });
      continue;
    }
    const have = new Set(listed.map((n) => n.toLowerCase()));
    const names = cued.map((i) => i.name).filter((n, at, all) => all.indexOf(n) === at);
    const missing = names.filter((n) => !have.has(n.toLowerCase()));
    lines.push(
      missing.length > 0
        ? {
            key: `bridge-${kind}`,
            tone: 'bad',
            label: `${plural(missing.length, words)} the rundown cues ${missing.length === 1 ? 'is' : 'are'} not on the server: ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? ` and ${missing.length - 4} more` : ''}`,
            advice: kind === 'media' ? "Copy them into CasparCG's media folder, or change the cues." : "Copy them into CasparCG's template folder, or change the cues.",
          }
        : { key: `bridge-${kind}`, tone: 'ok', label: `Every ${words} the rundown cues is on the server (${names.length})` },
    );
  }
  return lines;
}
