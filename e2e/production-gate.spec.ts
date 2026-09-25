import { test, expect } from '@playwright/test';
import { bootstrapGraphic } from './_create';
import { settleDurableWrites } from './_durable';

// The LIBRARY -> AIR gate (src/validation/productionGate.ts, docs/AGENT_SAVE.md): a library
// record may be a broken draft, but an invalid graphic cannot be PUBLISHED (hosted control /
// output) or EXPORTED as a production - enforced inside publishControlShow and inside the
// production builders themselves, so it holds for every caller, and shown by the export dialog
// with the same verdict. Everything here runs offline: the publish path gates BEFORE it looks
// for a backend, which is exactly what makes the promise testable without one.

/** A saved library graphic whose HTML lost its SPXGCTemplateDefinition - the one thing every
 *  SPX graphic must carry, so validateTemplate (and therefore publishGate) refuses it. */
async function seedBrokenAndValid(page: import('@playwright/test').Page) {
  return page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow, loadShows } = await import('/src/model/shows.ts');
    const good = variantsFor('lower-third')[0].create({});
    const broken = { ...good, name: 'Broken L3', html: good.html.replace(/SPXGCTemplateDefinition/g, 'NotADefinition') };
    const okDoc = createGraphic({ ...good, name: 'Fine L3' }, { name: 'Fine L3' }).doc;
    const badDoc = createGraphic(broken, { name: 'Broken L3' }).doc;
    const bad = createShowNamed('Gate Bad');
    addGraphicToShow(bad.id, badDoc.template, { graphicId: badDoc.id });
    const fine = createShowNamed('Gate Fine');
    addGraphicToShow(fine.id, okDoc.template, { graphicId: okDoc.id });
    const shows = loadShows();
    return { badId: shows.find((s) => s.name === 'Gate Bad')!.id, fineId: shows.find((s) => s.name === 'Gate Fine')!.id };
  });
}

test('publishControlShow and the production builders refuse an invalid graphic, and pass a valid one', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const { badId, fineId } = await seedBrokenAndValid(page);
  await settleDurableWrites(page);

  const verdicts = await page.evaluate(async ({ badId, fineId }) => {
    const { loadShows } = await import('/src/model/shows.ts');
    const { publishControlShow } = await import('/src/control/hostedControl.ts');
    const { buildShowZipFor, buildShowZip } = await import('/src/export/showExport.ts');
    const bad = loadShows().find((s) => s.id === badId)!;
    const fine = loadShows().find((s) => s.id === fineId)!;
    const attempt = async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        return 'ok';
      } catch (e) {
        return (e as Error).message;
      }
    };
    return {
      publishBad: await attempt(() => publishControlShow(bad)),
      exportBadCaspar: await attempt(() => buildShowZipFor(bad, 'casparcg')),
      exportBadSpx: await attempt(() => buildShowZip(bad)),
      exportBadOverlay: await attempt(() => buildShowZipFor(bad, 'html-overlay')),
      // Offline, a VALID production publishes to null (no backend) rather than throwing, and
      // its packages build - the gate must not refuse what the editor calls valid.
      publishFine: await attempt(async () => {
        const r = await publishControlShow(fine);
        if (r !== null) throw new Error(`expected null offline, got ${JSON.stringify(r)}`);
      }),
      exportFine: await attempt(() => buildShowZipFor(fine, 'casparcg')),
    };
  }, { badId, fineId });

  for (const key of ['publishBad', 'exportBadCaspar', 'exportBadSpx', 'exportBadOverlay'] as const) {
    expect(verdicts[key], key).toContain('"Broken L3" failed validation');
    expect(verdicts[key], key).toContain('before putting this production on air');
  }
  expect(verdicts.publishFine).toBe('ok');
  expect(verdicts.exportFine).toBe('ok');
});

test('the export dialog shows the gate\'s verdict and keeps the download disabled', async ({ page }) => {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const { badId } = await seedBrokenAndValid(page);
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${badId}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('export-production').click();
  await expect(page.getByTestId('production-export-dialog')).toBeVisible();
  await expect(page.getByTestId('prod-export-blocked')).toContainText('Broken L3');
  await expect(page.getByTestId('prod-export-download')).toBeDisabled();
});
