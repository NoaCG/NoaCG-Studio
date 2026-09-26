import { test, expect } from '@playwright/test';
import JSZip from 'jszip';
import { readFile } from 'node:fs/promises';

// The FREE OGRAF STARTERS page (/ograf, docs/OGRAF.md) - a broadcaster's ask: editable base packages,
// not from-scratch authoring. Three properties are load-bearing:
//
//   1. every card's data-starter NAME resolves against the live catalog - starters are named
//      by catalog name, and catalog renames happen (five in 2026-08 alone), so a rename must
//      fail HERE, not strand a dead card on a public page;
//   2. a download is the REAL exporter's package - manifest, Web Component, FIELDS.md - plus
//      GUIDE.md, the modification walkthrough the page exists for;
//   3. the page needs no third-party host, like everything else user-facing.

test('every starter card resolves against the catalog and mounts its live preview', async ({ page }) => {
  await page.goto('/ograf');
  const cards = page.locator('[data-starter]');
  await expect(cards).toHaveCount(6);

  // Name resolution, through the same module the page uses.
  const named = await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-starter') ?? ''));
  const missing = await page.evaluate(async (names: string[]) => {
    const { CATALOG } = await import('/src/templates/catalog.ts');
    const all = (Object.values(CATALOG) as { name: string }[][]).flat();
    return names.filter((n) => !all.some((v) => v.name === n));
  }, named);
  expect(missing, `starter cards naming designs the catalog no longer has: ${missing.join(', ')}`).toEqual([]);

  // Enhancement landed: previews mounted, downloads armed, customize links deep-link the wizard.
  await expect(page.locator('[data-preview] iframe')).toHaveCount(6);
  for (const button of await page.locator('[data-download]').all()) {
    await expect(button).toBeEnabled();
  }
  const hrefs = await page
    .locator('[data-customize]')
    .evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute('href') ?? ''));
  for (const href of hrefs) expect(href).toMatch(/^\/app#\/new\/.+/);
});

test('a starter download is a valid OGraf package with the modification guide inside', async ({ page }) => {
  await page.goto('/ograf');
  const card = page.locator('[data-starter="Hairline"]');
  await expect(card.locator('[data-download]')).toBeEnabled();

  const downloadP = page.waitForEvent('download');
  await card.locator('[data-download]').click();
  const download = await downloadP;
  expect(download.suggestedFilename()).toBe('hairline-ograf.zip');

  const zip = await JSZip.loadAsync(await readFile((await download.path())!));
  for (const name of [
    'hairline/hairline.ograf.json',
    'hairline/graphic.mjs',
    'hairline/GUIDE.md',
    'hairline/FIELDS.md',
    'hairline/README.md',
    'hairline/lib/gsap.min.js',
  ]) {
    expect(zip.file(name), `missing ${name}`).toBeTruthy();
  }
  const manifest = JSON.parse(await zip.file('hairline/hairline.ograf.json')!.async('string')) as {
    id: string;
    main: string;
    schema: Record<string, unknown>;
  };
  expect(manifest.id).toBe('noacg-hairline');
  expect(manifest.main).toBe('graphic.mjs');
  expect(Object.keys(manifest.schema).length).toBeGreaterThan(0);

  const guide = await zip.file('hairline/GUIDE.md')!.async('string');
  expect(guide).toContain('starter guide');
  expect(guide).toContain('`f0`');
  expect(guide).toContain('updateAction');
  // The success line names the gate, because "validated" is the page's claim.
  await expect(card.locator('[data-note]')).toContainText('EBU OGraf v1 schema');
});

test('the page and its downloads need no third-party host', async ({ page }) => {
  const attempted: string[] = [];
  await page.route(
    (url) => !['localhost', '127.0.0.1', '[::1]', '::1'].includes(url.hostname),
    (route) => {
      attempted.push(route.request().url());
      return route.abort();
    },
  );
  await page.goto('/ograf');
  await expect(page.locator('[data-preview] iframe')).toHaveCount(6);
  const downloadP = page.waitForEvent('download');
  await page.locator('[data-starter="Big Stat"] [data-download]').click();
  await downloadP;
  expect(attempted).toEqual([]);
});
