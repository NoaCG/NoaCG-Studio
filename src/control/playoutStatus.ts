// CAN THIS PRODUCTION PLAY? One status for the operator, before Take
// (docs/work-specs/studio-day-playout AC-7, owner decision 4 of 2026-10-01).
//
// The production page used to answer in three places that each knew a part: the mode chip
// (published or not), the READY line (the outputs' own reports, shown only once one had reported)
// and the CasparCG dot (the Bridge and the server). On the studio day an operator could read all
// three and still not know that a Take would not air. This rolls the same facts into ONE status,
// worst first, with the check that decided it, in the owner's colours:
//
//   grey  (idle)  intentionally offline: the production is not started
//   amber (warn)  attention, not broken: unpublished changes, behind, preparing
//   green (ok)    live, connected and healthy
//   red   (bad)   something that should work does not: the Bridge lost, the output not on air
//                 or not answering, another production on the expected slot, a graphic that
//                 cannot play
//
// It is a status and never permission: nothing here blocks or delays a verb. Pure and DOM-free,
// so scripts/playout-status.test.mjs runs it in Node; the words are its contract.

import type { PlayoutSettings, PlayoutState } from './playoutLink';
import type { LiveEntry } from './livePath';
import { hasCasparOutput, readOutputSetup, outputProfileLabel, type ProductionOutputSetup } from '../model/outputSetup.ts';
import { bridgeAnswersLabel } from './prepareLive.ts';
import { TONE_DOT, type ReadySummary, type ReadyTone } from './readiness.ts';

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
  key: 'production' | 'bridge' | 'slot' | 'outputs' | 'destinations' | 'files';
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
  managedOutput?: boolean;
  destinationCheck?: StatusCheck | null;
  fileCheck?: StatusCheck | null;
  /** The production is started (published): verbs go on the wire. */
  started: boolean;
  /** A publish now would change what the outputs get (the record, or what they render). */
  unpublished: boolean;
  /** "v12", or '' when the published version is not known. */
  version: string;
  /** NoaCG Bridge as the page last heard it; null when no Bridge is set up in this browser. */
  bridge: { state: PlayoutState | 'pending'; detail: string; version?: string } | null;
  /** The output's slot (`SlotReading`), undefined until it has been read. `where` is `1-20`,
   *  `channel` its channel. */
  slot?: SlotReading & { where: string; channel: number };
  /** READY's summary (readiness.ts `describeReadiness`), or null when no output is known. */
  ready: Pick<ReadySummary, 'tone' | 'label' | 'outputs' | 'ready' | 'lead' | 'preparing' | 'broken'> | null;
}

const RANK: Record<StatusTone, number> = { bad: 3, warn: 2, ok: 1, idle: 0 };

/** The exact server and slot an output action addressed, with no Bridge credential. */
export function casparOutputTarget(settings: Pick<PlayoutSettings, 'host' | 'amcpPort' | 'channel' | 'layer'>): string {
  return JSON.stringify([settings.host.trim(), settings.amcpPort, settings.channel, settings.layer]);
}

/** Setup is intent; native server cues and recorded managed activity are evidence. Host names
 * and a globally configured studio never establish a legacy production's intent. */
export function relevantPlayout(input: {
  configured: boolean;
  serverCues: boolean;
  peers: readonly Pick<LiveEntry, 'kind' | 'engine' | 'name'>[];
  expected: readonly { name: string }[];
  casparActivity: boolean;
  outputSetup?: ProductionOutputSetup;
}): { bridge: boolean; slot: boolean } {
  const managed = input.outputSetup ? hasCasparOutput(input.outputSetup) : input.casparActivity;
  return { bridge: input.serverCues || managed, slot: input.configured && managed };
}

/** Diagnostics only. Untagged output instances continue playing, but cannot prove which of two
 * selected destinations is connected. One tagged instance never satisfies both destinations. */
export function destinationCheck(setup: ProductionOutputSetup | undefined, peers: readonly Pick<LiveEntry, 'kind' | 'destinationId'>[]): StatusCheck | null {
  if (!setup) return null;
  const destinations = readOutputSetup(setup)?.destinations ?? [];
  if (!destinations.length) return { key: 'destinations', tone: 'warn', label: 'Choose a production output under Setup', short: 'Choose output' };
  const outputs = peers.filter(p => p.kind === 'output');
  const missing = destinations.filter(d => !outputs.some(p => p.destinationId === d.id));
  if (!missing.length) return null;
  const uncertain = outputs.some(p => !p.destinationId);
  return { key: 'destinations', tone: 'warn',
    label: `${uncertain ? 'Output reporting; destination not confirmed' : 'Waiting for output'}: ${missing.map(d => outputProfileLabel(d.profile)).join(' + ')}`,
    short: uncertain ? 'Confirm output destinations' : 'Output missing',
    advice: 'Use the destination link in Setup. Existing untagged links still play; this check does not block Take.' };
}

/** READY's deciding words. Step 1's health line underneath READY has no `lead`, so its label is
 *  read without the dot the control draws itself. */
function leadOf(ready: NonNullable<StatusFacts['ready']>): string {
  if (ready.lead) return ready.lead;
  const dot = TONE_DOT[ready.tone];
  return ready.label.startsWith(dot) ? ready.label.slice(dot.length).trim() : ready.label;
}

function bridgeCheck(b: NonNullable<StatusFacts['bridge']>): StatusCheck {
  switch (b.state) {
    case 'pending':
      return { key: 'bridge', tone: 'idle', label: 'Checking NoaCG Bridge…', short: 'Checking…' };
    case 'ok':
      return { key: 'bridge', tone: 'ok', label: bridgeAnswersLabel(b.version), short: 'Connected' };
    case 'bridge':
      return { key: 'bridge', tone: 'bad', label: 'NoaCG Bridge is not running', short: 'Bridge not running', advice: b.detail };
    case 'server':
      return { key: 'bridge', tone: 'bad', label: 'CasparCG is not answering', short: 'CasparCG not answering', advice: b.detail };
    case 'scanner':
      return { key: 'bridge', tone: 'warn', label: 'CasparCG answers, but cannot list its files', short: 'Server list unavailable', advice: b.detail };
    case 'outdated':
      return { key: 'bridge', tone: 'warn', label: 'NoaCG Bridge needs an update', short: 'Update NoaCG Bridge', advice: b.detail };
    default:
      return { key: 'bridge', tone: 'bad', label: 'This browser cannot use NoaCG Bridge', short: 'Bridge needs attention', advice: b.detail };
  }
}

export function describePlayoutStatus(f: StatusFacts): PlayoutStatus {
  const checks: StatusCheck[] = [];
  const ready = f.ready?.outputs ? f.ready : null;
  if (!f.started) {
    checks.push({
      key: 'production',
      tone: 'idle',
      label: 'Not started',
      short: 'Offline',
      advice: 'Takes play only on this page until you start the production.',
    });
  } else if (f.unpublished) {
    checks.push({
      key: 'production',
      tone: 'warn',
      label: `Unpublished changes${f.version ? ` since ${f.version}` : ''}`,
      short: 'Unpublished changes',
      advice: ready?.tone === 'ok' && !ready.broken ? 'Current prepared graphics are responding and ready. Continue those cues while their output and connection checks stay green. Publish and check before using new or changed assets.' : 'Current output safety is not confirmed. Check the output and connection details; avoid taking unprepared assets.',
    });
  } else {
    checks.push({ key: 'production', tone: 'ok', label: 'Published changes are available to outputs', short: 'Published' });
  }

  const bridge = f.bridge ? bridgeCheck(f.bridge) : null;
  if (bridge) checks.push(bridge);

  // Is something there to air it? The output's slot on CasparCG, read through the Bridge, and the
  // outputs' own reports. A slot that holds nothing is broken only when nothing else will air the
  // graphics: a studio may drive clips through the Bridge and run its graphics in OBS.
  // An output is REPORTING: ready, still loading, or amber about something. One that is only
  // remembered - gone, or not answering yet - airs nothing (measured on 2.5: Take off left the
  // CasparCG output "not answering" for 15 s, and the status read Checking meanwhile).
  const readyAny = !!ready && (ready.ready > 0 || ready.tone === 'warn' || !!ready.preparing);
  if (f.slot && bridge?.tone === 'ok') {
    const ch = `Channel ${f.slot.channel}`;
    if (f.slot.holds === 'ours' && readyAny) {
      checks.push({ key: 'slot', tone: 'ok', label: `On air on ${f.slot.where}`, short: `on air ${f.slot.where}` });
    } else if (f.slot.holds === 'ours') {
      // On the slot, but its page has not reported yet: CasparCG is still loading it (measured on
      // 2.5: about 9 s to the first report, 28 s to ready). Preparation incomplete is amber.
      checks.push({
        key: 'slot',
        tone: f.started ? 'warn' : 'idle',
        label: `This production is on ${f.slot.where} and still loading`,
        short: `Loading on ${f.slot.where}`,
      });
    } else if (f.slot.holds === 'unreadable') {
      checks.push({
        key: 'slot',
        tone: f.started && f.managedOutput ? 'warn' : 'idle',
        label: `This NoaCG Bridge cannot say what ${f.slot.where} shows`,
        short: 'Connected',
        advice: 'Update NoaCG Bridge to have this checked.',
      });
    } else if (f.slot.holds === 'failed') {
      // The server answers but will not say what the slot shows: most often a NoaCG output set to
      // a channel it does not have, where Put on air would fail too. Red unless an output elsewhere
      // already airs the graphics, as for an empty slot.
      checks.push({
        key: 'slot',
        tone: f.started ? (readyAny && !f.managedOutput ? 'warn' : 'bad') : 'idle',
        label: `Cannot read what ${f.slot.where} shows`,
        short: `Cannot read ${f.slot.where}`,
        advice: `Check under Setup that the server has channel ${f.slot.channel}.${f.slot.detail ? ` ${f.slot.detail}` : ''}`,
      });
    } else if (f.slot.holds === 'other') {
      checks.push({
        key: 'slot',
        tone: f.started ? 'bad' : 'idle',
        label: `${ch} shows another production on ${f.slot.where}`,
        short: `Another production on ${f.slot.where}`,
        advice: 'Put on air replaces it with this production.',
      });
    } else {
      checks.push({
        key: 'slot',
        tone: f.started && (!readyAny || f.managedOutput) ? 'bad' : 'idle',
        label: `Nothing on ${f.slot.where}`,
        short: 'Output not on air',
        advice: f.started ? 'Press Put on air to load this production on CasparCG.' : 'Start the production, then put it on air.',
      });
    }
  }

  if (f.started && f.managedOutput && bridge?.tone === 'ok' && !f.slot) checks.push({ key: 'slot', tone: 'warn', label: 'Checking managed CasparCG output on its configured server and slot', short: 'Checking CasparCG output' });
  if (ready) {
    // An output still PREPARING is attention, not health (owner: amber is "preparation
    // incomplete"): READY draws it in its idle grey because nothing is wrong yet, but a Take now
    // may find a graphic not loaded. Any other idle reading (an output too old to say) stays grey.
    // A graphic that cannot play is broken (owner: red when something that should work is
    // broken), although READY reads it amber because the output's other graphics still air.
    const broken = ready.tone !== 'bad' ? ready.broken : null;
    const tone: StatusTone = ready.tone === 'bad' || broken ? 'bad' : ready.preparing ? 'warn' : ready.tone;
    const lead = leadOf(ready);
    let short: string;
    if (broken) short = broken.short;
    else if (tone === 'bad') short = ready.ready === 0 ? 'Output not responding' : `${ready.ready} of ${ready.outputs} outputs ready`;
    else if (tone === 'warn') short = lead;
    else if (tone === 'ok') short = `${ready.outputs} output${ready.outputs === 1 ? '' : 's'}`;
    else short = 'Connected';
    checks.push({ key: 'outputs', tone: f.started ? tone : 'idle', label: broken?.line ?? lead, short });
  } else if (f.started && !f.slot && !(bridge && bridge.tone !== 'ok')) {
    checks.push({
      key: 'outputs',
      tone: bridge ? 'idle' : 'warn',
      label: bridge ? 'Reading what CasparCG shows…' : 'No output connected',
      short: bridge ? 'Checking…' : 'No output connected',
      advice: bridge ? undefined : 'Load the output link in your browser source (OBS, vMix), or put it on air in CasparCG.',
    });
  }

  if (f.fileCheck) checks.push(f.fileCheck);
  if (f.started && f.destinationCheck) checks.push(f.destinationCheck);
  const sorted = [...checks].sort((a, b) => RANK[b.tone] - RANK[a.tone]);
  if (!f.started) return { tone: 'idle', text: 'Offline', checks: sorted };
  const worst = sorted[0];
  if (worst.tone === 'bad' || worst.tone === 'warn') return { tone: worst.tone, text: worst.short, checks: sorted };
  // Green needs a positive answer that something will air: the slot holds this production, or an
  // output reports ready. Without one the status is still being read.
  const onAir = checks.find((c) => c.key === 'slot' && c.tone === 'ok');
  const outputs = checks.find((c) => c.key === 'outputs' && c.tone === 'ok');
  if (onAir || outputs) return { tone: 'ok', text: `Ready · ${onAir ? onAir.short : outputs!.short}`, checks: sorted };
  // A Bridge too old to say what its slot shows: connected, never claimed ready.
  if (f.slot?.holds === 'unreadable' && bridge?.tone === 'ok') return { tone: 'idle', text: 'Connected', checks: sorted };
  return { tone: 'idle', text: 'Checking…', checks: sorted };
}
