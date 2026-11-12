// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend refuses an old page's write.
//
// THE PRODUCTION'S COPY IS THE ONLY TRUTH; OLD PAGES ONLY PLAY OUT (live-publishing W2, AC-2;
// docs/work-specs/live-publishing/designs/G1.md). The first test drives migration 0115's guard through
// the local gateway on every route, as a browser would: with the production-copies switch on, a
// signed-in write without the build mark is refused with "Reload this page to edit" on each
// production-authoring route and stores nothing, while a Pause, a heartbeat, another document kind,
// a marked write and the service role pass. The second walks it in the app: an old-build page (a
// page whose requests lose the mark on the wire) cannot save, sync or publish, still Takes, and,
// reopened as a new page, its cue edit goes up while a design it pulled from the library is dropped.
// A library edit and a broken record change nothing a publish carries; Update takes the newer design
// keeping the cue, its values, the layer and the link; adoption leaves the production reading as
// published.
// The Node half is scripts/copy-settle.test.mjs, scripts/production-copies.test.mjs and
// scripts/sync-copy-settle.test.mjs.
// covers: supabase/migrations/0115_production_copies_guard.sql, src/backend/supabase.ts, src/backend/productionCopies.ts, src/backend/sync.ts, src/backend/syncController.ts, src/backend/teamProductions.ts
// covers: src/model/copySettle.ts, src/model/library.ts, src/model/shows.ts, src/control/copyAdoption.ts, src/components/home/useCopyAdoption.ts, src/components/home/CueEditor.tsx

import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic } from '../_create';
import { publishProduction } from '../_publish';
import { settleDurableWrites } from '../_durable';
import {
  clearPublishedShows,
  haveCreds,
  openSecondProductionPage,
  SERVICE_ROLE_KEY,
  signIn,
  SUPABASE_URL,
  unpublishForCleanup,
  wipeMyGraphics,
} from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');
test.skip(!SERVICE_ROLE_KEY || !SUPABASE_URL, 'the switch is a service-role write: needs the local stack keys');

const MARK = 'x-noacg-production-copies';
const STRAP = 'Hairline';
const REFUSED = 'Reload this page to edit';

/** The service role, as an operator turning the switch on would act. */
const service = (path: string, init: { method?: string; body?: unknown; prefer?: string } = {}) =>
  fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: init.method ?? 'GET',
    headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'content-type': 'application/json', ...(init.prefer ? { prefer: init.prefer } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });

async function setSwitch(on: boolean): Promise<void> {
  const r = await service('system_settings?on_conflict=key', { method: 'POST', body: { key: 'production_copies', value: { on } }, prefer: 'resolution=merge-duplicates' });
  expect(r.status, await r.text()).toBeLessThan(300);
}

/** The signed-in page's session: its token, its account id, and the anon key the app sends. */
async function sessionOf(page: Page): Promise<{ token: string; user: string; anon: string }> {
  return page.evaluate(async () => {
    const { getSupabase } = await import('/src/backend/supabase.ts');
    const { loadBackendConfig } = await import('/src/backend/config.ts');
    const sb = (await getSupabase())!;
    const { data } = await sb.auth.getSession();
    return { token: data.session!.access_token, user: data.session!.user.id, anon: loadBackendConfig().anonKey };
  });
}

/** Drop the build mark from every request this page sends: a page loaded from an older bundle. */
async function asOldBuild(page: Page): Promise<void> {
  await page.route(`${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/**`, (route) => {
    const headers = { ...route.request().headers() };
    delete headers[MARK];
    return route.continue({ headers });
  });
}

/** The stored production body and the published row's strap css, read as the server holds them. */
async function stored(showId: string): Promise<{ body: { graphics: { name: string; savedAt: string; designAt?: string; template: { css: string }; layer?: number }[]; cues: { label: string; values: Record<string, string> }[] } | null; css: string | null; n: number | null }> {
  const docs = await (await service(`documents?id=eq.${showId}&select=body`)).json();
  const rows = await (await service(`control_shows?id=eq.${showId}&select=output`)).json();
  const output = rows[0]?.output as { ver?: { n: number }; graphics?: { key: string; css: string }[] } | undefined;
  return { body: docs[0]?.body ?? null, css: output?.graphics?.find((g) => g.key === STRAP)?.css ?? null, n: output?.ver?.n ?? null };
}

test.afterEach(async () => {
  await setSwitch(false).catch(() => undefined);
});

test('the guard refuses an unmarked production-authoring write on every route and nothing else (R5, R6)', async ({ page }) => {
  test.setTimeout(120_000);
  await signIn(page);
  const { token, user, anon } = await sessionOf(page);
  const rest = (path: string, init: { method?: string; body?: unknown; mark?: boolean; prefer?: string } = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: { apikey: anon, authorization: `Bearer ${token}`, 'content-type': 'application/json', ...(init.prefer ? { prefer: init.prefer } : {}), ...(init.mark ? { [MARK]: '1' } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  const refused = async (r: Response) => r.status >= 400 && (await r.text()).includes(REFUSED);
  const id = crypto.randomUUID();
  const doc = (n: number) => ({ id, user_id: user, kind: 'show', name: 'Guard', body: { id, name: 'Guard', updatedAt: `2026-11-12T00:00:0${n}.000Z`, graphics: [], cues: [] }, deleted: false });
  const save = (n: number, mark = false) => rest('documents?on_conflict=id', { method: 'POST', body: doc(n), prefer: 'resolution=merge-duplicates', mark });
  const source = (extra: Record<string, unknown>) => [{ id: 's1', kind: 'feed', label: 'Feed', config: { url: 'https://example.invalid/feed' }, ...extra }];
  try {
    await setSwitch(false);
    let state = await (await rest('rpc/production_copies_state', { method: 'POST', body: {}, mark: true })).json();
    expect(state, 'the mark reaches the database through the gateway').toEqual({ mark: true, on: false });
    state = await (await rest('rpc/production_copies_state', { method: 'POST', body: {} })).json();
    expect(state.mark).toBe(false);
    expect((await save(1)).status, 'switch off: an unmarked save passes').toBeLessThan(300);
    expect((await rest('control_shows', { method: 'POST', body: { id, owner_id: user, title: 'Guard', output: { v: 1 }, sources: source({}) } })).status).toBeLessThan(300);

    await setSwitch(true);
    expect(await refused(await save(2)), 'a personal save').toBe(true);
    expect(await refused(await rest(`control_shows?id=eq.${id}`, { method: 'PATCH', body: { output: { v: 2 } } })), 'a publish').toBe(true);
    expect(await refused(await rest(`control_shows?id=eq.${id}`, { method: 'PATCH', body: { sources: source({ label: 'Other' }) } })), 'a Connect').toBe(true);
    expect(await refused(await rest(`control_shows?id=eq.${id}`, { method: 'DELETE' })), 'an unpublish').toBe(true);
    expect((await rest(`control_shows?id=eq.${id}`, { method: 'PATCH', body: { sources: source({ paused: true }) } })).status, 'a Pause passes').toBeLessThan(300);
    expect((await rest(`control_shows?id=eq.${id}`, { method: 'PATCH', body: { output_seen_at: new Date().toISOString() } })).status, 'a heartbeat passes').toBeLessThan(300);
    expect((await rest('documents', { method: 'POST', body: { id: crypto.randomUUID(), user_id: user, kind: 'look', name: 'Look', body: {} } })).status, 'another kind passes').toBeLessThan(300);
    expect((await save(3, true)).status, 'a marked save passes').toBeLessThan(300);
    const kept = await (await service(`documents?id=eq.${id}&select=body`)).json();
    expect(kept[0].body.updatedAt, 'the refused save stored nothing').toBe('2026-11-12T00:00:03.000Z');
    expect((await service(`documents?id=eq.${id}`, { method: 'PATCH', body: { body: doc(4).body } })).status, 'the service role passes').toBeLessThan(300);

    // Team: a team, its production and the save RPC, refused unmarked and passing marked.
    const team = (await (await rest('teams', { method: 'POST', body: { name: `E2E team copies ${Date.now()}` }, prefer: 'return=representation', mark: true })).json())[0];
    await rest('rpc/team_join', { method: 'POST', body: { p_code: team.join_code, p_display_name: 'Owner' }, mark: true });
    const tp = crypto.randomUUID();
    const tdoc = { id: tp, name: 'Team guard', graphics: [], cues: [] };
    expect(await refused(await rest('team_productions', { method: 'POST', body: { id: tp, team_id: team.id, doc: tdoc, updated_by: user } })), 'a move to a team').toBe(true);
    const row = (await (await rest('team_productions', { method: 'POST', body: { id: tp, team_id: team.id, doc: tdoc, updated_by: user }, prefer: 'return=representation', mark: true })).json())[0];
    expect(await refused(await rest('rpc/team_production_save', { method: 'POST', body: { p_id: tp, p_expected: row.updated_at, p_doc: { ...tdoc, name: 'x' } } })), 'a team save').toBe(true);
    const saved = await (await rest('rpc/team_production_save', { method: 'POST', body: { p_id: tp, p_expected: row.updated_at, p_doc: { ...tdoc, name: 'y' } }, mark: true })).json();
    expect(saved.saved).toBe(true);
    await rest(`teams?id=eq.${team.id}`, { method: 'DELETE', mark: true });
  } finally {
    await setSwitch(false);
    await service(`control_shows?id=eq.${id}`, { method: 'DELETE' });
    await service(`documents?id=eq.${id}`, { method: 'DELETE' });
  }
});

test('an old page only plays out, and its kept cue edit returns without the design it pulled (AC-2)', async ({ page }) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await bootstrapGraphic(page, { name: STRAP });
  const showId = await page.evaluate(async (name) => {
    const { createGraphic } = await import('/src/model/library.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const { template } = useTemplateStore.getState();
    const { doc } = createGraphic(template, { name });
    const { show } = createShowNamedChecked(`Copies ${Date.now()}`);
    const { error } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    if (error) throw new Error(error);
    await commitDurableWrites();
    return show.id;
  }, STRAP);
  await page.goto(`/app#/production/${showId}`);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await publishProduction(page);
  await expect.poll(async () => (await stored(showId)).n ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
  const first = await stored(showId);

  // A library edit, then a broken library record: nothing a publish carries changes, no publish is
  // asked for, and the cue editor offers the newer design.
  await page.evaluate(async (name) => {
    const { loadGraphics, updateGraphic } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const doc = loadGraphics().find((g) => g.name === name)!;
    updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* library v2 */` } });
    await commitDurableWrites();
  }, STRAP);
  await expect(page.getByTestId('newer-design')).toContainText('Newer design in library', { timeout: 15_000 });
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0);
  expect((await stored(showId)).css, 'the published row is as it was').toBe(first.css);

  // Update takes it in, keeping the cue, its values, the layer and the link.
  const before = await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)!, showId);
  await page.getByTestId('design-update').click();
  await expect(page.getByTestId('newer-design')).toHaveCount(0, { timeout: 15_000 });
  const after = await page.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)!, showId);
  expect(after.graphics[0].template.css).toContain('library v2');
  expect(after.graphics[0].id).toBe(before.graphics[0].id);
  expect(after.graphics[0].layer).toBe(before.graphics[0].layer);
  expect(after.graphics[0].graphicId).toBe(before.graphics[0].graphicId);
  expect(after.cues).toEqual(before.cues);
  await page.evaluate(async (name) => {
    const { loadGraphics, updateGraphic } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const doc = loadGraphics().find((g) => g.name === name)!;
    updateGraphic(doc.id, { template: { ...doc.template, js: 'this is not javascript (' } });
    await commitDurableWrites();
  }, STRAP);
  await settleDurableWrites(page);
  await page.getByTestId('production-publish-changes').click();
  await expect.poll(async () => (await stored(showId)).css ?? '', { timeout: 90_000 }).toContain('library v2');
  expect((await stored(showId)).css, 'a broken library record never reaches a publish').not.toContain('not javascript');
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0, { timeout: 30_000 });

  // The switch goes on. Adoption: a stored copy from before copy truth (no stamp) is stamped once on
  // the next visit, and the production still reads as published.
  await setSwitch(true);
  const legacy = (await stored(showId)).body!;
  const unstamped = { ...legacy, updatedAt: new Date().toISOString(), graphics: legacy.graphics.map((g) => { const c = { ...g }; delete c.designAt; return c; }) };
  expect((await service(`documents?id=eq.${showId}`, { method: 'PATCH', body: { body: unstamped } })).status).toBeLessThan(300);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => page.evaluate(async (id) => {
    const g = (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)!.graphics[0];
    return g.designAt !== undefined && g.designAt === g.savedAt;
  }, showId), { timeout: 60_000 }).toBe(true);
  await expect(page.getByTestId('production-publish-changes')).toHaveCount(0);
  await settleDurableWrites(page);

  // An old-build page, a fresh browser signed in to the same account whose
  // requests lose the mark: its save and publish are refused, nothing stored changes, a Take goes.
  const old = await openSecondProductionPage(page, showId);
  await asOldBuild(old);
  const storedBefore = await stored(showId);
  await old.evaluate(async (id) => {
    const S = await import('/src/model/shows.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const show = S.loadShows().find((s) => s.id === id)!;
    const cue = show.cues![0];
    S.updateShowCueChecked(id, cue.id, { label: 'kept by the old page' });
    // What an old publish's refresh left in the record: a library design, no stamp.
    const g = show.graphics[0];
    S.upsertShows([{ ...S.loadShows().find((s) => s.id === id)!, graphics: [{ ...g, template: { ...g.template, css: `${g.template.css}\n/* pulled by an old page */` }, savedAt: new Date(Date.parse(g.savedAt) + 60_000).toISOString(), designAt: undefined }] }]);
    await commitDurableWrites();
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  }, showId);
  await expect.poll(async () => old.evaluate(async () => (await import('/src/backend/syncController.ts')).getSyncState().detail ?? ''), { timeout: 30_000 }).toContain(REFUSED);
  expect((await stored(showId)).body, 'an old page\'s sync stores nothing').toEqual(storedBefore.body);
  const publishNote = await old.evaluate(async (id) => {
    const { publishControlShow } = await import('/src/control/hostedControl.ts');
    const { loadShows } = await import('/src/model/shows.ts');
    try {
      await publishControlShow(loadShows().find((s) => s.id === id)!);
      return 'published';
    } catch (e) {
      return (e as Error).message;
    }
  }, showId);
  expect(publishNote).toContain(REFUSED);
  expect((await stored(showId)).n, 'an old page\'s publish writes nothing').toBe(storedBefore.n);
  await old.getByTestId('verb-take').click();
  await expect(old.getByTestId('production-note').filter({ hasText: REFUSED })).toHaveCount(0);

  // Reopened under the new build (the mark back on its requests): the cue edit goes up, the design
  // it pulled does not, and the stored copy stays the production's own.
  await old.unrouteAll({ behavior: 'ignoreErrors' });
  await old.reload();
  await expect(old.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => (await stored(showId)).body?.cues?.[0]?.label, { timeout: 60_000 }).toBe('kept by the old page');
  const returned = (await stored(showId)).body!;
  expect(returned.graphics[0].template.css).not.toContain('pulled by an old page');
  expect(returned.graphics[0].template.css).toContain('library v2');
  const local = await old.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((s) => s.id === id)!.graphics[0].template.css, showId);
  expect(local, 'the old device holds what went up').not.toContain('pulled by an old page');
  await old.close();

  await setSwitch(false);
  await unpublishForCleanup(page);
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
});
