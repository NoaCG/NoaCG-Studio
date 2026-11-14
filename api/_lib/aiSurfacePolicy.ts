// The MANAGED-KEY routing policy for a tagged gateway surface.
//
// `POST /api/ai/generate` is a general model proxy and has always called
// `executeGatewayRequest(body, { keyFor })` with no policy at all - so the SPX harness, the
// brainstorm call, the video harness and NoaCG Pro all reached the managed gateway without
// asking for zero-data-retention routing. The profile-owning surfaces
// (api/_lib/aiLiteProfile.ts, api/_lib/aiImportAnalysisProfile.ts) build a policy of their own
// and always have; everything reached through the generic proxy did not.
//
// That gap is only visible from the OUTSIDE once a route's ZDR is claimed as audited: putting
// "ZDR verified: yes" on the /admin Models page while the requests go out unpolicied would be a
// privacy claim production does not honour. This module is what makes the claim true.
//
// TWO DELIBERATE LIMITS, stated rather than discovered later:
//
//   1. MANAGED ONLY. A caller spending their OWN key on their own chosen model is not ours to
//      route - the same line api/ai/generate.ts already draws for the disabled-route switch.
//   2. THE TAG IS CLIENT-SUPPLIED. A request that omits `surface` gets no policy, exactly as
//      it gets no entitlement check (docs/ADMIN.md, "Gating a surface on a shared endpoint").
//      What this buys is real - the product's own Pro traffic is policied - and it is not a
//      guarantee about a hand-rolled request, which no server-side signal could provide.

import { boolEnv } from './aiLiteProfile.js';
import { proProfile } from './aiProProfile.js';
import type { GatewayExecutionPolicy, GatewayRoutingPolicy } from './aiGateway.js';
import type { AiGatewaySurface, ModelRoute } from '../../src/ai/modelTypes.js';

/** Does this surface's managed traffic carry a routing policy? A surface absent from here is
 *  unchanged from before this module existed, which is why the map is explicit rather than a
 *  default: adding a surface to `AiGatewaySurface` must not silently opt it in or out. */
const POLICIED_SURFACES: Record<AiGatewaySurface, boolean> = {
  // Pro's concept call sends the graphic's two text lines - on a real lower third, a named
  // person and their role - to an image model on NoaCG's key. That is third-party personal
  // data, and it is the reason this module exists.
  pro: true,
  // The Studio-managed editor follows the existing managed retention policy, fail closed.
  editor: true,
  // Video is NOT policied here, deliberately. Its routes are user-selectable through the
  // video model picker rather than pinned, so a ZDR directive would refuse whichever of them
  // no ZDR-agreement provider serves - turning a privacy improvement into an outage on a
  // surface whose routes have never been audited. Audit them first, then flip this.
  video: false,
  // The NoaCG Pro Phase 0 spike (docs/NOACG_PRO_PLAN.md §0, scripts/pro-spike.mjs). No user
  // reaches it: it exists so a bench-only run can ask for the STRUCTURED-OUTPUT MODE the
  // generic proxy otherwise cannot express (see `structuredOutputMode` below). Its privacy
  // posture is the same as Pro's for the same reason - the brief bank carries invented names
  // and roles, but it is third-party-shaped personal data on NoaCG's key either way.
  spike: true,
};

/**
 * The gateway policy for a managed call on `surface`, or undefined for an unpoliced one.
 *
 * TWO OPENROUTER DIRECTIVES DIED HERE, both harmlessly. `require_parameters` was already
 * false on this surface (an image request carries `modalities`, which is not a listed
 * provider parameter, so requiring parameters narrowed the endpoint set to nothing and failed
 * every concept call) and has no gateway equivalent to keep. `allow_fallbacks: false` is
 * subsumed: the gateway serves a `zeroDataRetention` request only from providers under a
 * verified ZDR agreement, so there is no non-ZDR path to fall back onto.
 *
 * The PRICE CAPS are the real loss. `FUNDED_ROUTE_PRICE_CEILING` used to ride on every Pro
 * call as `max_price`, so a route that got expensive was refused by the provider; the gateway
 * has no such field. `sort: 'cost'` asks for the cheapest eligible provider, and the ceiling
 * still gates which routes may be catalogued at all - but nothing refuses a call at request
 * time any more. That was never a bound on image work in any case: no ceiling for image
 * tokens has been decided (docs/ADMIN.md §9).
 */
export function surfaceRoutePolicy(
  surface: AiGatewaySurface | undefined,
  route: ModelRoute,
): GatewayRoutingPolicy | undefined {
  if (!surface || !POLICIED_SURFACES[surface]) return undefined;
  if (route.provider !== 'vercel') return undefined;
  return {
    // Default ON, and the opt-out is the same shape the task profiles already have
    // (AI_LITE_REQUIRE_ZDR): an explicit, audited, server-only decision, never a silent
    // degrade. It exists because the gateway makes ZDR a Pro/Enterprise feature - on a Hobby
    // team every Pro generation fails closed with `zdr_unavailable`, which is the correct
    // default and still a decision somebody has to be able to make differently once they have
    // read what it costs. Under OpenRouter this question never arose: ZDR routing was
    // available to any account, so the pin was free.
    zeroDataRetention: boolEnv('AI_SURFACE_REQUIRE_ZDR', true),
    // Pinned on and deliberately NOT behind the switch above. It is free on every plan, so
    // there is no cost to trade away - and Pro's concept call sends a named person and their
    // role to an image model on NoaCG's key, which is the traffic least defensible to leave
    // trainable. Turning ZDR off must not quietly turn this off with it.
    disallowPromptTraining: true,
    // FORCED-FUNCTION TOOL USE, on the spike surface only.
    //
    // Every other generic-proxy call goes out as `response_format: json_schema` with
    // `strict: false` - a HINT. Measured 2026-08-11 against the two pinned open-weight
    // checkpoints: `zai/glm-5.2` wrapped its answer in the schema's own name and
    // `moonshotai/kimi-k3` invented an SPX-definition-shaped object, while a forced function
    // tool got exactly the six declared properties out of both. The repo already believed
    // this - `providerAllowlistFor` filters gateway endpoints on `tools` support and
    // src/ai/AGENTS.md calls forced tool use "the capability the structured call actually
    // rides on" - the transport simply asked for the other thing.
    //
    // SCOPED TO THIS SURFACE DELIBERATELY. Switching the adapter's default would change what
    // the SPX harness, the video harness, brainstorm and Pro send on every gateway route, and
    // the custom coder is the frozen benchmark control (src/ai/AGENTS.md) - changing its
    // inputs would end the comparability of every arm-A result. That is the right eventual
    // fix and it is a separate, deliberately verified change with its own re-baseline.
    // docs/AI_ATTEMPTS.md carries the measurement.
    ...(surface === 'spike' ? { structuredOutputMode: 'tool' as const } : {}),
    sort: 'cost',
    tags: [`surface:${surface}`],
  };
}

/**
 * The EXECUTION policy for a surface - attempt budget, timeout - as opposed to the routing
 * policy above. Only the spike and Pro carry one; everything else is unchanged.
 *
 * WHY THE SPIKE NEEDS ONE. `configuredTimeoutMs()` clamps the shared default to 300 s, which
 * is right for the product: every managed surface answers a user who is waiting. The Phase 0
 * spike answers nobody - it is a background bench run - and the checkpoints it measures are
 * REASONING models. Measured 2026-08-11 on `zai/glm-5.2` against a 306-token prompt: 190 s and
 * 10,671 output tokens, of which **8,607 were reasoning** before a single character of the
 * answer. The spike's own prompt carries a 38,500-token exemplar block and asks for three
 * complete files, so 300 s refuses a call the model would have served - which is what the
 * first attempt at this round measured, 24 times, as "the AI provider timed out".
 *
 * Raising the shared clamp instead would lengthen how long a real user's failing generation
 * hangs on every surface, to fix a bench rig. This is the containment.
 *
 * `retryLimit` was 0 for one round, and the round is why it is 1 again. The reasoning was
 * about money: a timeout is classified retryable, so a retry makes every slow call cost TWO
 * full provider completions, and a call we abandoned still ran to completion upstream. What
 * that argument missed is that TIMEOUTS ARE NOT THE COMMON FAILURE. Measured over 24
 * generations on `moonshotai/kimi-k3`: eight died on transient `unavailable` errors from the
 * gateway, on both the long exemplar arm and the short one, and with no retry each of those
 * lost its brief outright - a third of a paid round thrown away to avoid a cost that mostly
 * did not arise. A blip fails early and costs almost nothing to re-roll; losing a brief costs
 * the whole brief. One retry, not the default two.
 */
export function surfaceExecutionPolicy(surface: AiGatewaySurface | undefined): GatewayExecutionPolicy | undefined {
  if (surface === 'spike') return { timeoutMs: 900_000, retryLimit: 1 };
  // PRO: bind the call to the timeout its own env var has always CLAIMED to set.
  // `AI_PRO_TIMEOUT_MS` sized the reservation lease (aiProProfile.ts `activeLeaseMs`) while the
  // actual provider call ran on the shared `AI_TIMEOUT_MS` default - so the variable read as
  // Pro's timeout and bounded everything except the thing a student was waiting on. The value
  // rides through unchanged (default 120 s); what changes is that moving it now moves the call.
  // The retry budget deliberately stays the shared default: the bounded retry for Pro lives in
  // the BROWSER (src/ai/pro/language/generate.ts), where it re-admits against the reservation
  // instead of stretching one serverless request.
  if (surface === 'pro') return { timeoutMs: proProfile().timeoutMs };
  return undefined;
}
