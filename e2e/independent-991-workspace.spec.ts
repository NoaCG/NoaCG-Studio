// covers: none - disposable independent reference check; never land
import { test, expect, chromium, type Page } from '@playwright/test';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

test('reference native short-height workspace and timeline resize', async () => {
  test.setTimeout(180000);
  const child = spawn(process.env.REFERENCE_EXE!, ['--port', '4397', '--workspace', process.cwd() + '/.noacg/canvas-991-reference', '--no-open']);
  let log = ''; child.stdout.on('data', d => log += d); child.stderr.on('data', d => log += d);
  const extension = resolve(test.info().outputPath('zoom-extension')); mkdirSync(extension, { recursive: true });
  writeFileSync(extension + '/manifest.json', JSON.stringify({ manifest_version: 3, name: 'Reference zoom measurement', version: '1.0', permissions: ['tabs'], background: { service_worker: 'worker.js' } }));
  writeFileSync(extension + '/worker.js', 'chrome.runtime.onInstalled.addListener(() => {});');
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | undefined;
  try {
    await expect.poll(async () => { try { return (await fetch('http://127.0.0.1:4397/health')).ok; } catch { return false; } }).toBe(true);
    context = await chromium.launchPersistentContext(test.info().outputPath('profile'), { headless: false, channel: 'chromium', viewport: null, deviceScaleFactor: undefined, args: ['--window-size=1366,768', '--disable-extensions-except=' + extension, '--load-extension=' + extension] });
    const page = context.pages()[0], errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await page.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined }); });
    await page.goto('http://127.0.0.1:4397/');
    const worker = context.serviceWorkers()[0] ?? await context.waitForEvent('serviceworker');
    const zoom = await worker.evaluate(async () => { const tabs = await chrome.tabs.query({ url: 'http://127.0.0.1:4397/*' }); const id = tabs[0].id!; await chrome.tabs.setZoom(id, 1.25); return chrome.tabs.getZoom(id); });
    expect(zoom).toBe(1.25);
    await page.getByRole('button', { name: 'Add Text', exact: true }).click();
    const x = page.locator('.inspector-row:has(> span:text-is("X")) input');
    await x.fill('175'); await x.press('Enter'); await expect(x).toHaveValue('175');
    const save = async (p: Page) => { const pending = p.waitForEvent('download'); await p.getByRole('button', { name: 'Save Project', exact: true }).click(); const d = await pending; expect(await d.failure()).toBeNull(); return JSON.parse(readFileSync((await d.path())!).toString()); };
    const content=page.locator('.inspector-row:has(> span:text-is("Content")) textarea');
    await content.fill('Mira Chen');
    const beforeSource = await save(page);
    const measure = () => page.evaluate(() => ({ innerWidth, innerHeight, outerWidth, outerHeight, devicePixelRatio, visualScale: visualViewport?.scale, html: { client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }, controls: Object.fromEntries(['.dock-workspace', '.canvas-stage-viewport', '.dock-region-bottom', '.dock-region-right'].map(s => { const r = document.querySelector(s)!.getBoundingClientRect(); return [s, { x: r.x, y: r.y, width: r.width, height: r.height }]; })) }));
    const before = await measure();
    const capture = async (name: string) => { const cdp = await context!.newCDPSession(page); const shot = await cdp.send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false }); writeFileSync(test.info().outputPath(name), Buffer.from(shot.data, 'base64')); await cdp.detach(); };
    await capture('reference-native-before.png');
    const divider = page.locator('.dock-workspace > .resize-handle-row').last(), box = (await divider.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + 40, { steps: 8 }); await page.mouse.up();
    await expect.poll(async () => (await measure()).controls['.dock-region-bottom'].height).toBeCloseTo(180, 0);
    const after = await measure(), afterSource = await save(page);
    expect(afterSource.compositions).toEqual(beforeSource.compositions);
    expect(after.controls['.canvas-stage-viewport'].height).toBeGreaterThan(before.controls['.canvas-stage-viewport'].height);
    await expect(x).toHaveValue('175');
    const finalZoom = await worker.evaluate(async () => chrome.tabs.getZoom((await chrome.tabs.query({ url: 'http://127.0.0.1:4397/*' }))[0].id!));
    expect(finalZoom).toBe(1.25); expect(errors).toEqual([]);
    await capture('reference-native-after.png');
    writeFileSync(test.info().outputPath('reference-workspace.json'), JSON.stringify({ zoom, finalZoom, before, after, sourceCompositionsUnchanged: true, errors }, null, 2));
  } finally { await context?.close(); child.kill(); writeFileSync(test.info().outputPath('reference-server.log'), log); }
});
