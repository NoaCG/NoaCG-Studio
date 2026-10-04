// covers: src/components/{SoundsControls.tsx,sounds.css,AssetsPanel.tsx}, src/components/home/GraphicControlPage.tsx
// covers: src/components/editorFoundation/{EditorFoundation.tsx,operations.ts}, src/blocks/{soundEdit.ts,editorImages.ts}
// covers: src/assets/{graphicSound.ts,fileImport.ts,assetUtils.ts}
// focus
import { test, expect, type Page } from '@playwright/test';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// Program-route proof assumes receiving-host permission, as the playback suite does.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

function wave(bits = 16, channels = 1, seconds = .5) {
  const frames = Math.round(48000 * seconds), sampleBytes = bits / 8, blockBytes = channels * sampleBytes;
  const data = Buffer.alloc(44 + frames * blockBytes);
  data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVE', 8); data.write('fmt ', 12);
  data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(channels, 22);
  data.writeUInt32LE(48000, 24); data.writeUInt32LE(48000 * blockBytes, 28); data.writeUInt16LE(blockBytes, 32); data.writeUInt16LE(bits, 34);
  data.write('data', 36); data.writeUInt32LE(data.length - 44, 40);
  for (let i = 0; i < frames; i++) for (let channel = 0; channel < channels; channel++) data.writeIntLE(Math.round(Math.sin(i * 2 * Math.PI * 1000 / 48000) * 8000 * (bits === 24 ? 256 : 1)), 44 + i * blockBytes + channel * sampleBytes, sampleBytes);
  return data;
}
async function seed(page: Page, editor = false) {
  await page.goto(editor ? '/app?editor=foundation#/home' : '/app#/home'); await awaitDurableReady(page);
  const id = await page.evaluate(async editor => {
    const { createBlankTemplate } = await import('/src/templates/blank.ts');
    const { runtimeJs } = await import('/src/templates/shared/base.ts');
    const { emitAnimRegion } = await import('/src/templates/shared/animRuntime.ts');
    const { replaceDefinitionInHtml } = await import('/src/model/spxDefinition.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { commitDurableWrites } = await import('/src/model/durableStore.ts');
    const t = createBlankTemplate(); t.name = 'Sound controls proof';
    t.html = replaceDefinitionInHtml('<!doctype html><html><head></head><body><div id="box" data-gfx="Box">SOUND</div></body></html>', t.settings, []);
    t.css = '#box { opacity: 0; width: 400px; height: 150px; font-size: 48px; color: white; background: #333; }';
    const step = (name: string) => ({ name, duration: .1, ease: 'none', layers: { '#box': { opacity: [{ time: 0, value: 1 }] } } });
    t.js = runtimeJs(t.name, emitAnimRegion({ version: 2, root: '#box', speed: 1, steps: [step('In'), step('Reveal'), step('Out')],
      machine: { groups: [{ id: 'main', initial: 'off', defaultPath: ['question', 'answer', 'out'], states: [{ id: 'off' }, { id: 'question' }, { id: 'answer' }, { id: 'out' }, { id: 'running' }, { id: 'paused' }],
        transitions: [{ from: 'question', to: 'answer', trigger: 'operator', event: 'correct' }, { from: 'question', to: 'running', trigger: 'operator', event: 'start' }, { from: 'running', to: 'paused', trigger: 'operator', event: 'pause' }] }] } }));
    const made = createGraphic(t, { name: t.name }); if (!made.doc || made.error) throw Error(made.error);
    if (editor) {
      const store = (await import('/src/store/templateStore.ts')).useTemplateStore.getState();
      store.applyTemplate(t, { resetSampleData: true }); store.setSaved({ graphicId: made.doc.id, dirty: false, status: 'idle' });
    }
    const failure = await commitDurableWrites(); if (failure) throw Error(failure);
    (window as unknown as { soundGraphicId: string }).soundGraphicId = made.doc.id;
    (await import('/src/app/router.ts')).useRouter.getState().navigate(editor ? { view: 'editor-foundation' } : { view: 'control', id: made.doc.id });
    return made.doc.id;
  }, editor);
  if (editor) { await expect(page.getByTestId('editor-foundation')).toBeVisible(); await page.getByRole('button', { name: /^Project/ }).click(); }
  await page.getByTestId('sound-controls').locator('summary').click();
  return id;
}
async function saved(page: Page, id: string) {
  return page.evaluate(async id => {
    const { graphicById } = await import('/src/model/library.ts'), { parseAnimData } = await import('/src/blocks/animData.ts');
    const template = graphicById(id)!.template; return { template, data: parseAnimData(template.js)! };
  }, id);
}
async function working(page: Page) {
  return page.evaluate(async () => {
    const template = (await import('/src/store/templateStore.ts')).useTemplateStore.getState().template;
    return { template, data: (await import('/src/blocks/animData.ts')).parseAnimData(template.js)! };
  });
}
test('saved controls attach disabled, persist enable and level, audition explicitly and keep preview silent', async ({ page }) => {
  await page.addInitScript(() => {
    const raw = AudioBufferSourceNode.prototype.start;
    (window as unknown as { soundStarts: number }).soundStarts = 0;
    AudioBufferSourceNode.prototype.start = function (...args) { (window as unknown as { soundStarts: number }).soundStarts++; return raw.apply(this, args); };
  });
  const id = await seed(page), controls = page.getByTestId('sound-controls');
  await controls.getByLabel('Upload sound file').setInputFiles({ name: 'sting.wav', mimeType: 'audio/wav', buffer: wave() });
  await expect.poll(async () => (await saved(page, id)).data.steps[0].sound?.enabled).toBe(false);
  const attachment = (await saved(page, id)).data.steps[0].sound!;
  await controls.getByLabel('Enabled', { exact: true }).check();
  await expect.poll(async () => (await saved(page, id)).data.steps[0].sound?.enabled).toBe(true);
  await controls.getByLabel('Sound level').fill('-12'); await controls.getByLabel('Sound level').blur();
  await expect.poll(async () => (await saved(page, id)).data.steps[0].sound?.levelDb).toBe(-12);
  await expect(controls.getByRole('button', { name: 'Audition sound' })).toBeEnabled();
  expect(await page.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts)).toBe(0);
  await controls.getByRole('button', { name: 'Audition sound' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts)).toBe(1);
  await expect(controls.getByRole('button', { name: 'Audition sound' })).toBeVisible();
  for (const frame of page.frames().slice(1)) expect(await frame.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts ?? 0)).toBe(0);
  await settleDurableWrites(page); await page.reload(); await controls.locator('summary').click();
  await expect(controls.getByLabel('Enabled', { exact: true })).toBeChecked(); await expect(controls.getByLabel('Sound level')).toHaveValue('-12');
  expect((await saved(page, id)).data.steps[0].sound!.id).toBe(attachment.id);
  await page.evaluate(async id => {
    const { graphicById } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow } = await import('/src/model/shows.ts');
    const { buildOutputPayload } = await import('/src/control/hostedControl.ts');
    const { createOutputStage } = await import('/src/output/stage.ts');
    const graphic = graphicById(id)!, show = createShowNamed('Sound stage proof');
    const added = addGraphicToShow(show.id, graphic.template, { graphicId: id });
    const payload = await buildOutputPayload(added.shows.find(s => s.id === show.id)!);
    const monitorRoot = document.createElement('div'), programRoot = document.createElement('div');
    monitorRoot.id = 'sound-monitor-root'; programRoot.id = 'sound-program-root'; document.body.append(monitorRoot, programRoot);
    const monitor = createOutputStage(monitorRoot, payload), program = createOutputStage(programRoot, payload, { sound: 'program' });
    await Promise.all([monitor.whenLoaded(), program.whenLoaded()]);
    const warm = await Promise.all([monitor.warm(monitor.graphics[0], null), program.warm(program.graphics[0], null)]);
    if (warm.some(result => !result || result.error)) throw Error('Output did not prepare its sound.');
    const state = window as unknown as { soundStageApply(): void; soundStageDestroy(): void; soundStageClosed: string | null };
    state.soundStageApply = () => { monitor.apply(monitor.graphics[0], { t: 'play' }); program.apply(program.graphics[0], { t: 'play' }); };
    state.soundStageDestroy = () => { monitor.destroy(); program.destroy(); monitorRoot.remove(); programRoot.remove(); };
    state.soundStageClosed = null;
    const source = programRoot.querySelector('iframe')!.contentWindow;
    const closed = (event: MessageEvent) => { if (event.source === source && event.data?.t === 'sound-stage-closed') { state.soundStageClosed = event.data.state; window.removeEventListener('message', closed); } };
    window.addEventListener('message', closed);
  }, id);
  // Inspect each opaque-origin frame through Playwright, preserving the production sandbox.
  const monitor = (await (await page.locator('#sound-monitor-root iframe').elementHandle())!.contentFrame())!;
  const program = (await (await page.locator('#sound-program-root iframe').elementHandle())!.contentFrame())!;
  await program.evaluate(() => {
    const context = (window as unknown as { noacgSoundContext: AudioContext }).noacgSoundContext, close = context.close.bind(context);
    context.close = () => { const closing = close(); parent.postMessage({ t: 'sound-stage-closed', state: context.state }, '*'); return closing; };
  });
  await page.evaluate(() => (window as unknown as { soundStageApply(): void }).soundStageApply());
  await expect.poll(async () => Promise.all([monitor, program].map(frame => frame.evaluate(() => (window as unknown as { noacgStepsPlayed: number }).noacgStepsPlayed)))).toEqual([1, 1]);
  expect(await monitor.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts)).toBe(0);
  expect(await program.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts)).toBe(1);
  expect(await program.evaluate(() => Object.values((window as unknown as { noacgSoundPlaying: Record<string, { gain: GainNode }> }).noacgSoundPlaying)[0].gain.gain.value)).toBeCloseTo(Math.pow(10, -12 / 20), 5);
  await page.evaluate(() => (window as unknown as { soundStageDestroy(): void }).soundStageDestroy());
  await expect.poll(() => page.evaluate(() => (window as unknown as { soundStageClosed: string | null }).soundStageClosed)).toBe('closed');
  await controls.getByLabel('Enabled', { exact: true }).uncheck();
  await controls.getByRole('button', { name: 'Remove attachment' }).click();
  await expect.poll(async () => (await saved(page, id)).data.steps[0].sound).toBeUndefined();
  expect((await saved(page, id)).template.assets).toHaveLength(1);
});
test('editor attachment and bytes undo together; rename retains binding; quiz edge and countdown state share controls', async ({ page }, testInfo) => {
  await seed(page, true); const controls = page.getByTestId('sound-controls');
  await controls.getByLabel('Upload sound file').setInputFiles({ name: 'tick.wav', mimeType: 'audio/wav', buffer: wave() });
  await expect.poll(async () => (await working(page)).data.steps[0].sound?.asset).toBe('sounds/tick.wav');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await working(page)).template.assets).toHaveLength(0); expect((await working(page)).data.steps[0].sound).toBeUndefined();
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await working(page)).template.assets).toHaveLength(1);
  await page.evaluate(async () => {
    const session = (await import('/src/components/editorFoundation/documentAdapter.ts')).activeEditorSession();
    session.execute({ documentId: session.documentId, expected: session.version(), transactionId: crypto.randomUUID(), operations: [{ kind: 'asset.move', from: 'sounds/tick.wav', to: 'sounds/renamed.wav' }] });
  });
  expect((await working(page)).data.steps[0].sound!.asset).toBe('sounds/renamed.wav');
  await controls.getByLabel('Sound move').selectOption({ label: 'main / correct: question → answer' });
  await controls.getByLabel('Sound asset').selectOption('sounds/renamed.wav');
  await expect(controls.getByLabel('Sound playback')).toHaveValue('one-shot');
  await expect(controls.getByLabel('Sound playback').locator('option')).toHaveCount(1);
  await controls.getByLabel('Sound move').selectOption({ label: 'main / running' });
  await controls.getByLabel('Sound asset').selectOption('sounds/renamed.wav');
  await controls.getByLabel('Sound playback').selectOption('loop');
  await expect.poll(async () => (await working(page)).data.machine!.groups[0].states.find(s => s.id === 'running')!.timeline?.sound?.mode).toBe('loop');
  await controls.screenshot({ path: testInfo.outputPath('editor-sounds.png') });
  await controls.getByLabel('Sound move').selectOption({ label: 'main / start: question → running' });
  await expect(controls.getByLabel('Sound asset')).toBeDisabled();
});
test('bad or oversized audio never changes the saved graphic', async ({ page }) => {
  const id = await seed(page), before = await saved(page, id), controls = page.getByTestId('sound-controls');
  await controls.getByLabel('Upload sound file').setInputFiles({ name: 'broken.wav', mimeType: 'audio/wav', buffer: Buffer.from('invalid') });
  await expect(controls.getByRole('alert')).toContainText('could not decode'); expect(await saved(page, id)).toEqual(before);
  await controls.getByLabel('Upload sound file').setInputFiles({ name: 'large.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(20 * 1024 * 1024 + 1) });
  await expect(controls.getByRole('alert')).toContainText('20 MiB'); expect(await saved(page, id)).toEqual(before);
});

test('professional 24-bit stereo WAV above the former size limit decodes and attaches intact', async ({ page }) => {
  const id = await seed(page), controls = page.getByTestId('sound-controls'), bytes = wave(24, 2, 12);
  expect(bytes.length).toBeGreaterThan(3 * 1024 * 1024);
  await controls.getByLabel('Upload sound file').setInputFiles({ name: 'studio.wav', mimeType: 'audio/wav', buffer: bytes });
  await expect(controls.getByLabel('Enabled', { exact: true })).toBeVisible();
  await expect(controls.getByRole('alert')).toHaveCount(0);
  const decoded = await page.evaluate(async id => {
    const { graphicById } = await import('/src/model/library.ts'), { parseAnimData } = await import('/src/blocks/animData.ts');
    const template = graphicById(id)!.template, sound = parseAnimData(template.js)!.steps[0].sound!;
    const asset = template.assets.find(a => a.path === sound.asset)!;
    const context = new AudioContext({ sampleRate: 48000 });
    try { const buffer = await context.decodeAudioData(await (await fetch(asset.data as string)).arrayBuffer()); return { channels: buffer.numberOfChannels, rate: buffer.sampleRate, frames: buffer.length }; }
    finally { await context.close(); }
  }, id);
  expect(decoded).toEqual({ channels: 2, rate: 48000, frames: 576000 });
});
test('audition cancellation during decode and leaving the controls close audio without a late start', async ({ page }) => {
  await page.addInitScript(() => {
    const Real = AudioContext, contexts: AudioContext[] = [];
    window.AudioContext = class extends Real { constructor(options?: AudioContextOptions) { super(options); contexts.push(this); } };
    const state = window as unknown as { soundContexts: AudioContext[]; soundStarts: number };
    state.soundContexts = contexts; state.soundStarts = 0;
    const start = AudioBufferSourceNode.prototype.start;
    AudioBufferSourceNode.prototype.start = function (...args) { state.soundStarts++; return start.apply(this, args); };
  });
  await seed(page); const controls = page.getByTestId('sound-controls');
  await controls.getByLabel('Upload sound file').setInputFiles({ name: 'tick.wav', mimeType: 'audio/wav', buffer: wave() });
  await expect(controls.getByLabel('Sound playback')).toBeVisible(); await controls.getByLabel('Sound playback').selectOption('loop');
  await expect(controls.getByRole('button', { name: 'Audition sound' })).toBeEnabled();
  await page.evaluate(() => {
    const raw = AudioContext.prototype.decodeAudioData;
    AudioContext.prototype.decodeAudioData = function (bytes) {
      return raw.call(this, bytes).then(buffer => new Promise(resolve => {
        (window as unknown as { releaseSound: () => void }).releaseSound = () => { AudioContext.prototype.decodeAudioData = raw; resolve(buffer); };
      }));
    };
  });
  await controls.getByRole('button', { name: 'Audition sound' }).click();
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { releaseSound?: () => void }).releaseSound)).toBe('function');
  await controls.getByRole('button', { name: 'Stop audition' }).click();
  await page.evaluate(() => (window as unknown as { releaseSound: () => void }).releaseSound());
  await expect.poll(() => page.evaluate(() => (window as unknown as { soundContexts: AudioContext[] }).soundContexts.every(c => c.state === 'closed'))).toBe(true);
  expect(await page.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts)).toBe(0);
  await controls.getByRole('button', { name: 'Audition sound' }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { soundStarts: number }).soundStarts)).toBe(1);
  await page.evaluate(async () => (await import('/src/app/router.ts')).useRouter.getState().navigate({ view: 'home', section: 'graphics' }));
  await expect.poll(() => page.evaluate(() => (window as unknown as { soundContexts: AudioContext[] }).soundContexts.every(c => c.state === 'closed'))).toBe(true);
});
for (const size of [{ width: 1366, height: 768 }, { width: 390, height: 844 }]) test(`shared controls fit at ${size.width}px`, async ({ page }, testInfo) => {
  const errors: string[] = [], badResponses: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => { if (response.status() >= 400 && response.url().includes('127.0.0.1')) badResponses.push(response.url()); });
  await page.setViewportSize(size); await seed(page);
  const controls = page.getByTestId('sound-controls');
  await controls.getByLabel('Upload sound file').setInputFiles({ name: 'sting.wav', mimeType: 'audio/wav', buffer: wave() });
  await expect(controls.getByLabel('Sound level')).toBeVisible();
  await controls.getByLabel('Enabled', { exact: true }).check();
  await controls.getByLabel('Sound level').fill('-12'); await controls.getByLabel('Sound level').blur();
  await expect(controls.getByLabel('Sound level')).toHaveValue('-12');
  await controls.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(size.width);
  const box = await controls.boundingBox(); expect(box!.width).toBeLessThanOrEqual(size.width);
  await controls.screenshot({ path: testInfo.outputPath(`sounds-${size.width}.png`) });
  expect(errors).toEqual([]); expect(badResponses).toEqual([]);
});
