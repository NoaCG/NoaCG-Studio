// covers: none - disposable fifth independent leave-editor check, reference executions; never land
//
// The reference tasks closest to this check's new challenges, both of which split one save into
// two writes as NoaCG does. Studio v0.17 (3142fc7d): Save Project writes the file, and a 500 ms
// autosave of the same project follows; that autosave is refused once (this file's stub).
// Eyevinn (616841bd): saveToStorage writes the templates record, then the current-template
// pointer; the pointer write is refused once, the page reloaded, and the same template made again.
import { test, expect } from '@playwright/test';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

test('Studio: the autosave after Save Project is refused once; nothing is said; the saved file holds the edit', async ({ page }) => {
  test.setTimeout(180_000);
  const child = spawn(process.env.REFERENCE_EXE!, ['--port', '4395', '--workspace', process.cwd() + '/.noacg/leave-reference-5', '--no-open']);
  try {
    await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4395/health')).ok; } catch { return false; } }).toBe(true);
    await page.addInitScript(() => {
      Object.defineProperty(window, 'showSaveFilePicker', { value: undefined });
      Object.defineProperty(window, 'showOpenFilePicker', { value: undefined });
    });
    await page.goto('http://127.0.0.1:4395/');
    await page.getByRole('button', { name: 'Add Text', exact: true }).click();
    const content = page.locator('.inspector-row:has(> span:text-is("Content")) textarea');
    await content.fill('Before the save');
    await page.waitForTimeout(1200);
    const errors: string[] = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.evaluate(() => {
      const w = window as unknown as { refused: number }; w.refused = 0;
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key: string, value: string) {
        if (key === 'ograf-editor:autosave-project' && !w.refused) { w.refused++; throw new DOMException('Reference refusal', 'QuotaExceededError'); }
        return set.call(this, key, value);
      };
    });
    // The edit and Save Project at once: the edit's autosave is still on its timer when the save answers.
    await content.fill('Saved, then its autosave refused');
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save Project', exact: true }).click();
    const saved = readFileSync((await (await pending).path())!, 'utf8');
    await expect.poll(() => page.evaluate(() => (window as unknown as { refused: number }).refused)).toBe(1);
    await page.waitForTimeout(500);
    const shown = await page.getByText(/could not|failed|storage|quota/i).count();
    await page.screenshot({ path: test.info().outputPath('studio-autosave-refused.png') });
    let asked = '';
    page.once('dialog', d => { asked = d.message(); void d.dismiss(); });
    await page.getByRole('button', { name: 'New', exact: true }).click();
    await expect.poll(() => asked).not.toBe('');
    await page.reload(); await expect(page.getByRole('button', { name: 'Save Project', exact: true })).toBeVisible();
    const restored = await page.evaluate(() => localStorage.getItem('ograf-editor:autosave-project') ?? '');
    const facts = { pin: '3142fc7d', runtime: 'v0.17', savedFileHasEdit: saved.includes('Saved, then its autosave refused'), visibleMessage: shown, consoleErrors: errors.length,
      newAsked: asked, autosaveAfterReloadHasEdit: restored.includes('Saved, then its autosave refused') };
    writeFileSync(test.info().outputPath('studio-autosave-refused.json'), JSON.stringify(facts, null, 2));
    expect(facts.savedFileHasEdit).toBe(true);
    expect(shown, 'Studio says nothing about its refused autosave').toBe(0);
  } finally { child.kill(); }
});

test('Eyevinn: the current-template write refused once; reload; the template exists once and cannot be made twice', async ({ page }) => {
  test.setTimeout(120_000);
  const child = spawn('node', ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '4394', '--strictPort'], { cwd: process.cwd() + '/.noacg/reference-eyevinn' });
  try {
    await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4394/')).ok; } catch { return false; } }, { timeout: 20_000 }).toBe(true);
    await page.goto('http://127.0.0.1:4394/');
    const create = async (id: string) => {
      await page.getByRole('button', { name: 'New Template', exact: true }).click();
      await page.locator('#template-id').fill(id); await page.locator('#template-name').fill(id);
      await page.locator('#template-type').selectOption('custom'); await page.getByRole('button', { name: 'Create', exact: true }).click();
    };
    await create('kept');
    const items = page.locator('.template-item'); await expect(items).toHaveCount(1);
    await page.evaluate(() => {
      const w = window as unknown as { refusedEvents: number; order: string[] };
      w.refusedEvents = 0; w.order = [];
      window.addEventListener('ograf-storage-error', () => { w.refusedEvents++; });
      const set = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key: string, value: string) {
        w.order.push(key);
        if (key === 'ograf-current-template') { Storage.prototype.setItem = set; throw new DOMException('Reference refusal', 'QuotaExceededError'); }
        return set.call(this, key, value);
      };
    });
    await create('linkcheck');
    await expect(items).toHaveCount(2);
    const before = await page.evaluate(() => ({ order: (window as unknown as { order: string[] }).order, events: (window as unknown as { refusedEvents: number }).refusedEvents,
      stored: Object.keys(JSON.parse(localStorage.getItem('ograf-templates') ?? '{}')), current: localStorage.getItem('ograf-current-template') }));
    await page.reload(); await expect(items.first()).toBeVisible();
    const listed = await items.evaluateAll(n => n.map(e => (e as HTMLElement).dataset.templateId));
    const active = await page.locator('.template-item.active').getAttribute('data-template-id').catch(() => null);
    let alerted = '';
    page.once('dialog', d => { alerted = d.message(); void d.accept(); });
    await create('linkcheck');
    await expect.poll(() => alerted).not.toBe('');
    await page.screenshot({ path: test.info().outputPath('eyevinn-pointer-refused.png') });
    const after = await items.evaluateAll(n => n.map(e => (e as HTMLElement).dataset.templateId));
    const facts = { pin: '616841bd949e3a21137579451123f66c292543f0', writeOrder: before.order, refusedEvents: before.events, storedRecords: before.stored,
      storedPointer: before.current, listedAfterReload: listed, activeAfterReload: active, secondCreate: alerted, listedAfterSecondCreate: after };
    writeFileSync(test.info().outputPath('eyevinn-pointer-refused.json'), JSON.stringify(facts, null, 2));
    expect(before.order).toEqual(['ograf-templates', 'ograf-current-template']);
    expect(before.stored).toEqual(['kept', 'linkcheck']);
    expect(listed).toEqual(['kept', 'linkcheck']);
    expect(alerted).toContain('already exists');
    expect(after, 'Eyevinn made the same template twice').toEqual(['kept', 'linkcheck']);
  } finally { child.kill(); }
});
