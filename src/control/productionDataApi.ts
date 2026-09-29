// The operator surface as a CLIENT of the Production Data API (docs/DATA_API.md).
//
// Once a production is published, `control_shows.data` is the tree's authority: a feed writes
// it server-side, and the app must not keep a second copy that drifts. So the Data workspace
// stops talking to localStorage and starts talking to the same two endpoints an external
// integrator uses - `/api/data/patch` and `/api/data/state`.
//
// WHY THE HTTP API AND NOT A TABLE WRITE. A patch has to be a MERGE, and a merge has to be
// atomic with the row lock or an operator's edit and a feed's tick lose one of the two
// (docs/PRODUCTION_DATA_PLAN.md §4). That merge lives in `control_data_patch`, which is
// service-role only - so the honest route from a browser is the endpoint that already fronts
// it. The side benefit is that the operator surface dogfoods the integrator's contract: if
// this works, the documented API works.
//
// A THIRD DOOR ARRIVED WITH THE BOUND STEPPER, at the foot of this file: an operator PRESS on a
// bound field moves the same tree, but from a surface that holds a control slug and no data key,
// and on the operator's budget rather than the feed's. It says why there.
//
// ABOUT THE KEY. The owner reads their OWN production's `data_key` over RLS (0047 grants it to
// the owner and the service role, nobody else) and presents it here. That is not the "never a
// web page" case the integrator doc warns about - that warning is about shipping the key to
// viewers or embedding it in a public page. This is the owner's own key, in the owner's own
// authenticated session, sent to our own origin; and it is strictly WEAKER than the control
// slug the very same page already holds, which can play, stop and clear graphics. It grants no
// capability the operator does not already have.

import { getSupabase } from '../backend/supabase';
import { rpcFailure } from './failedSends';

/** The owner's own data key for a production, or null (not published, no backend, not owner). */
export async function productionDataKey(showId: string): Promise<string | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from('control_shows').select('data_key').eq('id', showId).maybeSingle();
  if (error || !data) return null;
  return ((data as { data_key: string | null }).data_key ?? null) || null;
}

/** The shape both endpoints answer with; `writes` is empty on a read. */
export interface ProductionDataState {
  data: Record<string, unknown>;
  bindings: Record<string, Record<string, string>>;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    return body?.error?.message ?? `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}

/** GET the production's current tree and bindings. Null = the key was refused. */
export async function fetchProductionData(key: string): Promise<ProductionDataState | null> {
  const response = await fetch('/api/data/state', { headers: { authorization: `Bearer ${key}` } });
  if (!response.ok) return null;
  const body = (await response.json()) as ProductionDataState;
  return { data: body.data ?? {}, bindings: body.bindings ?? {} };
}

/**
 * PATCH the production's tree. Returns the tree as it is AFTER the merge, which is what the
 * caller should hold - never the object it hoped for. A feed tick that landed in the same
 * moment is already merged into that answer, so the operator's surface cannot silently
 * overwrite it.
 */
export async function patchProductionData(key: string, patch: Record<string, unknown>): Promise<Record<string, unknown>> {
  const response = await fetch('/api/data/patch', {
    method: 'PATCH',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) throw new Error(await readError(response));
  const body = (await response.json()) as { data?: Record<string, unknown> };
  return body.data ?? {};
}

// ── The OPERATOR's door on the same tree (migration 0060) ────────────────────
//
// Everything above is the OWNER talking to the integrator's endpoints with the owner's own data
// key. The two functions below are the OPERATOR pressing a button on a dashboard, and they exist
// because a ± press or an event's `adjust` on a BOUND field moves the shared value rather than
// the field (docs/PRODUCTION_DATA_PLAN.md §2.9's Phase 3, AC-7). Three things make it a separate
// door rather than a second caller of the one above:
//
// - THE CREDENTIAL. The hosted control page is capability-addressed by an unguessable slug and
//   signed out; it has no data key and must never be given one (`docs/DATA_API.md` warns against
//   a key on a web page, and that warning is about exactly this surface). The slug it already
//   holds can play, stop, clear and update every graphic in the production through
//   `control_send_many`, so a merge into the tree - which resolves to those same `update` rows -
//   widens nothing it did not already have.
// - THE BUDGET. `control_data_patch` marks its rows `src:'api'` and charges them against the
//   25-per-5-s INGEST budget, whose entire purpose is that the operator keeps the rest. An
//   operator's press charged to it would let a saturated feed refuse the operator's own score.
//   These rows are marked `src:'operator'` and ride the production's ordinary 50-per-5-s cap.
// - THE ROUTE. It is an RPC and not an HTTP endpoint because this is how the hosted page reaches
//   everything else it reaches; a self-hosted instance with no serverless functions still has a
//   working dashboard, and that is a stated pillar.
export async function patchProductionDataBySlug(
  slug: string,
  patch: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const sb = await getSupabase();
  if (!sb) throw new Error('This production is not connected to a backend.');
  const { data, error, status } = await sb.rpc('control_data_patch_by_slug', { p_slug: slug, p_patch: patch });
  if (error) throw rpcFailure('control_data_patch_by_slug', error, status);
  return ((data as { data?: Record<string, unknown> } | null)?.data ?? {});
}

/** The tree and the bindings a hosted operator's surface needs, read on the control slug. Null
 *  when the slug is unknown or there is no backend - the caller then simply has no bindings, and
 *  every field behaves the way an unbound one always has. */
export async function fetchProductionDataBySlug(slug: string): Promise<ProductionDataState | null> {
  const sb = await getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.rpc('control_data_by_slug', { p_slug: slug });
  if (error || !data) return null;
  const body = data as { data?: Record<string, unknown>; bindings?: Record<string, Record<string, string>> };
  return { data: body.data ?? {}, bindings: body.bindings ?? {} };
}
