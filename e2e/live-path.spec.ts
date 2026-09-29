// THE LIVE PATH'S WORDS AND NUMBERS, offline (Phase 6 Step 1). The Presence join, the stamps on
// the wire and the two operator pages are walked on a real backend by
// e2e/configured/live-health.spec.ts; what is pinned here is the half that is pure: which host an
// output says it is, what an output counts and times, and which health line each state produces.
// covers: src/control/livePath.ts, src/components/control/OutputHealth.tsx

import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/app');
});

test('an output names its host from the marker the host puts on the page', async ({ page }) => {
  const names = await page.evaluate(async () => {
    const { hostEngine } = await import('/src/control/livePath.ts');
    const chromium71 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36';
    const chrome140 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
    return {
      caspar: hostEngine(chromium71, { caspar: {} }),
      caspar25: hostEngine(chrome140.replace('140', '142'), { caspar: {}, casparcg: {} }),
      obs: hostEngine(chrome140.replace('140', '127'), { obsstudio: { pluginVersion: '2.24.2' } }),
      chrome: hostEngine(chrome140, {}),
      edge: hostEngine(`${chrome140} Edg/140.0.0.0`, {}),
      firefox: hostEngine('Mozilla/5.0 (Windows NT 10.0; rv:130.0) Gecko/20100101 Firefox/130.0', {}),
      safari: hostEngine('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1', {}),
    };
  });
  expect(names).toEqual({
    caspar: 'CasparCG · Chromium 71',
    caspar25: 'CasparCG · Chromium 142',
    obs: 'OBS · Chromium 127',
    chrome: 'Chrome 140',
    edge: 'Edge 140',
    firefox: 'Firefox 130',
    safari: 'Safari 17',
  });
});

test('an output counts every road, drops the second copy, and times a stamped command to the frame', async ({ page }) => {
  const result = await page.evaluate(async () => {
    const { createLiveStats, withSender, LATE_MS } = await import('/src/control/livePath.ts');
    let clock = 10_000;
    const frames: (() => void)[] = [];
    const stats = createLiveStats({ now: () => clock, frame: (then) => frames.push(then) });
    const play = withSender({ t: 'play' as const }, 9_900);
    // Fast road first: received, applied at 10 000, its frame 16 ms later.
    stats.received('fast', play);
    stats.applied('fast', play, 10_000);
    clock = 10_016;
    frames.shift()!();
    // The log's copy of the same command: received and dropped.
    stats.received('log', play);
    stats.duplicate(play);
    // A status row is neither counted nor timed.
    stats.received('log', { t: 'cue', cue: 'c1' });
    // A command pressed long ago, recovered by a tail read after a hole.
    stats.hole();
    stats.refilled();
    const late = withSender({ t: 'stop' as const }, 10_016 - LATE_MS - 500);
    stats.received('tail', late);
    stats.applied('tail', late, 10_016);
    frames.shift()!();
    return stats.summary();
  });
  expect(result.rx).toEqual({ fast: 1, log: 1, tail: 1 });
  expect(result.dup).toBe(1);
  expect(result.holes).toBe(1);
  expect(result.refills).toBe(1);
  expect(result.late).toBe(1);
  expect(result.refused).toBe(0);
  expect(result.lat.fast).toEqual({ n: 1, p50: 116, p95: 116 });
  expect(result.last).toEqual({ road: 'tail', rx: 2500, apply: 0, frame: 0 });
});

test('one health line: Presence when joined, the heartbeat otherwise, and amber when an output is on the poll', async ({ page }) => {
  const lines = await page.evaluate(async () => {
    const { describeOutputHealth } = await import('/src/control/livePath.ts');
    const now = Date.parse('2026-09-30T20:00:00Z');
    const output = (over: Record<string, unknown>) => ({
      kind: 'output' as const,
      id: 'abcdefabcdef',
      engine: 'OBS · Chromium 127',
      build: '1a2b3c4',
      proto: 1,
      surface: 'output',
      log: true,
      cmd: true,
      at: now - 2000,
      ...over,
    });
    const seen = new Date(now - 30_000).toISOString();
    const pick = (h: ReturnType<typeof describeOutputHealth>) => ({ tone: h.tone, label: h.label, short: h.short, source: h.source, show: h.show });
    return {
      // One renderer, reloaded: its old entry and its new one share an instance id.
      reloaded: pick(describeOutputHealth({ presence: 'joined', peers: [output({ at: now - 30_000 }), output({})], seenAt: seen, heartbeatLive: true, now })),
      two: pick(describeOutputHealth({ presence: 'joined', peers: [output({}), output({ id: 'x', engine: 'CasparCG · Chromium 71' })], seenAt: seen, heartbeatLive: true, now })),
      poll: pick(describeOutputHealth({ presence: 'joined', peers: [output({ log: false })], seenAt: seen, heartbeatLive: false, now })),
      noFast: pick(describeOutputHealth({ presence: 'joined', peers: [output({ cmd: false })], seenAt: seen, heartbeatLive: false, now })),
      // The output closed after its last heartbeat: that beat is not a new one.
      closed: pick(describeOutputHealth({ presence: 'joined', peers: [], outputLeftAt: now - 10_000, seenAt: seen, heartbeatLive: true, now })),
      // Beating after it left Presence, or never in it: on the web, not on the live channel.
      notLive: pick(describeOutputHealth({ presence: 'joined', peers: [], outputLeftAt: now - 60_000, seenAt: seen, heartbeatLive: true, now })),
      neverAnnounced: pick(describeOutputHealth({ presence: 'joined', peers: [], outputLeftAt: null, seenAt: seen, heartbeatLive: true, now })),
      deskFallback: pick(describeOutputHealth({ presence: 'down', peers: [], seenAt: seen, heartbeatLive: true, now })),
      deskStale: pick(describeOutputHealth({ presence: 'off', peers: [], seenAt: new Date(now - 300_000).toISOString(), heartbeatLive: true, now })),
      deskNever: pick(describeOutputHealth({ presence: 'off', peers: [], seenAt: null, heartbeatLive: true, known: false, now })),
      hostedSnapshot: pick(describeOutputHealth({ presence: 'down', peers: [], seenAt: seen, heartbeatLive: false, seenReadAt: now, now })),
      // Ten minutes on, the snapshot still says what it said: it is judged when it was read.
      hostedLater: pick(describeOutputHealth({ presence: 'down', peers: [], seenAt: seen, heartbeatLive: false, seenReadAt: now, now: now + 600_000 })),
    };
  });
  expect(lines.reloaded).toMatchObject({ tone: 'ok', label: '● 1 output · OBS · Chromium 127' });
  expect(lines.two).toMatchObject({ tone: 'ok', label: '● 2 outputs · OBS, CasparCG', short: '● 2 outputs', source: 'presence' });
  expect(lines.poll).toMatchObject({ tone: 'warn', label: '▲ 1 output · commands may arrive up to 30 s late', short: '▲ 1 output · late' });
  expect(lines.noFast).toMatchObject({ tone: 'warn', label: '▲ 1 output · commands may arrive late' });
  expect(lines.closed).toMatchObject({ tone: 'idle', label: '○ no output connected', source: 'presence', show: true });
  expect(lines.notLive).toMatchObject({ tone: 'warn', label: '▲ output not on the live channel · commands may arrive up to 30 s late', source: 'heartbeat' });
  expect(lines.neverAnnounced).toMatchObject({ tone: 'warn', short: '▲ output · late' });
  expect(lines.deskFallback).toMatchObject({ tone: 'ok', label: '● output connected', source: 'heartbeat' });
  expect(lines.deskStale).toMatchObject({ tone: 'idle', label: '○ output not answering' });
  expect(lines.deskNever).toMatchObject({ show: false });
  expect(lines.hostedSnapshot).toMatchObject({ tone: 'idle', label: '○ output seen when this page opened', source: 'heartbeat' });
  expect(lines.hostedLater).toEqual(lines.hostedSnapshot);
});
