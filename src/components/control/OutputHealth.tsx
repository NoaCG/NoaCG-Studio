// THE ONE READY LINE, on both operator surfaces: the production dashboard's header and the hosted
// control page's (so the phone too). It grew out of Step 1's output health line
// (docs/PLAYOUT_ISOLATION_RESEARCH.md §16 item 11) into READY (Phase 6 Step 3,
// docs/work-specs/playout-ready/spec.md): the words are decided once, in control/readiness.ts
// `describeReadiness`, over Step 1's `describeOutputHealth`, so the two surfaces can never describe
// the same output differently. READY is a status, never permission: nothing here disables a verb.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  describeOutputHealth,
  joinLivePresence,
  liveEntry,
  liveInstanceId,
  onSendCounted,
  senderCounters,
  withAnnouncedOutputs,
  type LiveEntry,
  type LivePresence,
  type LivePresenceStatus,
} from '../../control/livePath';
import {
  describeReadiness,
  forgetOutput,
  newestVersion,
  rememberOutputs,
  sameOutputs,
  type ExpectedOutput,
  type HeldVersion,
  type OutputLine,
  type ReadyStamp,
} from '../../control/readiness';
import { loadReadyMemory, saveReadyMemory } from '../../model/readyMemory';
import LibMenu from '../home/LibMenu';

export interface LivePresenceView {
  /** The production this view is of: the production page is reused when the route moves to
   *  another, and a view still holding the last one's peers must not be read as this one's. */
  showId: string | null;
  status: LivePresenceStatus;
  /** The outputs on the topic. */
  peers: LiveEntry[];
  /** The OTHER operator pages that announce something READY reads: a version, expected outputs, a
   *  stamp (the production page announces them for the hosted page and the phone). */
  operators: LiveEntry[];
  /** When the listed outputs last went from some to none, on this page's clock
   *  (`describeOutputHealth` says why). */
  outputLeftAt: number | null;
}

/** What this operator page announces for the others (R5): only the production page has any. */
export interface LiveAnnouncement {
  pub?: HeldVersion | null;
  exp?: ExpectedOutput[];
  stamp?: ReadyStamp | null;
}

const EMPTY_VIEW: LivePresenceView = { showId: null, status: 'off', peers: [], operators: [], outputLeftAt: null };

/**
 * THIS OPERATOR PAGE ON THE PRODUCTION'S LIVE TOPIC: it announces itself (its engine, build,
 * whether its own log and command channels are joined, its send counters, and whatever the page
 * hands `announce`) and hears every output's entry and every other operator's announcement.
 * `showId` null means not published, or no backend: nothing is joined.
 *
 * It re-renders only when something the line shows changed: the hook sits at the top of two large
 * pages, and every page on the topic re-announcing would otherwise re-render both.
 */
export function useLivePresence(
  showId: string | null,
  surface: 'production' | 'hosted',
  roads: { log: boolean | null; cmd: boolean | null },
): LivePresenceView & { announce: (a: LiveAnnouncement) => void } {
  const [view, setView] = useState<LivePresenceView>(EMPTY_VIEW);
  const roadsRef = useRef(roads);
  const announceRef = useRef<LiveAnnouncement>({});
  const presenceRef = useRef<LivePresence | null>(null);

  useEffect(() => {
    if (!showId) return;
    const self = liveInstanceId();
    const presence = joinLivePresence({
      showId,
      entry: () => {
        const a = announceRef.current;
        // `exp` is sent even when it is empty: "I expect no output" is what lets a Forget on the
        // production page reach the phone (livePath.ts withAnnouncedOutputs).
        return liveEntry('operator', surface, roadsRef.current, senderCounters(), {
          ...(a.pub ? { pub: a.pub } : {}),
          ...(a.exp ? { exp: a.exp } : {}),
          ...(a.stamp ? { stamp: a.stamp } : {}),
        });
      },
      onPeers: (peers) =>
        setView((v) => {
          const outputs = peers.filter((p) => p.kind === 'output');
          const operators = peers.filter((p) => p.kind === 'operator' && p.id !== self && (p.pub || p.exp || p.stamp));
          if (outputsKey(outputs) === outputsKey(v.peers) && operatorsKey(operators) === operatorsKey(v.operators)) return v;
          const had = v.peers.length > 0;
          return {
            ...v,
            showId,
            peers: outputs,
            operators,
            outputLeftAt: outputs.length > 0 ? null : had ? Date.now() : v.outputLeftAt,
          };
        }),
      onStatus: (status) => setView((v) => (v.status === status && v.showId === showId ? v : { ...v, showId, status })),
    });
    presenceRef.current = presence;
    // A failed send is worth announcing; a successful one rides the next entry this page sends.
    let failed = senderCounters().failed;
    const stopCounting = onSendCounted(() => {
      if (senderCounters().failed === failed) return;
      failed = senderCounters().failed;
      presence.touch();
    });
    return () => {
      stopCounting();
      presence.close();
      presenceRef.current = null;
      setView(EMPTY_VIEW);
    };
  }, [showId, surface]);

  const { log, cmd } = roads;
  useEffect(() => {
    roadsRef.current = { log, cmd };
    presenceRef.current?.touch();
  }, [log, cmd]);

  // What this page announces for the others (R5). Handed in from an effect of the page's, because
  // what it announces (the expected outputs) is itself read off this hook's view. Re-sent only when
  // something another page reads changed; the Presence budget coalesces the rest.
  const announce = useCallback((a: LiveAnnouncement) => {
    const key = (x: LiveAnnouncement) => JSON.stringify([x.pub ?? null, (x.exp ?? []).map((e) => [e.id, e.name, e.seen]), x.stamp ?? null]);
    const changed = key(a) !== key(announceRef.current);
    announceRef.current = a;
    if (changed) presenceRef.current?.touch();
  }, []);

  return useMemo(() => ({ ...view, announce }), [view, announce]);
}

/** What the line reads off the outputs: who, on which engine and build, which roads, READY, and
 *  the median the tooltip quotes (rounded, so latency jitter re-renders nothing). */
function outputsKey(outputs: LiveEntry[]): string {
  return outputs
    .map((o) => {
      const lat = (o.stats as { lat?: Record<string, { p50?: number }> } | undefined)?.lat;
      const p50 = lat ? Object.values(lat).find((l) => typeof l?.p50 === 'number')?.p50 : undefined;
      return `${o.id}|${o.engine}|${o.build}|${o.name ?? ''}|${o.log}|${o.cmd}|${p50 === undefined ? '' : Math.round(p50 / 50)}|${JSON.stringify(o.ready ?? null)}`;
    })
    .sort()
    .join(',');
}

function operatorsKey(operators: LiveEntry[]): string {
  return operators
    .map((o) => JSON.stringify([o.id, o.pub ?? null, (o.exp ?? []).map((e) => [e.id, e.name, Math.round(e.seen / 10_000)]), o.stamp ?? null]))
    .sort()
    .join(',');
}

/**
 * THE OUTPUTS THIS PAGE EXPECTS (R5): every output seen on the live topic, so one that is gone
 * reads "not answering" in red. `persist` is the production page, which remembers them per
 * production in this browser; the hosted page remembers them while it is open. The last-seen times
 * are refreshed in memory on every Presence update and written at most every 30 s.
 */
export function useExpectedOutputs(
  showId: string | null,
  presence: LivePresenceView,
  persist: boolean,
): { expected: ExpectedOutput[]; forget: (id: string) => void } {
  const [expected, setExpected] = useState<ExpectedOutput[]>(() => (showId && persist ? loadReadyMemory(showId).outputs : []));
  const writtenAt = useRef(0);
  /** The outputs present at the last update: one gone since was last seen now. */
  const wasPresent = useRef<Set<string>>(new Set());
  useEffect(() => {
    setExpected(showId && persist ? loadReadyMemory(showId).outputs : []);
    wasPresent.current = new Set();
  }, [showId, persist]);
  const joined = presence.status === 'joined' && presence.showId === showId;
  const peers = presence.peers;
  useEffect(() => {
    if (!joined || !showId) return;
    const now = Date.now();
    const before = wasPresent.current;
    wasPresent.current = new Set(peers.map((p) => p.id));
    setExpected((held) => {
      const next = rememberOutputs(held, peers, now, before);
      if (persist && (!sameOutputs(held, next) || now - writtenAt.current > 30_000 || [...before].some((id) => !wasPresent.current.has(id)))) {
        writtenAt.current = now;
        saveReadyMemory(showId, { ...loadReadyMemory(showId), outputs: next });
      }
      return next;
    });
  }, [joined, peers, showId, persist]);
  const forget = (id: string) => {
    setExpected((held) => {
      const next = forgetOutput(held, id);
      if (persist && showId) saveReadyMemory(showId, { ...loadReadyMemory(showId), outputs: next });
      return next;
    });
  };
  return { expected, forget };
}

/**
 * The expected outputs as the production page announces them: a present output's last-seen time
 * is left out (0), because the others see it present for themselves, and a time that moved with
 * every Presence update would re-announce with every one. A gone output keeps the moment it left,
 * so a phone that opens later reads "not answering (3 min)" from when it really stopped.
 */
export function announcedExpected(expected: readonly ExpectedOutput[], presence: LivePresenceView): ExpectedOutput[] {
  const here = new Set(presence.peers.map((p) => p.id));
  return expected.map((e) => (here.has(e.id) ? { ...e, seen: 0 } : e));
}

/** A clock for "not answering (40 s)": ticks every 5 s while `running`, not at all otherwise. */
function useTick(running: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 5_000);
    return () => clearInterval(timer);
  }, [running]);
  return now;
}

const DOT: Record<OutputLine['tone'], string> = { ok: '●', warn: '▲', bad: '✕', idle: '○' };

export function ReadyLine({
  presence,
  seenAt,
  heartbeatLive,
  seenReadAt,
  known,
  now: pageNow,
  published,
  expected,
  stamp,
  onForget,
  testId = 'output-health',
  children,
}: {
  presence: LivePresenceView;
  /** The renderer heartbeat (`output_seen_at`), for Step 1's line underneath. */
  seenAt: string | null;
  /** True when `seenAt` is re-read while the page is open; false when it is the resolve's value. */
  heartbeatLive: boolean;
  /** When a never-re-read `seenAt` was read (the hosted page's open time). */
  seenReadAt?: number;
  /** The operator has taken the output URL, so there is an output worth asking about. */
  known?: boolean;
  now: number;
  /** The published version this page knows (its resolve, its own publish). */
  published: HeldVersion | null;
  /** The outputs this page expects (`useExpectedOutputs`). */
  expected: ExpectedOutput[];
  /** This page's own last stamp (the production page's Prepare for Live). */
  stamp?: ReadyStamp | null;
  /** Offered on a gone output's line when this page keeps the list (the production page). */
  onForget?: (id: string) => void;
  testId?: string;
  /** More of the panel: the production page's Prepare for Live. */
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const operators = presence.operators;
  // A page that keeps the list (the production page, where Forget is) answers for itself; the
  // hosted page counts what the production page announces.
  const allExpected = useMemo(() => (onForget ? expected : withAnnouncedOutputs(expected, operators)), [expected, operators, onForget]);
  const presentIds = new Set(presence.peers.map((p) => p.id));
  const someGone = presence.status === 'joined' && allExpected.some((e) => !presentIds.has(e.id));
  const tick = useTick(someGone);
  const now = Math.max(pageNow, tick);
  const newestStamp = [stamp ?? null, ...operators.map((o) => o.stamp ?? null)].reduce<ReadyStamp | null>(
    (best, s) => (s && (!best || s.at > best.at) ? s : best),
    null,
  );
  const knownVersion = newestVersion(published, ...operators.map((o) => o.pub));
  const fallback = describeOutputHealth({
    presence: presence.status,
    peers: presence.peers,
    outputLeftAt: presence.outputLeftAt,
    seenReadAt,
    seenAt,
    heartbeatLive,
    known,
    now,
  });
  const view = describeReadiness({
    presence: presence.status,
    peers: presence.peers,
    expected: allExpected,
    published: knownVersion,
    stamp: newestStamp,
    fallback,
    now,
  });
  const { summary, outputs } = view;
  if (!summary.show) return null;
  return (
    <span className="pd-ready-host">
      <button
        type="button"
        className={`pd-health pd-health--${summary.tone} pd-ready`}
        data-testid={testId}
        data-tone={summary.tone}
        data-source={summary.source}
        data-outputs={summary.outputs}
        data-ready={summary.ready}
        aria-expanded={open}
        title={summary.why}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="pd-health-full">{summary.label}</span>
        <span className="pd-health-short" aria-hidden="true">
          {summary.short}
        </span>
      </button>
      <LibMenu open={open} onClose={() => setOpen(false)} surface="pd-ready-panel" role="none" testid={`${testId}-panel`}>
        <div className="pd-ready-title">
          <span>Outputs</span>
          {knownVersion && <span className="pd-ready-version">published v{knownVersion.n}</span>}
        </div>
        {outputs.length === 0 ? (
          <p className="pd-ready-empty">{summary.why}</p>
        ) : (
          <ul className="pd-ready-list">
            {outputs.map((line) => (
              <li key={line.id} className={`pd-ready-row pd-ready-row--${line.tone}`} data-testid="ready-output">
                <div className="pd-ready-row-head">
                  <span className="pd-ready-dot" aria-hidden="true">
                    {DOT[line.tone]}
                  </span>
                  <span className="pd-ready-name">{line.name}</span>
                  {line.gone && onForget && (
                    <button type="button" className="pd-ready-forget" onClick={() => onForget(line.id)} data-testid="ready-forget">
                      Forget
                    </button>
                  )}
                </div>
                <div className="pd-ready-state" data-testid="ready-state">
                  {line.state}
                </div>
                {line.detail.map((d, i) => (
                  <div key={i} className="pd-ready-detail">
                    {d}
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
        {children}
      </LibMenu>
    </span>
  );
}
