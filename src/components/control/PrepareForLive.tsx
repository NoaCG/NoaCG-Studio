// PREPARE FOR LIVE on the production page (Phase 6 Step 3 landing b: docs/work-specs/playout-ready/
// spec.md AC-8 to AC-11). It shows in the production page's Playout panel (home/
// PlayoutStatusControl.tsx), under the outputs it waits for. The decisions are control/prepareLive.ts; `usePrepareForLive` runs the
// flow: publish what changed, ask the outputs to prepare, check the Bridge and CasparCG, ping the
// command path, and stamp the result. The flow lives in the page, not the panel: the panel closes on any click outside it
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
  pingSettled,
  preparedOutputs,
  requestId,
  stampOf,
  stampWords,
  withPing,
  type BridgeFacts,
  type CheckLine,
  type PingSent,
  type PrepRequest,
} from '../../control/prepareLive';
import type { PingAnswer } from '../../control/hostedControl';
import { describeReadiness, TONE_DOT, type ExpectedOutput, type HeldVersion, type OutputLine, type ReadyStamp } from '../../control/readiness';
import type { LivePresenceView } from './OutputHealth';

type Phase = 'idle' | 'publishing' | 'preparing' | 'done';

const DOT: Record<CheckLine['tone'], string> = { ...TONE_DOT, running: '…' };

/** One line of a checklist: the tone's dot, the words, and what to do while it is not fine. The
 *  Playout panel's status checks are drawn the same way, so the two lists in it read as one. */
export function CheckRow({ line, testId }: { line: Pick<CheckLine, 'tone' | 'label' | 'advice'>; testId?: string }) {
  return (
    <li className={`pd-prepare-line pd-prepare-line--${line.tone}`} data-tone={line.tone} data-testid={testId}>
      <span className="pd-ready-dot" aria-hidden="true">
        {DOT[line.tone]}
      </span>
      <span>
        {line.label}
        {line.advice && line.tone !== 'ok' && <span className="pd-ready-detail">{line.advice}</span>}
      </span>
    </li>
  );
}

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
  recheckChanges,
  publish,
  onPrep,
  onStamp,
  bridge,
  ping,
}: {
  /** The production: another one starts from nothing. */
  showId: string | null;
  presence: LivePresenceView;
  expected: ExpectedOutput[];
  /** The version the server holds, as this page knows it (null: never published with a stamp). */
  published: HeldVersion | null;
  /** The production was edited since its last publish. */
  unpublishedChanges: boolean;
  /** Asked at the press when `unpublishedChanges` is false: has anything changed since the publish,
   *  right now? It catches a library edit made a moment before, which the page's own reading has not
   *  caught up with yet (components/home/usePublishDrift.ts). */
  recheckChanges: () => Promise<boolean>;
  /** Publish now; the version written, or null when it did not publish (the reason is on the page). */
  publish: () => Promise<HeldVersion | null>;
  /** Put a prepare request in this page's Presence entry, or take out the one with id `endOf`: a
   *  publish may have put a newer request there since, and that one stays. */
  onPrep: (prep: PrepRequest | null, endOf?: string) => void;
  onStamp: (stamp: ReadyStamp) => void;
  /** Gather what the Bridge and CasparCG say (read-only). */
  bridge: () => Promise<BridgeFacts>;
  /** Send one ping through the command path (migration 0072). */
  ping: (id: string) => Promise<PingAnswer>;
}): PrepareFlow {
  const [phase, setPhase] = useState<Phase>('idle');
  const [publishLine, setPublishLine] = useState<CheckLine | null>(null);
  const [bridgeLines, setBridgeLines] = useState<CheckLine[] | null>(null);
  const [target, setTarget] = useState<HeldVersion | null>(null);
  const [startedAt, setStartedAt] = useState(0);
  const [request, setRequest] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [finalLines, setFinalLines] = useState<CheckLine[] | null>(null);
  const [pingSent, setPingSent] = useState<PingSent | null>(null);
  useEffect(() => {
    setPhase('idle');
    setFinalLines(null);
    setTarget(null);
    setRequest(null);
    setPingSent(null);
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
  // Every output settled on the target (and the Bridge answered), or the wait is over.
  const outputsDone = phase === 'preparing' && !!target && ((bridgeLines !== null && waitingFor.every((id) => settled.has(id))) || timedOut);
  // THE PING goes out only then: an output that reloads onto the new version while preparing
  // would lose its answer with the page it answered from. Then every output present answers, or
  // its PING_WAIT_MS runs out.
  const pingDone =
    !!pingSent &&
    presence.peers.filter((p) => p.kind === 'output').every((p) => pingSettled(p, pingSent, now));

  // THE END OF A RUN, once. What it stamps is read as it stands at that render.
  const finished = outputsDone && pingDone;
  const peers = presence.peers;
  const latest = useRef({ publishLine, lines, settled, timedOut, bridgeLines, peers, target, onPrep, onStamp, now, request, pingSent, ping });
  latest.current = { publishLine, lines, settled, timedOut, bridgeLines, peers, target, onPrep, onStamp, now, request, pingSent, ping };
  useEffect(() => {
    if (!outputsDone) return;
    const at = latest.current;
    const id = at.request;
    if (!id || (at.pingSent && at.pingSent.id === id)) return;
    setPingSent({ id, sentAt: at.now, state: 'sending' });
    const answered = (next: PingSent) => setPingSent((cur) => (cur && cur.id === id ? next : cur));
    at.ping(id).then(
      (answer) =>
        answered(
          answer.ok
            ? { id, sentAt: Date.now(), state: 'sent' }
            : { id, sentAt: Date.now(), state: answer.unavailable ? 'unavailable' : 'failed', detail: answer.detail },
        ),
      () => answered({ id, sentAt: Date.now(), state: 'failed' }),
    );
  }, [outputsDone]);
  useEffect(() => {
    if (!finished) return;
    const at = latest.current;
    if (!at.target) return;
    const done = [
      ...(at.publishLine ? [at.publishLine] : []),
      ...withPing(outputChecks(at.lines, at.settled, at.timedOut), at.peers, at.pingSent, at.now),
      ...(at.bridgeLines ?? []),
    ];
    setFinalLines(done);
    setPhase('done');
    at.onPrep(null, at.request ?? undefined);
    at.onStamp(stampOf(done, at.target, at.now));
  }, [finished]);

  const run = async () => {
    setFinalLines(null);
    setBridgeLines(null);
    setPublishLine(null);
    setPingSent(null);
    let version = published;
    const changed = unpublishedChanges || (await recheckChanges());
    if (changed || !published) {
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
        ? [
            ...(publishLine ? [publishLine] : []),
            ...withPing(outputChecks(lines, settled, false), peers, pingSent, now),
            ...(bridgeLines ?? [{ key: 'bridge', tone: 'running', label: 'Checking NoaCG Bridge and CasparCG' } as CheckLine]),
          ]
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
            <CheckRow key={line.key} line={line} />
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
