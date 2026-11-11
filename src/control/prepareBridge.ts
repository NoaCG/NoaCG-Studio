// WHAT PREPARE FOR LIVE ASKS NOACG BRIDGE AND THE ACTIVE PLAYOUT SYSTEM: read-only.
// A real VERSION round trip; what the output slot holds (`/state`, where the Bridge can read it);
// and the server's library, only for the kinds the rundown cues. Nothing is played, stopped or
// changed. The words are prepareLive.ts `bridgeChecks`.

import type { Show } from '../model/shows';
import { bridgePaired, listLibrary, listVmixMedia, playoutConfigured, readState, testConnection, testVmix, type PlayoutResult, type PlayoutSettings } from './playoutLink';
import { canReadServerFiles, findServerFiles, serverFileReferences } from './bridgeWatch';
import type { BridgeFacts } from './prepareLive';

export async function gatherBridgeFacts(
  settings: PlayoutSettings,
  show: Pick<Show, 'cues' | 'playoutItems' | 'outputSlug'>,
  relevance: { bridge: boolean; slot: boolean; vmixCurrent?: () => boolean } = { bridge: true, slot: true },
): Promise<BridgeFacts> {
  const { vmixCurrent } = relevance;
  const { items, refs } = serverFileReferences(show.cues ?? [], show.playoutItems ?? [], !!vmixCurrent);
  const vmix = !!vmixCurrent && items.length > 0;
  const foundIds = new Set(items.map(item => item.id));
  const base: BridgeFacts = {
    configured: vmix ? bridgePaired(settings) : relevance.bridge && playoutConfigured(settings),
    ...(vmixCurrent ? { adapter: 'vmix' as const, current: vmixCurrent } : {}),
    // `relevance.bridge` is the production's CasparCG switch (playout-workflow-simplification AC-4):
    // switched on, the Bridge is required and Publish loads the output onto its slot.
    required: vmix || relevance.bridge,
    outputRequired: !vmix && relevance.bridge,
    missingItems: refs.some(id => !foundIds.has(id)),
    outputExpected: !vmix && relevance.slot,
    status: null,
    outputSlug: show.outputSlug ?? null,
    channel: settings.channel,
    layer: settings.layer,
    items,
  };
  if (!base.configured) return base;
  if (vmix && vmixCurrent) {
    if (!vmixCurrent()) return base;
    const connection = await testVmix(settings);
    if (!vmixCurrent()) return base;
    const unavailable: PlayoutResult = { state: 'outdated', detail: 'Update NoaCG Bridge to play vMix media.' };
    const result = connection.result ?? unavailable;
    const status = !connection.media && result.state === 'ok' ? unavailable : result;
    if (!canReadServerFiles(status, true)) return { ...base, status };
    const files = await findServerFiles({ listLibrary, listVmixMedia }, settings, items);
    if (!vmixCurrent()) return base;
    return {
      ...base, status,
      media: files.unavailable ? null : [...files.found.values()].map(file => file.name),
      listProblem: files.unavailable?.detail,
    };
  }
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
    relevance.slot ? readState(settings, settings.channel).then(
      (r) => (r.reply ? (r.reply.slots.filter((s) => s.layer === settings.layer)[0] ?? null) : undefined),
      () => undefined,
    ) : Promise.resolve(undefined),
    names('media'),
    names('template'),
  ]);
  return { ...base, status, slot, media, templates, ...(listProblem ? { listProblem } : {}) };
}
