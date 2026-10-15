// /api/me/deliveries - READ BACK what an agent delivered, and SETTLE a waiting package
// (docs/AGENT_SAVE.md §9, migration 0092).
//
//   GET  ?id=<operation or resource uuid>      agent key or session -> 200 { receipt } | 404
//   POST { action: 'settle', package, production }   session only   -> 200 { settled: true } | 404
//
// THE READBACK IS NARROW BY CONSTRUCTION. An agent key finds only the receipts IT wrote
// (`key_id`), in its own account, by an id it was given when it wrote them; it learns each one's
// state and link and nothing about the rest of the library - no names, no content, no listing. Its
// authority is unchanged: a key that may create graphics may ask what became of the ones it
// created. A session (the studio) sees every receipt of its own account. Every miss is the same
// 404 - another account's id, another key's id and an id that never existed answer alike, so the
// route cannot be used to probe what exists.
//
// SETTLE is the studio's Install and Dismiss: the waiting row goes and its receipt records the
// outcome - with the production Install made - in one statement (`agent_package_settle`), so a
// package link keeps answering after the row is gone. Only a signed-in session may settle; an
// agent key cannot install or dismiss anything.
//
// `writeReceipt` is the doors' half: after a graphic or a package is INSERTed it records the
// delivery and returns the write's receipt. Recording is best effort - the resource is already in
// the account, and failing the save over its receipt would invite a duplicate retry - so a missed
// record is logged and the readback later answers 404 for it, which the CLI reports as unverified.

import { apiError, json, readJson } from '../http.js';
import { checkAgentDeliveriesRateLimit } from '../rateLimit.js';
import {
  agentAccessConfigured,
  supabaseAgentAccessStore,
  type AccountIdentity,
  type AgentAccessStore,
  type DeliveryKind,
  type RecordedDeliveryState,
} from '../agentAccessStore.js';
import { resolvePrincipal, type PrincipalDeps } from '../principal.js';
import { buildReceipt, isUuid, operationIdOf, type DeliveryReceipt } from './deliveryReceipt.js';
import type { Principal } from '../../../src/entitlements/permissions.js';

export interface DeliveriesDeps extends PrincipalDeps {
  store?: AgentAccessStore;
  configured?: () => boolean;
  now?: () => Date;
}

/** The account behind a user id; the id alone when the email lookup fails (never a failed save). */
export async function accountFor(store: AgentAccessStore, userId: string): Promise<AccountIdentity> {
  try {
    return await store.accountOf(userId);
  } catch (e) {
    console.error('[deliveries] account lookup', e instanceof Error ? e.message : e);
    return { id: userId, email: null };
  }
}

/** What a door's write is on arrival: a graphic is in the library, a package waits for Install. */
const ARRIVED: Record<DeliveryKind, RecordedDeliveryState> = { graphic: 'saved', package: 'pending_install' };

/** Record one delivered resource and answer the write's receipt (`verified: false`). The operation
 *  is the one the request named, the writer the principal's key. */
export async function writeReceipt(
  store: AgentAccessStore,
  req: Request,
  principal: Pick<Principal, 'keyId'> & { userId: string },
  kind: DeliveryKind,
  resourceId: string,
  at: Date,
): Promise<DeliveryReceipt> {
  const delivery = { operationId: operationIdOf(req), userId: principal.userId, keyId: principal.keyId ?? null, kind, resourceId, state: ARRIVED[kind] };
  const deployment = new URL(req.url).origin;
  const [account] = await Promise.all([
    accountFor(store, delivery.userId),
    store.recordDelivery(delivery).catch((e: unknown) => console.error('[deliveries] record', e instanceof Error ? e.message : e)),
  ]);
  return buildReceipt({
    operationId: delivery.operationId,
    deployment,
    account,
    rows: [{ kind: delivery.kind, resourceId: delivery.resourceId, state: delivery.state, productionId: null, present: true }],
    verified: false,
    checkedAt: at.toISOString(),
  });
}

const MAX_BODY_BYTES = 2_000;

export function createDeliveriesHandler(deps: DeliveriesDeps = {}): { fetch(req: Request): Promise<Response> } {
  const configured = deps.configured ?? agentAccessConfigured;
  const now = deps.now ?? (() => new Date());
  const storeOf = (): AgentAccessStore => deps.store ?? supabaseAgentAccessStore();

  async function readback(req: Request): Promise<Response> {
    const id = (new URL(req.url).searchParams.get('id') ?? '').trim().toLowerCase();
    if (!isUuid(id)) return apiError('invalid', '`id` must be the operation or resource id a save answered with.', 400);
    const principal = await resolvePrincipal(req, { store: deps.store, configured });
    const known = principal.kind === 'session' || (principal.kind === 'agent-key' && Boolean(principal.keyId));
    if (!principal.userId || !known) {
      return apiError('unauthorized', 'Not signed in - run `noacg login`, or set NOACG_AGENT_KEY.', 401);
    }
    const store = storeOf();
    // A key reads back only its own writes; null (a session) is the whole account's.
    const keyId = principal.kind === 'agent-key' ? principal.keyId! : null;
    const accountLookup = accountFor(store, principal.userId);
    const rows = await store.findDeliveries(principal.userId, id, keyId);
    if (!rows.length) {
      return apiError('not_found', 'Nothing delivered under this id by this credential, in this account.', 404);
    }
    // An id names one operation (all of its rows) or one resource (its row). Keep to one operation
    // AND one writer: the operation id is client-named, so two keys could share one, and a session
    // reading it back must not merge their unrelated writes into one receipt.
    const { operationId, keyId: writer } = rows[0];
    const own = rows.filter((r) => r.operationId === operationId && r.keyId === writer);
    const checked = await Promise.all(
      own.map(async (row) => ({ ...row, present: await store.resourcePresent(row.userId, row.kind, row.resourceId) })),
    );
    const receipt = buildReceipt({
      operationId,
      deployment: new URL(req.url).origin,
      account: await accountLookup,
      rows: checked,
      verified: true,
      checkedAt: now().toISOString(),
    });
    return json({ receipt });
  }

  async function settle(req: Request): Promise<Response> {
    const principal = await resolvePrincipal(req, { store: deps.store, configured });
    if (principal.kind === 'agent-key') return apiError('forbidden', 'Only the studio can install or dismiss a package.', 403);
    if (principal.kind !== 'session' || !principal.userId) return apiError('unauthorized', 'Sign in to install a package.', 401);
    let body: unknown;
    try {
      body = await readJson<unknown>(req, MAX_BODY_BYTES);
    } catch {
      return apiError('invalid', 'The body must be JSON.', 400);
    }
    const record = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
    if (record.action !== 'settle') return apiError('invalid', '`action` must be "settle".', 400);
    if (!isUuid(record.package)) return apiError('invalid', '`package` must be the waiting package id.', 400);
    const production = record.production ?? null;
    if (production !== null && !isUuid(production)) return apiError('invalid', '`production` must be a production id or null.', 400);
    const settled = await storeOf().settlePackage(principal.userId, record.package.toLowerCase(), production ? production.toLowerCase() : null);
    return settled ? json({ settled: true }) : apiError('not_found', 'That package is no longer waiting.', 404);
  }

  return {
    async fetch(req: Request): Promise<Response> {
      if (!configured()) {
        return apiError('unavailable', 'This NoaCG has no account backend, so there are no deliveries here.', 503);
      }
      const refused = checkAgentDeliveriesRateLimit(req);
      if (refused) {
        return apiError('rate_limited', 'Too many requests - slow down.', 429, {}, { 'retry-after': String(refused.retryAfterSec) });
      }
      try {
        if (req.method === 'GET') return await readback(req);
        if (req.method === 'POST') return await settle(req);
        return apiError('invalid', `${req.method} not allowed`, 405);
      } catch (e) {
        console.error('[deliveries]', e instanceof Error ? e.message : e);
        return apiError('internal', 'The delivery could not be checked - try again.', 500);
      }
    },
  };
}

export default createDeliveriesHandler();
