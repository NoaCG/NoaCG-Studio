// covers: src/components/home/{PlayoutItemPicker,CueRundown,ProductionPage,ProductionSetupMenu,ServerCueEditor}.tsx
// covers: src/model/shows.ts, src/backend/{teamProductions,syncController}.ts, src/control/{cuePlayback,serverPlayout,playoutProtocol}.ts, src/styles/playout-dashboard.css
import { test, expect, type Page } from '@playwright/test';
import { seedSettings, fakeBridge } from './_fakeBridge';
import { settleDurableWrites } from './_durable';
import { parkFocusOffControls } from './_keys';

async function rehearsal(page: Page) {
  await seedSettings(page);
  const bridge = await fakeBridge(page, {
    features: ['state', 'playback', 'sequence', 'image-fit'],
    capabilities: ['state', 'end', 'fade', 'trim', 'level', 'sequence', 'image-fit'],
    list: [
      { name: 'G1/NESTED/INSERT 3', kind: 'MOVIE', frames: 625, fps: 25 },
      { name: 'G1/INSERT 2 ', kind: 'MOVIE', frames: 500, fps: 25 },
      { name: 'G1/INSERT 1', kind: 'MOVIE', frames: 500, fps: 25 },
      { name: 'G1/VICTORY', kind: 'AUDIO', frames: 100, fps: 25 },
      { name: 'G1/PHOTO', kind: 'STILL' },
      { name: 'G2/OTHER', kind: 'MOVIE', frames: 750, fps: 25 },
    ],
  });
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const seeded = await page.evaluate(async () => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createShowNamedChecked, addGraphicToShow, loadShows } = await import('/src/model/shows.ts');
    const made = createShowNamedChecked('Release rehearsal');
    if (made.error) throw new Error(made.error);
    const template = variantsFor('lower-third')[0].create({});
    addGraphicToShow(made.show.id, { ...template, name: 'NEXT QUESTION' });
    const show = loadShows().find(s => s.id === made.show.id)!;
    return { id: show.id, question: show.cues![0].id };
  });
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${seeded.id}`);
  await expect(page.locator('.pd-cue')).toHaveCount(1);
  return { bridge, ...seeded };
}

test('multiple media and a whole folder add without closing the picker or moving the next question', async ({ page }) => {
  const { id, question, bridge } = await rehearsal(page);
  await page.getByTestId('rundown-add').click();
  await page.getByTestId('menu-add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.getByTestId('picker-folder').filter({ hasText: 'G1' }).click();
  const first = page.locator('.pd-picker-select').filter({ hasText: 'INSERT 1' });
  const second = page.locator('.pd-picker-select').filter({ hasText: 'INSERT 2' });
  await first.click();
  await second.click({ modifiers: ['Shift'] });
  await expect(page.getByTestId('picker-add-selected')).toHaveText('Add selected (2)');
  await page.getByTestId('picker-add-selected').click();
  await expect(page.locator('.pd-cue')).toHaveCount(3);
  await expect(page.getByTestId('playout-picker')).toBeVisible();
  await expect(page.locator(`[data-row="${question}"]`)).toHaveClass(/selected/);
  await expect(page.getByTestId('picker-add-folder')).toHaveText('Add folder (5)');
  await page.screenshot({ path: 'test-results/studio-release-bulk-picker.png' });
  await page.getByTestId('picker-add-folder').click();
  await expect(page.locator('.pd-cue')).toHaveCount(8);
  await expect(page.getByTestId('playout-picker')).toBeVisible();
  await expect(page.locator(`[data-row="${question}"]`)).toHaveClass(/selected/);
  const result = await page.evaluate(async id => {
    const s = (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)!;
    return { names: s.playoutItems!.map(i => i.name), cues: s.cues!.slice(3).map(c => s.playoutItems!.find(i => i.id === c.sourceId)!.name), audio: s.playoutItems!.find(i => i.mediaKind === 'audio') };
  }, id);
  expect(result.names).toHaveLength(5);
  expect(result.names).toContain('G1/INSERT 2 ');
  expect(result.cues).toEqual(['G1/INSERT 1', 'G1/INSERT 2 ', 'G1/NESTED/INSERT 3', 'G1/PHOTO', 'G1/VICTORY']);
  expect(result.audio).toMatchObject({ channel: 2, layer: 5 });
  expect(bridge.actions).toHaveLength(0);
  await page.getByTestId('picker-done').click();
  await expect(page.getByTestId('playout-picker')).toHaveCount(0);
});

test('picture Fit is the default, Stretch persists, and a live edit applies only at the next Take', async ({ page }) => {
  const { id, bridge } = await rehearsal(page);
  await page.evaluate(async id => {
    (await import('/src/model/shows.ts')).addPlayoutItem(id, { adapter: 'casparcg', kind: 'media', mediaKind: 'still', name: 'G1/PHOTO', channel: 2 });
  }, id);
  await settleDurableWrites(page);
  await page.locator('.pd-cue', { hasText: 'G1/PHOTO' }).getByTestId('select-cue').click();
  await expect(page.getByTestId('picture-fit')).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Fit', exact: true })).toHaveAttribute('aria-checked', 'true');
  await parkFocusOffControls(page);
  await page.keyboard.press('Space');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take').length).toBe(1);
  expect(bridge.actions[0]).toMatchObject({ imageFit: 'fit', slot: { channel: 2, layer: 10 } });
  await page.getByRole('radio', { name: 'Stretch', exact: true }).click();
  await settleDurableWrites(page);
  expect(bridge.actions.filter(a => a.verb === 'take')).toHaveLength(1);
  await expect(page.getByTestId('picture-fit')).toContainText('next Take');
  await page.screenshot({ path: 'test-results/studio-release-picture-controls.png' });
  await page.reload();
  await page.locator('.pd-cue', { hasText: 'G1/PHOTO' }).getByTestId('select-cue').click();
  await expect(page.getByRole('radio', { name: 'Stretch', exact: true })).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('verb-retake').click();
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take').length).toBe(2);
  expect(bridge.actions.filter(a => a.verb === 'take').at(-1)).not.toHaveProperty('imageFit');
});

test('a refused bulk save keeps the selected media available for retry and never reports Added', async ({ page }) => {
  await rehearsal(page);
  await page.getByTestId('rundown-add').click();
  await page.getByTestId('menu-add-from-server').click();
  await page.getByTestId('picker-media').click();
  await page.getByTestId('picker-folder').filter({ hasText: 'G1' }).click();
  await page.locator('.pd-picker-select').filter({ hasText: 'INSERT 1' }).click();
  await page.locator('.pd-picker-select').filter({ hasText: 'INSERT 2' }).click({ modifiers: ['Shift'] });
  await page.evaluate(async () => {
    const { durable } = await import('/src/model/durableStore.ts');
    const original = durable.setItem;
    durable.setItem = (key, value) => { if (key === 'spx-gfx-shows') throw new Error('Injected full store'); original(key, value); };
    (window as unknown as { restoreBatchStore: () => void }).restoreBatchStore = () => { durable.setItem = original; };
  });
  await page.getByTestId('picker-add-selected').click();
  await expect(page.getByTestId('rundown-note')).toContainText('Browser storage is full');
  await expect(page.locator('.pd-cue')).toHaveCount(1);
  await expect(page.getByTestId('picker-add-selected')).toHaveText('Add selected (2)');
  await expect(page.getByTestId('playout-picker')).not.toContainText('Added 2 cues');
  await page.evaluate(() => (window as unknown as { restoreBatchStore: () => void }).restoreBatchStore());
  await page.getByTestId('picker-add-selected').click();
  await expect(page.locator('.pd-cue')).toHaveCount(3);
  await expect(page.getByTestId('playout-picker')).toContainText('Added 2 cues');
});

test('older Bridge cannot silently stretch a default Fit picture', async ({ page }) => {
  const { id, bridge } = await rehearsal(page);
  bridge.features = ['state', 'playback', 'sequence'];
  bridge.capabilities = ['state', 'end', 'fade', 'trim', 'level', 'sequence'];
  await page.evaluate(async id => {
    (await import('/src/model/shows.ts')).addPlayoutItem(id, { adapter: 'casparcg', kind: 'media', mediaKind: 'still', name: 'G1/PHOTO', channel: 2 });
  }, id);
  await settleDurableWrites(page);
  await page.reload();
  await page.locator('.pd-cue', { hasText: 'G1/PHOTO' }).getByTestId('select-cue').click();
  await expect(page.getByTestId('playout-cue-editor')).toContainText('Update NoaCG Bridge');
  await page.getByTestId('production-status').click();
  await expect(page.getByRole('listitem').filter({ hasText: 'PHOTO: cannot Take' })).toContainText('Update NoaCG Bridge');
  await page.getByTestId('production-status').click();
  await parkFocusOffControls(page);
  await page.keyboard.press('Space');
  expect(bridge.actions).toHaveLength(0);
  await page.getByRole('radio', { name: 'Stretch', exact: true }).click();
  await parkFocusOffControls(page);
  await page.keyboard.press('Space');
  await expect.poll(() => bridge.actions.filter(a => a.verb === 'take').length).toBe(1);
});

test('Refresh lives inside Add and reports local workspace without affecting selection or output', async ({ page }) => {
  const { id, question, bridge } = await rehearsal(page);
  await page.evaluate(async ({ id, question }) => {
    const { addShowCue, loadShows } = await import('/src/model/shows.ts');
    const source = loadShows().find(show => show.id === id)!.cues!.find(cue => cue.id === question)!.sourceId;
    for (let i = 0; i < 35; i++) addShowCue(id, source);
  }, { id, question });
  await expect(page.locator('.pd-cue')).toHaveCount(36);
  await page.locator('.pd-cues').evaluate(element => { element.scrollTop = element.scrollHeight; });
  const geometry = () => page.locator('.pd-cues').evaluate(element => ({
    scroll: element.scrollTop, height: element.clientHeight,
    rows: [...element.querySelectorAll('.pd-cue')].map(row => ({ id: row.getAttribute('data-row'), y: row.getBoundingClientRect().y })),
  }));
  const before = await geometry();
  await expect(page.getByTestId('rundown-refresh')).toHaveCount(0);
  await page.getByTestId('rundown-add').click();
  await expect(page.getByTestId('rundown-refresh')).toBeVisible();
  await page.getByTestId('rundown-refresh').click();
  await expect(page.getByTestId('rundown-note')).toContainText('local workspace');
  await expect(page.locator('.pd-rundown [data-testid="rundown-note"]')).toHaveCount(0);
  expect(await geometry()).toEqual(before);
  await expect(page.locator(`[data-row="${question}"]`)).toHaveClass(/selected/);
  expect(bridge.actions).toHaveLength(0);
});

test('Refresh retrieves a newer personal rundown, flushes a draft, and exposes a failed cloud write', async ({ page }) => {
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
  type Row = { id: string; kind: string; body: { updatedAt: string; cues?: { id: string; sourceId: string; label: string; values: Record<string, string> }[] }; deleted: boolean };
  const rows = new Map<string, Row>();
  let failWrites = false;
  await page.route('https://cloudmock.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/rest/v1/documents') {
      if (request.method() === 'GET') {
        const found = [...rows.values()].filter(row => row.kind === url.searchParams.get('kind')?.replace('eq.', ''));
        return respond(url.searchParams.get('select')?.includes('body,') ? found : found.map(row => ({ id: row.id, deleted: row.deleted, updatedAt: row.body.updatedAt })));
      }
      if (request.method() === 'POST') {
        if (failWrites) return respond({ message: 'Injected cloud write failure', code: 'XX000' }, 503);
        const row = request.postDataJSON();
        rows.set(row.id, row);
        return respond({ body: row.body });
      }
    }
    return respond([]);
  });
  const { id, question, bridge } = await rehearsal(page);
  await expect.poll(() => rows.get(id)?.body.cues?.length, { timeout: 20000 }).toBe(1);
  await expect.poll(async () => page.evaluate(async () => JSON.stringify((await import('/src/backend/syncController.ts')).getSyncState())), { timeout: 20000 }).toContain('"phase":"synced"');
  const remote = structuredClone(rows.get(id)!);
  remote.body.updatedAt = new Date(Math.max(Date.now(), Date.parse(remote.body.updatedAt) + 1)).toISOString();
  remote.body.cues!.push({ ...remote.body.cues![0], id: '00000000-0000-4000-8000-000000000002', label: 'QUESTION FROM OTHER LAPTOP' });
  rows.set(id, remote);
  await page.getByTestId('rundown-add').click();
  await page.getByTestId('rundown-refresh').click();
  await expect(page.getByTestId('rundown-note')).toHaveText('Rundown refreshed from cloud.');
  await expect(page.locator('.pd-cue')).toHaveCount(2);
  await expect(page.locator(`[data-row="${question}"]`)).toHaveClass(/selected/);
  await page.getByTestId('cue-field-f0').fill('FLUSH BEFORE REFRESH');
  await page.getByTestId('rundown-add').click();
  await page.getByTestId('rundown-refresh').click();
  await expect(page.getByTestId('rundown-note')).toHaveText('Rundown refreshed from cloud.');
  expect(rows.get(id)!.body.cues!.find(c => c.id === question)!.values.f0).toBe('FLUSH BEFORE REFRESH');
  failWrites = true;
  await page.getByTestId('cue-field-f0').fill('KEEP UNSAVED DRAFT');
  await page.getByTestId('rundown-add').click();
  await page.getByTestId('rundown-refresh').click();
  await expect(page.getByTestId('rundown-note')).toContainText('Refresh failed:');
  await expect(page.getByTestId('cue-field-f0')).toHaveValue('KEEP UNSAVED DRAFT');
  expect(rows.get(id)!.body.cues!.find(c => c.id === question)!.values.f0).toBe('FLUSH BEFORE REFRESH');
  expect(bridge.actions).toHaveLength(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
