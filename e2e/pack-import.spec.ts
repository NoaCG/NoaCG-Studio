import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// The graphics pack (src/packs/graphicsPack.ts): a .noacgpack.json file installs from the
// Productions section's import card as one ready production — graphics pooled, layers set,
// the prepared cue rundown seeded — and a non-pack file is refused with a reason. The card
// is the door for packages made OUTSIDE the studio (`noacg pack`, a production export); it
// lists no shipped packs, because NoaCG's own templates come through the template wizard.
// The Uutishuone pack file (public/packs/uutishuone.noacgpack.json) is this spec's fixture.

const UUTISHUONE = fileURLToPath(new URL('../public/packs/uutishuone.noacgpack.json', import.meta.url));

test('a pack file installs as a ready production', async ({ page }) => {
  await page.goto('/app#/home/productions');

  // The card offers the file door and nothing else - no shipped pack rows.
  const card = page.getByTestId('import-pack-card');
  await expect(card).toBeVisible();
  await expect(card.locator('[data-testid^="install-pack-"]')).toHaveCount(0);
  await card.getByTestId('import-pack-file').setInputFiles(UUTISHUONE);

  // Install parses, validates every graphic through the export gate, saves the set and
  // lands on the production page — a failure would surface on the card instead.
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(page.getByTestId('production-page')).toContainText('Uutishuone');

  // The prepared rundown arrived whole: 1 opener + 3 name straps + 3 headlines + 1 ticker
  // + 1 bug + 1 endboard = 10 cues.
  const cueRows = page.getByTestId('cue-list').locator('.pd-cue');
  await expect(cueRows).toHaveCount(10);
  await expect(page.getByTestId('cue-list')).toContainText('Avaus — UUTISET');
  await expect(page.getByTestId('cue-list')).toContainText('Anna Virtanen — toimittaja');
  await expect(page.getByTestId('cue-list')).toContainText('Uutisnauha');
  await expect(page.getByTestId('cue-list')).toContainText('Lopetus');

  // The ticker cue's headline list is ONE textarea (the repeating-data rule) carrying the
  // pack's Finnish sample items, and its label field holds the label block's word.
  await cueRows.filter({ hasText: 'Uutisnauha' }).click();
  await expect(page.getByTestId('cue-field-f0')).toHaveValue(/Hallitus neuvottelee budjetista/);
  await expect(page.getByTestId('cue-field-f0')).toHaveValue(/Kirjastojen lainausmäärät/);
  await expect(page.getByTestId('cue-field-f1')).toHaveValue('UUTISET');

  // The local cue preview renders the ticker's label block from the cue's values.
  const preview = page.frameLocator('iframe[title="Cue preview"]');
  await expect(preview.locator('#f1')).toHaveText('UUTISET');

  // Editing the headline list stays a plain field edit — type, and the cue holds it.
  await page.getByTestId('cue-field-f1').fill('SUORA');
  await expect(preview.locator('#f1')).toHaveText('SUORA');
});

test('a JSON file that is not a pack is refused with a reason', async ({ page }) => {
  await page.goto('/app#/home/productions');
  const card = page.getByTestId('import-pack-card');
  await card.getByTestId('import-pack-file').setInputFiles({
    name: 'not-a-pack.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"just":"json"}'),
  });
  await expect(card.locator('.status-bad')).toContainText('not a NoaCG graphics pack');
  // Nothing was created — the section still shows its empty state.
  await expect(page.getByTestId('no-productions')).toBeVisible();
});
