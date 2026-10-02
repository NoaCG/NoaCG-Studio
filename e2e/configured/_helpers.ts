import { expect, type Page } from '@playwright/test';
import type { SupabaseClient } from '@supabase/supabase-js';
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

/** What an output page says about itself on its live topic (src/output/main.ts `__noacgLive`). */
export type ReadyWindow = {
  __noacgLive?: {
    presence: () => string;
    ready: () => { n: number; of: number; v: { n: number; h: string } | null; is: { k: string; g?: string; d?: string }[] };
  };
};
/** An output page's own READY answer, or null before it has one. */
export const readyOf = (air: Page) => air.evaluate(() => (window as ReadyWindow).__noacgLive?.ready() ?? null);

/**
 * Unpublish the open production through its Playout panel, opening the panel first when it is
 * shut. By test id, never by the button's name: the status control itself can read "Unpublished
 * changes", and a name match then presses the status instead.
 */
export async function unpublishFromPanel(page: Page): Promise<void> {
  const panel = page.getByTestId('production-status-panel');
  if (!(await panel.isVisible())) await page.getByTestId('production-status').click();
  await panel.getByTestId('production-unpublish').click();
}

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

/** Sign in through the Home topbar's own Sign in button, as a person at the computer would.
 *  Signing in may RELOAD the page onto the account's library (an account this browser has seen
 *  before); both paths end with the profile button showing. By default it then waits for the
 *  first sync to settle; `settle: false` leaves that pass running, for a spec that watches it. */
export async function signInOnHome(page: Page, email: string, password: string, { settle = true } = {}): Promise<void> {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expect(page.getByTestId('auth-state')).toHaveText('Not signed in');
  await page.locator('.auth-signin').click();
  await page.locator('#auth-email').fill(email);
  await page.locator('#auth-pass').fill(password);
  await page.locator('.auth-card').getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.locator('.auth-status')).toBeVisible({ timeout: 20_000 });
  if (settle) await settleSync(page);
}

/** Mint a throwaway account through the admin API and return its id. A leftover from a run that
 *  died before its cleanup is deleted first, so every run starts the account with an empty cloud.
 *  Deleting the account later takes its documents with it (`on delete cascade`). */
export async function mintAccount(admin: SupabaseClient, email: string, password: string): Promise<string> {
  // One page large enough for any test project; the default page of 50 could hide the user.
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (listError) throw new Error(`could not list users: ${listError.message}`);
  const leftover = list.users.find((u) => u.email === email);
  if (leftover) {
    const { error } = await admin.auth.admin.deleteUser(leftover.id);
    if (error) throw new Error(`could not delete a leftover ${email}: ${error.message}`);
  }
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw new Error(`could not create ${email}: ${error.message}`);
  return data.user.id;
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
