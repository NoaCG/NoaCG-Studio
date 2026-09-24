// POST /api/me/packages - the PACKAGE DOOR: an external agent's CLI (`noacg pack --save`) puts a
// whole graphics package - several graphics, their playout layers and a prepared cue rundown -
// on the caller's Home, WAITING for them to press Install (docs/AGENT_SAVE.md §7).
//
// Nothing becomes a production here. The package is stored as it arrived, and the studio turns
// it into a production only when the user presses Install on Home → Productions - in their own
// session, through `installPack`, which re-validates every graphic through the export gate. So
// the credential needs no production permission: it rides `graphics:create`, the one the
// agent key already carries, and the consent card says "graphics and graphic packages".
//
// The order of the checks is the save door's (graphics.ts), and is the security posture:
//
//   1. resolvePrincipal   - a session JWT or a scoped agent key;
//   2. permits            - `graphics:create` on this credential AND the account's entitlement;
//   3. rate limits        - per IP and per principal (the save door's budget), before the body;
//   4. readJson 4 MB      - our own 413 under the platform's cap;
//   5. packageSaveShape   - PURE shape + size guard; the code inside is never run here;
//   6. waiting cap        - a user holds at most MAX_WAITING packages not yet installed;
//   7. INSERT             - the database mints the id; 201 { id, url }.

import { apiError, json, methodGuard, readJson } from '../http.js';
import { checkAgentSaveIpRateLimit, checkAgentSavePrincipalRateLimit } from '../rateLimit.js';
import { agentAccessConfigured, supabaseAgentAccessStore, type AgentAccessStore } from '../agentAccessStore.js';
import { resolvePrincipal, type PrincipalDeps } from '../principal.js';
import { packageSaveShape } from './packageShape.js';
import { MAX_SAVE_BODY_BYTES } from './graphics.js';
import { permits } from '../../../src/entitlements/permissions.js';

/** How many packages may wait on one account at once. Installing or dismissing one frees a
 *  slot; the cap only stops a runaway loop from filling somebody's Home. */
export const MAX_WAITING_PACKAGES = 25;

export interface PackagesDeps extends PrincipalDeps {
  store?: AgentAccessStore;
  configured?: () => boolean;
}

export interface PackageSaveResponse {
  id: string;
  /** Where the package waits: the Productions page of the user's Home. */
  url: string;
}

export function createPackagesHandler(deps: PackagesDeps = {}): { fetch(req: Request): Promise<Response> } {
  const configured = deps.configured ?? agentAccessConfigured;
  const storeOf = (): AgentAccessStore => deps.store ?? supabaseAgentAccessStore();

  return {
    async fetch(req: Request): Promise<Response> {
      const guard = methodGuard(req, 'POST');
      if (guard) return guard;
      if (!configured()) {
        return apiError('unavailable', 'This NoaCG has no account backend, so there is no Home to send a package to here.', 503);
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
            ? apiError('too_large', `The package exceeds ${Math.round(MAX_SAVE_BODY_BYTES / 1e6)} MB - inline assets must stay small (a logo, not a video).`, 413)
            : apiError('invalid', 'The body must be JSON.', 400);
        }
        const shaped = packageSaveShape(body);
        if (!shaped.ok) return apiError('invalid', shaped.reason, 400);

        const store = storeOf();
        if ((await store.countWaitingPackages(principal.userId)) >= MAX_WAITING_PACKAGES) {
          return apiError(
            'limit_exceeded',
            `${MAX_WAITING_PACKAGES} packages are already waiting on Home → Productions - install or dismiss some first.`,
            409,
          );
        }

        const version = (req.headers.get('x-noacg-cli-version') ?? '').slice(0, 40);
        const id = await store.insertPackage(principal.userId, {
          name: shaped.pack.name,
          description: shaped.pack.description,
          graphicCount: shaped.pack.graphics.length,
          origin: { tool: 'noacg-cli', ...(version ? { version } : {}) },
          body: shaped.pack,
        });

        const origin = new URL(req.url).origin;
        const response: PackageSaveResponse = { id, url: `${origin}/app#/home/productions` };
        return json(response, 201);
      } catch (e) {
        console.error('[agent-package]', e instanceof Error ? e.message : e);
        return apiError('internal', 'The package could not be saved - try again.', 500);
      }
    },
  };
}

export default createPackagesHandler();
