// covers: src/components/editorFoundation/{commands,commandAdapter,session,documentAdapter,PreviewController,EditorFoundation}.ts*
// covers: src/blocks/publicTextDefaults.ts
import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020.js';
import { bootstrapGraphic, openWorkingGraphicInEditor } from './_create';
import { writeFileSync } from 'node:fs';

test('discovery schemas reject malformed, extra, unbounded and unqualified arguments atomically', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const results = await page.evaluate(async () => {
    const { activeEditorCommands } = await __noacgImport('/src/components/editorFoundation/commandAdapter.ts');
    const { discoverCommands } = await __noacgImport('/src/components/editorFoundation/commands.ts');
    const c = activeEditorCommands(), discovery = discoverCommands(), s = c.session;
    const before = s.port.read(), state = s.commandState();
    const inspect = c.inspect(); if (!inspect.ok) throw new Error(inspect.refusal.message);
    const commands = [
      { id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 1, y: 2, width: 100, height: 100 } } },
    ];
    const cases = [null, {}, { expected: inspect.expected, transactionId: 'empty', commands: [] },
      { expected: inspect.expected, transactionId: 'large', commands: Array(101).fill(commands[0]) },
      ...[NaN, Infinity, -1, '100', 0].map(width => ({ expected: inspect.expected, transactionId: 'size', commands: [{ ...commands[0], args: { geometry: { shape: 'rectangle', x: 0, y: 0, width, height: 100 } } }] })),
      { expected: inspect.expected, transactionId: 'unknown', commands: [{ id: 'path.create', args: {} }] },
      { expected: inspect.expected, transactionId: 'extra', commands: [{ id: 'text.set', args: { targetId: 'f0', text: 'x', expose: true } }] },
      { expected: inspect.expected, transactionId: 'empty-base', commands: [{ id: 'base.set', args: { targetId: 'f0', values: {} } }] },
      { expected: inspect.expected, transactionId: 'mixed', commands: [...commands, { id: 'text.set', args: { targetId: 'missing', text: 'x' } }] },
      { expected: inspect.expected, transactionId: 'late-source-failure', commands: [...commands, { id: 'step.add', args: { time: 0 } }] },
      { expected: inspect.expected, transactionId: 'selector', commands: [{ id: 'text.set', args: { targetId: '#f0,body', text: 'x' } }] },
    ];
    const refusals = cases.map(input => c.apply(input));
    return { discovery, refusals, unchanged: JSON.stringify(before) === JSON.stringify(s.port.read()),
      history: s.commandState().history, initialHistory: state.history, bounded: c.inspect({ limit: 101 }), paged: c.inspect({ limit: 1 }) };
  });
  expect(results.discovery.commands.map(c => c.id)).toEqual(['layer.create', 'text.set', 'base.set', 'animation.key', 'step.add', 'out.set']);
  const ajv = new Ajv2020({ strict: false });
  for (const descriptor of results.discovery.commands) { ajv.compile(descriptor.inputSchema); expect(descriptor.inputSchema).toHaveProperty('additionalProperties', false); expect(descriptor.effect).toBe('reversible_source_edit'); }
  const baseSchema = ajv.compile(results.discovery.commands.find(c => c.id === 'base.set')!.inputSchema);
  expect(baseSchema({ targetId: 'f0', values: {} })).toBe(false); expect(baseSchema({ targetId: 'f0', values: { x: 10 } })).toBe(true);
  const creationSchema = ajv.compile(results.discovery.commands.find(c => c.id === 'layer.create')!.inputSchema);
  expect(creationSchema({ geometry: { shape: 'rectangle', x: 1, y: 2, width: 100, height: 100 } })).toBe(true);
  expect(creationSchema({ geometry: { shape: 'rectangle', x: 1, y: 2, width: '100', height: 100 } })).toBe(false);
  for (const result of results.refusals) { expect(result.ok).toBe(false); if (!result.ok) { expect(result.refusal.message.length).toBeGreaterThan(10); expect(result.refusal.recovery).toContain('Inspect'); } }
  expect(results.unchanged).toBe(true); expect(results.history).toEqual(results.initialHistory); expect(results.bounded.ok).toBe(false);
  expect(results.paged.ok).toBe(true); if (results.paged.ok) expect(results.paged.targets).toHaveLength(1);
});

test('revision, view, history, liveness and active-gesture guards retain source and drafts', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { activeEditorCommands } = await __noacgImport('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), s = c.session;
    const get = () => { const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); return i; };
    const command = { id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } };
    const apply = (expected = get().expected, transactionId = crypto.randomUUID()) => c.apply({ expected, transactionId, commands: [command] });
    const original = s.port.read(), initial = get().expected, oldView = s.port.view();
    s.port.restore({ ...oldView, selectedParts: ['#f0'] }); s.observeView();
    s.port.restore(oldView); s.observeView();
    const staleView = apply(initial), staleAsset = apply({ ...get().expected, revision: { ...get().expected.revision, assets: get().expected.revision.assets + 1 } });
    s.begin(); const expected = get().expected, busy = apply(expected), busyHistory = c.history({ expected, direction: 'undo' });
    s.preview([{ kind: 'layer.create', geometry: command.args.geometry } as never]); s.cancel();
    const cancelled = JSON.stringify(original) === JSON.stringify(s.port.read()) && s.commandState().history.undo === 0;
    const first = apply(), after = s.port.read(), oldHistory = get().expected;
    const second = apply(), staleHistory = c.history({ expected: { ...get().expected, historyHead: oldHistory.historyHead }, direction: 'undo' });
    const undone = c.history({ expected: get().expected, direction: 'undo' }), undoExact = JSON.stringify(after) === JSON.stringify(s.port.read());
    const redone = c.history({ expected: get().expected, direction: 'redo' });
    const transactionId = 'receipt-identity', committed = apply(get().expected, transactionId), duplicate = apply(get().expected, transactionId);
    c.close(); const closed = c.inspect(), closedApply = c.apply({ expected: initial, transactionId: 'closed', commands: [command] });
    return { staleView, staleAsset, busy, busyHistory, cancelled, first, second, staleHistory, undone, undoExact, redone, committed, duplicate, closed, closedApply };
  });
  for (const key of ['staleView', 'staleAsset', 'staleHistory'] as const) { const r = result[key]; expect(r.ok).toBe(false); if (!r.ok) expect(r.refusal.code).toBe('stale_context'); }
  for (const key of ['busy', 'busyHistory'] as const) { const r = result[key]; expect(r.ok).toBe(false); if (!r.ok) expect(r.refusal.code).toBe('busy'); }
  for (const key of ['closed', 'closedApply'] as const) { const r = result[key]; expect(r.ok).toBe(false); if (!r.ok) expect(r.refusal.code).toBe('session_closed'); }
  expect(result.cancelled).toBe(true); expect(result.undoExact).toBe(true); expect(result.undone.ok).toBe(true); expect(result.redone.ok).toBe(true);
  expect(result.committed.ok).toBe(true); expect(result.duplicate.ok).toBe(false); if (!result.duplicate.ok) expect(result.duplicate.refusal.code).toBe('duplicate_transaction');
});

test('commit receipt stays separate from matching preview readiness and route lifetime', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { activeEditorCommands } = await __noacgImport('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message);
    const result = c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 50, y: 30, width: 90, height: 90 } } }] });
    (window as unknown as { priorCommands: typeof c }).priorCommands = c;
    await new Promise(r => setTimeout(r)); return result;
  });
  expect(result.ok).toBe(true); if (result.ok) { expect(result.state).toBe('committed'); expect(result.preview.state).not.toBe('ready'); expect(result.history.undo).toBe(1); expect(result.changedIds).toHaveLength(1); }
  await expect.poll(() => page.evaluate(async () => { const r = (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect(); return r.ok ? r.preview.state : r.refusal.code; })).toBe('ready');
  const acknowledged = await page.evaluate(async () => (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect());
  if (acknowledged.ok && acknowledged.preview.state === 'ready') { expect(acknowledged.preview.revision).toEqual(acknowledged.expected.revision); expect(acknowledged.preview.time).toBe(acknowledged.view.time); expect(acknowledged.preview.drawingSpace).not.toBeNull(); }
  const sourceBeforeLeave = await page.evaluate(async () => (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template);
  await page.evaluate(() => { location.hash = '#/home'; });
  // Dirty navigation first resolves the document while the command binding is still live.
  // Save through the real decision, then retain the original unmount/reopen assertions.
  await expect(page.getByTestId('confirm-switch')).toBeVisible();
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await expect(page.getByTestId('home-page')).toHaveCount(0);
  const pending = await page.evaluate(async () => (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect());
  expect(pending.ok).toBe(true);
  if (pending.ok && acknowledged.ok) expect(pending.expected).toEqual(acknowledged.expected);
  expect(await page.evaluate(async () => (await __noacgImport('/src/store/templateStore.ts')).useTemplateStore.getState().template)).toEqual(sourceBeforeLeave);
  await page.getByTestId('switch-save').click();
  await expect(page.getByTestId('save-dialog')).toBeVisible();
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  const unmounted = await page.evaluate(() => (window as unknown as { priorCommands: { inspect(): { ok: boolean; refusal?: { code: string } } } }).priorCommands.inspect());
  expect(unmounted.ok).toBe(false); expect(unmounted.refusal?.code).toBe('session_closed');
  // Real navigation destroys the old realm; document reopen gives a fresh instance.
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const reopened = await page.evaluate(async () => (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect());
  expect(reopened.ok).toBe(true); if (reopened.ok && acknowledged.ok) expect(reopened.expected.sessionId).not.toBe(acknowledged.expected.sessionId);
});


test('capability inspection preserves unsupported styled, unnamed and ambiguous source', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { activeEditorCommands } = await __noacgImport('/src/components/editorFoundation/commandAdapter.ts');
    const { EditorCommands } = await __noacgImport('/src/components/editorFoundation/commands.ts');
    const { EditorSession } = await __noacgImport('/src/components/editorFoundation/session.ts');
    const seed = { ...activeEditorCommands().session.port.read() };
    seed.html = seed.html.replace(/(<(?:span|text)\b[^>]*id="f0"[^>]*>)[\s\S]*?(<\/(?:span|text)>)/, '$1<tspan>Keep styled runs</tspan>$2');
    let template = { ...seed, html: seed.html.replace('</body>', '<svg><text id="styled"><tspan>Keep styled runs</tspan></text><rect width="50" height="50"/><text id="ambiguous">A</text><text id="ambiguous">B</text></svg></body>') };
    // Catalog markup may be a fragment rather than contain body.
    if (!template.html.includes('id="ambiguous"')) template = { ...template, html: template.html + '<svg><text id="styled"><tspan>Keep styled runs</tspan></text><rect width="50" height="50"/><text id="ambiguous">A</text><text id="ambiguous">B</text></svg>' };
    const before = JSON.stringify(template); let view = { selectedParts: [] as string[], time: 0 }; let writes = 0;
    const session = new EditorSession('unsupported-fixture', { read: () => template, view: () => view,
      restore: v => { view = v; }, apply: t => { template = t; writes++; }, undo: () => {}, redo: () => {}, subscribe: () => () => {} });
    const c = new EditorCommands(session), i = c.inspect({ limit: 100 }); if (!i.ok) throw new Error(i.refusal.message);
    const refusals = ['f0', 'ambiguous', 'body:nth-of-type(1)'].map(targetId => c.apply({ expected: i.expected, transactionId: targetId,
      commands: [{ id: 'text.set', args: { targetId, text: 'Do not replace' } }] }));
    session.dispose(); const disposed = c.inspect();
    return { targets: i.targets, refusals, unchanged: before === JSON.stringify(template), writes, disposed };
  });
  expect(result.unchanged).toBe(true); expect(result.writes).toBe(0);
  for (const r of result.refusals) { expect(r.ok).toBe(false); if (!r.ok) expect(r.refusal.code).toBe('unsupported_target'); }
  expect(result.disposed.ok).toBe(false); if (!result.disposed.ok) expect(result.disposed.refusal.code).toBe('session_closed');
  const styled = result.targets.find(t => t.id === 'f0'); expect(styled).toBeDefined(); if (styled) expect(styled.capabilities['text.set'].supported).toBe(false);
});

test('qualified base position commits once and renders the authored parent pixels', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async () => {
    const c = (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands();
    const inspect = () => { const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); return i; };
    const created = c.apply({ expected: inspect().expected, transactionId: 'create-base-target', commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
    if (!created.ok) throw new Error(created.refusal.message);
    const targetId = created.changedIds[0];
    const moved = c.apply({ expected: inspect().expected, transactionId: 'move-base-target', commands: [{ id: 'base.set', args: { targetId, values: { x: 70, y: 30 } } }] });
    await new Promise(r => setTimeout(r)); return { targetId, moved };
  });
  expect(result.moved.ok).toBe(true); if (result.moved.ok) { expect(result.moved.history.undo).toBe(2); expect(result.moved.changedIds).toEqual([result.targetId]); expect(result.moved.patches.map(p => p.file)).toEqual(['css']); }
  await expect.poll(() => page.evaluate(async () => { const i = (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect(); return i.ok ? i.preview.state : 'refused'; })).toBe('ready');
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  await expect.poll(() => frame.locator('#' + result.targetId).evaluate(el => ({ x: getComputedStyle(el).left, y: getComputedStyle(el).top }))).toEqual({ x: '70px', y: '30px' });
});
test('remounting the editor refuses a request from the closed command binding', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const prior = await page.evaluate(async () => { const i = (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect(); if (!i.ok) throw new Error(i.refusal.message); return i.expected; });
  await page.evaluate(() => { location.hash = '#/home'; }); await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/editor-foundation'; }); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async priorSessionId => {
    const c = (await __noacgImport('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(), i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message);
    // Current revision/view isolate the lifetime guard from other stale-context guards.
    const before = JSON.stringify(c.session.port.read());
    const refusal = c.apply({ expected: { ...i.expected, sessionId: priorSessionId }, transactionId: 'prior-binding', commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
    await new Promise(r => setTimeout(r)); return { refusal, unchanged: before === JSON.stringify(c.session.port.read()) };
  }, prior.sessionId);
  expect(result.refusal.ok).toBe(false); if (!result.refusal.ok) expect(result.refusal.refusal.code).toBe('stale_context'); expect(result.unchanged).toBe(true);
});


test('public default guards preserve lossless source, atomicity, ID authority and bounded pages', async ({ page }, testInfo) => {
  await bootstrapGraphic(page, { name: 'Sticker Quiz' }); await openWorkingGraphicInEditor(page);
  const result = await page.evaluate(async () => {
    const { activeEditorCommands } = await __noacgImport('/src/components/editorFoundation/commandAdapter.ts');
    const { EditorCommands } = await __noacgImport('/src/components/editorFoundation/commands.ts');
    const { EditorSession } = await __noacgImport('/src/components/editorFoundation/session.ts');
    const { replaceDefinitionInHtml } = await __noacgImport('/src/model/spxDefinition.ts');
    const { reviewProposal } = await __noacgImport('/src/components/editorFoundation/proposals.ts');
    const original = structuredClone(activeEditorCommands().session.port.read());
    const field = (text: string, targetId = 'f1') => ({ id: 'text.set' as const, args: { targetId, text } });
    const fixture = (source: typeof original, documentId = 'public-default-fixture') => {
      let current = structuredClone(source), view = { selectedParts: [] as string[], time: 0, cue: 0, sampleData: { f1: 'Operator rehearsal' } };
      const past: typeof original[] = [], future: typeof original[] = []; let writes = 0;
      const s = new EditorSession(documentId, { read: () => current, view: () => view, restore: next => { view = next as typeof view; },
        apply: next => { past.push(current); current = next; future.length = 0; writes++; },
        undo: () => { future.push(current); current = past.pop()!; }, redo: () => { past.push(current); current = future.pop()!; }, subscribe: () => () => {} });
      const c = new EditorCommands(s, () => null, { select: selectedParts => { view = { ...view, selectedParts }; s.observeView(); },
        seek: time => { view = { ...view, time }; s.observeView(); }, afterWrite: () => {} });
      const snapshot = () => JSON.stringify({ source: current, view, state: s.commandState() });
      const inspect = () => { const i = c.inspect({ limit: 100 }); if (!i.ok) throw Error(i.refusal.message); return i; };
      const apply = (commands = [field('Helsinki')], expected = inspect().expected) => c.apply({ expected, transactionId: crypto.randomUUID(), commands });
      return { s, c, snapshot, inspect, apply, source: () => current, writes: () => writes, humanSource: (t: typeof original) => { current = t; } };
    };
    const withFields = (t: typeof original, fields: typeof original.fields) => ({ ...t, fields, html: replaceDefinitionInHtml(t.html, t.settings, fields) });
    const beforeAnswer = (t: typeof original, prefix: string) => {
      const html = t.html.replace('<span class="quiz-text" id="f1">', prefix + '<span class="quiz-text" id="f1">');
      if (html === t.html) throw Error('fixture has no original first-answer opening'); return { ...t, html };
    };
    const mutate = (html: string) => ({ ...structuredClone(original), html });
    const sourceDefinition = new DOMParser().parseFromString(original.html, 'text/html').getElementById('spx-template-definition')!.outerHTML;
    const exactOpen = '<script id="spx-template-definition" type="text/javascript">';
    const normalizedOpen = "<script id='spx-template-definition' type='text/javascript'>";
    const variants = [
      ['comment definition before normalized actual', mutate(original.html.replace(exactOpen, '<!-- ' + sourceDefinition + ' -->' + normalizedOpen))],
      ['inert definition before normalized actual', mutate(original.html.replace(exactOpen, '<template>' + sourceDefinition + '</template>' + normalizedOpen))],
      ['inert identical actual leaf alias', beforeAnswer(original, '<template><span class="quiz-text" id="f1">Paris</span></template>')],
      ['other bracket definition script', mutate(original.html.replace('</head>', '<script>window["SPXGCTemplateDefinition"] = {};</script></head>'))],
      ['duplicate DOM ID', beforeAnswer(original, '<span id="f1">Paris</span>')],
      ['duplicate field', withFields(original, [...original.fields, { ...original.fields.find(f => f.field === 'f1')! }])],
      ['extra definition', mutate(original.html.replace('</head>', new DOMParser().parseFromString(original.html, 'text/html').getElementById('spx-template-definition')!.outerHTML + '</head>'))],
      ['raw extra property', mutate(original.html.replace('"DataFields":', '"futureProperty": true, "DataFields":'))],
      ['model extra property', withFields(original, original.fields.map(f => f.field === 'f1' ? { ...f, futureProperty: true } : f))],
      ['foreign script expression', mutate(original.html.replace('window.SPXGCTemplateDefinition =', 'globalThis.__publicFieldTrap = true; window.SPXGCTemplateDefinition ='))],
      ['foreign definition attribute', mutate(original.html.replace('id="spx-template-definition"', 'data-foreign="true" id="spx-template-definition"'))],
      ['comment data-id alias', beforeAnswer(original, '<!-- <span data-id="f1">Paris</span> -->')],
      ['real data-id alias', beforeAnswer(original, '<span data-id="f1">Paris</span>')],
      ['quoted attribute alias', beforeAnswer(original, `<span title='id="f1"'>Paris</span>`)],
      ['single-quoted ID', mutate(original.html.replace('id="f1"', "id='f1'"))],
      ['duplicate raw attribute', mutate(original.html.replace('id="f1"', 'id="f1" id="f1"'))],
      ['foreign leaf attribute', mutate(original.html.replace('id="f1"', 'id="f1" data-extra="true"'))],
      ['styled run', mutate(original.html.replace('id="f1">Paris', 'id="f1"><em>Paris</em>'))],
      ['leaf comment', mutate(original.html.replace('id="f1">Paris', 'id="f1">Paris<!-- preserved comment -->'))],
      ['hidden input source', mutate(original.html.replace('class="quiz-text" id="f1"', 'class="quiz-text noacg-data-source" id="f1"'))],
      ['clock source', mutate(original.html.replace('class="quiz-text" id="f1"', 'class="quiz-text quiz-clock" id="f1"'))],
      ['credits source', mutate(original.html.replace('class="quiz-text" id="f1"', 'class="quiz-text quiz-credits" id="f1"'))],
      ['unqualified role binding', mutate(original.html.replace('id="f1"', 'id="f1" data-noacg-role="answer"'))],
      ['foreign display split', beforeAnswer(original, '<span id="f1_gfx">Paris</span>')],
      ['excluded static source', withFields(original, original.fields.filter(f => f.field !== 'f1'))],
      ['non-text field', withFields(original, original.fields.map(f => f.field === 'f1' ? { ...f, ftype: 'dropdown' as const } : f))],
      ['callback binding', withFields(original, original.fields.map(f => f.field === 'f1' ? { ...f, fcall: 'foreignUpdate()' } : f))],
    ] as const;
    const rejected = variants.map(([name, t]) => {
      const f = fixture(t), before = f.snapshot(), i = f.inspect();
      const prepared = f.c.prepare({ expected: i.expected, transactionId: 'prepare', commands: [field('Helsinki')] });
      const applied = f.apply([field('Human field', 'f0'), field('Helsinki')]);
      return { name, supported: i.targets.find(t => t.id === 'f1')?.capabilities['text.set'].supported ?? false,
        prepared, applied, unchanged: f.snapshot() === before, writes: f.writes() };
    });
    const literals = ['window.SPXGCTemplateDefinition = {', '<script>window["SPXGCTemplateDefinition"] = {};</script>'].map(text => {
      const f = fixture(original), initial = structuredClone(f.source()), first = f.apply([field(text)]);
      const after = structuredClone(f.source()), doc = new DOMParser().parseFromString(after.html, 'text/html');
      const payload = doc.getElementById('spx-template-definition')!.textContent!;
      const declaration = JSON.parse(payload.slice(payload.indexOf('{'), payload.lastIndexOf('}') + 1));
      const supported = f.inspect().targets.find(t => t.id === 'f1')?.capabilities['text.set'].supported ?? false;
      const second = f.apply([field('Helsinki after literal')]), final = structuredClone(f.source());
      const finalDoc = new DOMParser().parseFromString(final.html, 'text/html');
      return { text, first, node: doc.getElementById('f1')!.textContent, fields: after.fields, definition: declaration.DataFields,
        supported, second, secondNode: finalDoc.getElementById('f1')!.textContent,
        preserved: initial.js === after.js && initial.css === after.css && JSON.stringify(initial.assets) === JSON.stringify(after.assets),
        originalFields: initial.fields };
    });
    const f = fixture(original), before = f.snapshot(), base = structuredClone(f.source()), inspection = f.inspect();
    const noop = f.apply([field('Paris')]); const noopUnchanged = f.snapshot() === before;
    const viewBefore = f.snapshot(); const select = f.c.view({ expected: f.inspect().expected, action: 'select', targetIds: ['f1'] });
    const baseRefusal = f.c.prepare({ expected: f.inspect().expected, transactionId: 'base', commands: [{ id: 'base.set', args: { targetId: 'f1', values: { x: 10 } } }] });
    const keyRefusal = f.c.prepare({ expected: f.inspect().expected, transactionId: 'key', commands: [{ id: 'animation.key', args: { targetId: 'f1', step: 0, property: 'x', time: 0, value: 10, action: 'set' } }] });
    const fieldOnlyUnchanged = f.snapshot() === viewBefore;
    const text = '<Helsinki> & "quoted"\nSecond line', edited = f.apply([field(text)]), after = structuredClone(f.source());
    const doc = new DOMParser().parseFromString(after.html, 'text/html'), oldDoc = new DOMParser().parseFromString(base.html, 'text/html');
    const raw = doc.getElementById('spx-template-definition')!.textContent!;
    const definition = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
    const outside = (html: string, d: Document) => html.replace(d.getElementById('spx-template-definition')!.outerHTML, '<definition/>').replace(d.getElementById('f1')!.outerHTML, '<answer/>');
    const preserved = outside(base.html, oldDoc) === outside(after.html, doc) && base.js === after.js && base.css === after.css && JSON.stringify(base.assets) === JSON.stringify(after.assets);
    const undo = f.c.history({ expected: f.inspect().expected, direction: 'undo' }), exactUndo = JSON.stringify(f.source()) === JSON.stringify(base);
    const redo = f.c.history({ expected: f.inspect().expected, direction: 'redo' }), exactRedo = JSON.stringify(f.source()) === JSON.stringify(after);
    const duplicated = withFields(original, original.fields.map(field => field.field === 'f2' ? { ...field, title: 'Answer A', value: 'Paris' } : field));
    duplicated.html = duplicated.html.replace('id="f2">Athens', 'id="f2">Paris');
    const d = fixture(duplicated), distinct = d.inspect().targets.filter(t => t.id === 'f1' || t.id === 'f2');
    const distinctEdit = d.apply([field('Only B', 'f2')]);
    const extras = Array.from({ length: 60 }, (_, n) => ({ field: 'f' + (100 + n), ftype: 'textfield' as const, title: 'Extra ' + n, value: 'Value ' + n }));
    const large = withFields(original, [...original.fields, ...extras]); large.html = large.html.replace('</body>', extras.map(f => '<span id="' + f.field + '">' + f.value + '</span>').join('') + '</body>');
    const l = fixture(large), first = l.c.inspect({ limit: 50 }); if (!first.ok) throw Error(first.refusal.message);
    const second = l.c.inspect({ offset: first.nextOffset!, limit: 50 }); if (!second.ok) throw Error(second.refusal.message);
    const largeBefore = l.snapshot(); let outsideContext = false;
    try { reviewProposal(l.c, first, { output: { summary: 'Not inspected', commands: [field('Unseen', 'f159')] }, provider: 'vercel', model: 'fixture', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, attempts: [] }); }
    catch { outsideContext = true; }
    return { rejected, literals, trap: (globalThis as unknown as { __publicFieldTrap?: boolean }).__publicFieldTrap ?? false,
      baselineF0Count: inspection.targets.filter(t => t.id === 'f0').length, noop, noopUnchanged, select, baseRefusal, keyRefusal, fieldOnlyUnchanged,
      edited, text, node: doc.getElementById('f1')!.textContent, childCount: doc.getElementById('f1')!.children.length,
      fields: after.fields, originalFields: base.fields, definition: definition.DataFields, preserved, undo, redo, exactUndo, exactRedo,
      distinct, distinctEdit, distinctValues: d.source().fields.filter(t => t.field === 'f1' || t.field === 'f2'),
      first: first.targets.map(t => t.id), next: first.nextOffset, second: second.targets.map(t => t.id), end: second.nextOffset,
      total: f.inspect().targets.length + 60, outsideContext, outsideUnchanged: l.snapshot() === largeBefore };
  });
  const evidence = testInfo.outputPath('public-default-command-boundaries.json');
  writeFileSync(evidence, JSON.stringify(result, null, 2));
  await testInfo.attach('public-default-command-boundaries', { path: evidence, contentType: 'application/json' });
  for (const r of result.rejected) {
    expect(r.supported, r.name).toBe(false); expect(r.prepared.ok, r.name).toBe(false); expect(r.applied.ok, r.name).toBe(false);
    expect(r.unchanged, r.name).toBe(true); expect(r.writes, r.name).toBe(0);
  }
  for (const r of result.literals) {
    expect(r.first.ok, r.text).toBe(true); expect(r.node).toBe(r.text);
    expect(r.fields).toEqual(r.originalFields.map(f => f.field === 'f1' ? { ...f, value: r.text } : f));
    expect(r.definition).toEqual(r.fields); expect(r.preserved).toBe(true);
    expect(r.supported, r.text).toBe(true); expect(r.second.ok, r.text).toBe(true);
    expect(r.secondNode).toBe('Helsinki after literal');
  }
  expect(result.trap).toBe(false); expect(result.baselineF0Count).toBe(1);
  expect(result.noop.ok).toBe(true); expect(result.noopUnchanged).toBe(true);
  for (const r of [result.select, result.baseRefusal, result.keyRefusal]) expect(r.ok).toBe(false);
  expect(result.fieldOnlyUnchanged).toBe(true); expect(result.edited.ok).toBe(true);
  expect(result.node).toBe(result.text); expect(result.childCount).toBe(0); expect(result.preserved).toBe(true);
  expect(result.fields).toEqual(result.originalFields.map(f => f.field === 'f1' ? { ...f, value: result.text } : f));
  expect(result.definition).toEqual(result.fields); expect(result.undo.ok).toBe(true); expect(result.redo.ok).toBe(true);
  expect(result.exactUndo).toBe(true); expect(result.exactRedo).toBe(true);
  expect(result.distinct.map(t => t.id)).toEqual(['f1', 'f2']); expect(result.distinct.every(t => t.label === 'Answer A' && t.capabilities['text.set'].supported)).toBe(true);
  expect(result.distinctEdit.ok).toBe(true); expect(result.distinctValues.map(t => t.value)).toEqual(['Paris', 'Only B']);
  expect(result.first).toHaveLength(50); expect(result.next).toBe(50); expect(result.end).toBeNull();
  expect(result.first.length + result.second.length).toBe(result.total);
  const ids = [...result.first, ...result.second].filter(Boolean); expect(new Set(ids).size).toBe(ids.length);
  expect(result.outsideContext).toBe(true); expect(result.outsideUnchanged).toBe(true);
});
