import { expect, type Page } from '@playwright/test';

// Reaching a production's DATA or AUDIENCE workspace, the way the surface now offers them.
//
// They open in their OWN BROWSER TAB (docs/INTERACTIVE_PLAYOUT_PLAN.md; the owner's read of
// 2026-08-21 — "the playout should always be open"), so the tab controls are links with
// `target="_blank"` rather than buttons. A spec that clicks one and keeps asserting on the
// SAME page is asserting about the tab that still holds Playout, and would fail on a workspace
// element that never arrives there.
//
// So the click and the new page are ONE act, and the returned page is the workspace. Playout
// stays on the original page, which is the whole point of the change and is what
// `expectPlayoutStillOpen` exists to state where it matters.

// THE DOOR DEPENDS ON THE PRODUCTION (docs/PLAYOUT_DASHBOARD.md §2, 2026-10-03): the header's
// switcher lists a view only once the production uses it, and until then the Setup menu offers
// it ("Add data source…", "Turn on audience…"). Both are the same link to the same route, so a
// spec reaches the view through whichever door its production shows; e2e/production-views.spec.ts
// pins which door shows when.

/**
 * Open a workspace in its own tab and return that tab, settled.
 *
 * Waits for the page event and the click TOGETHER: the popup exists the moment the click is
 * dispatched, so awaiting the click first can miss it.
 */
export async function openWorkspace(page: Page, tab: 'data' | 'audience'): Promise<Page> {
  await expect(page.getByTestId('production-setup')).toBeVisible();
  const switcher = page.getByTestId(`tab-${tab}`);
  let door = switcher;
  if (!(await switcher.isVisible())) {
    await page.getByTestId('production-setup').click();
    door = page.getByTestId(`setup-${tab}`);
  }
  const [workspace] = await Promise.all([page.context().waitForEvent('page'), door.click()]);
  await workspace.waitForLoadState('domcontentloaded');
  await expect(workspace.getByTestId(`production-${tab}`)).toBeVisible();
  return workspace;
}

/** The original tab still holds Playout — the reason the workspaces moved out of it. */
export async function expectPlayoutStillOpen(page: Page): Promise<void> {
  await expect(page.getByTestId('production-verbs')).toBeVisible();
}
