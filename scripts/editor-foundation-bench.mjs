// Browser workload: the *-bench name places this in the shared machine queue.
// Run --verify for mapped source tests/evidence, then --measure after npm run build.
// The latter serves THIS checkout's production bundle and never imports Vite source modules.
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpus, totalmem, freemem, platform, release } from 'node:os';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { devPort } from './dev-port.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const baseEdits = process.argv.includes('--base-edits');
const captureFinish = process.argv.includes('--capture-finish');
const fixtures = resolve(root, 'docs/research/editor-r1-foundation');
const output = baseEdits ? resolve(root, 'docs/research/editor-r1-1a') : fixtures;
mkdirSync(output, { recursive: true });
async function settleFrame(frame) {
  const style = await frame.addStyleTag({ content: '*{will-change:auto !important}' });
  await frame.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await style.evaluate(element => element.remove());
  await frame.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
if (process.argv.includes('--verify')) {
  const specs = baseEdits ? ['e2e/editor-foundation.spec.ts', 'e2e/editor-alpha-entry.spec.ts', 'e2e/editor-base-edits.spec.ts'] : ['e2e/editor-foundation.spec.ts'];
  const child = spawn(process.execPath, ['node_modules/@playwright/test/cli.js', 'test', ...specs, '--workers=1'],
    { cwd: root, windowsHide: true, stdio: 'inherit', env: baseEdits ? process.env : { ...process.env, NOACG_FOUNDATION_EVIDENCE: output } });
  process.exitCode = await new Promise(resolve => child.on('exit', code => resolve(code ?? 1)));
} else if (process.argv.includes('--measure') || captureFinish) {
  const port = devPort();
  const base = 'http://localhost:' + port;
  // dev-worktree refuses a busy port, so this cannot accidentally measure another checkout.
  const server = spawn(process.execPath, ['scripts/dev-worktree.mjs', '--preview'],
    { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  server.stdout.on('data', chunk => { log += chunk; });
  server.stderr.on('data', chunk => { log += chunk; });
  let browser;
  const results = [];
  try {
    let up = false;
    for (let i = 0; i < 120; i++) {
      if (server.exitCode !== null) throw new Error('Preview server refused: ' + log);
      try { const response = await fetch(base + '/app'); up = response.ok; } catch { /* starting */ }
      if (up && log.includes('Local:') && server.exitCode === null) break;
      up = false;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!up) throw new Error('Preview server did not start: ' + log);
    const buildStamp = JSON.parse(readFileSync(resolve(root, 'dist/version.json'), 'utf8'));
    expect(await (await fetch(base + '/version.json')).json()).toEqual(buildStamp);
    browser = await chromium.launch({ headless: true });
    for (const name of captureFinish ? [] : ['catalog', 'svg', 'f4']) {
      const serialized = readFileSync(resolve(fixtures, 'fixture-' + name + '.json'), 'utf8').replace(/^\uFEFF/, '');
      const template = JSON.parse(serialized);
      for (const viewport of [{ width: 1920, height: 1080, scale: 1 }, { width: 1366, height: 768, scale: 1 }, { width: 1093, height: 614, scale: 1.25 }]) {
        const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.scale });
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(String(error)));
        await page.addInitScript(template => {
          if (window !== window.top) return;
          localStorage.setItem('spx-gfx-project', JSON.stringify({ id: 'r1-fixture', name: template.name,
            template, baseline: template, graphicId: null, dirty: false, updatedAt: '2026-09-19T00:00:00Z' }));
        }, template);
        await page.goto(base + '/app?editor=foundation#/editor-foundation');
        await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30000 });
        await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false', { timeout: 15000 });
        await expect(page.locator('.ef-stage-error')).toHaveCount(0);
        const ruler = page.getByRole('slider', { name: 'Playhead' });
        const box = await ruler.boundingBox();
        const duration = Number(await ruler.getAttribute('aria-valuemax'));
        const range = duration / Math.max(2, duration * 1.15);
        await ruler.focus(); await page.keyboard.press('Home');
        // Warm fonts/runtime/selection before collecting the sustained interaction sample.
        await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
        await page.mouse.click(box.x + box.width * range * .3, box.y + 20);
        await page.waitForTimeout(200);
        await page.evaluate(() => window.dispatchEvent(new Event('noacg-editor-reset-metrics')));
        await page.waitForTimeout(100);
        const readMetrics = () => page.evaluate(() => new Promise(resolve => {
          window.addEventListener('noacg-editor-metrics', event => resolve(event.detail), { once: true });
          window.dispatchEvent(new Event('noacg-editor-read-metrics'));
        }));
        for (let i = 0; i < 60; i++) {
          const before = await readMetrics();
          const selections = before.samples.filter(s => s.kind === 'selection').length;
          const scrubs = before.samples.filter(s => s.kind === 'scrub').length;
          await page.locator('.ef-track[data-selector="#f' + (i % 2) + '"] .ef-layer').click();
          await expect.poll(async () => (await readMetrics()).samples.filter(s => s.kind === 'selection').length).toBeGreaterThan(selections);
          await page.mouse.click(box.x + box.width * range * (.1 + (i % 9) * .08), box.y + 20);
          await expect.poll(async () => (await readMetrics()).samples.filter(s => s.kind === 'scrub').length).toBeGreaterThan(scrubs);
        }
        // R1.1a drives actual canvas pointer input through source adapters and transient CSS.
        // R1.0 retains its original ruler workload and evidence directory.
        let dragBox;
        if (baseEdits) {
          await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
          const outPercent = await page.locator('.ef-out').evaluate(el => parseFloat(el.style.left));
          await page.mouse.click(box.x + box.width * outPercent / 100 - .01, box.y + 20);
          await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
          await expect(page.locator('.ef-selection rect')).toHaveCount(1);
          dragBox = await page.locator('.ef-selection rect').boundingBox();
        }
        const start = dragBox ? { x: dragBox.x + dragBox.width / 2, y: dragBox.y + dragBox.height / 2 } : { x: box.x + 5, y: box.y + 20 };
        await page.mouse.move(start.x, start.y); await page.mouse.down();
        const dragStartedAt = await page.evaluate(() => performance.timeOrigin + performance.now());
        for (let i = 0; i < 90; i++) {
          if (baseEdits) await page.mouse.move(start.x + 15 + i * .5, start.y + Math.sin(i / 10) * 5);
          else await page.mouse.move(box.x + box.width * range * (.1 + (i % 70) / 100), box.y + 20);
          // Native mouse moves are frame-coalesced by Chromium. Adding a 16ms wait here
          // halves the input rate to 30Hz and measures the driver rather than the editor.
          if (!baseEdits) await page.waitForTimeout(16);
        }
        const pointerUpAt = await page.evaluate(() => performance.timeOrigin + performance.now());
        await page.mouse.up();
        await page.waitForTimeout(100);
        const metrics = await page.evaluate(() => new Promise(resolve => {
          window.addEventListener('noacg-editor-metrics', event => resolve(event.detail), { once: true });
          window.dispatchEvent(new Event('noacg-editor-read-metrics'));
        }));
        let editedCssSha256 = null;
        if (baseEdits) {
          const savedCss = () => page.evaluate(() => new Promise((resolve, reject) => {
            const open = indexedDB.open('noacg-studio');
            open.onerror = () => reject(open.error);
            open.onsuccess = () => {
              const db = open.result, request = db.transaction('kv').objectStore('kv').get('spx-gfx-project');
              request.onsuccess = () => { db.close(); resolve(JSON.parse(request.result).template.css); };
              request.onerror = () => { db.close(); reject(request.error); };
            };
          }));
          await expect.poll(savedCss).not.toBe(template.css);
          editedCssSha256 = createHash('sha256').update(await savedCss()).digest('hex');
          // Ninety transient updates must still undo as one source transaction. Park the
          // original composition for screenshots: its authored clip masks remain effective.
          await page.getByRole('button', { name: 'Undo', exact: true }).click();
          await expect.poll(savedCss).toBe(template.css);
          await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
        }
        const summary = values => {
          const sorted = [...values].sort((a, b) => a - b);
          return { count: sorted.length, p50: sorted[Math.floor(sorted.length * .5)] ?? null,
            p95: sorted[Math.floor(sorted.length * .95)] ?? null, max: sorted.at(-1) ?? null };
        };
        const rects = await page.evaluate(() => ['.ef-viewport', '.ef-inspector', '.ef-timeline'].map(selector => {
          const r = document.querySelector(selector).getBoundingClientRect();
          return { selector, x: r.x, y: r.y, width: r.width, height: r.height };
        }));
        expect(rects.every(r => r.width > 0 && r.height > 0)).toBe(true);
        expect(rects[2].height).toBeGreaterThanOrEqual(240);
        expect(errors).toEqual([]);
        const iframe = await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle()).contentFrame();
        const finalPose = await iframe.evaluate(() => ({
          x: window.gsap ? Number(window.gsap.getProperty(document.querySelector('#f0'), 'x')) : null,
          speed: window.NOACG_ANIM ? window.NOACG_ANIM.speed : null,
        }));
        // Only after measuring, park the visible ruler at its held Out boundary for review.
        const outPercent = await page.locator('.ef-out').evaluate(el => parseFloat(el.style.left));
        await page.mouse.click(box.x + box.width * outPercent / 100 - .01, box.y + 20);
        await page.waitForTimeout(100);
        await settleFrame(iframe);
        await page.screenshot({ path: resolve(output, name + '-built-' + viewport.width + '.png') });
        const result = { name, viewport, sourceSha256: createHash('sha256').update(serialized).digest('hex'), editedCssSha256,
          pointerUpMs: Math.max(0, (metrics.samples.at(-1)?.presentedAt ?? pointerUpAt) - pointerUpAt), finalPose,
          selection: summary(metrics.samples.filter(s => s.kind === 'selection').map(s => s.ms)),
          scrub: summary(metrics.samples.filter(s => s.kind === 'scrub').map(s => s.ms)),
          frames: summary(metrics.frameIntervals), parentFrames: summary(metrics.parentFrameIntervals),
          longTasks: metrics.longTasks, parentLongTasks: metrics.parentLongTasks, rects, errors, metrics };
        results.push(result);
        if (baseEdits) {
          const drag = metrics.samples.filter(s => s.kind === 'drag' && s.presentedAt >= dragStartedAt && s.presentedAt <= pointerUpAt);
          const commit = metrics.samples.find(s => s.kind === 'commit' && s.presentedAt >= pointerUpAt);
          result.drag = summary(drag.map(s => s.ms));
          result.feedbackHz = drag.length / ((pointerUpAt - dragStartedAt) / 1000);
          result.feedbackGaps = summary(drag.slice(1).map((s, i) => s.presentedAt - drag[i].presentedAt));
          result.pointerUpMs = commit ? commit.presentedAt - pointerUpAt : null;
          console.log(JSON.stringify({ name, viewport, drag: result.drag, feedbackHz: result.feedbackHz, pointerUpMs: result.pointerUpMs }));
          expect(result.drag.count).toBeGreaterThan(45);
          expect(result.feedbackHz).toBeGreaterThanOrEqual(30);
          expect(result.feedbackGaps.max).toBeLessThanOrEqual(100);
          expect(result.pointerUpMs).not.toBeNull();
        }
        expect(result.selection.count).toBeGreaterThanOrEqual(60);
        expect(result.selection.max).toBeLessThanOrEqual(100);
        expect(result.pointerUpMs).toBeLessThanOrEqual(150);
        expect(result.frames.p95).toBeLessThanOrEqual(1000 / 30);
        expect(Math.max(result.frames.max, result.parentFrames.max, ...result.longTasks, ...result.parentLongTasks)).toBeLessThanOrEqual(100);
        console.log(JSON.stringify({ name, viewport, selection: result.selection, scrub: result.scrub, frames: result.frames, longTasks: result.longTasks }));
        if (baseEdits && name === 'catalog') {
          const artboard = await page.locator('.ef-artboard').boundingBox();
          for (const [i, tool] of ['rectangle', 'ellipse', 'text'].entries()) {
            await page.getByRole('button', { name: tool + ' tool', exact: true }).click();
            const x = artboard.x + artboard.width * (.35 + i * .16), y = artboard.y + artboard.height * .35;
            await page.mouse.move(x, y); await page.mouse.down();
            await page.mouse.move(x + 45, y + 24, { steps: 5 }); await page.mouse.up();
            await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
          }
          const settledFrame = await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle()).contentFrame();
          await settleFrame(settledFrame);
          await page.screenshot({ path: resolve(output, 'tools-built-' + viewport.width + '.png') });
          if (viewport.width === 1366) {
            await page.setViewportSize({ width: 390, height: 844 });
            await expect(page.locator('.ef-viewport')).toBeVisible();
            await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
            await settleFrame(settledFrame);
            await page.screenshot({ path: resolve(output, 'phone-built.png'), fullPage: true });
          }
        }
        await context.close();
      }
    }
    if (baseEdits) {
      const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
      const page = await context.newPage();
      await page.goto(base + '/app#/new');
      await page.locator('[data-entry="template"]').click();
      await page.locator('.wz-browse-search').fill('Hairline');
      await page.locator('.wz-variant', { hasText: 'Hairline' }).first().click();
      await page.getByTestId('wz-skip-to-finish').click();
      await expect(page.getByTestId('wz-finish-edit-artwork')).toBeVisible();
      await page.getByTestId('wz-finish-edit-artwork').scrollIntoViewIfNeeded();
      const finishFrame = await (await page.locator('iframe[title="Wizard live preview"]').elementHandle()).contentFrame();
      await expect(finishFrame.locator('#f0')).toBeAttached();
      await page.getByRole('button', { name: '▶ Replay', exact: true }).click();
      await expect.poll(() => finishFrame.locator('.lower-third').evaluate(el => Number(getComputedStyle(el).opacity))).toBe(1);
      await expect.poll(() => finishFrame.locator('#f0').evaluate(el => Number(window.gsap.getProperty(el, 'yPercent')))).toBe(0);
      await settleFrame(finishFrame);
      await page.screenshot({ path: resolve(output, 'wizard-finish-built.png'), fullPage: true });
      await context.close();
    }
    const sourceFiles = ['src/App.tsx', 'src/blocks/baseEdits.ts', 'src/blocks/designLayout.ts',
      'src/components/wizard/CreationWizard.tsx', 'src/components/wizard/steps/FinishStep.tsx',
      ...readdirSync(resolve(root, 'src/components/editorFoundation')).filter(name => /\.(tsx?|css)$/.test(name)).map(name => 'src/components/editorFoundation/' + name)];
    if (!captureFinish) writeFileSync(resolve(output, 'latency-built.json'), JSON.stringify({
      recordedAt: new Date().toISOString(), build: buildStamp, environment: { platform: platform(), release: release(), cpu: cpus()[0].model,
        totalMemory: totalmem(), freeMemory: freemem(), browser: browser.version(), node: process.version },
      sourceSha256: Object.fromEntries(sourceFiles.map(file => [file, createHash('sha256').update(readFileSync(resolve(root, file))).digest('hex')])),
      method: baseEdits ? 'Actual canvas pointer drag, transient CSS and atomic commit on the built app. Input-handler epoch to revision/request-matching acknowledgement; transient geometry measured at next rAF, committed geometry after two rAFs. Feedback Hz counts matching drag acknowledgements over the input interval. Includes postMessage, not physical photon timing. 125% uses equivalent CSS viewport and device scale.' : 'Input handler epoch to matching pose acknowledgement after two rAFs; includes postMessage. 125% uses equivalent CSS viewport and device scale. Not physical display photon timing.',
      results
    }, null, 2));
  } finally {
    await browser?.close();
    if (server.exitCode === null) {
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
      else server.kill('SIGTERM');
    }
  }
} else {
  console.error('Use --verify or --measure (after a successful build).');
  process.exitCode = 1;
}
