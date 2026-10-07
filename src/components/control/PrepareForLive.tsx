// THE READINESS RUN behind Publish, Publish changes and Check now on the production page (Phase 6
// Step 3 landing b: docs/work-specs/playout-ready/spec.md AC-8 to AC-11; since
// playout-workflow-simplification it has no section of its own - its result reads in the panel's
// output rows). The decisions are control/prepareLive.ts; `usePrepareForLive` runs the flow:
// publish what changed, ask the outputs to prepare, check the Bridge and CasparCG, ping the command
// path, and stamp the result. The flow lives in the page, not the panel: the panel closes on any
// click outside it (a Take, say), and a run goes on to its stamp while it is shut.
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
  withPing,
  type BridgeFacts,
  type CheckLine,
  type PingSent,
  type PrepRequest,
} from '../../control/prepareLive';
import type { PingAnswer } from '../../control/hostedControl';
import { describeReadiness, type ExpectedOutput, type HeldVersion, type OutputLine, type ReadyStamp } from '../../control/readiness';
import type { LivePresenceView } from './OutputHealth';

type Phase = 'idle' | 'publishing' | 'preparing' | 'done';


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
  extraChecks,
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
  /** Additive destination diagnostics, read at completion so one mirror cannot imply both are ready. */
  extraChecks?: () => CheckLine[];
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
  const busyRun = useRef(false);
  const currentShow = useRef(showId);
  currentShow.current = showId;
  useEffect(() => {
    busyRun.current = false;
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
  const latest = useRef({ publishLine, lines, settled, timedOut, bridgeLines, peers, target, onPrep, onStamp, now, request, pingSent, ping, extraChecks });
  latest.current = { publishLine, lines, settled, timedOut, bridgeLines, peers, target, onPrep, onStamp, now, request, pingSent, ping, extraChecks };
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
      ...(at.extraChecks?.() ?? []),
    ];
    setFinalLines(done);
    setPhase('done');
    busyRun.current = false;
    at.onPrep(null, at.request ?? undefined);
    at.onStamp(stampOf(done, at.target, at.now));
  }, [finished]);

  const run = async () => {
    if (busyRun.current) return;
    busyRun.current = true;
    const stillCurrent = () => currentShow.current === showId;
    setPhase('publishing');
    setFinalLines(null);
    setBridgeLines(null);
    setPublishLine(null);
    setPingSent(null);
    const factsPending = bridge().catch(() => null);
    let version = published;
    try {
      const changed = unpublishedChanges || (await recheckChanges());
      if (!stillCurrent()) return;
      if (changed || !published) {
        const written = await publish();
        if (!stillCurrent()) return;
        if (!written) {
          const failed: CheckLine = { key: 'publish', tone: 'bad', label: 'The production did not publish', advice: 'The note under the monitors says why. Nothing was sent to the outputs.' };
          const facts = await factsPending;
          if (!stillCurrent()) return;
          setPublishLine(failed);
          setFinalLines([failed, ...(facts ? bridgeChecks(facts) : [])]);
          setPhase('done');
          busyRun.current = false;
          return;
        }
        version = written;
        setPublishLine({ key: 'publish', tone: 'ok', label: 'Published your changes' });
      } else {
        setPublishLine({ key: 'publish', tone: 'ok', label: 'No unpublished changes' });
      }
      if (!version) { busyRun.current = false; setPhase('idle'); return; }
      setTarget(version);
      setStartedAt(Date.now());
      setNow(Date.now());
      const prep = { id: requestId(), n: version.n, h: version.h };
      setRequest(prep.id);
      onPrep(prep);
      setPhase('preparing');
      const facts = await factsPending;
      if (!stillCurrent()) return;
      setBridgeLines(facts ? bridgeChecks(facts) : []);
    } catch (e) {
      if (!stillCurrent()) return;
      busyRun.current = false;
      const failed: CheckLine = { key: 'publish', tone: 'bad', label: 'Readiness check failed', advice: e instanceof Error ? e.message : String(e) };
      setPublishLine(failed);
      setFinalLines([failed]);
      setPhase('done');
    }
  };

  const shown: CheckLine[] | null =
    phase === 'done'
      ? finalLines
      : phase === 'preparing'
        ? [
            ...(publishLine ? [publishLine] : []),
            ...withPing(outputChecks(lines, settled, false), peers, pingSent, now),
            ...(bridgeLines ?? [{ key: 'bridge', tone: 'running', label: 'Checking NoaCG Bridge and CasparCG' } as CheckLine]),
            ...(extraChecks?.() ?? []),
          ]
        : phase === 'publishing'
          ? [{ key: 'publish', tone: 'running', label: 'Publishing your changes' }]
          : null;

  return { phase, shown, run };
}
