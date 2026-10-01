// PREPARE FOR LIVE on the production page (Phase 6 Step 3 landing b: docs/work-specs/playout-ready/
// spec.md AC-8 to AC-11). It shows in the READY panel (OutputHealth.tsx ReadyLine), under the
// outputs it waits for. The decisions are control/prepareLive.ts; `usePrepareForLive` runs the
// flow: publish what changed, ask the outputs to prepare, check the Bridge and CasparCG, and stamp
// the result. The flow lives in the page, not the panel: the panel closes on any click outside it
// (a Take, say), and a run goes on to its stamp while it is shut.
//
// Optional, and never a gate: editing goes on during and after it, every verb works while it runs,
// and the button is only ever busy with its own run.

import { useEffect, useRef, useState } from 'react';
import {
  PREPARE_WAIT_MS,
  bridgeChecks,
  outputChecks,
  outputSettled,
  preparedOutputs,
  stampOf,
  stampWords,
  type BridgeFacts,
  type CheckLine,
  type PrepRequest,
} from '../../control/prepareLive';
import { describeReadiness, type ExpectedOutput, type HeldVersion, type OutputLine, type ReadyStamp } from '../../control/readiness';
import type { LivePresenceView } from './OutputHealth';

type Phase = 'idle' | 'publishing' | 'preparing' | 'done';

/** A fresh request id: twelve lowercase alphanumerics. */
function requestId(): string {
  let id = '';
  while (id.length < 12) id += Math.random().toString(36).slice(2);
  return id.slice(0, 12);
}

const DOT: Record<CheckLine['tone'], string> = { ok: '●', warn: '▲', bad: '✕', idle: '○', running: '…' };

/** A run as the panel shows it. */
export interface PrepareFlow {
  phase: Phase;
  /** The checklist while running and after, or null before the first run. */
  shown: CheckLine[] | null;
  run: () => Promise<void>;
}

export function usePrepareForLive({
  showId,
  presence,
  expected,
  published,
  unpublishedChanges,
  publish,
  onPrep,
  onStamp,
  bridge,
}: {
  /** The production: another one starts from nothing. */
  showId: string | null;
  presence: LivePresenceView;
  expected: ExpectedOutput[];
  /** The version the server holds, as this page knows it (null: never published with a stamp). */
  published: HeldVersion | null;
  /** The production was edited since its last publish. */
  unpublishedChanges: boolean;
  /** Publish now; the version written, or null when it did not publish (the reason is on the page). */
  publish: () => Promise<HeldVersion | null>;
  /** Put a prepare request in this page's Presence entry, or take it out. */
  onPrep: (prep: PrepRequest | null) => void;
  onStamp: (stamp: ReadyStamp) => void;
  /** Gather what the Bridge and CasparCG say (read-only). */
  bridge: () => Promise<BridgeFacts>;
}): PrepareFlow {
  const [phase, setPhase] = useState<Phase>('idle');
  const [publishLine, setPublishLine] = useState<CheckLine | null>(null);
  const [bridgeLines, setBridgeLines] = useState<CheckLine[] | null>(null);
  const [target, setTarget] = useState<HeldVersion | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [request, setRequest] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finalLines, setFinalLines] = useState<CheckLine[] | null>(null);
  useEffect(() => {
    setPhase('idle');
    setFinalLines(null);
    setTarget(null);
    setRequest(null);
  }, [showId]);

  // The outputs' lines as READY words them, for the version being prepared.
  const readiness = describeReadiness({
    presence: presence.status,
    peers: presence.peers,
    expected,
    published: target ?? published,
    fallback: { tone: 'idle', label: '', short: '', why: '', outputs: 0, source: 'none', show: false },
    now,
  });
  const lines: OutputLine[] = readiness.outputs;

  // While preparing: a clock for the wait, and the question every tick asks - has every output
  // settled on the target, or is the wait over?
  useEffect(() => {
    if (phase !== 'preparing') return;
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, [phase]);

  const presentIds = new Set(presence.peers.filter((p) => p.kind === 'output').map((p) => p.id));
  const waitingFor = phase === 'preparing' && target ? preparedOutputs(presence.peers, expected) : [];
  const settled = new Set<string>();
  for (const id of waitingFor) {
    const entry = presence.peers.filter((p) => p.kind === 'output' && p.id === id).sort((a, b) => b.at - a.at)[0];
    const gone = presentIds.has(id) ? null : Math.max(0, now - (expected.filter((e) => e.id === id)[0]?.seen || startedAt));
    if (target && outputSettled(entry, target, gone, request ?? undefined)) settled.add(id);
  }
  const timedOut = phase === 'preparing' && now - startedAt >= PREPARE_WAIT_MS;
  const allSettled = phase === 'preparing' && bridgeLines !== null && waitingFor.every((id) => settled.has(id));

  // THE END OF A RUN, once: every output settled (and the Bridge answered), or the wait is over.
  // What it stamps is read as it stands at that render.
  const finished = phase === 'preparing' && !!target && (allSettled || timedOut);
  const latest = useRef({ publishLine, lines, settled, timedOut, bridgeLines, target, onPrep, onStamp, now });
  latest.current = { publishLine, lines, settled, timedOut, bridgeLines, target, onPrep, onStamp, now };
  useEffect(() => {
    if (!finished) return;
    const at = latest.current;
    if (!at.target) return;
    const done = [...(at.publishLine ? [at.publishLine] : []), ...outputChecks(at.lines, at.settled, at.timedOut), ...(at.bridgeLines ?? [])];
    setFinalLines(done);
    setPhase('done');
    at.onPrep(null);
    at.onStamp(stampOf(done, at.target, at.now));
  }, [finished]);

  const run = async () => {
    setFinalLines(null);
    setBridgeLines(null);
    setPublishLine(null);
    let version = published;
    if (unpublishedChanges || !published) {
      setPhase('publishing');
      const written = await publish();
      if (!written) {
        setPublishLine({ key: 'publish', tone: 'bad', label: 'The production did not publish', advice: 'The note under the monitors says why. Nothing was sent to the outputs.' });
        setPhase('done');
        return;
      }
      version = written;
      setPublishLine({ key: 'publish', tone: 'ok', label: `Published your changes as v${written.n}` });
    } else {
      setPublishLine({ key: 'publish', tone: 'ok', label: `Nothing changed since v${published.n}` });
    }
    if (!version) return;
    setTarget(version);
    setStartedAt(Date.now());
    setNow(Date.now());
    const prep = { id: requestId(), n: version.n, h: version.h };
    setRequest(prep.id);
    onPrep(prep);
    setPhase('preparing');
    const facts = await bridge().catch(() => null);
    setBridgeLines(facts ? bridgeChecks(facts) : []);
  };

  const shown: CheckLine[] | null =
    phase === 'done'
      ? finalLines
      : phase === 'preparing'
        ? [...(publishLine ? [publishLine] : []), ...outputChecks(lines, settled, false), ...(bridgeLines ?? [{ key: 'bridge', tone: 'running', label: 'Checking NoaCG Bridge and CasparCG' } as CheckLine])]
        : phase === 'publishing'
          ? [{ key: 'publish', tone: 'running', label: 'Publishing your changes' }]
          : null;

  return { phase, shown, run };
}

export function PrepareForLive({
  flow,
  stamp,
  published,
  unpublishedChanges,
}: {
  flow: PrepareFlow;
  stamp: ReadyStamp | null;
  published: HeldVersion | null;
  unpublishedChanges: boolean;
}) {
  const { phase, shown, run } = flow;
  const busy = phase === 'publishing' || phase === 'preparing';
  return (
    <section className="pd-prepare" data-testid="prepare-for-live">
      <div className="pd-ready-title">
        <span>Prepare for Live</span>
      </div>
      {stamp && phase !== 'publishing' && phase !== 'preparing' && (
        <p className={`pd-prepare-stamp${stamp.problems ? ' is-bad' : stamp.warnings ? ' is-warn' : ' is-ok'}`} data-testid="prepare-stamp">
          {stampWords(stamp, published, unpublishedChanges)}
        </p>
      )}
      {shown && (
        <ul className="pd-prepare-list" data-testid="prepare-checklist">
          {shown.map((line) => (
            <li key={line.key} className={`pd-prepare-line pd-prepare-line--${line.tone}`} data-tone={line.tone}>
              <span className="pd-ready-dot" aria-hidden="true">
                {DOT[line.tone]}
              </span>
              <span>
                {line.label}
                {line.advice && line.tone !== 'ok' && <span className="pd-ready-detail">{line.advice}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className="pd-prepare-note">
        {unpublishedChanges || !published
          ? 'Your unpublished changes will be published and included. Every output then prepares them and is checked. Editing goes on as usual.'
          : `Every output is checked on v${published.n}. Nothing is locked.`}
      </p>
      <button type="button" className="primary pd-prepare-button" disabled={busy} onClick={() => void run()} data-testid="prepare-for-live-button">
        {busy ? 'Preparing…' : phase === 'done' ? 'Prepare for Live again' : 'Prepare for Live'}
      </button>
    </section>
  );
}
