// covers: src/components/home/{ProductionPage,ActionArranger}.tsx, src/components/HostedControlPage.tsx
// covers: src/styles/playout-dashboard.css
// focus

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { settleDurableWrites } from './_durable';

// LIVE ACTIONS FIRST (docs/research/control-surfaces-review-2026-10-02 slice 4; the AC of the
// backlog item it closed, "the Playout page buries live actions"). A graphic that declares
// ⚡ actions is operated through them, so on the Playout page they sit straight under the monitors
// and the setup fields come after them, foldable. Measured at the laptop size the backlog item
// was filed at, 1600x900, where the hockey scorebug's clock and goal buttons used to sit below
// twelve inputs and the answer board's Reveal row was cut by the fold under eight.

test.use({ viewport: { width: 1600, height: 900 } });

/** A production holding one catalog graphic, opened on its Playout page. */
async function catalogProduction(page: Page, variant: string, name: string): Promise<void> {
  await page.goto('/app');
  await page.keyboard.press('Escape');
  const id = await page.evaluate(
    async ({ variant, name }) => {
      const { variantById } = await import('/src/templates/catalog.ts');
      const { createGraphic } = await import('/src/model/library.ts');
      const shows = await import('/src/model/shows.ts');
      const tpl = variantById(variant)!.create({});
      const { doc, error } = createGraphic(tpl, { name });
      if (error) throw new Error(error);
      const show = shows.createShowNamed(`${name} show`);
      shows.addGraphicToShow(show.id, tpl, { graphicId: doc!.id });
      return show.id;
    },
    { variant, name },
  );
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
}

/** Whether the element is wholly on screen, inside the control area's scroller too. */
async function onScreen(page: Page, testId: string): Promise<void> {
  await expect(page.getByTestId(testId)).toBeInViewport({ ratio: 1 });
}

test('the hockey scorebug: its clock and goal buttons show without scrolling, above the setup fields', async ({ page }) => {
  test.setTimeout(90_000);
  // The benchmark's agent-made package (cj-bench 2026-10-02, b2-hockey), imported the way a user
  // brings an agent's zip in: Import graphics, then straight into a new production.
  await page.goto('/app#/new');
  await page.getByText('Import graphics', { exact: true }).first().click();
  await page.locator('input[type=file]').first().setInputFiles({
    name: 'hockey-scorebug.zip',
    mimeType: 'application/zip',
    buffer: readFileSync('e2e/fixtures/agent-made/hockey-scorebug.zip'),
  });
  await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByPlaceholder('Untitled production').fill('Hockey night');
  await page.getByText('Add to the production and go live').click();
  await page.getByRole('button', { name: 'Add it and go there' }).click();
  await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 15_000 });

  // THE ORDER: the ⚡ block before the editor, in the one scroller, with nothing scrolled.
  const actions = page.getByTestId('cue-actions');
  await expect(actions).toBeVisible();
  const area = page.getByTestId('control-area');
  expect(await area.evaluate((el) => el.scrollTop)).toBe(0);
  const actionsTop = (await actions.boundingBox())!.y;
  const editorTop = (await page.getByTestId('cue-editor').boundingBox())!.y;
  expect(actionsTop, 'the live actions come before the setup fields').toBeLessThan(editorTop);

  // THE AC: the buttons pressed all game, wholly on screen at 1600x900.
  for (const id of ['clockStart', 'clockStop', 'goalA', 'goalB']) await onScreen(page, `cue-action-${id}`);

  // Take it, start the clock, score: the presses work from where they now sit.
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('cue-action-clockStart')).toBeEnabled();
  await page.getByTestId('cue-action-clockStart').click();
  await expect(page.getByTestId('machine-state-chip')).toContainText(/running/i);

  // THE SETUP FOLD: folded, the fields are gone from the column and the bar reads back what is
  // set; unfolded, they are back with their values.
  const fold = page.getByTestId('cue-fields-fold');
  await expect(fold).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByTestId('cue-field-f0')).toBeVisible();
  await fold.click();
  await expect(fold).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('cue-field-f0')).toHaveCount(0);
  await expect(page.getByTestId('cue-fields-summary')).toContainText('HOME');
  await fold.click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('HOME');
});

test('the answer board quiz: every answer action shows without scrolling', async ({ page }) => {
  // qz02, the "Pick, then lock" answer board: the review's shot of it at 1600x900 had its Reveal
  // row cut by the fold under eight setup fields.
  await catalogProduction(page, 'qz02', 'House Quiz');
  for (const id of ['cue-action-select', 'cue-action-lock', 'cue-action-judge']) await onScreen(page, id);
  const actionsTop = (await page.getByTestId('cue-actions').boundingBox())!.y;
  const editorTop = (await page.getByTestId('cue-editor').boundingBox())!.y;
  expect(actionsTop).toBeLessThan(editorTop);
  // Snap is recovery, folded closed at the foot of the block rather than beside its title.
  await expect(page.getByTestId('machine-snap')).toBeHidden();
  await page.getByTestId('cue-actions-recovery').locator('summary').click();
  await expect(page.getByTestId('machine-snap')).toBeVisible();
});

test('a graphic with no actions keeps today\'s panel: the editor first, no fold, no actions block', async ({ page }) => {
  await catalogProduction(page, 'lt01', 'Hairline');
  await expect(page.getByTestId('cue-editor')).toBeVisible();
  await expect(page.getByTestId('cue-actions')).toHaveCount(0);
  await expect(page.getByTestId('cue-fields-fold')).toHaveCount(0);
  // The editor is the first block of the control area, right under the monitors.
  const first = await page.getByTestId('control-area').evaluate((el) => (el.firstElementChild as HTMLElement | null)?.dataset.testid);
  expect(first).toBe('cue-editor');
});

test('» Next names its target: the answer board at Question reads Reveal correct, and last step once revealed', async ({ page }) => {
  // The 2026-09-30 finding that Next on a quiz "jumps to the last step", explained rather than
  // changed: the answer board's default path goes Question, then Reveal, by declaration (slice 2
  // of the control-surfaces review). The button now says so before it is pressed.
  await catalogProduction(page, 'qz02', 'House Quiz');
  await page.getByTestId('verb-take').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Question');
  await expect(page.getByTestId('verb-next-target')).toHaveText('Reveal correct');
  await expect(page.getByTestId('verb-next')).toHaveAttribute('title', /next step: Reveal correct/);
  await page.getByTestId('cue-action-judge').click();
  await expect(page.getByTestId('machine-state-chip')).toHaveText('Reveal');
  await expect(page.getByTestId('verb-next-target')).toHaveText('last step');
  await expect(page.getByTestId('verb-next')).toBeDisabled();
});
