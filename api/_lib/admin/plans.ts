// /api/admin/plans - create and manage access plans.
//
//   GET                                    every plan, with how many users are on it
//   POST { action: 'save', plan }          create or update
//   POST { action: 'archive'|'restore', id }
//   POST { action: 'set-default', id }
//
// Plan keys and names are DATA. Nothing here or anywhere else branches on a particular key,
// so an operator can invent, rename and retire plans without a release. What an operator
// canNOT do is invent a feature key or a limit key: those come from the entitlement contract
// and unknown ones are dropped on save rather than stored, because a plan holding a key no
// resolver reads is a plan that lies about what it grants.

import { apiError, json, readJson } from '../http.js';
import { adminDb, adminNotFound, requireAdmin, writeAudit } from '../adminAuth.js';
import { isFeatureKey, isLimitKey } from '../../../src/entitlements/contract.js';
import { RENDER_LIMITS, storedRenderTier } from '../../../src/render/limits.js';
import { RENDER_FORMATS } from '../../../src/render/manifest.js';
import type { AdminPlan, AdminPlanListResponse } from '../../../src/admin/types.js';

const MAX_BODY_BYTES = 32_000;

interface PlanRow {
  id: string;
  key: string;
  name: string;
  description: string;
  status: string;
  is_default: boolean;
  features: unknown;
  limits: unknown;
  render_tier: string;
  auto_assign_email_domains: string[] | null;
  render_formats: string[] | null;
  billing: unknown;
  sort_order: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function toPlan(row: PlanRow, assignedCount: number): AdminPlan {
  const features: AdminPlan['features'] = {};
  for (const [key, value] of Object.entries(record(row.features))) {
    if (isFeatureKey(key) && typeof value === 'boolean') features[key] = value;
  }
  const limits: AdminPlan['limits'] = {};
  for (const [key, value] of Object.entries(record(row.limits))) {
    if (isLimitKey(key) && (typeof value === 'number' || value === null)) limits[key] = value;
  }
  const billing = record(row.billing);
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status === 'archived' ? 'archived' : 'active',
    isDefault: row.is_default,
    features,
    limits,
    // A plan row an admin set before migration 0055 still says 'paid'. Read it as the tier it
    // meant, so the Plans table and the editor's dropdown agree with what the render path will
    // actually do - and so the <select> below has an option matching its own value instead of
    // silently displaying the first one. A name from neither era is shown as stored; the editor
    // is where an operator would fix it, so hiding it would be the wrong help.
    renderTier: storedRenderTier(row.render_tier) ?? row.render_tier,
    autoAssignEmailDomains: row.auto_assign_email_domains ?? [],
    renderFormats: row.render_formats,
    billing: {
      amountCents: typeof billing.amount_cents === 'number' ? billing.amount_cents : undefined,
      currency: typeof billing.currency === 'string' ? billing.currency : undefined,
      interval: typeof billing.interval === 'string' ? billing.interval : undefined,
      externalPriceRef: typeof billing.external_price_ref === 'string' ? billing.external_price_ref : undefined,
    },
    sortOrder: row.sort_order,
    assignedCount,
  };
}

/** Keep only keys the entitlement contract actually reads. An unknown key is DROPPED, not
 *  stored and ignored: a plan row that carries `"ai.super": true` would read as a promise. */
function sanitizeFeatures(value: unknown): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(record(value))) {
    if (isFeatureKey(key) && typeof entry === 'boolean') out[key] = entry;
  }
  return out;
}

function sanitizeLimits(value: unknown): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const [key, entry] of Object.entries(record(value))) {
    if (!isLimitKey(key)) continue;
    if (entry === null) out[key] = null;
    else if (typeof entry === 'number' && Number.isFinite(entry) && entry >= 0) out[key] = Math.floor(entry);
  }
  return out;
}

const TIERS = Object.keys(RENDER_LIMITS);
const FORMATS = Object.keys(RENDER_FORMATS);

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, req.method === 'GET' ? 'support' : 'admin');
    if (!gate.ok) return gate.response;

    const db = await adminDb();

    if (req.method === 'GET') {
      const [plans, assignments] = await Promise.all([
        db.from('plans').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
        db.from('user_plans').select('plan_id'),
      ]);
      if (plans.error) return apiError('internal', 'Could not read the plans.', 500);

      const counts = new Map<string, number>();
      for (const row of (assignments.data ?? []) as { plan_id: string }[]) {
        counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1);
      }
      const response: AdminPlanListResponse = {
        plans: ((plans.data ?? []) as PlanRow[]).map((row) => toPlan(row, counts.get(row.id) ?? 0)),
        renderTiers: TIERS,
        renderFormats: FORMATS,
      };
      return json(response);
    }

    if (req.method !== 'POST') return adminNotFound();

    let body: Record<string, unknown>;
    try {
      body = await readJson<Record<string, unknown>>(req, MAX_BODY_BYTES);
    } catch {
      return apiError('invalid', 'Malformed request.', 400);
    }

    const action = body.action;

    if (action === 'archive' || action === 'restore') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) return apiError('invalid', 'A plan id is required.', 400);
      const current = await db.from('plans').select('name, is_default').eq('id', id).maybeSingle();
      if (!current.data) return apiError('invalid', 'That plan does not exist.', 400);
      // Archiving the default would leave new users with no plan row at all. That is survivable
      // (the resolver falls back to its built-in default) but it is never what was meant.
      if (action === 'archive' && current.data.is_default) {
        return apiError('invalid', 'Make another plan the default before archiving this one.', 400);
      }
      const { error } = await db
        .from('plans')
        .update({ status: action === 'archive' ? 'archived' : 'active', updated_by: gate.actor.userId })
        .eq('id', id);
      if (error) return apiError('internal', 'The plan could not be updated.', 500);
      await writeAudit(req, gate.actor, {
        action: `plan.${action}`,
        targetType: 'plan',
        targetId: id,
        summary: `${action === 'archive' ? 'archived' : 'restored'} ${current.data.name}`,
      });
      return json({ ok: true });
    }

    if (action === 'set-default') {
      const id = typeof body.id === 'string' ? body.id : '';
      if (!id) return apiError('invalid', 'A plan id is required.', 400);
      const target = await db.from('plans').select('name, status').eq('id', id).maybeSingle();
      if (!target.data) return apiError('invalid', 'That plan does not exist.', 400);
      if (target.data.status === 'archived') return apiError('invalid', 'An archived plan cannot be the default.', 400);

      // A partial unique index enforces one default, so the old one must be cleared FIRST.
      // Two statements is not atomic; the window is one round trip and its worst outcome is
      // "no default" (the resolver's built-in default covers it), never "two defaults".
      const cleared = await db.from('plans').update({ is_default: false }).eq('is_default', true);
      if (cleared.error) return apiError('internal', 'The default could not be changed.', 500);
      const { error } = await db.from('plans').update({ is_default: true, updated_by: gate.actor.userId }).eq('id', id);
      if (error) return apiError('internal', 'The default could not be changed.', 500);

      await writeAudit(req, gate.actor, {
        action: 'plan.set-default',
        targetType: 'plan',
        targetId: id,
        summary: `${target.data.name} is now the default plan`,
      });
      return json({ ok: true });
    }

    if (action !== 'save') return apiError('invalid', 'Unknown action.', 400);

    const plan = record(body.plan);
    const key = typeof plan.key === 'string' ? plan.key.trim().toLowerCase() : '';
    const name = typeof plan.name === 'string' ? plan.name.trim() : '';
    if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(key)) {
      return apiError('invalid', 'The plan key must be lowercase letters, numbers and dashes.', 400);
    }
    if (!name) return apiError('invalid', 'The plan needs a name.', 400);

    // Through storedRenderTier rather than TIERS alone, so saving an untouched plan that still
    // stores the retired 'paid' keeps the caps it was set up to give instead of silently narrowing
    // it to free - and writes the current name, which retires that row for good.
    const renderTier = storedRenderTier(typeof plan.renderTier === 'string' ? plan.renderTier : null) ?? 'free';
    const renderFormats = Array.isArray(plan.renderFormats)
      ? plan.renderFormats.filter((value): value is string => typeof value === 'string' && FORMATS.includes(value))
      : null;

    // The email domains this plan applies to automatically (migration 0045). Bounded here and
    // NORMALIZED in the database, so the stored shape is the one the resolver reads whichever
    // surface wrote it; this side only refuses what is obviously not a domain.
    const domains = Array.isArray(plan.autoAssignEmailDomains)
      ? plan.autoAssignEmailDomains
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim().toLowerCase().replace(/^@+/, ''))
          .filter((value) => value.length > 3 && value.length <= 253 && /^[a-z0-9.-]+\.[a-z]{2,}$/.test(value))
          .slice(0, 20)
      : [];

    const billingIn = record(plan.billing);
    const row = {
      key,
      name,
      description: typeof plan.description === 'string' ? plan.description.trim().slice(0, 500) : '',
      features: sanitizeFeatures(plan.features),
      limits: sanitizeLimits(plan.limits),
      auto_assign_email_domains: domains,
      render_tier: renderTier,
      render_formats: renderFormats && renderFormats.length ? renderFormats : null,
      // Stored, never read by any code path. Kept as snake_case so a future billing
      // integration reads the column directly rather than through a translation layer.
      billing: {
        amount_cents: typeof billingIn.amountCents === 'number' ? Math.max(0, Math.floor(billingIn.amountCents)) : undefined,
        currency: typeof billingIn.currency === 'string' ? billingIn.currency.slice(0, 8) : undefined,
        interval: typeof billingIn.interval === 'string' ? billingIn.interval.slice(0, 16) : undefined,
        external_price_ref: typeof billingIn.externalPriceRef === 'string' ? billingIn.externalPriceRef.slice(0, 128) : undefined,
      },
      sort_order: typeof plan.sortOrder === 'number' ? Math.floor(plan.sortOrder) : 0,
      updated_by: gate.actor.userId,
    };

    const id = typeof plan.id === 'string' && plan.id ? plan.id : null;
    const result = id
      ? await db.from('plans').update(row).eq('id', id).select('id').maybeSingle()
      : await db.from('plans').insert(row).select('id').maybeSingle();

    if (result.error) {
      const duplicate = result.error.code === '23505';
      return apiError('invalid', duplicate ? `A plan with the key "${key}" already exists.` : 'The plan could not be saved.', duplicate ? 400 : 500);
    }

    await writeAudit(req, gate.actor, {
      action: id ? 'plan.update' : 'plan.create',
      targetType: 'plan',
      targetId: result.data?.id ?? id ?? '',
      summary: `${id ? 'updated' : 'created'} plan ${name}`,
      // Domains are audited beside the features: sweeping a whole domain onto a plan is an
      // ACCESS change for everyone at that address, present and future, and it is the one
      // edit here that grants access to accounts that do not exist yet.
      detail: { key, renderTier, features: row.features, limits: row.limits, emailDomains: domains },
    });

    return json({ ok: true, id: result.data?.id ?? id });
  },
};
