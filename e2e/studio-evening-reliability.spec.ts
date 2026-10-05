// covers: src/components/home/CueShortcutDialog.tsx, src/components/playoutKeys.ts, src/components/home/ProductionPage.tsx, src/components/home/CueRundown.tsx, src/components/home/ServerDiagnostics.tsx, src/model/cueShortcuts.ts, src/model/teamOutbox.ts, src/model/durableStore.ts, src/store/templateStore.ts, src/assets/svgImport.ts, src/control/productionAdmission.ts, src/output/prepare.ts, src/components/AccountAuthoringGate.tsx
// covers: src/components/AccountSaveNotice.tsx, src/components/SyncStatus.tsx, src/backend/{auth,accountLibrary,syncController,sync,supabaseProvider,teamProductions}.ts
// covers: src/components/home/useDeferredEdits.ts, src/packs/graphicsPack.ts, src/components/wizard/CreationWizard.tsx
import { test, expect, type Page } from '@playwright/test';
import { seedSettings, fakeBridge } from './_fakeBridge';
import { awaitDurableReady, settleDurableWrites } from './_durable';
import { parkFocusOffControls, holdKeyRepeats } from './_keys';

async function rehearsal(page: Page) {
  await seedSettings(page);
  const bridge = await fakeBridge(page, { lengths: { VT: 200, VICTORY: 15, FAIL: 15 } });
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const seeded = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamedChecked, addGraphicToShow, addPlayoutItem, loadShows } = await import('/src/model/shows.ts');
    const { doc, error } = createGraphic(variantsFor('lower-third')[0].create({}), { name: 'NEXT QUESTION' });
    if (error) throw new Error(error);
    const made = createShowNamedChecked('Studio rehearsal');
    if (made.error) throw new Error(made.error);
    addGraphicToShow(made.show.id, doc.template, { graphicId: doc.id });
    for (const name of ['VT', 'VICTORY', 'FAIL']) addPlayoutItem(made.show.id, { adapter: 'casparcg', kind: 'media', mediaKind: name === 'VT' ? 'movie' : 'audio', name, frames: name === 'VT' ? 5000 : 375, fps: 25, channel: 2 });
    const show = loadShows().find(s => s.id === made.show.id)!;
    return { id: show.id, question: show.cues![0].id };
  });
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${seeded.id}`);
  await expect(page.locator('.pd-cue')).toHaveCount(4);
  return { bridge, ...seeded };
}

async function assign(page: Page, label: string, key: string) {
  await page.locator('.pd-cue', { hasText: label }).getByTestId('cue-menu').click();
  await page.getByTestId('cue-shortcut').click();
  const dialog = page.getByRole('dialog', { name: 'Cue shortcut' });
  await expect(dialog).toBeVisible();
  if (label === 'VICTORY') await dialog.screenshot({ path: 'test-results/studio-shortcut-dialog.png' });
  await dialog.getByRole('textbox').press(key);
  await dialog.getByRole('button', { name: 'Assign shortcut' }).click();
  await expect(dialog).toHaveCount(0);
}

test('V and F directly restart independent effects while selection and video stay parked; typing and repeats are quiet', async ({ page, request }) => {
  if (process.env.STUDIO_MUTATE_REPEAT) {
    const response = await request.get('/src/components/playoutKeys.ts');
    await expect(response).toBeOK();
    const source = await response.text();
    await response.dispose();
    const guard = `if (!e.repeat) onKey("trigger-cue",`;
    expect(source).toContain(guard);
    await page.route('**/src/components/playoutKeys.ts*', route => route.fulfill({ contentType: 'text/javascript', body: source.replace(guard, 'if (true) onKey("trigger-cue",') }));
  }
  const { bridge, question } = await rehearsal(page);
  await assign(page, 'VICTORY', 'v');
  await assign(page, 'FAIL', 'f');
  await page.getByRole('button', { name: 'Apply cue shortcuts' }).click();
  await page.locator('.pd-cue', { hasText: 'VT' }).getByTestId('select-cue').click();
  await parkFocusOffControls(page);
  await page.keyboard.press('Space');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take' && a.slot.layer === 10).length).toBe(1);
  await page.locator(`[data-row="${question}"]`).getByTestId('select-cue').click();
  await expect(page.locator(`[data-row="${question}"]`)).toHaveClass(/selected/);
  const preview = await page.getByTestId('cue-label').inputValue();
  await parkFocusOffControls(page);
  await page.keyboard.down('v');
  await holdKeyRepeats(page, 6, 'KeyV', 'v');
  await page.keyboard.up('v');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take' && a.slot.layer === 5).length).toBe(1);
  await page.keyboard.press('f');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take' && a.slot.layer === 5).length).toBe(2);
  await page.keyboard.press('v');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take' && a.slot.layer === 5).length).toBe(3);
  await expect(page.locator(`[data-row="${question}"]`)).toHaveClass(/selected/);
  expect(await page.getByTestId('cue-label').inputValue()).toBe(preview);
  expect(bridge.runs['2-10']?.entries[0].file).toBe('VT');
  expect(bridge.actions.filter(a => a.verb === 'out' || a.verb === 'sequence')).toEqual([]);
  await page.locator(`[data-row="${question}"]`).getByTestId('cue-menu').click();
  await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
  await page.keyboard.press('v');
  await holdKeyRepeats(page, 2, 'KeyF', 'f');
  expect(bridge.actions.filter(a => a.verb === 'take' && a.slot.layer === 5)).toHaveLength(3);
  await page.keyboard.press('Escape');
  await page.getByTestId('cue-label').fill('vf');
  await page.getByTestId('cue-label').press('v');
  await holdKeyRepeats(page, 2, 'KeyF', 'f');
  expect(bridge.actions.filter(a => a.verb === 'take' && a.slot.layer === 5)).toHaveLength(3);
  await settleDurableWrites(page);
  await page.screenshot({ path: 'test-results/studio-rundown.png', fullPage: true });
});

test('shortcut assignment rejects duplicates and reserved commands; a removed binding stops firing after explicit application', async ({ page }) => {
  const { bridge } = await rehearsal(page);
  await assign(page, 'VICTORY', 'v');
  await page.locator('.pd-cue', { hasText: 'FAIL' }).getByTestId('cue-menu').click();
  await page.getByTestId('cue-shortcut').click();
  const dialog = page.getByRole('dialog', { name: 'Cue shortcut' });
  await dialog.getByRole('textbox').press('r');
  await expect(dialog.getByRole('button', { name: 'Assign shortcut' })).toBeDisabled();
  await dialog.getByRole('textbox').press('v');
  await dialog.getByRole('button', { name: 'Assign shortcut' }).click();
  await expect(dialog.getByRole('alert')).toContainText(/already|assigned|used/i);
  expect(bridge.actions).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('button', { name: 'Apply cue shortcuts' }).click();
  await page.locator('.pd-cue', { hasText: 'VICTORY' }).getByTestId('cue-menu').click();
  await page.getByTestId('cue-shortcut').click();
  await dialog.getByRole('button', { name: 'Remove shortcut' }).click();
  await page.getByRole('button', { name: 'Apply cue shortcuts' }).click();
  await parkFocusOffControls(page);
  await page.keyboard.press('v');
  await holdKeyRepeats(page, 2, 'KeyV', 'v');
  expect(bridge.actions).toHaveLength(0);
});

test('unidentified producer diagnostics leave rundown geometry fixed and allow explicit clearing without cue ownership', async ({ page }) => {
  const { bridge } = await rehearsal(page);
  await page.locator('.pd-cue', { hasText: 'VT' }).getByTestId('select-cue').click();
  await parkFocusOffControls(page);
  await page.keyboard.press('Space');
  await expect.poll(() => !!bridge.runs['2-10']).toBe(true);
  const positions = () => page.locator('.pd-cue').evaluateAll(rows => rows.map(r => ({ id: r.getAttribute('data-row'), top: r.getBoundingClientRect().top, height: r.getBoundingClientRect().height })));
  const before = await positions();
  const stateCalls = bridge.stateCalls;
  bridge.restart();
  await expect.poll(() => bridge.stateCalls).toBeGreaterThan(stateCalls);
  await page.getByTestId('production-status').click();
  await expect(page.getByTestId('production-status-panel')).toContainText(/unidentified/i);
  expect(await positions()).toEqual(before);
  await expect(page.locator('.pd-cue')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/studio-diagnostics.png', fullPage: true });
  await page.getByTestId('production-status').click();
  await page.getByTestId('verb-clear-slot').click();
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'clear' && a.slot.layer === 10).length).toBe(1);
  // The fake models this actual server CLEAR, including anything queued on the slot.
  expect(bridge.actions.at(-1)?.slot).toMatchObject({ channel: 2, layer: 10 });
  expect(bridge.runs['2-10']).toBeUndefined();
});

test('account expiry flushes delayed editor work and retains team recovery across reload and account changes', async ({ page }) => {
  await page.goto('/app#/home');
  await awaitDurableReady(page);
  let reloaded = page.waitForEvent('load');
  await page.evaluate(async () => { const { bindLibraryToAccount } = await import('/src/backend/accountLibrary.ts'); void bindLibraryToAccount('account-a'); });
  await reloaded;
  await awaitDurableReady(page);
  const result = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createShowNamedChecked } = await import('/src/model/shows.ts');
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { retainTeamEdit, acknowledgeTeamEdit, pendingTeamEdits } = await import('/src/model/teamOutbox.ts');
    const { setAccountAuthoringEnabled, commitDurableWrites } = await import('/src/model/durableStore.ts');
    const base = { ...createShowNamedChecked('Team quiz').show, teamId: 'team-a' };
    const local = { ...base, name: 'Home edits' };
    retainTeamEdit('account-a', base.id, { token: 'base-revision', base, local, teamId: 'team-a', updatedBy: 'account-a' });
    acknowledgeTeamEdit('account-a', base.id, base);
    useTemplateStore.getState().applyTemplate(variantsFor('lower-third')[0].create({}), { resetSampleData: true });
    useTemplateStore.getState().setCss('/* latest pending edit */');
    setAccountAuthoringEnabled(false);
    useTemplateStore.getState().setCss('/* must not overwrite */');
    const failure = await commitDurableWrites();
    if (failure) throw new Error(failure);
    return { id: base.id, css: useTemplateStore.getState().template.css, pending: pendingTeamEdits('account-a')[base.id].local.name };
  });
  expect(result.css).toBe('/* latest pending edit */');
  expect(result.pending).toBe('Home edits');
  await page.reload();
  await awaitDurableReady(page);
  expect(await page.evaluate(async () => {
    const { loadProject } = await import('/src/model/project.ts');
    const { pendingTeamEdits } = await import('/src/model/teamOutbox.ts');
    return { css: loadProject()?.template.css, names: Object.values(pendingTeamEdits('account-a')).map(e => e.local.name) };
  })).toEqual({ css: result.css, names: ['Home edits'] });
  reloaded = page.waitForEvent('load');
  await page.evaluate(async () => { const { bindLibraryToAccount } = await import('/src/backend/accountLibrary.ts'); void bindLibraryToAccount('account-b'); });
  await reloaded;
  await awaitDurableReady(page);
  expect(await page.evaluate(async () => { const { pendingTeamEdits } = await import('/src/model/teamOutbox.ts'); return pendingTeamEdits('account-b'); })).toEqual({});
});

test('expiry commits pending cue and folder text, pauses their editing and leaves media transport usable', async ({ page }) => {
  await page.goto('/app#/home');
  await awaitDurableReady(page);
  const reloaded = page.waitForEvent('load');
  await page.evaluate(async () => { const { bindLibraryToAccount } = await import('/src/backend/accountLibrary.ts'); void bindLibraryToAccount('transport-account'); });
  await reloaded;
  const { id, question, bridge } = await rehearsal(page);
  // The account switch left the page on the same hash route, so the helper's later init script
  // needs a document navigation before this fake studio is actually paired.
  await page.reload();
  await expect(page.locator('.pd-cue')).toHaveCount(4);
  await page.locator(`[data-row="${question}"]`).getByTestId('select-cue').click();
  await page.getByTestId('cue-label').fill('Pending cue name');
  await page.evaluate(async () => { const { setAccountAuthoringEnabled } = await import('/src/model/durableStore.ts'); setAccountAuthoringEnabled(false); });
  expect(await page.evaluate(async ({ id, question }) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find(s => s.id === id)?.cues?.find(c => c.id === question)?.label;
  }, { id, question })).toBe('Pending cue name');
  await expect(page.getByTestId('cue-editor')).toHaveAttribute('inert', '');
  const folderId = await page.evaluate(async ({ id, question }) => {
    const { setAccountAuthoringEnabled } = await import('/src/model/durableStore.ts');
    const { addFolderFromSelection } = await import('/src/model/shows.ts');
    setAccountAuthoringEnabled(true);
    const added = addFolderFromSelection(id, [question], 'Original folder');
    if (added.error) throw new Error(added.error);
    return added.folderId!;
  }, { id, question });
  await page.locator('.pd-folder', { hasText: 'Original folder' }).getByTestId('select-folder').click();
  await page.getByTestId('folder-name-input').fill('Pending folder name');
  await page.evaluate(async () => { const { setAccountAuthoringEnabled } = await import('/src/model/durableStore.ts'); setAccountAuthoringEnabled(false); });
  expect(await page.evaluate(async ({ id, folderId }) => {
    const { loadShows } = await import('/src/model/shows.ts');
    return loadShows().find(s => s.id === id)?.folders?.find(f => f.id === folderId)?.name;
  }, { id, folderId })).toBe('Pending folder name');
  await expect(page.locator('[data-account-authoring="paused"]').filter({ has: page.getByTestId('folder-editor') })).toHaveAttribute('inert', '');
  await page.locator('.pd-cue', { hasText: 'VT' }).getByTestId('select-cue').click();
  await parkFocusOffControls(page);
  await page.keyboard.press('Space');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take' && a.slot.layer === 10).length).toBe(1);
  await page.keyboard.press('Space');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'out' && a.slot.layer === 10).length).toBe(1);
});

test('rundown admission refuses an oversized draft before adding a cue', async ({ page }) => {
  await rehearsal(page);
  const draft = await page.evaluate(async () => {
    const { createGraphic } = await import('/src/model/library.ts');
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const template = variantsFor('lower-third')[0].create({});
    template.name = 'Oversized draft';
    template.css += `/*${'x'.repeat(530000)}*/`;
    const { doc, error } = createGraphic(template, { name: template.name });
    if (error) throw new Error(error);
    return doc.id;
  });
  await page.getByTestId('add-graphic-pick').selectOption(draft);
  await page.getByTestId('add-graphic').click();
  await expect(page.getByTestId('rundown-note')).toContainText('512 KB');
  await expect(page.locator('.pd-cue')).toHaveCount(4);
  const bulk = await page.evaluate(async graphic => {
    const L = await import('/src/model/library.ts');
    const S = await import('/src/model/shows.ts');
    const { installPack } = await import('/src/packs/graphicsPack.ts');
    const before = { graphics: L.loadGraphics().length, shows: S.loadShows().length };
    let error = '';
    try { await installPack({ name: 'Oversized set', description: '', graphics: [{ template: L.loadGraphics().find(g => g.id === graphic)!.template, cues: [] }] }); }
    catch (e) { error = (e as Error).message; }
    return { before, after: { graphics: L.loadGraphics().length, shows: S.loadShows().length }, error };
  }, draft);
  expect(bulk.error).toContain('512 KB');
  expect(bulk.after).toEqual(bulk.before);
});

test('SVG import strips non-rendering editor payload while keeping artwork and identifying fully off-canvas text', async ({ page }) => {
  await page.goto('/app#/home');
  const result = await page.evaluate(async () => {
    const { importSvgMarkup } = await import('/src/assets/svgImport.ts');
    const source = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 20 100 100"><metadata>${'private-editor-data'.repeat(35000)}</metadata><title>Quiz artwork</title><defs><linearGradient id="paint"><stop stop-color="red"/></linearGradient></defs><rect x="10" y="20" width="100" height="100" fill="url(#paint)"/><text x="20" y="60">Visible question</text><g transform="translate(500 0)"><text x="20" y="60">Hidden question</text></g></svg>`;
    const imported = importSvgMarkup(source);
    return { markup: imported.markup, candidates: imported.candidates.map(c => ({ sample: c.sample, outside: !!c.outsideCanvas })), notices: imported.notices };
  });
  expect(result.markup).not.toContain('private-editor-data');
  expect(result.markup).toContain('linearGradient');
  expect(result.markup).toContain('Quiz artwork');
  expect(result.candidates).toContainEqual({ sample: 'Visible question', outside: false });
  expect(result.candidates).toContainEqual({ sample: 'Hidden question', outside: true });
  expect(result.notices.join(' ')).toContain('outside the canvas');
});

test('metadata preparation adopts while on air, and asset changes wait until air is clear', async ({ page }) => {
  await page.goto('/app#/home');
  const result = await page.evaluate(async () => {
    const { createPreparer } = await import('/src/output/prepare.ts');
    let onAir = 1, now = 0, adopted = 0, rechecked = 0, reloaded = 0;
    const held = { n: 1, h: 'old', g: {} };
    const payload = { v: 2 as const, graphics: [], cues: [], resolution: { width: 1920, height: 1080, label: 'HD' }, ver: { n: 2, h: 'old', g: {} } };
    const preparer = createPreparer({ held, resolve: async () => payload, onAir: () => onAir, recheck: async () => { rechecked++; }, report: () => {}, reload: async () => { reloaded++; return true; }, adopt: () => { adopted++; return true; }, now: () => now });
    preparer.request({ id: 'metadata-only', n: 2, h: 'old' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const metadata = { adopted, rechecked, reloaded };
    payload.ver = { n: 3, h: 'new', g: {} };
    const removed = createPreparer({ held: { ...held, g: { removed: 'asset' } }, resolve: async () => payload, onAir: () => onAir, recheck: async () => {}, report: () => {}, reload: async () => { reloaded++; return true; }, now: () => now });
    removed.request({ id: 'asset-removal', n: 2, h: 'new' });
    await new Promise(resolve => setTimeout(resolve, 0));
    const beforeClear = reloaded;
    onAir = 0; now = 16000; removed.tick();
    await new Promise(resolve => setTimeout(resolve, 0));
    return { metadata, beforeClear, afterClear: reloaded };
  });
  expect(result).toEqual({ metadata: { adopted: 1, rechecked: 1, reloaded: 0 }, beforeClear: 0, afterClear: 1 });
});

test('cloud acknowledgement covers the current working revision; failed writes stay visibly pending and session loss pauses authoring', async ({ page }) => {
  const owner = '00000000-0000-4000-8000-000000000001';
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'rehearsal@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, exp: expires, role: 'authenticated' })).toString('base64url')}.test`;
  await page.route('**/src/backend/config.ts*', route => route.fulfill({ contentType: 'text/javascript', body: `export function loadBackendConfig(){return {url:'https://cloudmock.invalid',anonKey:'test-public-key'}};export function isBackendConfigured(){return true}` }));
  await page.addInitScript(({ owner, user, token, expires }) => {
    if (window.top !== window) return;
    localStorage.setItem('spx-gfx-account', owner);
    if (!localStorage.getItem('sb-cloudmock-auth-token')) localStorage.setItem('sb-cloudmock-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user }));
  }, { owner, user, token, expires });
  const rows = new Map<string, { id: string; kind: string; body: { updatedAt: string; template?: { css: string } }; deleted: boolean }>();
  let failWrites = false;
  let releaseLists!: () => void;
  const firstRead = new Promise<void>(resolve => { releaseLists = resolve; });
  await page.route('https://cloudmock.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/auth/v1/logout') return respond({});
    if (url.pathname === '/rest/v1/documents') {
      if (request.method() === 'GET') {
        await firstRead;
        const kind = url.searchParams.get('kind')?.replace('eq.', '');
        const found = [...rows.values()].filter(row => row.kind === kind);
        return respond(url.searchParams.get('select')?.includes('body') ? found : found.map(row => ({ id: row.id, deleted: row.deleted, updatedAt: row.body.updatedAt })));
      }
      if (request.method() === 'POST') {
        if (failWrites) return respond({ message: 'Injected cloud write failure', code: 'XX000' }, 503);
        const row = request.postDataJSON();
        rows.set(row.id, row);
        return respond({ body: row.body });
      }
      return respond([]);
    }
    return respond([]);
  });
  await page.goto('/app#/home');
  await expect(page.getByTestId('account-save-notice')).toContainText('Checking cloud revision');
  releaseLists();
  await expect(page.locator('.sync-status')).toHaveText(/Personal library saved to cloud/, { timeout: 20000 });
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { syncNow } = await import('/src/backend/syncController.ts');
    useTemplateStore.getState().setCss('/* current cloud revision */');
    // Deliberately before the 800 ms autosave. Retry must cover this edit.
    await syncNow();
  });
  await expect(page.locator('.sync-status')).toHaveText(/Personal library saved to cloud/, { timeout: 20000 });
  expect([...rows.values()].find(row => row.kind === 'project')?.body.template?.css).toBe('/* current cloud revision */');
  failWrites = true;
  await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    const { syncNow } = await import('/src/backend/syncController.ts');
    useTemplateStore.getState().setCss('/* failed save stays here */');
    await syncNow();
  });
  await expect(page.locator('.sync-status')).toHaveText(/Not saved to cloud/);
  await expect(page.getByTestId('account-save-notice')).toContainText('Not saved to cloud');
  expect([...rows.values()].find(row => row.kind === 'project')?.body.template?.css).toBe('/* current cloud revision */');
  await page.evaluate(async () => { const { getSupabase } = await import('/src/backend/supabase.ts'); await (await getSupabase())!.auth.signOut({ scope: 'local' }); });
  await expect(page.getByTestId('account-save-notice')).toContainText('Account editing paused');
  await expect(page.locator('[aria-modal="true"]')).toHaveCount(0);
  await page.screenshot({ path: 'test-results/studio-account-paused.png', fullPage: true });
  expect(await page.evaluate(async () => {
    const { useTemplateStore } = await import('/src/store/templateStore.ts');
    useTemplateStore.getState().setCss('/* refused after expiry */');
    return useTemplateStore.getState().template.css;
  })).toBe('/* failed save stays here */');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
