// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// WHOSE LIBRARY IS ON SCREEN: which account's library the page shows, and that a sign-in's
// first sync never pulls or pushes another account's work, is walked against a real backend
// by e2e/configured/shared-lab-computer.spec.ts. Offline, account-library.spec.ts has no cloud.
// The binding, the key names, the sync guard (`canSync`) and the adopt step that decide it.
// covers: src/{backend/{accountLibrary,syncController},model/{accountScope,durableStore}}.ts

import { test, expect, devices, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomBytes } from 'node:crypto';
import { E2E_EMAIL, E2E_PASSWORD, haveCreds, mintAccount, signInOnHome, wipeMyGraphics, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';
import { awaitDurableReady, settleDurableWrites } from '../_durable';

// A SHARED LAB COMPUTER, against a real backend (src/backend/accountLibrary.ts).
//
// Students share classroom computers. One signs in, makes a graphic and signs out; the next
// signs in on the same browser. e2e/account-library.spec.ts drives the library moves offline,
// with made-up account names and no sync. This walk is the same day on a real project, through
// the real Sign in dialog and the real account menu, so the part only a backend has is covered
// too: each student's first sync must never pull the other's work, and never push it into the
// wrong cloud.
//
//   1. Student 1 signs in on Home and makes a graphic; it syncs to their account.
//   2. Student 1 signs out: Home is empty and says "Not signed in".
//   3. Student 2 signs in on the same browser: Home holds none of student 1's work. Student 2
//      makes their own graphic and signs out.
//   4. Student 1 signs in again: their graphic is back, and student 2's is not there.
//   5. The cloud agrees: student 2's rows hold no copy of student 1's graphic, and student 1's
//      graphic opens on a SECOND computer (a fresh browser context), so it was not only local.
//
// Student 1 is the suite's shared test account. Student 2 is minted here through the admin API
// with the service key, like community-pack-review.spec.ts grants its role, and deleted afterwards (the
// account's documents go with it, `on delete cascade`).

const canRun = haveCreds && Boolean(SERVICE_ROLE_KEY && SUPABASE_URL);

const STUDENT_2_EMAIL = 'e2e-lab-student-2@noacg.local';
const STUDENT_2_PASSWORD = 'noacg-e2e-lab-pw';

/** Sign out through the account menu. The page reloads onto the signed-out workspace. */
async function signOutFromMenu(page: Page): Promise<void> {
  const reloaded = page.waitForEvent('load');
  await page.getByTestId('account-button').click();
  await page.getByTestId('account-menu').getByRole('menuitem', { name: 'Sign out' }).click();
  await reloaded;
  await expect(page.getByTestId('auth-state')).toHaveText('Not signed in');
}

/** Save a graphic into the signed-in library through the same model call Save uses, then push
 *  it so the account's cloud holds it before anybody signs out. */
async function makeGraphic(page: Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { error } = createGraphic({ ...variantsFor('lower-third')[0].create({}), name: n }, { name: n, packageId: null });
    if (error) throw new Error(error);
  }, name);
  await settleDurableWrites(page);
  await page.evaluate(async () => {
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
}

/** Graphic names in the library the page is showing, once the mirror is loaded. */
async function libraryNames(page: Page): Promise<string[]> {
  await awaitDurableReady(page);
  return page.evaluate(async () => {
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().map((g) => g.name).sort();
  });
}

/** The account's live cloud GRAPHICS by name - the service key reads past RLS. Other kinds (the
 *  working draft, a look) sync too and are not what this walk is about. */
async function cloudNames(admin: SupabaseClient, userId: string): Promise<string[]> {
  const { data, error } = await admin
    .from('documents')
    .select('name')
    .eq('user_id', userId)
    .eq('kind', 'graphic')
    .eq('deleted', false);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.name as string);
}

test.describe('shared lab computer (configured)', () => {
  test.skip(!canRun, 'needs E2E_EMAIL/E2E_PASSWORD + SUPABASE_SERVICE_ROLE_KEY');
  test.setTimeout(180_000);

  let admin: SupabaseClient;
  let student1 = '';
  let student2 = '';

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    // One page large enough for any test project; the default page of 50 could hide either user.
    const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
    if (listError) throw new Error(`could not list users: ${listError.message}`);
    student1 = list.users.find((u) => u.email === E2E_EMAIL)?.id ?? '';
    student2 = await mintAccount(admin, STUDENT_2_EMAIL, STUDENT_2_PASSWORD);
  });

  test.afterAll(async () => {
    if (!admin || !student2) return;
    const { error } = await admin.auth.admin.deleteUser(student2);
    // Said out loud: the next run deletes the leftover, but only this line says why it is there.
    if (error) console.warn(`shared-lab-computer: student 2 was not deleted: ${error.message}`);
  });

  test('two students take turns on one browser and neither sees nor loses the work of the other', async ({ page, browser, baseURL }) => {
    expect(student1, 'resolved student 1 (the suite test account)').toBeTruthy();
    const tag = randomBytes(3).toString('hex');
    const work1 = `Lab student 1 ${tag}`;
    const work2 = `Lab student 2 ${tag}`;
    const home = page.getByTestId('home-page');

    try {
      // 1. Student 1 signs in and makes a graphic. The shared account arrives holding whatever
      //    earlier specs left, so it starts from an empty library.
      await signInOnHome(page, E2E_EMAIL, E2E_PASSWORD);
      await wipeMyGraphics(page);
      await makeGraphic(page, work1);
      await expect(home.getByText(work1).first()).toBeVisible();
      await expect.poll(() => cloudNames(admin, student1)).toContain(work1);

      // 2. Student 1 signs out. Nothing of theirs stays on screen for the next person.
      await signOutFromMenu(page);
      expect(await libraryNames(page)).toEqual([]);
      await expect(home.getByText(work1)).toHaveCount(0);

      // 3. Student 2 signs in on the same browser. Their first sync has run (signInOnHome waits
      //    for it), so a leak in either direction would be on screen and in the cloud by now.
      await signInOnHome(page, STUDENT_2_EMAIL, STUDENT_2_PASSWORD);
      expect(await libraryNames(page)).toEqual([]);
      await expect(home.getByText(work1)).toHaveCount(0);
      await makeGraphic(page, work2);
      await expect(home.getByText(work2).first()).toBeVisible();
      await expect.poll(() => cloudNames(admin, student2)).toEqual([work2]);
      await signOutFromMenu(page);
      expect(await libraryNames(page)).toEqual([]);

      // 4. Student 1 again: everything where they left it, and nothing of student 2's.
      await signInOnHome(page, E2E_EMAIL, E2E_PASSWORD);
      await expect.poll(() => libraryNames(page)).toEqual([work1]);
      await expect(home.getByText(work1).first()).toBeVisible();
      await expect(home.getByText(work2)).toHaveCount(0);

      // 5. The cloud agrees with the screen, and student 1's work is not only on this computer.
      expect(await cloudNames(admin, student2)).toEqual([work2]);
      expect(await cloudNames(admin, student1)).not.toContain(work2);
      // A second computer: a fresh browser with nothing on it, the same device as the first.
      const anotherComputer = await browser.newContext({ ...devices['Desktop Chrome'], baseURL });
      try {
        const elsewhere = await anotherComputer.newPage();
        await signInOnHome(elsewhere, E2E_EMAIL, E2E_PASSWORD);
        await expect.poll(() => libraryNames(elsewhere)).toEqual([work1]);
      } finally {
        await anotherComputer.close();
      }
    } finally {
      // Leave the shared test account as it was found. Student 2 goes in afterAll.
      await wipeMyGraphics(page).catch(() => undefined);
    }
  });
});
