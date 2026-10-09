// POST /api/me/community-packs - the AGENT'S SHARE DOOR (docs/work-specs/community-packs/spec.md
// AC-12, docs/AGENT_SAVE.md §8): `noacg pack … --save --share` sends a pack for review to
// Community packs as the user its agent key belongs to, only when the user asked for it.
//
// It rides `graphics:create`, the scope the key already carries (owner, #797): sharing happens
// only on the user's explicit request, a NoaCG admin reviews every pack before anyone sees it, and
// the maker withdraws it at once under Your packs. A separate scope would put a sharing line on
// every CLI login's consent page.
//
// An agent key is not a session, so the database's session function cannot be called with one.
// The store calls `community_pack_submit_for(p_uid, …)` (migration 0087) with the service role,
// the one function that also serves the shelf's sheet, so every refusal - suspension, the
// `community.publish` switch, sizes, no cues, ten waiting packs - is the same for both doors and
// comes back here as a 409 carrying the database's own sentence.
//
// The order is the package door's (packages.ts):
//
//   1. resolvePrincipal   - a session JWT or a scoped agent key;
//   2. permits            - `graphics:create` on this credential AND the account's entitlement;
//   3. rate limits        - per IP and per principal (the save door's budget), before the body;
//   4. readJson 4 MB      - our own 413 under the platform's cap;
//   5. shape              - the words, the licence the user accepted, and a `noacg-pack` with no
//                           cues; the code inside is never run here;
//   6. the submit gate    - 201 { id, state: "in_review" }, or 409 with its refusal.

import { apiError, json, methodGuard, readJson } from '../http.js';
import { checkAgentSaveIpRateLimit, checkAgentSavePrincipalRateLimit } from '../rateLimit.js';
import {
  agentAccessConfigured,
  CommunityPackRefusal,
  supabaseAgentAccessStore,
  type AgentAccessStore,
} from '../agentAccessStore.js';
import { resolvePrincipal, type PrincipalDeps } from '../principal.js';
import { packageSaveShape } from './packageShape.js';
import { MAX_SAVE_BODY_BYTES } from './graphics.js';
import { permits } from '../../../src/entitlements/permissions.js';

/** The one licence a community pack is shared under, as the request names it. */
export const COMMUNITY_LICENSE = 'cc-by-4.0';

export interface CommunityPacksDeps extends PrincipalDeps {
  store?: AgentAccessStore;
  configured?: () => boolean;
}

export interface CommunityPackShareResponse {
  id: string;
  state: 'in_review';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

type Shaped = { ok: true; name: string; description: string; author: string; pack: unknown } | { ok: false; reason: string };

/** The request's words, the licence and the pack, or the reason it is not one. Pure. */
export function communityShareShape(body: unknown): Shaped {
  if (!isRecord(body)) return { ok: false, reason: 'The body must be a JSON object.' };
  if (text(body.license).toLowerCase() !== COMMUNITY_LICENSE) {
    return { ok: false, reason: `Sharing needs the user's licence: "license": "${COMMUNITY_LICENSE}".` };
  }
  const name = text(body.name);
  const description = text(body.description);
  const author = text(body.author);
  if (!name || name.length > 80) return { ok: false, reason: '`name` must be 1-80 characters.' };
  if (!description || description.length > 200) return { ok: false, reason: '`description` must be 1-200 characters.' };
  if (!author || author.length > 60) return { ok: false, reason: '`author`, the name the pack is shown under, must be 1-60 characters.' };
  const shaped = packageSaveShape(body.pack);
  if (!shaped.ok) return shaped;
  if (shaped.pack.cues?.length || shaped.pack.graphics.some((g) => g.cues?.length)) {
    return { ok: false, reason: 'A community pack carries graphics only, with no cues.' };
  }
  return { ok: true, name, description, author, pack: { ...shaped.pack, name, description } };
}

export function createCommunityPacksHandler(deps: CommunityPacksDeps = {}): { fetch(req: Request): Promise<Response> } {
  const configured = deps.configured ?? agentAccessConfigured;
  const storeOf = (): AgentAccessStore => deps.store ?? supabaseAgentAccessStore();

  return {
    async fetch(req: Request): Promise<Response> {
      const guard = methodGuard(req, 'POST');
      if (guard) return guard;
      if (!configured()) {
        return apiError('unavailable', 'This NoaCG has no account backend, so there are no Community packs to share to here.', 503);
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
        // The save doors' budget: a share is one more thing the same key sends.
        if (budget) return apiError('rate_limited', 'Too many requests from this key - slow down.', 429, {}, { 'retry-after': String(budget.retryAfterSec) });

        let body: unknown;
        try {
          body = await readJson<unknown>(req, MAX_SAVE_BODY_BYTES);
        } catch (e) {
          const tooLarge = (e as { code?: string }).code === 'too_large';
          return tooLarge
            ? apiError('too_large', `A pack shared from the CLI is at most ${Math.round(MAX_SAVE_BODY_BYTES / 1e6)} MB - share a larger one from the studio's Community packs shelf.`, 413)
            : apiError('invalid', 'The body must be JSON.', 400);
        }
        const shaped = communityShareShape(body);
        if (!shaped.ok) return apiError('invalid', shaped.reason, 400);

        try {
          const id = await storeOf().submitCommunityPack(principal.userId, {
            name: shaped.name,
            description: shaped.description,
            author: shaped.author,
            pack: shaped.pack,
          });
          const response: CommunityPackShareResponse = { id, state: 'in_review' };
          return json(response, 201);
        } catch (e) {
          if (e instanceof CommunityPackRefusal) return apiError('limit_exceeded', e.message, 409);
          throw e;
        }
      } catch (e) {
        console.error('[agent-community-pack]', e instanceof Error ? e.message : e);
        return apiError('internal', 'The pack could not be sent for review - try again.', 500);
      }
    },
  };
}

export default createCommunityPacksHandler();
