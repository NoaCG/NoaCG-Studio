import { test, expect, type Page } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// GRAPHICS ARE ACCOUNT-BOUND (src/backend/accountLibrary.ts, src/model/accountScope.ts).
//
// The browser used to keep ONE library whoever signed in, so a second account created on the
// same machine opened Home onto the first account's graphics and productions - and its first
// sync pushed copies of them into its own cloud. Every account now keeps its own library on the
// device and only the one in use is loaded. This drives the moves directly, with no backend:
// a real sign-in only adds the cloud, and the cloud half (never re-minting a foreign record) is
// pinned in sync.spec.ts.

/** Graphic names in the library the page is showing, read once the mirror is loaded. */
async function libraryNames(page: Page): Promise<string[]> {
  await awaitDurableReady(page);
  return page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().map((g) => g.name);
  });
}

/** Ask for `account`'s library where the move reloads the page, and wait for the reload. */
async function switchAndReload(page: Page, account: string | null): Promise<void> {
  const reloaded = page.waitForEvent('load');
  await page.evaluate(async (target) => {
    const { bindLibraryToAccount, releaseLibrary } = await import('/src/backend/accountLibrary.ts');
    // Not awaited: the page reloads out from under it.
    void (target ? bindLibraryToAccount(target) : releaseLibrary());
  }, account);
  await reloaded;
}

test('each account sees only its own library on a shared browser', async ({ page }) => {
  await page.goto('/app');
  await awaitDurableReady(page);

  // Work made while signed out, in the signed-out workspace.
  await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { error } = createGraphic(variantsFor('lower-third')[0].create({}), { name: 'Made by A', packageId: null });
    if (error) throw new Error(error);
  });
  await settleDurableWrites(page);

  // Account A signs in for the first time on this browser: the work becomes A's IN PLACE - no
  // reload, the same library on screen - and it now lives under A's key names only.
  const adopted = await page.evaluate(async () => {
    const { bindLibraryToAccount } = await import('/src/backend/accountLibrary.ts');
    return bindLibraryToAccount('account-a');
  });
  expect(adopted).toBe('ready');
  await settleDurableWrites(page);
  expect(await libraryNames(page)).toEqual(['Made by A']);
  expect(await page.evaluate(() => localStorage.getItem('spx-gfx-account'))).toBe('account-a');

  // A reload keeps showing A's library.
  await page.reload();
  expect(await libraryNames(page)).toEqual(['Made by A']);

  // A's own words in the Create-with-AI setup draft are A's too, like the graphics.
  await page.evaluate(async () => {
    const { emptyGenerationSpec, saveSpecDraft } = await import('/src/model/generationSpec.ts');
    saveSpecDraft({ ...emptyGenerationSpec(), styleNotes: 'A private style note' });
  });

  // Account B signs in on the same browser: A's work is NOT shown to B.
  await switchAndReload(page, 'account-b');
  expect(await libraryNames(page)).toEqual([]);
  expect(
    await page.evaluate(async () => {
      const { loadSpecDraft } = await import('/src/model/generationSpec.ts');
      return loadSpecDraft();
    }),
  ).toBeNull();
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByText('Made by A')).toHaveCount(0);

  // B signs out: the signed-out workspace is empty too - A's work went with A.
  await switchAndReload(page, null);
  expect(await page.evaluate(() => localStorage.getItem('spx-gfx-account'))).toBeNull();
  expect(await libraryNames(page)).toEqual([]);

  // A signs back in: A's library is exactly where A left it.
  await switchAndReload(page, 'account-a');
  expect(await libraryNames(page)).toEqual(['Made by A']);
  expect(
    await page.evaluate(async () => {
      const { loadSpecDraft } = await import('/src/model/generationSpec.ts');
      return loadSpecDraft()?.styleNotes ?? null;
    }),
  ).toBe('A private style note');
});
