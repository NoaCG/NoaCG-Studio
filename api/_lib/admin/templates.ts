// /api/admin/templates - template visibility and usage.
//
//   GET                                          the overlay rows and usage
//   POST { action: 'set', key, source, visibility, name?, category?, note? }
//   POST { action: 'clear', key }                back to the default (public)
//
// The catalog is CODE (src/templates), so this endpoint stores no templates - only an overlay
// keyed by template id, and only for templates whose visibility has been changed. A template
// with no row is public, which is why "clear" and "set to public" are the same outcome
// reached two ways and only one of them leaves a row behind.
//
// There is deliberately NO plan gate on a template. Catalog templates are free-forever core
// and work offline, where no entitlement can be checked; a paywall here would be both
// unenforceable and a contradiction of docs/GOALS.md. Visibility answers "is this ready for
// everyone yet", which is a different question.

import { apiError, json, readJson } from '../http.js';
import { adminDb, adminNotFound, requireAdmin, writeAudit } from '../adminAuth.js';
import type { AdminTemplateEntry, AdminTemplateListResponse, TemplateVisibility } from '../../../src/admin/types.js';

const MAX_BODY_BYTES = 8_000;
const VISIBILITIES: TemplateVisibility[] = ['public', 'beta', 'internal', 'hidden'];

function isVisibility(value: unknown): value is TemplateVisibility {
  return typeof value === 'string' && (VISIBILITIES as string[]).includes(value);
}

interface OverlayRow {
  template_key: string;
  source: string;
  visibility: string;
  note: string;
}

export default {
  async fetch(req: Request): Promise<Response> {
    const gate = await requireAdmin(req, req.method === 'GET' ? 'support' : 'admin');
    if (!gate.ok) return gate.response;

    const db = await adminDb();

    if (req.method === 'GET') {
      const overlay = await db.from('template_admin').select('template_key, source, visibility, note');
      if (overlay.error) return apiError('internal', 'Could not read the template settings.', 500);

      // PER-TEMPLATE USAGE IS NOT RECORDED, and this endpoint used to pretend otherwise: it
      // read `funnel_events.properties` filtered on `name = 'graphic_created'`, and that table
      // has neither column and no such event (migration 0016). The query therefore errored on
      // every request, `usageUnavailable` came back true forever, and the counts were zero for
      // a reason nobody could see.
      //
      // The honest position is the one the funnel actually supports: an activation records the
      // DOOR a graphic came through (catalog, AI, import, blank, kit, video), never which
      // variant was chosen, so there is no template id to count. Reporting that as unavailable
      // is the correct answer rather than a stopgap - a zero that means "no data" reads as
      // "nobody used this", which is the kind of number an operator acts on wrongly. Counting
      // it would need a new field on the creation event, which is a deliberate change to make
      // when somebody needs the number.
      const uses = new Map<string, number>();
      const usageUnavailable = true;

      const templates: AdminTemplateEntry[] = [];
      for (const row of (overlay.data ?? []) as OverlayRow[]) {
        templates.push({
          key: row.template_key,
          source: row.source === 'community' ? 'community' : 'catalog',
          visibility: isVisibility(row.visibility) ? row.visibility : 'public',
          uses: uses.get(row.template_key) ?? 0,
          note: row.note,
        });
      }

      return json({ templates, usageUnavailable } satisfies AdminTemplateListResponse);
    }

    if (req.method !== 'POST') return adminNotFound();

    let body: Record<string, unknown>;
    try {
      body = await readJson<Record<string, unknown>>(req, MAX_BODY_BYTES);
    } catch {
      return apiError('invalid', 'Malformed request.', 400);
    }

    const key = typeof body.key === 'string' ? body.key.trim() : '';
    if (!key || key.length > 128) return apiError('invalid', 'A template id is required.', 400);

    if (body.action === 'clear') {
      const { error } = await db.from('template_admin').delete().eq('template_key', key);
      if (error) return apiError('internal', 'The template setting could not be cleared.', 500);
      await writeAudit(req, gate.actor, {
        action: 'template.clear',
        targetType: 'template',
        targetId: key,
        summary: `${key} back to public`,
      });
      return json({ ok: true });
    }

    if (body.action !== 'set') return apiError('invalid', 'Unknown action.', 400);
    if (!isVisibility(body.visibility)) return apiError('invalid', 'Unknown visibility.', 400);
    const source = body.source === 'community' ? 'community' : 'catalog';
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : '';

    const { error } = await db
      .from('template_admin')
      .upsert(
        { template_key: key, source, visibility: body.visibility, note, updated_by: gate.actor.userId },
        { onConflict: 'template_key' },
      );
    if (error) return apiError('internal', 'The template setting could not be saved.', 500);

    await writeAudit(req, gate.actor, {
      action: 'template.visibility',
      targetType: 'template',
      targetId: key,
      summary: `${key} is now ${body.visibility}`,
      detail: { source, visibility: body.visibility, note },
    });
    return json({ ok: true });
  },
};
