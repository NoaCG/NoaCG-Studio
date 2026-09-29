// THE ONE OUTPUT HEALTH LINE, on both operator surfaces: the production dashboard's header and the
// hosted control page's (so the phone too). docs/PLAYOUT_ISOLATION_RESEARCH.md §16 item 11; the
// words are decided once, in control/livePath.ts `describeOutputHealth`, so the two surfaces can
// never describe the same output differently.

import { useEffect, useRef, useState } from 'react';
import {
  describeOutputHealth,
  joinLivePresence,
  liveEntry,
  onSendCounted,
  senderCounters,
  type LiveEntry,
  type LivePresence,
  type LivePresenceStatus,
} from '../../control/livePath';

export interface LivePresenceView {
  status: LivePresenceStatus;
  peers: LiveEntry[];
  /** When the listed outputs last went from some to none, on this page's clock
   *  (`describeOutputHealth` says why). */
  outputLeftAt: number | null;
}

/**
 * THIS OPERATOR PAGE ON THE PRODUCTION'S LIVE TOPIC: it announces itself (its engine, build,
 * whether its own log and command channels are joined, and its send counters) and hears every
 * output's entry. `showId` null means not published, or no backend: nothing is joined.
 *
 * It keeps only the OUTPUTS, and re-renders only when something the line shows about them changed:
 * the hook sits at the top of two large pages, and every page on the topic re-announcing would
 * otherwise re-render both.
 */
export function useLivePresence(
  showId: string | null,
  surface: 'production' | 'hosted',
  roads: { log: boolean | null; cmd: boolean | null },
): LivePresenceView {
  const [view, setView] = useState<LivePresenceView>({ status: 'off', peers: [], outputLeftAt: null });
  const roadsRef = useRef(roads);
  const presenceRef = useRef<LivePresence | null>(null);

  useEffect(() => {
    if (!showId) return;
    const presence = joinLivePresence({
      showId,
      entry: () => liveEntry('operator', surface, roadsRef.current, senderCounters()),
      onPeers: (peers) =>
        setView((v) => {
          const outputs = peers.filter((p) => p.kind === 'output');
          if (shownKey(outputs) === shownKey(v.peers)) return v;
          const had = v.peers.length > 0;
          return { ...v, peers: outputs, outputLeftAt: outputs.length > 0 ? null : had ? Date.now() : v.outputLeftAt };
        }),
      onStatus: (status) => setView((v) => (v.status === status ? v : { ...v, status })),
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
      setView({ status: 'off', peers: [], outputLeftAt: null });
    };
  }, [showId, surface]);

  const { log, cmd } = roads;
  useEffect(() => {
    roadsRef.current = { log, cmd };
    presenceRef.current?.touch();
  }, [log, cmd]);

  return view;
}

/** What the health line reads off the outputs: who, on which engine and build, which roads, and
 *  the median it quotes (rounded, so latency jitter re-renders nothing). */
function shownKey(outputs: LiveEntry[]): string {
  return outputs
    .map((o) => {
      const lat = (o.stats as { lat?: Record<string, { p50?: number }> } | undefined)?.lat;
      const p50 = lat ? Object.values(lat).find((l) => typeof l?.p50 === 'number')?.p50 : undefined;
      return `${o.id}|${o.engine}|${o.build}|${o.log}|${o.cmd}|${p50 === undefined ? '' : Math.round(p50 / 50)}`;
    })
    .sort()
    .join(',');
}

export function OutputHealthLine({
  presence,
  seenAt,
  heartbeatLive,
  seenReadAt,
  known,
  now,
  testId = 'output-health',
}: {
  presence: LivePresenceView;
  /** The renderer heartbeat (`output_seen_at`). */
  seenAt: string | null;
  /** True when `seenAt` is re-read while the page is open; false when it is the resolve's value. */
  heartbeatLive: boolean;
  /** When a never-re-read `seenAt` was read (the hosted page's open time). */
  seenReadAt?: number;
  /** The operator has taken the output URL, so there is an output worth asking about. */
  known?: boolean;
  now: number;
  testId?: string;
}) {
  const health = describeOutputHealth({
    presence: presence.status,
    peers: presence.peers,
    outputLeftAt: presence.outputLeftAt,
    seenReadAt,
    seenAt,
    heartbeatLive,
    known,
    now,
  });
  if (!health.show) return null;
  return (
    <span
      className={`pd-health pd-health--${health.tone}`}
      data-testid={testId}
      data-tone={health.tone}
      data-source={health.source}
      data-outputs={health.outputs}
      title={health.why}
    >
      <span className="pd-health-full">{health.label}</span>
      <span className="pd-health-short" aria-hidden="true">
        {health.short}
      </span>
    </span>
  );
}
