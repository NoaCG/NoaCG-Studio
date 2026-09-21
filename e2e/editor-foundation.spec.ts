import { test, expect, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { enableAdvancedMode } from './_create';

const evidence = process.env.NOACG_FOUNDATION_EVIDENCE;
if (evidence) mkdirSync(evidence, { recursive: true });
async function open(page: Page) {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible({ timeout: 30000 });
}
async function seed(page: Page, stress = false) {
  await open(page);
  await page.evaluate(async stress => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { initialDraft, mergeDraft, buildDraftTemplate } = await import('/src/components/wizard/draft.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const variant = variantsFor('lower-third').find(v => v.name === 'Hairline')!;
    const draft = mergeDraft(initialDraft(), { variantId: variant.id,
      lines: variant.suggestedLines.map(l => ({ ...l })), animation: { presetId: null, outPresetId: null } });
    let template = buildDraftTemplate(variant, draft);
    if (stress) {
      const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
      const layers = Object.fromEntries(Array.from({ length: 30 }, (_, i) => ['#f' + i, {
        x: Array.from({ length: 10 }, (_, k) => ({ time: k / 3, value: k % 2 ? 28 : 0 }))
      }]));
      template = { ...template, name: 'F4 - 30 layers / 300 keys',
        html: '<html><head></head><body><div class="f4"><div class="f4-box">' +
          Array.from({ length: 30 }, (_, i) => '<div class="f4-mask"><span id="f' + i + '">Layer ' + (i + 1) + '</span></div>').join('') +
          '</div></div></body></html>',
        css: 'body{margin:0}.f4{padding:90px;font:28px Arial;color:white}.f4-box{display:grid;grid-template-columns:repeat(5,1fr);gap:24px}.f4-mask{padding:24px;background:#234c63}span{display:inline-block}',
        js: emitAnimRegion({ version: 2, root: '.f4', speed: 1, steps: [
          { name: 'In', duration: 3, ease: 'none', layers }, { name: 'Out', duration: .5, ease: 'none', layers: {} }
        ] }) };
    }
    useTemplateStore.getState().applyTemplate(template, { resetSampleData: true });
    useTemplateStore.getState().setSelectedParts([]);
  }, stress);
  await ready(page);
  if (evidence) {
    const template = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
    writeFileSync(evidence + '/fixture-' + (stress ? 'f4' : 'catalog') + '.json', JSON.stringify(template, null, 2));
  }
}
async function ready(page: Page) {
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-pending', 'false');
  await expect(page.locator('.ef-stage-error')).toHaveCount(0);
  await expect.poll(async () => Number(await page.getByTestId('foundation-canvas').getAttribute('data-request'))).toBeGreaterThan(0);
}
async function frame(page: Page) {
  const handle = await page.locator('iframe[title="Foundation graphic preview"]').elementHandle();
  return (await handle!.contentFrame())!;
}
async function seek(page: Page, time: number) {
  const before = await page.getByTestId('foundation-canvas').getAttribute('data-request');
  await page.evaluate(async time => {
    const { foundationDiagnostics } = await import('/src/components/editorFoundation/Canvas.tsx');
    foundationDiagnostics()!.seek(time);
  }, time);
  await expect.poll(() => page.getByTestId('foundation-canvas').getAttribute('data-request')).not.toBe(before);
}
async function shot(page: Page, name: string) {
  if (!evidence) return;
  mkdirSync(evidence, { recursive: true });
  // Capture through the visible ruler so the artwork and displayed clock agree.
  const position = await page.evaluate(async () => {
    const { readTimeline } = await import('/src/components/editorFoundation/timelineView.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const view = readTimeline(useTemplateStore.getState().template);
    return { time: view.segments[0].duration, extent: Math.max(2, view.duration * 1.15) };
  });
  const ruler = (await page.getByRole('slider', { name: 'Playhead' }).boundingBox())!;
  const before = await page.getByTestId('foundation-canvas').getAttribute('data-request');
  await page.mouse.click(ruler.x + ruler.width * position.time / position.extent, ruler.y + 20);
  await expect.poll(() => page.getByTestId('foundation-canvas').getAttribute('data-request')).not.toBe(before);
  const preview = await frame(page);
  const style = await preview.addStyleTag({ content: '*{will-change:auto !important}' });
  await preview.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await style.evaluate(element => element.remove());
  await preview.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.screenshot({ path: evidence + '/' + name + '.png' });
}

test('flag off preserves default route; flag on opens without Advanced mode', async ({ page }) => {
  await page.goto('/app#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  await open(page);
  await expect(page.getByRole('button', { name: '+ New graphic', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
});

test('catalog opens visibly; canvas, timeline and Outline share selection; reverse seek preserves source', async ({ page }) => {
  await seed(page);
  const preview = await frame(page);
  // Blank-stage reproduction attempt: cold open must display the settled entrance.
  await expect.poll(() => preview.locator('.lower-third-box').evaluate(el => Number(getComputedStyle(el).opacity))).toBeGreaterThan(.9);
  const source = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await expect(page.locator('.ef-selection rect')).toHaveCount(1);
  await expect(page.locator('.ef-inspector')).toContainText('#f0');
  await page.getByRole('tab', { name: 'Outline' }).click();
  await expect(page.locator('.ef-outline-item[aria-pressed=true]')).toContainText('#f0');
  await page.locator('.ef-track[data-selector="#f1"] .ef-layer').click({ modifiers: ['Shift'] });
  await expect(page.locator('.ef-selection rect')).toHaveCount(2);
  await page.getByRole('tab', { name: 'Properties' }).click();
  await expect(page.locator('.ef-inspector')).toContainText('2 layers selected');
  const bounds = await page.locator('.ef-selection rect').first().boundingBox();
  await page.mouse.click(bounds!.x + bounds!.width / 2, bounds!.y + bounds!.height / 2);
  await expect(page.locator('.ef-selection rect')).toHaveCount(1);
  await seek(page, .1);
  const a = await preview.locator('#f0').evaluate(el => getComputedStyle(el).transform);
  await seek(page, .35);
  await seek(page, .1);
  expect(await preview.locator('#f0').evaluate(el => getComputedStyle(el).transform)).toBe(a);
  expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template)).toEqual(source);
  await page.setViewportSize({ width: 1920, height: 1080 });
  await seek(page, .6);
  await shot(page, 'catalog-desktop');
  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(page.locator('.ef-project')).toBeHidden();
  expect((await page.getByTestId('foundation-timeline').boundingBox())!.height).toBeGreaterThanOrEqual(240);
  await shot(page, 'catalog-laptop');
});

test('actual imported SVG wizard output loads with fields and artwork preserved', async ({ page }) => {
  await enableAdvancedMode(page);
  await page.goto('/app?editor=foundation#/new');
  await expect(page.locator('.wz-modal')).toBeVisible({ timeout: 30000 });
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type="file"]').setInputFiles(fileURLToPath(new URL('fixtures/illustrator-lower-third.svg', import.meta.url)));
  await expect(page.getByTestId('import-svg-card')).toBeVisible();
  await page.getByRole('button', { name: 'Create project', exact: true }).click();
  await expect(page.locator('.wz-modal')).toBeHidden({ timeout: 30000 });
  const source = await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  if (evidence) writeFileSync(evidence + '/fixture-svg.json', JSON.stringify(source, null, 2));
  await page.evaluate(async () => (await import('/src/app/router.ts')).useRouter.getState().navigate({ view: 'editor-foundation' }));
  await ready(page);
  await page.locator('.ef-track[data-selector="#f0"] .ef-layer').click();
  await seek(page, .3);
  await seek(page, 0);
  await seek(page, .8);
  expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template)).toEqual(source);
  await expect((await frame(page)).locator('svg.imported-design-art')).toBeVisible();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await shot(page, 'svg-desktop');
  await page.setViewportSize({ width: 1093, height: 614 }); // 1366x768 at 125% CSS viewport
  await expect(page.locator('.ef-inspector')).toBeVisible();
  const canvas = (await page.getByTestId('foundation-canvas').boundingBox())!;
  expect(canvas.width).toBeGreaterThan(600); expect(canvas.height).toBeGreaterThan(100);
  await shot(page, 'svg-laptop-125');
});

test('registry batch is atomic, undo/redo exact, cancellation and stale input preserve source', async ({ page }) => {
  await seed(page, true);
  const result = await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const session = activeEditorSession();
    const before = useTemplateStore.getState().template;
    const data = parseAnimData(before.js)!;
    const selector = Object.keys(data.steps[0].layers).find(selector => data.steps[0].layers[selector].x)!;
    const operation = { kind: 'key.set' as const, selector, step: 0, property: 'x', time: 0, value: -100 };
    const startLength = useTemplateStore.getState().history.length;
    const request = { documentId: session.documentId, expected: session.version(), transactionId: 'batch-1', operations: [operation, { ...operation, time: .1, value: -40 }] };
    session.execute(request);
    const after = useTemplateStore.getState().template;
    const oneHistory = useTemplateStore.getState().history.length === startLength + 1;
    session.undo(); const undo = useTemplateStore.getState().template.js === before.js;
    session.redo(); const redo = useTemplateStore.getState().template.js === after.js;
    session.begin();
    const preview = session.preview([{ ...operation, value: -500 }]);
    const transient = preview.template.js !== after.js && useTemplateStore.getState().template.js === after.js;
    useTemplateStore.getState().setSelectedParts([selector]);
    session.cancel();
    const cancelled = useTemplateStore.getState().selectedParts.length === 0 && useTemplateStore.getState().template.js === after.js;
    let stale = false; try { session.execute(request); } catch { stale = true; }
    const rev = session.version();
    let atomic = false;
    try { session.execute({ documentId: session.documentId, expected: rev, transactionId: 'bad', operations: [operation, { ...operation, selector: '#missing' }] }); } catch { atomic = useTemplateStore.getState().template.js === after.js; }
    session.begin();
    useTemplateStore.getState().setCss(before.css + '\n/* external edit */');
    let external = false; try { session.preview([operation]); } catch { external = true; }
    return { oneHistory, undo, redo, transient, cancelled, stale, atomic, external };
  });
  expect(result).toEqual({ oneHistory: true, undo: true, redo: true, transient: true, cancelled: true, stale: true, atomic: true, external: true });
});

test('same-path asset bytes rebuild; key-only edits keep frame; old protocol identities refuse', async ({ page }) => {
  await seed(page, true);
  const initialGeneration = await page.getByTestId('foundation-canvas').getAttribute('data-generation');
  await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { parseAnimData } = await import('/src/blocks/animData.ts');
    const s = activeEditorSession(); const data = parseAnimData(s.port.read().js)!;
    const selector = Object.keys(data.steps[0].layers).find(selector => data.steps[0].layers[selector].x)!;
    s.execute({ documentId: s.documentId, expected: s.version(), transactionId: 'live-key',
      operations: [{ kind: 'key.set', selector, step: 0, property: 'x', time: 0, value: -150 }] });
  });
  await ready(page);
  expect(await page.getByTestId('foundation-canvas').getAttribute('data-generation')).toBe(initialGeneration);
  for (const colour of ['red', 'blue']) {
    const before = await page.getByTestId('foundation-canvas').getAttribute('data-generation');
    await page.evaluate(async colour => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const s = useTemplateStore.getState();
      const data = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="' + colour + '"/></svg>');
      s.applyTemplate({ ...s.template, html: s.template.html.includes('id="byte-test"') ? s.template.html : s.template.html.replace('</body>', '<img id="byte-test" src="assets/same.svg" style="position:absolute;left:20px;top:20px;width:200px"></body>'),
        assets: [{ path: 'assets/same.svg', data }] });
    }, colour);
    await expect.poll(() => page.getByTestId('foundation-canvas').getAttribute('data-generation')).not.toBe(before);
    await ready(page);
    expect(await (await frame(page)).locator('#byte-test').evaluate(async element => {
      const img = element as HTMLImageElement; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
      const context = canvas.getContext('2d')!; context.drawImage(img, 0, 0, 1, 1);
      return [...context.getImageData(0, 0, 1, 1).data];
    })).toEqual(colour === 'red' ? [255, 0, 0, 255] : [0, 0, 255, 255]);
  }
  const results = await page.evaluate(async () => {
    const { acceptsReply, EDITOR_MESSAGE } = await import('/src/components/editorFoundation/protocol.ts');
    const win = document.querySelector<HTMLIFrameElement>('iframe[title="Foundation graphic preview"]')!.contentWindow!;
    const expected = { type: EDITOR_MESSAGE, documentId: 'one', revision: { source: 4, assets: 3 }, generation: 5, requestId: 9 };
    const reply = { ...expected, kind: 'pose' as const };
    return [
      acceptsReply(reply, win, win, expected),
      acceptsReply(reply, window, win, expected),
      acceptsReply({ ...reply, documentId: 'two' }, win, win, expected),
      acceptsReply({ ...reply, generation: 4 }, win, win, expected),
      acceptsReply({ ...reply, requestId: 8 }, win, win, expected),
      acceptsReply({ ...reply, revision: { source: 3, assets: 3 } }, win, win, expected),
      acceptsReply({ ...reply, revision: { source: 4, assets: 2 } }, win, win, expected),
    ];
  });
  expect(results).toEqual([true, false, false, false, false, false, false]);
});

test('ruler units, frame nudge and cancellation use effective time without source edits', async ({ page }) => {
  await seed(page, true);
  const ruler = page.getByRole('slider', { name: 'Playhead' });
  await ruler.focus();
  await page.keyboard.press('Home');
  for (let i = 0; i < 25; i++) await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('foundation-clock')).toHaveText('1.00 s');
  await page.getByLabel('Ruler units').selectOption('frames');
  await expect(page.getByTestId('foundation-clock')).toHaveText('25 f');
  const box = (await ruler.boundingBox())!;
  await page.mouse.move(box.x + box.width * .5, box.y + 20);
  await page.mouse.down(); await page.mouse.move(box.x + box.width * .7, box.y + 20);
  await page.keyboard.press('Escape'); await page.mouse.up();
  await expect(page.getByTestId('foundation-clock')).toHaveText('25 f');
});

test('F4 records input-to-presented-pose latency and responsive geometry', async ({ page }) => {
  await seed(page, true);
  const results: unknown[] = [];
  for (const viewport of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }]) {
    await page.setViewportSize(viewport);
    await page.evaluate(async () => (await import('/src/components/editorFoundation/Canvas.tsx')).foundationDiagnostics()!.resetMetrics());
    for (let i = 0; i < 30; i++) {
      await page.locator('.ef-track[data-selector="#f' + (i % 5) + '"] .ef-layer').click();
      await seek(page, i % 2 ? .8 : 1.6);
    }
    const metrics = await page.evaluate(async () => (await import('/src/components/editorFoundation/Canvas.tsx')).foundationDiagnostics()!.metrics);
    expect(metrics.samples.length).toBeGreaterThan(25);
    expect(metrics.samples.every(s => Number.isFinite(s.ms) && s.ms >= 0)).toBe(true);
    results.push({ viewport, metrics });
    await shot(page, 'f4-' + viewport.width);
  }
  if (evidence) writeFileSync(evidence + '/latency-dev.json', JSON.stringify(results, null, 2));
});



test('zero-time key apply and undo paint the canonical values without rebuilding', async ({ page }) => {
  await seed(page, true);
  await page.getByRole('slider', { name: 'Playhead' }).focus();
  await page.keyboard.press('Home');
  await seek(page, 0);
  await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const session = activeEditorSession();
    session.execute({ documentId: session.documentId, expected: session.version(), transactionId: 'pixel-key',
      operations: [{ kind: 'key.set', selector: '#f0', step: 0, property: 'x', time: 0, value: -150 }] });
  });
  const preview = await frame(page);
  await expect.poll(() => preview.locator('#f0').evaluate(el =>
    (window as unknown as { gsap: { getProperty(el: Element, prop: string): number } }).gsap.getProperty(el, 'x'))).toBe(-150);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(() => preview.locator('#f0').evaluate(el =>
    (window as unknown as { gsap: { getProperty(el: Element, prop: string): number } }).gsap.getProperty(el, 'x'))).toBe(0);
});




test('25/30 fps and half/normal/double speed use one effective clock and preserve stored keys', async ({ page }) => {
  await seed(page, true);
  for (const fps of [25, 30]) for (const speed of [.5, 1, 2]) {
    const source = await page.evaluate(async ({ fps, speed }) => {
      const { useTemplateStore } = await import('/src/store/templateStore.ts');
      const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
      const s = useTemplateStore.getState(); const data = parseAnimData(s.template.js)!;
      data.speed = speed;
      s.applyTemplate({ ...s.template, fps, js: spliceAnimData(s.template.js, data) });
      return useTemplateStore.getState().template.js;
    }, { fps, speed });
    await ready(page);
    await page.getByLabel('Ruler units').selectOption('seconds');
    const ruler = page.getByRole('slider', { name: 'Playhead' });
    await ruler.focus(); await page.keyboard.press('Home');
    for (let i = 0; i < fps; i++) await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('foundation-clock')).toHaveText('1.00 s');
    await page.getByLabel('Ruler units').selectOption('frames');
    await expect(page.getByTestId('foundation-clock')).toHaveText(fps + ' f');
    await ruler.focus(); await page.keyboard.press('ArrowRight');
    await expect(page.getByTestId('foundation-clock')).toHaveText((fps + 1) + ' f');
    expect(Number(await ruler.getAttribute('aria-valuenow'))).toBeCloseTo(1 + 1 / fps, 8);
    const out = await page.locator('.ef-out').evaluate(el => parseFloat((el as HTMLElement).style.left));
    expect(out).toBeCloseTo((3 / speed) / Math.max(2, 3.5 / speed * 1.15) * 100, 4);
    expect(await page.evaluate(async () => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template.js)).toBe(source);
  }
});

test('confirmed save and reopen retain source, fields and assets after registry edits', async ({ page }) => {
  await seed(page, true);
  const saved = await page.evaluate(async () => {
    const { activeEditorSession } = await import('/src/components/editorFoundation/documentAdapter.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { saveGraphicAs } = await import('/src/store/saveActions.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const s = activeEditorSession();
    s.execute({ documentId: s.documentId, expected: s.version(), transactionId: 'save-edit',
      operations: [{ kind: 'key.set', selector: '#f0', step: 0, property: 'x', time: 0, value: -75 }] });
    const result = await saveGraphicAs('R1 foundation saved', { kind: 'standalone' });
    if (!result.ok) throw new Error(result.error!);
    const error = await commitDurableWrites(); if (error) throw new Error(error);
    return { template: useTemplateStore.getState().template, id: useTemplateStore.getState().saved.graphicId };
  });
  await page.reload(); await ready(page);
  const reopened = await page.evaluate(async id => {
    const { graphicById } = await import('/src/model/library.ts');
    const { openGraphicDoc } = await import('/src/store/saveActions.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    openGraphicDoc(graphicById(id!)!);
    return useTemplateStore.getState().template;
  }, saved.id);
  expect(reopened).toEqual(saved.template);
  await ready(page);
});

test('scrub suppresses calls at zero and mid-step; broken source reports failure and recovers', async ({ page }) => {
  await seed(page, true);
  // The new source rebuilds the preview frame, and React renders it a tick after the store
  // write, so `ready` alone can pass on the OLD frame's settled state and the frame is then
  // replaced under the effect-count read below (CI, 2026-09-21). Wait for the rebuild first.
  const generation = await page.getByTestId('foundation-canvas').getAttribute('data-generation');
  const original = await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { parseAnimData, spliceAnimData } = await import('/src/blocks/animData.ts');
    const s = useTemplateStore.getState(); const data = parseAnimData(s.template.js)!;
    data.steps[0].calls = [{ time: 0, call: 'countSideEffect' }, { time: .5, call: 'countSideEffect' }];
    const template = { ...s.template, js: 'window.effectCount=0;function countSideEffect(){window.effectCount++;}\n' + spliceAnimData(s.template.js, data) };
    s.applyTemplate(template); return template;
  });
  await expect.poll(() => page.getByTestId('foundation-canvas').getAttribute('data-generation')).not.toBe(generation);
  await ready(page);
  for (const time of [0, 1, .2, 3.5, 0]) await seek(page, time);
  expect(await (await frame(page)).evaluate(() => (window as unknown as { effectCount: number }).effectCount)).toBe(0);
  await page.evaluate(async original => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().applyTemplate({ ...original, js: 'throw new Error("R1 deliberate failure");' });
  }, original);
  await expect(page.locator('.ef-stage-error')).toContainText('R1 deliberate failure');
  await page.evaluate(async original => (await import('/src/store/templateStore.ts')).useTemplateStore.getState().applyTemplate(original), original);
  await ready(page);
});

test('document ports isolate transactions and refuse unknown source data without loss', async ({ page }) => {
  await seed(page, true);
  const result = await page.evaluate(async () => {
    const { EditorSession } = await import('/src/components/editorFoundation/session.ts');
    const { applyOperations } = await import('/src/components/editorFoundation/operations.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const source = useTemplateStore.getState().template;
    function port() {
      let current = source;
      const history: typeof source[] = [];
      const future: typeof source[] = [];
      return { read: () => current, view: () => ({ time: 0, selectedParts: [] }),
        restore: () => {}, apply: (t: typeof source) => { history.push(current); current = t; },
        undo: () => { future.push(current); current = history.pop()!; },
        redo: () => { history.push(current); current = future.pop()!; },
        subscribe: () => () => {} };
    }
    const a = new EditorSession('a', port()); const b = new EditorSession('b', port());
    const operations = [{ kind: 'key.set' as const, selector: '#f0', step: 0, property: 'x', time: 0, value: -32 }];
    const request = { documentId: 'a', expected: a.version(), transactionId: 'isolated', operations };
    a.execute(request);
    const isolated = b.port.read() === source && !b.canUndo();
    let wrongDocument = false; try { b.execute(request); } catch { wrongDocument = true; }
    a.undo(); const restored = a.port.read() === source;
    let unknown = false;
    const extra = { ...source, js: source.js.replace('"version": 2', '"version": 2, "futureData": {"keep": true}') };
    if (extra.js === source.js) throw new Error('Unknown-data fixture failed to modify source');
    try { applyOperations(extra, operations); } catch { unknown = extra.js.includes('futureData'); }
    const expected = a.version();
    a.dispose(); b.dispose();
    let retired = false;
    try { a.execute({ ...request, transactionId: 'retired', expected }); } catch { retired = true; }
    return { isolated, wrongDocument, restored, unknown, retired };
  });
  expect(result).toEqual({ isolated: true, wrongDocument: true, restored: true, unknown: true, retired: true });
});
