// covers: src/components/{AccountSaveNotice,SyncStatus,PlayoutSettingsDialog}.tsx
// covers: src/components/playoutKeys.ts, src/components/home/{ProductionPage,CueRundown,RundownColors,PlayoutPanel,PlayoutStatusControl,ProductionSetupMenu}.tsx
// covers: src/model/{shows,outputSetup}.ts
// covers: src/styles/wizard-and-dialogs.css
// covers: e2e/_publish.ts
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { setCasparSwitch } from './_publish';
import { seedSettings } from './_fakeBridge';
import { parkFocusOffControls } from './_keys';

async function production(page: Page, caspar = false) {
  await seedSettings(page);
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const id = await page.evaluate(async caspar => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const m = await import('/src/model/shows.ts');
    const show = m.createShowNamedChecked('Output rehearsal').show;
    const result = m.addGraphicToShow(show.id, variantsFor('lower-third')[0].create({}));
    if (result.error) throw new Error(result.error);
    const source = m.loadShows().find(s => s.id === show.id)!.graphics[0];
    for (const label of ['Second', 'Third', 'Fourth']) m.addShowCue(show.id, source.id, { label });
    m.setShowOutputSetup(show.id, { v: 1, destinations: [{ id: caspar ? 'casparcg' : 'browser', profile: caspar ? 'casparcg' : 'browser' }] });
    return show.id;
  }, caspar);
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.locator('.pd-cue')).toHaveCount(4);
  return id;
}

test('routine anonymous work uses persistent header state without a global notice', async ({ page }) => {
  await page.route('**/src/backend/config.ts*', r => r.fulfill({ contentType: 'text/javascript', body: "export function loadBackendConfig(){return {url:'https://cloudmock.invalid',anonKey:'test-public-key'}};export function isBackendConfigured(){return true}" }));
  await page.route('https://cloudmock.invalid/**', r => r.fulfill({ contentType: 'application/json', body: '[]' }));
  await page.goto('/app#/home');
  await expect(page.locator('.sync-status')).toHaveAccessibleName('Sync: Saved on this device only');
  await expect(page.locator('.sync-status')).toHaveAttribute('data-tone', 'local');
  await page.locator('.sync-status').click();
  await expect(page.getByTestId('sync-action')).toHaveText('Sign in');
  await expect(page.getByTestId('account-save-notice')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/studio-feedback-quiet-saving.png' });
});

test('a browser production hides every CasparCG control, and its panel names the browser source', async ({ page }) => {
  await production(page);
  await page.getByTestId('rundown-add').click();
  await expect(page.getByTestId('add-from-server')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // The output is no longer chosen or named in Playout settings (playout-workflow-simplification
  // AC-3, AC-4): the dialog holds the rundown colours, and the CasparCG form only with the switch on.
  await page.getByTestId('production-setup').click();
  await page.getByTestId('setup-playout-settings').click();
  const dialog = page.getByTestId('playout-settings');
  await expect(dialog.getByTestId('rundown-colors')).toBeVisible();
  await expect(dialog.getByTestId('output-profile')).toHaveCount(0);
  await expect(dialog.getByTestId('settings-production-output')).toHaveCount(0);
  await expect(dialog.getByTestId('caspar-host')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/studio-feedback-browser-settings.png' });
  await dialog.getByTestId('playout-settings-close').click();
  // The panel names the current output instead: the browser source, with CasparCG switched off.
  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('playout-panel-browser')).toContainText('Browser source');
  await expect(panel.getByTestId('caspar-switch')).not.toBeChecked();
  await expect(panel.getByTestId('caspar-bridge')).toHaveCount(0);
  await expect(panel.getByTestId('caspar-slot')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'test-results/studio-feedback-browser-settings-phone.png' });
});

test('Delete removes the selected range and leaves native fields and open menus alone', async ({ page }) => {
  await production(page);
  const rows = page.locator('.pd-cue');
  await page.locator('.pd-cue-label').nth(0).click(); await page.locator('.pd-cue-label').nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('range-count')).toHaveText('3 selected');
  await parkFocusOffControls(page); await page.keyboard.press('Delete');
  await expect(rows).toHaveCount(1);
  const field = page.getByTestId('cue-label');
  await expect(field).toBeVisible(); await field.focus(); await page.keyboard.press('Delete'); await expect(rows).toHaveCount(1);
  await page.getByTestId('production-setup').click();
  await page.keyboard.press('Delete'); await expect(rows).toHaveCount(1);
  await settleDurableWrites(page); await page.reload(); await expect(rows).toHaveCount(1);
});

test('color picker previews every event and persists one settled edit', async ({ page }) => {
  const id = await production(page);
  const input = page.locator('[aria-label="Cue highlight color"]');
  await expect(input).toBeVisible();
  const counts = await input.evaluate(async el => {
    const { durable } = await import('/src/model/durableStore.ts');
    const original = durable.setItem;
    let writes = 0;
    durable.setItem = function(key, value) { if (key === 'spx-gfx-shows') writes++; original.call(this, key, value); };
    try {
      for (const value of ['#112233', '#223344', '#334455', '#445566', '#556677']) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
        setter.call(el, value);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(requestAnimationFrame);
      }
      const preview = document.querySelector('.pd-cue')!.getAttribute('style');
      const beforeSettle = writes;
      (el as HTMLInputElement).blur();
      await new Promise(resolve => setTimeout(resolve, 600));
      return { beforeSettle, writes, preview };
    } finally { durable.setItem = original; }
  });
  expect(counts.beforeSettle).toBe(0);
  expect(counts.writes).toBe(1);
  expect(counts.preview).toContain('#556677');
  await settleDurableWrites(page);
  expect(await page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)!.cues![0].accentColor, id)).toBe('#556677');
  await page.reload();
  await expect(input).toHaveValue('#556677');
});

test('CasparCG setup can return to browser output without changing sources or links', async ({ page }) => {
  const id = await production(page, true);
  const before = await page.evaluate(async id => {
    const m = await import('/src/model/shows.ts');
    m.setShowOutputSlug(id, 'rehearsal-output');
    return m.loadShows().find(s => s.id === id)!;
  }, id);
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.locator('.pd-cue')).toHaveCount(4);
  // A production already set to a CasparCG destination starts with the switch on (AC-4), and the
  // browser source stays beside it.
  await page.getByTestId('production-status').click();
  const panel = page.getByTestId('production-status-panel');
  await expect(panel.getByTestId('caspar-switch')).toBeChecked();
  await expect(panel.getByTestId('output-url')).toContainText('rehearsal-output');
  await page.keyboard.press('Escape');
  await page.getByTestId('rundown-add').click();
  await expect(page.getByTestId('add-from-server')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.getByTestId('production-setup').click();
  await page.getByTestId('setup-playout-settings').click();
  await expect(page.getByTestId('playout-settings').getByTestId('caspar-host')).toBeVisible();
  await page.getByTestId('playout-settings-close').click();
  // The per-production switch replaces "Change output…" and its chooser (AC-4).
  await setCasparSwitch(page, false);
  await page.getByTestId('rundown-add').click();
  await expect(page.getByTestId('add-from-server')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await settleDurableWrites(page);
  const after = await page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)!, id);
  expect(after.cues).toEqual(before.cues);
  expect(after.graphics).toEqual(before.graphics);
  expect(after.outputSlug).toBe(before.outputSlug);
  expect(after.outputSetup).toEqual({ v: 1, destinations: [{ id: 'browser', profile: 'browser' }], caspar: false });
  // With CasparCG off the paired Bridge is neither shown nor judged, and the browser source stays.
  await expect(page.getByTestId('production-status')).toHaveAttribute('data-tone', 'idle');
  await expect(page.getByTestId('production-status')).not.toContainText('Bridge');
  await page.getByTestId('production-status').click();
  await expect(panel.getByTestId('caspar-bridge')).toHaveCount(0);
  await expect(panel.getByTestId('output-url')).toContainText('rehearsal-output');
});

test('additive selection, range selection and clipboard act on the intended rows', async ({ page }) => {
  await production(page);
  const labels = page.locator('.pd-cue-label');
  await labels.nth(0).click();
  await labels.nth(2).click({ modifiers: ['Control'] });
  await expect(page.getByTestId('range-count')).toHaveText('2 selected');
  await labels.nth(0).click();
  await labels.nth(2).click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('range-count')).toHaveText('3 selected');
  await parkFocusOffControls(page);
  await page.keyboard.press('Control+c');
  await page.keyboard.press('Control+v');
  await expect(page.locator('.pd-cue')).toHaveCount(7);
});
