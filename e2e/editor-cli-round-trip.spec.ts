// covers: src/blocks/edit.ts, src/components/editorFoundation/**, src/components/wizard/CreationWizard.tsx, src/model/{importTemplate,scriptKind}.ts, src/export/**, src/bridge/**
import { test, expect, type Page } from '@playwright/test';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { settleDurableWrites } from './_durable';

const evidence = 'docs/work-specs/editor-cli-round-trip';
const source = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
const inspection = (page: Page) => page.evaluate(async () => {
  const i = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect();
  if (!i.ok) throw Error(i.refusal.message); return i;
});
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const canvas = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(canvas.getAttribute('data-pose-time')) - view.time) < .00001 && canvas.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
async function frame(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function select(page: Page, id: string) { await page.locator(`.ef-track[data-selector="${id.startsWith('.') ? id : '#' + id}"] .ef-layer`).first().click(); await ready(page); }
async function seek(page: Page, time: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead', exact: true }), n = Math.round(time * (await source(page)).fps);
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(n / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < n % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(time)); await ready(page);
}
async function text(page: Page, id: string, value: string) {
  await select(page, id); await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill(value);
  await page.getByRole('button', { name: 'Apply text', exact: true }).click(); await ready(page);
  await expect((await frame(page)).locator('#' + id)).toHaveText(value);
}
async function open(page: Page, fixture: string, title: string) {
  await page.goto('/app?editor=foundation#/new'); await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles('e2e/fixtures/cli-round-trip/' + fixture + '.zip');
  await expect(page.getByTestId('import-template-card')).toContainText(title);
  await page.locator('.wz-next').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
}
async function capture(page: Page, name: string) {
  const f = await frame(page), style = await f.addStyleTag({ content: '*{will-change:auto !important}' });
  const settle = () => f.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  await settle(); await style.evaluate(el => el.remove()); await settle();
  mkdirSync(evidence, { recursive: true }); await page.screenshot({ path: evidence + '/' + name + '.png' });
}

async function exportedFiles(page: Page, target: string) {
  return await page.evaluate(async target => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
    return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
  }, target);
}
async function mountOutput(page: Page, target: string, files: Record<string, string>, observe?: (page: Page) => void) {
  const output = await page.context().newPage(); output.setDefaultTimeout(15_000); observe?.(output);
  await output.route('http://round-trip.local/**', route => {
    const name = new URL(route.request().url()).pathname.slice(1), body = files[name];
    return route.fulfill({ status: body ? 200 : name ? 404 : 200, contentType: /\.m?js$/.test(name) ? 'application/javascript' : /\.css$/.test(name) ? 'text/css' : /\.svg$/.test(name) ? 'image/svg+xml' : /\.woff2$/.test(name) ? 'font/woff2' : /\.png$/.test(name) ? 'image/png' : 'text/html', body: body ? Buffer.from(body, 'base64') : '<html><body></body></html>' });
  });
  if (target === 'ograf') {
    await output.goto('http://round-trip.local/'); await output.evaluate(async () => {
      const mod = await import('http://round-trip.local/graphic.mjs'); customElements.define('round-trip-graphic', mod.default);
      const el = document.createElement('round-trip-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> }; document.body.appendChild(el); await el.load({ data: {} });
    });
  } else await output.goto('http://round-trip.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
  const command = (action: 'play' | 'stop' | 'goalA' | 'clearFlag') => output.evaluate(async ({ action, target }) => {
    if (target === 'ograf') {
      const el = document.querySelector('round-trip-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
      if (action === 'stop') await el.stopAction({}); else if (action === 'play') await el.playAction({}); else await (el as unknown as { customAction(p: unknown): Promise<unknown> }).customAction({ id: action });
    } else if (action === 'play' || action === 'stop') (window as unknown as Record<string, () => void>)[action](); else (window as unknown as { noacgDispatch(event: string): void }).noacgDispatch(action);
  }, { action, target });
  return { output, command };
}

for (const [width, height, label] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [1093, 614, 'laptop-125']] as const) test('agent package visual round-trip ' + label, async ({ page }) => {
  test.setTimeout(180_000); page.setDefaultTimeout(15_000); const errors: string[] = [], network: string[] = [];
  const watch = (p: Page) => {
    p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('requestfailed', r => { if (!r.failure()?.errorText.includes('ERR_ABORTED')) network.push(r.url()); });
  }; watch(page); await page.setViewportSize({ width, height }); await open(page, 'riverlight', 'Riverlight festival');
  const initial = await source(page), initialInspection = await inspection(page);
  expect(initial.html).toContain('<script id="festival-config" type="application/json">{"slug":"riverlight","season":2026}</script>');
  expect(initial.js).not.toContain('{"slug":"riverlight","season":2026}');
  expect(initial.fields.some(f => f.field === 'festival-note')).toBe(false);
  expect(initialInspection.targets.some(t => t.id === 'festival-note')).toBe(false);
  expect(initial.assets.map(a => a.path).sort()).toEqual(['fonts/inter.woff2', 'images/festival-mark.svg', 'thumbnail.png']);
  const zip = await JSZip.loadAsync(readFileSync('e2e/fixtures/cli-round-trip/riverlight.zip'));
  for (const asset of initial.assets) expect(asset.data.split(',')[1]).toBe(await zip.file(asset.path)!.async('base64'));
  await seek(page, 1); await text(page, 'f0', 'Elena Marquez');
  const edited = await source(page); expect(edited.fields.find(f => f.field === 'f0')?.value).toBe('Elena Marquez');
  expect((await inspection(page)).history.undo).toBe(initialInspection.history.undo + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(initial);
  await expect((await frame(page)).locator('#f0')).toHaveText('Amira Solano');
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); expect(await source(page)).toEqual(edited);
  await select(page, '.graphic-box');
  const colour = page.locator('.ef-appearance-field').filter({ hasText: 'Solid fill' }).locator('input').last();
  await colour.fill('#12243c'); await colour.press('Enter'); await ready(page);
  await expect.poll(() => frame(page).then(f => f.locator('.graphic-box').evaluate(el => getComputedStyle(el).backgroundColor))).toBe('rgb(18, 36, 60)');
  await select(page, 'f0');
  const size = page.getByTestId('artwork-font-size'); await size.fill('52'); await size.press('Enter'); await ready(page);
  await expect.poll(() => frame(page).then(f => f.locator('#f0').evaluate(el => getComputedStyle(el).fontSize))).toBe('52px');
  const completed = await source(page), history = (await inspection(page)).history;
  await size.fill('50'); await size.press('Escape'); await ready(page);
  expect(await source(page)).toEqual(completed); expect((await inspection(page)).history).toEqual(history);
  const refused = await page.evaluate(async () => {
    const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(), i = c.inspect(); if (!i.ok) throw Error(i.refusal.message);
    const request = { expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'text.set', args: { targetId: 'f0', text: 'wrong' } }] };
    return [c.apply({ ...request, expected: { ...i.expected, revision: { ...i.expected.revision, source: i.expected.revision.source - 1 } } }),
      c.apply({ ...request, commands: [{ id: 'text.set', args: { targetId: 'festival-note', text: 'unsupported' } }] })];
  });
  for (const r of refused) expect(r.ok).toBe(false);
  if (!refused[0].ok) expect(refused[0].refusal.code).toBe('stale_context');
  if (!refused[1].ok) expect(refused[1].refusal.code).toBe('unsupported_target');
  expect(await source(page)).toEqual(completed); expect((await inspection(page)).history).toEqual(history);
  expect(completed.fields).toEqual(edited.fields); expect(completed.assets).toEqual(initial.assets);
  expect(initial.js).toContain('var NOACG_ANIM =');
  expect(completed.js).toBe(initial.js); expect(completed.css).toContain('.festival-unused { border-color:var(--accent); }');
  expect(completed.html).toContain('id="festival-panel"'); expect(completed.html).toContain('id="festival-config"');
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Riverlight ' + label); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page); expect(await source(page)).toEqual(saved);
  await seek(page, 1); await select(page, 'f0');
  if (width === 1093) await page.getByRole('combobox', { name: 'Canvas zoom', exact: true }).selectOption('2');
  await expect(page.getByTestId('foundation-timeline')).toBeInViewport(); expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThan(150);
  await capture(page, label);
  await seek(page, 0); await page.getByRole('button', { name: 'Play', exact: true }).click();
  const pose = () => frame(page).then(f => f.locator('.graphic').evaluate(el => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })));
  await expect.poll(async () => (await pose()).opacity).toBe('1'); await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  const held = await pose(); await page.getByRole('button', { name: 'Out', exact: true }).click(); await expect.poll(async () => (await pose()).opacity).toBe('0');
  const outputs: unknown[] = [];
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await exportedFiles(page, target);
    const { output, command } = await mountOutput(page, target, files, watch);
    await command('play');
    await expect(output.locator('#f0')).toHaveText('Elena Marquez'); await expect(output.locator('#festival-note')).toHaveText('RIVERLIGHT');
    await expect.poll(() => output.locator('.graphic').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    const outputPose = await output.locator('.graphic').evaluate(el => ({ opacity: getComputedStyle(el).opacity, transform: getComputedStyle(el).transform })); expect(outputPose).toEqual(held);
    await expect.poll(() => output.locator('#f0').evaluate(el => getComputedStyle(el).fontSize)).toBe('52px');
    expect(await output.locator('#festival-config').textContent()).toBe('{"slug":"riverlight","season":2026}');
    expect(await output.locator('#festival-mark').evaluate(el => (el as HTMLImageElement).naturalWidth)).toBe(72);
    for (const asset of initial.assets) {
      if (target === 'casparcg') {
        // This target embeds referenced resources in HTML; the unused thumbnail is editor metadata.
        if (asset.path !== 'thumbnail.png') expect(Buffer.from(files[Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel'))!], 'base64').toString().includes(asset.data), asset.path).toBe(true);
      } else expect(files[asset.path] === asset.data.split(',')[1], target + ': ' + asset.path).toBe(true);
    }
    await expect.poll(() => output.locator('#f0').evaluate(el => document.fonts.check('700 52px Inter') && getComputedStyle(el).fontFamily.includes('Inter')), { message: target + ' loaded Inter' }).toBe(true);
    await command('stop'); await expect.poll(() => output.locator('.graphic').evaluate(el => getComputedStyle(el).opacity)).toBe('0');
    outputs.push({ target, pose: outputPose }); await output.close();
  }
  expect(errors).toEqual([]); expect(network).toEqual([]);
  writeFileSync(evidence + '/' + label + '.json', JSON.stringify({ viewport: { width, height }, fields: saved.fields, assets: saved.assets.map(a => ({ path: a.path, sha256: createHash('sha256').update(a.data).digest('hex') })), source: Object.fromEntries((['html', 'css', 'js'] as const).map(k => [k, createHash('sha256').update(saved[k]).digest('hex')])), history, refusals: refused, outputs, errors, network }, null, 2));
});

test('independent CLI scoreboard retains its operator machine after visual edit and reopen', async ({ page }) => {
  test.setTimeout(180_000); page.setDefaultTimeout(15_000); await page.setViewportSize({ width: 1366, height: 768 });
  await open(page, 'harbor', 'Harbor cup'); const initial = await source(page);
  await seek(page, .6); await text(page, 'f0', 'HARBOR'); await text(page, 'f2', 'RIVERSIDE');
  const completed = await source(page); expect(completed.js).toBe(initial.js); expect(completed.assets).toEqual(initial.assets);
  expect(completed.fields.map(f => f.field)).toEqual(['f0', 'f1', 'f2', 'f3']);
  expect(completed.fields.find(f => f.field === 'f1')?.value).toBe('0');
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Harbor cup edited'); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page); const saved = await source(page);
  const id = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().saved.graphicId);
  await page.reload(); await ready(page); expect(await source(page)).toEqual(saved); await seek(page, .6); await select(page, 'f0');
  await capture(page, 'independent-scoreboard');
  const packages = await Promise.all(['spx', 'casparcg', 'ograf'].map(async target => ({ target, files: await exportedFiles(page, target) })));
  await page.goto('/app#/control/' + id); await expect(page.getByTestId('graphic-control-page')).toBeVisible();
  const preview = page.frameLocator('iframe[title="Graphic preview"]');
  const state = async () => (await page.getByTestId('control-state').textContent())?.replace(/^[▶●◇]\s*/, '').trim();
  await expect.poll(state).toBe('Enter · No flag · Live'); await page.getByTestId('control-play').click();
  await expect(preview.locator('#f0')).toHaveText('HARBOR'); await expect(preview.locator('#f2')).toHaveText('RIVERSIDE');
  await page.getByTestId('control-event-goalA').click(); await expect.poll(state).toBe('Enter · Flag · Live');
  await expect.poll(() => preview.locator('.scoreboard-accent').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
  await page.getByTestId('control-event-clearFlag').click(); await expect.poll(state).toBe('Enter · No flag · Live');
  await expect.poll(() => preview.locator('.scoreboard-accent').evaluate(el => getComputedStyle(el).opacity)).toBe('0.35');
  await page.getByTestId('control-stop').click(); await expect.poll(state).toBe('Off · No flag · Live');
  const outputs: unknown[] = [];
  for (const { target, files } of packages) {
    const errors: string[] = [], network: string[] = [];
    const { output, command } = await mountOutput(page, target, files, p => {
      p.on('pageerror', e => errors.push(e.message)); p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      p.on('requestfailed', r => { if (!r.failure()?.errorText.includes('ERR_ABORTED')) network.push(r.url()); });
    });
    await command('play'); await expect(output.locator('#f0')).toHaveText('HARBOR'); await expect(output.locator('#f2')).toHaveText('RIVERSIDE');
    await expect.poll(() => output.locator('.scoreboard').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    await command('goalA'); await expect.poll(() => output.locator('.scoreboard-accent').evaluate(el => getComputedStyle(el).opacity)).toBe('1');
    await command('clearFlag'); await expect.poll(() => output.locator('.scoreboard-accent').evaluate(el => getComputedStyle(el).opacity)).toBe('0.35');
    await command('stop'); await expect.poll(() => output.locator('.scoreboard').evaluate(el => getComputedStyle(el).opacity)).toBe('0');
    expect(errors).toEqual([]); expect(network).toEqual([]); outputs.push({ target, actions: ['play', 'goalA', 'clearFlag', 'stop'], errors }); await output.close();
  }
  writeFileSync(evidence + '/independent-scoreboard.json', JSON.stringify({ fields: saved.fields, sourceUnchanged: { js: completed.js === initial.js, assets: JSON.stringify(completed.assets) === JSON.stringify(initial.assets) }, outputs }, null, 2));
});

test('inline data scripts retain their tags while classic scripts use the JS pane', async ({ page }) => {
  await page.goto('/app');
  const results = await page.evaluate(async () => {
    const { importHtmlTemplate } = await import('/src/model/importTemplate.ts');
    return ['type="application/json"', "type='text/x-template'", 'type=importmap', 'TYPE="APPLICATION/LD+JSON"', 'type="module"', 'type="text/javascript"', "type='application/javascript'", ''].map(attrs => {
      const tag = `<script ${attrs}>/* marker */</script>`;
      const { template } = importHtmlTemplate('types.html', `<html><head>${tag}</head><body></body></html>`);
      return { attrs, html: template.html.includes(tag), js: template.js.includes('/* marker */') };
    });
  });
  expect(results.slice(0, 5).every(r => r.html && !r.js)).toBe(true);
  expect(results.slice(5).every(r => !r.html && r.js)).toBe(true);
});

test('CSS edits patch effective repeated rules without changing nested or unrelated rules', async ({ page }) => {
  await page.goto('/app');
  const result = await page.evaluate(async () => {
    const { setCssDeclaration, findRuleBody } = await import('/src/blocks/edit.ts');
    const first = '#panel { width:20px; /* keep layout */ }', last = '#panel { background:#ffffff; /* keep appearance */ }';
    const nested = '@media (min-width:999999px) { #panel { background:#abcdef; } }';
    const original = `${first}\n${last}\n${nested}\n#unrelated { color: red; }`;
    const css = setCssDeclaration(original, '#panel', 'background', '#12243c');
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);
    const el = document.createElement('div'); el.id = 'panel'; document.body.appendChild(el);
    return { css, first, nested, firstRead: findRuleBody(css, '#panel')?.body, colour: getComputedStyle(el).backgroundColor, width: getComputedStyle(el).width };
  });
  expect(result.css).toContain(result.first); expect(result.css).toContain(result.nested); expect(result.css).toContain('#unrelated { color: red; }');
  expect(result.css).toContain('background: #12243c; /* keep appearance */'); expect(result.firstRead).toContain('width:20px');
  expect(result.colour).toBe('rgb(18, 36, 60)'); expect(result.width).toBe('20px');
});
