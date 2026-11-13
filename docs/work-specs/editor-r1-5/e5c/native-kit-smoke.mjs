import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { chromium, expect } from '@playwright/test';
import { devPort } from '../../../../scripts/dev-port.mjs';
import { isPortBusy } from '../../../../scripts/port-probe.mjs';
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
export async function smokeNativeKit({ root, out, source, env, remaining, children, stop }) {
  const launcher = 'docs/work-specs/editor-r1-5/e5c/native-local-launch.mjs';
  const relative = 'docs/work-specs/editor-r1-5/e5c/', fixturePath = 'docs/research/editor-design-review-2026-09-17/f4-noacg.json';
  const port = devPort(), base = `http://localhost:${port}`, answer = { source, assertions: [], cleanup: false }, pageErrors = [], externalRequests = [];
  let server, browserServer, browser, production = false;
  const productionSourceRequests = [];
  const assertion = name => answer.assertions.push(name);
  const refused = (args, pattern) => {
    const result = spawnSync(process.execPath, [launcher, ...args], { cwd: root, env, encoding: 'utf8', timeout: Math.min(10_000, remaining()) });
    assert.notEqual(result.status, 0); assert.match(String(result.stderr), pattern);
  };
  async function closeServer() {
    if (!server) return;
    stop(server); children.delete(server); server = null;
    await expect.poll(() => isPortBusy(port, 100), { timeout: 5000 }).toBe(false);
  }
  async function startServer(preview = false) {
    assert.equal(await isPortBusy(port, 100), false);
    const fake = { ...env, VITE_SUPABASE_URL: 'https://fake.invalid', VITE_SUPABASE_ANON_KEY: 'fake-sentinel', SUPABASE_URL: 'https://fake.invalid', SUPABASE_SERVICE_ROLE_KEY: 'fake-sentinel', VITE_AI_PROVIDER: 'openai', VITE_AI_MODEL: 'fake-sentinel', VITE_AI_PROXY_URL: 'https://fake.invalid', VITE_AI_FALLBACKS: '[{"provider":"openai","model":"fake"}]', OPENAI_API_KEY: 'fake-sentinel', ANTHROPIC_API_KEY: 'fake-sentinel', AI_GATEWAY_API_KEY: 'fake-sentinel', HF_TOKEN: 'fake-sentinel' };
    server = spawn(process.execPath, [launcher, source, preview ? '--preview' : '--prepare'], { cwd: root, env: fake, detached: true, stdio: 'inherit' }); children.add(server);
    await expect.poll(async () => { if (server.exitCode !== null) throw new Error('Owned setup server exited.'); try { return (await fetch(base + '/app')).status; } catch { return 0; } }, { timeout: Math.min(30_000, remaining()) }).toBe(200);
  }
  try {
    refused(['0'.repeat(40)], /Candidate HEAD mismatch/); assertion('wrong candidate refuses before server launch');
    await startServer();
    browserServer = await chromium.launchServer({ headless: true, host: '127.0.0.1' }); children.add(browserServer.process());
    browser = await chromium.connect(browserServer.wsEndpoint());
    let context = await browser.newContext({ viewport: { width: 1366, height: 768 } }), page = await context.newPage();
    const watch = p => { p.on('pageerror', e => pageErrors.push(e.message)); p.on('request', req => { if (production && new URL(req.url()).pathname.startsWith('/src/')) productionSourceRequests.push(req.url()); if (!new URL(req.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/) && /^https?:/.test(req.url())) externalRequests.push(req.url()); }); };
    watch(page);
    await page.route('**/*', route => { const u = new URL(route.request().url()); if (/^https?:/.test(u.protocol) && !/^(127\.0\.0\.1|localhost)$/.test(u.hostname)) return route.abort(); return route.continue(); });
    await page.goto(base + '/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
    const pins = await page.evaluate(async () => ({ backend: (await import('/src/backend/config.ts')).isBackendConfigured(), ai: await (await fetch('/api/ai/config')).json() }));
    assert.equal(pins.backend, false); assert(pins.ai.providers.every(p => !p.available && !p.managedKey && !p.userKey)); assertion('inherited fake hosted/model configuration remains disabled');
    const fixture = await page.evaluate(async relative => (await import('/' + relative + 'native-observer.mjs')).loadF4(), relative);
    assert.equal(fixture.layers, 30); assert.equal(fixture.keys, 300); assert.deepEqual(fixture.properties, ['opacity', 'x']);
    await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
    const frame = await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle()).contentFrame();
    await expect(frame.locator('.stress-layer')).toHaveCount(30); assertion('approved original F4 hash loads 30 rendered layers and 300 X/opacity keys');
    await page.evaluate(async () => { const S = (await import('/src/store/templateStore.ts')).useTemplateStore; const s = S.getState(); s.setCss(s.template.css + '\n/* retained smoke draft */'); S.getState().setSampleValue('e5-smoke', 'preserve'); S.getState().setSelectedParts(['#stress-1']); });
    const snapshot = () => page.evaluate(async () => { const s = (await import('/src/store/templateStore.ts')).useTemplateStore.getState(); return JSON.stringify({ template: s.template, history: s.history, future: s.future, sampleData: s.sampleData, selectedParts: s.selectedParts }); });
    const before = await snapshot();
    await page.route('**/' + fixturePath, route => route.fulfill({ contentType: 'application/json', body: '{}' }));
    assert.match(await page.evaluate(async relative => { try { await (await import('/' + relative + 'native-observer.mjs')).loadF4(); return ''; } catch (e) { return e.message; } }, relative), /hash mismatch/);
    assert.equal(await snapshot(), before); await page.unroute('**/' + fixturePath); assertion('wrong fixture hash preserves nonempty source/history/sample/selection');
    const bad = await page.evaluate(async fixturePath => { const fixture = await (await fetch('/' + fixturePath)).json(); const data = (await import('/src/blocks/editorAnimation.ts')).animationSource(fixture); Object.values(data.steps[0].layers)[0].x.pop(); fixture.js = (await import('/src/blocks/animData.ts')).spliceAnimData(fixture.js, data); return JSON.stringify(fixture); }, fixturePath);
    const manifest = JSON.parse(readFileSync(join(root, relative, 'artifact-manifest.json'), 'utf8')); manifest.fixtures.find(f => f.path === fixturePath).sha256 = sha(bad);
    await page.route('**/' + fixturePath, route => route.fulfill({ contentType: 'application/json', body: bad }));
    await page.route('**/' + relative + 'artifact-manifest.json', route => route.fulfill({ json: manifest }));
    assert.match(await page.evaluate(async relative => { try { await (await import('/' + relative + 'native-observer.mjs')).loadF4(); return ''; } catch (e) { return e.message; } }, relative), /30 layers and 300 X\/opacity keys/);
    assert.equal(await snapshot(), before); await page.unroute('**/' + fixturePath); await page.unroute('**/' + relative + 'artifact-manifest.json'); assertion('wrong count with matching manifest hash refuses before any draft mutation');
    const package64 = await page.evaluate(async relative => { await (await import('/' + relative + 'native-observer.mjs')).loadF4(); const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template; return (await (await import('/src/export/noacgPackage.ts')).buildGraphicPackage(t)).generateAsync({ type: 'base64' }); }, relative);
    const fixtureZip = Buffer.from(package64, 'base64'), qualification = join(root, 'dist/e5-qualification'); mkdirSync(qualification, { recursive: true });
    writeFileSync(join(out, 'f4-editable.zip'), fixtureZip); writeFileSync(join(qualification, 'f4-editable.zip'), fixtureZip); writeFileSync(join(qualification, 'native-observer.mjs'), readFileSync(join(root, relative, 'native-observer.mjs')));
    const files = {}, dist = join(root, 'dist');
    const walk = (dir, prefix = '') => { for (const name of readdirSync(dir)) { const path = join(dir, name), relative = prefix + name; if (readdirSync(dir, { withFileTypes: true }).find(e => e.name === name).isDirectory()) walk(path, relative + '/'); else files[relative] = sha(readFileSync(path)); } }; walk(dist);
    const bundle = { source, offline: true, files }; writeFileSync(join(qualification, 'bundle.json'), JSON.stringify(bundle, null, 2) + '\n');
    await context.close(); await closeServer();
    const versionPath = join(dist, 'version.json'), version = readFileSync(versionPath);
    try { unlinkSync(versionPath); refused([source, '--preview'], /ENOENT/); } finally { writeFileSync(versionPath, version); }
    assertion('missing production marker refuses before preview');
    const bundlePath = join(qualification, 'bundle.json'), bundleBytes = readFileSync(bundlePath);
    try { unlinkSync(bundlePath); refused([source, '--preview'], /ENOENT/); } finally { writeFileSync(bundlePath, bundleBytes); }
    assertion('missing bundle receipt refuses before preview');
    try { writeFileSync(versionPath, JSON.stringify({ commit: '0'.repeat(40) })); refused([source, '--preview'], /bundle identity mismatch/); } finally { writeFileSync(versionPath, version); }
    assertion('stale production marker refuses before preview');
    const observerPath = join(qualification, 'native-observer.mjs'), observer = readFileSync(observerPath);
    try { writeFileSync(observerPath, Buffer.concat([observer, Buffer.from('\n// altered')])); refused([source, '--preview'], /file hash mismatch/); } finally { writeFileSync(observerPath, observer); }
    assertion('altered bundle file refuses before preview');
    const extra = join(qualification, 'unexpected.tmp'); try { writeFileSync(extra, 'extra'); refused([source, '--preview'], /inventory mismatch/); } finally { unlinkSync(extra); }
    assertion('extra bundle file refuses before preview');
    production = true; await startServer(true);
    context = await browser.newContext({ viewport: { width: 1366, height: 768 } }); page = await context.newPage(); watch(page);
    await page.route('**/*', route => { const u = new URL(route.request().url()); if (/^https?:/.test(u.protocol) && !/^(127\.0\.0\.1|localhost)$/.test(u.hostname)) return route.abort(); return route.continue(); });
    await page.goto(base + '/app?editor=foundation#/new'); await page.locator('[data-entry="import-graphic"]').click(); await page.locator('.wz-drop input[type="file"]').setInputFiles(join(out, 'f4-editable.zip'));
    const card = page.getByTestId('import-template-card');
    await expect(card.locator('strong')).toHaveText('f4 editable'); await expect(card).toContainText('1920 × 1080 · 25 fps'); await page.locator('.wz-next').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
    const builtFrame = await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle()).contentFrame(); await expect(builtFrame.locator('.stress-layer')).toHaveCount(30);
    const keyCount = await page.locator('.ef-timeline-key').evaluateAll(nodes => new Set(nodes.flatMap(n => n.getAttribute('data-keys').split('|'))).size); assert.equal(keyCount, 300);
    const poses = await builtFrame.locator('.stress-layer').evaluateAll(nodes => nodes.map(n => { const r = n.getBoundingClientRect(); return { width: r.width, height: r.height, opacity: Number(getComputedStyle(n).opacity) }; })); assert(poses.every(p => p.width > 0 && p.height > 0 && p.opacity > .05));
    await page.screenshot({ path: join(out, 'production-f4.png') }); assertion('normal editable ZIP import in verified production preview renders 30 layers with 300 unique UI key identities');
    await page.evaluate(async () => (await import('/e5-qualification/native-observer.mjs')).install({ purpose: 'functional setup smoke, not performance' }));
    const button = page.getByRole('button', { name: 'E5 calibration', exact: true }), color = await button.evaluate(e => e.style.background); await button.click(); assert.notEqual(await button.evaluate(e => e.style.background), color);
    const markers = await page.evaluate(() => ({ trusted: e5Native.rows.some(e => e.isTrusted && e.type === 'pointerup'), calibration: performance.getEntriesByType('mark').some(m => m.name.startsWith('E5_CALIBRATION_')) })); assert.equal(markers.trusted, true); assert.equal(markers.calibration, true);
    const download = page.waitForEvent('download'); await page.evaluate(() => e5Native.download()); await (await download).saveAs(join(out, 'native-events-smoke.json')); await page.evaluate(() => e5Native.dispose()); await expect(button).toHaveCount(0); assertion('documented production observer URL, trusted calibration marks, download and disposal work');
    assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(productionSourceRequests, []); answer.fixture = { originalSha256: fixture.sha256, importedName: 'f4 editable', width: 1920, height: 1080, fps: 25, packageSha256: sha(fixtureZip), renderedLayers: 30, uniqueUiKeys: keyCount }; answer.pageErrors = pageErrors; answer.externalRequests = externalRequests; answer.productionSourceRequests = productionSourceRequests;
    await context.close();
  } catch (error) {
    answer.error = String(error);
    throw error;
  } finally {
    const cleanupErrors = [];
    const bounded = promise => Promise.race([promise, new Promise((_, reject) => { const timer = setTimeout(() => reject(new Error('Owned cleanup did not complete within three seconds.')), 3000); timer.unref(); })]);
    try { await closeServer(); } catch (error) { cleanupErrors.push(String(error)); }
    try { if (browser) await bounded(browser.close()); } catch (error) { cleanupErrors.push(String(error)); }
    try { if (browserServer) { await bounded(browserServer.close()); children.delete(browserServer.process()); } } catch (error) { cleanupErrors.push(String(error)); }
    answer.cleanup = cleanupErrors.length === 0 && !(await isPortBusy(port, 100));
    answer.cleanupErrors = cleanupErrors;
    writeFileSync(join(out, 'helper-smoke.json'), JSON.stringify(answer, null, 2) + '\n');
    if (answer.error || !answer.cleanup) console.error('Native helper failure receipt: ' + JSON.stringify(answer));
    if (!answer.cleanup) throw new Error('Owned helper cleanup failed: ' + cleanupErrors.join('; '));
  }
  assert(answer.cleanup); remaining(); return answer;
}
