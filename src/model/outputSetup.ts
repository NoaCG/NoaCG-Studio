// Presentation intent only. Nothing here sends a command or changes physical routing.
export type OutputProfile = 'obs' | 'vmix' | 'spx' | 'browser' | 'casparcg';
export interface OutputDestination { id: string; profile: OutputProfile }
export interface ProductionOutputSetup { v: 1; destinations: OutputDestination[] }
export type RundownColors = Record<string, string>;
export const OUTPUT_PROFILES: readonly { id: OutputProfile; label: string }[] = [
  { id: 'obs', label: 'OBS' }, { id: 'vmix', label: 'vMix' },
  { id: 'spx', label: 'SPX' }, { id: 'browser', label: 'Browser/HTML' },
  { id: 'casparcg', label: 'CasparCG' },
];
export const OUTPUT_DEFAULT_KEY = 'noacg_output_default_v1';
export function outputProfileLabel(profile: OutputProfile): string {
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
  return { v: 1, destinations };
}
export function outputChoice(browser: Exclude<OutputProfile, 'casparcg'> | null, caspar: boolean): ProductionOutputSetup {
  return { v: 1, destinations: [
    ...(browser ? [{ id: 'browser', profile: browser }] : []),
    ...(caspar ? [{ id: 'casparcg', profile: 'casparcg' as const }] : []),
  ] };
}
export function outputSetupLabel(value: unknown): string {
  const s = readOutputSetup(value);
  return s?.destinations.length ? s.destinations.map(d => outputProfileLabel(d.profile)).join(' + ') : 'Choose output';
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
