// covers: src/backend/auth.ts, src/model/outputSetup.ts, src/components/DefaultOutputPreference.tsx
// covers: src/components/home/{ProductionPage,PlayoutPanel}.tsx
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

test('the CasparCG default is stored by Auth, starts a new production switched on in another browser, and clearing it leaves existing productions alone', async ({ page, browser }) => {
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
  const switchOf = (tab: Page) => tab.getByTestId('production-status-panel').getByTestId('caspar-switch');
  const openPanel = async (tab: Page) => {
    await tab.getByTestId('production-status').click();
    await expect(tab.getByTestId('production-status-panel')).toBeVisible();
  };
  const workflowSettings = async (tab: Page) => {
    await tab.goto('/app#/home');
    await tab.getByTestId('account-button').click();
    await tab.getByTestId('menu-settings').click();
    await tab.getByTestId('settings-nav-workflow').click();
    return tab.getByTestId('default-caspar');
  };
  try {
    expect((await savePreference(page, null)).error).toBeNull();
    // No default: a new production starts with CasparCG off and publishes without asking.
    created.push(await seed(page));
    await openPanel(page);
    await expect(switchOf(page)).not.toBeChecked();
    await page.keyboard.press('Escape');
    await publishProduction(page);
    await expect(page.getByTestId('production-status')).toHaveAttribute('data-started', 'true', { timeout: 30_000 });
    // The account default, set in Settings.
    const box = await workflowSettings(page);
    await expect(box).not.toBeChecked();
    await box.check();
    await expect(box).toBeEnabled();
    const casparDefault: ProductionOutputSetup = { v: 1, destinations: [{ id: 'browser', profile: 'browser' }, { id: 'casparcg', profile: 'casparcg' }] };
    await expect.poll(async () => (await preference(page)).setup, { timeout: 30_000 }).toEqual(casparDefault);
    await page.getByTestId('settings').getByTitle('Close', { exact: true }).click();
    // Another browser on the same account: a new production starts with the switch on, and keeps it.
    await signIn(other);
    await other.keyboard.press('Escape');
    remote.push(await seed(other));
    await openPanel(other);
    await expect(switchOf(other)).toBeChecked({ timeout: 30_000 });
    await other.keyboard.press('Escape');
    await publishProduction(other);
    await expect.poll(() => other.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)?.outputSetup?.destinations.some(d => d.profile === 'casparcg'), remote[0])).toBe(true);
    // Cleared there: the next new production starts off, and the one already made keeps its switch.
    const otherBox = await workflowSettings(other);
    await expect(otherBox).toBeChecked();
    await otherBox.uncheck();
    await expect(otherBox).toBeEnabled();
    await expect.poll(async () => (await preference(other)).setup?.destinations.some(d => d.profile === 'casparcg'), { timeout: 30_000 }).toBe(false);
    await other.getByTestId('settings').getByTitle('Close', { exact: true }).click();
    remote.push(await seed(other));
    await openPanel(other);
    await expect(switchOf(other)).not.toBeChecked();
    await other.keyboard.press('Escape');
    await other.goto(`/app#/production/${remote[0]}`);
    await expect(other.getByTestId('production-page')).toBeVisible();
    await openPanel(other);
    await expect(switchOf(other)).toBeChecked();
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
