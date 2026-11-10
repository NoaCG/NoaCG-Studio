import {
  actVmix, bridgePaired, namedOutputUrl, readVmixOverlays, testVmix,
  type PlayoutSettings, type VmixConnection,
} from './playoutLink';
import type { VmixInfo, VmixOverlayState } from './playoutProtocol';

export function vmixOverlay(settings: PlayoutSettings, count: number): number {
  const selected = settings.vmix?.overlay;
  return selected !== undefined && selected <= count ? selected : count;
}

export function vmixConnectionLine(info: VmixInfo): string {
  const { version, edition, overlays } = info;
  return `vMix ${version}${edition ? `, ${edition}` : ''}, ${overlays} overlay channel${overlays === 1 ? '' : 's'}, on this computer`;
}

export interface VmixOutputReading {
  connection: VmixConnection;
  configuredOverlay?: number;
  overlay?: VmixOverlayState;
  detail?: string;
  loadProblem?: string;
}

/** Scope the XML to this production's address. A missing or failed reading stays unknown. */
export async function readVmixOutput(settings: PlayoutSettings, outputUrl: string | null): Promise<VmixOutputReading> {
  const connection = await testVmix(settings);
  if (!connection.keyed || !connection.info || !outputUrl) return { connection };
  const channel = vmixOverlay(settings, connection.info.overlays);
  const { result, overlays, loadProblem } = await readVmixOverlays(settings, outputUrl);
  const configured = overlays?.find(row => row.overlay === channel);
  const owned = configured?.ownsOutput ? configured : overlays?.find(row => row.ownsOutput);
  return {
    connection,
    configuredOverlay: channel,
    overlay: owned ?? configured,
    loadProblem,
    ...(result.state !== 'ok' ? { detail: result.detail } : {}),
  };
}

export function observeVmixOutput(
  read: () => Promise<VmixOutputReading>, report: (reading: VmixOutputReading) => void,
): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout>;
  const tick = async () => {
    const reading = await read();
    if (!active) return;
    report(reading);
    timer = setTimeout(() => void tick(), 3000);
  };
  void tick();
  return () => {
    active = false;
    clearTimeout(timer);
  };
}

export interface VmixOutputChoice {
  settings: PlayoutSettings;
  url: string;
  title: string;
}

export interface VmixReplace {
  choice: VmixOutputChoice;
  overlay: number;
  input: NonNullable<VmixOverlayState['input']>;
}

const sameChoice = (a: VmixOutputChoice, b: VmixOutputChoice | null): b is VmixOutputChoice =>
  !!b && a.url === b.url && a.settings.agentUrl === b.settings.agentUrl &&
  a.settings.agentToken === b.settings.agentToken && a.settings.vmix?.overlay === b.settings.vmix?.overlay;

/** Both the panel and first Publish use the same check, and the confirmed key is sent to the Bridge. */
export async function changeVmixOutput(
  verb: 'take' | 'out',
  current: () => VmixOutputChoice | null,
  confirmed?: VmixReplace,
): Promise<{ message?: string; replace?: VmixReplace }> {
  const choice = current();
  if (!choice) return {};
  if (confirmed && !sameChoice(confirmed.choice, choice)) return { message: 'The vMix output setup changed. Check it and press Load again.' };
  if (!bridgePaired(choice.settings)) return { message: 'Pair NoaCG Bridge to use vMix.' };
  const { connection, configuredOverlay, overlay, detail, loadProblem } = await readVmixOutput(choice.settings, choice.url);
  if (!sameChoice(choice, current())) return {};
  if (connection.result?.state !== undefined && connection.result.state !== 'ok') return { message: connection.result.detail };
  if (!connection.keyed) return { message: 'Update NoaCG Bridge to load or unload an output in vMix.' };
  if (!overlay) return { message: detail ?? 'The vMix overlay could not be read. Check vMix and try again.' };
  if (verb === 'take' && loadProblem) return { message: loadProblem };
  if (verb === 'take' && overlay.overlay !== configuredOverlay) {
    return { message: `Unload from Overlay ${overlay.overlay} before loading on Overlay ${configuredOverlay}.` };
  }

  const input = overlay.input;
  if (confirmed && (confirmed.overlay !== overlay.overlay || confirmed.input.key !== input?.key)) {
    return { message: 'The input on the vMix overlay changed. Check it and press Load again.' };
  }
  if (verb === 'take' && overlay.ownsOutput) return {};
  if (verb === 'take' && input && !confirmed) return { replace: { choice, overlay: overlay.overlay, input } };
  const result = await actVmix(choice.settings, () => {
    const latest = current();
    if (!sameChoice(choice, latest)) return null;
    const slot = { adapter: 'vmix', overlay: overlay.overlay } as const;
    const item = { kind: 'url', name: namedOutputUrl(latest.url, `vMix Overlay ${overlay.overlay}`), label: latest.title } as const;
    return verb === 'take'
      ? { verb, slot, item, expectedOverlayInput: input?.key ?? null }
      : { verb, slot, item };
  });
  return { message: result?.state === 'ok' ? result.warning : result?.detail };
}
