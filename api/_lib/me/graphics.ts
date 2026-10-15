// POST /api/me/graphics - the SAVE DOOR: an external agent's CLI puts ONE graphic into the
// caller's library (docs/AGENT_SAVE.md, docs/AGENT_CLI.md).
//
// The order of the checks is the security posture, so it is written out:
//
//   1. resolvePrincipal   - a session JWT or a scoped agent key (api/_lib/principal.ts);
//   2. permits            - `graphics:create` on THIS credential AND the account's entitlement
//                           (src/entitlements/permissions.ts) - a revoked key, a suspended
//                           account and the instance-wide switch all stop here;
//   3. rate limits        - per IP and per principal, before a byte of body is read;
//   4. readJson 4 MB      - our own 413 under the platform's ~4.5 MB cap;
//   5. graphicSaveShape   - PURE shape + size guard; the template CODE is never parsed,
//                           evaluated or validated here (graphicShape.ts says why);
//   6. newGraphicDoc      - the server re-stamps what a server must own: a SERVER uuid (a
//                           client id on a service-role write could overwrite another user's
//                           row), the server clock (LWW reads body.updatedAt - never a client
//                           clock), the origin;
//   7. INSERT             - never upsert; 201 { id, url, receipt } - the receipt (deliveries.ts)
//                           names the deployment, the account and the operation, and records the
//                           delivery so the key can read its state back later.
//
// The function never executes the graphic and stores no "validated" claim: the app re-gates
// with publishGate when the graphic is opened, published or exported (docs/AGENT_SAVE.md).

import { apiError, json, methodGuard, readJson } from '../http.js';
import { checkAgentSaveIpRateLimit, checkAgentSavePrincipalRateLimit } from '../rateLimit.js';
import { agentAccessConfigured, supabaseAgentAccessStore, type AgentAccessStore } from '../agentAccessStore.js';
import { resolvePrincipal, type PrincipalDeps } from '../principal.js';
import { graphicSaveShape } from './graphicShape.js';
import { writeReceipt } from './deliveries.js';
import { graphicLink, type DeliveryReceipt } from './deliveryReceipt.js';
import { newGraphicDoc, type GraphicDocBase } from '../../../src/model/graphicDoc.js';
import { permits } from '../../../src/entitlements/permissions.js';

/** Our own cap, under the platform's. The shape limits (graphicShape.ts) sum to less than this
 *  so a body that clears the read cannot then fail on a limit the caller cannot see. */
export const MAX_SAVE_BODY_BYTES = 4_000_000;

export interface GraphicsDeps extends PrincipalDeps {
  store?: AgentAccessStore;
  configured?: () => boolean;
  now?: () => Date;
  /** The record id the server mints; the real one uses crypto.randomUUID through newGraphicDoc. */
  uuid?: () => string;
}

export interface SaveResponse {
  id: string;
  url: string;
  /** Additive (receipt v1): older clients read `id` and `url` and ignore it. */
  receipt: DeliveryReceipt;
}

/** The record the server stores for a shaped one: re-minted through the ONE builder every writer
 *  uses, so a record saved from a terminal is byte-for-byte the shape the studio itself would have
 *  saved - with the server's id, the server's clock, and an origin the record cannot forge. The
 *  set door (graphicSets.ts) stores exactly this too. */
export function libraryRecord(sent: GraphicDocBase, at: string, id?: string): GraphicDocBase {
  return newGraphicDoc(sent.template, {
    name: sent.name,
    id,
    now: at,
    baseline: sent.baseline,
    entries: sent.entries,
    activeEntryId: sent.activeEntryId,
    folder: sent.folder,
    origin: { tool: sent.origin?.tool ?? 'noacg-cli', ...(sent.origin?.version ? { version: sent.origin.version } : {}) },
  });
}

export function createGraphicsHandler(deps: GraphicsDeps = {}): { fetch(req: Request): Promise<Response> } {
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

        let body: unknown;
        try {
          body = await readJson<unknown>(req, MAX_SAVE_BODY_BYTES);
        } catch (e) {
          const tooLarge = (e as { code?: string }).code === 'too_large';
          return tooLarge
            ? apiError('too_large', `The graphic exceeds ${Math.round(MAX_SAVE_BODY_BYTES / 1e6)} MB - inline assets must stay small (a logo, not a video).`, 413)
            : apiError('invalid', 'The body must be JSON.', 400);
        }
        const shaped = graphicSaveShape(body);
        if (!shaped.ok) return apiError('invalid', shaped.reason, 400);

        const doc = libraryRecord(shaped.doc, now().toISOString(), deps.uuid?.());
        const store = storeOf();
        await store.insertGraphic(principal.userId, doc);

        const origin = new URL(req.url).origin;
        const receipt = await writeReceipt(store, req, { userId: principal.userId, keyId: principal.keyId }, 'graphic', doc.id, now());
        const response: SaveResponse = { id: doc.id, url: graphicLink(origin, doc.id), receipt };
        return json(response, 201);
      } catch (e) {
        console.error('[agent-save]', e instanceof Error ? e.message : e);
        return apiError('internal', 'The graphic could not be saved - try again.', 500);
      }
    },
  };
}

export default createGraphicsHandler();
