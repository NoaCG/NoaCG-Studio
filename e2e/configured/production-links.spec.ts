import { test, expect } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from '../_create';
import { haveCreds, signIn } from './_helpers';

// A PRODUCTION'S URLS OUTLIVE UNPUBLISHING (docs/CLOUD_PLAYOUT.md §3, migration 0040).
//
// The output URL is pasted once into a CasparCG template or an OBS browser source and then left
// alone for the life of the production — so the one thing it may never do is move. It used to:
// unpublish DELETED the control_shows row and re-publishing re-minted every slug from its column
// default, which is the mechanism behind the unexplained "the CasparCG URL stopped working"
// report in student-release acceptance round 2.
//
// This lives in the configured suite because it is a claim about the DATABASE. Offline there is
// no row to delete, no trigger to fire and no slug to compare — the only honest proof runs the
// real publish/unpublish path against the real backend. It also fails, correctly, against a
// project that has not had 0040 applied yet.

test.skip(!haveCreds, 'E2E_EMAIL / E2E_PASSWORD unset — configured-mode spec');

test('unpublishing and publishing again keeps every capability URL', async ({ page }) => {
  test.setTimeout(180_000);
  await signIn(page);
  await page.keyboard.press('Escape'); // the wizard signIn leaves open — not this walk
  // Shows SYNC, so a failed earlier run can leave a published production behind whose slugs
  // would shadow this one's. Start from an empty set.
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
  // createProject's `name` is the CATALOG DESIGN to build from, not the project's own name -
  // "Link Keeper" is this spec's production, named below. Passing it here asked the catalog
  // for a design that has never existed, so this walk threw before it reached the claim.
  await bootstrapGraphic(page);
  // Answer the analytics prompt, as a real operator does once on a first visit. It used to be
  // required: at a bare z-index 1200 the banner covered ⟳ Publish changes and Unpublish in the
  // Links popover's foot. A notice now loses to a popover (the layer scale in
  // src/styles/base.css, pinned by e2e/overlay-layers.spec.ts), so this is a step, not a dodge.
  const consent = page.getByTestId('analytics-consent');
  if (await consent.isVisible().catch(() => false)) {
    await consent.getByRole('button', { name: 'No thanks' }).click();
  }

  const showName = `Link Keeper ${Date.now()}`;
  await openProductionWithCurrent(page, showName);

  /** The four addresses as the app itself knows them, read back off the synced show record. */
  const capabilities = () =>
    page.evaluate(async (name) => {
      const { loadShows } = await import('/src/model/shows.ts');
      const s = loadShows().find((x) => x.name === name);
      return {
        control: s?.hostedSlug ?? null,
        output: s?.outputSlug ?? null,
        join: s?.joinSlug ?? null,
        presenter: s?.presenterSlug ?? null,
      };
    }, showName);

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  // Publishing opens the links popover; Escape closes it (quiz-output.spec.ts says why there
  // is nothing to click).
  const links = page.getByTestId('production-links');
  await expect(links).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(links).toBeHidden();

  const first = await capabilities();
  expect(first.control).toBeTruthy();
  expect(first.output).toBeTruthy();
  expect(first.join).toBeTruthy();
  expect(first.presenter).toBeTruthy();

  // Unpublish exactly as an operator does — the links popover's own button.
  await page.getByTestId('production-links-toggle').click();
  await expect(page.getByTestId('production-unpublish')).toBeVisible();
  await page.getByTestId('production-unpublish').click();
  await expect(page.getByTestId('production-mode')).not.toContainText('SHOW', { timeout: 30_000 });
  await expect(page.getByTestId('production-note')).toContainText('come back unchanged');
  // The published capabilities are gone from the local record; the reserved audience pair is
  // deliberately kept, which is what stops the readable join name being re-derived below.
  const between = await capabilities();
  expect(between.control).toBeNull();
  expect(between.output).toBeNull();

  await page.getByTestId('production-publish').click();
  await expect(page.getByTestId('production-mode')).toContainText('SHOW', { timeout: 30_000 });
  await expect(links).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(links).toBeHidden();

  expect(await capabilities()).toEqual(first);

  // Teardown: this account is shared by the live suite, and a reserved join name is reserved for
  // good — leaving published productions behind would collide with the next run.
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
});
