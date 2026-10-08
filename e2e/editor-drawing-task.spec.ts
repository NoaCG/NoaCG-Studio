// covers: src/components/editorFoundation/**
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dropSvg, untickTextRow, rowLabelled } from './_svg-import';
import { settleDurableWrites } from './_durable';

const evidence = 'docs/work-specs/editor-persistent-drawing';
const source = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
const selection = (page: Page) => page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().selectedParts);
async function frame(page: Page) { return (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!; }
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect.poll(() => page.evaluate(async () => {
    const view = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession().port.view();
    const canvas = document.querySelector('[data-testid=foundation-canvas]')!;
    return Math.abs(Number(canvas.getAttribute('data-pose-time')) - view.time) < .00001 && canvas.getAttribute('data-pose-cue') === String(view.cue ?? 'arriving');
  })).toBe(true);
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
}
async function choose(page: Page, name: string) { await page.getByRole('button', { name: name + ' tool', exact: true }).click(); }
async function point(page: Page, x: number, y: number, dx = 0, dy = 0) {
  const t = await source(page), r = (await page.locator('.ef-artboard').boundingBox())!;
  const p = (x: number, y: number) => ({ x: r.x + x / t.resolution.width * r.width, y: r.y + y / t.resolution.height * r.height });
  const a = p(x, y), b = p(x + dx, y + dy);
  await page.mouse.move(a.x, a.y); await page.mouse.down();
  if (dx || dy) await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
}
async function select(page: Page, id: string) { await page.locator(`.ef-track[data-selector="${id}"] .ef-layer`).first().click(); await ready(page); }
async function seek(page: Page, time: number) {
  const ruler = page.getByRole('slider', { name: 'Playhead', exact: true }), fps = (await source(page)).fps, n = Math.round(time * fps);
  await ruler.focus(); await ruler.press('Home');
  for (let i = 0; i < Math.floor(n / 10); i++) await ruler.press('Shift+ArrowRight');
  for (let i = 0; i < n % 10; i++) await ruler.press('ArrowRight');
  await expect(ruler).toHaveAttribute('aria-valuenow', String(n / fps)); await ready(page);
}
async function numeric(page: Page, label: string, value: string) {
  const input = page.locator('.ef-animation-properties').getByRole('textbox', { name: label, exact: true });
  await input.fill(value); await input.press('Enter'); await ready(page);
  await expect(page.locator('.ef-animation-properties [role=alert]')).toHaveCount(0);
}
for (const [width, height, label] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [1093, 614, 'laptop-125']] as const) test('cumulative wizard authoring, reopen and output task ' + label, async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [], network: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) network.push(request.url()); });
  await page.setViewportSize({ width, height }); await page.goto('/app#/new');
  const input = testInfo.outputPath('nested-static.svg');
  writeFileSync(input, readFileSync('e2e/fixtures/fidelity-nested.svg', 'utf8').replace('</svg>', '<text id="static-note" x="660" y="100" font-size="24" font-family="Arial" fill="#ffffff">Studio bulletin</text></svg>'));
  page.setDefaultTimeout(15_000);
  await dropSvg(page, input); await untickTextRow(page, await rowLabelled(page, /^static-note$/));
  await page.locator('.wz-next').click(); await page.getByRole('button', { name: /^Fade Dissolves/ }).click();
  await page.locator('.wz-next').click(); await page.getByTestId('wz-finish-edit-artwork').click(); await ready(page);
  if (width === 1093) await page.getByRole('combobox', { name: 'Canvas zoom', exact: true }).selectOption('2');
  const initial = await source(page); expect(initial.fields).toHaveLength(1);
  expect(initial.html).toContain('plate-clip'); expect(initial.html).toContain('soft-mask');
  await choose(page, 'rectangle'); const shapes: string[] = [];
  for (const x of [1080, 1380]) {
    await point(page, x, 560, 220, 90); await ready(page); shapes.push((await selection(page))[0]);
    await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool', 'rectangle');
  }
  await choose(page, 'text'); await point(page, 1080, 680, 480, 100); await ready(page);
  const textId = (await selection(page))[0];
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool', 'text');
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('LIVE REPORT');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect((await frame(page)).locator(textId)).toHaveText('LIVE REPORT');
  const publicId = '#' + initial.fields[0].field;
  await select(page, publicId);
  await page.evaluate(async field => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().setSampleValue(field, 'Operator rehearsal');
    await new Promise(resolve => setTimeout(resolve));
  }, initial.fields[0].field);
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Morning report');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect((await frame(page)).locator(publicId)).toHaveText('Morning report');
  await select(page, '#static-note');
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('News desk');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  await expect((await frame(page)).locator('#static-note')).toHaveText('News desk');
  expect((await source(page)).fields).toHaveLength(2);
  await choose(page, 'pen'); const paths: string[] = [];
  for (let i = 0; i < 3; i++) {
    const x = 1080 + i * 210;
    await point(page, x, 280, i === 2 ? 45 : 0, i === 2 ? -60 : 0); await point(page, x + 160, 280); await point(page, x + 80, 440);
    if (i === 1) await point(page, x, 280); else await page.keyboard.press('Enter');
    await ready(page); paths.push((await selection(page))[0]);
    expect((await (await frame(page)).locator(paths[i] + ' path').getAttribute('d'))!.includes(' C ')).toBe(i === 2);
    await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool', 'pen');
  }
  const completed = await source(page);
  await point(page, 1500, 800); await point(page, 1700, 880); await page.keyboard.press('Escape');
  expect(await source(page)).toEqual(completed); await expect(page.locator('[data-pen-point]')).toHaveCount(0);
  await choose(page, 'select'); await select(page, shapes[0]);
  await seek(page, 1.2); await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click(); await ready(page);
  await seek(page, 0); await page.getByRole('button', { name: 'Enable Position X animation', exact: true }).click(); await ready(page);
  const baseX = Number(await page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true }).inputValue());
  await numeric(page, 'Position X', String(baseX + 20)); await seek(page, 1); await numeric(page, 'Position X', String(baseX + 60));
  expect(await page.evaluate(async id => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return (await import('/src/blocks/editorAnimation.ts')).animationSource(t).steps[0].layers[id].x.length;
  }, shapes[0])).toBe(2);
  await seek(page, .6); await page.getByRole('button', { name: 'Add Step at playhead', exact: true }).click(); await ready(page);
  const heldX = await page.evaluate(async id => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const data = (await import('/src/blocks/editorAnimation.ts')).animationSource(t);
    return data.steps.slice(0, -1).map(step => Number(step.layers[id].x.at(-1)!.value));
  }, shapes[0]);
  expect(heldX).toHaveLength(2); expect(heldX[1]).toBeGreaterThan(heldX[0]);
  const beforeRefusal = await source(page);
  const refused = await page.evaluate(async id => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    const request = { documentId: s.documentId, expected: s.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'base.set', selector: id, values: { y: 10 } }] };
    const messages: string[] = [];
    try { s.execute({ ...request, expected: { ...request.expected, source: request.expected.source - 1 } } as never); } catch (e) { messages.push(String(e)); }
    try { s.execute({ ...request, operations: [...request.operations, { kind: 'base.set', selector: '#missing', values: { x: 20 } }] } as never); } catch (e) { messages.push(String(e)); }
    return messages;
  }, shapes[0]);
  expect(refused).toHaveLength(2); expect(refused[0]).toContain('document changed'); expect(await source(page)).toEqual(beforeRefusal);
  await seek(page, 1.2); await select(page, paths[2]);
  const beforeSave = await source(page);
  expect(await page.evaluate(async field => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().sampleData[field], initial.fields[0].field)).toBe('Operator rehearsal');
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Persistent drawing ' + label); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page);
  expect(await source(page)).toEqual(saved); expect(saved.fields).toEqual(beforeSave.fields); expect(saved.assets).toEqual(initial.assets);
  expect(await page.evaluate(async field => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().sampleData[field], initial.fields[0].field)).toBe('Morning report');
  if (width === 1093) await page.getByRole('combobox', { name: 'Canvas zoom', exact: true }).selectOption('2');
  await seek(page, 1.2); await select(page, paths[2]); await choose(page, 'pen');
  await expect((await frame(page)).locator(textId)).toHaveText('LIVE REPORT');
  for (const id of [...shapes, ...paths]) await expect((await frame(page)).locator(id)).toBeVisible();
  expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThan(150);
  await expect(page.getByTestId('foundation-timeline')).toBeInViewport();
  mkdirSync(evidence, { recursive: true });
  const settle = () => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const style = await page.addStyleTag({ content: '*{will-change:auto !important}' }); await settle(); await style.evaluate(el => el.remove()); await settle();
  await page.screenshot({ path: evidence + '/' + label + '.png' });
  for (const target of ['spx', 'casparcg', 'ograf']) {
    const files = await page.evaluate(async target => {
      const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
      const zip = await (await import('/src/export/registry.ts')).EXPORT_TARGETS.find(t => t.id === target)!.build(t);
      return Object.fromEntries(await Promise.all(Object.keys(zip.files).filter(n => !zip.files[n].dir).map(async n => [n.slice(n.indexOf('/') + 1), await zip.file(n)!.async('base64')])));
    }, target);
    const output = await page.context().newPage(); output.on('pageerror', error => errors.push(error.message));
    output.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    output.on('requestfailed', request => { if (!request.failure()?.errorText.includes('ERR_ABORTED')) network.push(request.url()); });
    await output.route('http://drawing-output.local/**', route => {
      const name = new URL(route.request().url()).pathname.slice(1), body = files[name];
      return route.fulfill({ status: body ? 200 : name ? 404 : 200, contentType: /\.m?js$/.test(name) ? 'application/javascript' : /\.css$/.test(name) ? 'text/css' : /\.svg$/.test(name) ? 'image/svg+xml' : 'text/html', body: body ? Buffer.from(body, 'base64') : '<html><body></body></html>' });
    });
    if (target === 'ograf') {
      await output.goto('http://drawing-output.local/');
      await output.evaluate(async () => {
        const mod = await import('http://drawing-output.local/graphic.mjs'); customElements.define('drawing-graphic', mod.default);
        const el = document.createElement('drawing-graphic') as HTMLElement & { load(p: unknown): Promise<unknown> }; document.body.appendChild(el); await el.load({ data: {} });
      });
    } else await output.goto('http://drawing-output.local/' + Object.keys(files).find(n => n.endsWith('.html') && !n.includes('controlpanel')));
    const command = (action: 'play' | 'next' | 'stop') => output.evaluate(async ({ action, target }) => {
      if (target === 'ograf') {
        const el = document.querySelector('drawing-graphic') as HTMLElement & { playAction(p: unknown): Promise<unknown>; stopAction(p: unknown): Promise<unknown> };
        if (action === 'stop') await el.stopAction({}); else await el.playAction({});
      } else (window as unknown as Record<string, () => void>)[action]();
    }, { action, target });
    const x = () => output.locator(shapes[0]).evaluate(el => Number((window as unknown as { gsap: { getProperty(e: Element, p: string): number } }).gsap.getProperty(el, 'x')));
    await command('play'); await expect.poll(x).toBeCloseTo(heldX[0], 1);
    await expect(output.locator(publicId)).toHaveText('Morning report'); await expect(output.locator('#static-note')).toHaveText('News desk');
    await command('next'); await expect.poll(x).toBeCloseTo(heldX[1], 1);
    for (const id of paths) expect(await output.locator(id + ' path').getAttribute('d')).toBe(await (await frame(page)).locator(id + ' path').getAttribute('d'));
    await command('stop');
    await expect.poll(() => output.locator(shapes[0]).evaluate(el => { const s = getComputedStyle(el); return s.visibility === 'hidden' || s.opacity === '0' || getComputedStyle(el.parentElement!).opacity === '0'; })).toBe(true);
    await output.close();
  }
  expect(errors).toEqual([]); expect(network).toEqual([]);
});
