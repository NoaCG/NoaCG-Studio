// Presentation intent only. Nothing here sends a command or changes physical routing.
export type OutputProfile = 'obs' | 'vmix' | 'spx' | 'browser' | 'casparcg';
export interface OutputDestination { id: string; profile: OutputProfile }
/** The operator's playout choice. A vMix Browser destination is still a manual browser source. */
export interface ProductionOutputSetup { v: 1; destinations: OutputDestination[]; caspar?: boolean; vmix?: true }
export type PlayoutSystem = 'casparcg' | 'vmix' | null;
export type RundownColors = Record<string, string>;
export const OUTPUT_PROFILES: readonly { id: OutputProfile; label: string }[] = [
  { id: 'obs', label: 'OBS' }, { id: 'vmix', label: 'vMix' },
  { id: 'spx', label: 'SPX' }, { id: 'browser', label: 'Browser/HTML' },
  { id: 'casparcg', label: 'CasparCG' },
];
export const OUTPUT_DEFAULT_KEY = 'noacg_output_default_v1';
export function outputProfileLabel(profile: OutputProfile): string {
  if (profile === 'browser' || profile === 'obs' || profile === 'vmix') return 'Browser source';
  if (profile === 'casparcg') return 'CasparCG through Bridge';
  return OUTPUT_PROFILES.find(p => p.id === profile)?.label ?? profile;
}
export function readOutputSetup(value: unknown): ProductionOutputSetup | null {
  if (!value || typeof value !== 'object') return null;
  const s = value as Partial<ProductionOutputSetup>;
  if (s.v !== 1 || !Array.isArray(s.destinations) || s.destinations.length > 2) return null;
  const seen = new Set<string>();
  let browsers = 0;
  const destinations: OutputDestination[] = [];
  for (const d of s.destinations) {
    if (!d || typeof d.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(d.id) || seen.has(d.id) || !OUTPUT_PROFILES.some(p => p.id === d.profile)) return null;
    if (d.profile !== 'casparcg' && ++browsers > 1) return null;
    if (destinations.some(p => p.profile === d.profile)) return null;
    seen.add(d.id);
    destinations.push({ id: d.id, profile: d.profile });
  }
  if (s.vmix === true) {
    return { v: 1, destinations: destinations.filter(d => d.profile !== 'casparcg'), caspar: false, vmix: true };
  }
  return typeof s.caspar === 'boolean' ? { v: 1, destinations, caspar: s.caspar } : { v: 1, destinations };
}

interface PlayoutSystemInput {
  setup: unknown;
  serverCues: boolean;
  legacyActivity: boolean;
  accountDefault: boolean | null;
  vmixCues?: boolean;
}

/**
 * The operator's switch wins. Until it has been set, keep the existing CasparCG inference.
 * A production that only resolves to vMix from its cues has not opted into automatic Load.
 */
export function playoutSystem(input: PlayoutSystemInput): PlayoutSystem {
  const setup = readOutputSetup(input.setup);
  if (setup?.vmix) return 'vmix';
  if (setup?.caspar !== undefined) return setup.caspar ? 'casparcg' : null;
  if (setup?.destinations.some(d => d.profile === 'casparcg') || input.serverCues) return 'casparcg';
  const casparDefault = input.setup ? !setup?.destinations.length && input.accountDefault : input.legacyActivity;
  if (casparDefault) return 'casparcg';
  return input.vmixCues ? 'vmix' : null;
}

export function casparSwitch(input: PlayoutSystemInput): boolean {
  return playoutSystem(input) === 'casparcg';
}

/** The browser output stays, including a legacy OBS or vMix profile. Nothing airs. */
export function withPlayoutSystem(current: unknown, system: PlayoutSystem): ProductionOutputSetup {
  const setup = readOutputSetup(current);
  const browser = setup?.destinations.find(d => d.profile !== 'casparcg') ?? { id: 'browser', profile: 'browser' as const };
  const caspar = setup?.destinations.find(d => d.profile === 'casparcg') ?? { id: 'casparcg', profile: 'casparcg' as const };
  const on = system === 'casparcg';
  if (system === 'vmix') return { v: 1, destinations: [browser], caspar: false, vmix: true };
  return { v: 1, destinations: on ? [browser, caspar] : [browser], caspar: on };
}

export function withCasparSwitch(current: unknown, on: boolean): ProductionOutputSetup {
  if (on) return withPlayoutSystem(current, 'casparcg');
  return withPlayoutSystem(current, readOutputSetup(current)?.vmix ? 'vmix' : null);
}

export function outputChoice(browser: Exclude<OutputProfile, 'casparcg'> | null, caspar: boolean): ProductionOutputSetup {
  return { v: 1, destinations: [
    ...(browser ? [{ id: 'browser', profile: browser }] : []),
    ...(caspar ? [{ id: 'casparcg', profile: 'casparcg' as const }] : []),
  ] };
}
export function wantsAccountOutputDefault(current: unknown): boolean {
  const setup = readOutputSetup(current);
  return !!current && !setup?.vmix && !setup?.destinations.length;
}

/** First Publish settles the outputs of new productions. Keep a cue-inferred vMix system
 *  inferred while giving it a Browser destination so the account default stops applying. */
export function outputSetupForFirstPublish(current: unknown, system: PlayoutSystem): ProductionOutputSetup | null {
  if (!wantsAccountOutputDefault(current)) return null;
  return system === 'vmix' ? outputChoice('browser', false) : withPlayoutSystem(current, system);
}

export function outputSetupLabel(value: unknown): string {
  const s = readOutputSetup(value);
  return s?.destinations.length ? s.destinations.map(d => outputProfileLabel(d.profile)).join(' + ') : 'Choose output';
}
/** The CasparCG destination's id, which tags the URL the CasparCG renderer is loaded with. */
export function casparDestinationId(value: unknown): string | undefined {
  return readOutputSetup(value)?.destinations.find(d => d.profile === 'casparcg')?.id;
}
/** The account's "Use CasparCG in new productions", from the setup it is stored as; null for none. */
export function accountCasparDefault(setup: ProductionOutputSetup | null | undefined): boolean | null {
  return setup ? hasCasparOutput(setup) : null;
}
export function hasCasparOutput(value: unknown): boolean {
  return readOutputSetup(value)?.destinations.some(d => d.profile === 'casparcg') ?? false;
}
export function destinationUrl(url: string | null, id?: string): string | null {
  if (!url || !id) return url;
  const u = new URL(url);
  u.searchParams.set('destination', id);
  return u.toString();
}
export function readDestinationId(search: string): string | undefined {
  const id = new URLSearchParams(search).get('destination');
  return id && /^[a-zA-Z0-9_-]{1,80}$/.test(id) ? id : undefined;
}
export function accentColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value.toLowerCase() : undefined;
}
const CHANNEL_COLORS = ['#7dd3fc', '#c4b5fd', '#5eead4', '#a5b4fc'];
export function routeColor(colors: RundownColors | undefined, channel?: number): string {
  const key = channel === undefined ? 'output' : `channel:${channel}`;
  return accentColor(colors?.[key]) ?? CHANNEL_COLORS[channel === undefined ? 0 : (Math.max(1, channel) - 1) % CHANNEL_COLORS.length];
}
