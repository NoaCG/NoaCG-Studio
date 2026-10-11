// covers: src/components/editorFoundation/{commands,commandAdapter,session,documentAdapter,PreviewController,EditorFoundation}.ts*
import { test, expect } from '@playwright/test';
import Ajv2020 from 'ajv/dist/2020.js';

test('discovery schemas reject malformed, extra, unbounded and unqualified arguments atomically', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const results = await page.evaluate(async () => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const { discoverCommands } = await import('/src/components/editorFoundation/commands.ts');
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
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
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
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const c = activeEditorCommands(), i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message);
    const result = c.apply({ expected: i.expected, transactionId: crypto.randomUUID(), commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 50, y: 30, width: 90, height: 90 } } }] });
    (window as unknown as { priorCommands: typeof c }).priorCommands = c;
    await new Promise(r => setTimeout(r)); return result;
  });
  expect(result.ok).toBe(true); if (result.ok) { expect(result.state).toBe('committed'); expect(result.preview.state).not.toBe('ready'); expect(result.history.undo).toBe(1); expect(result.changedIds).toHaveLength(1); }
  await expect.poll(() => page.evaluate(async () => { const r = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect(); return r.ok ? r.preview.state : r.refusal.code; })).toBe('ready');
  const acknowledged = await page.evaluate(async () => (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect());
  if (acknowledged.ok && acknowledged.preview.state === 'ready') { expect(acknowledged.preview.revision).toEqual(acknowledged.expected.revision); expect(acknowledged.preview.time).toBe(acknowledged.view.time); expect(acknowledged.preview.drawingSpace).not.toBeNull(); }
  await page.evaluate(() => { location.hash = '#/home'; }); await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  const unmounted = await page.evaluate(() => (window as unknown as { priorCommands: { inspect(): { ok: boolean; refusal?: { code: string } } } }).priorCommands.inspect());
  expect(unmounted.ok).toBe(false); expect(unmounted.refusal?.code).toBe('session_closed');
  // Real navigation destroys the old realm; document reopen gives a fresh instance.
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.reload(); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const reopened = await page.evaluate(async () => (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect());
  expect(reopened.ok).toBe(true); if (reopened.ok && acknowledged.ok) expect(reopened.expected.sessionId).not.toBe(acknowledged.expected.sessionId);
});


test('capability inspection preserves unsupported styled, unnamed and ambiguous source', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async () => {
    const { activeEditorCommands } = await import('/src/components/editorFoundation/commandAdapter.ts');
    const { EditorCommands } = await import('/src/components/editorFoundation/commands.ts');
    const { EditorSession } = await import('/src/components/editorFoundation/session.ts');
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
    const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands();
    const inspect = () => { const i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message); return i; };
    const created = c.apply({ expected: inspect().expected, transactionId: 'create-base-target', commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
    if (!created.ok) throw new Error(created.refusal.message);
    const targetId = created.changedIds[0];
    const moved = c.apply({ expected: inspect().expected, transactionId: 'move-base-target', commands: [{ id: 'base.set', args: { targetId, values: { x: 70, y: 30 } } }] });
    await new Promise(r => setTimeout(r)); return { targetId, moved };
  });
  expect(result.moved.ok).toBe(true); if (result.moved.ok) { expect(result.moved.history.undo).toBe(2); expect(result.moved.changedIds).toEqual([result.targetId]); expect(result.moved.patches.map(p => p.file)).toEqual(['css']); }
  await expect.poll(() => page.evaluate(async () => { const i = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect(); return i.ok ? i.preview.state : 'refused'; })).toBe('ready');
  const frame = (await (await page.locator('iframe[title="Foundation graphic preview"]').elementHandle())!.contentFrame())!;
  await expect.poll(() => frame.locator('#' + result.targetId).evaluate(el => ({ x: getComputedStyle(el).left, y: getComputedStyle(el).top }))).toEqual({ x: '70px', y: '30px' });
});
test('remounting the editor refuses a request from the closed command binding', async ({ page }) => {
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const prior = await page.evaluate(async () => { const i = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().inspect(); if (!i.ok) throw new Error(i.refusal.message); return i.expected; });
  await page.evaluate(() => { location.hash = '#/home'; }); await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/editor-foundation'; }); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const result = await page.evaluate(async priorSessionId => {
    const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(), i = c.inspect(); if (!i.ok) throw new Error(i.refusal.message);
    // Current revision/view isolate the lifetime guard from other stale-context guards.
    const before = JSON.stringify(c.session.port.read());
    const refusal = c.apply({ expected: { ...i.expected, sessionId: priorSessionId }, transactionId: 'prior-binding', commands: [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 40, y: 20, width: 80, height: 90 } } }] });
    await new Promise(r => setTimeout(r)); return { refusal, unchanged: before === JSON.stringify(c.session.port.read()) };
  }, prior.sessionId);
  expect(result.refusal.ok).toBe(false); if (!result.refusal.ok) expect(result.refusal.refusal.code).toBe('stale_context'); expect(result.unchanged).toBe(true);
});
