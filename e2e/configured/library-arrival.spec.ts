// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change: offline there is
// no sync, so there is no first pass to show.
//
// THE LIBRARY ARRIVING ON A NEW BROWSER (docs/SAVED_CONTENT_MODEL.md §3): Home's first-pass state,
// the plan the sync engine hands it, and the state the controller publishes.
// covers: src/components/home/HomePage.tsx, src/backend/{sync,syncController}.ts

import { test, expect, devices, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { haveCreds, settleSync, shot, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';
import { settleDurableWrites } from '../_durable';

// A SIGNED-IN BROWSER THAT HAS NONE OF THE ACCOUNT'S LIBRARY YET.
//
// The first sync on a new browser can take a minute for a real library, and Home used to spend it
// saying "Nothing saved yet", which reads as data loss. Home now says the library is on its way,
// with a count once the cloud has been listed, and says so again if that pass fails.
//
//   1. Computer A: a new account signs in. Its cloud is empty, so Home gives the first-run hint as
//      it always did. It saves three graphics and a production, and they sync.
//   2. Computer B, a fresh browser: the same account signs in while the cloud cannot be listed.
//      Home says the library has not arrived yet and offers Try again.
//   3. The cloud answers again but the records are held in flight: Try again shows the library
//      arriving, counted. Screenshots at desktop and phone width.
//   4. The records land: Home lists the library, and a reload never shows the arrival again.
//
// The account is minted here through the admin API, so its counts are exactly what this walk put
// in it, and deleted afterwards (its documents go with it, `on delete cascade`).

const canRun = haveCreds && Boolean(SERVICE_ROLE_KEY && SUPABASE_URL);

const EMAIL = 'e2e-library-arrival@noacg.local';
const PASSWORD = 'noacg-e2e-arrival-pw';

/** Sign in through Home's own Sign in button. Leaves the first sync running. */
async function signInOnHome(page: Page): Promise<void> {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('auth-state')).toHaveText('Not signed in');
  await page.locator('.auth-signin').click();
  await page.locator('#auth-email').fill(EMAIL);
  await page.locator('#auth-pass').fill(PASSWORD);
  await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.auth-status')).toBeVisible({ timeout: 20_000 });
}

/** The pass's listing of the cloud: summaries only (backend/supabaseProvider.ts `list`). */
function isCloudListing(url: URL): boolean {
  return url.pathname.endsWith('/rest/v1/documents') && (url.searchParams.get('select') ?? '').startsWith('id,deleted');
}

/** The pass's batch fetch of whole records (`getMany`), the long part of a first pass. */
function isWholeRecordFetch(url: URL): boolean {
  return (
    url.pathname.endsWith('/rest/v1/documents') &&
    (url.searchParams.get('select') ?? '').startsWith('id,kind,name,body') &&
    (url.searchParams.get('id') ?? '').startsWith('in.')
  );
}

/** Live cloud documents of one kind, read past RLS with the service key. */
async function cloudCount(admin: SupabaseClient, userId: string, kind: string): Promise<number> {
  const { count, error } = await admin
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('kind', kind)
    .eq('deleted', false);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

test.describe('library arriving on a new browser (configured)', () => {
  test.skip(!canRun, 'needs E2E_EMAIL/E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY');
  test.setTimeout(180_000);

  let admin: SupabaseClient;
  let userId = '';

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw new Error(`could not list users: ${listError.message}`);
    // A leftover from a run that died before its cleanup would arrive holding that run's library.
    const leftover = list.users.find((u) => u.email === EMAIL);
    if (leftover) {
      const { error } = await admin.auth.admin.deleteUser(leftover.id);
      if (error) throw new Error(`could not delete a leftover account: ${error.message}`);
    }
    const { data, error } = await admin.auth.admin.createUser({ email: EMAIL, password: PASSWORD, email_confirm: true });
    if (error) throw new Error(`could not create the account: ${error.message}`);
    userId = data.user.id;
  });

  test.afterAll(async () => {
    if (!admin || !userId) return;
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`library-arrival: the account was not deleted: ${error.message}`);
  });

  test('Home says the library is on its way, not that nothing is saved', async ({ page, browser, baseURL }) => {
    // 1. Computer A: a brand-new account. Its first pass finds an empty cloud, and that IS an
    //    empty library, so the first-run hint is the right answer.
    await signInOnHome(page);
    await settleSync(page);
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
    await expect(page.getByTestId('library-arrival')).toHaveCount(0);

    await page.evaluate(async () => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { createGraphic } = await import('/src/model/library.ts');
      const { createShowNamedChecked } = await import('/src/model/shows.ts');
      for (const name of ['Arrival one', 'Arrival two', 'Arrival three']) {
        const { error } = createGraphic({ ...variantsFor('lower-third')[0].create({}), name }, { name, packageId: null });
        if (error) throw new Error(error);
      }
      const { error } = createShowNamedChecked('Arrival show');
      if (error) throw new Error(error);
    });
    await settleDurableWrites(page);
    await page.evaluate(async () => {
      const { syncNow } = await import('/src/backend/syncController.ts');
      await syncNow();
    });
    await expect.poll(() => cloudCount(admin, userId, 'graphic')).toBe(3);
    await expect.poll(() => cloudCount(admin, userId, 'show')).toBe(1);

    // 2. Computer B: a fresh browser, the cloud unreachable for the first pass.
    const computerB = await browser.newContext({ ...devices['Desktop Chrome'], baseURL });
    const b = await computerB.newPage();
    let listingFails = true;
    await b.route(isCloudListing, (route) =>
      listingFails ? route.fulfill({ status: 503, body: '{"message":"unavailable"}' }) : route.continue(),
    );
    let releaseRecords!: () => void;
    const recordsReleased = new Promise<void>((resolve) => (releaseRecords = resolve));
    await b.route(isWholeRecordFetch, async (route) => {
      await recordsReleased;
      await route.continue();
    });
    try {
      await signInOnHome(b);
      const failed = b.getByTestId('library-arrival-failed');
      await expect(failed).toBeVisible({ timeout: 20_000 });
      await expect(failed).toContainText('Your library has not reached this browser yet');
      await expect(b.getByText('Nothing saved yet')).toHaveCount(0);
      await shot(b, 'library-arrival-failed-desktop');
      const desktop = b.viewportSize();
      await b.setViewportSize({ width: 390, height: 844 });
      await shot(b, 'library-arrival-failed-phone');
      if (desktop) await b.setViewportSize(desktop);

      // 3. The cloud answers; the whole records stay in flight. Try again brings the arrival,
      //    counted from the listing.
      listingFails = false;
      await b.getByTestId('library-arrival-retry').click();
      const arrival = b.getByTestId('library-arrival');
      await expect(arrival).toBeVisible();
      await expect(b.getByTestId('library-arrival-count')).toHaveText(
        '3 graphics and 1 production are on their way from your account.',
      );
      await expect(b.getByText('Nothing saved yet')).toHaveCount(0);
      await shot(b, 'library-arrival-desktop');
      // The sections that list the library say the same, not "No productions yet".
      await b.getByTestId('home-nav-productions').click();
      await expect(arrival).toBeVisible();
      await expect(b.getByTestId('no-productions')).toHaveCount(0);
      await b.getByTestId('home-nav-graphics').click();
      await expect(arrival).toBeVisible();
      await b.getByTestId('home-door').click();
      await b.setViewportSize({ width: 390, height: 844 });
      await expect(arrival).toBeVisible();
      await shot(b, 'library-arrival-phone');

      // 4. The records land: the library replaces the arrival, and the first pass is behind us.
      releaseRecords();
      await settleSync(b);
      await expect(arrival).toHaveCount(0);
      await expect(b.getByTestId('shelf-graphic')).toHaveCount(3);
      await expect(b.getByText('Arrival show').first()).toBeVisible();
      await b.reload();
      await expect(b.getByTestId('shelf-graphic')).toHaveCount(3);
      await expect(b.getByTestId('library-arrival')).toHaveCount(0);
    } finally {
      releaseRecords();
      await b.unrouteAll({ behavior: 'ignoreErrors' });
      await computerB.close();
    }
  });
});
