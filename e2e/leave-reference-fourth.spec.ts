// covers: none - disposable fourth independent leave-editor check, reference executions; never land
//
// The two reference tasks closest to this check's new challenges: an edit accepted while a Save
// is still waiting (Studio v0.17 at 3142fc7d, whose Save awaits a compatibility check and the
// file writer), and a save write that storage refuses (Eyevinn 616841bd, which saves to
// localStorage synchronously). The file writer and the storage refusal are this file's own stubs.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';

test('Studio: an edit made while Save Project waits is not in the saved file, and New still asks', async ({ page }) => {
  test.setTimeout(180_000);
  const child = spawn(process.env.REFERENCE_EXE!, ['--port', '4398', '--workspace', process.cwd() + '/.noacg/leave-reference-4', '--no-open']);
  try {
    await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4398/health')).ok; } catch { return false; } }).toBe(true);
    // A file picker whose writer holds close() until the check releases it.
    await page.addInitScript(() => {
      const w = window as unknown as { held: { written: string[]; release?: () => void } };
      w.held = { written: [] };
      Object.defineProperty(window, 'showSaveFilePicker', { value: async () => ({
        createWritable: async () => ({
          write: async (text: string) => { w.held.written.push(String(text)); },
          close: () => new Promise<void>(resolve => { w.held.release = resolve; }),
        }),
      }) });
    });
    await page.goto('http://127.0.0.1:4398/');
    await page.getByRole('button', { name: 'Add Text', exact: true }).click();
    const content = page.locator('.inspector-row:has(> span:text-is("Content")) textarea');
    await content.fill('Requested before save');
    await page.getByRole('button', { name: 'Save Project', exact: true }).click();
    await expect.poll(() => page.evaluate(() => typeof (window as unknown as { held: { release?: unknown } }).held.release)).toBe('function');
    await content.fill('Newer during the save');
    await page.evaluate(() => (window as unknown as { held: { release: () => void } }).held.release());
    await expect(page.getByText('Project source saved', { exact: false })).toBeVisible();
    const written = await page.evaluate(() => (window as unknown as { held: { written: string[] } }).held.written.join(''));
    expect(written).toContain('Requested before save'); expect(written).not.toContain('Newer during the save');
    let asked = '';
    page.once('dialog', d => { asked = d.message(); void d.dismiss(); });
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect.poll(() => asked).not.toBe('');
    await expect(content).toHaveValue('Newer during the save');
    await page.screenshot({ path: test.info().outputPath('studio-held-save.png') });
    writeFileSync(test.info().outputPath('studio-held-save.json'), JSON.stringify({ pin: '3142fc7d', runtime: 'v0.17', savedFileHasRequested: true,
      savedFileLacksNewer: true, newAsked: asked, newerKeptAfterCancel: true, dirtyTracking: 'none: New always asks' }, null, 2));
  } finally { child.kill(); }
});

test('Eyevinn: a refused localStorage save is not shown to the user and the template is gone after reload', async ({ page }) => {
  test.setTimeout(120_000);
  const child = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4396', '--strictPort'], { cwd: process.cwd() + '/.noacg/reference-eyevinn' });
  try {
    await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4396/')).ok; } catch { return false; } }, { timeout: 20_000 }).toBe(true);
    await page.goto('http://127.0.0.1:4396/');
    const create = async (id: string) => {
      await page.getByRole('button', { name: 'New Template', exact: true }).click();
      await page.locator('#template-id').fill(id); await page.locator('#template-name').fill(id);
      await page.locator('#template-type').selectOption('custom'); await page.getByRole('button', { name: 'Create', exact: true }).click();
    };
    await create('kept');
    const items = page.locator('.template-item'); await expect(items).toHaveCount(1);
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.evaluate(() => {
      const w = window as unknown as { refusedEvents: number };
      w.refusedEvents = 0; window.addEventListener('ograf-storage-error', () => { w.refusedEvents++; });
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key: string, value: string) {
        if (key === 'ograf-templates') { Storage.prototype.setItem = set; throw new DOMException('Reference refusal', 'QuotaExceededError'); }
        return set.call(this, key, value);
      };
    });
    await create('refused');
    await expect(items).toHaveCount(2);
    const shown = await page.getByText(/Failed to save|not be persisted|storage/i).count();
    const toast = await page.getByText('Template "refused" created successfully').count();
    const events = await page.evaluate(() => (window as unknown as { refusedEvents: number }).refusedEvents);
    await page.screenshot({ path: test.info().outputPath('eyevinn-refused.png') });
    await page.reload(); await expect(items.first()).toBeVisible();
    const after = await items.evaluateAll(n => n.map(e => (e as HTMLElement).dataset.templateId));
    writeFileSync(test.info().outputPath('eyevinn-refused.json'), JSON.stringify({ pin: '616841bd949e3a21137579451123f66c292543f0', refusedEvents: events,
      visibleMessage: shown, successToast: toast, consoleErrors: errors.length, listedBeforeReload: 2, afterReload: after }, null, 2));
    expect(events).toBe(1); expect(errors.length, 'the refusal is logged').toBe(1);
    expect(shown, 'Eyevinn shows the refusal to the user').toBe(0);
    expect(toast, 'Eyevinn reported the refused create as successful').toBe(1);
    expect(after, 'the refused template survived a reload').toEqual(['kept']);
  } finally { child.kill(); }
});
