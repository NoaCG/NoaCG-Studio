// The OGraf adapter: the playout protocol's verbs over the EBU OGraf Server API.
//
// Every route and body is the standard's, from the pinned OpenAPI (ebu/ograf at
// c821671195a077be13bbb96989d4220eea157b99, v1/specification/open-api/server-api.yaml, which
// `main` still matched on 2026-09-26). The standard has NO upload route, so this adapter plays
// only what is already on the server; a vendor's private upload endpoint is not the standard and
// is not used here.
//
// The Bridge stays stateless. A take replaces whatever is on the render target (clear, load,
// play), the way a CasparCG take replaces its layer, and every later verb asks the target which
// graphic instance it holds instead of remembering an id: a Bridge restart, or a second
// controller, cannot strand an instance.
//
// Honest results. A 200 is the server saying the graphic ACCEPTED the call, not that its
// animation finished. A command that was sent and got no clear answer back - a timeout, a
// dropped connection, a 200 that does not say what the graphic did - is reported as `uncertain`
// and never retried: the server may have acted on it, and it has none of NoaCG's recovery.

import type {
  AgentError,
  OgrafSlot,
  OgrafTarget,
  PlayoutAction,
  PlayoutRenderer,
  RenderTargetId,
  Slot,
} from '../protocol.js';
import { UsageError } from '../../output.js';
import type { AdapterResult, PlayoutAdapter } from './casparcg.js';

/** The standard's own prefix, appended to a base URL that does not already end in it. */
export const OGRAF_API_PATH = '/ograf/v1';
/** The time ONE verb may take, all its requests together. A take is three requests, and the
 *  page stops waiting for `/act` after 9 s (src/control/playoutLink.ts), so the Bridge must have
 *  its answer - even an uncertain one - before then; a list and its renderers stay inside the
 *  page's 16 s the same way. */
export const OGRAF_TIMEOUT_MS = 7_000;

/** The API root for a target's base URL, or a UsageError naming what is wrong with it. */
export function ografApiBase(baseUrl: string): string {
  let url: URL;
  try {
    url = new URL(baseUrl.trim());
  } catch {
    throw new UsageError(`"${baseUrl}" is not a URL. Give the OGraf server's address, e.g. http://192.168.1.20:8080.`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new UsageError('An OGraf server is reached over http or https.');
  // The standard has no authentication, and a password in a URL would land in every log line.
  if (url.username || url.password) throw new UsageError('Leave the user name and password out of the OGraf server URL.');
  if (url.search || url.hash) throw new UsageError('The OGraf server URL takes no query or fragment.');
  const path = url.pathname.replace(/\/+$/, '');
  return `${url.origin}${path.endsWith(OGRAF_API_PATH) ? path : `${path}${OGRAF_API_PATH}`}`;
}

/** One HTTP request to the Server API, relative to its root. Exported so tests pin each verb. */
export interface OgrafRequest {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: unknown;
}

function ografSlot(slot: Slot): OgrafSlot {
  if (slot.adapter !== 'ograf') throw new UsageError('An OGraf command needs an ograf slot.');
  // `.` and `..` would survive escaping and be folded away by URL parsing, reaching a route the
  // standard does not have.
  if (slot.rendererId === '.' || slot.rendererId === '..') throw new UsageError(`"${slot.rendererId}" is not a renderer id.`);
  return slot;
}

const instancePath = (slot: OgrafSlot, route: string) =>
  `/renderers/${encodeURIComponent(slot.rendererId)}/target/graphicInstance/${route}`;

/** Which graphic instances a render target holds: the identifier travels JSON-stringified. */
export function targetInfoRequest(slot: OgrafSlot): OgrafRequest {
  const query = encodeURIComponent(JSON.stringify(slot.renderTarget));
  return { method: 'GET', path: `/renderers/${encodeURIComponent(slot.rendererId)}/target?renderTarget=${query}` };
}

/** Everything on one render target, gone at once. */
export function clearRequest(slot: OgrafSlot): OgrafRequest {
  return { method: 'PUT', path: instancePath(slot, 'clear'), body: { filters: [{ renderTarget: slot.renderTarget }] } };
}

/** A graphic onto a render target, with the take's field values for its load(). */
export function loadRequest(slot: OgrafSlot, graphicId: string, data: Record<string, string> = {}): OgrafRequest {
  return { method: 'POST', path: instancePath(slot, 'load'), body: { renderTarget: slot.renderTarget, graphicId, params: { data } } };
}

/** The call a verb makes on one loaded graphic instance. A take's first play sends no params,
 *  so the graphic starts from its own first step; `next` advances one. */
export function instanceRequest(action: PlayoutAction, graphicInstanceId: string): OgrafRequest {
  const slot = ografSlot(action.slot);
  const call = (route: string, params: Record<string, unknown>): OgrafRequest => ({
    method: 'POST',
    path: instancePath(slot, route),
    body: { renderTarget: slot.renderTarget, graphicInstanceId, params },
  });
  switch (action.verb) {
    case 'take':
      return call('playAction', {});
    case 'update':
      return call('updateAction', { data: action.data });
    case 'next':
      return call('playAction', { delta: 1 });
    case 'out':
      return call('stopAction', {});
    default:
      throw new UsageError(`An OGraf server has no "${action.verb}".`);
  }
}

// --- The wire ---------------------------------------------------------------------------------

type Reply = { ok: true; status: number; body: unknown } | { ok: false; error: AgentError };

/** What is left of one verb's time: every request it makes shares it. */
interface Budget {
  until: number;
  ms: number;
}

/** Errors that mean the request never reached the server, so nothing can have happened. */
const NOT_SENT = new Set(['ECONNREFUSED', 'ENOTFOUND', 'EAI_AGAIN', 'EHOSTUNREACH', 'ENETUNREACH', 'EADDRNOTAVAIL']);

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === 'object' && !Array.isArray(v);
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

function errorCode(e: unknown): string | undefined {
  const cause = isRecord(e) ? (e as { cause?: unknown }).cause : undefined;
  return isRecord(cause) && typeof cause.code === 'string' ? cause.code : undefined;
}

/** A request that CHANGES something (`act`) reads a lost answer as uncertain; a read reads it
 *  as the server not answering. */
async function call(api: string, req: OgrafRequest, budget: Budget, act: boolean): Promise<Reply> {
  const label = `${req.method} ${req.path.split('?')[0]}`;
  let res: Response;
  let text: string;
  try {
    res = await fetch(`${api}${req.path}`, {
      method: req.method,
      headers: req.body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: req.body === undefined ? undefined : JSON.stringify(req.body),
      // A redirect is no part of the API, and following one would send the command elsewhere.
      // It is answered below as the refusal it is.
      redirect: 'manual',
      signal: AbortSignal.timeout(Math.max(1, budget.until - Date.now())),
    });
    text = await res.text();
  } catch (e) {
    const code = errorCode(e);
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    const why = timedOut ? `no answer within ${budget.ms} ms` : code ?? (e instanceof Error ? e.message : String(e));
    if (act && !(code && NOT_SENT.has(code))) {
      return {
        ok: false,
        error: {
          hop: 'target',
          code: 'uncertain',
          detail: `The OGraf server at ${api} was sent ${label} and gave no clear answer (${why}). It may have acted on it: look at the output before repeating it.`,
        },
      };
    }
    return { ok: false, error: { hop: 'target', code: 'unreachable', detail: `The OGraf server did not answer at ${api} (${why}). Is it running, and is that its address?` } };
  }
  let body: unknown;
  try {
    body = text.trim() ? JSON.parse(text) : undefined;
  } catch {
    body = undefined;
  }
  if (res.ok) return { ok: true, status: res.status, body };
  // The standard's errors are RFC 7807 problem details: a title and a detail.
  const problem = isRecord(body) ? [str(body.title), str(body.detail)].filter(Boolean).join(': ') : '';
  const raw = `${res.status}${problem ? ` ${problem}` : ''}`;
  if (act && (res.status === 502 || res.status === 504)) {
    return { ok: false, error: { hop: 'target', code: 'uncertain', detail: `A gateway in front of the OGraf server answered ${label} with ${res.status}; the server may still have acted on it.`, raw } };
  }
  if (res.status === 404) return { ok: false, error: { hop: 'target', code: 'not-found', detail: `The OGraf server has no such thing: ${label} answered ${raw}.`, raw } };
  if (res.status === 550) return { ok: false, error: { hop: 'target', code: 'refused', detail: `The graphic itself failed ${label}: ${problem || 'no reason given'}.`, raw } };
  return { ok: false, error: { hop: 'target', code: 'refused', detail: `The OGraf server refused ${label}: ${raw}.`, raw } };
}

/** An instance call's 200 carries what the GRAPHIC answered. Without it the result is unknown;
 *  with a non-2xx code the graphic refused. */
function graphicAnswer(reply: { body: unknown }, route: string): { ok: true; raw: string } | { ok: false; error: AgentError } {
  const body = isRecord(reply.body) ? reply.body : {};
  const code = typeof body.statusCode === 'number' ? body.statusCode : undefined;
  const message = str(body.statusMessage);
  const raw = `${route} ${code ?? '?'}${message ? ` ${message}` : ''}`;
  if (code === undefined) {
    return { ok: false, error: { hop: 'target', code: 'uncertain', detail: `The OGraf server accepted ${route} but did not say what the graphic did. Look at the output.`, raw } };
  }
  if (code < 200 || code >= 300) {
    return { ok: false, error: { hop: 'target', code: 'refused', detail: `The graphic refused ${route}: ${code}${message ? ` ${message}` : ''}.`, raw } };
  }
  return { ok: true, raw };
}

function renderTargetOf(v: unknown): RenderTargetId | undefined {
  if (!isRecord(v)) return undefined;
  const out: RenderTargetId = {};
  for (const [k, val] of Object.entries(v)) {
    if (typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return undefined;
    out[k] = val;
  }
  return out;
}

const notOgraf = (api: string, route: string): AgentError => ({
  hop: 'target',
  code: 'refused',
  detail: `${api} answered ${route}, but not the way an OGraf server does. Is that the Server API's address?`,
});

// --- The adapter ------------------------------------------------------------------------------

export function createOgrafAdapter(options: { timeoutMs?: number } = {}): PlayoutAdapter<OgrafTarget> {
  const timeoutMs = options.timeoutMs ?? OGRAF_TIMEOUT_MS;
  const start = (): Budget => ({ until: Date.now() + timeoutMs, ms: timeoutMs });
  const usage = (e: unknown): { ok: false; error: AgentError } => {
    if (e instanceof UsageError) return { ok: false, error: { hop: 'agent', code: 'usage', detail: e.message } };
    throw e;
  };
  /** The target's API root, or the usage error its URL earns. */
  const apiOf = (target: OgrafTarget): { api: string } | { ok: false; error: AgentError } => {
    try {
      return { api: ografApiBase(target.baseUrl) };
    } catch (e) {
      return usage(e);
    }
  };

  /** The graphic instances on the action's render target, whichever graphic they are: like a
   *  CasparCG layer, the slot is what the verb addresses. */
  async function instancesOn(api: string, slot: OgrafSlot, budget: Budget): Promise<AdapterResult<string[]>> {
    const r = await call(api, targetInfoRequest(slot), budget, false);
    if (!r.ok) return r;
    const list = isRecord(r.body) && Array.isArray(r.body.graphicInstances) ? r.body.graphicInstances : undefined;
    if (!list) return { ok: false, error: notOgraf(api, 'the render target') };
    const ids = list
      .filter(isRecord)
      .map((i) => str(i.graphicInstanceId))
      .filter((id): id is string => Boolean(id));
    return { ok: true, value: ids, raw: `target ${r.status} (${ids.length} loaded)` };
  }

  /** One instance call, read to the graphic's own answer. */
  async function instanceCall(api: string, req: OgrafRequest, route: string, budget: Budget): Promise<AdapterResult<null>> {
    const r = await call(api, req, budget, true);
    if (!r.ok) return r;
    const answer = graphicAnswer(r, route);
    return answer.ok ? { ok: true, value: null, raw: answer.raw } : answer;
  }

  return {
    id: 'ograf',

    // No target capabilities: the Server API has nothing like CasparCG's INFO to read a clip's
    // position from, so `/state` refuses an OGraf target and the page offers no clock for it.
    capabilities() {
      return { lists: ['template'], thumbnails: false, verbs: ['take', 'update', 'next', 'out', 'clear'], target: [] };
    },

    async status(target) {
      const root = apiOf(target);
      if (!('api' in root)) return root;
      const { api } = root;
      const r = await call(api, { method: 'GET', path: '/' }, start(), false);
      if (!r.ok) return r;
      if (!isRecord(r.body) || !str(r.body.name)) return { ok: false, error: notOgraf(api, 'GET /') };
      const version = [str(r.body.name), str(r.body.version)].filter(Boolean).join(' ');
      return { ok: true, value: { version }, raw: `${r.status}` };
    },

    async list(target, kind) {
      if (kind !== 'template') {
        return { ok: false, error: { hop: 'agent', code: 'unsupported', detail: 'An OGraf server lists graphics only; ask for kind "template".' } };
      }
      const root = apiOf(target);
      if (!('api' in root)) return root;
      const { api } = root;
      const r = await call(api, { method: 'GET', path: '/graphics' }, start(), false);
      if (!r.ok) return r;
      const graphics = isRecord(r.body) && Array.isArray(r.body.graphics) ? r.body.graphics : undefined;
      if (!graphics) return { ok: false, error: notOgraf(api, 'GET /graphics') };
      const items = graphics
        .filter(isRecord)
        .filter((g) => str(g.id))
        .map((g) => ({ name: g.id as string, kind: 'graphic', ...(str(g.name) ? { label: g.name as string } : {}) }));
      return { ok: true, value: items, raw: `${r.status}` };
    },

    async renderers(target) {
      const root = apiOf(target);
      if (!('api' in root)) return root;
      const { api } = root;
      const budget = start();
      const r = await call(api, { method: 'GET', path: '/renderers' }, budget, false);
      if (!r.ok) return r;
      const listed = isRecord(r.body) && Array.isArray(r.body.renderers) ? r.body.renderers : undefined;
      if (!listed) return { ok: false, error: notOgraf(api, 'GET /renderers') };
      const renderers: PlayoutRenderer[] = [];
      for (const entry of listed.filter(isRecord)) {
        const id = str(entry.id);
        if (!id || id === '.' || id === '..') continue;
        const renderer: PlayoutRenderer = { id, name: str(entry.name) ?? id, ...(str(entry.description) ? { description: entry.description as string } : {}) };
        // The list names a renderer; only its own record says what a render target looks like
        // and which ones it has. A renderer that left between the two calls keeps its name.
        const d = await call(api, { method: 'GET', path: `/renderers/${encodeURIComponent(id)}` }, budget, false);
        const info = d.ok && isRecord(d.body) && isRecord(d.body.renderer) ? d.body.renderer : undefined;
        if (info) {
          if (isRecord(info.renderTargetSchema)) renderer.renderTargetSchema = info.renderTargetSchema;
          if (Array.isArray(info.renderTargets)) {
            renderer.targets = info.renderTargets.filter(isRecord).flatMap((t) => {
              const renderTarget = renderTargetOf(t.renderTarget);
              if (!renderTarget) return [];
              return [{ renderTarget, name: str(t.name) ?? JSON.stringify(renderTarget), ...(str(t.description) ? { description: t.description as string } : {}) }];
            });
          }
        }
        renderers.push(renderer);
      }
      return { ok: true, value: renderers, raw: `${r.status}` };
    },

    async thumbnail() {
      return { ok: false, error: { hop: 'agent', code: 'unsupported', detail: 'The OGraf adapter does not fetch thumbnails yet.' } };
    },

    async act(target, action) {
      // A field this adapter cannot honour is refused before anything is sent, with the hop named,
      // never dropped: taking the graphic without it would air something the cue did not ask for
      // (docs/CLIP_PLAYBACK_PLAN.md §6.9). The Server API has no fades, levels or sequences.
      const unhonoured =
        action.verb === 'sequence'
          ? 'a sequence'
          : action.verb === 'ending'
            ? "a change to a clip's ending"
            : action.verb === 'take' && action.playback
              ? "a clip's playback (its ending, fades, level or trim)"
              : action.verb === 'out' && action.fadeOut !== undefined
                ? 'a fade out'
                : '';
      if (unhonoured) {
        return { ok: false, error: { hop: 'agent', code: 'unsupported', detail: `The OGraf adapter cannot play ${unhonoured}, so nothing was sent.` } };
      }
      const root = apiOf(target);
      if (!('api' in root)) return root;
      const { api } = root;
      let slot: OgrafSlot;
      try {
        slot = ografSlot(action.slot);
        if (action.verb === 'take' && action.item.kind !== 'template') {
          throw new UsageError(`An OGraf server plays graphics; it cannot take an item of kind "${action.item.kind}".`);
        }
        if (action.verb === 'pause' || action.verb === 'resume') throw new UsageError(`An OGraf server has no "${action.verb}".`);
      } catch (e) {
        return usage(e);
      }
      const budget = start();

      if (action.verb === 'clear') {
        const r = await call(api, clearRequest(slot), budget, true);
        if (!r.ok) return r;
        const cleared = isRecord(r.body) && Array.isArray(r.body.graphicInstances) ? r.body.graphicInstances.length : 0;
        return { ok: true, value: {}, raw: `clear ${r.status} (${cleared} cleared)` };
      }

      if (action.verb === 'take') {
        // Replace, then load, then play - and stop at the first step that does not go through,
        // saying what state it leaves behind. Nothing is retried.
        const cleared = await call(api, clearRequest(slot), budget, true);
        if (!cleared.ok) return cleared;
        const gone = (error: AgentError): { ok: false; error: AgentError } => ({
          ok: false,
          error: { ...error, detail: `The render target was cleared first, so what was on it is gone. ${error.detail}` },
        });
        const loaded = await call(api, loadRequest(slot, action.item.name, action.data), budget, true);
        if (!loaded.ok) return gone(loaded.error);
        const answer = graphicAnswer(loaded, 'load');
        if (!answer.ok) return gone(answer.error);
        const instanceId = isRecord(loaded.body) ? str(loaded.body.graphicInstanceId) : undefined;
        if (!instanceId) {
          return { ok: false, error: { hop: 'target', code: 'uncertain', detail: `The OGraf server loaded "${action.item.name}" but named no graphic instance, so it could not be played.`, raw: answer.raw } };
        }
        const played = await instanceCall(api, instanceRequest(action, instanceId), 'playAction', budget);
        if (!played.ok) {
          return { ok: false, error: { ...played.error, detail: `"${action.item.name}" is loaded (${instanceId}) but did not play: ${played.error.detail}` } };
        }
        return { ok: true, value: {}, raw: `${answer.raw} (${instanceId}); ${played.raw}` };
      }

      // update, next and out act on what the render target holds now.
      const found = await instancesOn(api, slot, budget);
      if (!found.ok) return found;
      if (found.value.length === 0) {
        // Out's purpose is already met; update and next have nothing to act on.
        if (action.verb === 'out') return { ok: true, value: {}, raw: `${found.raw}; nothing to stop` };
        return { ok: false, error: { hop: 'target', code: 'not-found', detail: `Nothing is loaded on that render target of renderer "${slot.rendererId}". Take the graphic first.`, raw: found.raw } };
      }
      const route = action.verb === 'update' ? 'updateAction' : action.verb === 'next' ? 'playAction' : 'stopAction';
      const raws = [found.raw];
      for (const id of found.value) {
        const r = await instanceCall(api, instanceRequest(action, id), route, budget);
        if (!r.ok) return r;
        raws.push(r.raw);
      }
      return { ok: true, value: {}, raw: raws.join('; ') };
    },
  };
}

export const ografAdapter = createOgrafAdapter();
