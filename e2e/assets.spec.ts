// covers: src/components/{AssetsPanel.tsx,InsertTemplateDialog.tsx}, src/assets/**
//
// The mark PROBE is read by the Lite legibility gate and by Pro's mark-field trigger, and the
// trigger rests entirely on `inkSpread` separating one ink from several.
// covers: src/assets/assetInfo.ts

import { test, expect, type Page } from '@playwright/test';
import { createProject } from './_create';

// The Assets panel: its own dock tab (desktop + mobile), row-based file list with folders,
// undoable imports, the derived info section, reference-safe moves, and the v2 -> v3
// layout migration that surfaces the new tab for existing users.

// A valid 1×1 fully opaque black RGBA PNG - these tests exercise assets, not decode recovery.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNgYGD4DwABBAEAgLvRWwAAAABJRU5ErkJggg==',
  'base64',
);

/** A minimal REAL animation (one red solid layer) — passes the signature gate AND renders. */
const TINY_LOTTIE = Buffer.from(
  JSON.stringify({
    v: '5.7.0', fr: 30, ip: 0, op: 60, w: 512, h: 512, nm: 'burst', ddd: 0, assets: [],
    layers: [{
      ddd: 0, ind: 1, ty: 1, nm: 'solid', sr: 1,
      ks: {
        o: { a: 0, k: 100 }, r: { a: 0, k: 0 },
        p: { a: 0, k: [256, 256, 0] }, a: { a: 0, k: [256, 256, 0] }, s: { a: 0, k: [100, 100, 100] },
      },
      sw: 512, sh: 512, sc: '#ff0000', ip: 0, op: 60, st: 0,
    }],
  }),
);

async function createHairline(page: Page) {
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
}

async function openAssetsTab(page: Page) {
  await page.getByTestId('dock-tab-assets').click();
  await expect(page.getByTestId('assets-panel')).toBeVisible();
}

test('import via the Assets tab: rows appear grouped, and a multi-file import is ONE undo step', async ({ page }) => {
  await createHairline(page);
  await openAssetsTab(page);

  await page.getByTestId('assets-import-input').setInputFiles([
    { name: 'team-logo.png', mimeType: 'image/png', buffer: TINY_PNG },
    { name: 'sponsor.png', mimeType: 'image/png', buffer: TINY_PNG },
  ]);
  await expect(page.getByTestId('asset-row')).toHaveCount(2);
  await expect(page.locator('.asset-folder-head').first()).toHaveText('images/');
  await expect(page.locator('[data-path="images/team-logo.png"]')).toBeVisible();

  // ONE Ctrl+Z reverts the whole import (addAssets batches into one history snapshot).
  await page.keyboard.press('Control+z');
  await expect(page.getByTestId('asset-row')).toHaveCount(0);
});

test('the info section derives name, format, dimensions, size, alpha, and usage', async ({ page }) => {
  await createHairline(page);
  await openAssetsTab(page);

  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'team-logo.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  // Importing selects the new asset; the info section fills in as the probe lands.
  const info = page.getByTestId('asset-info');
  await expect(info).toBeVisible();
  await expect(info).toContainText('team-logo.png');
  await expect(info).toContainText('image/png');
  await expect(info).toContainText('1 × 1 px');
  await expect(info.locator('.asset-fact', { hasText: 'Transparency' })).toContainText(/yes|no/);
  await expect(info).toContainText('not referenced');
});

test('remove is undoable; a Lottie file imports with its badge; junk JSON is rejected', async ({ page }) => {
  await createHairline(page);
  await openAssetsTab(page);

  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'burst.json', mimeType: 'application/json', buffer: TINY_LOTTIE,
  });
  await expect(page.locator('[data-path="lottie/burst.json"]')).toBeVisible();
  await expect(page.locator('.asset-badge-lottie')).toHaveText('LOTTIE');
  // The info section reads the animation's authored size and timing.
  await expect(page.getByTestId('asset-info')).toContainText('512 × 512 px');
  await expect(page.getByTestId('asset-info')).toContainText('2s · 30 fps');

  // A .json without the Lottie signature is rejected with an honest note.
  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'random.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}'),
  });
  await expect(page.locator('.assets-panel .status-bad')).toContainText('not a Lottie animation');
  await expect(page.getByTestId('asset-row')).toHaveCount(1);

  // Remove, then undo restores it.
  await page.getByRole('button', { name: '✕ Remove' }).click();
  await expect(page.getByTestId('asset-row')).toHaveCount(0);
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-path="lottie/burst.json"]')).toBeVisible();
});

test('moving an asset into a new folder nests its path; undo restores it', async ({ page }) => {
  await createHairline(page);
  await openAssetsTab(page);

  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'team-logo.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  await expect(page.locator('[data-path="images/team-logo.png"]')).toBeVisible();

  // "New folder…" in the Move select prompts for a name.
  page.once('dialog', (d) => void d.accept('logos'));
  await page.getByTestId('asset-info').locator('select').selectOption('__new__');
  await expect(page.locator('[data-path="images/logos/team-logo.png"]')).toBeVisible();
  await expect(page.locator('.asset-folder-head', { hasText: 'images/logos/' })).toBeVisible();

  // The move is one undoable apply.
  await page.keyboard.press('Control+z');
  await expect(page.locator('[data-path="images/team-logo.png"]')).toBeVisible();
});

test('dragging an asset onto the canvas inserts a positioned <img> as one undo step', async ({ page }) => {
  await createHairline(page);
  await openAssetsTab(page);
  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'team-logo.png', mimeType: 'image/png', buffer: TINY_PNG,
  });
  const row = page.locator('[data-path="images/team-logo.png"]');
  await expect(row).toBeVisible();

  // HTML5 drag via dispatched events (Playwright can't native-drag): dragstart on the row
  // fills the DataTransfer, drop on the canvas overlay places the image at that point.
  const dt = await page.evaluateHandle(() => new DataTransfer());
  await row.dispatchEvent('dragstart', { dataTransfer: dt });
  const canvas = (await page.getByTestId('canvas-layer').boundingBox())!;
  const dropX = canvas.x + canvas.width * 0.6;
  const dropY = canvas.y + canvas.height * 0.4;
  await page.getByTestId('canvas-layer').dispatchEvent('drop', {
    dataTransfer: dt, clientX: dropX, clientY: dropY,
  });

  // The insert is real, commented code: an <img> with a positioned CSS rule.
  const state = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const s = useTemplateStore.getState();
      return { html: s.template.html, css: s.template.css, selected: s.selectedPart };
    });
  await expect.poll(async () => (await state()).html).toContain('id="img-team-logo"');
  const st = await state();
  expect(st.html).toContain('src="images/team-logo.png"');
  expect(st.css).toContain('#img-team-logo');
  expect(st.css).toContain('position: absolute');
  // The new element became the shared selection (selectable, animatable part).
  expect(st.selected).toBe('#img-team-logo');
  // The preview renders it after the debounced rebuild, with the data-URL inlined.
  const img = page.frameLocator('iframe.preview-frame').locator('#img-team-logo');
  await expect(img).toBeVisible({ timeout: 3000 });
  expect(await img.getAttribute('src')).toContain('data:image/png');

  // The new selection auto-reveals the Inspector tab (by design), so return to the
  // Assets tab and re-select the row before reading its info.
  await page.getByTestId('dock-tab-assets').click();
  await row.click();
  await expect(page.getByTestId('asset-info')).toContainText('1× in the template');

  // Moving the asset into a folder rewrites the reference in the code.
  page.once('dialog', (d) => void d.accept('logos'));
  await page.getByTestId('asset-info').locator('select').selectOption('__new__');
  await expect.poll(async () => (await state()).html).toContain('src="images/logos/team-logo.png"');

  // Undo the move, then undo the insert — each was exactly one step.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state()).html).toContain('src="images/team-logo.png"');
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await state()).html).not.toContain('img-team-logo');
});

test('dropping a Lottie asset on the canvas inserts a playing animation element', async ({ page }) => {
  await createHairline(page);
  await openAssetsTab(page);
  await page.getByTestId('assets-import-input').setInputFiles({
    name: 'burst.json', mimeType: 'application/json', buffer: TINY_LOTTIE,
  });
  const row = page.locator('[data-path="lottie/burst.json"]');
  await expect(row).toBeVisible();

  const dt = await page.evaluateHandle(() => new DataTransfer());
  await row.dispatchEvent('dragstart', { dataTransfer: dt });
  const canvas = (await page.getByTestId('canvas-layer').boundingBox())!;
  await page.getByTestId('canvas-layer').dispatchEvent('drop', {
    dataTransfer: dt, clientX: canvas.x + canvas.width / 2, clientY: canvas.y + canvas.height / 2,
  });

  // The insert wrote the container, the player's script tag, and ONE shared bootstrap.
  const code = () =>
    page.evaluate(async () => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const t = useTemplateStore.getState().template;
      return { html: t.html, js: t.js };
    });
  await expect.poll(async () => (await code()).html).toContain('data-lottie="lottie/burst.json"');
  const c = await code();
  expect(c.html).toContain('id="lottie-burst"');
  expect(c.html).toContain('js/lottie.min.js');
  expect(c.js).toContain('function initLottieBoxes()');

  // The preview plays it: the bundled player builds an <svg> inside the container.
  const box = page.frameLocator('iframe.preview-frame').locator('#lottie-burst');
  await expect(box).toBeVisible({ timeout: 3000 });
  await expect(box.locator('svg')).toBeVisible({ timeout: 3000 });
  // The attribute was inlined to a data: URL for the srcdoc preview (no network).
  expect(await box.getAttribute('data-lottie')).toContain('data:application/json');

  // One undo removes the whole insert.
  await page.keyboard.press('Control+z');
  await expect.poll(async () => (await code()).html).not.toContain('lottie-burst');
});

test('a saved v2 layout gains the Assets tab once (v2 -> v3 migration)', async ({ page }) => {
  await createHairline(page);
  // Seed a hand-written v2 layout (no assets panel anywhere). NEVER via addInitScript —
  // it would also run inside the same-origin preview iframe on every rebuild.
  await page.evaluate(() => {
    localStorage.setItem(
      'spx-gfx-layout',
      JSON.stringify({
        version: 2,
        docks: {
          left: { panels: ['code'], active: 'code', size: 0.28 },
          right: { panels: ['inspector', 'data', 'control', 'style', 'ai', 'export'], active: 'inspector', size: 0.26 },
          bottom: { panels: [], active: null, size: 0.3 },
        },
        timelineSize: 0.4,
      }),
    );
  });
  await page.reload();
  await expect(page.locator('.topbar')).toBeVisible();
  // The migration inserted Assets right after Style in the right dock.
  await expect(page.locator('[data-testid="dock-right"] .dock-tab-label')).toHaveText([
    'Inspector', 'Content', 'Rehearse', 'Style', 'Assets', 'AI', 'Export',
  ]);
});

test('mobile: the Assets tab is in the side-panel strip', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await createHairline(page);
  const tab = page.locator('.panel-tabs .tab', { hasText: 'Assets' });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.getByTestId('assets-panel')).toBeVisible();
});
