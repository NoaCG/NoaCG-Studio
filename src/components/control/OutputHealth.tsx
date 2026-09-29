// THE ONE OUTPUT HEALTH LINE, on both operator surfaces: the production dashboard's header and the
// hosted control page's (so the phone too). docs/PLAYOUT_ISOLATION_RESEARCH.md §16 item 11; the
// words are decided once, in control/livePath.ts `describeOutputHealth`, so the two surfaces can
// never describe the same output differently.

import { useEffect, useRef, useState } from 'react';
import {
  LIVE_BUILD,
  LIVE_PROTOCOL,
  describeOutputHealth,
  hostEngine,
  joinLivePresence,
  liveInstanceId,
  onSendCounted,
  senderCounters,
  type LiveEntry,
  type LivePresence,
  type LivePresenceStatus,
} from '../../control/livePath';

export interface LivePresenceView {
  status: LivePresenceStatus;
  peers: LiveEntry[];
  /** Has an output been listed since this page joined? (`describeOutputHealth` says why.) */
  sawOutput: boolean;
}

/**
 * THIS OPERATOR PAGE ON THE PRODUCTION'S LIVE TOPIC: it announces itself (its engine, build,
 * whether its own log and command channels are joined, and its send counters) and hears every
 * output's entry. `showId` null means not published, or no backend: nothing is joined.
 */
export function useLivePresence(
  showId: string | null,
  surface: 'production' | 'hosted',
  roads: { log: boolean | null; cmd: boolean | null },
): LivePresenceView {
  const [view, setView] = useState<LivePresenceView>({ status: 'off', peers: [], sawOutput: false });
  const roadsRef = useRef(roads);
  const presenceRef = useRef<LivePresence | null>(null);

  useEffect(() => {
    if (!showId) return;
    const presence = joinLivePresence({
      showId,
      entry: () => ({
        kind: 'operator',
        id: liveInstanceId(),
        engine: hostEngine(),
        build: LIVE_BUILD,
        proto: LIVE_PROTOCOL,
        surface,
        log: roadsRef.current.log,
        cmd: roadsRef.current.cmd,
        at: Date.now(),
        stats: senderCounters(),
      }),
      onPeers: (peers) =>
        setView((v) => ({ ...v, peers, sawOutput: v.sawOutput || peers.some((p) => p.kind === 'output') })),
      onStatus: (status) => setView((v) => ({ ...v, status })),
    });
    presenceRef.current = presence;
    const stopCounting = onSendCounted(() => presence.touch());
    return () => {
      stopCounting();
      presence.close();
      presenceRef.current = null;
      setView({ status: 'off', peers: [], sawOutput: false });
    };
  }, [showId, surface]);

  const { log, cmd } = roads;
  useEffect(() => {
    roadsRef.current = { log, cmd };
    presenceRef.current?.touch();
  }, [log, cmd]);

  return view;
}

export function OutputHealthLine({
  presence,
  seenAt,
  heartbeatLive,
  known,
  now,
  testId = 'output-health',
}: {
  presence: LivePresenceView;
  /** The renderer heartbeat (`output_seen_at`). */
  seenAt: string | null;
  /** True when `seenAt` is re-read while the page is open; false when it is the resolve's value. */
  heartbeatLive: boolean;
  /** The operator has taken the output URL, so there is an output worth asking about. */
  known?: boolean;
  now: number;
  testId?: string;
}) {
  const health = describeOutputHealth({
    presence: presence.status,
    peers: presence.peers,
    sawOutput: presence.sawOutput,
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
