// covers: src/backend/auth.ts, src/model/outputSetup.ts, src/components/DefaultOutputPreference.tsx
// covers: src/components/home/{ProductionPage,OutputSetupDialog}.tsx
import { test, expect, type Page } from '@playwright/test';
import { haveCreds, signIn } from './_helpers';
import { awaitDurableReady, settleDurableWrites } from '../_durable';
import { publishProduction } from '../_publish';
import type { ProductionOutputSetup } from '../../src/model/outputSetup';

test.skip(!haveCreds, 'Configured throwaway account is required.');

async function seed(page: Page): Promise<string> {
  await awaitDurableReady(page);
  const id = await page.evaluate(async () => {
    const S = await import('/src/model/shows.ts');
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const result = S.createShowNamedChecked(`Output default check ${Date.now()}`);
    if (result.error) throw Error(result.error);
    S.addGraphicToShow(result.show.id, variantsFor('lower-third')[0].create({}));
    return result.show.id;
  });
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  return id;
}

async function preference(page: Page) {
  return page.evaluate(async () => {
    const sb = await (await import('/src/backend/supabase.ts')).getSupabase();
    const { data } = await sb!.auth.getSession();
    if (!data.session) throw Error('Test account is not signed in');
    return (await import('/src/backend/auth.ts')).readDefaultOutput(data.session.user.id);
  });
}
async function savePreference(page: Page, setup: ProductionOutputSetup | null) {
  return page.evaluate(async setup => {
    const sb = await (await import('/src/backend/supabase.ts')).getSupabase();
    const { data } = await sb!.auth.getSession();
    if (!data.session) throw Error('Test account is not signed in');
    return (await import('/src/backend/auth.ts')).saveDefaultOutput(data.session.user.id, setup);
  }, setup);
}

test('remembered output is stored by Auth, read in another browser, and Ask every time clears it', async ({ page, browser }) => {
  test.setTimeout(360_000);
  page.setDefaultTimeout(30_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  // Recover only this spec's throwaway fixtures after an interrupted run. The account has no
  // real productions; other test records and account metadata remain untouched otherwise.
  const recovered = await page.evaluate(async () => {
    const S = await import('/src/model/shows.ts');
    const own = S.loadShows().filter(s => /^Output default check [0-9]+$/.test(s.name));
    for (const s of own) { await (await import('/src/control/hostedControl.ts')).unpublishControlShow(s.id); S.deleteShow(s.id); }
    if (own.length) await (await import('/src/backend/syncController.ts')).syncNow();
    await (await import('/src/model/durableStore.ts')).commitDurableWrites();
    return own.length;
  });
  if (recovered) expect((await savePreference(page, null)).error).toBeNull();
  const original = await preference(page);
  expect(original.error).toBeNull();
  const created: string[] = [];
  const otherContext = await browser.newContext({ baseURL: new URL(page.url()).origin });
  const other = await otherContext.newPage();
  other.setDefaultTimeout(30_000);
  const remote: string[] = [];
  try {
    expect((await savePreference(page, null)).error).toBeNull();
    created.push(await seed(page));
    await page.getByTestId('production-publish').click();
    await expect(page.getByTestId('output-profile')).toHaveValue('');
    await expect(page.getByTestId('remember-output')).not.toBeChecked();
    await page.getByTestId('output-profile').selectOption('spx');
    await page.getByTestId('remember-output').check();
    await page.getByTestId('confirm-output').click();
    await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
    const chosen: ProductionOutputSetup = { v: 1, destinations: [{ id: 'browser', profile: 'spx' }] };
    await expect.poll(async () => (await preference(page)).setup, { timeout: 30_000 }).toEqual(chosen);
    await expect(page.getByTestId('download-output-embed')).toHaveText('Download SPX template');
    await signIn(other);
    await other.keyboard.press('Escape');
    remote.push(await seed(other));
    await publishProduction(other);
    await expect(other.getByTestId('output-setup-dialog')).toHaveCount(0);
    expect(await other.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)?.outputSetup, remote[0])).toEqual(chosen);
    await other.goto('/app#/home');
    await other.getByTestId('account-button').click();
    await other.getByTestId('menu-settings').click();
    await other.getByTestId('settings-nav-workflow').click();
    await other.getByLabel('Default production output').selectOption('0');
    await expect.poll(async () => (await preference(other)).setup, { timeout: 30_000 }).toBeNull();
    await other.getByTestId('settings').getByTitle('Close', { exact: true }).click();
    remote.push(await seed(other));
    await other.getByTestId('production-publish').click();
    await expect(other.getByTestId('output-profile')).toHaveValue('');
    await other.getByRole('button', { name: 'Cancel', exact: true }).click();
    await expect(other.getByTestId('production-status')).toHaveAttribute('data-started', 'false');
  } finally {
    try {
      for (const [tab, ids] of [[page, created], [other, remote]] as const) {
        if (!ids.length) continue;
        await tab.evaluate(async ids => {
          const S = await import('/src/model/shows.ts');
          const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
          for (const id of ids) { await unpublishControlShow(id); S.deleteShow(id); }
          await (await import('/src/backend/syncController.ts')).syncNow();
          await (await import('/src/model/durableStore.ts')).commitDurableWrites();
        }, ids);
      }
    } finally {
      try { expect((await savePreference(page, original.setup)).error).toBeNull(); }
      finally { await otherContext.close(); }
    }
  }
});
