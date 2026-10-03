// covers: src/control/cueAuto.ts, src/components/home/{CueTiming,CueRundown,ProductionPage,PlayoutMonitors}.tsx
// covers: src/components/playoutKeys.ts

import { test, expect, type Page } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// TIMED GRAPHIC CUES on an unpublished production (docs/RUNDOWN_AUTOMATION_PLAN.md §2.0 and §2.10,
// phase 1). Time is Playwright's clock, so a four-second cue takes no four seconds and a missed
// deadline is a closed lid, not a sleep. The rules themselves are scripts/cue-auto.test.mjs; this
// proves the page runs them: the countdown on the row and over PROGRAM, the armed next cue, the end
// action sent once, H, Manual, Missed, and the operator's selection left where it was.

test.use({ viewport: { width: 1600, height: 900 } });

interface Seeded {
  id: string;
  a: string;
  b: string;
  c: string;
}

/** Two lower thirds on their own layers and three cues: A (timed), B (the next graphic cue) and C. */
async function seed(page: Page, then: 'out' | 'next' | 'out-next', published = false): Promise<Seeded> {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  await awaitDurableReady(page);
  const seeded = await page.evaluate(
    async ({ then, published }) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { createGraphic } = await import('/src/model/library.ts');
      const shows = await import('/src/model/shows.ts');
      const show = shows.createShowNamed('Timed show');
      for (const name of ['Guest', 'Host']) {
        const tpl = variantById('lt01')!.create({});
        const { doc, error } = createGraphic(tpl, { name });
        if (error) throw new Error(error);
        shows.addGraphicToShow(show.id, { ...tpl, name }, { graphicId: doc!.id });
      }
      const rec = shows.loadShows().find((s) => s.id === show.id)!;
      const [guest, host] = rec.graphics;
      const a = rec.cues!.find((c) => c.sourceId === guest.id)!.id;
      const b = rec.cues!.find((c) => c.sourceId === host.id)!.id;
      shows.updateShowCue(show.id, a, { label: 'Anna' });
      shows.updateShowCue(show.id, b, { label: 'Ben' });
      const c = shows.addShowCue(show.id, guest.id, { label: 'Cleo' }).cueId!;
      shows.setCueAuto(show.id, a, { after: 4, then });
      if (published) shows.setShowHostedSlug(show.id, 'timed-show-e2e');
      return { id: show.id, a, b, c };
    },
    { then, published },
  );
  await settleDurableWrites(page);
  return seeded;
}

async function open(page: Page, s: Seeded): Promise<void> {
  await page.clock.install();
  await page.goto(`/app#/production/${s.id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId(`cue-${s.a}`)).toBeVisible();
}

const row = (page: Page, cue: string) => page.getByTestId(`cue-${cue}`);
// Timed cues run unpublished, where a take plays on the page only: the row says UP, not ON AIR.
const up = (page: Page, cue: string) => row(page, cue).locator('.pd-tag.up');
const onAir = (page: Page, cue: string) => row(page, cue).locator('.pd-tag.air');

async function takeA(page: Page, s: Seeded): Promise<void> {
  await row(page, s.a).getByTestId('select-cue').click();
  await page.getByTestId('verb-take').click();
  await expect(up(page, s.a)).toBeVisible();
}

test('a cue timed 4 s, Out and next cue: it counts, arms the next, and at zero hands over once, selection untouched', async ({ page }) => {
  const s = await seed(page, 'out-next');
  await open(page, s);
  // Off air, the row wears its length and end.
  await expect(row(page, s.a).getByTestId('cue-auto')).toHaveText('0:04 → Out + next');
  await takeA(page, s);

  // The operator moves on to prepare another cue while A counts.
  await row(page, s.c).getByTestId('select-cue').click();
  await expect(row(page, s.c).getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');

  await page.clock.runFor(1_000);
  const chip = row(page, s.a).getByTestId('cue-auto');
  await expect(chip).toHaveAttribute('data-phase', 'running');
  await expect(chip).toHaveText(/^0:0[23]$/);
  await expect(chip).toHaveAttribute('title', /then Out and next cue/);
  await expect(page.getByTestId('program-auto-count')).toHaveText(/0:0[23]/);
  await expect(row(page, s.b).getByTestId('cue-armed')).toBeVisible();

  await page.clock.runFor(3_500);
  await expect(up(page, s.b)).toBeVisible();
  await expect(up(page, s.a)).toHaveCount(0);
  await expect(page.getByTestId('action-log-row').filter({ hasText: 'Auto Out and next cue sent' })).toHaveCount(1);
  // The selection and PREVIEW stayed on the cue the operator was preparing.
  await expect(row(page, s.c).getByTestId('select-cue')).toHaveAttribute('aria-current', 'true');
  await expect(page.getByTestId('preview-what')).toHaveText('Cleo');
  // Nothing else fires later: B is a manual cue, and A's lane is gone.
  await page.clock.runFor(20_000);
  await expect(up(page, s.b)).toBeVisible();
  await expect(page.getByTestId('action-log-row').filter({ hasText: /^.*Auto/ })).toHaveCount(1);
  await expect(page.getByTestId('program-auto')).toHaveCount(0);
});

test('H holds the countdown and H again resumes it from the frozen remainder', async ({ page }) => {
  const s = await seed(page, 'out');
  await open(page, s);
  await takeA(page, s);
  await page.clock.runFor(2_000);
  await page.getByTestId('program-monitor').hover();
  await page.keyboard.press('h');
  await expect(page.getByTestId('program-auto')).toHaveAttribute('data-phase', 'held');
  await expect(row(page, s.a).getByTestId('cue-auto')).toHaveText(/Held 0:0[23]/);
  // Ten seconds held: nothing fires.
  await page.clock.runFor(10_000);
  await expect(up(page, s.a)).toBeVisible();
  await page.keyboard.press('h');
  await expect(page.getByTestId('program-auto')).toHaveAttribute('data-phase', 'running');
  // The page's clock also moves in real time between steps, so the remainder is "about two
  // seconds": still up as it resumes, gone once those two seconds and a margin have passed.
  await expect(up(page, s.a)).toBeVisible();
  await page.clock.runFor(2_500);
  await expect(up(page, s.a)).toHaveCount(0);
  await expect(page.getByTestId('action-log-row').filter({ hasText: 'Auto Out sent' })).toHaveCount(1);
  await expect(page.getByTestId('action-log-row').filter({ hasText: /Held at 0:0[23]/ })).toHaveCount(1);
});

test('Manual drops the timed end: the cue stays on air for good', async ({ page }) => {
  const s = await seed(page, 'out');
  await open(page, s);
  await takeA(page, s);
  await page.clock.runFor(1_000);
  await page.getByTestId('program-auto-manual').click();
  await expect(page.getByTestId('program-auto')).toHaveCount(0);
  await page.clock.runFor(30_000);
  await expect(up(page, s.a)).toBeVisible();
  // The row is a timed cue again off its lane: its length, not a count.
  await expect(row(page, s.a).getByTestId('cue-auto')).toHaveText('0:04 → Out');
  await expect(page.getByTestId('action-log-row').filter({ hasText: 'Manual' })).toHaveCount(1);
});

test('an end action more than 5 s late is missed and never runs, until the operator acts', async ({ page }) => {
  const s = await seed(page, 'out-next');
  await open(page, s);
  await takeA(page, s);
  await page.clock.runFor(1_000);
  // The laptop lid closes for twenty seconds: the timer comes due once, far too late.
  await page.clock.fastForward(20_000);
  const chip = row(page, s.a).getByTestId('cue-auto');
  await expect(chip).toHaveAttribute('data-phase', 'missed');
  await expect(chip).toContainText(/Out and next cue was due 0:\d\d ago/);
  await expect(up(page, s.a)).toBeVisible();
  await expect(up(page, s.b)).toHaveCount(0);
  await expect(page.getByTestId('action-log-row').filter({ hasText: 'Auto Out and next cue missed' })).toHaveCount(1);
  // The ordinary verbs are there; a press on the chip clears it.
  await chip.click();
  await expect(row(page, s.a).getByTestId('cue-auto')).toHaveText('0:04 → Out + next');
  await page.clock.runFor(30_000);
  await expect(up(page, s.b)).toHaveCount(0);
});

test('the editor sets the timing and says what Next cue will take', async ({ page }) => {
  const s = await seed(page, 'out');
  await open(page, s);
  await row(page, s.b).getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-ends-mode')).toHaveValue('manual');
  await page.getByTestId('cue-ends-mode').selectOption('after');
  await page.getByTestId('cue-ends-after').fill('6');
  await page.getByTestId('cue-ends-then').selectOption('next');
  // B's next graphic cue is C, two rows down past nothing but graphics.
  await expect(page.getByTestId('cue-ends-hint')).toHaveText('Next cue takes “Cleo”.');
  await expect(row(page, s.b).getByTestId('cue-auto')).toHaveText('0:06 → Next cue');
  // The last cue has nothing to take.
  await row(page, s.c).getByTestId('select-cue').click();
  await page.getByTestId('cue-ends-mode').selectOption('after');
  await page.getByTestId('cue-ends-then').selectOption('out-next');
  await expect(page.getByTestId('cue-ends-hint')).toContainText('Nothing comes after this cue');
});

test('a duplicate keeps the timing, and making a counting cue manual stops its countdown', async ({ page }) => {
  const s = await seed(page, 'out');
  await open(page, s);
  await row(page, s.a).getByTestId('cue-menu').click();
  await page.getByTestId('cue-actions-menu').getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(page.locator('[data-testid^="cue-"] [data-testid="cue-auto"]').filter({ hasText: '0:04 → Out' })).toHaveCount(2);
  await takeA(page, s);
  await page.clock.runFor(1_000);
  await expect(page.getByTestId('cue-ends-hint')).toContainText('It is counting now');
  await page.getByTestId('cue-ends-mode').selectOption('manual');
  await expect(page.getByTestId('program-auto')).toHaveCount(0);
  await page.clock.runFor(10_000);
  await expect(up(page, s.a)).toBeVisible();
});

test('published, a timed cue is offered disabled and airs as a manual one', async ({ page }) => {
  const s = await seed(page, 'out', true);
  await open(page, s);
  await expect(row(page, s.a).getByTestId('cue-auto')).toHaveCount(0);
  // A manual cue cannot be timed here; a timed one keeps only the way back to Manual.
  await row(page, s.b).getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-ends-mode')).toBeDisabled();
  await row(page, s.a).getByTestId('select-cue').click();
  await expect(page.getByTestId('cue-ends-mode')).toBeEnabled();
  await expect(page.getByTestId('cue-ends-mode').locator('option[value="after"]')).toHaveJSProperty('disabled', true);
  await expect(page.getByTestId('cue-ends-after')).toBeDisabled();
  await expect(page.getByTestId('cue-ends-hint')).toHaveText(
    'Timed cues run on an unpublished production for now. On a published one they arrive with the next update.',
  );
  // Taken, it is an ordinary manual cue: no countdown, and nothing ends it.
  await page.getByTestId('verb-take').click();
  await expect(onAir(page, s.a)).toBeVisible();
  await page.clock.runFor(10_000);
  await expect(onAir(page, s.a)).toBeVisible();
  await expect(page.getByTestId('program-auto')).toHaveCount(0);
  await expect(row(page, s.a).getByTestId('cue-auto')).toHaveCount(0);
});
