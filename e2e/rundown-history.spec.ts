// covers: src/components/home/{ProductionPage,useRundownHistory,CueRundown}.ts*, src/components/playoutKeys.ts
// covers: src/model/{rundownHistory,shows,durableStore}.ts, src/backend/teamProductions.ts
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { parkFocusOffControls, holdKeyRepeats } from './_keys';
import { fakeBridge, seedSettings } from './_fakeBridge';
import type { Show } from '../src/model/shows';

const pageFaults = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const faults: string[] = []; pageFaults.set(page, faults);
  page.on('pageerror', error => faults.push(error.message));
});
test.afterEach(async ({ page }) => { expect(pageFaults.get(page)).toEqual([]); });

async function teamBackend(page: Page, server = false) {
  const owner = '00000000-0000-4000-8000-000000000001', team = '00000000-0000-4000-8000-000000000010';
  const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'history@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, exp: expires, role: 'authenticated' })).toString('base64url')}.test`;
  await page.route('**/src/backend/config.ts*', route => route.fulfill({ contentType: 'text/javascript', body: "export function loadBackendConfig(){return {url:'https://cloudmock.invalid',anonKey:'test-public-key'}};export function isBackendConfigured(){return true}" }));
  await page.addInitScript(({ owner, user, token, expires }) => {
    if (window.top !== window) return;
    localStorage.setItem('spx-gfx-account', owner);
    localStorage.setItem('sb-cloudmock-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user }));
  }, { owner, user, token, expires });
  let revision = 0;
  const state = { doc: null as Show | null, token: '2026-10-06T00:00:00.000Z', fail: false, calls: 0, hold: null as Promise<void> | null };
  const advance = () => { state.token = new Date(Date.parse('2026-10-06T00:00:00Z') + ++revision).toISOString(); };
  await page.route('https://cloudmock.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/rest/v1/teams') return respond([{ id: team, name: 'History team', join_code: 'testcode', owner_id: owner, created_at: state.token }]);
    if (url.pathname === '/rest/v1/team_members') return respond([{ team_id: team, user_id: owner, display_name: 'Operator', role: 'owner', joined_at: state.token }]);
    if (url.pathname === '/rest/v1/team_productions') return respond(state.doc ? [{ id: state.doc.id, team_id: team, updated_at: state.token, updated_by: owner, doc: state.doc }] : []);
    if (url.pathname === '/rest/v1/rpc/team_production_save') {
      state.calls++;
      await state.hold;
      if (state.fail) return respond({ message: 'Injected team save failure', code: 'XX000' }, 503);
      const body = request.postDataJSON();
      if (body.p_expected !== state.token) return respond({ saved: false, updated_at: state.token, updated_by: owner, doc: state.doc });
      state.doc = structuredClone(body.p_doc); advance();
      return respond({ saved: true, updated_at: state.token, updated_by: owner, doc: state.doc });
    }
    if (url.pathname === '/rest/v1/documents' && request.method() === 'POST') return respond({ body: request.postDataJSON().body });
    return respond([]);
  });
  const ids = await seed(page, server);
  state.doc = await page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)!, ids.show);
  await page.evaluate(async owner => { const m = await import('/src/backend/teamProductions.ts'); m.startTeamSync(owner); await m.refreshTeams(); }, owner);
  await expect.poll(() => page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)?.teamId, ids.show)).toBe(team);
  return { ids, state, advance };
}

async function seed(page: Page, server = false) {
  await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible();
  const ids = await page.evaluate(async server => {
    const m = await import('/src/model/shows.ts'), { variantsFor } = await import('/src/templates/catalog.ts');
    const show = m.createShowNamedChecked('History').show, other = m.createShowNamedChecked('Other').show;
    m.addGraphicToShow(show.id, { ...variantsFor('lower-third')[0].create({}), name: 'Guests' });
    const first = m.loadShows().find(s => s.id === show.id)!.cues![0];
    m.updateShowCue(show.id, first.id, { label: 'Alpha' }); m.addShowCue(show.id, first.sourceId, { label: 'Beta' });
    if (server) m.addPlayoutItem(show.id, { adapter: 'casparcg', kind: 'media', name: 'GAMMA', mediaKind: 'movie', channel: 2, layer: 10, frames: 250, fps: 25 });
    else m.addGraphicToShow(show.id, { ...variantsFor('lower-third')[0].create({}), name: 'Gamma' });
    const saved = m.loadShows().find(s => s.id === show.id)!;
    const cueIds = saved.cues!.map(c => c.id);
    m.addFolderFromSelection(show.id, cueIds.slice(0, 2), 'Guests');
    if (!server) m.addFolderFromSelection(show.id, [cueIds[2]], 'Closing');
    return { show: show.id, other: other.id, cues: cueIds };
  }, server);
  await settleDurableWrites(page); await page.goto(`/app#/production/${ids.show}`);
  await expect(page.getByTestId('production-page')).toBeVisible(); return ids;
}
const row = (page: Page, name: string) => page.getByTestId('cue-list').locator('.pd-cue').filter({ has: page.locator('.pd-cue-label strong', { hasText: new RegExp(`^${name}$`) }) });
async function select(page: Page, name: string) { await row(page, name).getByTestId('select-cue').click(); }
async function snapshot(page: Page, id: string) {
  await settleDurableWrites(page);
  return page.evaluate(async id => {
    const m = await import('/src/model/shows.ts'), h = await import('/src/model/rundownHistory.ts');
    return h.sliceKey(h.rundownSlice(m.loadShows().find(s => s.id === id)!));
  }, id);
}
async function expectSlice(page: Page, id: string, expected: string) { await expect.poll(() => snapshot(page, id)).toBe(expected); }
async function key(page: Page, key: string) {
  await parkFocusOffControls(page);
  // Application inverse is available after local acknowledgement. This does not drain
  // the team pump, so held/failed cloud saves still exercise unavailable history.
  if (/^(Control|Meta)\+(Shift\+)?[zy]$/.test(key)) await settleDurableWrites(page);
  await page.keyboard.press(key);
}
async function duplicate(page: Page, name = 'Alpha') {
  await row(page, name).getByTestId('cue-menu').click(); await page.getByRole('menuitem', { name: 'Duplicate', exact: true }).click();
  await expect(row(page, `${name} copy`)).toBeVisible(); await settleDurableWrites(page);
  await expect(page.getByTestId('production-team-save')).toHaveCount(0);
}
async function failNextPut(page: Page) {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function(value, key) {
      if (key === 'spx-gfx-shows') { IDBObjectStore.prototype.put = original; throw new DOMException('Injected refusal', 'QuotaExceededError'); }
      return original.call(this, value, key);
    };
  });
}

test('four authoring steps undo and redo exact cue, folder and pruned source identities', async ({ page }) => {
  const ids = await seed(page), states = [await snapshot(page, ids.show)];
  const from = await row(page, 'Beta').boundingBox(), to = await row(page, 'Alpha').boundingBox();
  await page.mouse.move(from!.x + 8, from!.y + from!.height / 2); await page.mouse.down();
  await page.mouse.move(to!.x + 8, to!.y + 3, { steps: 12 }); await page.mouse.up();
  await expect.poll(() => page.getByTestId('cue-list').locator('.pd-cue .pd-cue-label strong').allTextContents()).toEqual(['Beta', 'Alpha', 'Gamma']);
  states.push(await snapshot(page, ids.show)); await duplicate(page); states.push(await snapshot(page, ids.show));
  await select(page, 'Gamma'); await key(page, 'Delete'); await expect(row(page, 'Gamma')).toHaveCount(0);
  states.push(await snapshot(page, ids.show)); await select(page, 'Alpha'); await page.getByTestId('cue-label').fill('Renamed');
  await parkFocusOffControls(page); await expect(row(page, 'Renamed')).toBeVisible(); states.push(await snapshot(page, ids.show));
  for (let i = 3; i >= 0; i--) { await key(page, 'Control+z'); await expectSlice(page, ids.show, states[i]); }
  for (let i = 1; i < states.length; i++) { await key(page, i % 2 ? 'Control+Shift+z' : 'Control+y'); await expectSlice(page, ids.show, states[i]); }
  await expect(page.getByTestId('rundown-note')).toHaveClass(/status-ok/);
  await page.screenshot({ path: test.info().outputPath('history-desktop.png'), fullPage: true });
  await page.reload(); await expect(page.getByTestId('production-page')).toBeVisible(); await expectSlice(page, ids.show, states[4]);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, states[4]);
});

test('typing across idle saves is one step, native text undo owns focus, and no timer reapplies an inverse', async ({ page }) => {
  const ids = await seed(page), initial = await snapshot(page, ids.show);
  await duplicate(page); const before = await snapshot(page, ids.show);
  await select(page, 'Alpha'); const input = page.getByTestId('cue-label');
  await input.fill('One'); await expect(row(page, 'One')).toBeVisible(); await settleDurableWrites(page);
  await input.press('End'); await input.pressSequentially(' two'); await expect(row(page, 'One two')).toBeVisible();
  await input.press('Control+z'); await expect(input).not.toHaveValue('One two');
  await expect(row(page, 'Alpha copy')).toBeVisible();
  await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(4);
  await input.fill('Final'); await parkFocusOffControls(page); await expect(row(page, 'Final')).toBeVisible(); const after = await snapshot(page, ids.show);
  await key(page, 'Meta+z'); await expectSlice(page, ids.show, before);
  await page.waitForTimeout(650); await expectSlice(page, ids.show, before);
  await key(page, 'Meta+Shift+z'); await expectSlice(page, ids.show, after);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, initial);
  await page.reload(); await expect(row(page, 'Alpha')).toBeVisible(); await expectSlice(page, ids.show, initial);
});

test('failed forward edits preserve redo and a failed inverse remains retryable', async ({ page }) => {
  const ids = await seed(page), before = await snapshot(page, ids.show);
  await duplicate(page); const after = await snapshot(page, ids.show);
  await failNextPut(page); await key(page, 'Control+z');
  await expect(page.getByTestId('rundown-note')).toContainText('storage is full'); await expectSlice(page, ids.show, after);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  await failNextPut(page); await select(page, 'Gamma'); await key(page, 'Delete');
  await expect(page.getByTestId('rundown-note')).toContainText('storage is full'); await expectSlice(page, ids.show, before);
  await key(page, 'Control+y'); await expectSlice(page, ids.show, after); await expect(row(page, 'Gamma')).toBeVisible();
});

test('metadata survives inverse; remote rundown changes, another production and paused identity clear history', async ({ page }) => {
  const ids = await seed(page), before = await snapshot(page, ids.show); await duplicate(page);
  await page.evaluate(async ids => { const m = await import('/src/model/shows.ts'); const current = m.loadShows().find(s => s.id === ids.show)!; m.upsertShow({ ...current, name: 'Renamed production', data: { score: 9 }, outputSlug: 'keep-this-link' }); m.upsertShow({ ...m.loadShows().find(s => s.id === ids.other)!, name: 'Other renamed' }); }, ids);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  expect(await page.evaluate(async id => { const s = (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)!; return [s.name, s.data, s.outputSlug]; }, ids.show)).toEqual(['Renamed production', { score: 9 }, 'keep-this-link']);
  await key(page, 'Control+y'); await expect(row(page, 'Alpha copy')).toBeVisible();
  await page.evaluate(async ids => { const m = await import('/src/model/shows.ts'); m.updateShowCue(ids.show, ids.cues[0], { label: 'Teammate' }); }, ids);
  await expect(page.getByTestId('rundown-note')).toContainText('changed elsewhere'); const remote = await snapshot(page, ids.show);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, remote);
  await select(page, 'Teammate'); await page.getByTestId('cue-label').fill('Last character');
  await page.goto(`/app#/production/${ids.other}`); await expect(page.getByTestId('production-page')).toBeVisible(); await key(page, 'Control+z');
  await page.goto(`/app#/production/${ids.show}`); await expect(row(page, 'Last character')).toBeVisible();
});

test('menus, repeat, composition and hidden workspaces never run application inverse', async ({ page }) => {
  const ids = await seed(page); await duplicate(page); const after = await snapshot(page, ids.show);
  await row(page, 'Alpha').getByTestId('cue-menu').click(); await page.keyboard.press('Control+z'); await expectSlice(page, ids.show, after); await page.keyboard.press('Escape');
  await page.getByTestId('production-setup').click(); await page.getByTestId('setup-playout-settings').click();
  await expect(page.getByTestId('playout-settings')).toBeVisible();
  await key(page, 'Control+z'); await expectSlice(page, ids.show, after);
  await page.getByTestId('playout-settings-close').click();
  await holdKeyRepeats(page, 4, 'Delete', 'Delete'); await expectSlice(page, ids.show, after);
  await page.evaluate(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, isComposing: true })); const e = new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, cancelable: true }); e.preventDefault(); window.dispatchEvent(e); });
  await expectSlice(page, ids.show, after);
  await page.goto(`/app#/production/${ids.show}/data`); await expect(page.getByTestId('production-data')).toBeVisible();
  await key(page, 'Control+z'); await expectSlice(page, ids.show, after);
  await page.goto(`/app#/production/${ids.show}`); await expect(page.getByTestId('production-page')).toBeVisible();
  await key(page, 'Control+z'); await expect(row(page, 'Alpha copy')).toHaveCount(0);
});

test('multi-cue deletion restores the exact shared source and its pruned folder', async ({ page }) => {
  const ids = await seed(page), before = await snapshot(page, ids.show);
  await select(page, 'Alpha'); await row(page, 'Beta').getByTestId('select-cue').click({ modifiers: ['Control'] });
  await key(page, 'Delete'); await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(1);
  const removed = await snapshot(page, ids.show), slice = JSON.parse(removed);
  expect(slice.graphics).toHaveLength(1); expect(slice.folders).toHaveLength(1);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  await key(page, 'Control+y'); await expectSlice(page, ids.show, removed);
  await page.reload(); await expect(page.getByTestId('production-page')).toBeVisible(); await expectSlice(page, ids.show, removed);
});

test('team inverse retries a failed save and refuses a conflicting teammate rundown', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page), before = await snapshot(page, ids.show);
  await duplicate(page); await expect.poll(() => state.doc?.cues?.length).toBe(4); const after = await snapshot(page, ids.show);
  state.fail = true; await key(page, 'Control+z');
  await expect(page.getByTestId('rundown-note')).toContainText('Injected team save failure'); await expectSlice(page, ids.show, after);
  state.fail = false; await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  await key(page, 'Control+y'); await expectSlice(page, ids.show, after);
  state.doc!.cues![0].label = 'Teammate'; advance();
  await key(page, 'Control+z');
  await expect(page.getByTestId('rundown-note')).toContainText('changed elsewhere'); await expect(row(page, 'Teammate')).toBeVisible(); await expect(row(page, 'Alpha copy')).toBeVisible();
  const remote = await snapshot(page, ids.show); await key(page, 'Control+z'); await expectSlice(page, ids.show, remote);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('team metadata CAS retry preserves metadata and a recovered forward save becomes one acknowledged step', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page), before = await snapshot(page, ids.show);
  await duplicate(page); await expect.poll(() => state.doc?.cues?.length).toBe(4);
  state.doc!.name = 'Remote production name'; state.doc!.data = { remote: 7 }; advance();
  const calls = state.calls; await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  expect(state.calls - calls).toBe(2); expect(state.doc!.name).toBe('Remote production name'); expect(state.doc!.data).toEqual({ remote: 7 });
  state.fail = true; await select(page, 'Gamma'); await key(page, 'Delete');
  await expect(page.getByTestId('rundown-note')).toContainText('Injected team save failure'); await expect(row(page, 'Gamma')).toHaveCount(0);
  const failedCalls = state.calls; await key(page, 'Control+y'); expect(state.calls).toBe(failedCalls);
  state.fail = false;
  await page.evaluate(async id => { await (await import('/src/backend/teamProductions.ts')).flushTeamProduction(id); }, ids.show);
  await expect.poll(() => state.doc?.cues?.length).toBe(2);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  await key(page, 'Control+y'); await expect(row(page, 'Gamma')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('live Take and Out remain independent of a held team authoring acknowledgement and Delete queues behind it', async ({ page }) => {
  const fake = await fakeBridge(page); await seedSettings(page);
  const { state } = await teamBackend(page, true);
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  const calls = state.calls;
  try {
    await select(page, 'Alpha'); await page.getByTestId('cue-label').fill('Waiting for cloud');
    await parkFocusOffControls(page); await expect.poll(() => state.calls).toBeGreaterThan(calls);
    await select(page, 'GAMMA'); await key(page, 'Space');
    await expect.poll(() => fake.actions.length, { message: 'Take must reach Bridge while the authoring save remains held' }).toBe(1);
    await key(page, '0');
    await expect.poll(() => fake.actions.length, { message: 'Out must reach Bridge while the authoring save remains held' }).toBe(2);
    await key(page, 'Delete');
  } finally { release(); }
  await expect(page.getByTestId('production-team-save')).toHaveCount(0);
  await expect(row(page, 'GAMMA'), 'the Delete press must remain queued while the previous save is pending').toHaveCount(0);
  expect(fake.actions).toHaveLength(2);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('timed advancement during typing remains independent of a held team acknowledgement', async ({ page }) => {
  const { ids, state } = await teamBackend(page);
  await page.evaluate(async ids => {
    (await import('/src/model/shows.ts')).setCueAuto(ids.show, ids.cues[0], { after: 2, then: 'next' });
    await (await import('/src/backend/teamProductions.ts')).flushTeamProduction(ids.show);
  }, ids);
  await select(page, 'Alpha'); await key(page, 'Space'); await expect(row(page, 'Alpha')).toHaveClass(/up-here/);
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.getByTestId('cue-label').fill('Still typing');
    // Allow the documented three-second output-anchor fallback plus the two-second cue timer.
    await expect(row(page, 'Beta'), 'the timed cue must advance before the held authoring save is released').toHaveClass(/up-here/, { timeout: 10000 });
  } finally { release(); }
  await expect(page.getByTestId('production-team-save')).toHaveCount(0);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('restored server sources stay off, live redo refuses removal, and inverse sends zero Bridge commands', async ({ page }) => {
  const fake = await fakeBridge(page); await seedSettings(page); const ids = await seed(page, true), before = await snapshot(page, ids.show);
  await select(page, 'GAMMA'); await key(page, 'Delete'); await expect(row(page, 'GAMMA')).toHaveCount(0);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before); expect(fake.actions).toHaveLength(0);
  await select(page, 'GAMMA'); await key(page, 'Space'); await expect.poll(() => fake.actions.length).toBe(1);
  await key(page, 'Control+y'); await expect(page.getByTestId('rundown-note')).toContainText('off air'); expect(fake.actions).toHaveLength(1); await expect(row(page, 'GAMMA')).toBeVisible();
  await key(page, '0'); await expect.poll(() => fake.actions.length).toBe(2);
  await key(page, 'Control+y'); await expect(row(page, 'GAMMA')).toHaveCount(0); expect(fake.actions).toHaveLength(2);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before); expect(fake.actions).toHaveLength(2);
});

test('a running folder keeps its members until stopped, and folder undo never sends Out', async ({ page }) => {
  const fake = await fakeBridge(page); await seedSettings(page); const ids = await seed(page, true), before = await snapshot(page, ids.show);
  await row(page, 'GAMMA').getByTestId('cue-menu').click(); await page.getByTestId('cue-new-folder').click();
  const folder = page.getByTestId('cue-list').locator('.pd-folder').last(); await expect(folder).toBeVisible(); await folder.getByTestId('select-folder').click();
  await key(page, 'Space'); await expect.poll(() => fake.actions.length).toBe(1);
  await key(page, 'Control+z'); await expect(page.getByTestId('rundown-note')).toContainText('Stop the affected folder'); expect(fake.actions).toHaveLength(1);
  await key(page, '0'); await expect.poll(() => fake.actions.length).toBe(2);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before); expect(fake.actions).toHaveLength(2);
});

test('prepared fields and notes are distinct intentions and a new successful edit clears redo', async ({ page }) => {
  const ids = await seed(page), before = await snapshot(page, ids.show); await select(page, 'Alpha');
  const field = page.getByTestId('cue-field-f0'); await field.fill('Prepared name'); await parkFocusOffControls(page);
  await expect.poll(async () => JSON.parse(await snapshot(page, ids.show)).cues[0].values.f0).toBe('Prepared name'); const prepared = await snapshot(page, ids.show);
  await page.getByTestId('cue-note').fill('After the intro'); await parkFocusOffControls(page);
  await expect.poll(async () => JSON.parse(await snapshot(page, ids.show)).cues[0].note).toBe('After the intro'); const noted = await snapshot(page, ids.show);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, prepared); await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  await key(page, 'Control+y'); await expectSlice(page, ids.show, prepared);
  await duplicate(page); const branch = await snapshot(page, ids.show); await key(page, 'Control+y'); await expectSlice(page, ids.show, branch);
  expect(branch).not.toBe(noted);
});

test('account pausing retains the last character and clears application history', async ({ page }) => {
  await page.addInitScript(() => { if (window.top === window) localStorage.setItem('spx-gfx-account', 'history-account'); });
  const ids = await seed(page);
  await expect(row(page, 'Alpha')).toBeVisible(); await duplicate(page); await select(page, 'Alpha');
  await page.getByTestId('cue-label').fill('Retain last character');
  await page.evaluate(async () => (await import('/src/model/durableStore.ts')).setAccountAuthoringEnabled(false));
  await settleDurableWrites(page); const paused = await snapshot(page, ids.show);
  expect(JSON.parse(paused).cues[0].label).toBe('Retain last character');
  await key(page, 'Control+z'); await expectSlice(page, ids.show, paused);
  await page.evaluate(async () => (await import('/src/model/durableStore.ts')).setAccountAuthoringEnabled(true));
  await key(page, 'Control+z'); await expectSlice(page, ids.show, paused);
});

test('retention bounds embedded assets and records actual heap separately from serialized bytes', async ({ page }) => {
  const ids = await seed(page), cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage'); const baseline = await cdp.send('Runtime.getHeapUsage');
  const retained = await page.evaluate(async id => {
    const m = await import('/src/model/shows.ts'), h = await import('/src/model/rundownHistory.ts');
    const history = new h.RundownHistory(), start = h.rundownSlice(m.loadShows().find(s => s.id === id)!);
    start.graphics[0].template.assets.push({ path: 'retained-asset.png', mime: 'image/png', data: 'a'.repeat(512 * 1024) });
    let before = start;
    for (let i = 0; i < 75; i++) { const next = structuredClone(before); next.cues[0].label = String(i); history.record(before, next, 'Edit cue'); before = next; }
    (window as unknown as { __measuredHistory: unknown }).__measuredHistory = history;
    return { entries: history.undo.length, bytes: history.bytes(), limit: history.byteLimit };
  }, ids.show);
  await cdp.send('HeapProfiler.collectGarbage'); const measured = await cdp.send('Runtime.getHeapUsage'); await cdp.detach();
  expect(retained.entries, 'embedded assets must also exercise the byte limit').toBeLessThan(50);
  expect(retained.entries).toBeGreaterThan(0); expect(retained.bytes).toBeLessThanOrEqual(retained.limit);
  const report = JSON.stringify({ ...retained, baselineHeap: baseline.usedSize, retainedHeap: measured.usedSize });
  console.log('History retention', report);
  await test.info().attach('history-retention.json', { body: report, contentType: 'application/json' });
});
