import { expect, type Page } from '@playwright/test';

/**
 * Take the Create with AI step's one secondary button into the NoaCG agent (the built-in
 * generator). The step opens on the user's own coding agent route ALONE
 * (`wizard/open-create-step-user-own-coding`): the format picker, viewing controls, drop zone,
 * composer and settings sheet all mount only after this choice, so every spec driving the
 * generator makes it once, right after pressing the Entry card.
 */
export async function chooseNoacgAgent(page: Page): Promise<void> {
  await page.getByTestId('ai-noacg-choose').click();
  await expect(page.getByTestId('ai-builtin')).toBeVisible();
}
