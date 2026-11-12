// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend holds a published version to guard.
//
// THE PUBLISH GUARD (docs/work-specs/publish-guard/spec.md). Two members: Anna edits a graphic in
// her library, takes it into the production with Update (live-publishing W2: the production's copy
// is the only truth) and publishes; Ben, whose page built its copy when the graphic was added, changes a
// cue and then a layer and publishes each time. Air keeps Anna's design, with Ben's cue and layer
// (AC-1, AC-3). One member, three states forced on the server row: a payload from before stamps is
// published over (AC-6), a newer design on air than the page holds stops the publish with nothing
// written (AC-4, G3), and a publish landing between the page's read and its write is pulled in and
// published over once (AC-2 at the same moment, G4).
// The Node half is scripts/readiness.test.mjs.
//
// THE PRODUCTION'S COPY IS THE ONLY TRUTH; OLD PAGES ONLY PLAY OUT (live-publishing W2, AC-2;
// docs/work-specs/live-publishing/designs/G1.md), the last describe. Migration 0115's guard is driven
// through the local gateway on every route, as a browser would: with the production-copies switch on,
// a signed-in write without the build mark is refused with "Reload this page to edit" on each
// production-authoring route and stores nothing, while a Pause, a heartbeat, another document kind,
// a marked write and the service role pass. Then it is walked in the app: a library edit and a broken
// record change nothing a publish carries; Update takes the newer design keeping the cue, the layer
// and the link; adoption leaves the production reading as published; an old-build page (a page whose
// requests lose the mark on the wire) cannot save, sync or publish, still Takes, and, reopened as a
// new page, its cue edit goes up while a design it pulled from the library is dropped. Its Node half
// is scripts/copy-settle.test.mjs, scripts/production-copies.test.mjs, scripts/sync-copy-settle.test.mjs.
// covers: supabase/migrations/0115_production_copies_guard.sql, src/backend/productionCopies.ts, src/backend/sync.ts, src/backend/syncController.ts, src/backend/teamProductions.ts
// covers: src/model/copySettle.ts, src/model/library.ts, src/control/copyAdoption.ts, src/components/home/useCopyAdoption.ts, src/components/home/CueEditor.tsx
// covers: src/control/payloadVersion.ts, src/control/hostedControl.ts, src/model/shows.ts, src/components/home/ProductionPage.tsx
// covers: src/control/liveCue.ts, src/control/cueItems.ts, src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/useProductionPublish.ts
// covers: src/control/airState.ts, src/control/sessionWire.ts
// covers: src/control/graphicVerbs.ts, src/control/verbDispatch.ts, src/control/verbView.ts
// covers: src/control/cueDraft.ts
// AUTOMATIC UPDATES (live-publishing designs/G3.md, AC-4): the describe at the end.
// covers: supabase/migrations/0116_production_revision.sql, supabase/migrations/0117_publication_guard.sql
// covers: src/control/autoPublish.ts, src/control/publishRevision.ts, src/control/sendsInFlight.ts, src/backend/savedRevision.ts, src/components/home/useAutoPublish.ts
// covers: src/output/versionCheck.ts, src/output/payloadReader.ts, src/output/prepare.ts, src/output/main.ts, src/control/playoutStatus.ts

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic } from '../_create';
import { settleDurableWrites } from '../_durable';
import {
  clearPublishedShows,
  readyOf,
  E2E_TEAMMATE_EMAIL,
  E2E_TEAMMATE_PASSWORD,
  haveCreds,
  haveTeammateCreds,
  openSecondProductionPage,
  SERVICE_ROLE_KEY,
  signIn,
  signInAs,
  SUPABASE_URL,
  unpublishForCleanup,
  wipeMyGraphics,
} from './_helpers';

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

/** A catalog lower third, by its variant name (`bootstrapGraphic`), saved under that name. */
const STRAP = 'Hairline';

/** Bootstrap a catalog graphic and save it in the signed-in library. */
async function libraryGraphic(page: Page, name: string): Promise<void> {
  await bootstrapGraphic(page, { name });
  expect(
    await page.evaluate(async () => {
      const { createGraphic } = await import('/src/model/library.ts');
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { template } = useTemplateStore.getState();
      const { error } = createGraphic(template, { name: template.name });
      return error ?? (await commitDurableWrites());
    }),
  ).toBeFalsy();
}

/** A new production holding the named library graphic, opened on its page. */
async function productionWith(page: Page, name: string, graphic: string): Promise<string> {
  const showId = await page.evaluate(
    async ([showName, wanted]) => {
      const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');
      const { loadGraphics } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { show, error: notCreated } = createShowNamedChecked(showName);
      if (notCreated) throw new Error(notCreated);
      const doc = loadGraphics().find((g) => g.name === wanted);
      if (!doc) throw new Error(`no library graphic ${wanted}`);
      const { error } = addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
      if (error) throw new Error(error);
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
      return show.id;
    },
    [name, graphic] as [string, string],
  );
  await page.goto(`/app#/production/${showId}`);
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
  return showId;
}

/** Edit the graphic's design in the library, as the editor's save does, then take it into the
 *  production with Update (live-publishing O4): the copy is what publishes. */
async function editInLibrary(page: Page, showId: string, graphic: string, note: string): Promise<void> {
  const edited = await page.evaluate(
    async ([id, name, comment]) => {
      const { loadShows, updateCopyFromLibrary } = await import('/src/model/shows.ts');
      const { loadGraphics, newerLibraryDesign, resolveSavedGraphicDoc, updateGraphic } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const pooled = loadShows().find((s) => s.id === id)?.graphics.find((g) => g.name === name);
      const doc = pooled ? resolveSavedGraphicDoc(pooled, loadGraphics()) : undefined;
      if (!pooled || !doc) return false;
      const { error } = updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* ${comment} */` } });
      if (error) return false;
      const newer = newerLibraryDesign(pooled, loadGraphics());
      if (!newer) return false;
      const updated = updateCopyFromLibrary(id, pooled.id, newer, pooled.savedAt);
      return !updated.error && !(await commitDurableWrites());
    },
    [showId, graphic, note] as [string, string, string],
  );
  expect(edited, `${graphic} is a library graphic of the production`).toBe(true);
}

interface Published {
  n: number;
  css: string;
  layer: number | null;
  digest: string | null;
  edited: string | null;
  values: string[];
}

/** The published row, read with this page's session. */
async function published(page: Page, showId: string, graphic: string): Promise<Published | null> {
  return page.evaluate(
    async ([id, name]) => {
      const { getSupabase } = await import('/src/backend/supabase.ts');
      const sb = await getSupabase();
      const { data } = await sb!.from('control_shows').select('output').eq('id', id).maybeSingle();
      type Out = { ver?: { n: number; g: Record<string, string>; t?: Record<string, string> }; graphics: { key: string; css: string; layer?: number }[]; cues: { graphic: string; values: Record<string, string> }[] };
      const output = (data as { output?: Out } | null)?.output;
      if (!output?.ver) return null;
      const spec = output.graphics.find((g) => g.key === name);
      return {
        n: output.ver.n,
        css: spec?.css ?? '',
        layer: spec?.layer ?? null,
        digest: output.ver.g[name] ?? null,
        edited: output.ver.t?.[name] ?? null,
        values: output.cues.filter((c) => c.graphic === name).map((c) => c.values.f0 ?? ''),
      };
    },
    [showId, graphic] as [string, string],
  );
}

/** Press the Playout panel's Publish changes, there whenever the production changed since its
 *  publish (the header's only when outputs need preparing, which a cue edit does not). */
async function pressPublishChanges(page: Page): Promise<void> {
  const panel = page.getByTestId('production-status-panel');
  if (!(await panel.isVisible())) await page.getByTestId('production-status').click();
  await expect(panel.getByTestId('panel-publish-changes')).toBeVisible({ timeout: 20_000 });
  await panel.getByTestId('panel-publish-changes').click();
  await page.keyboard.press('Escape');
}

/** Press Publish changes and wait until the row moves past `after`. */
async function publishChanges(page: Page, showId: string, after: number): Promise<Published> {
  await pressPublishChanges(page);
  await expect.poll(async () => (await published(page, showId, STRAP))?.n ?? 0, { timeout: 60_000 }).toBeGreaterThan(after);
  await expect(page.getByTestId('production-note').filter({ hasText: 'Publish failed' })).toHaveCount(0);
  return (await published(page, showId, STRAP))!;
}

/** Change the strap cue's text in the production record, as a saved cue edit does. (Typing in the
 *  cue editor holds a draft, which is not yet a change to publish.) */
async function typeCue(page: Page, showId: string, text: string): Promise<void> {
  const failure = await page.evaluate(
    async ([id, name, value]) => {
      const { loadShows, updateShowCueChecked } = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const show = loadShows().find((s) => s.id === id)!;
      const graphic = show.graphics.find((g) => g.name === name)!;
      const cue = (show.cues ?? []).find((c) => c.sourceId === graphic.id)!;
      const { error } = updateShowCueChecked(id, cue.id, { values: { ...cue.values, f0: value } });
      const answer = error ?? (await commitDurableWrites());
      await new Promise((r) => setTimeout(r));
      return answer;
    },
    [showId, STRAP, text] as [string, string, string],
  );
  expect(failure, 'the cue edit was saved').toBeFalsy();
}

test.describe('two members', () => {
  test.skip(!haveTeammateCreds, 'set E2E_TEAMMATE_EMAIL and E2E_TEAMMATE_PASSWORD for the two-person walk');

  test("a teammate's older copy never replaces the newer design, and their cue and layer still publish", async ({ browser }) => {
    test.setTimeout(360_000);
    const annaContext = await browser.newContext();
    const benContext = await browser.newContext();
    const anna = await annaContext.newPage();
    const ben = await benContext.newPage();
    let teamId = '';
    let showId = '';
    try {
      await signIn(anna);
      await anna.keyboard.press('Escape');
      await clearPublishedShows(anna);
      await wipeMyGraphics(anna);
      await libraryGraphic(anna, STRAP);
      showId = await productionWith(anna, `Publish guard ${Date.now()}`, STRAP);
      // `E2E team ` prefix, so teams.spec.ts's sweep deletes it if this run dies mid-way.
      const team = await anna.evaluate(async (id) => {
        const { createTeam } = await import('/src/backend/teams.ts');
        const { moveProductionToTeam } = await import('/src/backend/teamProductions.ts');
        const { loadShows } = await import('/src/model/shows.ts');
        const { team: made, error } = await createTeam(`E2E team guard ${Date.now()}`, 'Anna Owner');
        if (!made || error) throw new Error(error ?? 'no team');
        const show = loadShows().find((s) => s.id === id)!;
        // The team sync starts a moment after sign-in; until then a move answers that it needs one.
        for (let i = 0; ; i += 1) {
          const moved = await moveProductionToTeam(show, made.id);
          if (!moved.error) break;
          if (i > 40 || !/signed-in account/.test(moved.error)) throw new Error(moved.error);
          await new Promise((r) => setTimeout(r, 500));
        }
        return { id: made.id, code: made.joinCode };
      }, showId);
      teamId = team.id;
      await anna.reload();
      await expect(anna.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
      await publishProduction(anna);
      const first = (await published(anna, showId, STRAP))!;

      // Ben joins and opens the production: his page builds Strap from the copy made at the add.
      await signInAs(ben, E2E_TEAMMATE_EMAIL, E2E_TEAMMATE_PASSWORD);
      await ben.keyboard.press('Escape');
      await ben.evaluate(async (joinCode) => {
        const { joinTeamByCode } = await import('/src/backend/teams.ts');
        const { refreshTeams } = await import('/src/backend/teamProductions.ts');
        const { error } = await joinTeamByCode(joinCode, 'Ben Teammate');
        if (error) throw new Error(error);
        await refreshTeams();
      }, team.code);
      await ben.goto(`/app#/production/${showId}`);
      await expect(ben.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });

      // Anna changes Strap's design and publishes it.
      await editInLibrary(anna, showId, STRAP, 'anna design 2');
      const annas = await publishChanges(anna, showId, first.n);
      expect(annas.css).toContain('anna design 2');

      // AC-1: Ben changes a cue and publishes. Air keeps Anna's design, unchanged to the digest,
      // and gets Ben's cue.
      await typeCue(ben, showId, 'Ben was here');
      const bens = await publishChanges(ben, showId, annas.n);
      expect(bens.css, "Ben's publish keeps Anna's newer design").toContain('anna design 2');
      expect(bens.digest, 'the outputs rebuild nothing for it').toBe(annas.digest);
      expect(bens.edited).toBe(annas.edited);
      expect(bens.values).toContain('Ben was here');

      // AC-3: Ben moves Strap to another layer and publishes: Anna's design on Ben's layer.
      const layer = (bens.layer ?? 20) + 7;
      await ben.evaluate(
        async ([id, name, to]) => {
          const { loadShows, setShowGraphicLayer } = await import('/src/model/shows.ts');
          const g = loadShows().find((s) => s.id === id)!.graphics.find((x) => x.name === name)!;
          setShowGraphicLayer(id, g.id, to);
          await new Promise((r) => setTimeout(r));
        },
        [showId, STRAP, layer] as [string, string, number],
      );
      const relayered = await publishChanges(ben, showId, bens.n);
      expect(relayered.layer).toBe(layer);
      expect(relayered.css).toContain('anna design 2');
    } finally {
      await anna
        .evaluate(
          async ([id, show]) => {
            const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
            if (show) await unpublishControlShow(show).catch(() => undefined);
            if (!id) return;
            const { deleteTeam } = await import('/src/backend/teams.ts');
            await deleteTeam(id);
          },
          [teamId, showId] as [string, string],
        )
        .catch(() => undefined);
      await annaContext.close();
      await benContext.close();
    }
  });
});

test('a newer design on air stops the publish, and a publish landing in between is published over once', async ({ page }) => {
  test.setTimeout(240_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);
  await wipeMyGraphics(page);
  await libraryGraphic(page, STRAP);
  const showId = await productionWith(page, `Publish guard solo ${Date.now()}`, STRAP);
  await publishProduction(page);
  const first = (await published(page, showId, STRAP))!;
  expect(first.edited, 'the stamp names when the design was edited').not.toBeNull();

  /** Rewrite the published stamp as another page's publish would have left it, or as a publish
   *  from before stamps did (`strip`: no stamp at all). */
  const forge = (change: { later?: boolean; bump?: number; strip?: boolean }) =>
    page.evaluate(
      async ([id, name, later, bump, strip]) => {
        const { getSupabase } = await import('/src/backend/supabase.ts');
        const sb = (await getSupabase())!;
        const { data } = await sb.from('control_shows').select('output').eq('id', id).single();
        const output = (data as { output: { ver?: { n: number; g: Record<string, string>; t: Record<string, string> } } }).output;
        const ver = output.ver!;
        if (later) {
          ver.g[name] = 'ffffffffffffffff';
          ver.t[name] = new Date(Date.now() + 3_600_000).toISOString();
        }
        ver.n += bump;
        if (strip) delete output.ver;
        const { error } = await sb.from('control_shows').update({ output }).eq('id', id);
        if (error) throw new Error(error.message);
        return ver.n;
      },
      [showId, STRAP, !!change.later, change.bump ?? 0, !!change.strip] as [string, string, boolean, number, boolean],
    );

  // AC-6: a payload published before stamps (the row has none). The republish lands over it, the
  // write conditioned on there being no stamp.
  await forge({ strip: true });
  await typeCue(page, showId, 'over an unstamped payload');
  await pressPublishChanges(page);
  await expect.poll(async () => (await published(page, showId, STRAP))?.values ?? [], { timeout: 60_000 }).toContain('over an unstamped payload');
  expect((await published(page, showId, STRAP))!.n, 'a payload without a stamp is followed by v1').toBe(1);
  await expect(page.getByTestId('production-note').filter({ hasText: 'Publish failed' })).toHaveCount(0);

  // AC-4: a newer design of Strap is on air than this page holds. The publish stops, names it, and
  // writes nothing, after pulling once more in case the newer copy had reached the record.
  const stamped = (await published(page, showId, STRAP))!;
  await forge({ later: true });
  await typeCue(page, showId, 'stale page');
  await pressPublishChanges(page);
  await expect(page.getByTestId('production-note')).toContainText(`${STRAP} on air is newer than this production's copy.`, { timeout: 30_000 });
  const refused = (await published(page, showId, STRAP))!;
  expect(refused.n, 'nothing was written').toBe(stamped.n);
  expect(refused.values).not.toContain('stale page');

  // Put this page's design back on air (the forged edit time goes with a real republish).
  await unpublishForCleanup(page);
  await publishProduction(page);
  const base = (await published(page, showId, STRAP))!;

  // G4: another publish lands between this page's read and its write. The write misses, the page
  // reads again and publishes over it once, by itself.
  await typeCue(page, showId, 'raced');
  // Only a PUBLISH write carries the panel; the forged one below writes the payload alone.
  let writes = 0;
  let landed = 0;
  await page.route('**/rest/v1/control_shows?**', async (route) => {
    const request = route.request();
    if (request.method() !== 'PATCH' || !(request.postData() ?? '').includes('"panel"')) return route.continue();
    writes += 1;
    if (writes === 1) landed = await forge({ bump: 5 });
    return route.continue();
  });
  await pressPublishChanges(page);
  await expect.poll(async () => (await published(page, showId, STRAP))?.values ?? [], { timeout: 60_000 }).toContain('raced');
  const after = (await published(page, showId, STRAP))!;
  expect(writes, 'the first write missed, and the page published once more').toBe(2);
  expect(landed).toBe(base.n + 5);
  expect(after.n, 'published over the version that landed in between').toBe(landed + 1);
  await expect(page.getByTestId('production-note').filter({ hasText: 'Publish failed' })).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await unpublishForCleanup(page);
});

test.describe('production copies (live-publishing W2)', () => {
  test.skip(!SERVICE_ROLE_KEY || !SUPABASE_URL, 'the switch is a service-role write: needs the local stack keys');
  test.afterEach(async () => {
    await setSwitch(false).catch(() => undefined);
  });
  const MARK = 'x-noacg-production-copies';
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
      // Another kind passes. Deleted at once: the test account's sync pulls every look it holds.
      const look = crypto.randomUUID();
      expect((await rest('documents', { method: 'POST', body: { id: look, user_id: user, kind: 'look', name: 'Look', body: { id: look, updatedAt: new Date().toISOString() } } })).status, 'another kind passes').toBeLessThan(300);
      await service(`documents?id=eq.${look}`, { method: 'DELETE' });
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
    // The program monitor's frames carry a mark and count their loads; a library edit must neither
    // replace nor reload one (G1 R1: a library change reaches no monitor).
    const markFrames = () => page.evaluate(() => {
      const frames = [...document.querySelectorAll<HTMLIFrameElement>('[data-testid="program-stage"] iframe')];
      for (const f of frames) {
        if (f.dataset.kept) continue;
        f.dataset.kept = '0';
        f.addEventListener('load', () => { f.dataset.kept = String(Number(f.dataset.kept) + 1); });
      }
      return frames.length;
    });
    const keptFrames = () => page.evaluate(() => [...document.querySelectorAll<HTMLIFrameElement>('[data-testid="program-stage"] iframe')]
      .filter((f) => f.dataset.kept === '0').length);
    await expect.poll(markFrames, { timeout: 30_000 }).toBeGreaterThan(0);
    const framesBefore = await markFrames();
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
    expect(await keptFrames(), 'a library edit reloads no program monitor frame').toBe(framesBefore);

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
    // The production's own record goes up through the personal sync; wait for it to carry Update's design.
    await expect.poll(async () => (await stored(showId)).body?.graphics?.[0]?.template.css ?? '', { timeout: 60_000 }).toContain('library v2');
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
});

test.describe('automatic updates (live-publishing W4, AC-4)', () => {
  test.skip(!SERVICE_ROLE_KEY || !SUPABASE_URL, 'the switch is a service-role write: needs the local stack keys');
  const service = (path: string, init: { method?: string; body?: unknown; prefer?: string } = {}) =>
    fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      method: init.method ?? 'GET',
      headers: { apikey: SERVICE_ROLE_KEY, authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'content-type': 'application/json', ...(init.prefer ? { prefer: init.prefer } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
  async function setAuto(on: boolean): Promise<void> {
    const r = await service('system_settings?on_conflict=key', { method: 'POST', body: { key: 'auto_publish', value: { on } }, prefer: 'resolution=merge-duplicates' });
    expect(r.status, await r.text()).toBeLessThan(300);
  }
  test.afterEach(async () => {
    await setAuto(false).catch(() => undefined);
  });

  /** What the server holds: the record's saved revision, the revision published, the stamp and
   *  the published cue labels and graphic keys. */
  async function server(showId: string): Promise<{ rev: number | null; published: number | null; n: number | null; labels: string[]; graphics: string[] }> {
    const docs = await (await service(`documents?id=eq.${showId}&select=rev`)).json();
    const rows = await (await service(`control_shows?id=eq.${showId}&select=published_rev,output`)).json();
    const output = rows[0]?.output as { ver?: { n: number }; cues?: { label: string }[]; graphics?: { key: string }[] } | undefined;
    return {
      rev: docs[0]?.rev ?? null,
      published: rows[0]?.published_rev ?? null,
      n: output?.ver?.n ?? null,
      labels: (output?.cues ?? []).map((c) => c.label),
      graphics: (output?.graphics ?? []).map((g) => g.key),
    };
  }

  /** A published production with one graphic and two cues, its page open, automatic updates on. */
  async function published(page: Page, name: string): Promise<{ showId: string; outputSlug: string; graphicId: string; cues: string[] }> {
    await signIn(page);
    await page.keyboard.press('Escape');
    await clearPublishedShows(page);
    await wipeMyGraphics(page);
    await bootstrapGraphic(page, { name: STRAP });
    const showId = await page.evaluate(async (label) => {
      const { createGraphic } = await import('/src/model/library.ts');
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { createShowNamedChecked, addGraphicToShow, loadShows, setShowCues } = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const { template } = useTemplateStore.getState();
      const { doc } = createGraphic(template, { name: template.name });
      const { show } = createShowNamedChecked(label);
      const added = addGraphicToShow(show.id, doc!.template, { graphicId: doc!.id });
      if (added.error) throw new Error(added.error);
      const graphic = loadShows().find((x) => x.id === show.id)!.graphics[0];
      const cued = setShowCues(show.id, [{ sourceId: graphic.id, label: 'Cue A' }, { sourceId: graphic.id, label: 'Cue B' }]);
      if (cued.error) throw new Error(cued.error);
      await commitDurableWrites();
      return show.id;
    }, name);
    await page.goto(`/app#/production/${showId}`);
    await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
    await publishProduction(page);
    await expect.poll(async () => (await server(showId)).n ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
    await setAuto(true);
    // The page reads the switch on open (and every 30 s): open it again to start at once.
    await page.reload();
    await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
    return page.evaluate(async (id) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const s = loadShows().find((x) => x.id === id)!;
      return { showId: id, outputSlug: s.outputSlug ?? '', graphicId: s.graphics[0].id, cues: (s.cues ?? []).map((c) => c.id) };
    }, showId);
  }

  /** Change the production as an edit on this page does: a model write, landed on disk. */
  const edit = (page: Page, showId: string, change: string, arg: string) =>
    page.evaluate(async ({ id, change, arg }) => {
      const shows = await import('/src/model/shows.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const s = shows.loadShows().find((x) => x.id === id)!;
      const cues = s.cues ?? [];
      if (change === 'label') shows.updateShowCue(id, cues[0].id, { label: arg });
      if (change === 'order') shows.setShowCues(id, [...cues].reverse().map((c) => ({ sourceId: c.sourceId, label: c.label, values: c.values })));
      if (change === 'remove-graphic') shows.removeShowGraphic(id, s.graphics.find((g) => g.name === arg)!.id);
      if (change === 'add-graphic') {
        const added = shows.addGraphicToShow(id, { ...s.graphics[0].template, name: arg });
        if (added.error) throw new Error(added.error);
      }
      const failure = await commitDurableWrites();
      if (failure) throw new Error(failure);
    }, { id: showId, change, arg });

  const outputUrl = (slug: string, name: string, extra = '') => `/output?production=${encodeURIComponent(slug)}&destination=browser&name=${encodeURIComponent(name)}&debug=1${extra}`;

  test('every save reaches the outputs with no press, an older output takes them and reads amber, and a new output finds the newest alone', async ({ page, browser }) => {
    test.setTimeout(300_000);
    const { showId, outputSlug } = await published(page, `Auto ${Date.now()}`);
    const viewers = await browser.newContext();
    const air = await viewers.newPage();
    await air.goto(outputUrl(outputSlug, 'Desk A'));
    const old = await viewers.newPage();
    await old.goto(outputUrl(outputSlug, 'Old', '&oldbuild=1'));
    /** The version an output holds (its READY answer's `v`). */
    const holds = async (out: Page) => ((await readyOf(out)) as { v?: { n: number } } | null)?.v?.n ?? 0;
    await expect.poll(() => holds(air), { timeout: 60_000 }).toBeGreaterThan(0);
    await expect.poll(() => holds(old), { timeout: 60_000 }).toBeGreaterThan(0);

    // O1: after the first publish there is no Publish changes, and an older output is named.
    await expect(page.getByTestId('production-publish-changes')).toHaveCount(0);
    await expect(page.getByTestId('production-status')).toContainText('Reload Old when nothing is on air', { timeout: 30_000 });

    // Cue text, cue order, a graphic added and removed: each reaches both outputs with no press.
    const steps: [string, string, (s: Awaited<ReturnType<typeof server>>) => boolean][] = [
      ['label', 'Edited once', (s) => s.labels.includes('Edited once')],
      ['order', '', (s) => s.labels[0] === 'Cue B'],
      ['add-graphic', 'Second strap', (s) => s.graphics.includes('Second strap')],
      ['remove-graphic', 'Second strap', (s) => !s.graphics.includes('Second strap')],
    ];
    for (const [change, arg, landed] of steps) {
      await edit(page, showId, change, arg);
      await expect.poll(async () => landed(await server(showId)), { timeout: 60_000, message: `${change} published` }).toBe(true);
      const now = await server(showId);
      expect(now.published, `${change}: the publication names the newest save`).toBe(now.rev);
      await expect.poll(() => holds(air), { timeout: 60_000, message: `${change} on the new output` }).toBe(now.n);
      await expect.poll(() => holds(old), { timeout: 60_000, message: `${change} on the older output` }).toBe(now.n);
      await expect(page.getByTestId('production-publish-changes')).toHaveCount(0);
    }

    // With the page's request withheld and the page closed, the new output finds the version alone.
    await page.evaluate(() => { (window as unknown as { __noacgWithholdPrep?: boolean }).__noacgWithholdPrep = true; });
    await edit(page, showId, 'label', 'Found alone');
    await expect.poll(async () => (await server(showId)).labels.includes('Found alone'), { timeout: 60_000 }).toBe(true);
    const target = (await server(showId)).n;
    await page.close();
    const t0 = Date.now();
    await expect.poll(() => holds(air), { timeout: 90_000, intervals: [1_000] }).toBe(target);
    test.info().annotations.push({ type: 'found-alone-ms', description: String(Date.now() - t0) });
    await viewers.close();
  });

  test('a failed publish keeps the save and reads red, and the next page opened publishes it', async ({ page }) => {
    test.setTimeout(240_000);
    const { showId } = await published(page, `Auto fail ${Date.now()}`);
    await page.route('**/rest/v1/control_shows?**', (route) =>
      route.request().method() === 'PATCH' ? route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"made to fail"}' }) : route.continue(),
    );
    await edit(page, showId, 'label', 'Kept while failing');
    const status = page.getByTestId('production-status');
    await expect(status).toContainText('Updating outputs', { timeout: 30_000 });
    await expect(status).toContainText('Saved, not on the outputs', { timeout: 40_000 });
    const saved = await server(showId);
    expect(saved.rev, 'the save is kept').not.toBeNull();
    expect(saved.labels).not.toContain('Kept while failing');
    expect(saved.published ?? 0).toBeLessThan(saved.rev ?? 0);
    // The page closes; the next page opened on the production publishes the save.
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    const next = await openSecondProductionPage(page, showId);
    await page.close();
    await expect.poll(async () => (await server(showId)).labels.includes('Kept while failing'), { timeout: 60_000 }).toBe(true);
    const after = await server(showId);
    expect(after.published).toBe(after.rev);
    await next.close();
  });

  test('two publishers finishing in reverse order leave the newer save published', async ({ page }) => {
    test.setTimeout(240_000);
    const { showId } = await published(page, `Auto race ${Date.now()}`);
    const second = await openSecondProductionPage(page, showId);
    // The first page's publish is held on the wire until the second page's newer one has landed.
    let release: (() => void) | null = null;
    const held = new Promise<void>((resolve) => {
      void page.route('**/rest/v1/control_shows?**', async (route) => {
        if (route.request().method() !== 'PATCH' || release) return route.continue();
        release = () => void route.continue().catch(() => undefined);
        resolve();
      });
    });
    await edit(page, showId, 'label', 'Older save');
    await held;
    const older = await server(showId);
    // The second page takes that save in, then saves over it.
    await second.evaluate(async () => { await (await import('/src/backend/syncController.ts')).syncNow(); });
    await expect.poll(() => second.evaluate(async (id) => (await import('/src/model/shows.ts')).loadShows().find((x) => x.id === id)?.cues?.[0]?.label, showId), { timeout: 30_000 }).toBe('Older save');
    await edit(second, showId, 'label', 'Newer save');
    await expect.poll(async () => (await server(showId)).labels.includes('Newer save'), { timeout: 60_000 }).toBe(true);
    const newer = await server(showId);
    expect(newer.rev ?? 0).toBeGreaterThan(older.rev ?? 0);
    release!();
    // The older publish lands after it, or is told it is behind: the newer save stays published.
    await page.waitForTimeout(8_000);
    const end = await server(showId);
    expect(end.labels).toContain('Newer save');
    expect(end.labels).not.toContain('Older save');
    expect(end.published).toBe(newer.rev);
    await page.unrouteAll({ behavior: 'ignoreErrors' });
    await second.close();
  });
});
