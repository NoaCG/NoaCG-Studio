// covers: src/community/packStamp.ts, src/components/home/GraphicControlPage.tsx, src/model/templateSet.ts
//
// THE DESIGN LOCK (docs/work-specs/community-packs/spec.md AC-5): a graphic installed from the
// community shelf is played and filled like any other, but its design cannot be edited. The
// production credits the pack once, and the copy routes keep the stamp: Duplicate, Save As, and a
// production's Export then Import. Offline, against the built shelf under public/packs/community/.

import { test, expect } from '@playwright/test';
import { settleDurableWrites } from './_durable';

test('an installed pack has no edit door, says where it came from once, and its cue still takes a changed value', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));

  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click();
  await page.getByTestId('wz-buildmode').locator('[data-build-mode="community"]').click();
  await page.locator('[data-community-pack="pub-quiz"]').getByRole('button', { name: 'Install Pub Quiz' }).click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  const production = page.url();

  // The credit, once, however many of the pack's graphics the production holds.
  await expect(page.getByTestId('pack-credit')).toHaveText(['From Pub Quiz by NoaCG']);

  // Change a cue value and take it: the fields are the operator's, the design is not.
  await page.getByTestId('select-cue').first().click();
  await page.getByTestId('cue-field-f0').fill('Which planet has the most moons?');
  await page.getByTestId('verb-take').click();
  const program = page.frameLocator('[data-testid="program-stage"] iframe[title="Pub Quiz"]');
  await expect(program.locator('#f0')).toHaveText('Which planet has the most moons?');
  await page.getByTestId('verb-out').first().click();
  await expect(page.getByTestId('live-cue-chip')).toContainText('nothing on air');

  // No edit door: the graphic's own page offers none, and the store refuses to open it.
  const ids = await page.evaluate(async () => {
    const { loadGraphics, createGraphic } = await import('/src/model/library.ts');
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { openGraphicById } = await import('/src/store/saveActions.ts');
    const pack = loadGraphics().find((g) => g.name === 'Pub Quiz')!;
    // The same lower third twice, one of them stamped: only the stamp tells their pages apart.
    const third = variantsFor('lower-third')[0].create({});
    const own = createGraphic(third, { name: 'My own third' }).doc;
    const stamped = createGraphic(third, { name: 'A pack third', fromPack: pack.fromPack }).doc;
    return { pack: pack.id, own: own.id, stamped: stamped.id, opened: openGraphicById(pack.id) };
  });
  expect(ids.opened).toBe(false);
  await settleDurableWrites(page);
  await page.goto(`/app#/control/${ids.own}`);
  await expect(page.getByTestId('control-open-editor')).toBeVisible();
  await expect(page.getByTestId('control-motion')).toBeVisible();
  await expect(page.getByTestId('sound-controls')).toBeVisible();
  for (const id of [ids.stamped, ids.pack]) {
    await page.goto(`/app#/control/${id}`);
    await expect(page.locator('.control-page-preview')).toBeVisible();
    await expect(page.getByTestId('control-open-editor')).toHaveCount(0);
    await expect(page.getByTestId('control-motion')).toHaveCount(0);
    await expect(page.getByTestId('sound-controls')).toHaveCount(0);
  }

  // Reload: the lock and the credit are read from the library record, not from this session.
  await page.goto(production);
  await page.reload();
  await expect(page.getByTestId('pack-credit')).toHaveText(['From Pub Quiz by NoaCG']);

  expect(errors).toEqual([]);
});

test('the stamp survives Duplicate, Save As and a production export then import, and a shared pack credits CC BY 4.0', async ({ page }) => {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const stamp = { id: 'community:lineage-1', version: 2, author: 'Someone', name: 'Two thirds' };
  const result = await page.evaluate(async (stamp) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { loadGraphics, duplicateGraphic, graphicById, graphicNameIndex, librarySaveEffect } = await import('/src/model/library.ts');
    const { loadShows } = await import('/src/model/shows.ts');
    const { parsePack, installPack, buildPack } = await import('/src/packs/graphicsPack.ts');
    const { openGraphicDoc, saveGraphicAs } = await import('/src/store/saveActions.ts');
    const { packCredit, productionCredits } = await import('/src/community/packStamp.ts');
    const [first, second] = variantsFor('lower-third');
    const pack = {
      name: 'Two thirds',
      description: '',
      graphics: [
        { template: { ...first.create({}), name: 'A' }, cues: [] },
        { template: { ...second.create({}), name: 'B' }, cues: [] },
      ],
    };
    const installed = await installPack(pack, undefined, stamp);
    const a = loadGraphics().find((g) => g.name === 'A')!;

    // Duplicate keeps the stamp.
    const copy = duplicateGraphic(a.id).doc!;
    // Save As of a working document linked to a stamped graphic keeps it too.
    openGraphicDoc(a);
    await saveGraphicAs('A saved as', { kind: 'standalone' } as never);
    const savedAs = loadGraphics().find((g) => g.name === 'A saved as')!;

    // Export the production, import the file: every graphic comes back stamped.
    const file = JSON.stringify(await buildPack(installed));
    const parsed = parsePack(file);
    const reimported = await installPack(parsed.pack!);
    const library = loadGraphics();
    const back = reimported.graphics.map((g) => graphicById(g.graphicId!)?.fromPack ?? null);

    return {
      copy: copy.fromPack,
      savedAs: savedAs.fromPack,
      fileStamps: (JSON.parse(file).graphics as { fromPack?: unknown }[]).map((g) => g.fromPack ?? null),
      back,
      credits: productionCredits(loadShows().find((s) => s.id === reimported.id)!, library),
      seed: packCredit({ id: 'pub-quiz', version: 1, author: 'NoaCG' }),
      // A wizard save under a pack graphic's name makes a new graphic, never writes over it.
      wizardSave: librarySaveEffect(graphicNameIndex(), 'B', null).kind,
    };
  }, stamp);
  expect(result.copy).toEqual(stamp);
  expect(result.savedAs).toEqual(stamp);
  expect(result.fileStamps).toEqual([stamp, stamp]);
  expect(result.back).toEqual([stamp, stamp]);
  expect(result.credits).toEqual(['From Two thirds by Someone, CC BY 4.0']);
  // A stamp from before stamps carried the pack's name still credits its maker.
  expect(result.seed).toBe('From a community pack by NoaCG');
  expect(result.wizardSave).toBe('mint');
});
