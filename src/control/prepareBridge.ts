// WHAT PREPARE FOR LIVE ASKS NOACG BRIDGE AND CASPARCG (Phase 6 Step 3 landing b, AC-10): read-only.
// A real VERSION round trip; what the output slot holds (`/state`, where the Bridge can read it);
// and the server's library, only for the kinds the rundown cues. Nothing is played, stopped or
// changed. The words are prepareLive.ts `bridgeChecks`.

import type { Show } from '../model/shows';
import { listLibrary, playoutConfigured, readState, testConnection, type PlayoutSettings } from './playoutLink';
import type { BridgeFacts } from './prepareLive';

export async function gatherBridgeFacts(settings: PlayoutSettings, show: Pick<Show, 'cues' | 'playoutItems' | 'outputSlug'>): Promise<BridgeFacts> {
  const items = (show.cues ?? [])
    .filter((c) => c.source === 'playout')
    .map((c) => (show.playoutItems ?? []).filter((i) => i.id === c.sourceId)[0])
    .filter((i): i is NonNullable<typeof i> => !!i)
    .map((i) => ({ kind: i.kind, name: i.name }));
  const base: BridgeFacts = {
    configured: playoutConfigured(settings),
    status: null,
    outputSlug: show.outputSlug ?? null,
    channel: settings.channel,
    layer: settings.layer,
    items,
  };
  if (!base.configured) return base;
  const status = await testConnection(settings);
  if (status.state !== 'ok') return { ...base, status };
  let listProblem: string | undefined;
  const names = (kind: 'media' | 'template') =>
    items.some((i) => i.kind === kind)
      ? listLibrary(settings, kind).then(
          (r) => {
            if (r.items) return r.items.map((i) => i.name);
            listProblem ??= r.result.detail;
            return null;
          },
          () => null,
        )
      : Promise.resolve(undefined);
  const [slot, media, templates] = await Promise.all([
    readState(settings, settings.channel).then(
      (r) => (r.reply ? (r.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null) : undefined),
      () => undefined,
    ),
    names('media'),
    names('template'),
  ]);
  return { ...base, status, slot, media, templates, ...(listProblem ? { listProblem } : {}) };
}
