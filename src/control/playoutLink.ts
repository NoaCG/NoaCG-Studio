// NoaCG Bridge, browser half - docs/BRIDGE.md.
//
// A page cannot open a raw TCP socket, so it cannot speak AMCP; the socket lives in NoaCG Bridge
// (the NoaCG Bridge download; `noacg bridge` in the CLI package is the same program) on the
// operator's own machine, and this file talks to it over loopback HTTP in the playout
// protocol (playoutProtocol.ts). Everything here is one studio-wide setting plus one honest
// answer about which hop is broken - the surfaces that use it never say "failed".
//
// THE HOPS, and why they are told apart (measured 2026-08-24, Chromium 149):
//   permission  Local Network Access gates a PUBLIC page reaching 127.0.0.1 - Chrome and Edge,
//               and Firefox since 153 ("wants to access other apps and services on this
//               device"). It is a user permission, not the old Access-Control-Allow-Private-
//               Network header, which no longer helps at all. While it is unanswered the request HANGS rather
//               than failing, which is why every call here carries a timeout and why a timeout
//               means "answer the prompt", never "unreachable".
//   bridge      No Bridge on that address, or one started for another deployment.
//   outdated    A Bridge too old to speak this protocol.
//   token       A Bridge, refusing this token.
//   server      A Bridge, and the playout server behind it did not answer or refused.
//   scanner     The server answered, but its media scanner is not running, so it cannot list.
//
// NoaCG OWNS THE CONFIGURATION: the Bridge address and token and the playout server live here,
// device-level, and the Bridge is named its target on every call. What the Bridge keeps is its own
// token and, since 0.7.0, the servers this page CONNECTED to (`connectServer`), which it only ever
// reads back (`rememberedServers`): a browser that forgets its storage gets the server back. Since
// 0.8.0 it also keeps the studio's setup for each of those servers (`syncStudio`, ./studioSetup.ts),
// so another browser or account paired with it opens with the same channels; the copy here is what
// every surface reads, and the only one with an older Bridge.

import { loadShows, productionPlayoutSystem, MAX_PLAYOUT_CHANNEL, MIN_PLAYOUT_CHANNEL, PLAYOUT_CLIP_LAYER, type ShowFolder } from '../model/shows';
import { DEFAULT_STUDIO, defaultChannelName, sameServer, sameStudio, studioFields, studioOf, studioStep } from './studioSetup';
import {
  MAX_VMIX_OVERLAYS,
  PLAYOUT_V,
  VMIX_INPUT_KEY,
  VMIX_OUTPUT_TOKEN_PREFIX,
  VMIX_VERSION,
  isRememberedServerAddress,
  readStudio,
  vmixOverlayCount,
  type AdapterId,
  type AgentError,
  type BridgeFeature,
  type ItemKind,
  type CasparSlot,
  type CasparTarget,
  type ListItem,
  type PlayoutAction,
  type RememberedServer,
  type ServerChannel,
  type SlotState,
  type StudioSetup,
  type StateReply,
  type TargetCapability,
  type VmixInfo,
  type VmixInput,
  type VmixOverlayState,
  type VmixStateReply,
} from './playoutProtocol';

const STORE_KEY = 'spx-gfx-caspar';
const STORE_V = 1;

/** The oldest Bridge this page can drive. `/health` below this is "update NoaCG Bridge". */
export const MIN_PLAYOUT_V = PLAYOUT_V;

/** How long to wait on the Bridge. Generous on purpose: with the Local Network Access prompt
 *  up, the browser holds the request open until the person answers it. */
const BRIDGE_TIMEOUT_MS = 6000;
/** A cue travels one hop further, to a machine that may be asleep. */
const ACT_TIMEOUT_MS = 9000;
/** A list waits past the server's own scanner timeout (about 5 s on 2.5.0) so a missing scanner
 *  is reported as itself rather than as silence. */
const LIST_TIMEOUT_MS = 16000;
/** A state reading: INFO answers in about 2 ms on the real 2.5.0 (measured 2026-09-28), so this is
 *  generous, and short enough that a stalled Bridge shows as `estimated` within the clock's 3 s.
 *  The Bridge gives up on the server sooner (STATE_TIMEOUT_MS in cli/src/playout/adapters/casparcg.ts),
 *  so the next reading never starts while the last one still holds a connection to the server. */
const STATE_TIMEOUT_MS = 1500;

export interface PlayoutSettings {
  /** Where NoaCG Bridge is listening. Loopback, on the operator's own machine. The stored key
   *  keeps its first name so a browser paired before the rename stays paired. */
  agentUrl: string;
  /** The Bridge's token. Held in this browser only, like every other preference. */
  agentToken: string;
  /** The playout server itself - may be any machine on the studio LAN. */
  host: string;
  amcpPort: number;
  /** The NOACG OUTPUT's channel (Settings: "NoaCG output"): where the production's output URL goes
   *  on air, and where a server template, and any item saved without a channel, plays unless its
   *  cue says otherwise. The stored name is from when this was called the graphics channel. */
  channel: number;
  /** The output URL's layer on that channel: the one slot no server item may take. */
  layer: number;
  /** The channels this studio uses, each with the operator's word for it (`Channel 1` until
   *  somebody renames it `Graphics`, `Inserts` or whatever it carries). A cue picks its channel from this list rather than typing a number. ADDITIVE:
   *  a record saved before it existed reads as one row, the graphics channel. Always holds the
   *  graphics channel after load. */
  channels: PlayoutChannel[];
  /** Where a NEW server video, still or audio file starts (Settings: "New media"). The output's
   *  channel until the studio names another one. */
  clipChannel: number;
  /** The server whose setup (the four fields above) was changed here and not yet confirmed by NoaCG
   *  Bridge: it was not running, or not yet the one with the `studio` feature. The next sync gives
   *  the change to the Bridge rather than taking the Bridge's older copy (D17). */
  studioPending?: { host: string; port: number };
  /** The device's vMix output overlay. Absent uses the highest channel this vMix offers. */
  vmix?: { overlay?: number };
}

/** One CasparCG channel as the studio names it. */
export interface PlayoutChannel {
  channel: number;
  name: string;
}

export const PLAYOUT_DEFAULTS: PlayoutSettings = {
  agentUrl: 'http://127.0.0.1:8899',
  agentToken: '',
  host: '127.0.0.1',
  amcpPort: 5250,
  // One channel, the output on 1-20, new media on 1 (./studioSetup.ts says why each).
  ...studioFields(DEFAULT_STUDIO),
};

// `defaultChannelName` lives in ./studioSetup.ts, beside the default setup that names its channel
// with it; it is re-exported here for the callers of this module.
export { defaultChannelName };

/** A channel number as stored, or null when it is not one. */
function channelNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n >= MIN_PLAYOUT_CHANNEL && n <= MAX_PLAYOUT_CHANNEL ? n : null;
}

/**
 * The settings with the channel list made whole: every row a valid number and a string name,
 * the graphics channel always among them (a record from before the list existed becomes that
 * one row), and the clip default pointing at a named channel. A duplicate row is KEPT, because
 * the Settings table is edited keystroke by keystroke and a half-typed "2" must not delete the
 * row it collides with; the table flags it instead.
 */
function normalized(s: PlayoutSettings): PlayoutSettings {
  const channel = channelNumber(s.channel) ?? PLAYOUT_DEFAULTS.channel;
  const rows = (Array.isArray(s.channels) ? s.channels : [])
    .map((row) => ({ channel: channelNumber(row?.channel), name: typeof row?.name === 'string' ? row.name : '' }))
    .filter((row): row is PlayoutChannel => row.channel !== null);
  const channels = rows.some((row) => row.channel === channel) ? rows : [{ channel, name: defaultChannelName(channel) }, ...rows];
  const clip = channelNumber(s.clipChannel);
  const clipChannel = clip !== null && channels.some((row) => row.channel === clip) ? clip : channel;
  const overlay = s.vmix?.overlay;
  const vmix = typeof overlay === 'number' && Number.isInteger(overlay) && overlay >= 1 && overlay <= MAX_VMIX_OVERLAYS
    ? { overlay }
    : undefined;
  return { ...s, channel, channels, clipChannel, ...(s.vmix !== undefined ? { vmix } : {}) };
}

interface StoredSettings extends Partial<PlayoutSettings> {
  v?: number;
}

/**
 * App-wide and persisted, NOT per production: a studio has one playout server, and retyping it
 * per show is exactly the friction this removes. Device-level like every other entry in
 * model/prefs.ts - it names hardware on this desk, and the token is a local credential that
 * has no business syncing to other machines.
 */
export function loadPlayoutSettings(): PlayoutSettings {
  try {
    const { v, ...raw } = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as StoredSettings;
    // An unknown FUTURE version degrades honestly rather than being half-read: fall back to
    // the defaults and leave the stored row alone, so an older build never eats newer data.
    if (typeof v === 'number' && v > STORE_V) return { ...PLAYOUT_DEFAULTS };
    // A v1 record from before the channel list has none: `normalized` builds it from the one
    // channel the record does carry, so an existing studio reads exactly as it did.
    return normalized({ ...PLAYOUT_DEFAULTS, ...raw, ...(raw.channels ? {} : { channels: [] }) });
  } catch {
    return { ...PLAYOUT_DEFAULTS };
  }
}

/** A change made here. A change to the studio setup is marked for NoaCG Bridge (`studioPending`), so
 *  the next `syncStudio` gives it to the Bridge instead of taking the Bridge's older copy. */
export function savePlayoutSettings(patch: Partial<PlayoutSettings>): void {
  const was = loadPlayoutSettings();
  const next = { ...was, ...patch };
  const studioChanged = !sameStudio(studioOf(was), studioOf(normalized(next)));
  writeSettings(studioChanged ? { ...next, studioPending: { host: next.host.trim(), port: next.amcpPort } } : next);
}

function writeSettings(settings: PlayoutSettings): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...settings, v: STORE_V }));
  } catch {
    // Same reasoning as model/prefs.ts: a preference is a convenience, and throwing from a
    // render-adjacent path costs the whole app.
  }
}

/** Enough filled in to be worth trying at all. */
export function playoutConfigured(s: PlayoutSettings): boolean {
  return Boolean(s.agentUrl.trim() && s.agentToken.trim() && s.host.trim());
}

/** The settings as the protocol names them: which server, and where on it. */
export function targetOf(s: PlayoutSettings): CasparTarget {
  return { adapter: 'casparcg', host: s.host.trim(), port: s.amcpPort };
}

export function slotOf(s: PlayoutSettings, layer = s.layer, channel = s.channel): CasparSlot {
  return { adapter: 'casparcg', channel, layer };
}

/** The channel a new server item is cued on: media to the New media channel, a template to the
 *  NoaCG output's channel, the way a CasparCG client's rundown defaults its own items. */
export function defaultChannelFor(s: PlayoutSettings, kind: ItemKind): number {
  return kind === 'media' ? s.clipChannel : s.channel;
}

/** The channel an item plays on: its own when it carries one, else the graphics channel - which
 *  is how every item saved before cues had a channel keeps playing where it always did. */
export function channelOf(s: PlayoutSettings, item: { channel?: number }): number {
  return channelNumber(item.channel) ?? s.channel;
}

/** Where a Play-through folder plays its clips (docs/CLIP_PLAYBACK_PLAN.md §7; owner, 2026-09-28): the
 *  folder's own slot, and for a part it leaves unset the clip default - layer 10 on the studio's
 *  clip channel - never its first clip's own slot. */
export function folderSlot(s: PlayoutSettings, folder: Pick<ShowFolder, 'slot'>): CasparSlot {
  return slotOf(s, folder.slot?.layer ?? PLAYOUT_CLIP_LAYER, channelNumber(folder.slot?.channel) ?? s.clipChannel);
}

/** Where an item plays, as the protocol names it. */
export function itemSlot(s: PlayoutSettings, item: { channel?: number; layer: number }): CasparSlot {
  return slotOf(s, item.layer, channelOf(s, item));
}

/** The studio's word for a channel (`Inserts`), or '' for one it has not named - a production
 *  made in another studio, or a row removed since. The first row wins on a duplicate number. */
export function channelName(s: PlayoutSettings, channel: number): string {
  return s.channels.find((row) => row.channel === channel)?.name.trim() ?? '';
}

/** `2 · Inserts` - a channel as the operator reads it, or the bare number when it has no name.
 *  A row still wearing its starting name reads `Channel 2`, not `2 · Channel 2`. */
export function channelLabel(s: PlayoutSettings, channel: number): string {
  const name = channelName(s, channel);
  if (name === defaultChannelName(channel)) return name;
  return name ? `${channel} · ${name}` : String(channel);
}

/** `channel 2 (Inserts)` - the same, as it reads inside a sentence. */
export function channelTitle(s: PlayoutSettings, channel: number): string {
  const name = channelName(s, channel);
  return name && name !== defaultChannelName(channel) ? `channel ${channel} (${name})` : `channel ${channel}`;
}

// `slotAddress` (`1-20`) lives in ./playoutSlots.ts with `compareSlots`, where rules that must run
// without a browser can import them; it is re-exported here for the callers of this module.
export { slotAddress, outputSlotRefusal } from './playoutSlots';

// ---------------------------------------------------------------------------------------------
// Local Network Access
// ---------------------------------------------------------------------------------------------

export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

/**
 * The permission's name, newest first. The Bridge is on LOOPBACK, and both Chrome (since it split
 * the gate in two) and Firefox (153+) call that half `loopback-network`; older Chromes know only
 * the single `local-network-access`. A name a browser does not know makes `query` throw, so each
 * is tried in turn.
 */
const PERMISSION_NAMES = ['loopback-network', 'local-network-access'] as const;

/** The browsers expose the gate as an ordinary permission, so a surface can say what stands in
 *  the way BEFORE making a call that would otherwise hang. A browser that knows none of the
 *  names answers 'unknown', which is the honest answer for it. */
export async function localNetworkPermission(): Promise<PermissionState> {
  const q = navigator.permissions as unknown as {
    query(d: { name: string }): Promise<{ state: PermissionState }>;
  } | undefined;
  for (const name of PERMISSION_NAMES) {
    try {
      const status = await q!.query({ name });
      return status.state;
    } catch {
      // Not a name this browser knows; try the next one.
    }
  }
  return 'unknown';
}

/** Firefox, by its user agent. Only used to word a sentence: Firefox names the prompt
 *  differently, and on a profile that forgets site settings it asks again per tab. */
export function isFirefox(userAgent = navigator.userAgent): boolean {
  return /\bFirefox\//.test(userAgent) && !/\bSeamonkey\//i.test(userAgent);
}

/** Safari, by its user agent: the one engine that refuses a secure page reaching loopback with
 *  no permission to grant. Every Chromium and Firefox UA also says "Safari", hence the rest. */
export function isSafari(userAgent = navigator.userAgent): boolean {
  return /\bSafari\//.test(userAgent) && !/\b(Chrome|Chromium|CriOS|Edg|EdgiOS|FxiOS|Firefox|OPR)\//.test(userAgent);
}

/**
 * A loopback or LAN hostname. Every branch is ANCHORED at both ends on purpose: a prefix match
 * would read `localhost.evil.example` and `10.0.0.1.evil.example` - both ordinary public names -
 * as local, and then quietly withhold the one diagnosis that would have explained the failure.
 */
function isPrivateHostname(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host === '::1') return true;
  return (
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)
  );
}

/**
 * Whether the permission can even be the problem here. Measured: a page already on a loopback
 * or LAN address reaches a loopback Bridge with nothing granted, so offering that diagnosis
 * there would be a lie. Only a PUBLIC origin (the hosted studio) is gated.
 */
export function localNetworkGateApplies(pageOrigin: string, bridgeUrl: string): boolean {
  try {
    const page = new URL(pageOrigin);
    const bridge = new URL(bridgeUrl);
    if (!isPrivateHostname(bridge.hostname)) return false; // the Bridge is not on a local address
    return !isPrivateHostname(page.hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Talking to the Bridge
// ---------------------------------------------------------------------------------------------

export type PlayoutState = 'ok' | 'config' | 'permission' | 'bridge' | 'outdated' | 'token' | 'server' | 'scanner';

export interface PlayoutResult {
  state: PlayoutState;
  /** One sentence naming the hop and what to do - never a bare "failed". */
  detail: string;
  /** The server's own version string, when it answered. */
  version?: string;
  /** The server's own status line, when there was one. */
  raw?: string;
  /** What the Bridge understands beyond the routes every v2 Bridge answers (`/health`). */
  features?: BridgeFeature[];
  /** What the target can do (`/status`). */
  capabilities?: TargetCapability[];
  /** An accepted action's slot generation, the Bridge session that counted it, and a take's
   *  instance (docs/CLIP_PLAYBACK_PLAN.md §6.7). */
  generation?: number;
  session?: string;
  instance?: string;
  /** An accepted action that did not all go through: one sentence (plan §9, `ActReply.warning`). */
  warning?: string;
}

/** Whether the page may ask this Bridge what the server holds: the Bridge reads state, and the
 *  server it was last asked about can be read (plan §6.9 - both have to say yes). */
export function stateReadable(status: PlayoutResult | null): boolean {
  return status?.state === 'ok' && !!status.features?.includes('state') && !!status.capabilities?.includes('state');
}

interface BridgeReply {
  ok?: boolean;
  servers?: RememberedServer[];
  /** A pairing code from `/pair-link`. */
  code?: string;
  v?: number;
  agent?: string;
  version?: string;
  adapters?: AdapterId[];
  features?: BridgeFeature[];
  capabilities?: TargetCapability[];
  error?: AgentError;
  items?: ListItem[];
  png?: string;
  raw?: string;
  token?: string;
  generation?: number;
  instance?: string;
  warning?: string;
  channel?: number;
  session?: string;
  link?: string;
  observedAt?: number;
  slots?: SlotState[];
  channels?: ServerChannel[];
  vmix?: VmixInfo;
  linked?: VmixStateReply['linked'];
  overlays?: VmixOverlayState[];
  loadProblem?: string;
}

// Known payload fields are route-specific. Unknown additive fields can travel on any route.
const bridgePayloadFields = [
  'agent', 'adapters', 'features', 'version', 'raw', 'capabilities', 'vmix', 'servers', 'session',
  'observedAt', 'overlays', 'loadProblem', 'linked', 'generation', 'warning', 'instance', 'items',
  'png', 'token', 'code', 'channel', 'link', 'slots', 'channels',
] as const satisfies readonly (keyof BridgeReply)[];

function hasOnlyPayloadFields(body: BridgeReply, allowed: readonly (keyof BridgeReply)[] = []): boolean {
  return bridgePayloadFields.every(field => body?.[field] === undefined || allowed.includes(field));
}

type Call = { http: number; body: BridgeReply } | { timedOut: true } | { networkError: string };

async function callBridge(
  bridgeUrl: string,
  path: string,
  body: Record<string, unknown> | null,
  timeoutMs: number,
  token?: string,
): Promise<Call> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // A POST carries a JSON content type (and usually an Authorization header), and either
    // alone forces a CORS preflight - which is the point. The Bridge refuses the preflight for
    // any origin it does not know, so a stray tab never gets to send the command at all. The
    // GET (/health) is deliberately plain and unauthenticated: it is the presence probe, and it
    // is answered for every origin so that "not running" is never said about a Bridge that is
    // running for another deployment.
    const headers: Record<string, string> = body ? { 'content-type': 'application/json' } : {};
    if (token) headers.authorization = `Bearer ${token}`;
    const response = await fetch(`${bridgeUrl.replace(/\/+$/, '')}${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // Never send cookies to a local process; the token is the whole credential.
      credentials: 'omit',
      cache: 'no-store',
    });
    let parsed: BridgeReply = {};
    try {
      parsed = (await response.json()) as BridgeReply;
    } catch {
      parsed = {};
    }
    return { http: response.status, body: parsed };
  } catch (e) {
    if (controller.signal.aborted) return { timedOut: true };
    return { networkError: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** What a page says when there is no Bridge - written once, used everywhere. */
function noBridge(reason: string): PlayoutResult {
  return { state: 'bridge', detail: `${reason} Start NoaCG Bridge on this machine (double-click the NoaCG Bridge file you downloaded; the Downloads page and Playout settings both link it), then try again.` };
}

/**
 * The presence half: is a Bridge on that address, is it new enough, and if not, is it the
 * permission prompt standing in the way? Null means "a current Bridge answered".
 */
export async function reachBridge(bridgeUrl: string): Promise<PlayoutResult | null> {
  return (await probeBridge(bridgeUrl)).unreachable;
}

/** `reachBridge`, and what a current Bridge said it understands. */
async function probeBridge(bridgeUrl: string): Promise<{
  unreachable: PlayoutResult | null; features: BridgeFeature[]; adapters?: AdapterId[]; vmixHealthValid?: boolean;
}> {
  const health = await callBridge(bridgeUrl, '/health', null, BRIDGE_TIMEOUT_MS);
  if ('http' in health) {
    const { ok, agent, v, adapters, features, version, error } = health.body ?? {};
    const succeeded = health.http === 200 && ok === true;
    if (agent === 'noacg-bridge' && typeof v === 'number' && v >= MIN_PLAYOUT_V) {
      const supported = succeeded && v === PLAYOUT_V && Array.isArray(adapters) && adapters.every(name => typeof name === 'string')
        ? adapters : undefined;
      const advertised = Array.isArray(features) ? features : [];
      const vmix = supported?.includes('vmix') === true;
      return {
        unreachable: null,
        features: advertised,
        vmixHealthValid: nonblank(version) && error === undefined &&
          hasOnlyPayloadFields(health.body, ['agent', 'version', 'adapters', 'features']) &&
          (features === undefined || (Array.isArray(features) && features.every(feature => typeof feature === 'string'))) &&
          (vmix || !advertised.includes('vmix-output-key')),
        adapters: supported,
      };
    }
    if (agent === 'noacg-bridge' || agent === 'noacg-caspar') {
      return {
        unreachable: {
          state: 'outdated',
          detail: `The NoaCG Bridge on ${bridgeUrl} is too old for this page${health.body.version ? ` (version ${health.body.version})` : ''}. Download the current NoaCG Bridge from the Downloads page, start it, then try again.`,
        },
        features: [],
        adapters: succeeded && error === undefined && agent === 'noacg-caspar' && v === 1 ? [] : undefined,
      };
    }
    return { unreachable: { state: 'bridge', detail: `Something is listening on ${bridgeUrl}, but it is not NoaCG Bridge.` }, features: [] };
  }
  return { unreachable: await unreachableBridge(bridgeUrl, health), features: [] };
}

/** Why no Bridge answered: the permission prompt, a browser that forbids it, or nothing there. */
async function unreachableBridge(bridgeUrl: string, health: Call): Promise<PlayoutResult> {
  const gated = localNetworkGateApplies(window.location.origin, bridgeUrl);
  const permission = gated ? await localNetworkPermission() : 'granted';
  // Three different situations, and only one of them has a prompt to answer. Telling a Safari
  // user to look for a permission bubble that browser never shows would send them hunting for
  // a control that does not exist - and telling a Firefox user without the gate (before 153)
  // that the browser refuses would hide the real answer, that the Bridge is not running.
  if (gated && (permission === 'denied' || permission === 'prompt')) {
    return { state: 'permission', detail: permissionSentence(permission) };
  }
  if (gated && permission === 'unknown' && isSafari()) {
    return {
      state: 'permission',
      detail:
        'Safari does not let a secure page reach a program on your own computer, and offers no permission to grant. Use Chrome, Edge or Firefox here, or air the production from a terminal with `noacg caspar play`.',
    };
  }
  // Past the permission check, so a hang here is the Bridge's silence and not a waiting prompt.
  if ('timedOut' in health) return noBridge(`No answer from ${bridgeUrl}.`);
  return noBridge(`Could not reach ${bridgeUrl}.`);
}

/** What to do about the permission, in the words the browser's own prompt uses. */
function permissionSentence(permission: 'denied' | 'prompt'): string {
  const host = window.location.host;
  if (permission === 'denied') {
    return isFirefox()
      ? `Firefox is blocking ${host} from reaching NoaCG Bridge. Click the icon left of the address, clear the blocked "access other apps and services on this device" permission, then try again and choose Allow.`
      : `Your browser is blocking ${host} from reaching NoaCG Bridge. Allow "local network access" for ${host} in the site settings (the icon left of the address), then try again.`;
  }
  return isFirefox()
    ? `Firefox is asking whether ${host} may "access other apps and services on this device" - that is NoaCG Bridge. Answer Allow at the top of the window, then try again.`
    : 'Your browser is asking whether this site may reach your local network - that is NoaCG Bridge. Answer the prompt at the top of the window, then try again.';
}

type PlayoutReply = { result: PlayoutResult; body?: BridgeReply };

/** A Bridge reply, whichever hop it names, as one sentence with a state. */
function readReply(settings: PlayoutSettings, call: Call, at = `${settings.host}:${settings.amcpPort}`): PlayoutReply {
  if ('timedOut' in call) {
    return { result: { state: 'server', detail: `${at} did not answer in time.` } };
  }
  if ('networkError' in call) {
    return { result: { state: 'bridge', detail: `NoaCG Bridge stopped answering: ${call.networkError}` } };
  }
  const { http, body } = call;
  if (http === 401) return { result: { state: 'token', detail: 'NoaCG Bridge is running but rejected this token. Pair this browser again from the link the Bridge prints.' } };
  if (http === 403) {
    return {
      result: {
        state: 'bridge',
        detail: `NoaCG Bridge refused this site. Restart NoaCG Bridge with \`--origin ${window.location.origin}\`.`,
      },
    };
  }
  if (body.ok) {
    return {
      result: {
        state: 'ok',
        detail: 'Connected.',
        version: body.version,
        raw: body.raw,
        ...(Array.isArray(body.capabilities) ? { capabilities: body.capabilities } : {}),
        ...(typeof body.generation === 'number' ? { generation: body.generation } : {}),
        ...(typeof body.session === 'string' ? { session: body.session } : {}),
        ...(typeof body.instance === 'string' ? { instance: body.instance } : {}),
        ...(typeof body.warning === 'string' ? { warning: body.warning } : {}),
      },
      body,
    };
  }
  const error = body.error;
  if (!error) return { result: { state: 'bridge', detail: `NoaCG Bridge answered ${http} with no reason.` } };
  if (error.setup) return { result: { state: 'server', detail: error.detail }, body };
  if (error.code === 'no-media-scanner') return { result: { state: 'scanner', detail: error.detail, raw: error.raw }, body };
  if (error.hop === 'agent') {
    // A refusal by the Bridge itself of something this page composed is a defect on this side,
    // and the sentence says whose it is rather than blaming the server.
    return { result: { state: 'bridge', detail: `NoaCG Bridge refused the request: ${error.detail}` } };
  }
  // The target hop: two very different failures wear one state here, and the operator's next
  // move differs. A status line (`raw`) means the server answered and refused (wrong layer,
  // missing file), while none means nothing on that address answered at all. The Bridge wrote
  // the sentence for each, with the address in it.
  return { result: { state: 'server', detail: error.detail, raw: error.raw }, body };
}

type PlayoutRoute = '/status' | '/connect' | '/list' | '/thumbnail' | '/act';
type RequestFields = Record<string, unknown>;
type VerifyBeforeAct = () => boolean | Promise<boolean>;

/** One request through the Bridge with every hop told apart. A deferred action can
 *  return null if it is superseded before the first mutating request. */
function through(settings: PlayoutSettings, path: PlayoutRoute, extra: RequestFields, hop?: 'act' | 'list'): Promise<PlayoutReply>;
function through(settings: PlayoutSettings, path: '/act', extra: () => RequestFields | null, hop?: 'act', verify?: VerifyBeforeAct): Promise<PlayoutReply | null>;
async function through(
  settings: PlayoutSettings,
  path: PlayoutRoute,
  extra: RequestFields | (() => RequestFields | null),
  hop: 'act' | 'list' = 'act',
  verify?: VerifyBeforeAct,
): Promise<PlayoutReply | null> {
  if (!playoutConfigured(settings)) {
    return { result: { state: 'config', detail: 'Pair NoaCG Bridge and fill in the playout server first (Playout settings).' } };
  }
  const { unreachable, features } = await probeBridge(settings.agentUrl);
  if (verify && !unreachable) {
    const allowed = verify();
    if (!(typeof allowed === 'boolean' ? allowed : await allowed)) return null;
  }
  const fields = typeof extra === 'function' ? extra() : extra;
  if (fields === null) return null;
  if (unreachable) return { result: unreachable };
  const call = await callBridge(
    settings.agentUrl,
    // A Bridge from before 0.7.0 has no `/connect`: the same round trip without the memory.
    path === '/connect' && !features.includes('servers') ? '/status' : path,
    { target: targetOf(settings), ...fields },
    hop === 'list' ? LIST_TIMEOUT_MS : ACT_TIMEOUT_MS,
    settings.agentToken,
  );
  const reply = readReply(settings, call);
  return reply.result.state === 'ok' ? { ...reply, result: { ...reply.result, features } } : reply;
}

/**
 * ONE READING OF A CHANNEL (docs/CLIP_PLAYBACK_PLAN.md §6.7): what each of its layers holds, with
 * the Bridge's generation and instance on every slot. Straight to `/state`, without the `/health`
 * probe every other request makes first: this one runs twice a second, and the status poll already
 * says whether the Bridge is there.
 */
export async function readState(settings: PlayoutSettings, channel: number): Promise<{ result: PlayoutResult; reply?: StateReply }> {
  if (!playoutConfigured(settings)) {
    return { result: { state: 'config', detail: 'Pair NoaCG Bridge and fill in the playout server first (Playout settings).' } };
  }
  const call = await callBridge(settings.agentUrl, '/state', { target: targetOf(settings), channel }, STATE_TIMEOUT_MS, settings.agentToken);
  const { result, body } = readReply(settings, call);
  if (result.state !== 'ok' || !body || !Array.isArray(body.slots) || typeof body.session !== 'string') return { result };
  return {
    result,
    reply: { ok: true, channel: body.channel ?? channel, session: body.session, ...(typeof body.link === 'string' ? { link: body.link } : {}), observedAt: body.observedAt ?? 0, slots: body.slots },
  };
}

/**
 * THE CHANNELS THE SERVER HAS (a bare INFO, through a Bridge with the `channels` feature), so
 * Playout settings offers them instead of asking the studio to type them. Undefined whenever the
 * server cannot say - an older Bridge, no server, a reply it could not read - and the settings then
 * work exactly as before, from the channels the studio named. It touches no layer.
 */
export async function serverChannels(settings: PlayoutSettings): Promise<ServerChannel[] | undefined> {
  if (!playoutConfigured(settings)) return undefined;
  const asked = await askBridge(settings, 'channels', '/channels', { target: targetOf(settings) });
  const channels = 'body' in asked ? asked.body.channels : undefined;
  return Array.isArray(channels) && channels.length ? channels : undefined;
}

/** The Test connection button: a real AMCP VERSION, round-tripped. Remembers nothing. */
export async function testConnection(settings: PlayoutSettings): Promise<PlayoutResult> {
  return (await through(settings, '/status', {})).result;
}

/**
 * CONNECT (owner decisions 2026-09-30, docs/work-specs/bridge-casparcg-connect/spec.md): the same
 * VERSION round trip as Test connection, and on success NoaCG Bridge remembers the server as the
 * studio's last one. A Bridge from before 0.7.0 has nothing to remember it in, so there it is
 * exactly Test connection. Either way it sends VERSION and nothing else, which is what lets the
 * pairing page do it by itself: connecting never touches a layer.
 */
export async function connectServer(settings: PlayoutSettings): Promise<{ result: PlayoutResult; servers?: RememberedServer[]; studio?: StudioSync }> {
  const { result, body } = await through(settings, '/connect', {});
  if (result.state !== 'ok') return { result };
  // Connected: this is the studio's server now, in this browser too.
  savePlayoutSettings({ host: settings.host.trim(), amcpPort: settings.amcpPort });
  const servers = Array.isArray(body?.servers) ? body.servers : undefined;
  if (!servers || !result.features?.includes('studio')) return { result, servers };
  // And its setup: the Bridge's, or this browser's given to it (D17, D18).
  const studio = await oneAtATime(() => syncWith(loadPlayoutSettings(), servers));
  return { result, servers: studio.servers, studio };
}

/** The servers NoaCG Bridge remembers this page connecting to, most recent first. Empty when the
 *  Bridge remembers none, is older than 0.7.0 or does not answer: the caller then offers what this
 *  browser holds, which is all it ever had before. */
export async function rememberedServers(settings: PlayoutSettings): Promise<RememberedServer[]> {
  const memory = await bridgeMemory(settings);
  return memory && 'servers' in memory ? (memory.servers ?? []) : [];
}

/**
 * ONE OF THE BRIDGE'S OWN ROUTES, which name no server (`/servers`, `/studio`, `/pair-link`), or
 * `/channels`, a reading that touches no layer: what it answered, or why not in the words every other
 * route uses - a rejected token, a refused site, no
 * answer - never a bare "did not answer". `ownRoute` is the call alone, for a Bridge already probed.
 */
async function ownRoute(settings: PlayoutSettings, path: '/servers' | '/studio' | '/pair-link' | '/channels', body: Record<string, unknown>): Promise<{ body: BridgeReply } | { failed: PlayoutResult }> {
  // Past `/health`, so no permission prompt can be holding it open: a file read, answered at once.
  const call = await callBridge(settings.agentUrl, path, body, STATE_TIMEOUT_MS, settings.agentToken);
  if (!('http' in call)) {
    return { failed: { state: 'bridge', detail: 'timedOut' in call ? `NoaCG Bridge did not answer on ${settings.agentUrl}.` : `NoaCG Bridge stopped answering: ${call.networkError}` } };
  }
  const reply = readReply(settings, call);
  return reply.result.state === 'ok' && reply.body ? { body: reply.body } : { failed: reply.result };
}

/** `ownRoute`, asked only of a paired Bridge that lists `feature`; `missing` from an older one. */
async function askBridge(
  settings: PlayoutSettings,
  feature: BridgeFeature,
  path: '/servers' | '/pair-link' | '/channels',
  body: Record<string, unknown> = {},
): Promise<{ body: BridgeReply; features: BridgeFeature[] } | { failed: PlayoutResult } | { missing: true }> {
  const { unreachable, features } = await probeBridge(settings.agentUrl);
  if (unreachable) return { failed: unreachable };
  if (!features.includes(feature)) return { missing: true };
  const asked = await ownRoute(settings, path, body);
  return 'body' in asked ? { body: asked.body, features } : asked;
}

/** What a paired Bridge remembers (null when this browser is not paired): its servers (null from a
 *  Bridge older than 0.7.0, which keeps none) and whether it keeps setups, or why it did not say. */
async function bridgeMemory(
  settings: PlayoutSettings,
): Promise<{ failed: PlayoutResult } | { servers: RememberedServer[] | null; studio: boolean } | null> {
  if (!settings.agentUrl.trim() || !settings.agentToken.trim()) return null;
  const asked = await askBridge(settings, 'servers', '/servers');
  if ('missing' in asked) return { servers: null, studio: false };
  if ('failed' in asked) return asked;
  return { servers: Array.isArray(asked.body.servers) ? asked.body.servers : [], studio: asked.features.includes('studio') };
}

/**
 * Where the studio setup in use is kept, after a sync - one line under it in Playout settings:
 *   bridge       NoaCG Bridge keeps it for the server in use, for every browser paired with it
 *   ready        the Bridge keeps none for this server yet and this is the untouched default: the
 *                first change made here is kept there
 *   unconnected  the Bridge keeps setups, but has not connected to this server: Connect, and it does
 *   browser      this browser only: no Bridge paired, or one from before 0.8.0
 *   away         the Bridge does not answer, or refuses this browser (`reason`), so this is the
 *                browser's copy
 *   waiting      changed here while the Bridge did not answer; it gets the change when it does
 */
export type StudioKeeper = 'bridge' | 'ready' | 'unconnected' | 'browser' | 'away' | 'waiting';

export interface StudioSync {
  keeper: StudioKeeper;
  /** The browser's setup changed: it took the Bridge's. A surface showing it reads it again. */
  changed: boolean;
  /** The Bridge's list as it stands after the sync, when it answered. */
  servers?: RememberedServer[];
  /** Why the Bridge was not asked, when it did not answer or refused (`away` and `waiting`). */
  reason?: PlayoutState;
}

/**
 * BRING THE BROWSER'S SETUP AND NOACG BRIDGE'S TOGETHER for the server in use (D17, D18): a production
 * page and Playout settings call it when they open, Playout settings again after each change, and a
 * Connect does it itself. A change made here that the Bridge has not confirmed goes to the Bridge;
 * otherwise the Bridge's copy is the setup; a server it keeps none for takes this browser's, unless
 * that is the untouched default. With no Bridge, or one from before 0.8.0, the browser's copy stands.
 * It never contacts a server: `/servers` and `/studio` are the Bridge's own file.
 */
export function syncStudio(): Promise<StudioSync> {
  return oneAtATime(async () => {
    const settings = loadPlayoutSettings();
    const memory = await bridgeMemory(settings);
    if (!memory) return { keeper: 'browser', changed: false };
    if ('failed' in memory) return { keeper: pendingServer(settings) ? 'waiting' : 'away', changed: false, reason: memory.failed.state };
    if (!memory.studio || !memory.servers) return { keeper: 'browser', changed: false, servers: memory.servers ?? undefined };
    return syncWith(settings, memory.servers);
  });
}

/** ONE SYNC AT A TIME. A production page, Playout settings' timer, its close and a Connect can each
 *  start one, and two in flight could give the Bridge an older setup after a newer one. */
let syncing: Promise<unknown> = Promise.resolve();
function oneAtATime<T>(work: () => Promise<T>): Promise<T> {
  const run = syncing.then(work, work);
  syncing = run.catch(() => undefined);
  return run;
}

/** `settings` is what the browser held when the sync started. Every write re-reads the browser first,
 *  because the operator may have changed the setup while the Bridge was being asked: a change made in
 *  that moment is never written over, and its mark stays until the Bridge has that change too. */
async function syncWith(settings: PlayoutSettings, list: RememberedServer[]): Promise<StudioSync> {
  let servers = list;
  const inUse = { host: settings.host.trim(), port: settings.amcpPort };
  const sent = studioOf(settings);
  const pending = pendingServer(settings);
  // A change made for ANOTHER server (the address was edited since) goes to that server first, or is
  // dropped when the Bridge never connected to it: it has nowhere to keep it.
  if (pending && !sameServer(pending, inUse)) {
    if (servers.some((s) => sameServer(s, pending))) servers = (await keepStudio(settings, pending)) ?? servers;
    settlePending(sent);
  }
  const pendingHere = !!pending && sameServer(pending, inUse);
  const entry = servers.find((s) => sameServer(s, inUse));
  const step = studioStep(sent, entry, pendingHere);
  if (step.kind === 'pull') {
    const now = loadPlayoutSettings();
    // Changed here while the Bridge was asked: decide again from what the browser holds now.
    if (pendingServer(now) || !sameStudio(studioOf(now), sent)) return syncWith(now, servers);
    writeSettings({ ...now, ...studioFields(step.studio) });
    return { keeper: 'bridge', changed: true, servers };
  }
  if (step.kind === 'push') {
    const kept = await keepStudio(settings, inUse);
    if (!kept) return { keeper: 'waiting', changed: false, servers };
    servers = kept;
  }
  if (!entry) return { keeper: 'unconnected', changed: false, servers };
  // Kept, or the same on both sides: nothing waits any more, unless a newer change came meanwhile.
  if (pendingHere) settlePending(sent);
  return { keeper: step.kind === 'push' || entry.studio ? 'bridge' : 'ready', changed: false, servers };
}

/** The change the Bridge was given (`sent`) has landed: drop the mark, unless the browser has changed
 *  the setup again since, in which case that change still waits for its own turn. */
function settlePending(sent: StudioSetup): void {
  const now = loadPlayoutSettings();
  if (now.studioPending && sameStudio(studioOf(now), sent)) writeSettings({ ...now, studioPending: undefined });
}

/** The server a change waits for, when one does and the record says a server. */
function pendingServer(s: PlayoutSettings): { host: string; port: number } | null {
  const p = s.studioPending;
  return p && typeof p.host === 'string' && p.host.trim() && typeof p.port === 'number' ? p : null;
}

/** Give the Bridge this browser's setup for `server`. The Bridge's new list, or null when it did not
 *  take it (it stopped answering, or refused). */
async function keepStudio(settings: PlayoutSettings, server: { host: string; port: number }): Promise<RememberedServer[] | null> {
  const kept = await ownRoute(settings, '/studio', { target: { adapter: 'casparcg', host: server.host, port: server.port }, studio: studioOf(settings) });
  return 'body' in kept && Array.isArray(kept.body.servers) ? kept.body.servers : null;
}

/**
 * A PAIRING LINK FOR ANOTHER BROWSER (D19): NoaCG Bridge opens one more one-time code, good for two
 * minutes, and the link is this page's own, the shape `parseBridgePair` reads. Otherwise why there is
 * none: a Bridge older than 0.8.0 cannot make one, so the page says to start it again for a fresh link.
 */
export async function pairingLinkForAnotherBrowser(settings: PlayoutSettings): Promise<string | { unavailable: string }> {
  const asked = await askBridge(settings, 'pair-link', '/pair-link');
  if ('missing' in asked) return { unavailable: 'This NoaCG Bridge cannot make another link. Start it again and copy the link it opens into the other browser.' };
  if ('failed' in asked) return { unavailable: asked.failed.detail };
  const port = Number(URL.canParse(settings.agentUrl) ? new URL(settings.agentUrl).port : '');
  if (typeof asked.body.code !== 'string' || !port) return { unavailable: `NoaCG Bridge on ${settings.agentUrl} made no link.` };
  return bridgePairLink(window.location.origin, port, asked.body.code);
}

/** A server as a person writes it: the host alone on CasparCG's own port, host:port otherwise. */
export function serverAddress(server: RememberedServer): string {
  return server.port === PLAYOUT_DEFAULTS.amcpPort ? server.host : `${server.host}:${server.port}`;
}

/** The server's library of one kind. `items` is present only on `ok`. */
export async function listLibrary(settings: PlayoutSettings, kind: ItemKind): Promise<{ result: PlayoutResult; items?: ListItem[] }> {
  const { result, body } = await through(settings, '/list', { kind }, 'list');
  return { result, items: result.state === 'ok' ? (body?.items ?? []) : undefined };
}

/** A media file's thumbnail as a data URL, or null when the server has none to give. */
export async function libraryThumbnail(settings: PlayoutSettings, name: string): Promise<string | null> {
  const { result, body } = await through(settings, '/thumbnail', { name }, 'list');
  return result.state === 'ok' && body?.png ? `data:image/png;base64,${body.png}` : null;
}

/** One verb on the server. The action carries no page state, so it is exactly what a log row
 *  would carry later. An accepted one carries the slot's generation, and a take its instance. */
export function act(settings: PlayoutSettings, action: PlayoutAction): Promise<PlayoutResult>;
export function act(settings: PlayoutSettings, action: PlayoutAction, canSend: () => boolean, verify?: VerifyBeforeAct): Promise<PlayoutResult | null>;
export async function act(settings: PlayoutSettings, action: PlayoutAction, canSend?: () => boolean, verify?: VerifyBeforeAct): Promise<PlayoutResult | null> {
  if (!canSend) return (await through(settings, '/act', { action })).result;
  return (await through(settings, '/act', () => canSend() ? { action } : null, 'act', verify))?.result ?? null;
}

/** Only an accepted All out can finish a native cut after the production closes. In that case
 *  check the original slot against live Bridge state before it can be stopped. */
export function finishCasparAllOut(
  settings: PlayoutSettings, action: PlayoutAction, casparAllowed: () => boolean, mounted: () => boolean,
  matches: (slot: SlotState) => boolean,
): Promise<PlayoutResult | null> {
  const { slot } = action;
  if (action.verb !== 'out' || slot.adapter !== 'casparcg') return Promise.resolve(null);
  let verified = false;
  return act(settings, action, () => casparAllowed() && (mounted() || verified), () => {
    if (!casparAllowed()) return false;
    if (mounted()) return true;
    return readState(settings, slot.channel).then(({ reply }) => {
      verified = reply?.slots.some(current => current.layer === slot.layer && !current.arriving && matches(current)) ?? false;
      return verified;
    });
  });
}

/**
 * The whole live link for NoaCG's own graphics: one take of the production's output URL onto
 * the configured slot. Every cue, take, update and recovery after this flows through the
 * durable command log the /output page already follows - there is deliberately no per-take CG
 * traffic for NoaCG graphics (docs/BRIDGE.md §2).
 *
 * THE OUTPUT URL IS THE ONE THIS PAGE'S ORIGIN SERVES, and on 2026-09-10 that turned out to
 * matter more than it reads. Pressed on a dev server the command carries `http://localhost:<port>/
 * output?…` - a Vite bundle of untranspiled ES modules, which the CEF in CasparCG 2.3.x (measured
 * Chromium 71) cannot parse. AMCP still answers `202`, this function still returns `ok`, and the
 * channel stays black: the one command succeeded, so nothing downstream can tell. The built
 * bundle is `es2017` with the shims in output.html and airs on the same server. There is no fix
 * to make here - a page cannot know how its own URL renders elsewhere - so the note is the
 * mechanism: air a production from the deployment, not from a dev server.
 */
export function putOutputOnAir(settings: PlayoutSettings, outputUrl: string): Promise<PlayoutResult>;
export function putOutputOnAir(settings: PlayoutSettings, outputUrl: () => string | null): Promise<PlayoutResult | null>;
export async function putOutputOnAir(settings: PlayoutSettings, outputUrl: string | (() => string | null)): Promise<PlayoutResult | null> {
  const slot = slotOf(settings);
  const take = (url: string): PlayoutAction => ({
    verb: 'take', item: { kind: 'url', name: namedOutputUrl(url, `CasparCG ${slot.channel}-${slot.layer}`) }, slot,
  });
  if (typeof outputUrl === 'string') return act(settings, take(outputUrl));
  const reply = await through(settings, '/act', () => {
    const url = outputUrl();
    return url === null ? null : { action: take(url) };
  });
  return reply?.result ?? null;
}

/**
 * THE OUTPUT URL WITH A NAME ON IT (READY, docs/work-specs/playout-ready/spec.md R5): the output
 * announces `&name=` as what the operator calls it, so the layer the Bridge put on air reads
 * "CasparCG 1-20 not answering (40 s)" rather than an engine string, and a layer played again takes
 * its own place back. The output ignores the parameter for everything else.
 */
export function namedOutputUrl(outputUrl: string, name: string): string {
  return `${outputUrl}${outputUrl.includes('?') ? '&' : '?'}name=${encodeURIComponent(name)}`;
}

/** Out on the output layer is a video-layer STOP, so no item is named: the Bridge refuses an
 *  item without a name, and a real 2.5.0 walk on 2026-09-22 caught exactly that being sent. */
export function takeOutputOff(settings: PlayoutSettings): Promise<PlayoutResult>;
export function takeOutputOff(settings: PlayoutSettings, canSend: () => boolean, verify?: VerifyBeforeAct): Promise<PlayoutResult | null>;
export function takeOutputOff(settings: PlayoutSettings, canSend?: () => boolean, verify?: VerifyBeforeAct): Promise<PlayoutResult | null> {
  const action: PlayoutAction = { verb: 'out', slot: slotOf(settings) };
  return canSend ? act(settings, action, canSend, verify) : act(settings, action);
}

// ---------------------------------------------------------------------------------------------
// vMix output
// ---------------------------------------------------------------------------------------------

const vmixTarget = { adapter: 'vmix' } as const;

/** Read the saved choice at the point where a production may send to an adapter. */
export function currentProductionPlayout(
  showId: string, legacyCasparActivity: boolean, accountCaspar: boolean | null, adapter: 'casparcg' | 'vmix',
) {
  const show = loadShows().find(item => item.id === showId);
  return show && productionPlayoutSystem(show, legacyCasparActivity, accountCaspar) === adapter ? show : null;
}

export function bridgePaired(settings: Pick<PlayoutSettings, 'agentUrl' | 'agentToken'>): boolean {
  return Boolean(settings.agentUrl.trim() && settings.agentToken.trim());
}

export interface VmixConnection {
  /** Undefined when this request could not establish the pairing's advertised capabilities. */
  supported?: boolean;
  keyed: boolean;
  result?: PlayoutResult;
  info?: VmixInfo;
}

const vmixCapabilityProblem: PlayoutResult = { state: 'bridge', detail: 'NoaCG Bridge did not return a valid playout capability response. Try again.' };

const vmixErrorCodes: readonly AgentError['code'][] = ['no-media-scanner', 'refused', 'unreachable', 'not-found', 'unsupported', 'usage', 'uncertain'];
const nonblank = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const whole = (value: unknown, min: number): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min;

function validVmixInfo(info: VmixInfo | undefined): info is VmixInfo {
  return !!info && typeof info.version === 'string' && VMIX_VERSION.test(info.version) &&
    nonblank(info.edition) && info.overlays === vmixOverlayCount(info.version, info.edition) && whole(info.inputs, 0);
}

function validConnectServers(servers: RememberedServer[] | undefined): boolean {
  return Array.isArray(servers) && servers.every(server => isRememberedServerAddress(server) &&
    (server.studio === undefined || readStudio(server.studio) !== null));
}

function validVmixLinks(linked: VmixStateReply['linked'] | undefined, count: number): boolean {
  return Array.isArray(linked) && linked.every(row => row && nonblank(row.id) &&
    row.output && typeof row.output === 'object' && !Array.isArray(row.output) &&
    (row.output.onOverlay === undefined || (whole(row.output.onOverlay, 1) && row.output.onOverlay <= count)) &&
    Array.isArray(row.live) && row.live.every(nonblank));
}

function validVmixError(http: number, error: AgentError | undefined): boolean {
  if (!error || (error.hop !== 'agent' && error.hop !== 'target') ||
    !vmixErrorCodes.includes(error.code) || !nonblank(error.detail) ||
    (error.raw !== undefined && typeof error.raw !== 'string') ||
    (error.setup !== undefined && (error.hop !== 'target' || error.code !== 'unreachable' ||
      (error.setup !== 'not-running' && error.setup !== 'not-vmix')))) return false;
  return http === 200 ||
    (http === 400 && error.hop === 'agent' && error.code === 'usage') ||
    (http === 502 && error.hop === 'target' && error.code === 'unreachable');
}

function vmixOverlayRows(overlays: VmixOverlayState[] | undefined, info: VmixInfo, loadProblem?: string) {
  const count = info.overlays;
  if (!Array.isArray(overlays) || overlays.length !== count) return;
  const diagnostic = overlays.every(row => row?.ownsOutput === undefined) && nonblank(loadProblem);
  const channels = new Set<number>();
  const inputs = new Map<string, { input: VmixInput; ownsOutput?: boolean }>();
  const positions = new Map<number, string>();
  let ownedKey: string | undefined;
  const rows: VmixOverlayState[] = [];
  for (const row of overlays) {
    if (!row || !whole(row.overlay, 1) || row.overlay > count || channels.has(row.overlay) ||
      (!diagnostic && typeof row.ownsOutput !== 'boolean')) return;
    channels.add(row.overlay);
    const input = row.input;
    if (input === undefined) {
      if (row.ownsOutput) return;
      rows.push(row);
      continue;
    }
    if (!input || typeof input.key !== 'string' || !VMIX_INPUT_KEY.test(input.key) ||
      !whole(input.number, 1) || typeof input.title !== 'string' || !nonblank(input.type) ||
      (row.ownsOutput && input.type !== 'Browser')) return;
    const key = input.key.toLowerCase();
    const prior = inputs.get(key);
    const position = positions.get(input.number);
    if ((prior && (prior.input.number !== input.number || prior.input.title !== input.title ||
      prior.input.type !== input.type || prior.ownsOutput !== row.ownsOutput)) ||
      (position && position !== key)) return;
    if (row.ownsOutput) {
      if (ownedKey && ownedKey !== key) return;
      ownedKey = key;
    }
    inputs.set(key, { input, ownsOutput: row.ownsOutput });
    positions.set(input.number, key);
    rows.push({ ...row, input: { ...input, key } });
  }
  if (inputs.size > info.inputs) return;
  return { overlays: diagnostic ? undefined : rows, loadProblem };
}

const vmixReplyFields = {
  '/status': ['version', 'raw', 'capabilities', 'vmix'],
  '/connect': ['version', 'raw', 'capabilities', 'vmix', 'servers'],
  '/state': ['vmix', 'session', 'observedAt', 'linked', 'overlays', 'loadProblem'],
  '/act': ['raw', 'generation', 'session', 'warning', 'instance'],
} as const satisfies Record<string, readonly (keyof BridgeReply)[]>;

type VmixRoute = keyof typeof vmixReplyFields;
type VmixActionResult = PlayoutResult & { unknownAction?: true };

/** vMix output controls depend on an observed result, so validate this adapter's wire replies. */
function readVmixReply(settings: PlayoutSettings, call: Call, route: VmixRoute): PlayoutReply & { result: VmixActionResult } {
  const unknownAction = 'The vMix action result is unknown. Check the overlay before trying again.';
  if (!('http' in call)) {
    const { result } = readReply(settings, call, 'vMix');
    return { result: route === '/act' ? { ...result, detail: `${result.detail} ${unknownAction}`, unknownAction: true } : result };
  }
  const { http, body } = call;
  const failureShape = hasOnlyPayloadFields(body) && (body?.ok === undefined || body.ok === false);
  if ((http === 401 || http === 403) && failureShape) return readReply(settings, call, 'vMix');
  if (failureShape && body?.v === PLAYOUT_V && body.ok === false && validVmixError(http, body.error)) {
    const reply = readReply(settings, call, 'vMix');
    if (route === '/act' && (http === 502 || body.error?.code === 'uncertain')) {
      return { ...reply, result: { ...reply.result, unknownAction: true } };
    }
    return reply;
  }
  if (http === 200 && body?.v === PLAYOUT_V && body.ok === true && body.error === undefined &&
    hasOnlyPayloadFields(body, vmixReplyFields[route])) {
    if (route === '/act') {
      if (nonblank(body.raw) && whole(body.generation, 0) && nonblank(body.session) &&
        (body.warning === undefined || typeof body.warning === 'string') &&
        (body.instance === undefined || nonblank(body.instance))) return readReply(settings, call, 'vMix');
    } else if (route === '/state') {
      if (validVmixInfo(body.vmix) && nonblank(body.session) && whole(body.observedAt, 0) &&
        validVmixLinks(body.linked, body.vmix.overlays) && (body.loadProblem === undefined || nonblank(body.loadProblem))) {
        const rows = vmixOverlayRows(body.overlays, body.vmix, body.loadProblem);
        if (rows) return readReply(settings, { http, body: { ...body, ...rows } }, 'vMix');
      }
    } else if (validVmixInfo(body.vmix) && body.version === body.vmix.version && nonblank(body.raw) &&
      Array.isArray(body.capabilities) && body.capabilities.every(capability => typeof capability === 'string') &&
      (route !== '/connect' || validConnectServers(body.servers))) {
      return readReply(settings, call, 'vMix');
    }
  }
  return {
    result: route === '/act'
      ? { state: 'bridge', detail: unknownAction, unknownAction: true }
      : { state: 'bridge', detail: 'NoaCG Bridge did not return a valid vMix reading. Try again.' },
  };
}

export async function testVmix(settings: PlayoutSettings, reconnect = false): Promise<VmixConnection> {
  if (!bridgePaired(settings)) return { supported: false, keyed: false };
  const { unreachable, features, adapters, vmixHealthValid } = await probeBridge(settings.agentUrl);
  if (unreachable) {
    if (adapters) return { supported: false, keyed: false, result: unreachable };
    if (unreachable.state !== 'outdated') return { keyed: false, result: unreachable };
  }
  if (!adapters || !vmixHealthValid) return { keyed: false, result: vmixCapabilityProblem };
  if (!adapters.includes('vmix')) return { supported: false, keyed: false };
  const route = reconnect ? '/connect' : '/status';
  const call = await callBridge(settings.agentUrl, route, { target: vmixTarget }, ACT_TIMEOUT_MS, settings.agentToken);
  const { result, body } = readVmixReply(settings, call, route);
  return { supported: true, keyed: features.includes('vmix-output-key'), result, info: result.state === 'ok' ? body?.vmix : undefined };
}

export async function readVmixOverlays(settings: PlayoutSettings, outputUrl: string): Promise<{
  result: PlayoutResult; info?: VmixInfo; overlays?: VmixOverlayState[]; loadProblem?: string;
}> {
  const call = await callBridge(
    settings.agentUrl, '/state', { target: vmixTarget, outputUrl }, ACT_TIMEOUT_MS, settings.agentToken,
  );
  const { result, body } = readVmixReply(settings, call, '/state');
  if (result.state !== 'ok') return { result };
  return { result, info: body?.vmix, overlays: body?.overlays, loadProblem: body?.loadProblem };
}

export async function actVmix(
  settings: PlayoutSettings, currentAction: () => PlayoutAction | null,
): Promise<VmixActionResult | null> {
  const { unreachable, features, adapters, vmixHealthValid } = await probeBridge(settings.agentUrl);
  const action = currentAction();
  if (!action) return null;
  if (!adapters && (!unreachable || unreachable.state === 'outdated')) return vmixCapabilityProblem;
  if (unreachable) return unreachable;
  if (!vmixHealthValid) return vmixCapabilityProblem;
  if (!adapters?.includes('vmix') || !features.includes('vmix-output-key')) {
    return { state: 'outdated', detail: 'Update NoaCG Bridge to load or unload an output in vMix.' };
  }
  const call = await callBridge(
    settings.agentUrl, '/act', { target: vmixTarget, action }, ACT_TIMEOUT_MS, VMIX_OUTPUT_TOKEN_PREFIX + settings.agentToken,
  );
  return readVmixReply(settings, call, '/act').result;
}

// ---------------------------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------------------------

/** The pairing link on `origin`: what NoaCG Bridge prints and opens (`pairingUrl` in its command),
 *  what a paired page hands another browser, and what `parseBridgePair` reads. */
export function bridgePairLink(origin: string, port: number, code: string): string {
  return `${origin}/app?bridge=${port}&code=${encodeURIComponent(code)}`;
}

/** `/app?bridge=<port>&code=<code>` - the link NoaCG Bridge prints and opens. */
export function isBridgePairUrl(params: URLSearchParams): boolean {
  return params.has('bridge');
}

export interface BridgePairRequest {
  port: number;
  code: string;
}

/** Parse the pairing query. Null = malformed; the page says so rather than guessing a port. */
export function parseBridgePair(params: URLSearchParams): BridgePairRequest | null {
  const port = Number(params.get('bridge'));
  if (!Number.isInteger(port) || port < 1024 || port > 65535) return null;
  const code = params.get('code') ?? '';
  if (!/^[0-9a-f]{16,64}$/.test(code)) return null;
  return { port, code };
}

/** Exchange the one-time code for the token and remember both. The Bridge is always on
 *  loopback - the port is the only variable, and it was checked. */
export async function pairBridge(request: BridgePairRequest): Promise<PlayoutResult> {
  const bridgeUrl = `http://127.0.0.1:${request.port}`;
  const unreachable = await reachBridge(bridgeUrl);
  if (unreachable) return unreachable;
  const call = await callBridge(bridgeUrl, '/pair', { code: request.code }, BRIDGE_TIMEOUT_MS);
  if ('timedOut' in call) return { state: 'bridge', detail: `${bridgeUrl} did not answer the pairing request in time.` };
  if ('networkError' in call) return { state: 'bridge', detail: `NoaCG Bridge stopped answering: ${call.networkError}` };
  if (call.http === 403) return { state: 'bridge', detail: `NoaCG Bridge refused this site. Restart NoaCG Bridge with \`--origin ${window.location.origin}\`.` };
  if (!call.body.ok || !call.body.token) {
    return { state: 'token', detail: call.body.error?.detail ?? 'That pairing link has been used or is more than two minutes old. Get a new one: press Enter in the NoaCG Bridge window, or start NoaCG Bridge again.' };
  }
  savePlayoutSettings({ agentUrl: bridgeUrl, agentToken: call.body.token });
  return { state: 'ok', detail: `Paired with NoaCG Bridge on ${bridgeUrl}.` };
}

// ---------------------------------------------------------------------------------------------
// Connection state, polled
// ---------------------------------------------------------------------------------------------

/**
 * Whether the configured server answers, re-asked every few seconds while a surface shows it.
 * Polling, on purpose: it is one loopback request, and the value has exactly the shape a pushed
 * one would carry, so a push channel later changes this function and nothing that reads it.
 * The unsubscribe returned stops the timer; a call in flight when it fires is dropped.
 */
export function subscribeTargetStatus(
  settings: PlayoutSettings,
  onStatus: (result: PlayoutResult) => void,
  intervalMs = 3000,
): () => void {
  let alive = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const tick = async () => {
    const result = await testConnection(settings);
    if (!alive) return;
    onStatus(result);
    timer = setTimeout(() => void tick(), intervalMs);
  };
  void tick();
  return () => {
    alive = false;
    if (timer) clearTimeout(timer);
  };
}
