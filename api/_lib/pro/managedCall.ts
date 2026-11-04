// What binds a MANAGED NoaCG Pro model call to its allowance.
//
// The generic proxy (api/ai/generate.ts) is where Pro's money is actually spent, because the
// pipeline that decides what to ask for runs in the browser. So the proxy is where the
// reservation has to be checked - anywhere else and `surface: 'pro'` would remain what its own
// comment admits it is today: a client-supplied label that gates an entitlement and nothing
// else. With this, a Pro call on NoaCG's key costs a reservation, the reservation costs a
// quota, and the quota is decided in the database.
//
// BYO IS UNTOUCHED. A caller spending their own key on their own chosen model is not ours to
// meter, the same line the disabled-route switch and the surface routing policy already draw.

import { GatewayError, usageCostUsd } from '../aiGateway.js';
import { serverAuthConfigured } from '../auth.js';
import { getLiteGenerationStore, liteLedgerConfigured } from '../aiLiteStore.js';
import { proCapacityRetryPlan, proProfile, proRouteFunded, type ProProfile } from '../aiProProfile.js';
import type { AiGatewayRequestBody, ModelResult } from '../../../src/ai/modelTypes.js';

/**
 * Is a Pro allowance ENFORCEABLE on this deployment at all?
 *
 * It needs an accounts backend (to know whose allowance) and the ledger (to hold it). A
 * self-hosted instance with a gateway key and no Supabase has neither, and there is nothing
 * for a reservation requirement to buy there - only every managed Pro call refused, on a box
 * whose operator owns the key and the bill. So that deployment is left exactly as it was:
 * the entitlement gate, the burst limiter, the disabled-route switch, and nothing new.
 *
 * Where the ledger DOES exist, the requirement binds whether or not hosted Pro is switched
 * on, and `admitManagedProCall` refuses an unenabled profile rather than serving it. That
 * asymmetry is the point: on a deployment that can meter Pro spend, unmetered Pro spend on
 * the managed key is the open tap this whole route exists to close.
 */
export function proAllowanceEnforceable(): boolean {
  return serverAuthConfigured() && liteLedgerConfigured();
}

/**
 * Admit one managed Pro call, or throw the GatewayError that refuses it.
 *
 * Refusals reuse the gateway's own vocabulary rather than minting codes the browser's model
 * client cannot read: an exhausted or missing reservation is `authentication_required` (the
 * caller must go and get one), a route the profile does not fund is `unavailable`.
 */
export async function admitManagedProCall(
  body: AiGatewayRequestBody,
  userId: string | null,
): Promise<ProProfile> {
  const profile = proProfile();
  if (!profile.enabled) {
    throw new GatewayError(
      'unavailable',
      'NoaCG Pro generation is not available on this server. Add your own AI Gateway key to run it.',
      503,
      false,
    );
  }
  if (!userId) {
    throw new GatewayError('authentication_required', 'Sign in to use NoaCG Pro.', 401, false);
  }
  // Every route this call could reach must be one the profile funds - an env repoint at an
  // unpriced or uncatalogued model is refused before it is billed, not after.
  const routes = [body.route, ...(body.fallbacks ?? [])];
  if (!routes.every((route) => proRouteFunded(profile, route))) {
    throw new GatewayError('unavailable', 'That model is not available for NoaCG Pro.', 503, false);
  }
  if (!body.proGenerationId) {
    throw new GatewayError(
      'authentication_required',
      'A NoaCG Pro generation must be started before it can run.',
      403,
      false,
    );
  }
  const admission = await (await getLiteGenerationStore()).admitProCall({
    generationId: body.proGenerationId,
    userId,
    now: Date.now(),
    maxCalls: profile.maxCallsPerGeneration,
    generationCeilingUsd: profile.maxProviderCostUsd,
  });
  if (admission.status === 'cost-ceiling') {
    throw new GatewayError(
      'unavailable',
      `This Pro generation has spent $${admission.spentUsd.toFixed(4)} of its `
        + `$${profile.maxProviderCostUsd.toFixed(2)} ceiling and was stopped.`,
      402,
      false,
    );
  }
  if (admission.status !== 'admitted') {
    // 'not-found', 'expired' and 'call-limit' answer alike on purpose: all three mean "this
    // reservation will not pay for another call", and telling them apart would let a caller
    // probe which generation ids exist.
    throw new GatewayError(
      'authentication_required',
      'This NoaCG Pro generation is no longer running. Start a new one.',
      403,
      false,
    );
  }
  return profile;
}

/**
 * Settle what the call actually cost into its reservation.
 *
 * ONLY an accountable cost is recorded, and the silence is deliberate. Until the first
 * settlement the row still carries the reservation's conservative worst case, so a call that
 * threw before the provider billed anything leaves the fleet OVER-booked rather than
 * under-booked - the safe direction - and leaves the next call admissible, which is correct
 * because nothing was spent.
 *
 * A FAILING SETTLEMENT MUST NOT FAIL THE REQUEST. By the time this runs the provider has
 * answered and the money is gone, so throwing would hand the caller a 500 for work they were
 * already billed for - and the natural response to a 500 is to retry, which spends it again.
 * The ledger write is warned about and dropped, like the gateway ledger's own
 * (`recordGatewayRequest`).
 *
 * What that costs is bounded and worth stating. A lost FIRST settlement leaves the row holding
 * the reservation's conservative worst case, so the fleet is over-booked rather than under -
 * the safe direction. A lost later one under-counts by that call's cost, so the ceiling admits
 * at most one more call than it should, and `maxCallsPerGeneration` still stops the run.
 *
 * HONEST LIMIT, stated rather than discovered later: a provider that answers without a cost
 * figure settles as zero - a provider that reported no number has not thereby proved a breach,
 * and refusing on silence would fail generations that cost nothing unusual. That is a reason to
 * keep every Pro route inside the audited catalog, where the price is known, which is what
 * `proRouteFunded` above enforces.
 */
export async function settleManagedProCall(
  body: AiGatewayRequestBody,
  userId: string | null,
  result: ModelResult | null,
): Promise<void> {
  if (!body.proGenerationId || !userId || !result) return;
  try {
    await (await getLiteGenerationStore()).recordProCall({
      generationId: body.proGenerationId,
      userId,
      costUsd: usageCostUsd(result.usage),
      // The heartbeat: this call finished, so the generation is alive and keeps its fleet slot
      // for another lease. An abandoned one stops renewing and frees the slot for the class.
      leaseMs: proCapacityRetryPlan(proProfile()).activeLeaseMs,
    });
  } catch (error) {
    console.warn('Pro call settlement failed:', error instanceof Error ? error.message : error);
  }
}
