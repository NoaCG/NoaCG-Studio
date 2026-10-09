// covers: src/components/wizard/steps/CommunityPacks.tsx, src/components/community/SubmitPackSheet.tsx, src/components/home/sections/GraphicsSection.tsx, src/community/{packs,packChecks,packSources,librarySource}.ts, src/validation/networkBench.ts, supabase/migrations/0086_community_pack_reports.sql, supabase/migrations/0079_community_packs.sql, supabase/migrations/0080_community_pack_update.sql, supabase/migrations/0082_community_pack_submit_open.sql
//
// THE COMMUNITY PACK REVIEW LOOP (docs/work-specs/community-packs/spec.md, first slice): a NoaCG
// admin submits a folder of their own graphics from the wizard's shelf, sees it In review,
// approves it from Waiting for review, and a signed-out visitor then finds it beside the seeds and
// installs it as a production with one starter cue per graphic; Take down removes it again and the
// maker reads the reason. A signed-in account that is not an admin gets the submit door (D12).
// Then an update (AC-11): the maker sends a new version of a live pack, it waits for review while
// the live one stays on the shelf, approval replaces it, and Install gives the new version while
// the old install stays as it was; withdrawing the live pack takes a waiting update with it. Last,
// the server takes a submit from an account that is not an admin, which waits for review and
// which that account cannot approve, and refuses one whose `community.publish` is switched off.
// And from Home (slice 4 (a)): a folder's ⋯, opened by right-click, and a selection's ⋯ open the
// same sheet with that source chosen, leaving out what was installed from the shelf; signed out,
// Home offers neither. Send refuses a graphic that makes an outside request (D5) and names it. A
// signed-in account reports a live pack; the admin reads it under Reported and dismisses it.
// Needs the service_role key to mint the two accounts and grant the admin role.

import { test, expect, type Page } from '@playwright/test';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { mintAccount, signInOnHome, SERVICE_ROLE_KEY, SUPABASE_URL } from './_helpers';
import { settleDurableWrites } from '../_durable';

const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY ?? '';
const canRun = Boolean(SERVICE_ROLE_KEY && SUPABASE_URL);
const ADMIN_EMAIL = 'e2e-pack-admin@example.test';
const MAKER_EMAIL = 'e2e-pack-maker@example.test';
const PASSWORD = 'e2e-pack-review-pw-1';
const PACK = `E2E pack ${Date.now()}`;
/** Frames for a person to look at, off by default: `NOACG_SHOTS=<dir>` writes them. */
const SHOTS = process.env.NOACG_SHOTS ?? '';

/** Lower thirds of the given names, made in the library and filed in one Home folder. The
 *  `installed` ones carry the stamp an install from the shelf gives. */
async function makeFolder(page: Page, folder: string, names: string[], installed: string[] = []): Promise<void> {
  await page.evaluate(
    async ({ folder, names, installed }) => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { createGraphic, setGraphicsFolder } = await import('/src/model/library.ts');
      const variants = variantsFor('lower-third');
      const fromPack = { id: 'community:e2e', version: 1, author: 'Someone else', name: 'Elsewhere' };
      const made = [...names, ...installed].map((name, i) =>
        createGraphic(variants[i % variants.length].create({}), {
          name,
          packageId: null,
          ...(installed.includes(name) ? { fromPack } : {}),
        }),
      );
      const failed = made.find((m) => m.error);
      if (failed) throw new Error(failed.error ?? '');
      const error = setGraphicsFolder(made.map((m) => m.doc.id), folder);
      if (error) throw new Error(error);
    },
    { folder, names, installed },
  );
}

/** Home's Graphics section, re-read after graphics were made in the page. */
async function openHomeGraphics(page: Page): Promise<void> {
  await settleDurableWrites(page);
  await page.goto('/app#/home/graphics');
  await page.reload();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await declineConsent(page);
}

/** The optional-analytics banner sits over the lower cards and the bulk bar; decline it so it
 *  covers nothing. */
async function declineConsent(page: Page): Promise<void> {
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible()) await consent.getByRole('button', { name: 'No thanks' }).click();
}

/** How many graphics each of this browser's productions of that name holds, fewest first. */
async function productionSizes(page: Page, name: string): Promise<number[]> {
  return page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows()
      .filter((s) => s.name === name)
      .map((s) => s.graphics.length)
      .sort((a, b) => a - b);
  }, name);
}

/** Install the shelf's card of that name and land on its production, one starter cue per graphic. */
async function install(page: Page, name: string, cues: number): Promise<void> {
  await page.locator('.wz-community-card', { hasText: name }).getByRole('button', { name: `Install ${name}` }).click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('select-cue')).toHaveCount(cues);
}

async function openShelf(page: Page): Promise<void> {
  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click();
  await page.getByTestId('wz-buildmode').locator('[data-build-mode="community"]').click();
  await expect(page.getByTestId('community-packs')).toBeVisible();
  await declineConsent(page);
}

test.describe('community pack review (configured)', () => {
  test.skip(!canRun, 'set VITE_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run the community pack review loop');
  test.use({ viewport: { width: 1366, height: 768 } });

  let admin: SupabaseClient;
  const ids: string[] = [];

  test.beforeAll(async () => {
    admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    ids.push(await mintAccount(admin, ADMIN_EMAIL, PASSWORD), await mintAccount(admin, MAKER_EMAIL, PASSWORD));
    const { error } = await admin.from('moderators').upsert({ user_id: ids[0], note: 'e2e community packs' });
    if (error) throw new Error(error.message);
  });

  test.afterAll(async () => {
    if (!admin) return;
    await admin.from('community_packs').delete().in('author_id', ids);
    await admin.from('moderators').delete().in('user_id', ids);
    for (const id of ids) await admin.auth.admin.deleteUser(id);
  });

  test('an admin submits a folder, approves it, a visitor installs it, and Take down removes it', async ({ page, browser }) => {
    await signInOnHome(page, ADMIN_EMAIL, PASSWORD);
    await makeFolder(page, PACK, ['Third 1', 'Third 2']);

    // SUBMIT: the folder, its two graphics ticked, a description and a chosen name.
    await openShelf(page);
    await page.getByTestId('submit-pack-open').click();
    const sheet = page.getByTestId('submit-pack');
    await sheet.getByTestId('submit-pack-source').selectOption(`folder:${PACK}`);
    await expect(sheet.getByRole('checkbox')).toHaveCount(2);
    await expect(sheet.getByTestId('submit-pack-name')).toHaveValue(PACK);
    await expect(sheet.getByTestId('submit-pack-go')).toBeDisabled();
    await sheet.getByTestId('submit-pack-description').fill('Two lower thirds for a test');
    await sheet.getByTestId('submit-pack-author').fill('Pack Tester');
    await expect(sheet.getByTestId('submit-pack-findings')).toHaveCount(0);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/submit-sheet-desktop.png` });
    await sheet.getByTestId('submit-pack-go').click();
    await expect(sheet).toHaveCount(0);
    const mine = page.getByTestId('your-packs').locator('.wz-community-row', { hasText: PACK });
    await expect(mine).toContainText('In review');

    // Nobody else sees it yet.
    const visitor = await browser.newPage();
    await openShelf(visitor);
    await expect(visitor.locator('[data-community-pack="pub-quiz"]')).toBeVisible();
    await expect(visitor.locator('.wz-community-card', { hasText: PACK })).toHaveCount(0);

    // REVIEW: the checks run again on what was stored, then Approve.
    const review = page.getByTestId('waiting-packs').locator('.wz-community-row', { hasText: PACK });
    await expect(review).toContainText('Checks passed');
    await expect(review).toContainText('by Pack Tester');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/review-shelf-desktop.png` });
    if (SHOTS) {
      await page.setViewportSize({ width: 375, height: 812 });
      await page.getByTestId('your-packs').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/review-shelf-phone.png` });
      await page.setViewportSize({ width: 1366, height: 768 });
    }
    await review.getByRole('button', { name: 'Approve' }).click();
    await expect(mine).toContainText('Live');

    // LIVE: a signed-out visitor finds it after the seeds and installs it.
    await openShelf(visitor);
    const card = visitor.locator('.wz-community-card', { hasText: PACK });
    await expect(card).toContainText('by Pack Tester');
    await expect(card).toContainText('CC BY 4.0');
    await expect(card.locator('.wz-mini iframe')).toHaveCount(1, { timeout: 15_000 });
    if (SHOTS) {
      // A live render settles after it mounts; give it a moment before the frame is taken.
      await visitor.setViewportSize({ width: 1366, height: 768 });
      await card.scrollIntoViewIfNeeded();
      await visitor.waitForTimeout(2500);
      await visitor.screenshot({ path: `${SHOTS}/shared-card-desktop.png` });
      await visitor.setViewportSize({ width: 375, height: 812 });
      await card.scrollIntoViewIfNeeded();
      await visitor.waitForTimeout(1500);
      await visitor.screenshot({ path: `${SHOTS}/shared-card-phone.png` });
      await visitor.setViewportSize({ width: 1366, height: 768 });
    }
    await install(visitor, PACK, 2);

    // An account that is not an admin has the submit door (D12), and no admin's Take down.
    const maker = await browser.newPage();
    await signInOnHome(maker, MAKER_EMAIL, PASSWORD);
    await openShelf(maker);
    const makerCard = maker.locator('.wz-community-card', { hasText: PACK });
    await expect(makerCard).toBeVisible();
    await expect(maker.getByTestId('submit-pack-open')).toBeVisible();
    await expect(makerCard.getByRole('button', { name: 'Take down' })).toHaveCount(0);

    // REPORT: that account reports the pack with what is wrong with it, and hears nothing more.
    // Signed out there is no Report, and the maker's own card has none.
    await expect(visitor.locator('.wz-community-card', { hasText: PACK }).getByRole('button', { name: 'Report' })).toHaveCount(0);
    await expect(page.locator('.wz-community-card', { hasText: PACK }).getByRole('button', { name: 'Report' })).toHaveCount(0);
    await makerCard.getByRole('button', { name: 'Report' }).click();
    await makerCard.getByLabel('What is wrong with it').fill('Uses a logo it has no right to');
    await makerCard.getByRole('button', { name: 'Report' }).click();
    await expect(makerCard).toContainText('Reported. Thank you.');
    await expect(makerCard.getByRole('button', { name: 'Report' })).toHaveCount(0);
    if (SHOTS) await maker.screenshot({ path: `${SHOTS}/reported-card-desktop.png` });

    // The admin reads it under Reported, with the reason, and dismisses it: the pack stays live.
    await openShelf(page);
    const reported = page.getByTestId('reported-packs').locator('.wz-community-row', { hasText: PACK });
    await expect(reported).toContainText('1 report');
    await expect(reported).toContainText('Uses a logo it has no right to');
    if (SHOTS) {
      await reported.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/reported-row-desktop.png` });
    }
    await reported.getByRole('button', { name: 'Dismiss' }).click();
    await expect(page.getByTestId('reported-packs')).toHaveCount(0);
    await expect(page.locator('.wz-community-card', { hasText: PACK })).toHaveCount(1);

    // TAKE DOWN with a reason the maker reads; the shelf stops offering it.
    const live = page.locator('.wz-community-card', { hasText: PACK });
    await live.getByRole('button', { name: 'Take down' }).click();
    await live.getByLabel('Reason the maker reads').fill('Test takedown');
    await live.getByRole('button', { name: 'Take down' }).click();
    await expect(live).toHaveCount(0);
    await expect(mine).toContainText('Taken down');
    await expect(mine).toContainText('Test takedown');
    await openShelf(visitor);
    await expect(visitor.locator('.wz-community-card', { hasText: PACK })).toHaveCount(0);
    // The production installed before the takedown is still the visitor's.
    await visitor.goto('/app#/home/productions');
    await expect(visitor.getByText(PACK).first()).toBeVisible();

    // WITHDRAW: the maker sends the folder again and takes it back before anyone decides.
    await page.getByTestId('submit-pack-open').click();
    const again = page.getByTestId('submit-pack');
    await again.getByTestId('submit-pack-source').selectOption(`folder:${PACK}`);
    await again.getByTestId('submit-pack-name').fill(`${PACK} again`);
    await again.getByTestId('submit-pack-description').fill('Sent to be withdrawn');
    // The name chosen on the previous pack is the only pre-fill (D15).
    await expect(again.getByTestId('submit-pack-author')).toHaveValue('Pack Tester');
    await again.getByTestId('submit-pack-go').click();
    const second = page.getByTestId('your-packs').locator('.wz-community-row', { hasText: `${PACK} again` });
    await expect(second).toContainText('In review');
    await second.getByRole('button', { name: 'Withdraw' }).click();
    await page.getByTestId('withdraw-pack-go').click();
    await expect(second).toContainText('Withdrawn');
    await expect(page.getByTestId('waiting-packs')).toHaveCount(0);
  });

  test('a maker updates a live pack: the update waits beside it, approval replaces it, and Install gives the new one', async ({ page, browser }) => {
    const SERIES = `${PACK} series`;
    await signInOnHome(page, ADMIN_EMAIL, PASSWORD);
    await makeFolder(page, SERIES, ['Opener', 'Closer']);

    // Version 1: the folder's first graphic only, approved onto the shelf.
    await openShelf(page);
    await page.getByTestId('submit-pack-open').click();
    const sheet = page.getByTestId('submit-pack');
    await sheet.getByTestId('submit-pack-source').selectOption(`folder:${SERIES}`);
    await sheet.getByRole('checkbox').nth(1).uncheck();
    await sheet.getByTestId('submit-pack-description').fill('A series opener');
    await sheet.getByTestId('submit-pack-author').fill('Pack Tester');
    await sheet.getByTestId('submit-pack-go').click();
    await expect(sheet).toHaveCount(0);
    const waiting = page.getByTestId('waiting-packs').locator('.wz-community-row', { hasText: SERIES });
    await waiting.getByRole('button', { name: 'Approve' }).click();
    const mine = page.getByTestId('your-packs').locator('.wz-community-row', { hasText: SERIES });
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('Live');

    // A visitor installs version 1 before the update exists.
    const visitor = await browser.newPage();
    await openShelf(visitor);
    await install(visitor, SERIES, 1);

    // UPDATE: the same sheet, filled from the live version; both graphics go in this time.
    await mine.getByRole('button', { name: 'Submit an update' }).click();
    const update = page.getByTestId('submit-pack');
    await expect(update).toContainText(`Update “${SERIES}”`);
    await expect(update.getByTestId('submit-pack-source')).toHaveValue(`folder:${SERIES}`);
    await expect(update.getByRole('checkbox')).toHaveCount(2);
    await expect(update.getByTestId('submit-pack-name')).toHaveValue(SERIES);
    await expect(update.getByTestId('submit-pack-description')).toHaveValue('A series opener');
    await expect(update.getByTestId('submit-pack-author')).toHaveValue('Pack Tester');
    await update.getByTestId('submit-pack-description').fill('A series opener and closer');
    await update.getByTestId('submit-pack-go').click();
    await expect(update).toHaveCount(0);

    // The update waits for review while the live version stays on the shelf; one waits at a time.
    await expect(mine).toHaveCount(2);
    await expect(mine.filter({ hasText: 'In review' })).toContainText('version 2');
    await expect(mine.filter({ hasText: 'Live' }).getByRole('button', { name: 'Submit an update' })).toHaveCount(0);
    const live = page.locator('.wz-community-card', { hasText: SERIES });
    await expect(live).toHaveCount(1);
    await expect(live).toContainText('1 graphic');
    await expect(waiting).toContainText('version 2');
    await expect(waiting).toContainText('Checks passed');
    if (SHOTS) {
      await page.getByTestId('your-packs').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/update-waiting-desktop.png` });
      await page.setViewportSize({ width: 375, height: 812 });
      await page.getByTestId('your-packs').scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/update-waiting-phone.png` });
      await page.setViewportSize({ width: 1366, height: 768 });
    }

    // Approval replaces the old version: one row, one card, the new contents.
    await waiting.getByRole('button', { name: 'Approve' }).click();
    await expect(mine).toHaveCount(1);
    await expect(mine).toContainText('Live · version 2');
    await expect(live).toHaveCount(1);
    await expect(live).toContainText('2 graphics');
    if (SHOTS) {
      await live.scrollIntoViewIfNeeded();
      await page.screenshot({ path: `${SHOTS}/update-approved-desktop.png` });
    }

    // Install now gives version 2; the production installed from version 1 is as it was.
    await openShelf(visitor);
    const card = visitor.locator('.wz-community-card', { hasText: SERIES });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('A series opener and closer');
    await install(visitor, SERIES, 2);
    expect(await productionSizes(visitor, SERIES)).toEqual([1, 2]);

    // WITHDRAW the live pack while another update waits: both go, and the shelf stops offering it.
    await mine.getByRole('button', { name: 'Submit an update' }).click();
    await page.getByTestId('submit-pack-go').click();
    await expect(mine.filter({ hasText: 'In review' })).toContainText('version 3');
    await mine.filter({ hasText: 'Live' }).getByRole('button', { name: 'Withdraw' }).click();
    await expect(page.getByTestId('withdraw-pack')).toContainText('its waiting update is withdrawn with it');
    await page.getByTestId('withdraw-pack-go').click();
    await expect(mine.filter({ hasText: 'Withdrawn' })).toHaveCount(2);
    await expect(live).toHaveCount(0);
    await expect(page.getByTestId('waiting-packs')).toHaveCount(0);
  });

  test('Home: a folder and a selection open the submit sheet with their own graphics chosen', async ({ page, browser }) => {
    const QUIZ = `${PACK} quiz`;
    const OTHER = `${PACK} other`;
    await signInOnHome(page, MAKER_EMAIL, PASSWORD);
    await makeFolder(page, QUIZ, ['Home Question', 'Home Answer', 'Home Score'], ['Home Installed']);
    await makeFolder(page, OTHER, ['Home Opener']);
    await openHomeGraphics(page);

    // THE FOLDER: its ⋯, reached by right-click, offers the submit; the sheet has no source to
    // choose, ticks the three graphics this account made and says the installed one is left out.
    const folder = page.getByTestId(`folder-item-${QUIZ}`);
    await folder.click({ button: 'right' });
    await folder.getByTestId('submit-to-community').click();
    const sheet = page.getByTestId('submit-pack');
    await expect(sheet.getByTestId('submit-pack-source')).toHaveCount(0);
    await expect(sheet.getByRole('checkbox')).toHaveCount(3);
    await expect(sheet.getByTestId('submit-pack-left-out')).toHaveText('1 installed from Community packs is left out.');
    await expect(sheet.getByTestId('submit-pack-name')).toHaveValue(QUIZ);
    await sheet.getByTestId('submit-pack-description').fill('A quiz made on Home');
    await sheet.getByTestId('submit-pack-author').fill('Home Maker');
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-submit-folder-desktop.png` });
    await sheet.getByTestId('submit-pack-go').click();
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('bulk-note')).toContainText(`Sent "${QUIZ}" for review`);

    // THE SELECTION: two graphics from two folders, found by a search; the bar's ⋯ opens the same
    // sheet with those two, no name (they share no folder) and the last pack's Shown as (D15).
    await page.getByTestId('home-search').fill('Home');
    for (const name of ['Home Answer', 'Home Opener']) {
      await page.locator('.lib-row', { hasText: name }).getByTestId('select-graphic').click();
    }
    await expect(page.getByTestId('bulk-bar')).toContainText('2 selected');
    await page.getByTestId('bulk-more').click();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-submit-selection-menu-desktop.png` });
    await page.getByTestId('bulk-bar').getByTestId('submit-to-community').click();
    await expect(sheet.getByRole('checkbox')).toHaveCount(2);
    await expect(sheet.getByTestId('submit-pack-left-out')).toHaveCount(0);
    await expect(sheet.getByTestId('submit-pack-name')).toHaveValue('');
    await expect(sheet.getByTestId('submit-pack-author')).toHaveValue('Home Maker');
    await sheet.getByTestId('submit-pack-name').fill(`${PACK} picked`);
    await sheet.getByTestId('submit-pack-description').fill('Two picked on Home');
    await sheet.getByTestId('submit-pack-go').click();
    await expect(sheet).toHaveCount(0);

    // AN OUTSIDE REQUEST (D5): a graphic that loads a picture from a CDN when it plays, its URL
    // built at runtime so the static screen cannot read it, passes the checks as the sheet
    // changes; Send plays it with the request refused, names the URL and keeps the sheet open
    // with nothing sent.
    const FETCHES = `${PACK} fetches`;
    await page.evaluate(async (folder) => {
      const { variantsFor } = await import('/src/templates/catalog.ts');
      const { createGraphic, setGraphicsFolder } = await import('/src/model/library.ts');
      const t = variantsFor('lower-third')[0].create({});
      const js = `${t.js}\n;(function () { var own = window.play; window.play = function () { new Image().src = 'https:' + '//cdn.example.invalid/logo.png'; return own && own.apply(this, arguments); }; })();`;
      const made = createGraphic({ ...t, js }, { name: 'Fetching strap', packageId: null });
      if (made.error) throw new Error(made.error);
      const error = setGraphicsFolder([made.doc.id], folder);
      if (error) throw new Error(error);
    }, FETCHES);
    await page.getByTestId('home-search').fill('');
    await openHomeGraphics(page);
    const fetching = page.getByTestId(`folder-item-${FETCHES}`);
    await fetching.getByTestId('row-menu').click();
    await fetching.getByTestId('submit-to-community').click();
    await sheet.getByTestId('submit-pack-description').fill('Asks the internet for its logo');
    await expect(sheet.getByTestId('submit-pack-findings')).toHaveCount(0);
    await sheet.getByTestId('submit-pack-go').click();
    await expect(sheet.getByTestId('submit-pack-findings')).toContainText('https://cdn.example.invalid/logo.png (an image) when it plays', { timeout: 20_000 });
    await expect(sheet.getByTestId('submit-pack-go')).toBeDisabled();
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/home-submit-request-refused-desktop.png` });
    await sheet.getByTestId('submit-pack-cancel').click();

    // Both wait for review under the maker's Your packs, with the graphics chosen on Home.
    await openShelf(page);
    const mine = page.getByTestId('your-packs');
    await expect(mine.locator('.wz-community-row', { hasText: QUIZ })).toContainText('In review');
    await expect(mine.locator('.wz-community-row', { hasText: `${PACK} picked` })).toContainText('In review');
    const { data: stored } = await admin.from('community_packs').select('name, graphics').in('name', [QUIZ, `${PACK} picked`]);
    expect(Object.fromEntries((stored ?? []).map((r) => [r.name, r.graphics]))).toEqual({ [QUIZ]: 3, [`${PACK} picked`]: 2 });
    const { count: refused } = await admin.from('community_packs').select('id', { count: 'exact', head: true }).eq('name', FETCHES);
    expect(refused).toBe(0);

    // SIGNED OUT, Home offers neither door: absent, never disabled.
    const visitor = await browser.newPage();
    await visitor.goto('/app#/home/graphics');
    await makeFolder(visitor, QUIZ, ['Visitor graphic']);
    await openHomeGraphics(visitor);
    const theirs = visitor.getByTestId(`folder-item-${QUIZ}`);
    await theirs.click({ button: 'right' });
    await expect(theirs.getByTestId('rename-folder')).toBeVisible();
    await expect(visitor.getByTestId('submit-to-community')).toHaveCount(0);
  });

  test('the server takes a submit from an account that is not an admin for review only, and refuses one with community.publish off', async () => {
    test.skip(!ANON_KEY, 'set VITE_SUPABASE_ANON_KEY to sign in as the two accounts');
    const pack = { format: 'noacg-pack', version: 1, name: 'x', graphics: [{ name: 'A' }] };
    const signIn = async (email: string) => {
      const client = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
      const { error: signInError } = await client.auth.signInWithPassword({ email, password: PASSWORD });
      if (signInError) throw new Error(signInError.message);
      return client;
    };
    const submitAs = async (email: string) => {
      const { error } = await (await signIn(email)).rpc('community_pack_submit', {
        p_name: 'Refused',
        p_description: 'Should not be stored',
        p_author: 'Nobody',
        p_pack: pack,
      });
      return error?.message ?? null;
    };

    // A maker who is not an admin: the pack is stored, waits for review, and they cannot approve it.
    const maker = await signIn(MAKER_EMAIL);
    const sent = await maker.rpc('community_pack_submit', {
      p_name: 'From a maker',
      p_description: 'Waits for review',
      p_author: 'A maker',
      p_pack: pack,
    });
    expect(sent.error).toBeNull();
    const decided = await maker.rpc('community_pack_decide', { p_id: sent.data, p_state: 'live', p_reason: null });
    expect(decided.error?.message).toBe('Only a NoaCG admin can decide on a pack.');
    const { data: stored } = await admin.from('community_packs').select('state').eq('id', sent.data).single();
    expect(stored?.state).toBe('in_review');

    // An admin's per-account switch: a permanent override that denies (migration 0022).
    const { error } = await admin.from('user_grants').insert({
      user_id: ids[0],
      kind: 'feature',
      key: 'community.publish',
      value: { value: false },
      reason: 'e2e community packs',
    });
    if (error) throw new Error(error.message);
    try {
      expect(await submitAs(ADMIN_EMAIL)).toBe('This account cannot submit packs.');
    } finally {
      await admin.from('user_grants').delete().eq('user_id', ids[0]).eq('key', 'community.publish');
    }
    const { count } = await admin.from('community_packs').select('id', { count: 'exact', head: true }).eq('name', 'Refused');
    expect(count).toBe(0);
  });
});
