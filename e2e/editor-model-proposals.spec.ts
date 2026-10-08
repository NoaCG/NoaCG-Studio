// covers: src/components/editorFoundation/{ProposalPanel,proposals,commands,EditorFoundation}.ts*, src/ai/editorProposals.ts
import { test, expect, type Page } from '@playwright/test';

const edit = { id: 'text.set', args: { targetId: 'f0', text: 'Reviewed default' } };
const response = (output: unknown) => ({ output, provider: 'openai', model: 'deterministic-test', usage: { inputTokens: 12, outputTokens: 6, totalTokens: 18 }, attempts: [] });
async function setup(page: Page) {
  await page.route('**/api/ai/config', route => route.fulfill({ json: { providers: [{ id: 'openai', available: true }], keyStorageAvailable: true } }));
  await page.goto('/app?editor=foundation#/editor-foundation');
  await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.evaluate(async () => {
    (await import('/src/ai/settings.ts')).saveAiSettings({ provider: 'openai', model: 'deterministic-test', configuredProviders: ['openai'] });
  });
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
}
async function propose(page: Page, prompt = 'Change the public text default to Reviewed default') {
  await page.getByRole('textbox', { name: 'Describe an edit', exact: true }).fill(prompt);
  const sent = page.waitForRequest('**/api/ai/generate');
  const accepted = await page.evaluate(async () => (await import('/src/ai/consent.ts')).noticeAcceptedLocally());
  await page.getByRole('button', { name: 'Propose edits', exact: true }).click();
  const consent = page.getByTestId('ai-consent-accept');
  // Fresh contexts require first-use consent; subsequent requests already accepted it.
  if (!accepted) await consent.click();
  await sent;
}
const snapshot = (page: Page) => page.evaluate(async () => {
  const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands();
  return { source: c.session.port.read(), view: c.session.port.view(), history: c.session.commandState().history };
});

test('grounded review does not write before Apply; one undo and acknowledged preview', async ({ page }) => {
  let request = {} as { request: { messages: { content: string }[]; structuredOutput: { schema: Record<string, unknown> } } };
  await page.route('**/api/ai/generate', route => { request = route.request().postDataJSON(); return route.fulfill({ json: response({ summary: 'Change the public default.', commands: [edit] }) }); });
  await setup(page); const before = await snapshot(page);
  await propose(page); await expect(page.getByRole('button', { name: 'Apply edits', exact: true })).toBeVisible();
  expect(await snapshot(page)).toEqual(before);
  const grounding = JSON.parse(request.request.messages[0].content).inspection;
  expect(grounding.catalog.commands).toHaveLength(6); expect(grounding.inspection.expected.sessionId).toBeTruthy();
  expect(grounding.inspection.targets.find((t: { id: string }) => t.id === 'f0').text.fieldId).toBe('f0');
  expect(grounding.inspection.history).toEqual(before.history); expect(request.request.structuredOutput.schema).toHaveProperty('additionalProperties', false);
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toContainText('Reviewed default');
  await page.getByRole('button', { name: 'Apply edits', exact: true }).click();
  await expect(page.getByTestId('proposal-commit-status')).toHaveText('Applied. Preview ready.');
  const after = await snapshot(page); expect(after.source.fields.find(f => f.field === 'f0')?.value).toBe('Reviewed default');
  expect(after.history.undo).toBe(before.history.undo + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click(); expect((await snapshot(page)).source).toEqual(before.source);
  await page.getByRole('button', { name: 'Redo', exact: true }).click(); expect((await snapshot(page)).source).toEqual(after.source);
});

test('Cancel during response and review preserves manual work; a newer request owns its reply', async ({ page }) => {
  const replies: (() => Promise<void>)[] = [];
  await page.route('**/api/ai/generate', route => new Promise<void>(resolve => replies.push(async () => { await route.fulfill({ json: response({ summary: 'Late reply', commands: [edit] }) }); resolve(); })));
  await setup(page); await propose(page); await expect.poll(() => replies.length).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.evaluate(async () => { const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(); const i = c.inspect(); if (!i.ok) throw Error(i.refusal.message); c.apply({ expected: i.expected, transactionId: 'manual', commands: [{ id: 'text.set', args: { targetId: 'f0', text: 'Manual edit' } }] }); await new Promise(resolve => setTimeout(resolve, 0)); });
  const manual = await snapshot(page); await replies[0]();
  await expect(page.getByRole('button', { name: 'Apply edits', exact: true })).toHaveCount(0); expect(await snapshot(page)).toEqual(manual);
  await propose(page); await expect.poll(() => replies.length).toBe(2); await replies[1]();
  await expect(page.getByRole('button', { name: 'Apply edits', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(await snapshot(page)).toEqual(manual);
});

for (const [label, commands] of [
  ['unknown command', [{ id: 'source.rewrite', args: { html: 'wrong' } }]],
  ['uninspected target', [edit, { id: 'text.set', args: { targetId: 'missing', text: 'wrong' } }]],
  ['late invalid operation', [{ id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 0, y: 0, width: 100, height: 100 } } }, { id: 'step.add', args: { time: 0 } }]],
  ['malformed values', [{ id: 'base.set', args: { targetId: 'f0', values: { x: '100' } } }]],
] as const) test('refuses ' + label + ' atomically', async ({ page }) => {
  await page.route('**/api/ai/generate', route => route.fulfill({ json: response({ summary: 'Invalid batch', commands }) }));
  await setup(page); const before = await snapshot(page); await propose(page);
  await expect(page.locator('[data-testid=editor-proposals] [role=alert]')).toBeVisible();
  expect(await snapshot(page)).toEqual(before); await expect(page.getByRole('button', { name: 'Apply edits', exact: true })).toHaveCount(0);
});

for (const change of ['source', 'selection', 'sample', 'playhead', 'history', 'gesture', 'assets'] as const) test('Apply preserves human ' + change + ' interleaving', async ({ page }) => {
  await page.route('**/api/ai/generate', route => route.fulfill({ json: response({ summary: 'Default edit', commands: [edit] }) }));
  await setup(page); await propose(page); await expect(page.getByRole('button', { name: 'Apply edits', exact: true })).toBeVisible();
  await page.evaluate(async change => {
    const c = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands(), s = c.session;
    const store = (await import('/src/store/templateStore.ts')).useTemplateStore;
    if (change === 'gesture') s.begin();
    else if (change === 'selection') { s.port.restore({ ...s.port.view(), selectedParts: ['#f1'] }); s.observeView(); }
    else if (change === 'playhead') { s.port.restore({ ...s.port.view(), time: .2 }); s.observeView(); }
    else if (change === 'sample') store.getState().setSampleValue('f0', 'Human sample');
    else if (change === 'history') { const i = c.inspect(); if (!i.ok) throw Error(i.refusal.message); c.apply({ expected: i.expected, transactionId: 'human-history', commands: [{ id: 'text.set', args: { targetId: 'f0', text: 'Human' } }] }); s.undo(); }
    else { const t = s.port.read(); store.getState().applyTemplate(change === 'assets' ? { ...t, assets: [...t.assets, { path: 'images/human.svg', mime: 'image/svg+xml', data: 'data:image/svg+xml;base64,PHN2Zy8+' }] } : { ...t, css: t.css + '\n/* human */' }); }
    await new Promise(resolve => setTimeout(resolve, 0));
  }, change);
  const human = await snapshot(page); await page.getByRole('button', { name: 'Apply edits', exact: true }).click();
  await expect(page.locator('[data-testid=editor-proposals] [role=alert]')).toBeVisible(); expect(await snapshot(page)).toEqual(human);
  if (change === 'gesture') expect(await page.evaluate(async () => (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().session.commandState().gestureActive)).toBe(true);
});

test('delayed response refuses changed context and disappears on document remount', async ({ page }) => {
  let reply: (() => Promise<void>) | undefined;
  await page.route('**/api/ai/generate', route => new Promise<void>(resolve => { reply = async () => { await route.fulfill({ json: response({ summary: 'Delayed', commands: [edit] }) }); resolve(); }; }));
  await setup(page); await propose(page); await expect.poll(() => !!reply).toBe(true);
  await page.evaluate(async () => { const s = (await import('/src/components/editorFoundation/commandAdapter.ts')).activeEditorCommands().session; s.port.restore({ ...s.port.view(), time: .2 }); s.observeView(); await new Promise(resolve => setTimeout(resolve, 0)); });
  const human = await snapshot(page); await reply!(); await expect(page.locator('[data-testid=editor-proposals] [role=alert]')).toBeVisible(); expect(await snapshot(page)).toEqual(human);
  reply = undefined; await propose(page); await expect.poll(() => !!reply).toBe(true);
  await page.evaluate(() => { location.hash = '#/home'; }); await expect(page.getByTestId('editor-foundation')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/editor-foundation'; }); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  const reopened = await snapshot(page); await reply!(); await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Apply edits', exact: true })).toHaveCount(0); expect(await snapshot(page)).toEqual(reopened);
});

for (const failure of ['rate_limited', 'provider_rejected', 'unavailable', 'network'] as const) test(failure + ' retains manual editing', async ({ page }) => {
  await page.route('**/api/ai/generate', route => failure === 'network' ? route.abort('failed') : route.fulfill({ status: failure === 'unavailable' ? 503 : 429, json: { error: { code: failure, message: failure, retryable: false } } }));
  await setup(page); const before = await snapshot(page); await propose(page);
  await expect(page.locator('[data-testid=editor-proposals] [role=alert]')).toBeVisible(); expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Assistant', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'rectangle tool', exact: true }).click();
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool', 'rectangle');
});

test('cancelled reply stays quiet while a newer request is still loading', async ({ page }) => {
  const replies: (() => Promise<void>)[] = [];
  await page.route('**/api/ai/generate', route => new Promise<void>(resolve => {
    const index = replies.length;
    replies.push(async () => { await route.fulfill({ json: response({ summary: index ? 'Current request' : 'Cancelled request', commands: [{ id: 'text.set', args: { targetId: 'f0', text: index ? 'Current wording' : 'Cancelled wording' } }] }) }); resolve(); });
  }));
  await setup(page); const before = await snapshot(page); await propose(page); await expect.poll(() => replies.length).toBe(1);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); await propose(page); await expect.poll(() => replies.length).toBe(2);
  const cancelledResponse = page.waitForResponse('**/api/ai/generate');
  await replies[0](); await (await cancelledResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toHaveCount(0);
  await expect(page.getByText('Preparing proposal…', { exact: true })).toBeVisible(); expect(await snapshot(page)).toEqual(before);
  await replies[1](); await expect(page.getByRole('region', { name: 'Proposed edits' })).toContainText('Current wording');
  await expect(page.getByRole('region', { name: 'Proposed edits' })).not.toContainText('Cancelled wording');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click(); expect(await snapshot(page)).toEqual(before);
});

test('empty explanation has no Apply action and cannot write', async ({ page }) => {
  await page.route('**/api/ai/generate', route => route.fulfill({ json: response({ summary: 'Path conversion is outside these commands.', commands: [] }) }));
  await setup(page); const before = await snapshot(page); await propose(page, 'Convert the path');
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toContainText('Path conversion');
  await expect(page.getByRole('button', { name: 'Apply edits', exact: true })).toHaveCount(0);
  await page.getByRole('textbox', { name: 'Describe an edit', exact: true }).press('Escape');
  await expect(page.getByRole('region', { name: 'Proposed edits' })).toHaveCount(0); expect(await snapshot(page)).toEqual(before);
});

test('unconfigured assistant leaves offline authoring available', async ({ page }) => {
  await page.route('**/api/ai/config', route => route.fulfill({ json: { providers: [], keyStorageAvailable: false } }));
  await page.goto('/app?editor=foundation#/editor-foundation'); await expect(page.getByTestId('editor-foundation')).toBeVisible();
  await page.getByRole('button', { name: 'Assistant', exact: true }).click();
  await expect(page.getByText('Configure AI in New graphic → AI settings. Manual editing is available.', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Propose edits', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Close assistant', exact: true }).click();
  await page.getByRole('button', { name: 'ellipse tool', exact: true }).click();
  await expect(page.getByTestId('foundation-canvas')).toHaveAttribute('data-tool', 'ellipse');
});


test('review describes the dimensions actually used by point text and shapes', async ({ page }) => {
  const commands = [
    { id: 'layer.create', args: { geometry: { shape: 'rectangle', x: 20, y: 30, width: 80, height: 60, box: true } } },
    { id: 'layer.create', args: { geometry: { shape: 'text', x: 120, y: 130, width: 240, height: 700 } } },
  ];
  await page.route('**/api/ai/generate', route => route.fulfill({ json: response({ summary: 'Create a shape and point text.', commands }) }));
  await setup(page); const before = await snapshot(page); await propose(page, 'Create a rectangle and point text');
  const review = page.getByRole('region', { name: 'Proposed edits' });
  await expect(review).toContainText('Create rectangle at (20, 30), 80 by 60 pixels.');
  await expect(review).toContainText('Create point text at (120, 130).');
  await expect(review).not.toContainText('text box');
  expect(await snapshot(page)).toEqual(before);
  await page.getByRole('button', { name: 'Apply edits', exact: true }).click();
  await expect(page.getByTestId('proposal-commit-status')).toHaveText('Applied. Preview ready.');
  const after = await snapshot(page);
  expect(after.source.css).not.toContain('240px');
  expect(after.source.css).toContain('max-width: none');
  expect(after.source.css).not.toContain('height: 700px');
  expect(after.history.undo).toBe(before.history.undo + 1);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await snapshot(page)).source).toEqual(before.source);
});
