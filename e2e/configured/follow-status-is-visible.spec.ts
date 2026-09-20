import { test, expect } from '@playwright/test';
import { createProject } from '../_create';
import { haveCreds, signIn, wipeMyGraphics } from './_helpers';

// A LIVE CONNECTION THAT NEVER JOINS HAS TO SAY SO.
//
// `followControlLog` has reported its channel's join status since it was written, for a surface
// willing to show it, and until 2026-09-20 no surface asked. So a production whose channel never
// joined looked exactly like a quiet one: commands still arrive on the durable road whenever the
// 30-second poll comes round, and nothing on screen said the fast road was missing.
//
// It stopped being academic on 2026-09-20. Three hosted specs hung for their whole test budget
// with the dashboard reading "nothing on air" about a graphic that was, and the one question
// that would have narrowed it - did the log's channel ever join? - could not be answered from
// the failure artifact, because the answer was never rendered. This is that answer, made
// visible, so the NEXT occurrence carries its own diagnosis.
//
// BOTH HALVES, and the second is the one that matters. Asserting only that the line appears
// would pass just as well if it always appeared, which would put a permanent warning on every
// healthy production. So the healthy case is asserted first, on the same production.
test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('a production whose live connection never joins says so, and a healthy one does not', async ({ page, context }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await createProject(page, { name: 'House Scorebug' });

  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  const showName = `Follow Status ${Date.now()}`;
  await section.getByPlaceholder('New production name').fill(showName);
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });

  // ── HEALTHY: the socket is left alone, so the line must not be there. ──
  // Given time to be wrong: the status is reported on every poll tick as well as on every change,
  // so a spurious line would have appeared inside this window.
  await expect(page.getByTestId('production-follow')).toBeHidden({ timeout: 30_000 });
  await page.waitForTimeout(3_000);
  await expect(page.getByTestId('production-follow')).toBeHidden();

  // ── NOT JOINED: open the same published production with the socket opened and never joined. ──
  const blind = await context.newPage();
  await blind.routeWebSocket(/supabase\.co\/realtime/, () => {
    /* opened, never joined - exactly what a refused or silently dead channel looks like */
  });
  await blind.goto(page.url());
  await expect(blind.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });

  const line = blind.getByTestId('production-follow');
  await expect(line).toBeVisible({ timeout: 60_000 });
  await expect(line).toContainText('not joined');
  // It says SLOW rather than broken, because that is the truth: the durable road still delivers.
  await expect(line).toHaveAttribute('title', /Commands still arrive/);

  await blind.unrouteAll({ behavior: 'ignoreErrors' });
  await blind.close();

  // Leave the throwaway account clean.
  await page.getByTestId('production-links-toggle').click();
  await page.getByRole('button', { name: /Unpublish/ }).click();
  await expect(page.getByTestId('production-mode')).toContainText('NOT PUBLISHED', { timeout: 20_000 });
  await page.evaluate(async () => {
    const { loadShows, deleteShow } = await import('/src/model/shows.ts');
    for (const s of loadShows()) deleteShow(s.id);
  });
  await wipeMyGraphics(page);
});
