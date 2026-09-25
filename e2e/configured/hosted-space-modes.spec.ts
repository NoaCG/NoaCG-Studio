import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { clearPublishedShows, haveCreds, signIn } from './_helpers';

// THE TWO SPACE MODES ON THE HOSTED PAGE (owner, 2026-09-10; docs/PLAYOUT_DASHBOARD.md §2
// "Two Space modes"). The in-app page pins both modes offline (production-controls.spec.ts) and
// the exported controller pins its copy of the decision on the relay. The hosted page cannot be
// mounted without a backend, so its walk lives here: publish a two-cue rundown, open the
// capability URL a class operates from, and drive it from the keys in each mode.
//
// What this walk proves that the offline pins cannot: the hosted page's PREVIEW is an imperative
// stage (`showOnPreview`) rather than a derived document, so "the cursor previews nothing" is a
// call that must NOT happen, and its tally comes back off the WIRE rather than from a local map.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset - configured-mode spec');

test('the hosted page carries both SPACE modes: the cursor previews nothing, SPACE stages, SPACE airs, SPACE cuts back', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.keyboard.press('Escape');
  await clearPublishedShows(page);

  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  const showName = `Space Modes ${Date.now()}`;
  await openProductionWithCurrent(page, showName);

  // Two cues of the one graphic, named so the rundown reads in order.
  const rows = page.getByTestId('cue-list').locator('.pd-cue');
  await page.getByTestId('cue-label').fill('Anna');
  await expect(rows.first()).toContainText('Anna');
  await page.getByTestId('add-cue').click();
  await expect(rows).toHaveCount(2);
  await page.getByTestId('cue-label').fill('Ben');
  await expect(rows.nth(1)).toContainText('Ben');
  await page.getByTestId('cue-label').blur();

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
  await expect(links).toBeHidden();
  const slug = await page.evaluate(async (name) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find((x) => x.name === name)?.hostedSlug ?? null;
  }, showName);
  expect(slug, 'publishing must mint a hosted control slug').toBeTruthy();

  const op = await context.newPage();
  await op.goto(`/app?control=${encodeURIComponent(slug as string)}`);
  await expect(op.getByTestId('hosted-control-page')).toBeVisible({ timeout: 60_000 });
  const hosted = op.locator('.pd-cue');
  await expect(hosted).toHaveCount(2);
  const previewWhat = op.getByTestId('hosted-preview-what');
  const take = op.getByTestId('hosted-take-cue');
  const chip = op.getByTestId('hosted-live-chip');
  const mode = op.getByTestId('hosted-space-mode');

  // DEFAULT MODE on arrival: the first cue is selected and on PREVIEW, and the box is unticked.
  await expect(mode).not.toBeChecked();
  await expect(previewWhat).toHaveText('Anna');
  await expect(hosted.nth(0)).toHaveClass(/on-pvw/);

  // PREVIEW-THEN-TAKE. Ticking keeps Anna on PREVIEW; the cursor then walks on without her.
  await mode.check();
  await expect(mode).toBeChecked();
  await expect(previewWhat).toHaveText('Anna');
  await op.keyboard.press('ArrowDown');
  await expect(hosted.nth(1)).toHaveClass(/selected/);
  await expect(hosted.nth(1)).not.toHaveClass(/on-pvw/);
  await expect(hosted.nth(0)).toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Anna');
  await expect(take).toHaveText(/→ PREVIEW/);

  // SPACE stages Ben. Nothing airs, and the checkbox gave the keys back on its own click.
  await op.keyboard.press('Space');
  await expect(mode).toBeChecked();
  await expect(hosted.nth(1)).toHaveClass(/on-pvw/);
  await expect(hosted.nth(0)).not.toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Ben');
  await expect(chip).toContainText('nothing on air');
  await expect(take).toHaveText(/⟳ TAKE/);

  // SPACE airs - the tally arrives off the wire - and Ben stays on PREVIEW; SPACE takes him off.
  await op.keyboard.press('Space');
  await expect(hosted.nth(1)).toHaveClass(/on-air/, { timeout: 30_000 });
  await expect(take).toHaveText(/■ TAKE OFF/);
  await expect(previewWhat).toHaveText('Ben');
  await op.keyboard.press('Space');
  await expect(hosted.nth(1)).not.toHaveClass(/on-air/, { timeout: 30_000 });
  await expect(hosted.nth(1)).toHaveClass(/on-pvw/);
  await expect(chip).toContainText('nothing on air');

  // THE MIXER CUT from a cue the cursor left: Ben on air, Anna staged beside him (he stays up),
  // back to Ben, SPACE. Off air, and back on PREVIEW in Anna's place.
  await op.keyboard.press('Space');
  await expect(hosted.nth(1)).toHaveClass(/on-air/, { timeout: 30_000 });
  await op.keyboard.press('ArrowUp');
  await op.keyboard.press('Space');
  await expect(hosted.nth(0)).toHaveClass(/on-pvw/);
  await expect(hosted.nth(1)).toHaveClass(/on-air/);
  await expect(previewWhat).toHaveText('Anna');
  await op.keyboard.press('ArrowDown');
  await expect(take).toHaveText(/■ TAKE OFF/);
  await op.keyboard.press('Space');
  await expect(hosted.nth(1)).not.toHaveClass(/on-air/, { timeout: 30_000 });
  await expect(hosted.nth(1)).toHaveClass(/on-pvw/);
  await expect(hosted.nth(0)).not.toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Ben');

  // BACK TO THE DEFAULT: the cursor previews again, and the first press airs.
  await mode.uncheck();
  await expect(mode).not.toBeChecked();
  await op.keyboard.press('ArrowUp');
  await expect(hosted.nth(0)).toHaveClass(/on-pvw/);
  await expect(previewWhat).toHaveText('Anna');
  await expect(take).toHaveText(/⟳ TAKE/);

  // Leave nothing published behind: this account is shared by the live suite.
  await clearPublishedShows(page);
});
