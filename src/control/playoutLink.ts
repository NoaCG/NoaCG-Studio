// NoaCG Bridge, browser half - docs/BRIDGE.md.
//
// A page cannot open a raw TCP socket, so it cannot speak AMCP; the socket lives in NoaCG Bridge
// (the NoaCG-Bridge.exe download; `noacg bridge` in the CLI package is the same program) on the
// operator's own machine, and this file talks to it over loopback HTTP in the playout
// protocol (playoutProtocol.ts). Everything here is one studio-wide setting plus one honest
// answer about which hop is broken - the surfaces that use it never say "failed".
//
// THE HOPS, and why they are told apart (measured 2026-08-24, Chromium 149):
//   permission  Chrome's Local Network Access gates a PUBLIC page reaching 127.0.0.1. It is a
//               user permission, not the old Access-Control-Allow-Private-Network header,
//               which no longer helps at all. While it is unanswered the request HANGS rather
//               than failing, which is why every call here carries a timeout and why a timeout
//               means "answer the prompt", never "unreachable".
//   bridge      No Bridge on that address, or one started for another deployment.
//   outdated    A Bridge too old to speak this protocol.
//   token       A Bridge, refusing this token.
//   server      A Bridge, and the playout server behind it did not answer or refused.
//   scanner     The server answered, but its media scanner is not running, so it cannot list.
//
// NoaCG OWNS THE CONFIGURATION: the Bridge address and token and the playout server live here,
// device-level; the Bridge keeps nothing but its own token and is named its target on every call.

import { MAX_PLAYOUT_CHANNEL, MIN_PLAYOUT_CHANNEL } from '../model/shows';
import {
  PLAYOUT_V,
  type AdapterId,
  type AgentError,
  type ItemKind,
  type ListItem,
  type PlayoutAction,
  type Slot,
  type Target,
} from './playoutProtocol';

const STORE_KEY = 'spx-gfx-caspar';
const STORE_V = 1;

/** The oldest Bridge this page can drive. `/health` below this is "update NoaCG Bridge". */
export const MIN_PLAYOUT_V = PLAYOUT_V;
/** The Bridge's one user-facing home. The repository's Releases page carries NoaCG Bridge releases
 *  only (release-bridge.yml), so `latest` is always the newest Bridge. The CLI package the Bridge
 *  is built from is published to npm and never named here: a playout operator downloads a
 *  program, and does not have to know what it is built from. */
export const BRIDGE_DOWNLOAD_URL = 'https://github.com/NoaCG/NoaCG-Studio/releases/latest/download/NoaCG-Bridge.exe';
/** What the person double-clicks, named in the hop sentences so "start it" is concrete. */
const BRIDGE_EXE = 'NoaCG-Bridge.exe';

/** How long to wait on the Bridge. Generous on purpose: with the Local Network Access prompt
 *  up, the browser holds the request open until the person answers it. */
const BRIDGE_TIMEOUT_MS = 6000;
/** A cue travels one hop further, to a machine that may be asleep. */
const ACT_TIMEOUT_MS = 9000;
/** A list waits past the server's own scanner timeout (about 5 s on 2.5.0) so a missing scanner
 *  is reported as itself rather than as silence. */
const LIST_TIMEOUT_MS = 16000;

export interface PlayoutSettings {
  /** Where NoaCG Bridge is listening. Loopback, on the operator's own machine. The stored key
   *  keeps its first name so a browser paired before the rename stays paired. */
  agentUrl: string;
  /** The Bridge's token. Held in this browser only, like every other preference. */
  agentToken: string;
  /** The playout server itself - may be any machine on the studio LAN. */
  host: string;
  amcpPort: number;
  /** The GRAPHICS channel: where the production's output URL goes on air, and where a server
   *  template (and any cue saved before channels had names) plays unless its cue says otherwise. */
  channel: number;
  /** The output URL's layer on the graphics channel. */
  layer: number;
  /** The channels this studio uses, each with the operator's word for it (`1 Graphics`,
   *  `2 Inserts`). A cue picks its channel from this list rather than typing a number. ADDITIVE:
   *  a record saved before it existed reads as one row, the graphics channel. Always holds the
   *  graphics channel after load. */
  channels: PlayoutChannel[];
  /** Where a NEW server clip is cued. The graphics channel until the studio names another one. */
  clipChannel: number;
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
  channel: 1,
  // 20 is the layer this project's own CasparCG documentation has always used as its example
  // (docs/PLAYOUT_INTEGRATION.md §3), so a reader following that guide finds it already set.
  layer: 20,
  // One channel: a stock casparcg.config has exactly one, so a fresh studio never cues a clip
  // onto a channel the server does not have. "Add channel" in Settings makes the second.
  channels: [{ channel: 1, name: 'Graphics' }],
  clipChannel: 1,
};

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
  const channels = rows.some((row) => row.channel === channel) ? rows : [{ channel, name: 'Graphics' }, ...rows];
  const clip = channelNumber(s.clipChannel);
  const clipChannel = clip !== null && channels.some((row) => row.channel === clip) ? clip : channel;
  return { ...s, channel, channels, clipChannel };
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

export function savePlayoutSettings(patch: Partial<PlayoutSettings>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadPlayoutSettings(), ...patch, v: STORE_V }));
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
export function targetOf(s: PlayoutSettings): Target {
  return { adapter: 'casparcg', host: s.host.trim(), port: s.amcpPort };
}

export function slotOf(s: PlayoutSettings, layer = s.layer, channel = s.channel): Slot {
  return { adapter: 'casparcg', channel, layer };
}

/** The channel a new server item is cued on: a clip goes to the clip channel, a template to the
 *  graphics channel, the way a CasparCG client's rundown defaults its own items. */
export function defaultChannelFor(s: PlayoutSettings, kind: ItemKind): number {
  return kind === 'media' ? s.clipChannel : s.channel;
}

/** The channel an item plays on: its own when it carries one, else the graphics channel - which
 *  is how every item saved before cues had a channel keeps playing where it always did. */
export function channelOf(s: PlayoutSettings, item: { channel?: number }): number {
  return channelNumber(item.channel) ?? s.channel;
}

/** Where an item plays, as the protocol names it. */
export function itemSlot(s: PlayoutSettings, item: { channel?: number; layer: number }): Slot {
  return slotOf(s, item.layer, channelOf(s, item));
}

/** The studio's word for a channel (`Inserts`), or '' for one it has not named - a production
 *  made in another studio, or a row removed since. The first row wins on a duplicate number. */
export function channelName(s: PlayoutSettings, channel: number): string {
  return s.channels.find((row) => row.channel === channel)?.name.trim() ?? '';
}

/** `2 · Inserts` - a channel as the operator reads it, or the bare number when it has no name. */
export function channelLabel(s: PlayoutSettings, channel: number): string {
  const name = channelName(s, channel);
  return name ? `${channel} · ${name}` : String(channel);
}

/** `channel 2 (Inserts)` - the same, as it reads inside a sentence. */
export function channelTitle(s: PlayoutSettings, channel: number): string {
  const name = channelName(s, channel);
  return name ? `channel ${channel} (${name})` : `channel ${channel}`;
}

/** `1-20` - what the operator sees on the button, and what CasparCG calls the layer. */
export function slotAddress(slot: Pick<Slot, 'channel' | 'layer'>): string {
  return `${slot.channel}-${slot.layer}`;
}

// ---------------------------------------------------------------------------------------------
// Local Network Access
// ---------------------------------------------------------------------------------------------

export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

/** Chrome exposes the gate as an ordinary permission, so a surface can say what stands in the
 *  way BEFORE making a call that would otherwise hang. Browsers that do not know the name
 *  throw, and 'unknown' is the honest answer for them. */
export async function localNetworkPermission(): Promise<PermissionState> {
  try {
    const q = navigator.permissions as unknown as {
      query(d: { name: string }): Promise<{ state: PermissionState }>;
    };
    const status = await q.query({ name: 'local-network-access' });
    return status.state;
  } catch {
    return 'unknown';
  }
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
}

interface BridgeReply {
  ok?: boolean;
  v?: number;
  agent?: string;
  version?: string;
  adapters?: AdapterId[];
  error?: AgentError;
  items?: ListItem[];
  png?: string;
  raw?: string;
  token?: string;
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
  return { state: 'bridge', detail: `${reason} Start NoaCG Bridge on this machine (double-click ${BRIDGE_EXE}; Settings -> Playout links the download), then try again.` };
}

/**
 * The presence half: is a Bridge on that address, is it new enough, and if not, is it the
 * permission prompt standing in the way? Null means "a current Bridge answered".
 */
export async function reachBridge(bridgeUrl: string): Promise<PlayoutResult | null> {
  const health = await callBridge(bridgeUrl, '/health', null, BRIDGE_TIMEOUT_MS);
  if ('http' in health) {
    const { agent, v } = health.body;
    if (agent === 'noacg-bridge' && typeof v === 'number' && v >= MIN_PLAYOUT_V) return null;
    if (agent === 'noacg-bridge' || agent === 'noacg-caspar') {
      return {
        state: 'outdated',
        detail: `The NoaCG Bridge on ${bridgeUrl} is too old for this page${health.body.version ? ` (version ${health.body.version})` : ''}. Download the current NoaCG Bridge from Settings -> Playout, start it, then try again.`,
      };
    }
    return { state: 'bridge', detail: `Something is listening on ${bridgeUrl}, but it is not NoaCG Bridge.` };
  }

  const gated = localNetworkGateApplies(window.location.origin, bridgeUrl);
  const permission = gated ? await localNetworkPermission() : 'granted';
  if (gated && permission !== 'granted') {
    // Three different situations, and only one of them has a prompt to answer. Telling a
    // Safari user to look for a permission bubble that browser never shows would send them
    // hunting for a control that does not exist.
    const detail =
      permission === 'denied'
        ? `Your browser is blocking this site from reaching your local network. Allow "local network access" for ${window.location.host} in the site settings (the icon left of the address), then try again.`
        : permission === 'prompt'
          ? 'Your browser is asking whether this site may reach your local network - answer the prompt at the top of the window, then try again.'
          : 'This browser does not let a secure page reach an address on your own machine, and offers no permission to grant (Safari behaves this way). Use Chrome or Edge here, or air the production from a terminal with `noacg caspar play`.';
    return { state: 'permission', detail };
  }
  // Past the permission check, so a hang here is the Bridge's silence and not a waiting prompt.
  if ('timedOut' in health) return noBridge(`No answer from ${bridgeUrl}.`);
  return noBridge(`Could not reach ${bridgeUrl}.`);
}

/** A Bridge reply, whichever hop it names, as one sentence with a state. */
function readReply(settings: PlayoutSettings, call: Call): { result: PlayoutResult; body?: BridgeReply } {
  const at = `${settings.host}:${settings.amcpPort}`;
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
        detail: `NoaCG Bridge refused this site. Restart it with \`${BRIDGE_EXE} --origin ${window.location.origin}\`.`,
      },
    };
  }
  if (body.ok) return { result: { state: 'ok', detail: 'Connected.', version: body.version, raw: body.raw }, body };
  const error = body.error;
  if (!error) return { result: { state: 'bridge', detail: `NoaCG Bridge answered ${http} with no reason.` } };
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

/** One request through the Bridge with every hop told apart. */
async function through(
  settings: PlayoutSettings,
  path: '/status' | '/list' | '/thumbnail' | '/act',
  extra: Record<string, unknown>,
  hop: 'act' | 'list' = 'act',
): Promise<{ result: PlayoutResult; body?: BridgeReply }> {
  if (!playoutConfigured(settings)) {
    return { result: { state: 'config', detail: 'Pair NoaCG Bridge and fill in the playout server first (Settings -> Playout).' } };
  }
  const unreachable = await reachBridge(settings.agentUrl);
  if (unreachable) return { result: unreachable };
  const call = await callBridge(
    settings.agentUrl,
    path,
    { target: targetOf(settings), ...extra },
    hop === 'list' ? LIST_TIMEOUT_MS : ACT_TIMEOUT_MS,
    settings.agentToken,
  );
  return readReply(settings, call);
}

/** The Test connection button: a real AMCP VERSION, round-tripped. */
export async function testConnection(settings: PlayoutSettings): Promise<PlayoutResult> {
  return (await through(settings, '/status', {})).result;
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
 *  would carry later. */
export async function act(settings: PlayoutSettings, action: PlayoutAction): Promise<PlayoutResult> {
  return (await through(settings, '/act', { action })).result;
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
export function putOutputOnAir(settings: PlayoutSettings, outputUrl: string): Promise<PlayoutResult> {
  return act(settings, { verb: 'take', item: { kind: 'url', name: outputUrl }, slot: slotOf(settings) });
}

/** Out on the output layer is a video-layer STOP, so no item is named: the Bridge refuses an
 *  item without a name, and a real 2.5.0 walk on 2026-09-22 caught exactly that being sent. */
export function takeOutputOff(settings: PlayoutSettings): Promise<PlayoutResult> {
  return act(settings, { verb: 'out', slot: slotOf(settings) });
}

// ---------------------------------------------------------------------------------------------
// Pairing
// ---------------------------------------------------------------------------------------------

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
  if (call.http === 403) return { state: 'bridge', detail: `NoaCG Bridge refused this site. Restart it with \`${BRIDGE_EXE} --origin ${window.location.origin}\`.` };
  if (!call.body.ok || !call.body.token) {
    return { state: 'token', detail: call.body.error?.detail ?? 'That pairing code is not valid. Start NoaCG Bridge again to get a fresh one.' };
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
