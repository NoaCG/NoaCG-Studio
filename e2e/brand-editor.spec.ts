import { test, expect, type Page } from '@playwright/test';
import { armStorageFailure, fillStorage, freeStorage } from './_storage';
import { bootstrapGraphic } from './_create';

const logo = { name: 'channel.svg', mimeType: 'image/svg+xml', buffer: Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="20" fill="#38bdf8"/><path d="M25 75V25h15l20 30V25h15v50H60L40 45v30z" fill="white"/></svg>',
) };

async function openCreator(page: Page) {
  await page.goto('/app#/home/looks');
  await expect(page.getByRole('heading', { name: 'Brands', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'New brand', exact: true }).click();
  await page.getByLabel('Brand name', { exact: true }).fill('Channel A');
}

test('rapid brand edits keep controls immediate and rebuild previews only after settling', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-01-01T00:00:00Z') });
  await openCreator(page);
  await page.clock.pauseAt(new Date('2026-01-01T00:01:00Z'));
  const preview = page.locator('.brand-preview-card iframe').first();
  const before = await preview.getAttribute('srcdoc');
  const accent = page.getByLabel('Accent value', { exact: true });
  for (const colour of ['#112233', '#223344', '#334455']) {
    await accent.fill(colour);
    await expect(accent).toHaveValue(colour);
    await page.clock.runFor(50);
    expect(await preview.getAttribute('srcdoc')).toBe(before);
  }
  await page.clock.runFor(151);
  await expect(preview).toHaveAttribute('srcdoc', /#334455/);
  // Save uses the current draft even when the preview has not caught up.
  await accent.fill('#556677');
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.locator('.lib-row', { hasText: 'Channel A' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(accent).toHaveValue('#556677');
});

test('create a brand without a graphic, preview it, edit it and reuse it in the wizard', async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1366, height: 768 });
  await openCreator(page);
  await page.getByLabel('Accent value', { exact: true }).fill('#19ce93');
  await page.getByLabel('Typeface', { exact: true }).selectOption('oswald');
  await page.getByLabel('Brand logo', { exact: true }).setInputFiles(logo);
  await expect(page.getByAltText('Logo on light background')).toBeVisible();
  await expect(page.locator('.brand-preview-card iframe')).toHaveCount(3);
  await expect.poll(async () => (await page.locator('.brand-preview-card iframe').nth(1).getAttribute('srcdoc')) ?? '')
    .toContain('#19ce93');
  await expect.poll(async () => (await page.locator('.brand-preview-card iframe').nth(1).getAttribute('srcdoc')) ?? '')
    .toContain('data:image/svg+xml');
  await page.screenshot({ path: testInfo.outputPath('brand-creator-1366.png'), fullPage: true });
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.screenshot({ path: testInfo.outputPath('brand-creator-1920.png'), fullPage: true });
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.reload();
  const row = page.locator('.lib-row', { hasText: 'Channel A' });
  await expect(row).toBeVisible();
  await row.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Accent value', { exact: true })).toHaveValue('#19ce93');
  await expect(page.getByLabel('Typeface', { exact: true })).toHaveValue('oswald');
  await page.getByLabel('Brand name', { exact: true }).fill('Channel B');
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await expect(page.locator('.lib-row')).toHaveCount(1);
  await page.goto('/app#/new');
  await page.locator('[data-entry="template"]').click();
  await expect(page.getByTestId('wz-brand')).toBeVisible();
  await page.getByTestId('wz-brand').selectOption({ label: 'Channel B' });
  await expect(page.getByTestId('wz-brand').locator('option:checked')).toHaveText('Channel B');
  expect(errors).toEqual([]);
});

test('brand drafts cancel without changing the open graphic; oversized and invalid logos are refused', async ({ page }) => {
  await bootstrapGraphic(page, { name: 'Hairline' });
  const before = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template;
  });
  await openCreator(page);
  await page.getByLabel('Brand logo', { exact: true }).setInputFiles({ name: 'large.png', mimeType: 'image/png', buffer: Buffer.alloc(301 * 1024) });
  await expect(page.getByRole('alert')).toContainText('300 KB');
  await page.getByLabel('Brand logo', { exact: true }).setInputFiles({ name: 'bad.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('not svg') });
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  // createProject seeds one named brand; cancelling must preserve it and add nothing.
  await expect(page.locator('.lib-row')).toHaveCount(1);
  await page.locator('.lib-row', { hasText: 'Hairline look' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByLabel('Accent value', { exact: true }).fill('#ff0099');
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  const after = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    return useTemplateStore.getState().template;
  });
  expect(after).toEqual(before);
});

test('a refused brand save retains the draft and retries without duplicating it', async ({ page }) => {
  await armStorageFailure(page);
  await openCreator(page);
  await fillStorage(page);
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText(/storage|quota/i);
  await expect(page.getByLabel('Brand name', { exact: true })).toHaveValue('Channel A');
  await freeStorage(page);
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.lib-row', { hasText: 'Channel A' })).toHaveCount(1);
});

test('an uploaded font survives reopen and a stale brand editor refuses to overwrite another save', async ({ page }) => {
  await openCreator(page);
  await page.getByTestId('font-upload-input').setInputFiles('public/fonts/inter.woff2');
  await expect(page.getByLabel('Typeface', { exact: true })).toHaveValue('custom');
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByTestId('brand-editor')).toHaveCount(0);
  await page.reload();
  await page.locator('.lib-row', { hasText: 'Channel A' }).getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Typeface', { exact: true })).toHaveValue('custom');
  await page.evaluate(async () => {
    const { loadLooks, upsertLook } = await import('/src/model/packets.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const current = loadLooks()[0];
    upsertLook({ ...current, name: 'Updated elsewhere', updatedAt: new Date(Date.now() + 1000).toISOString() });
    await commitDurableWrites();
  });
  await page.getByRole('button', { name: 'Save brand', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('changed elsewhere');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.lib-row', { hasText: 'Updated elsewhere' })).toBeVisible();
});
