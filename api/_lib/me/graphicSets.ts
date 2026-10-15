// POST /api/me/graphic-sets - the SET DOOR: several graphics into the caller's library as ONE
// idempotent operation (docs/AGENT_SAVE.md §10, migration 0093). `noacg save a b c` sends it.
//
// It is the save door (graphics.ts) for a list, in the same order of checks - principal,
// `graphics:create`, rate limits, a 4 MB read, `graphicSaveShape` on EVERY record before anything
// is written, the server's own ids and clock through `libraryRecord` - with two differences that
// are the point of it:
//
//   - ALL OR NOTHING. The records, their receipts and the operation's claim are written by one
//     database call (`agent_deliver_graphics`), which is one transaction: a failure part way
//     leaves nothing, and the same request can simply be sent again.
//   - SENDING IT AGAIN NEVER DUPLICATES. The operation id is required and is named by the client
//     BEFORE it writes (`x-noacg-operation`). The same operation with the same payload, from the
//     same credential, answers the first call's ids (200, `replayed: true`) and writes nothing - so
//     a timeout, a lost answer or a restarted agent can resend without asking first. A different
//     payload under that id, or another credential, is refused (409) and writes nothing.
//
// "The same payload" is the records as the server would store them, minus what the server mints
// (ids, timestamps): the same packages built again by the bridge hash the same. The template code
// is still never parsed or run here (graphicShape.ts says why).

import { apiError, json, methodGuard, readJson, sha256 } from '../http.js';
import { checkAgentSaveIpRateLimit, checkAgentSavePrincipalRateLimit } from '../rateLimit.js';
import { agentAccessConfigured, SetDoorUnavailable, supabaseAgentAccessStore, type AgentAccessStore } from '../agentAccessStore.js';
import { resolvePrincipal } from '../principal.js';
import { graphicSaveShape } from './graphicShape.js';
import { libraryRecord, MAX_SAVE_BODY_BYTES, type GraphicsDeps } from './graphics.js';
import { accountFor } from './deliveries.js';
import { buildReceipt, graphicLink, isUuid, type DeliveryReceipt } from './deliveryReceipt.js';
import { permits } from '../../../src/entitlements/permissions.js';
import type { GraphicDocBase } from '../../../src/model/graphicDoc.js';

/** At most this many graphics in one set: a pack's own cap (packageShape.ts), so any pack's
 *  graphics fit one set. The body cap is the save door's 4 MB for the whole set. */
export const MAX_SET_GRAPHICS = 40;

export interface SetResponse {
  operationId: string;
  /** True when this answer is the first call's, sent again: nothing new was written. */
  replayed: boolean;
  /** In the order they were sent. */
  graphics: Array<{ id: string; name: string; url: string }>;
  receipt: DeliveryReceipt;
}

/** JSON with every object's keys sorted, so equal content hashes equal whatever the key order. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map((v) => (v === undefined ? 'null' : canonicalJson(v))).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

/** What makes two sets "the same payload": the stored records without what the server mints. */
export function payloadHash(docs: GraphicDocBase[]): string {
  return sha256(canonicalJson(docs.map(({ id: _id, createdAt: _c, updatedAt: _u, ...content }) => content)));
}

const refusedSet = (reason: string): Response => apiError('invalid', `${reason} Nothing was saved.`, 400);

export function createGraphicSetsHandler(deps: GraphicsDeps = {}): { fetch(req: Request): Promise<Response> } {
  const configured = deps.configured ?? agentAccessConfigured;
  const now = deps.now ?? (() => new Date());
  const storeOf = (): AgentAccessStore => deps.store ?? supabaseAgentAccessStore();

  return {
    async fetch(req: Request): Promise<Response> {
      const guard = methodGuard(req, 'POST');
      if (guard) return guard;
      if (!configured()) {
        return apiError('unavailable', 'This NoaCG has no account backend, so there is no library to save into here.', 503);
      }
      const ip = checkAgentSaveIpRateLimit(req);
      if (ip) return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, { 'retry-after': String(ip.retryAfterSec) });

      try {
        const principal = await resolvePrincipal(req, { store: deps.store, configured });
        if (!principal.userId) {
          return apiError('unauthorized', 'Not signed in - run `noacg login`, or set NOACG_AGENT_KEY.', 401);
        }
        if (!permits(principal, 'graphics:create')) {
          return apiError('forbidden', 'This credential may not create graphics in the library.', 403);
        }
        const budget = checkAgentSavePrincipalRateLimit(principal.userId);
        if (budget) return apiError('rate_limited', 'Too many saves - slow down.', 429, {}, { 'retry-after': String(budget.retryAfterSec) });

        const operationId = req.headers.get('x-noacg-operation')?.trim().toLowerCase();
        if (!isUuid(operationId)) {
          return refusedSet('A set is sent under the operation id the client named before writing (`x-noacg-operation`, a uuid), so that sending it again cannot add a second copy.');
        }

        let body: unknown;
        try {
          body = await readJson<unknown>(req, MAX_SAVE_BODY_BYTES);
        } catch (e) {
          const tooLarge = (e as { code?: string }).code === 'too_large';
          return tooLarge
            ? apiError('too_large', `The set exceeds ${Math.round(MAX_SAVE_BODY_BYTES / 1e6)} MB - send fewer graphics at once, and keep inline assets small (a logo, not a video). Nothing was saved.`, 413)
            : refusedSet('The body must be JSON.');
        }
        const sent = (body && typeof body === 'object' ? (body as { graphics?: unknown }).graphics : undefined);
        if (!Array.isArray(sent) || sent.length < 1 || sent.length > MAX_SET_GRAPHICS) {
          return refusedSet(`\`graphics\` must be a list of 1 to ${MAX_SET_GRAPHICS} library records.`);
        }
        // Every record is checked before anything is written: one bad record refuses the set.
        const at = now().toISOString();
        const docs: GraphicDocBase[] = [];
        for (const [i, record] of sent.entries()) {
          const shaped = graphicSaveShape(record);
          if (!shaped.ok) {
            const name = (record as { name?: unknown } | null)?.name;
            return refusedSet(`Graphic ${i + 1}${typeof name === 'string' && name.trim() ? ` ("${name.trim().slice(0, 120)}")` : ''}: ${shaped.reason}`);
          }
          docs.push(libraryRecord(shaped.doc, at, deps.uuid?.()));
        }

        const store = storeOf();
        const keyId = principal.keyId ?? null;
        const accountLookup = accountFor(store, principal.userId);
        const delivered = await store.deliverGraphicSet({ userId: principal.userId, keyId, operationId, payloadHash: payloadHash(docs), docs });
        if (delivered.outcome === 'conflict') {
          return apiError(
            'conflict',
            `Operation ${operationId} already delivered different graphics, or was sent by another credential. Nothing was saved. Send new graphics under a new operation; \`noacg status ${operationId}\` shows the first delivery.`,
            409,
          );
        }
        const replayed = delivered.outcome === 'replayed';
        const origin = new URL(req.url).origin;
        // A replay answers what is there NOW: a graphic deleted since says so.
        const present = await Promise.all(
          delivered.ids.map((id) => (replayed ? store.resourcePresent(principal.userId!, 'graphic', id) : Promise.resolve(true))),
        );
        const receipt = buildReceipt({
          operationId,
          deployment: origin,
          account: await accountLookup,
          rows: delivered.ids.map((id, i) => ({ kind: 'graphic' as const, resourceId: id, state: 'saved' as const, productionId: null, present: present[i] })),
          verified: false,
          checkedAt: now().toISOString(),
        });
        const response: SetResponse = {
          operationId,
          replayed,
          graphics: delivered.ids.map((id, i) => ({ id, name: docs[i]?.name ?? '', url: graphicLink(origin, id) })),
          receipt,
        };
        return json(response, replayed ? 200 : 201);
      } catch (e) {
        // The code is here before its migration: answer as a deployment without the door, which a
        // CLI saving one graphic meets by using the single save door instead.
        if (e instanceof SetDoorUnavailable) {
          return apiError('not_found', 'This NoaCG cannot take a set of graphics in one delivery yet. Nothing was saved.', 404);
        }
        console.error('[agent-set]', e instanceof Error ? e.message : e);
        // Either all of it was saved or none of it; an answer lost after the commit cannot tell
        // which, and sending the same request again settles it without a second copy.
        return apiError('internal', 'The set could not be confirmed - send the same request again; it is never saved twice.', 500);
      }
    },
  };
}

export default createGraphicSetsHandler();
