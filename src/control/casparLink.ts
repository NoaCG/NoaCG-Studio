// CasparCG Connect, browser half - docs/CASPARCG_CONNECT.md.
//
// A page cannot open a raw TCP socket, so it cannot speak AMCP; the socket lives in
// `noacg caspar agent` on the operator's own machine and this file talks to it over loopback
// HTTP. Everything here is one studio-wide setting plus one honest answer about which hop is
// broken - the panel that uses it never says "failed".
//
// THE FOUR HOPS, and why they are told apart (measured 2026-08-24, Chromium 149):
//   permission  Chrome's Local Network Access gates a PUBLIC page reaching 127.0.0.1. It is a
//               user permission, not the old Access-Control-Allow-Private-Network header,
//               which no longer helps at all. While it is unanswered the request HANGS rather
//               than failing, which is why every call here carries a timeout and why a timeout
//               means "answer the prompt", never "unreachable".
//   agent       No agent on that address.
//   token       An agent, refusing this token.
//   server      An agent, and no CasparCG behind it.

const STORE_KEY = 'spx-gfx-caspar';
const STORE_V = 1;

/** How long to wait on the agent. Generous on purpose: with the Local Network Access prompt
 *  up, the browser holds the request open until the person answers it. */
const AGENT_TIMEOUT_MS = 6000;
/** AMCP calls travel one hop further, to a machine that may be asleep. */
const AMCP_TIMEOUT_MS = 9000;

export interface CasparSettings {
  /** Where `noacg caspar agent` is listening. Loopback, on the operator's own machine. */
  agentUrl: string;
  /** The token that agent printed. Held in this browser only, like every other preference. */
  agentToken: string;
  /** The CasparCG server itself - may be any machine on the studio LAN. */
  host: string;
  amcpPort: number;
  channel: number;
  layer: number;
}

export const CASPAR_DEFAULTS: CasparSettings = {
  agentUrl: 'http://127.0.0.1:8899',
  agentToken: '',
  host: '127.0.0.1',
  amcpPort: 5250,
  channel: 1,
  // 20 is the layer this project's own CasparCG documentation has always used as its example
  // (docs/PLAYOUT_INTEGRATION.md §3), so a reader following that guide finds it already set.
  layer: 20,
};

interface StoredCaspar extends Partial<CasparSettings> {
  v?: number;
}

/**
 * App-wide and persisted, NOT per production: a studio has one playout server, and retyping it
 * per show is exactly the friction this feature removes. Device-level like every other entry
 * in model/prefs.ts - it names hardware on this desk, and the token is a local credential that
 * has no business syncing to other machines.
 */
export function loadCasparSettings(): CasparSettings {
  try {
    const { v, ...raw } = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as StoredCaspar;
    // An unknown FUTURE version degrades honestly rather than being half-read: fall back to
    // the defaults and leave the stored row alone, so an older build never eats newer data.
    if (typeof v === 'number' && v > STORE_V) return { ...CASPAR_DEFAULTS };
    return { ...CASPAR_DEFAULTS, ...raw };
  } catch {
    return { ...CASPAR_DEFAULTS };
  }
}

export function saveCasparSettings(patch: Partial<CasparSettings>): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ ...loadCasparSettings(), ...patch, v: STORE_V }));
  } catch {
    // Same reasoning as model/prefs.ts: a preference is a convenience, and throwing from a
    // render-adjacent path costs the whole app.
  }
}

/** Enough filled in to be worth trying at all. */
export function casparConfigured(s: CasparSettings): boolean {
  return Boolean(s.agentUrl.trim() && s.agentToken.trim() && s.host.trim());
}

// ---------------------------------------------------------------------------------------------
// Local Network Access
// ---------------------------------------------------------------------------------------------

export type PermissionState = 'granted' | 'prompt' | 'denied' | 'unknown';

/** Chrome exposes the gate as an ordinary permission, so the panel can say what stands in the
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
 * or LAN address reaches a loopback agent with nothing granted, so offering that diagnosis
 * there would be a lie. Only a PUBLIC origin (the hosted studio) is gated.
 */
export function localNetworkGateApplies(pageOrigin: string, agentUrl: string): boolean {
  try {
    const page = new URL(pageOrigin);
    const agent = new URL(agentUrl);
    if (!isPrivateHostname(agent.hostname)) return false; // agent is not on a local address
    return !isPrivateHostname(page.hostname);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------------------------
// Talking to the agent
// ---------------------------------------------------------------------------------------------

export type CasparState = 'ok' | 'config' | 'permission' | 'agent' | 'token' | 'server';

export interface CasparResult {
  state: CasparState;
  /** One sentence naming the hop and what to do - never a bare "failed". */
  detail: string;
  /** CasparCG's own version string, when it answered. */
  version?: string;
  /** The AMCP status line, when there was one. */
  status?: string;
}

interface AgentReply {
  ok?: boolean;
  error?: string;
  code?: number;
  status?: string;
  lines?: string[];
  agent?: string;
  v?: number;
}

async function callAgent(
  settings: CasparSettings,
  path: string,
  body: Record<string, unknown> | null,
  timeoutMs: number,
): Promise<{ http: number; body: AgentReply } | { timedOut: true } | { networkError: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${settings.agentUrl.replace(/\/+$/, '')}${path}`, {
      method: body ? 'POST' : 'GET',
      // A POST carries both a JSON content type and an Authorization header, and either alone
      // forces a CORS preflight - which is the point. The agent refuses the preflight for any
      // origin it does not know, so a stray tab never gets to send the command at all. The
      // GET (/health) is deliberately plain and unauthenticated: it is the presence probe, and
      // it is answered for every origin so that "not running" is never said about an agent that
      // is running for another deployment.
      headers: body
        ? { 'content-type': 'application/json', authorization: `Bearer ${settings.agentToken}` }
        : {},
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      // Never send cookies to a local process; the token is the whole credential.
      credentials: 'omit',
      cache: 'no-store',
    });
    let parsed: AgentReply = {};
    try {
      parsed = (await response.json()) as AgentReply;
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

/** The "agent unreachable" half, told apart from "permission not granted". */
async function reachAgent(settings: CasparSettings): Promise<CasparResult | null> {
  const health = await callAgent(settings, '/health', null, AGENT_TIMEOUT_MS);
  if ('http' in health && health.body.agent === 'noacg-caspar') return null; // agent is there
  if ('http' in health) {
    return {
      state: 'agent',
      detail: `Something is listening on ${settings.agentUrl}, but it is not the NoaCG agent.`,
    };
  }

  const gated = localNetworkGateApplies(window.location.origin, settings.agentUrl);
  const permission = gated ? await localNetworkPermission() : 'granted';
  if (gated && permission !== 'granted') {
    // Three different situations, and only one of them has a prompt to answer. Telling a
    // Safari user to look for a permission bubble that browser never shows would send them
    // hunting for a control that does not exist.
    const detail =
      permission === 'denied'
        ? `Your browser is blocking this site from reaching your local network. Allow "local network access" for ${window.location.host} in the site settings (the icon left of the address), then test again.`
        : permission === 'prompt'
          ? 'Your browser is asking whether this site may reach your local network - answer the prompt at the top of the window, then test again.'
          : 'This browser does not let a secure page reach an address on your own machine, and offers no permission to grant (Safari behaves this way). Use Chrome or Edge here, or air the production from a terminal with `noacg caspar play`.';
    return { state: 'permission', detail };
  }
  // Past the permission check, so a hang here is the agent's silence and not a waiting prompt.
  if ('timedOut' in health) {
    return {
      state: 'agent',
      detail: `No answer from ${settings.agentUrl}. Is \`noacg caspar agent\` still running in a terminal?`,
    };
  }
  return {
    state: 'agent',
    detail: `Could not reach ${settings.agentUrl}. Run \`noacg caspar agent\` in a terminal on this machine, then test again.`,
  };
}

/** Send one request the agent forwards to CasparCG, with all four hops told apart. */
async function throughAgent(
  settings: CasparSettings,
  path: '/status' | '/play' | '/stop',
  extra: Record<string, unknown>,
): Promise<CasparResult> {
  if (!casparConfigured(settings)) {
    return { state: 'config', detail: 'Fill in the agent address, its token and the CasparCG host first.' };
  }
  const unreachable = await reachAgent(settings);
  if (unreachable) return unreachable;

  const reply = await callAgent(
    settings,
    path,
    { host: settings.host.trim(), port: settings.amcpPort, ...extra },
    AMCP_TIMEOUT_MS,
  );
  if ('timedOut' in reply) {
    return { state: 'server', detail: `${settings.host}:${settings.amcpPort} did not answer in time.` };
  }
  if ('networkError' in reply) {
    return { state: 'agent', detail: `The agent stopped answering: ${reply.networkError}` };
  }
  if (reply.http === 401) {
    return { state: 'token', detail: 'The agent is running but rejected this token. Re-copy it from the terminal.' };
  }
  if (reply.http === 403) {
    return {
      state: 'agent',
      detail: `The agent refused this site. Restart it with \`noacg caspar agent --origin ${window.location.origin}\`.`,
    };
  }
  if (!reply.body.ok) {
    // Two very different failures wear one flag here, and the operator's next move differs:
    // a STATUS line means CasparCG answered and refused (wrong layer, bad command), while no
    // status line means nothing on that address answered at all. `ECONNREFUSED 127.0.0.1:5250`
    // on its own is not a sentence anyone should have to read.
    if (reply.body.status) {
      return {
        state: 'server',
        detail: `CasparCG refused the command: ${reply.body.status}. Check the channel and layer.`,
        status: reply.body.status,
      };
    }
    const target = `${settings.host}:${settings.amcpPort}`;
    return {
      state: 'server',
      detail: reply.body.error
        ? `CasparCG did not answer on ${target} (${reply.body.error}). Is the server running, and is that its AMCP port?`
        : `CasparCG did not answer on ${target}. Is the server running, and is that its AMCP port?`,
    };
  }
  return { state: 'ok', detail: 'Connected.', version: reply.body.lines?.[0], status: reply.body.status };
}

/** The Test connection button: a real AMCP VERSION, round-tripped. */
export function testCasparConnection(settings: CasparSettings): Promise<CasparResult> {
  return throughAgent(settings, '/status', {});
}

/**
 * The whole live link: one PLAY of the production's own output URL. Every cue, take, update
 * and recovery after this flows through the durable command log the /output page already
 * follows - there is deliberately no per-take CG traffic (docs/CASPARCG_CONNECT.md §2).
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
export function airOnCaspar(settings: CasparSettings, outputUrl: string): Promise<CasparResult> {
  return throughAgent(settings, '/play', { channel: settings.channel, layer: settings.layer, url: outputUrl });
}

export function stopOnCaspar(settings: CasparSettings): Promise<CasparResult> {
  return throughAgent(settings, '/stop', { channel: settings.channel, layer: settings.layer });
}

/** `1-20` - what the operator sees on the button, and what CasparCG calls the layer. */
export function casparAddress(settings: CasparSettings): string {
  return `${settings.channel}-${settings.layer}`;
}
