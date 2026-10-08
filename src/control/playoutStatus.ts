// CAN THIS PRODUCTION PLAY? One status for the operator, before Take
// (docs/work-specs/playout-workflow-simplification AC-2; it replaced studio-day-playout AC-7's words).
//
// One control, worst first, always words beside the colour:
//
//   grey  (idle)  nothing is wrong and nothing is reporting yet: not published, not connected,
//                 publishing, preparing, loading. A page opened before the studio is up is quiet.
//   green (ok)    something this production airs through answers: "Connected" once published, or
//                 "CasparCG ready" before the first publish when only native server cues can air.
//   amber (warn)  attention, not broken: an output waiting for clear before it can update, commands
//                 arriving slowly, a Bridge that needs an update.
//   red   (bad)   something seen this session is gone or something that should work does not: a
//                 renderer lost, a Take that reached no output, the Bridge or CasparCG down (only
//                 with CasparCG switched on), another production on the slot, a graphic that
//                 cannot play.
//
// Unpublished changes are not a state: they are the header's "Publish changes" action. It is a
// status and never permission: nothing here blocks or delays a verb. Pure and DOM-free, so
// scripts/playout-status.test.mjs runs it in Node; the words are its contract.

import type { PlayoutSettings, PlayoutState } from './playoutLink';
import { bridgeAnswersLabel } from './prepareLive.ts';
import { type ReadySummary, type ReadyTone } from './readiness.ts';

/** READY's four, in the same colours. */
export type StatusTone = ReadyTone;

/** What the NoaCG output's own slot on the server holds, read through the Bridge: this production's
 *  output, another's, anything else (`empty`), a Bridge too old to say (`unreadable`), or a read the
 *  server refused (`failed`, with the Bridge's sentence in `detail`). */
export interface SlotReading {
  holds: 'ours' | 'other' | 'empty' | 'unreadable' | 'failed';
  detail?: string;
}

/** One line of the panel: what was checked, how it stands, and what to do when it is not fine. */
export interface StatusCheck {
  key: 'production' | 'bridge' | 'slot' | 'outputs' | 'take' | 'files' | 'playback';
  tone: StatusTone;
  label: string;
  /** The words on the header control when this check decides the status. */
  short: string;
  advice?: string;
}

export interface PlayoutStatus {
  tone: StatusTone;
  /** The header's text, beside its colour: never the colour alone. */
  text: string;
  /** Every check, worst first: the first one is why the status reads as it does. */
  checks: StatusCheck[];
}

export interface StatusFacts {
  /** The production is published: browser graphics use the hosted output. Native server cues
   *  send through the Bridge independently, published or not. */
  started: boolean;
  /** A publish (first or changes) is running now. */
  publishing?: boolean;
  /** CasparCG via Bridge is switched on for this production. */
  casparOn?: boolean;
  /** NoaCG Bridge as the page last heard it; null when CasparCG is off or nothing is set up. */
  bridge: { state: PlayoutState | 'pending'; detail: string; version?: string } | null;
  /** The output's slot (`SlotReading`), undefined until it has been read. `where` is `1-20`,
   *  `channel` its channel. `reporting`: the renderer ON the slot reports (it tags itself with its
   *  destination); absent for a production whose CasparCG output carries no tag, where any
   *  reporting renderer has to stand for it. */
  slot?: SlotReading & { where: string; channel: number; reporting?: boolean };
  /** This session saw this production on its slot, and the slot no longer holds it. */
  slotLost?: boolean;
  /** READY's summary (readiness.ts `describeReadiness`), or null when no output is known. */
  ready: Pick<ReadySummary, 'tone' | 'label' | 'outputs' | 'ready' | 'lead' | 'preparing' | 'broken' | 'lost'> | null;
  /** A graphic Take was sent while nothing that could air it was reporting. */
  noOutputTake?: boolean;
  fileCheck?: StatusCheck | null;
  playbackCheck?: StatusCheck | null;
}

const RANK: Record<StatusTone, number> = { bad: 3, warn: 2, ok: 1, idle: 0 };

/** The exact server and slot an output action addressed, with no Bridge credential. */
export function casparOutputTarget(settings: Pick<PlayoutSettings, 'host' | 'amcpPort' | 'channel' | 'layer'>): string {
  return JSON.stringify([settings.host.trim(), settings.amcpPort, settings.channel, settings.layer]);
}

/** The Bridge and the output slot matter only with CasparCG switched on (owner, 2026-10-07): a
 *  browser-only production never polls, reads or warns about a Bridge paired in this browser. */
export function relevantPlayout(input: { configured: boolean; casparOn: boolean }): { bridge: boolean; slot: boolean } {
  return { bridge: input.casparOn, slot: input.configured && input.casparOn };
}

/** The renderer's own words for an output that is reporting but not quite well, in the short form
 *  the header has room for. READY keeps its longer line for the panel. */
function outputShort(lead: string): string {
  // A line may lead with its output's name ("CasparCG 1-20: Waiting for clear: Scorebug").
  const waiting = lead.indexOf('Waiting for clear');
  if (waiting >= 0) return lead.slice(waiting);
  if (lead.indexOf('Behind') >= 0) return 'Waiting for clear';
  if (lead.indexOf('Commands may arrive') >= 0) return 'Commands slow';
  return lead;
}

function bridgeCheck(b: NonNullable<StatusFacts['bridge']>): StatusCheck {
  switch (b.state) {
    case 'pending':
      return { key: 'bridge', tone: 'idle', label: 'Checking NoaCG Bridge…', short: 'Checking…' };
    case 'ok':
      return { key: 'bridge', tone: 'ok', label: bridgeAnswersLabel(b.version), short: 'CasparCG ready' };
    case 'bridge':
      return { key: 'bridge', tone: 'bad', label: 'NoaCG Bridge is not running', short: 'Bridge not running', advice: b.detail };
    case 'server':
      return { key: 'bridge', tone: 'bad', label: 'CasparCG is not answering', short: 'CasparCG not answering', advice: b.detail };
    case 'scanner':
      return { key: 'bridge', tone: 'warn', label: 'CasparCG answers, but cannot list its files', short: 'Server list unavailable', advice: b.detail };
    case 'outdated':
      return { key: 'bridge', tone: 'warn', label: 'NoaCG Bridge needs an update', short: 'Update NoaCG Bridge', advice: b.detail };
    case 'config':
      return { key: 'bridge', tone: 'idle', label: 'Pair NoaCG Bridge', short: 'Pair NoaCG Bridge', advice: b.detail };
    default:
      return { key: 'bridge', tone: 'bad', label: 'This browser cannot use NoaCG Bridge', short: 'Bridge needs attention', advice: b.detail };
  }
}

export function describePlayoutStatus(f: StatusFacts): PlayoutStatus {
  const checks: StatusCheck[] = [];
  const ready = f.ready?.outputs ? f.ready : null;
  if (!f.started) checks.push({ key: 'production', tone: 'idle', label: 'Not published', short: 'Not published' });
  else if (f.publishing) checks.push({ key: 'production', tone: 'idle', label: 'Publishing…', short: 'Publishing…' });

  const bridge = f.casparOn && f.bridge ? bridgeCheck(f.bridge) : null;
  if (bridge) checks.push(bridge);

  // The NoaCG output's slot on CasparCG, read through the Bridge. Only once published: before
  // that there is no output URL to load, and Publish is what loads it.
  if (f.started && f.casparOn && f.slot && bridge?.tone === 'ok') {
    // D3: Connected needs the renderer on the slot itself; another output reporting is not it.
    const reporting = f.slot.reporting ?? (!!ready && (ready.ready > 0 || ready.tone === 'warn' || !!ready.preparing));
    const at = f.slot.where;
    const holds = f.slot.holds;
    if (holds === 'ours') {
      checks.push(reporting
        ? { key: 'slot', tone: 'ok', label: `On air on ${at}`, short: 'Connected' }
        : { key: 'slot', tone: 'idle', label: `This production is on ${at} and still loading`, short: `Loading on ${at}` });
    } else if (holds === 'unreadable') {
      checks.push({ key: 'slot', tone: 'idle', label: `This NoaCG Bridge cannot say what ${at} shows`, short: 'Update NoaCG Bridge', advice: 'Update NoaCG Bridge to have this checked.' });
    } else if (holds === 'failed') {
      checks.push({ key: 'slot', tone: 'bad', label: `Cannot read what ${at} shows`, short: `Cannot read ${at}`, advice: `Check under Playout settings that the server has channel ${f.slot.channel}.${f.slot.detail ? ` ${f.slot.detail}` : ''}` });
    } else if (holds === 'other') {
      checks.push({ key: 'slot', tone: 'bad', label: `Another production is on ${at}`, short: `Another production on ${at}` });
    } else {
      checks.push(f.slotLost
        ? { key: 'slot', tone: 'bad', label: `This production left ${at}`, short: `Not on ${at}` }
        : { key: 'slot', tone: 'idle', label: `Not loaded on ${at}`, short: `Not loaded on ${at}` });
    }
  }

  if (f.started && ready) {
    // A graphic that cannot play is red here, although READY reads it amber because the output's
    // other graphics still air. A renderer seen this session and gone is red, by name.
    const broken = ready.tone !== 'bad' ? ready.broken : null;
    if (ready.lost) checks.push({ key: 'outputs', tone: 'bad', label: ready.lead ?? `${ready.lost} lost`, short: `${ready.lost} lost` });
    else if (broken) checks.push({ key: 'outputs', tone: 'bad', label: broken.line, short: broken.short });
    else if (ready.tone === 'bad') checks.push({ key: 'outputs', tone: 'bad', label: ready.lead ?? 'Output not responding', short: ready.ready === 0 ? 'Output not responding' : `${ready.ready} of ${ready.outputs} outputs ready` });
    else if (ready.tone === 'warn') checks.push({ key: 'outputs', tone: 'warn', label: ready.lead ?? '', short: outputShort(ready.lead ?? '') });
    else if (ready.preparing) checks.push({ key: 'outputs', tone: 'idle', label: ready.lead ?? 'Preparing', short: ready.lead ?? 'Preparing…' });
    else if (ready.tone === 'ok') checks.push({ key: 'outputs', tone: 'ok', label: ready.lead ?? 'Ready', short: 'Connected' });
    else checks.push({ key: 'outputs', tone: 'idle', label: ready.lead ?? 'Not connected', short: 'Not connected' });
  }

  if (f.started && f.noOutputTake) {
    checks.push({ key: 'take', tone: 'bad', label: 'The last Take reached no output', short: 'No output' });
  }
  if (f.fileCheck) checks.push(f.fileCheck);
  if (f.playbackCheck) checks.push(f.playbackCheck);

  const sorted = [...checks].sort((a, b) => RANK[b.tone] - RANK[a.tone]);
  const worst = sorted[0];
  if (worst && (worst.tone === 'bad' || worst.tone === 'warn')) return { tone: worst.tone, text: worst.short, checks: sorted };

  if (!f.started) {
    // Native server cues air without a publish: with CasparCG on and answering, this production can
    // already play them, so the status says so in green.
    return bridge?.tone === 'ok' ? { tone: 'ok', text: 'CasparCG ready', checks: sorted } : { tone: 'idle', text: bridge?.short && bridge.tone === 'idle' ? bridge.short : 'Not published', checks: sorted };
  }
  if (f.publishing) return { tone: 'idle', text: 'Publishing…', checks: sorted };
  // Green needs a renderer that answers: a browser renderer reporting, or this production's own
  // renderer on its CasparCG slot reporting. The Bridge answering alone is not Connected.
  const connected = checks.some((c) => (c.key === 'outputs' || c.key === 'slot') && c.tone === 'ok');
  if (connected) return { tone: 'ok', text: 'Connected', checks: sorted };
  const quiet = sorted.find((c) => c.tone === 'idle' && c.key !== 'production');
  if (quiet) return { tone: 'idle', text: quiet.short, checks: sorted };
  return { tone: 'idle', text: bridge?.tone === 'ok' ? 'Graphics not connected' : 'Not connected', checks: sorted };
}
