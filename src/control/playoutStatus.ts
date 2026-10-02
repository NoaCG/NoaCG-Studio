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

import type { PlayoutState } from './playoutLink';
import type { ReadyTone } from './readiness';

export type StatusTone = 'idle' | 'ok' | 'warn' | 'bad';

/** One line of the panel: what was checked, how it stands, and what to do when it is not fine. */
export interface StatusCheck {
  key: 'production' | 'bridge' | 'slot' | 'outputs';
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
  /** The production is started (published): verbs go on the wire. */
  started: boolean;
  /** A publish now would change what the outputs get (the record, or what they render). */
  unpublished: boolean;
  /** "v12", or '' when the published version is not known. */
  version: string;
  /** NoaCG Bridge as the page last heard it; null when no Bridge is set up in this browser. */
  bridge: { state: PlayoutState | 'pending'; detail: string; version?: string } | null;
  /** What the NoaCG output's own slot on the server holds, read through the Bridge; undefined
   *  until it has been read, `unreadable` when this Bridge or server cannot say (an older Bridge).
   *  `where` is `1-20`, `channel` its channel. */
  slot?: { where: string; channel: number; holds: 'ours' | 'other' | 'empty' | 'unreadable' };
  /** READY's summary (readiness.ts `describeReadiness`), or null when no output is known.
   *  `broken` is the headline of an output naming a graphic that cannot play ("Not ready: Hairline
   *  (script error)"), or null. */
  ready: { tone: ReadyTone; label: string; outputs: number; ready: number; broken?: string | null } | null;
}

const RANK: Record<StatusTone, number> = { bad: 3, warn: 2, ok: 1, idle: 0 };

/** READY's words without its leading dot, which the control draws itself. */
function bare(label: string): string {
  return label.replace(/^[●▲✕○]\s*/, '');
}

function bridgeCheck(b: NonNullable<StatusFacts['bridge']>): StatusCheck {
  switch (b.state) {
    case 'pending':
      return { key: 'bridge', tone: 'idle', label: 'Checking NoaCG Bridge…', short: 'Checking…' };
    case 'ok':
      return {
        key: 'bridge',
        tone: 'ok',
        label: `NoaCG Bridge and CasparCG answer${b.version ? ` (CasparCG ${b.version.split(' ')[0]})` : ''}`,
        short: 'Connected',
      };
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
      advice: 'The outputs run the published version until you publish the changes.',
    });
  } else {
    checks.push({ key: 'production', tone: 'ok', label: `Started${f.version ? `, ${f.version} published` : ''}`, short: 'Started' });
  }

  const bridge = f.bridge ? bridgeCheck(f.bridge) : null;
  if (bridge) checks.push(bridge);

  // Is something there to air it? The output's slot on CasparCG, read through the Bridge, and the
  // outputs' own reports. A slot that holds nothing is broken only when nothing else will air the
  // graphics: a studio may drive clips through the Bridge and run its graphics in OBS.
  const readyAny = !!f.ready && f.ready.outputs > 0;
  if (f.slot && bridge?.tone === 'ok') {
    const ch = `Channel ${f.slot.channel}`;
    if (f.slot.holds === 'ours') {
      checks.push({ key: 'slot', tone: 'ok', label: `On air on ${f.slot.where}`, short: `on air ${f.slot.where}` });
    } else if (f.slot.holds === 'unreadable') {
      checks.push({
        key: 'slot',
        tone: 'idle',
        label: `This NoaCG Bridge cannot say what ${f.slot.where} shows`,
        short: 'Connected',
        advice: 'Update NoaCG Bridge to have this checked.',
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
        tone: f.started && !readyAny ? 'bad' : 'idle',
        label: `Nothing on ${f.slot.where}`,
        short: 'Output not on air',
        advice: f.started ? 'Press Put on air to load this production on CasparCG.' : 'Start the production, then put it on air.',
      });
    }
  }

  if (f.ready && f.ready.outputs > 0) {
    // An output still PREPARING is attention, not health (owner: amber is "preparation
    // incomplete"): READY draws it in its idle grey because nothing is wrong yet, but a Take now
    // may find a graphic not loaded. Any other idle reading (an output too old to say) stays grey.
    const preparing = f.ready.tone === 'idle' && /Preparing/.test(f.ready.label);
    // A graphic that cannot play is broken (owner: red when something that should work is
    // broken), although READY reads it amber because the output's other graphics still air.
    const broken = f.ready.tone !== 'bad' && f.ready.broken ? f.ready.broken : null;
    const tone: StatusTone =
      f.ready.tone === 'bad' || broken ? 'bad' : f.ready.tone === 'warn' || preparing ? 'warn' : f.ready.tone === 'ok' ? 'ok' : 'idle';
    const short = broken
      ? broken.replace(/ \([^)]*\)/g, '')
      : tone === 'bad'
        ? f.ready.ready === 0
          ? 'Output not responding'
          : `${f.ready.ready} of ${f.ready.outputs} outputs ready`
        : tone === 'warn'
          ? bare(f.ready.label).split(' · ')[0]
          : tone === 'ok'
            ? `${f.ready.outputs} output${f.ready.outputs === 1 ? '' : 's'}`
            : 'Connected';
    checks.push({ key: 'outputs', tone: f.started ? tone : 'idle', label: broken ?? bare(f.ready.label), short });
  } else if (f.started && !f.slot && !(bridge && bridge.tone !== 'ok')) {
    checks.push({
      key: 'outputs',
      tone: bridge ? 'idle' : 'warn',
      label: bridge ? 'Reading what CasparCG shows…' : 'No output connected',
      short: bridge ? 'Checking…' : 'No output connected',
      advice: bridge ? undefined : 'Load the output link in your browser source (OBS, vMix), or put it on air in CasparCG.',
    });
  }

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
