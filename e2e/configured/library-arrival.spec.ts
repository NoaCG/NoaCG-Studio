// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change: offline there is
// no sync, so there is no first pass to show.
//
// THE LIBRARY ARRIVING ON A NEW BROWSER (docs/SAVED_CONTENT_MODEL.md §3): Home's first-pass state,
// the plan the sync engine hands it, and the state the controller publishes.
// covers: src/components/home/HomePage.tsx, src/backend/{sync,syncController,assets,supabaseProvider}.ts

import { createHash } from 'node:crypto';
import { test, expect, devices } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { haveCreds, mintAccount, settleSync, shot, signInOnHome, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';
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
const PHONE = { width: 390, height: 844 };

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
    userId = await mintAccount(admin, EMAIL, PASSWORD);
  });

  test.afterAll(async () => {
    if (!admin || !userId) return;
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`library-arrival: the account was not deleted: ${error.message}`);
  });

  test('Home says the library is on its way, not that nothing is saved', async ({ page, browser, baseURL }) => {
    // 1. Computer A: a brand-new account. Its first pass finds an empty cloud, and that IS an
    //    empty library, so the first-run hint is the right answer.
    await signInOnHome(page, EMAIL, PASSWORD);
    await expect(page.getByText('Nothing saved yet')).toBeVisible();
    await expect(page.getByTestId('library-arrival')).toHaveCount(0);

    await page.evaluate(async () => {
      const { variantsFor } = await __noacgImport('/src/templates/catalog.ts');
      const { createGraphic } = await __noacgImport('/src/model/library.ts');
      const { createShowNamedChecked } = await __noacgImport('/src/model/shows.ts');
      for (const name of ['Arrival one', 'Arrival two', 'Arrival three']) {
        const { error } = createGraphic({ ...variantsFor('lower-third')[0].create({}), name }, { name, packageId: null });
        if (error) throw new Error(error);
      }
      const { error } = createShowNamedChecked('Arrival show');
      if (error) throw new Error(error);
    });
    await settleDurableWrites(page);
    await page.evaluate(async () => {
      const { syncNow } = await __noacgImport('/src/backend/syncController.ts');
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
      await signInOnHome(b, EMAIL, PASSWORD, { settle: false });
      const failed = b.getByTestId('library-arrival-failed');
      await expect(failed).toBeVisible({ timeout: 20_000 });
      await expect(failed).toContainText('Your library has not reached this browser yet');
      await expect(b.getByText('Nothing saved yet')).toHaveCount(0);
      await shot(b, 'library-arrival-failed-desktop');
      const desktop = b.viewportSize();
      await b.setViewportSize(PHONE);
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
      await b.setViewportSize(PHONE);
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
      await expect(arrival).toHaveCount(0);
    } finally {
      releaseRecords();
      await b.unrouteAll({ behavior: 'ignoreErrors' });
      await computerB.close();
    }
  });
});

// Past the shared client's limit on a request nobody answers (backend/supabase.ts).
const PAST_THE_LIMIT = 76_000;

// A LIBRARY SYNC THE CLOUD STOPPED ANSWERING (#2154). After a pass that got no answer, the next one
// goes by itself on a backed-off timer, so with the cloud back and nobody touching the page the
// chip settles without a press. The account is minted as above.
const RETRY_EMAIL = 'e2e-library-retry@noacg.local';
// Past the first retry's wait (backend/syncController.ts: 15 s, spread by a quarter either way).
const PAST_THE_FIRST_RETRY = 20_000;

test.describe('a library sync the cloud stopped answering (configured)', () => {
  test.skip(!canRun, 'needs E2E_EMAIL/E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY');

  let admin: SupabaseClient;
  let userId = '';

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    userId = await mintAccount(admin, RETRY_EMAIL, PASSWORD);
  });

  test.afterAll(async () => {
    if (!admin || !userId) return;
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`library-arrival: the retry account was not deleted: ${error.message}`);
  });

  test('the chip settles by itself once the cloud answers again', async ({ page }) => {
    let silent = false;
    let held = 0;
    await page.route(/\/rest\/v1\/documents/, (route) => {
      if (!silent) return route.continue();
      held += 1;
      return new Promise<void>(() => {});
    });
    await page.clock.install();
    await signInOnHome(page, RETRY_EMAIL, PASSWORD);
    silent = true;
    await page.evaluate(async () => {
      const { error } = (await __noacgImport('/src/model/shows.ts')).createShowNamedChecked('Saved by the retry');
      if (error) throw new Error(error);
      await new Promise((resolve) => setTimeout(resolve));
    });
    await page.clock.fastForward(3_000);
    await expect.poll(() => held).toBeGreaterThan(0);
    await page.clock.fastForward(PAST_THE_LIMIT);
    const chip = page.getByTestId('sync-status');
    await expect(chip).toHaveText('Not synced');
    await chip.click();
    await expect(page.getByTestId('sync-detail')).toHaveText(/^The cloud did not answer/);
    await page.keyboard.press('Escape');

    // The cloud is back. Nobody presses, edits or focuses the window.
    silent = false;
    await page.clock.fastForward(PAST_THE_FIRST_RETRY);
    await settleSync(page);
    await expect.poll(() => cloudCount(admin, userId, 'show')).toBe(1);
  });
});

// SOUNDS ARRIVING WHILE STORAGE IS SILENT (#2152). The database answers and Storage does not. A
// sound that gets no answer ends the pass, as an image does, so the next record is not asked and
// the chip says why after one limit, not one limit per record. The account is minted as above.
const SOUND_EMAIL = 'e2e-library-sounds@noacg.local';

test.describe('sounds the cloud does not answer for (configured)', () => {
  test.skip(!canRun, 'needs E2E_EMAIL/E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY');

  let admin: SupabaseClient;
  let userId = '';

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    userId = await mintAccount(admin, SOUND_EMAIL, PASSWORD);
  });

  test.afterAll(async () => {
    if (!admin || !userId) return;
    const { data } = await admin.storage.from('user-assets').list(userId);
    if (data?.length) await admin.storage.from('user-assets').remove(data.map((o) => `${userId}/${o.name}`));
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.warn(`library-arrival: the sound account was not deleted: ${error.message}`);
  });

  test('a sound with no answer stops the pass at the first record, and the retry brings them all', async ({ page }) => {
    await page.clock.install();
    await signInOnHome(page, SOUND_EMAIL, PASSWORD);
    // Another device saved three looks, each with a sound this browser has never cached.
    for (let i = 0; i < 3; i++) {
      const bytes = Buffer.from(`sound ${i}`);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const storageKey = `${userId}/audio-${hash}`;
      const upload = await admin.storage.from('user-assets').upload(storageKey, bytes, { contentType: 'audio/wav', upsert: true });
      if (upload.error) throw new Error(upload.error.message);
      const id = crypto.randomUUID();
      const body = { id, name: `Sting ${i}`, updatedAt: new Date().toISOString(), deleted: false, sting: { hash, name: 'sting.wav', bytes: bytes.length, mime: 'audio/wav', storageKey } };
      const { error } = await admin.from('documents').insert({ id, user_id: userId, kind: 'look', name: body.name, body, deleted: false });
      if (error) throw new Error(error.message);
    }
    let silent = true;
    const asked: string[] = [];
    await page.route(/\/storage\/v1\/object\/.*\/audio-/, (route) => {
      asked.push(route.request().url());
      return silent ? new Promise<void>(() => {}) : route.continue();
    });
    await page.evaluate(async () => { void (await __noacgImport('/src/backend/syncController.ts')).syncNow(); });
    await expect.poll(() => asked.length).toBe(1);
    await page.clock.fastForward(PAST_THE_LIMIT);
    // The pass that got no answer arms the automatic retry (backend/syncController.ts: 15 s, spread
    // by a quarter), which would ask for a sound again and break the exact counts here. Hold the
    // page clock a second on until Sync now is pressed, whose pass takes the retry's place.
    await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1_000));
    const chip = page.getByTestId('sync-status');
    await expect(chip).toHaveText('Not synced');
    await chip.click();
    await expect(page.getByTestId('sync-detail')).toHaveText(/^The cloud did not answer/);
    expect(asked, 'the records after the first were not asked about').toHaveLength(1);

    silent = false;
    await page.clock.resume();
    await page.getByTestId('sync-action').click();
    await settleSync(page);
    expect(asked).toHaveLength(4);
    const looks = await page.evaluate(async () => (await __noacgImport('/src/model/packets.ts')).loadAllLooks().filter((l) => l.name.startsWith('Sting ')).length);
    expect(looks).toBe(3);
  });
});
