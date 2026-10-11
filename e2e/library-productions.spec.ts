// covers: src/templates/**, src/components/{home,save}/**
//
// WHICH GRAPHICS BELONG TO WHICH PRODUCTION. It reads the pool's `graphicId` back-link, so the
// change most likely to break it is one to model/shows.ts - which escalates to the focus set rather
// than to the covers lines, and would otherwise run the two library specs beside it and never the
// one written to protect this surface.
// focus

import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

// WHICH GRAPHICS BELONG TO WHICH PRODUCTION (https://github.com/NoaCG/NoaCG-Studio/blob/01f6cfd26c21be5205177e7f2b540c7fb06f9bb4/docs/backlog/browse-a-productions-graphics.md).
//
// The library used to say a graphic's type, folder and edited date and nothing about the unit
// that airs it, so "is this strap in the Friday show?" was a question you answered by opening
// the playout dashboard and playing graphics out one at a time. These specs pin the readout,
// the filter and the door in from a production card.
//
// The assertion that must never be dropped is the UNASSIGNED one: a facet whose only states are
// "one production" and "all" makes every graphic in no production unreachable through it, and
// that is the failure mode this whole surface was built to avoid.

interface SeededLibrary {
  productionAId: string;
  productionBId: string;
  onlyAId: string;
  onlyBId: string;
  bothId: string;
  neitherId: string;
}

/** Seed through the real local-first model, then reload so the assertions run against the
 *  durable library a returning user sees rather than the synchronous write mirror.
 *  `Weekend shared` is deliberately FILED in a folder as well as pooled in both productions:
 *  it is the one graphic that proves the filter crosses folders. */
async function seedLibrary(page: Page): Promise<SeededLibrary> {
  await page.goto('/app#/home/graphics');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const seeded = await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { createGraphic, setGraphicsFolder } = await import('/src/model/library.ts');
    const { createShowNamedChecked, addGraphicToShow } = await import('/src/model/shows.ts');

    const makeGraphic = (name: string, category: string) => {
      const variant = CATALOG[category]?.[0];
      if (!variant) throw new Error(`The ${category} catalog fixture is missing.`);
      const template = variant.create({});
      // The production stores a template COPY, so its name must be final before pooling it.
      template.name = name;
      return createGraphic(template, { name }).doc;
    };

    const onlyA = makeGraphic('Only Friday', 'lower-third');
    // The one graphic of a DIFFERENT type, and it is in production B alone - which is what
    // makes "a type chip cannot outlive its own strip" a real state to reach.
    const onlyB = makeGraphic('Only Saturday', 'scoreboard');
    const both = makeGraphic('Weekend shared', 'lower-third');
    const neither = makeGraphic('Unassigned', 'lower-third');
    setGraphicsFolder([both.id], 'Straps');
    const productionA = createShowNamedChecked('Friday Quiz Night').show;
    const productionB = createShowNamedChecked('Saturday Finals').show;

    addGraphicToShow(productionA.id, onlyA.template, { graphicId: onlyA.id });
    addGraphicToShow(productionA.id, both.template, { graphicId: both.id });
    addGraphicToShow(productionB.id, onlyB.template, { graphicId: onlyB.id });
    addGraphicToShow(productionB.id, both.template, { graphicId: both.id });

    return {
      productionAId: productionA.id,
      productionBId: productionB.id,
      onlyAId: onlyA.id,
      onlyBId: onlyB.id,
      bothId: both.id,
      neitherId: neither.id,
    };
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  return seeded;
}

test('a card names the productions its graphic is in, and says nothing when there are none', async ({ page }) => {
  const seeded = await seedLibrary(page);
  await page.getByTestId('library-view-grid').click();

  const onlyA = page.getByTestId(`graphic-row-${seeded.onlyAId}`);
  await expect(onlyA.getByTestId('row-productions')).toContainText('Friday Quiz Night');

  // In NONE: no tag at all. A card is a stack of bands and an empty one reads as a defect,
  // while "no tag" is unambiguous the moment a sibling card shows one (the folder tag's rule).
  await expect(page.getByTestId(`graphic-row-${seeded.neitherId}`).getByTestId('row-productions')).toHaveCount(0);

  // In BOTH: the card is wide enough for two names, so both are printed rather than counted.
  // Reached through the search, because this one is FILED - at the root the folder band holds
  // it, which is the same reason the production filter has to flatten.
  await page.getByTestId('home-search').fill('Weekend');
  const both = page.getByTestId(`graphic-row-${seeded.bothId}`);
  await expect(both.getByTestId('row-productions')).toContainText('Friday Quiz Night');
  await expect(both.getByTestId('row-productions')).toContainText('Saturday Finals');

  // The binding ONE header row (src/components/home/AGENTS.md) survives the new control at the
  // shared config's 1280px desktop width.
  const header = await page.locator('.lib-viewbar').evaluate((el) => el.getBoundingClientRect().height);
  expect(header).toBeLessThan(44);
});

test('picking a production lists exactly its graphics, across folders', async ({ page }) => {
  const seeded = await seedLibrary(page);
  await page.getByTestId('library-view-grid').click();
  const filter = page.getByTestId('library-production');

  // The count in the option is a promise about what picking it will list.
  await expect(filter.locator('option', { hasText: 'Friday Quiz Night' })).toHaveText(/\(2\)/);
  await filter.selectOption(seeded.productionAId);

  await expect(page.locator('.lib-grid > .lib-row')).toHaveCount(2);
  await expect(page.getByTestId(`graphic-row-${seeded.onlyAId}`)).toBeVisible();
  await expect(page.getByTestId(`graphic-row-${seeded.bothId}`)).toBeVisible();
  await expect(page.getByTestId(`graphic-row-${seeded.onlyBId}`)).toHaveCount(0);

  // A production's graphics are spread across folders, so the filter FLATTENS the band exactly
  // as a search does - "Weekend shared" is filed in Straps and must still be listed, saying
  // where it lives. Answering with the unfiled graphics alone would be a lie by omission.
  await expect(page.getByTestId('folder-items')).toHaveCount(0);
  await expect(page.getByTestId(`graphic-row-${seeded.bothId}`).getByTestId('row-folder')).toContainText('Straps');
});

test('"Not in a production" is what keeps an unassigned graphic reachable', async ({ page }) => {
  const seeded = await seedLibrary(page);
  await page.getByTestId('library-view-grid').click();
  const filter = page.getByTestId('library-production');

  await filter.selectOption('none');
  await expect(page.locator('.lib-grid > .lib-row')).toHaveCount(1);
  await expect(page.getByTestId(`graphic-row-${seeded.neitherId}`)).toBeVisible();
});

test('a filter the user can no longer see is a filter the user can no longer undo', async ({ page }) => {
  const seeded = await seedLibrary(page);
  await page.getByTestId('library-view-grid').click();

  // THE TYPE CHIP. Only Saturday is the library's one scoreboard and it is in production B, so
  // standing on that chip and then picking production A takes the chip off the screen while the
  // filter goes on excluding everything - an empty list with nothing able to explain it or
  // clear it, which reads as "this production has no graphics".
  await page.getByTestId('type-chip-scoreboard').click();
  await expect(page.locator('.lib-grid > .lib-row')).toHaveCount(1);
  await page.getByTestId('library-production').selectOption(seeded.productionAId);
  // Two, not zero: the scoreboard chip let go the moment its strip did. Production A holds one
  // type, so the whole strip is gone here - which is exactly why the chip could not be undone.
  await expect(page.locator('.lib-grid > .lib-row')).toHaveCount(2);
  await expect(page.getByTestId('type-chips')).toHaveCount(0);
  await page.getByTestId('library-production').selectOption('');

  // "Not in a production" names a set that always exists, but the control that clears it is
  // drawn only while a production is. Deleting the last one must therefore walk the filter out
  // too, or the folder band stays flattened for the rest of the page's life.
  await page.getByTestId('library-production').selectOption('none');
  await expect(page.locator('.lib-grid > .lib-row')).toHaveCount(1);
  await page.evaluate(async (ids: string[]) => {
    const { deleteShow } = await import('/src/model/shows.ts');
    for (const id of ids) deleteShow(id);
  }, [seeded.productionAId, seeded.productionBId]);

  await expect(page.getByTestId('library-production')).toHaveCount(0);
  // Back to the whole library, grouped by folder again rather than stuck flat.
  await expect(page.getByTestId('folder-items')).toBeVisible();
  await expect(page.getByTestId(`graphic-row-${seeded.onlyAId}`)).toBeVisible();
});

test('a pill on a graphic filters to that production', async ({ page }) => {
  const seeded = await seedLibrary(page);
  await page.getByTestId('library-view-grid').click();

  await page
    .getByTestId(`graphic-row-${seeded.onlyBId}`)
    .getByRole('button', { name: 'Saturday Finals' })
    .click();

  await expect(page.getByTestId('library-production')).toHaveValue(seeded.productionBId);
  await expect(page.locator('.lib-grid > .lib-row')).toHaveCount(2);
  await expect(page.getByTestId(`graphic-row-${seeded.onlyAId}`)).toHaveCount(0);
});

test('the table carries a Productions column, with an em dash for a graphic in none', async ({ page }) => {
  const seeded = await seedLibrary(page);
  await page.getByTestId('library-view-list').click();

  await expect(page.getByTestId('library-thead')).toContainText('Productions');
  await expect(page.getByTestId(`graphic-row-${seeded.onlyAId}`).getByTestId('row-productions')).toContainText(
    'Friday Quiz Night',
  );
  // A table cell must fill itself, so here absence is drawn rather than left blank.
  await expect(page.getByTestId(`graphic-row-${seeded.neitherId}`).getByTestId('row-productions')).toHaveText('—');
});

test("a production card's size is the door into its graphics", async ({ page }) => {
  const seeded = await seedLibrary(page);
  await page.goto('/app#/home/productions');
  await expect(page.getByTestId('home-page')).toBeVisible();

  await page.getByTestId(`production-row-${seeded.productionAId}`).getByTestId('browse-production-graphics').click();

  await expect(page).toHaveURL(/#\/home\/graphics$/);
  await expect(page.getByTestId('library-production')).toHaveValue(seeded.productionAId);
  await expect(page.getByTestId(`graphic-row-${seeded.onlyAId}`)).toBeVisible();
  await expect(page.getByTestId(`graphic-row-${seeded.bothId}`)).toBeVisible();
  await expect(page.getByTestId(`graphic-row-${seeded.onlyBId}`)).toHaveCount(0);
});

test('a library with no productions grows no filter and no column', async ({ page }) => {
  // The offline, never-made-a-production case. A facet over nothing narrows nothing, and a
  // column whose cells are all em dashes is the folder column's documented defect again.
  await page.goto('/app#/home/graphics');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.evaluate(async () => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const variant = CATALOG['lower-third']?.[0];
    if (!variant) throw new Error('The lower-third catalog fixture is missing.');
    const template = variant.create({});
    template.name = 'Alone';
    createGraphic(template, { name: 'Alone' });
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await page.getByTestId('library-view-list').click();

  await expect(page.getByTestId('library-production')).toHaveCount(0);
  await expect(page.getByTestId('library-thead')).not.toContainText('Productions');
  await expect(page.getByTestId('row-productions')).toHaveCount(0);
});
