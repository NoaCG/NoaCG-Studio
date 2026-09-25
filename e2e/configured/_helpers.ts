import { expect, type Page } from '@playwright/test';
import { finishIntoEditor, finishIntoNewEditor, startNewProject } from '../_create';
import { chooseType, pickDesign } from '../_browse';

// Shared setup for the configured-mode (authenticated) community specs. Credentials come from env so
// the public repo carries no secrets; `haveCreds` gates the whole suite off when they're unset.

export const E2E_EMAIL = process.env.E2E_EMAIL ?? '';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? '';
export const haveCreds = Boolean(E2E_EMAIL && E2E_PASSWORD);

/** A SECOND account, for the walks that need two people: a teammate joining a team the first
 *  account made (teams.spec.ts). Optional - the specs that need it skip without it. */
export const E2E_TEAMMATE_EMAIL = process.env.E2E_TEAMMATE_EMAIL ?? '';
export const E2E_TEAMMATE_PASSWORD = process.env.E2E_TEAMMATE_PASSWORD ?? '';
export const haveTeammateCreds = Boolean(E2E_TEAMMATE_EMAIL && E2E_TEAMMATE_PASSWORD);

export const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
export const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? '';

/**
 * Close the creation wizard and WAIT until it is gone.
 *
 * Every live spec that wants the topbar underneath used to press Escape and carry on. Two ways
 * that goes wrong, and both were seen in the 2026-08-08 runs: pressed at the moment of
 * navigation it lands before the modal mounts, and even pressed after `toBeVisible` it
 * occasionally does not take - either way the full-screen backdrop is still there, swallowing
 * the click that follows, and the failure reads as "Sign in is broken" or "the Feedback button
 * is unclickable". Its own ✕ is deterministic, and asserting the modal is HIDDEN is what makes
 * the next click safe.
 */
export async function dismissWizard(page: Page): Promise<void> {
  const modal = page.locator('.wz-modal');
  await expect(modal).toBeVisible();
  await page.locator('.wz-modal .gallery-close').click();
  await expect(modal).toBeHidden();
}

/** Sign in with email + password via Home's topbar dialog (Era 5.6, no wall; fresh Playwright
 *  contexts have no persisted session). Leaves the wizard OPEN afterwards, the same state a
 *  fresh load presents, so createGraphic can run directly. There is no Advanced mode to switch on
 *  any more (owner, 2026-09-24): the sign-in lives on Home, which every boot reaches. */
export async function signIn(page: Page): Promise<void> {
  await signInAs(page, E2E_EMAIL, E2E_PASSWORD);
}

/** `signIn` with named credentials - the second account of a two-person walk. */
export async function signInAs(page: Page, account: string, password: string): Promise<void> {
  await page.goto('/app');
  // The startup wizard covers the topbar — close it to reach the Sign in button.
  await dismissWizard(page);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  const email = page.locator('#auth-email');
  await email.waitFor({ state: 'visible', timeout: 15_000 });
  await email.fill(account);
  await page.locator('#auth-pass').fill(password);
  await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
  // The dialog closes itself on session; the account appears in the topbar.
  await expect(page.locator('.auth-status')).toBeVisible({ timeout: 20_000 });
  // Restore the state downstream helpers expect (wizard open, as on a fresh load).
  await startNewProject(page);
}

/** Create a project through the wizard (which opens on load) and land in the OLD editor through
 *  Finish's code-editor door. That door is gone, so `finishIntoEditor` skips the calling test
 *  (docs/backlog/specs-that-still-open-the-old-editor.md) until the callers are rewritten. */
export async function createGraphic(page: Page, category: string, variant: string): Promise<void> {
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, category);
  await pickDesign(page, variant);
  await finishIntoEditor(page);
  await expect(page.locator('.wz-modal')).toBeHidden();
  await page.waitForTimeout(650);
}

/** Create a graphic through the wizard (which opens on load) and land in the NEW editor through
 *  Finish's "Edit this graphic" - the working document then holds it, and the editor's header
 *  carries the save controls. The road `createGraphic` above took into the old editor. */
export async function createGraphicInEditor(page: Page, category: string, variant: string): Promise<void> {
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await chooseType(page, category);
  await pickDesign(page, variant);
  await finishIntoNewEditor(page);
}

/** Drop a screenshot of a signed-in surface into test-results/signed-in/. These surfaces render
 *  NOTHING offline, so the shots are the only way to review how they actually look. */
export async function shot(page: Page, name: string): Promise<void> {
  await page.screenshot({ path: `test-results/signed-in/${name}.png` });
}

/** Wait for the sign-in sync pass to finish, so a spec that reads or wipes the account's cloud
 *  data sees a settled library rather than one still being pulled in. Signing in IS a sync
 *  trigger (backend/syncController.ts), which is why this is reachable at all. */
export async function settleSync(page: Page): Promise<void> {
  await expect(page.locator('.sync-status.sync-synced')).toBeVisible({ timeout: 30_000 });
}

/** Delete every saved graphic in the account's library and push the tombstones. The library
 *  SYNCS, so without this each live run would leave another "Hairline" in the cloud for the next
 *  one to pull back down — and specs that address a saved row by name would go ambiguous. */
export async function wipeMyGraphics(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { loadGraphics, deleteGraphic } = await import('/src/model/library.ts');
    for (const g of loadGraphics()) deleteGraphic(g.id);
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
}

/**
 * Publish nothing behind us. The test account is shared by every spec in this suite, and a
 * production left published still holds its reserved control and output addresses on the next run
 * (migration 0040), so a walk that publishes has to unpublish before it exits and before it
 * starts.
 *
 * It lives here because three configured specs need it and each had grown its own copy. The two
 * older copies (`playout-both-roads`, `hosted-control-recovery`) are identical and should collapse
 * onto this one the next time either file is touched for a reason of its own.
 */
export async function clearPublishedShows(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    const { unpublishControlShow } = await import('/src/control/hostedControl.ts');
    for (const s of loadShows()) {
      if (s.hostedSlug || s.outputSlug) await unpublishControlShow(s.id).catch(() => {});
      deleteShow(s.id);
    }
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
  });
}

/**
 * The output renderer's own count of the DURABLE rows it has applied, off its `&debug=1` overlay.
 *
 * The overlay is the only thing that page ever says out loud, and `last row` is written from the
 * durable row's own id - a broadcast carries no id and never touches it. So this number answers
 * "was it RECORDED?", which is a different question from what is on screen, and the two together
 * are what tell a forged command apart from a real one.
 */
export async function lastAppliedRow(air: Page): Promise<number> {
  const text = await air.locator('pre').textContent();
  const m = /last row: (\d+)/.exec(text ?? '');
  return m ? Number(m[1]) : 0;
}

/** Remove every community submission owned by the signed-in test account (bulletproof teardown for a
 *  throwaway account that should only ever hold test rows). */
export async function wipeMySubmissions(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const { listMySubmissions, unpublish } = await import('/src/community/communityData.ts');
    const subs = await listMySubmissions();
    for (const s of subs) await unpublish(s.id);
  });
}
