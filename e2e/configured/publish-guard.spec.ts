// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). Only a real backend holds a published version to guard.
//
// THE PUBLISH GUARD (docs/work-specs/publish-guard/spec.md). Two members: Anna edits a graphic in
// her library and publishes; Ben, whose page built its copy when the graphic was added, changes a
// cue and then a layer and publishes each time. Air keeps Anna's design, with Ben's cue and layer
// (AC-1, AC-3). One member, two faults forced on the server row: a newer design on air than the
// page holds stops the publish with nothing written (AC-4, G3), and a publish landing between the
// page's read and its write is pulled in and published over once (AC-2 at the same moment, G4).
// The Node half is scripts/readiness.test.mjs.
// covers: src/control/payloadVersion.ts, src/model/shows.ts, src/components/home/ProductionPage.tsx

import { publishProduction } from '../_publish';
import { test, expect, type Page } from '@playwright/test';
import { bootstrapGraphic } from '../_create';
import {
  clearPublishedShows,
  E2E_TEAMMATE_EMAIL,
  E2E_TEAMMATE_PASSWORD,
  haveCreds,
  haveTeammateCreds,
  signIn,
  signInAs,
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

/** Edit the graphic's design in the library, as the editor's save does. */
async function editInLibrary(page: Page, showId: string, graphic: string, note: string): Promise<void> {
  const edited = await page.evaluate(
    async ([id, name, comment]) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const { loadGraphics, resolveSavedGraphicDoc, updateGraphic } = await import('/src/model/library.ts');
      const { commitDurableWrites } = await import('/src/model/durableStore.ts');
      const pooled = loadShows().find((s) => s.id === id)?.graphics.find((g) => g.name === name);
      const doc = pooled ? resolveSavedGraphicDoc(pooled, loadGraphics()) : undefined;
      if (!doc) return false;
      const { error } = updateGraphic(doc.id, { template: { ...doc.template, css: `${doc.template.css}\n/* ${comment} */` } });
      return !error && !(await commitDurableWrites());
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

/** Press Publish changes and wait until the row moves past `after`. */
async function publishChanges(page: Page, showId: string, after: number): Promise<Published> {
  await expect(page.getByTestId('production-publish-changes')).toBeVisible({ timeout: 20_000 });
  await page.getByTestId('production-publish-changes').click();
  await expect.poll(async () => (await published(page, showId, STRAP))?.n ?? 0, { timeout: 60_000 }).toBeGreaterThan(after);
  await expect(page.getByTestId('production-note').filter({ hasText: 'Publish failed' })).toHaveCount(0);
  return (await published(page, showId, STRAP))!;
}

/** Type the strap cue's text on the production page. */
async function typeCue(page: Page, text: string): Promise<void> {
  await page.getByTestId('select-cue').filter({ hasText: STRAP }).first().click();
  await page.getByTestId('cue-field-f0').fill(text);
  await page.getByTestId('cue-field-f0').blur();
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
    try {
      await signIn(anna);
      await anna.keyboard.press('Escape');
      await clearPublishedShows(anna);
      await wipeMyGraphics(anna);
      await libraryGraphic(anna, STRAP);
      const showId = await productionWith(anna, `Publish guard ${Date.now()}`, STRAP);
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
      await typeCue(ben, 'Ben was here');
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
        .evaluate(async (id) => {
          if (!id) return;
          const { deleteTeam } = await import('/src/backend/teams.ts');
          await deleteTeam(id);
        }, teamId)
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

  /** Rewrite the published stamp as another page's publish would have left it. */
  const forge = (change: { later?: boolean; bump?: number }) =>
    page.evaluate(
      async ([id, name, later, bump]) => {
        const { getSupabase } = await import('/src/backend/supabase.ts');
        const sb = (await getSupabase())!;
        const { data } = await sb.from('control_shows').select('output').eq('id', id).single();
        const output = (data as { output: { ver: { n: number; g: Record<string, string>; t: Record<string, string> } } }).output;
        if (later) {
          output.ver.g[name] = 'ffffffffffffffff';
          output.ver.t[name] = new Date(Date.now() + 3_600_000).toISOString();
        }
        output.ver.n += bump;
        const { error } = await sb.from('control_shows').update({ output }).eq('id', id);
        if (error) throw new Error(error.message);
        return output.ver.n;
      },
      [showId, STRAP, !!change.later, change.bump ?? 0] as [string, string, boolean, number],
    );

  // AC-4: a newer design of Strap is on air than this page holds. The publish stops, names it, and
  // writes nothing.
  await forge({ later: true });
  await typeCue(page, 'stale page');
  await page.getByTestId('production-publish-changes').click();
  await expect(page.getByTestId('production-note')).toContainText(`${STRAP} on air is newer than this page's copy. Reload this page to get it.`, { timeout: 30_000 });
  const refused = (await published(page, showId, STRAP))!;
  expect(refused.n, 'nothing was written').toBe(first.n);
  expect(refused.values).not.toContain('stale page');

  // Put this page's design back on air (the forged edit time goes with a real republish).
  await unpublishForCleanup(page);
  await publishProduction(page);
  const base = (await published(page, showId, STRAP))!;

  // G4: another publish lands between this page's read and its write. The write misses, the page
  // reads again and publishes over it once, by itself.
  await typeCue(page, 'raced');
  let patches = 0;
  let landed = 0;
  await page.route('**/rest/v1/control_shows?**', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue();
    patches += 1;
    // The forged publish's own PATCH comes through here too, as the second one.
    if (patches === 1) landed = await forge({ bump: 5 });
    return route.continue();
  });
  await page.getByTestId('production-publish-changes').click();
  await expect.poll(async () => (await published(page, showId, STRAP))?.values ?? [], { timeout: 60_000 }).toContain('raced');
  const after = (await published(page, showId, STRAP))!;
  expect(landed).toBe(base.n + 5);
  expect(after.n, 'published over the version that landed in between').toBe(landed + 1);
  await expect(page.getByTestId('production-note').filter({ hasText: 'Publish failed' })).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await unpublishForCleanup(page);
});
