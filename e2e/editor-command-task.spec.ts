// covers: src/components/editorFoundation/**
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dropSvg, untickTextRow, rowLabelled } from './_svg-import';
import { settleDurableWrites } from './_durable';

const evidence = 'docs/work-specs/editor-command-qualification';
let semantic = false;
async function inspect(page: Page) { return page.evaluate(async () => { const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(); const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); return i; }); }
async function apply(page: Page, id: string, args: unknown) { const r = await page.evaluate(async ({ id, args }) => { const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(); const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); const r = c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id, args }] }); await new Promise(r => setTimeout(r)); return r; }, { id, args }); expect(r.ok, JSON.stringify(r)).toBe(true); await ready(page); return r; }
async function changeView(page: Page, request: unknown) { const r = await page.evaluate(async request => { const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(); const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); const r = c.view({ expected: i.expected, ...(request as object) }); await new Promise(r => setTimeout(r)); return r; }, request); expect(r.ok, JSON.stringify(r)).toBe(true); await ready(page); }
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
async function select(page: Page, id: string) { if (semantic) { await changeView(page, { action: 'select', targetIds: [id.slice(1)] }); return; } await page.locator(`.ef-track[data-selector="${id}"] .ef-layer`).first().click(); await ready(page); }
async function seek(page: Page, time: number) { if (semantic) { await changeView(page, { action: 'seek', time }); return; }
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
for (const [width, height, label] of [[1920, 1080, 'desktop'], [1366, 768, 'laptop'], [1093, 614, 'laptop-125']] as const) test('shared UI and semantic authoring, reopen and output task ' + label, async ({ browser }, testInfo) => {
  const compared: unknown[] = []; const creations: unknown[] = [];
  for (const mode of ['ui', 'semantic']) {
  semantic = mode === 'semantic';
  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL as string }); const page = await context.newPage();
  test.setTimeout(360_000);
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
  const discovery = await inspect(page); expect(discovery.targets.find(t => t.id === 'static-note')?.text?.fieldId).toBe(null);
  expect(discovery.targets.find(t => t.id === initial.fields[0].field)?.capabilities['text.set'].supported).toBe(true);
  const phases: unknown[] = [];
  const checkpoint = async () => {
    const i = await inspect(page), current = await source(page), previous = (phases.at(-1) as { source: typeof current } | undefined)?.source;
    const patches = previous ? (['html', 'css', 'js'] as const).filter(file => previous[file] !== current[file]).map(file => ({ file, before: previous[file], after: current[file] })) : [];
    phases.push({ source: current, history: i.history, patches });
  };
  await checkpoint();
  if (!semantic) await page.evaluate(async () => {
    const s = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession(), original = s.execute.bind(s);
    const captured: unknown[] = []; (window as unknown as { taskCreations: unknown[] }).taskCreations = captured;
    s.execute = request => { const result = original(request); for (const op of request.operations) if (op.kind === 'layer.create') captured.push(structuredClone(op.geometry)); return result; };
  });
  // Replay the UI's measured parent-space inputs, including subpixel text geometry.
  const captureCreation = async () => { if (!semantic) creations.push(await page.evaluate(() => (window as unknown as { taskCreations: unknown[] }).taskCreations.at(-1))); };
  expect(initial.html).toContain('plate-clip'); expect(initial.html).toContain('soft-mask');
  const shapes: string[] = [];
  for (const x of [1080, 1380]) {
    const tool = shapes.length ? 'ellipse' : 'rectangle'; if (!semantic) await choose(page, tool);
    if (semantic) await apply(page, 'layer.create', { geometry: creations[shapes.length] }); else { await point(page, x, 560, 220, 90); await ready(page); } shapes.push((await selection(page))[0]); await captureCreation(); await checkpoint();
    if (!semantic) await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool', tool);
  }
  if (semantic) await apply(page, 'layer.create', { geometry: creations[2] }); else { await choose(page, 'text'); await point(page, 1080, 680, 480, 100); await ready(page); }
  await checkpoint();
  await captureCreation(); const textId = (await selection(page))[0];
  if (!semantic) await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool', 'text');
  if (semantic) await apply(page, 'text.set', { targetId: textId.slice(1), text: 'LIVE REPORT' }); else {
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('LIVE REPORT');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  } await ready(page); await checkpoint();
  await expect((await frame(page)).locator(textId)).toHaveText('LIVE REPORT');
  const publicId = '#' + initial.fields[0].field;
  await select(page, publicId);
  await page.evaluate(async field => {
    (await import('/src/store/templateStore.ts')).useTemplateStore.getState().setSampleValue(field, 'Operator rehearsal');
    await new Promise(resolve => setTimeout(resolve));
  }, initial.fields[0].field);
  if (semantic) await apply(page, 'text.set', { targetId: publicId.slice(1), text: 'Morning report' }); else {
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('Morning report');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  } await ready(page); await checkpoint();
  await expect((await frame(page)).locator(publicId)).toHaveText('Morning report');
  await select(page, '#static-note');
  if (semantic) await apply(page, 'text.set', { targetId: '#static-note'.slice(1), text: 'News desk' }); else {
  await page.getByRole('textbox', { name: 'Artwork text', exact: true }).fill('News desk');
  await page.getByRole('button', { name: 'Apply text', exact: true }).click();
  } await ready(page); await checkpoint();
  await expect((await frame(page)).locator('#static-note')).toHaveText('News desk');
  expect((await source(page)).fields).toHaveLength(2);
  const completed = await source(page), beforeCancel = await inspect(page);
  if (semantic) await page.evaluate(async geometry => {
    const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands();
    const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message);
    c.session.begin(i.expected.revision);
    const draft = c.session.preview([{ kind: 'layer.create', geometry } as never]);
    if (!draft.diff.length) throw new Error('The semantic draft did not stage a source patch.');
  }, creations[0]);
  else { await choose(page, 'pen'); await point(page, 1500, 800); await point(page, 1700, 880); }
  const busy = await page.evaluate(async () => { const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(); const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); return c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'out.set', args: { time: 1.2 } }] }); });
  expect(busy.ok).toBe(false); if (!busy.ok) expect(busy.refusal.code).toBe('busy');
  if (semantic) await page.evaluate(async () => { (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().session.cancel(); await new Promise(r => setTimeout(r)); }); else await page.keyboard.press('Escape'); expect(await source(page)).toEqual(completed); expect((await inspect(page)).history).toEqual(beforeCancel.history);
  await choose(page, 'select'); await select(page, shapes[0]);
  await seek(page, 1.2); if (semantic) await apply(page, 'out.set', { time: 1.2 }); else { await page.getByRole('button', { name: 'Set Out at playhead', exact: true }).click(); await ready(page); } await checkpoint();
  await seek(page, 0); if (semantic) await apply(page, 'animation.key', { targetId: shapes[0].slice(1), step: 0, property: 'x', time: 0, value: 0, action: 'set' }); else { await page.getByRole('button', { name: 'Enable Position X animation', exact: true }).click(); await ready(page); } await checkpoint();
  const baseX = Number(await page.locator('.ef-animation-properties').getByRole('textbox', { name: 'Position X', exact: true }).inputValue());
  if (semantic) await apply(page, 'animation.key', { targetId: shapes[0].slice(1), step: 0, property: 'x', time: 0, value: 20, action: 'set' }); else await numeric(page, 'Position X', String(baseX + 20)); await checkpoint();
  await seek(page, 1); if (semantic) await apply(page, 'animation.key', { targetId: shapes[0].slice(1), step: 0, property: 'x', time: 1, value: 60, action: 'set' }); else await numeric(page, 'Position X', String(baseX + 60)); await checkpoint();
  expect(await page.evaluate(async id => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return (await import('/src/blocks/editorAnimation.ts')).animationSource(t).steps[0].layers[id].x.length;
  }, shapes[0])).toBe(2);
  await seek(page, .6); if (semantic) await apply(page, 'step.add', { time: .6 }); else { await page.getByRole('button', { name: 'Add Step at playhead', exact: true }).click(); await ready(page); } await checkpoint();
  const heldX = await page.evaluate(async id => {
    const t = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    const data = (await import('/src/blocks/editorAnimation.ts')).animationSource(t);
    return data.steps.slice(0, -1).map(step => Number(step.layers[id].x.at(-1)!.value));
  }, shapes[0]);
  expect(heldX).toHaveLength(2); expect(heldX[1]).toBeGreaterThan(heldX[0]);
  const beforeRefusal = await source(page);
  const refused = await page.evaluate(async id => {
    const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(), i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message);
    const request = { expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'base.set', args: { targetId: id.slice(1), values: { y: 10 } } }] };
    return [c.apply({ ...request, expected: { ...i.expected, revision: { ...i.expected.revision, source: i.expected.revision.source - 1 } } }),
      c.apply({ ...request, commands: [...request.commands, { id: 'text.set', args: { targetId: 'missing', text: 'x' } }] }),
      c.apply({ ...request, commands: [{ id: 'text.set', args: { targetId: id.slice(1), text: 'unsupported' } }] })];
  }, shapes[0]);
  for (const refusal of refused) expect(refusal.ok).toBe(false);
  if (!refused[0].ok) expect(refused[0].refusal.code).toBe('stale_context');
  if (!refused[2].ok) expect(refused[2].refusal.code).toBe('unsupported_target');
  expect(await source(page)).toEqual(beforeRefusal);
  const beforeHistory = await source(page);
  if (semantic) {
    for (const direction of ['undo', 'redo']) { const r = await page.evaluate(async direction => { const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(), i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); const r = c.history({ expected: i.expected, direction }); await new Promise(r => setTimeout(r)); return r; }, direction); expect(r.ok).toBe(true); await ready(page); }
  } else { await page.getByRole('button', { name: 'Undo', exact: true }).click(); await ready(page); await page.getByRole('button', { name: 'Redo', exact: true }).click(); await ready(page); }
  expect(await source(page)).toEqual(beforeHistory);
  await seek(page, 1.2); await select(page, textId);
  const localX = () => frame(page).then(f => f.locator(shapes[0]).evaluate(el => Number((window as unknown as { gsap: { getProperty(e: Element, p: string): number } }).gsap.getProperty(el, 'x'))));
  await seek(page, 0); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(localX).toBeCloseTo(heldX[0], 1); await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  // Play at a flag replays the arriving segment by the existing UI contract. Inspect Next at local zero, then play from its first frame.
  await changeView(page, { action: 'seek', time: .6, cue: 1 });
  await seek(page, .6 + 1 / (await source(page)).fps); await page.getByRole('button', { name: 'Play', exact: true }).click();
  await expect.poll(localX).toBeCloseTo(heldX[1], 1); await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect.poll(() => frame(page).then(f => f.locator(shapes[0]).evaluate(el => getComputedStyle(el.parentElement!).opacity))).toBe('0');
  await seek(page, 1.2); await select(page, textId);
  const validation = await page.evaluate(async () => (await import('/src/validation/validateTemplate.ts')).validateTemplate((await import('/src/store/templateStore.ts')).useTemplateStore.getState().template));
  expect(validation.ok, JSON.stringify(validation)).toBe(true);
  const beforeSave = await source(page);
  expect(await page.evaluate(async field => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().sampleData[field], initial.fields[0].field)).toBe('Operator rehearsal');
  await page.getByTestId('save-graphic').click(); await page.getByTestId('save-name').fill('Shared commands ' + label); await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved'); await settleDurableWrites(page);
  const saved = await source(page); await page.reload(); await ready(page);
  expect(await source(page)).toEqual(saved); expect(saved.fields).toEqual(beforeSave.fields); expect(saved.assets).toEqual(initial.assets);
  expect(await page.evaluate(async field => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().sampleData[field], initial.fields[0].field)).toBe('Morning report');
  if (width === 1093) await page.getByRole('combobox', { name: 'Canvas zoom', exact: true }).selectOption('2');
  await seek(page, 1.2); await select(page, textId); await choose(page, 'pen');
  await expect((await frame(page)).locator(textId)).toHaveText('LIVE REPORT');
  for (const id of shapes) await expect((await frame(page)).locator(id)).toBeVisible();
  expect((await page.getByTestId('foundation-canvas').boundingBox())!.height).toBeGreaterThan(150);
  await expect(page.getByTestId('foundation-timeline')).toBeInViewport();
  mkdirSync(evidence, { recursive: true });
  const settle = () => page.evaluate(() => new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  const style = await page.addStyleTag({ content: '*{will-change:auto !important}' }); await settle(); await style.evaluate(el => el.remove()); await settle();
  const poses = await (await frame(page)).locator(shapes[0]).evaluate(el => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; });
  compared.push({ phases, saved, poses });
  await page.screenshot({ path: evidence + '/' + label + '-' + mode + '.png' });
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

    await command('stop');
    await expect.poll(() => output.locator(shapes[0]).evaluate(el => { const s = getComputedStyle(el); return s.visibility === 'hidden' || s.opacity === '0' || getComputedStyle(el.parentElement!).opacity === '0'; })).toBe(true);
    await output.close();
  }
  expect(errors).toEqual([]); expect(network).toEqual([]); await context.close();
  }
  expect(compared[1]).toEqual(compared[0]);
  const result = compared[0] as { phases: { source: { html: string; css: string; js: string; fields: { field: string; value: unknown }[]; assets: { path: string }[] }; history: unknown; patches: { file: string }[] }[]; poses: unknown };
  writeFileSync(evidence + '/' + label + '-parity.json', JSON.stringify({ viewport: { width, height }, exactSourceAndHistoryEqual: true,
    phases: result.phases.map(p => ({ hashes: Object.fromEntries((['html', 'css', 'js'] as const).map(file => [file, createHash('sha256').update(p.source[file]).digest('hex')])),
      fields: p.source.fields.map(f => ({ id: f.field, default: f.value })), assets: p.source.assets.map(a => a.path), history: p.history, changedFiles: p.patches.map(p => p.file) })), pose: result.poses }, null, 2));
});
