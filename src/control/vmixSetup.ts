import {
  actVmix, bridgePaired, namedOutputUrl, readVmixOverlays, testVmix,
  type PlayoutSettings, type VmixConnection,
} from './playoutLink';
import { VMIX_BROWSER_LOAD_PROBLEM, VMIX_INPUT_KEY, type VmixInfo, type VmixOverlayState } from './playoutProtocol';

export function vmixOverlay(settings: PlayoutSettings, count: number): number {
  const selected = settings.vmix?.overlay;
  return selected !== undefined && Number.isInteger(selected) && selected >= 1 && selected <= count ? selected : count;
}

export function vmixConnectionLine(info: VmixInfo): string {
  const { version, edition, overlays } = info;
  return `vMix ${version}${edition ? `, ${edition}` : ''}, ${overlays} overlay channel${overlays === 1 ? '' : 's'}, on this computer`;
}

export interface VmixOutputReading {
  connection: VmixConnection;
  overlay?: VmixOverlayState;
  detail?: string;
  loadProblem?: string;
}

/** Scope the XML to this production's address. A missing or failed reading stays unknown. */
export async function readVmixOutput(settings: PlayoutSettings, outputUrl: string | null, atOverlay?: number): Promise<VmixOutputReading> {
  const connection = await testVmix(settings);
  if (!connection.keyed || !connection.info || !outputUrl) return { connection };
  const { result, info, overlays, loadProblem } = await readVmixOverlays(settings, outputUrl);
  if (!info) return { connection, detail: result.detail };
  const channel = atOverlay ?? vmixOverlay(settings, info.overlays);
  const selected = overlays?.find(row => row.overlay === channel);
  const matched = atOverlay === undefined && !selected?.ownsOutput ? overlays?.find(row => row.ownsOutput) : undefined;
  return { connection: { ...connection, info }, overlay: matched ?? selected, loadProblem };
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

interface VmixOutputIdentity {
  settings: Pick<PlayoutSettings, 'agentUrl' | 'agentToken'>;
  url: string | null;
}

interface VmixObservedOutput extends VmixOutputIdentity {
  url: string;
  overlay: number;
}

export type VmixManualOutputCommand =
  | { verb: 'take'; observed: VmixObservedOutput; confirmed?: VmixReplace }
  | { verb: 'out'; observed: VmixObservedOutput; inputKey: string };

export type VmixOutputCommand = VmixManualOutputCommand | { verb: 'take'; observed?: never; confirmed?: never };

const sameOutput = (a: VmixOutputIdentity, b: VmixOutputIdentity): boolean =>
  a.url === b.url && a.settings.agentUrl === b.settings.agentUrl && a.settings.agentToken === b.settings.agentToken;

type VmixOutputSetup = { settings: PlayoutSettings; url: string | null };

export const sameVmixOutputSetup = (a: VmixOutputSetup, b: VmixOutputSetup): boolean =>
  sameOutput(a, b) && a.settings.vmix?.overlay === b.settings.vmix?.overlay;

const sameChoice = (a: VmixOutputChoice, b: VmixOutputChoice | null): b is VmixOutputChoice =>
  !!b && sameVmixOutputSetup(a, b);

/** Both the panel and first Publish use the same check, and the confirmed key is sent to the Bridge. */
export async function changeVmixOutput(
  command: VmixOutputCommand,
  current: () => VmixOutputChoice | null,
): Promise<{ message?: string; replace?: VmixReplace; completed?: true }> {
  const { verb, observed } = command;
  const confirmed = verb === 'take' ? command.confirmed : undefined;
  const choice = current();
  if (observed && (!choice || !sameOutput(observed, choice))) {
    const button = verb === 'take' ? 'Load' : 'Unload';
    return { message: `The vMix output setup changed. Check the current row and press ${button} again.` };
  }
  if (!choice) return {};
  if (confirmed && !sameChoice(confirmed.choice, choice)) return { message: 'The vMix output setup changed. Check it and press Load again.' };
  if (!bridgePaired(choice.settings)) return { message: 'Pair NoaCG Bridge to use vMix.' };
  const { connection, overlay, detail, loadProblem } = await readVmixOutput(
    choice.settings, choice.url, verb === 'out' ? observed.overlay : undefined,
  );
  if (!sameChoice(choice, current())) return {};
  if (connection.result?.state !== undefined && connection.result.state !== 'ok') return { message: connection.result.detail };
  if (!connection.keyed) return { message: 'Update NoaCG Bridge to load or unload an output in vMix.' };
  if (!overlay) return { message: loadProblem ?? detail ?? 'The vMix overlay could not be read. Check vMix and try again.' };
  if (verb === 'take') {
    if (observed && observed.overlay !== overlay.overlay) {
      return { message: 'The vMix overlay changed. Check it and press Load again.' };
    }
    if (loadProblem) return { message: loadProblem };
    if (overlay.ownsOutput) return { message: VMIX_BROWSER_LOAD_PROBLEM };
  }

  const input = overlay.input;
  if (verb === 'out' && (!overlay.ownsOutput || input?.key !== command.inputKey)) {
    return { message: `The Browser on Overlay ${observed.overlay} changed. Check vMix before trying Unload again.` };
  }
  if (confirmed && (confirmed.overlay !== overlay.overlay || !VMIX_INPUT_KEY.test(confirmed.input.key) ||
    confirmed.input.key.toLowerCase() !== input?.key)) {
    return { message: 'The input on the vMix overlay changed. Check it and press Load again.' };
  }
  if (verb === 'take' && input && !confirmed) return { replace: { choice, overlay: overlay.overlay, input } };
  const result = await actVmix(choice.settings, () => {
    const latest = current();
    if (!sameChoice(choice, latest)) return null;
    const slot = { adapter: 'vmix', overlay: overlay.overlay } as const;
    const item = { kind: 'url', name: namedOutputUrl(latest.url, `vMix Overlay ${overlay.overlay}`), label: latest.title } as const;
    return verb === 'take'
      ? { verb, slot, item, expectedOverlayInput: input?.key ?? null }
      : { verb, slot, item, expectedOverlayInput: command.inputKey };
  });
  if (!result) return {};
  const latest = current();
  const sameProduction = latest?.url === choice.url;
  if (!sameChoice(choice, latest)) {
    if (sameProduction && (result.browserAdded || (result.unknownAction && !sameOutput(choice, latest)))) {
      const address = choice.settings.agentUrl;
      const host = URL.canParse(address) ? new URL(address).host : '';
      const bridge = host ? `the Bridge at ${host}` : 'the original Bridge';
      const button = verb === 'take' ? 'Load' : 'Unload';
      return { message: `${button} targeted Overlay ${overlay.overlay} on ${bridge}. ${result.detail}` };
    }
    return result.unknownAction ? { message: `The action targeted Overlay ${overlay.overlay}. ${result.detail}` } : {};
  }
  return result.state === 'ok' ? { completed: true, message: result.warning } : { message: result.detail };
}
