import { bootstrapGraphic, openExportWindow, skipOldEditor } from './_create';
import { pickDesign } from './_browse';

// The Export tab's Video & image render section (src/components/render/RenderPanel.tsx).
// The offline suite runs with VITE_RENDER_API=1 (playwright.config.ts webServer env), so
// the section is present; every /api/render call here is stubbed with page.route — no
// real render runs in CI (the real loop is covered by scripts/render-smoke.mjs).

import { test, expect, type Page } from '@playwright/test';

async function createHairline(page: Page) {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
}

async function openRenderPanel(page: Page) {
  await openExportWindow(page);
  await expect(page.getByTestId('render-panel')).toBeVisible();
  // The panel measures the graphic in a hidden iframe before it can render.
  await expect(page.getByTestId('render-breakdown')).not.toContainText('Measuring', { timeout: 15_000 });
}

/** Walk the wizard to Finish and take the EXPORT door, landing in the standalone ExportWindow
 *  (the same surface Home's ⬇ card opens) with the editor never revealed. */
async function openExportWindowViaFinish(page: Page, name: string) {
  await page.goto('/app');
  await expect(page.getByTestId('creation-wizard')).toBeVisible();
  await page.locator('[data-entry="template"]').click();
  await pickDesign(page, 'Hairline');
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Next →' }).click();
  await page.getByTestId('wz-finish-name').fill(name);
  await page.getByTestId('wz-finish-export').click();
  await expect(page.getByTestId('export-window')).toBeVisible();
}

/** The render section, once measured, inside a given root (the dock panel or the modal). */
async function awaitRenderMeasured(root: ReturnType<Page['getByTestId']>) {
  await expect(root.getByTestId('render-panel')).toBeVisible();
  await expect(root.getByTestId('render-breakdown')).not.toContainText('Measuring', { timeout: 15_000 });
}

test('render section lists the five formats and a real timing breakdown', async ({ page }) => {
  await createHairline(page);
  await openRenderPanel(page);
  for (const id of ['mp4', 'webm', 'png-still', 'png-sequence', 'prores4444']) {
    await expect(page.getByTestId(`render-format-${id}`)).toBeVisible();
  }
  // Measured breakdown: In · Hold · Out with real seconds (lt01 has a real entrance+exit).
  const breakdown = page.getByTestId('render-breakdown');
  await expect(breakdown).toContainText('In');
  await expect(breakdown).toContainText('Hold');
  await expect(breakdown).toContainText('Out');
  await expect(page.getByTestId('render-start')).toBeEnabled();
});

test('a too-short total is a hard preflight error that disables rendering', async ({ page }) => {
  await createHairline(page);
  await openRenderPanel(page);
  await page.getByTestId('render-duration').fill('1');
  await expect(page.getByTestId('render-breakdown')).toContainText('animations need');
  await expect(page.getByTestId('render-start')).toBeDisabled();
});

test('happy path: start -> progress -> complete -> download link (stubbed API)', async ({ page }) => {
  const statuses = [
    { state: 'provisioning', percent: 6, format: 'mp4', jobId: 'j1' },
    { state: 'rendering', percent: 45, format: 'mp4', jobId: 'j1', frames: { rendered: 60, encoded: 0, total: 150 } },
    {
      state: 'complete', percent: 100, format: 'mp4', jobId: 'j1',
      output: { url: '/api/render/file?id=j1', downloadUrl: '/api/render/file?id=j1', bytes: 250_000, contentType: 'video/mp4', expiresAt: new Date(Date.now() + 3600_000).toISOString() },
    },
  ];
  let statusCalls = 0;
  await page.route('**/api/render/start', (route) =>
    route.fulfill({ status: 202, json: { jobId: 'j1', jobToken: 'tok', pollIntervalMs: 100, totalFrames: 150 } }));
  await page.route('**/api/render/status**', (route) =>
    route.fulfill({ status: 200, json: statuses[Math.min(statusCalls++, statuses.length - 1)] }));

  await createHairline(page);
  await openRenderPanel(page);
  await page.getByTestId('render-start').click();
  await expect(page.getByTestId('render-progress')).toBeVisible();
  await expect(page.getByTestId('render-result')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('render-result')).toContainText('MP4');
  await expect(page.getByTestId('render-result')).toContainText('250 kB');
  const href = await page.getByTestId('render-download').getAttribute('href');
  expect(href).toContain('/api/render/file?id=j1');
  expect(href).toContain('token=tok');
  // "Render another" resets to the idle form.
  await page.getByRole('button', { name: 'Render another' }).click();
  await expect(page.getByTestId('render-start')).toBeVisible();
});

test('a failed job shows the server message and recovers', async ({ page }) => {
  await page.route('**/api/render/start', (route) =>
    route.fulfill({ status: 202, json: { jobId: 'j2', jobToken: 'tok', pollIntervalMs: 100, totalFrames: 150 } }));
  await page.route('**/api/render/status**', (route) =>
    route.fulfill({ status: 200, json: {
      jobId: 'j2', state: 'failed', percent: 0, format: 'mp4',
      error: { code: 'render_failed', message: 'The graphic threw at frame 12' },
    } }));

  await createHairline(page);
  await openRenderPanel(page);
  await page.getByTestId('render-start').click();
  await expect(page.getByTestId('render-error')).toContainText('The graphic threw at frame 12', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('render-start')).toBeVisible();
});

test('a rate-limited start surfaces inline and stays retryable', async ({ page }) => {
  // The burst gate (api/_lib/rateLimit.ts) answers 429 rate_limited + Retry-After before
  // the handler reads the manifest at all.
  await page.route('**/api/render/start', (route) =>
    route.fulfill({
      status: 429,
      headers: { 'retry-after': '30' },
      json: { error: { code: 'rate_limited', message: 'Too many render requests from this network — wait a moment and try again.' } },
    }));
  await createHairline(page);
  await openRenderPanel(page);
  await page.getByTestId('render-start').click();
  await expect(page.getByTestId('render-error')).toContainText('Too many render requests');
  await expect(page.getByTestId('render-start')).toBeEnabled();
});

test('a busy fleet is refused with the sign-in nudge, and stays retryable', async ({ page }) => {
  // The fleet ceiling (api/_lib/admission.ts) answers 503 busy + Retry-After when the
  // deployment is at capacity — a different shape from the per-principal 429 below.
  await page.route('**/api/render/start', (route) =>
    route.fulfill({
      status: 503,
      headers: { 'retry-after': '60' },
      json: { error: { code: 'busy', message: 'The render service is busy — sign in to render now, or try again in a minute.' } },
    }));
  await createHairline(page);
  await openRenderPanel(page);
  await page.getByTestId('render-start').click();
  await expect(page.getByTestId('render-error')).toContainText('render service is busy');
  await expect(page.getByTestId('render-start')).toBeEnabled();
});

test('quota rejection surfaces the server message inline', async ({ page }) => {
  await page.route('**/api/render/start', (route) =>
    route.fulfill({ status: 429, json: { error: { code: 'quota', message: 'Hourly render limit reached (2/h). Try again later.' } } }));
  await createHairline(page);
  await openRenderPanel(page);
  await page.getByTestId('render-start').click();
  await expect(page.getByTestId('render-error')).toContainText('Hourly render limit reached');
  // Still recoverable: the button stays available for a later retry.
  await expect(page.getByTestId('render-start')).toBeEnabled();
});

test('cancel mid-render returns to the idle form', async ({ page }) => {
  await page.route('**/api/render/start', (route) =>
    route.fulfill({ status: 202, json: { jobId: 'j3', jobToken: 'tok', pollIntervalMs: 100, totalFrames: 150 } }));
  await page.route('**/api/render/status**', (route) =>
    route.fulfill({ status: 200, json: { jobId: 'j3', state: 'rendering', percent: 30, format: 'mp4' } }));
  await page.route('**/api/render/cancel', (route) =>
    route.fulfill({ status: 200, json: { jobId: 'j3', state: 'cancelled', percent: 0, format: 'mp4' } }));

  await createHairline(page);
  await openRenderPanel(page);
  await page.getByTestId('render-start').click();
  await expect(page.getByTestId('render-cancel')).toBeVisible();
  await page.getByTestId('render-cancel').click();
  await expect(page.getByTestId('render-error')).toContainText('Render cancelled');
  await page.getByRole('button', { name: 'Try again' }).click();
  await expect(page.getByTestId('render-start')).toBeVisible();
});

// The render section is part of the STORE-INDEPENDENT ExportSurface, so it must also work
// inside the standalone ExportWindow — the surface reached without ever opening the editor
// (the wizard's Finish export door, and a saved graphic's ⬇ on Home). render.spec's other
// cases only ever drive the dock panel; these two exercise the modal.

test('the standalone export window carries the render section, measured off the saved record', async ({ page }) => {
  skipOldEditor();
  await createHairline(page);
  // Save it, then export from the Home row's ⋯ menu — the door that reads the RECORD's
  // template, not the store, so the render section measures a graphic independent of the
  // working doc.
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Saved Render Target');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-dialog')).toBeHidden();

  await page.getByTestId('open-home').click();
  // The dashboard shows a shelf of recent graphics; the library ROWS and their ⋯ menus belong
  // to the Graphics section, which is where this door is reached from.
  await page.getByTestId('home-nav-graphics').click();
  const row = page.locator('.lib-row', { hasText: 'Saved Render Target' });
  await row.getByTestId('row-menu').click();
  await row.getByTestId('export-graphic').click();
  const win = page.getByTestId('export-window');
  await expect(win).toBeVisible();

  await awaitRenderMeasured(win);
  for (const id of ['mp4', 'webm', 'png-still', 'png-sequence', 'prores4444']) {
    await expect(win.getByTestId(`render-format-${id}`)).toBeVisible();
  }
  const breakdown = win.getByTestId('render-breakdown');
  await expect(breakdown).toContainText('In');
  await expect(breakdown).toContainText('Out');
  await expect(win.getByTestId('render-start')).toBeEnabled();
});

test('a render runs to a download from inside the standalone export window (stubbed API)', async ({ page }) => {
  const statuses = [
    { state: 'rendering', percent: 45, format: 'mp4', jobId: 'jw', frames: { rendered: 60, encoded: 0, total: 150 } },
    {
      state: 'complete', percent: 100, format: 'mp4', jobId: 'jw',
      output: { url: '/api/render/file?id=jw', downloadUrl: '/api/render/file?id=jw', bytes: 250_000, contentType: 'video/mp4', expiresAt: new Date(Date.now() + 3600_000).toISOString() },
    },
  ];
  let statusCalls = 0;
  await page.route('**/api/render/start', (route) =>
    route.fulfill({ status: 202, json: { jobId: 'jw', jobToken: 'tok', pollIntervalMs: 100, totalFrames: 150 } }));
  await page.route('**/api/render/status**', (route) =>
    route.fulfill({ status: 200, json: statuses[Math.min(statusCalls++, statuses.length - 1)] }));

  await openExportWindowViaFinish(page, 'Windowed Render');
  const win = page.getByTestId('export-window');
  await awaitRenderMeasured(win);

  await win.getByTestId('render-start').click();
  await expect(win.getByTestId('render-progress')).toBeVisible();
  await expect(win.getByTestId('render-result')).toBeVisible({ timeout: 10_000 });
  await expect(win.getByTestId('render-result')).toContainText('MP4');
  const href = await win.getByTestId('render-download').getAttribute('href');
  expect(href).toContain('/api/render/file?id=jw');
  expect(href).toContain('token=tok');
});
