// runs on: dev server - swaps src/backend/config.ts over the network to stand in a backend
// covers: src/components/home/{ProductionPage,useRundownHistory,CueRundown}.ts*, src/components/playoutKeys.ts
// covers: src/components/home/CueEditor.tsx
// covers: src/model/{rundownHistory,shows,durableStore}.ts, src/backend/teamProductions.ts
// covers: src/control/playoutSession.ts, src/control/productionDataSession.ts, src/components/home/useStorePart.ts
// covers: src/components/home/useRundownAuthoring.ts
// covers: src/control/cueDraft.ts
// covers: src/control/{bridgeWatch,serverVerbs}.ts
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
  state.doc = await page.evaluate(async id => (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === id)!, ids.show);
  await page.evaluate(async owner => { const m = await __noacgImport('/src/backend/teamProductions.ts'); m.startTeamSync(owner); await m.refreshTeams(); }, owner);
  await expect.poll(() => page.evaluate(async id => (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === id)?.teamId, ids.show)).toBe(team);
  return { ids, state, advance };
}

async function seed(page: Page, server = false) {
  await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible();
  const ids = await page.evaluate(async server => {
    const m = await __noacgImport('/src/model/shows.ts'), { variantsFor } = await __noacgImport('/src/templates/catalog.ts');
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
// A server action reaching the fake Bridge is not the page knowing its answer. A press that depends
// on what is on air (Out, Delete, undo, redo) waits for the row to show it, as an operator would.
const ON_AIR = /on-air|up-here/;
const shownOn = (page: Page, name: string) => expect(row(page, name)).toHaveClass(ON_AIR);
const shownOff = (page: Page, name: string) => expect(row(page, name)).not.toHaveClass(ON_AIR);
async function select(page: Page, name: string) { await row(page, name).getByTestId('select-cue').click(); }
async function snapshot(page: Page, id: string) {
  await settleDurableWrites(page);
  return page.evaluate(async id => {
    const m = await __noacgImport('/src/model/shows.ts'), h = await __noacgImport('/src/model/rundownHistory.ts');
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
  // Nothing is left in flight or failed; a build with no backend has no chip at all.
  await expect(page.locator('[data-testid="sync-status"]:is([data-tone="quiet"], [data-tone="warn"])')).toHaveCount(0);
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
  await page.evaluate(async ids => { const m = await __noacgImport('/src/model/shows.ts'); const current = m.loadShows().find(s => s.id === ids.show)!; m.upsertShow({ ...current, name: 'Renamed production', data: { score: 9 }, outputSlug: 'keep-this-link' }); m.upsertShow({ ...m.loadShows().find(s => s.id === ids.other)!, name: 'Other renamed' }); }, ids);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before);
  expect(await page.evaluate(async id => { const s = (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === id)!; return [s.name, s.data, s.outputSlug]; }, ids.show)).toEqual(['Renamed production', { score: 9 }, 'keep-this-link']);
  await key(page, 'Control+y'); await expect(row(page, 'Alpha copy')).toBeVisible();
  await page.evaluate(async ids => { const m = await __noacgImport('/src/model/shows.ts'); m.updateShowCue(ids.show, ids.cues[0], { label: 'Teammate' }); }, ids);
  await expect(page.getByTestId('rundown-note')).toContainText('changed elsewhere'); const remote = await snapshot(page, ids.show);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, remote);
  await select(page, 'Teammate'); await page.getByTestId('cue-label').fill('Last character');
  await page.goto(`/app#/production/${ids.other}`); await expect(page.getByTestId('production-page')).toBeVisible(); await key(page, 'Control+z');
  await page.goto(`/app#/production/${ids.show}`); await expect(row(page, 'Last character')).toBeVisible();
});

test('a change elsewhere in the rundown never discards the cue being typed (#2572)', async ({ page }) => {
  const ids = await seed(page);
  await select(page, 'Alpha'); const input = page.getByTestId('cue-label');
  // Typed, and before its idle save another tab or a teammate renames a different cue.
  await input.fill('Typed here');
  await page.evaluate(async ids => { const m = await __noacgImport('/src/model/shows.ts'); m.updateShowCue(ids.show, ids.cues[1], { label: 'Renamed elsewhere' }); }, ids);
  await expect(row(page, 'Renamed elsewhere')).toBeVisible();
  await expect(page.getByTestId('rundown-note')).toContainText('changed elsewhere');
  await expect(input).toHaveValue('Typed here');
  await expect(row(page, 'Typed here')).toBeVisible();
  await settleDurableWrites(page);
  await expect(page.getByTestId('rundown-note')).toContainText('changed elsewhere');
  // Typed again after its idle save landed, and the other cue changes while the save is still queued.
  await input.fill('Typed again');
  await page.waitForTimeout(320);
  await page.evaluate(async ids => { const m = await __noacgImport('/src/model/shows.ts'); m.updateShowCue(ids.show, ids.cues[1], { label: 'Renamed twice' }); }, ids);
  await expect(row(page, 'Renamed twice')).toBeVisible();
  await expect(input).toHaveValue('Typed again');
  const labels = async () => { await settleDurableWrites(page); return page.evaluate(async id => (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === id)!.cues!.map(c => c.label), ids.show); };
  await expect.poll(labels).toEqual(['Typed again', 'Renamed twice', 'Gamma']);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
  // D7: Undo takes back the typing only; the change made elsewhere stays.
  await key(page, 'Control+z');
  await expect.poll(labels).toEqual(['Typed here', 'Renamed twice', 'Gamma']);
});

test('a teammate\'s save to another cue, adopted while a cue is typed, keeps both (#2572, D1, D5)', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page);
  await select(page, 'Alpha');
  await page.getByTestId('cue-label').fill('Team typed');
  // Before its idle save: a teammate's save renaming a different cue lands and this page adopts it,
  // as the team read does (model/teamShows.ts applyServerTeamShows).
  state.doc = { ...state.doc!, cues: state.doc!.cues!.map(c => (c.id === ids.cues[1] ? { ...c, label: 'Teammate rename' } : c)) };
  advance();
  await page.evaluate(async ({ id, doc }) => {
    const teamShows = await __noacgImport('/src/model/teamShows.ts');
    const held = teamShows.loadTeamShows().find(s => s.id === id)!;
    teamShows.applyServerTeamShows([{ ...held, cues: doc.cues }], new Set());
  }, { id: ids.show, doc: state.doc });
  await expect(row(page, 'Teammate rename')).toBeVisible();
  await expect(page.getByTestId('cue-label')).toHaveValue('Team typed');
  await expect.poll(() => state.doc?.cues?.map(c => c.label)).toEqual(['Team typed', 'Teammate rename', 'Gamma']);
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('after a change elsewhere kept the typing, a change to the typed cue itself still wins (#2572, D1 then D3)', async ({ page }) => {
  const ids = await seed(page);
  await select(page, 'Alpha'); const input = page.getByTestId('cue-label');
  await input.fill('Typed here');
  // Before the idle save: first a different cue, then the typed cue itself, renamed elsewhere.
  await page.evaluate(async ids => {
    const m = await __noacgImport('/src/model/shows.ts');
    m.updateShowCue(ids.show, ids.cues[1], { label: 'Renamed elsewhere' });
    await new Promise(resolve => setTimeout(resolve, 50));
    m.updateShowCue(ids.show, ids.cues[0], { label: 'Theirs' });
  }, ids);
  await expect(row(page, 'Theirs')).toBeVisible();
  await expect(input).toHaveValue('Theirs');
  await page.waitForTimeout(700);
  await settleDurableWrites(page);
  expect(await page.evaluate(async id => (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === id)!.cues!.map(c => c.label), ids.show)).toEqual(['Theirs', 'Renamed elsewhere', 'Gamma']);
});

test('deleting the cue just typed in stays one undoable step, with no note of a change elsewhere (#2572, D6)', async ({ page }) => {
  const ids = await seed(page);
  await select(page, 'Gamma'); await page.getByTestId('cue-label').fill('Typed then deleted');
  await parkFocusOffControls(page); await expect(row(page, 'Typed then deleted')).toBeVisible();
  await settleDurableWrites(page);
  const typed = await snapshot(page, ids.show);
  await select(page, 'Typed then deleted'); await key(page, 'Delete');
  await expect(row(page, 'Typed then deleted')).toHaveCount(0);
  await settleDurableWrites(page);
  await expect(page.getByTestId('rundown-note').filter({ hasText: 'changed elsewhere' })).toHaveCount(0);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, typed);
});

test('a typed save that storage refuses keeps the typed text and says why (#2572, D6)', async ({ page }) => {
  await seed(page);
  await select(page, 'Alpha'); const input = page.getByTestId('cue-label');
  await failNextPut(page);
  await input.fill('Typed while full');
  await expect(page.getByTestId('rundown-note')).toContainText('storage is full');
  await page.waitForTimeout(500);
  await expect(input).toHaveValue('Typed while full');
  await expect(page.getByTestId('rundown-note')).not.toContainText('changed elsewhere');
  // Storage has room again: typing on saves, and the refused write is not taken for a change elsewhere.
  await input.fill('Typed while full, then saved');
  await parkFocusOffControls(page);
  await expect(row(page, 'Typed while full, then saved')).toBeVisible();
  await expect(input).toHaveValue('Typed while full, then saved');
  await expect(page.getByTestId('rundown-note').filter({ hasText: 'changed elsewhere' })).toHaveCount(0);
});

test('typing queued behind a held team save survives a teammate\'s change to another cue (#2572, D5)', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page);
  await select(page, 'Alpha'); const input = page.getByTestId('cue-label');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  const calls = state.calls;
  try {
    await input.fill('One');
    await expect.poll(() => state.calls, { message: 'the first save is out' }).toBeGreaterThan(calls);
    // Typing goes on: its save waits in the page's queue behind the held one.
    await input.fill('One two');
    await page.waitForTimeout(400);
    // A teammate's save renaming a different cue lands meanwhile.
    state.doc = { ...state.doc!, cues: state.doc!.cues!.map(c => (c.id === ids.cues[1] ? { ...c, label: 'Teammate rename' } : c)) };
    advance();
  } finally { release(); }
  await expect.poll(() => state.doc?.cues?.map(c => c.label), { timeout: 15_000 }).toEqual(['One two', 'Teammate rename', 'Gamma']);
  await expect(input).toHaveValue('One two');
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a held team draft keeps its text when a teammate changes that cue’s accent (#2572, D1, D5)', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page);
  await select(page, 'Alpha');
  const input = page.getByTestId('cue-label');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  const calls = state.calls;
  try {
    await input.fill('Local Alpha');
    await expect.poll(() => state.calls, { message: 'the draft save is out' }).toBeGreaterThan(calls);
    state.doc = { ...state.doc!, cues: state.doc!.cues!.map(c => (c.id === ids.cues[0] ? { ...c, accentColor: '#6600CC' } : c)) };
    advance();
  } finally { release(); }
  await expect.poll(() => state.doc?.cues?.find(c => c.id === ids.cues[0]), { timeout: 15_000 })
    .toMatchObject({ label: 'Local Alpha', accentColor: '#6600CC' });
  await expect(input).toHaveValue('Local Alpha');
  await expect(page.getByTestId('cue-unsent')).toBeEmpty();
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a queued draft checks its own cue after the editor moves to another cue (#2572, D3)', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page);
  const input = page.getByTestId('cue-label');
  await select(page, 'Gamma');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  const calls = state.calls;
  try {
    await input.fill('Local Gamma');
    await expect.poll(() => state.calls, { message: 'the first save is out' }).toBeGreaterThan(calls);
    await select(page, 'Alpha');
    await input.fill('Local Alpha');
    await select(page, 'Beta');
    await input.fill('Local Beta');
    state.doc = { ...state.doc!, cues: state.doc!.cues!.map(c => (c.id === ids.cues[0] ? { ...c, label: 'Teammate Alpha' } : c)) };
    advance();
  } finally { release(); }
  await expect.poll(() => state.doc?.cues?.map(c => c.label), { timeout: 15_000 }).toEqual(['Teammate Alpha', 'Local Beta', 'Local Gamma']);
  await expect(input).toHaveValue('Local Beta');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('leaving a production drops its queued draft write (#2572, D6)', async ({ page }) => {
  const { ids, state } = await teamBackend(page);
  const input = page.getByTestId('cue-label');
  await select(page, 'Gamma');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  const calls = state.calls;
  try {
    await input.fill('Local Gamma');
    await expect.poll(() => state.calls, { message: 'the first save is out' }).toBeGreaterThan(calls);
    await select(page, 'Alpha');
    await input.fill('Queued Alpha');
    await select(page, 'Beta');
    await page.evaluate(id => { window.location.hash = '/production/' + id; }, ids.other);
    await expect(page.getByTestId('production-page')).toBeVisible();
    await expect(row(page, 'Beta')).toHaveCount(0);
  } finally { release(); }
  await expect.poll(() => state.doc?.cues?.find(c => c.id === ids.cues[2])?.label).toBe('Local Gamma');
  await expect.poll(() => page.evaluate(async id => {
    const m = await __noacgImport('/src/backend/teamProductions.ts');
    return m.getTeamState().saving[id] ?? null;
  }, ids.show)).toBeNull();
  await settleDurableWrites(page);
  expect(state.doc?.cues?.find(c => c.id === ids.cues[0])?.label).toBe('Alpha');
  expect(state.calls).toBe(calls + 1);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('leaving keeps the last keystroke over a team draft save still in flight (#2572, D6)', async ({ page }) => {
  const { ids, state } = await teamBackend(page);
  await select(page, 'Alpha');
  const input = page.getByTestId('cue-label');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  const calls = state.calls;
  try {
    await input.fill('First draft');
    await expect.poll(() => state.calls).toBeGreaterThan(calls);
    await input.fill('Last keystroke');
    await page.evaluate(id => { window.location.hash = '/production/' + id; }, ids.other);
    await expect(page.getByTestId('production-page')).toBeVisible();
    await expect(row(page, 'Beta')).toHaveCount(0);
  } finally { release(); }
  await expect.poll(() => state.doc?.cues?.find(c => c.id === ids.cues[0])?.label, { timeout: 15_000 }).toBe('Last keystroke');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('an ordinary team save in flight keeps the checked draft that follows it (#2572, D1, D5)', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page);
  await select(page, 'Alpha');
  let releaseOrdinary!: () => void;
  let releaseDraft!: () => void;
  state.hold = new Promise<void>(resolve => { releaseOrdinary = resolve; });
  const calls = state.calls;
  try {
    await page.evaluate(async ids => {
      const shows = await __noacgImport('/src/model/shows.ts');
      shows.updateShowCueChecked(ids.show, ids.cues[0], { label: 'Ordinary update' });
    }, ids);
    await expect.poll(() => state.calls).toBeGreaterThan(calls);
    await expect(page.getByTestId('cue-label')).toHaveValue('Ordinary update');
    await page.getByTestId('cue-label').fill('Checked draft');
    await expect.poll(() => page.evaluate(async ids => {
      const shows = await __noacgImport('/src/model/shows.ts');
      return shows.loadShows().find(show => show.id === ids.show)?.cues?.find(c => c.id === ids.cues[0])?.label;
    }, ids)).toBe('Checked draft');
    await settleDurableWrites(page);
    // The draft must remain recoverable from the outbox before the earlier request is answered.
    await expect.poll(() => page.evaluate(async ({ show, cues }) => {
      const { durable } = await __noacgImport('/src/model/durableStore.ts');
      const pending = JSON.parse(durable.getItem('spx-gfx-team-outbox') ?? '{}').edits?.[show];
      return (pending?.cueDrafts ?? []).some((proof: { cueId: string; before: string; after: string }) =>
        proof.cueId === cues[0] && JSON.parse(proof.before).label === 'Ordinary update' && JSON.parse(proof.after).label === 'Checked draft');
    }, ids)).toBe(true);
    state.hold = new Promise<void>(resolve => { releaseDraft = resolve; });
    releaseOrdinary();
    await expect.poll(() => state.doc?.cues?.find(c => c.id === ids.cues[0])?.label).toBe('Ordinary update');
    await expect.poll(() => state.calls).toBeGreaterThan(calls + 1);
    state.doc = { ...state.doc!, cues: state.doc!.cues!.map(c => (c.id === ids.cues[0] ? { ...c, accentColor: '#6600CC' } : c)) };
    advance();
  } finally {
    releaseOrdinary();
    releaseDraft?.();
  }
  await expect.poll(() => state.doc?.cues?.find(c => c.id === ids.cues[0]), { timeout: 15_000 })
    .toMatchObject({ label: 'Checked draft', accentColor: '#6600CC' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('an ordinary cue write cannot persist a rejected draft from the mirror (#2572, D3)', async ({ page }) => {
  const ids = await seed(page);
  await select(page, 'Alpha');
  await page.evaluate(async ids => {
    const shows = await __noacgImport('/src/model/shows.ts');
    const store = await __noacgImport('/src/model/durableStore.ts');
    const { durable } = store;
    const original = IDBObjectStore.prototype.get;
    const key = 'spx-gfx-shows';
    let reportRefusals!: (errors: (string | null)[]) => void;
    (window as unknown as { dependentWriteErrors: Promise<(string | null)[]> }).dependentWriteErrors =
      new Promise(resolve => { reportRefusals = resolve; });
    const committedElsewhere = JSON.parse(durable.getItem(key)!) as Show[];
    committedElsewhere.find(show => show.id === ids.show)!.cues!.find(cue => cue.id === ids.cues[0])!.label = 'Remote Alpha';
    // Write straight to IndexedDB to hold the mirror notification from the other tab.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noacg-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(JSON.stringify(committedElsewhere), key);
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error);
    });
    db.close();
    // Start the ordinary save while the draft's optimistic text is still in the mirror.
    IDBObjectStore.prototype.get = function(k) {
      if (k === key) {
        IDBObjectStore.prototype.get = original;
        queueMicrotask(() => {
          shows.updateShowCueChecked(ids.show, ids.cues[1], { label: 'Ordinary Beta' });
          const opaque = JSON.parse(durable.getItem(key)!) as Show[];
          const show = opaque.find(show => show.id === ids.show)!;
          const { receipts } = store.captureDurableWrites(key, () => {
            show.name = 'First dependent write';
            durable.setItem(key, JSON.stringify(opaque));
            show.name = 'Second dependent write';
            durable.setItem(key, JSON.stringify(opaque));
          });
          void Promise.all(receipts.map(store.commitDurableReceipt)).then(reportRefusals);
        });
      }
      return original.call(this, k);
    };
  }, ids);
  await page.getByTestId('cue-label').fill('Rejected Alpha');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush')));
  await expect(row(page, 'Ordinary Beta')).toBeVisible();
  const errors = await page.evaluate(() =>
    (window as unknown as { dependentWriteErrors: Promise<(string | null)[]> }).dependentWriteErrors);
  expect(errors).toEqual(Array(2).fill('The production changed before this save. Try the edit again.'));
  await settleDurableWrites(page);
  await page.reload();
  await expect(row(page, 'Remote Alpha')).toBeVisible();
  await expect(row(page, 'Ordinary Beta')).toBeVisible();
  await expect(row(page, 'Rejected Alpha')).toHaveCount(0);
  const name = () => page.evaluate(async id => {
    const shows = await __noacgImport('/src/model/shows.ts');
    return shows.loadShows().find(show => show.id === id)?.name;
  }, ids.show);
  expect(await name()).toBe('History');
  await page.evaluate(async id => {
    const { durable } = await __noacgImport('/src/model/durableStore.ts');
    const current = JSON.parse(durable.getItem('spx-gfx-shows')!) as Show[];
    current.find(show => show.id === id)!.name = 'Fresh production write';
    durable.setItem('spx-gfx-shows', JSON.stringify(current));
  }, ids.show);
  await settleDurableWrites(page);
  await page.reload();
  await expect(row(page, 'Remote Alpha')).toBeVisible();
  await expect(row(page, 'Ordinary Beta')).toBeVisible();
  expect(await name()).toBe('Fresh production write');
});

test('typing continues from the words an IndexedDB rebase actually committed (#2572, D5)', async ({ page }) => {
  const ids = await seed(page);
  const cueId = await page.evaluate(async id => {
    const shows = await __noacgImport('/src/model/shows.ts');
    const { variantById } = await __noacgImport('/src/templates/catalog.ts');
    const { durable } = await __noacgImport('/src/model/durableStore.ts');
    shows.addGraphicToShow(id, { ...variantById('wc01')!.create({}), name: 'Words' });
    const records = shows.loadShows(), show = records.find(item => item.id === id)!;
    const cue = show.cues!.at(-1)!;
    cue.label = 'Words';
    cue.values = { ...cue.values, f1: 'One word?', f2: 'keep | 1' };
    show.questions = [{ id: 'q-word', type: 'word', text: 'One word?' }];
    show.resultCues = { 'q-word': cue.id };
    durable.setItem('spx-gfx-shows', JSON.stringify(records));
    return cue.id;
  }, ids.show);
  await settleDurableWrites(page);
  await page.reload();
  await select(page, 'Words');
  const field = page.getByTestId('cue-field-f2');
  await expect(field).toHaveValue('keep | 1');
  await page.evaluate(async id => {
    const { durable } = await __noacgImport('/src/model/durableStore.ts');
    const storageKey = 'spx-gfx-shows';
    const records = JSON.parse(durable.getItem(storageKey)!) as Show[];
    records.find(show => show.id === id)!.questions = [{ id: 'q-word', type: 'word', text: 'One word?', hidden: ['apple'] }];
    // The other tab committed Hide. Hold the mirror notification until this tab rebases.
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('noacg-studio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(JSON.stringify(records), storageKey);
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
      });
    } finally { db.close(); }
    const original = IDBObjectStore.prototype.get;
    IDBObjectStore.prototype.get = function(key) {
      if (key === storageKey) {
        IDBObjectStore.prototype.get = original;
        // Start the next edit while the first transaction is still open.
        queueMicrotask(() => {
          const label = document.querySelector<HTMLInputElement>('[data-testid="cue-label"]')!;
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(label, 'Kept typing');
          label.dispatchEvent(new Event('input', { bubbles: true }));
          window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush'));
        });
      }
      return original.call(this, key);
    };
  }, ids.show);
  await field.fill('keep | 1\napple | 1\nnew | 1');
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('noacg-account-authoring-flush')));
  await expect.poll(async () => {
    const saved = JSON.parse(await snapshot(page, ids.show)) as Pick<Show, 'cues'>;
    const cue = saved.cues?.find(row => row.id === cueId);
    return [cue?.label, cue?.values.f2];
  }).toEqual(['Kept typing', 'keep | 1\nnew | 1']);
  await page.reload();
  await select(page, 'Kept typing');
  await expect(field).toHaveValue('keep | 1\nnew | 1');
});

test('ordinary cue writes back to the sent draft text revoke draft-only merge authority (#2572, D6)', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page);
  await select(page, 'Alpha');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  const calls = state.calls;
  try {
    await page.getByTestId('cue-label').fill('Sent draft');
    await expect.poll(() => state.calls).toBeGreaterThan(calls);
    await page.evaluate(async ids => {
      const shows = await __noacgImport('/src/model/shows.ts');
      shows.updateShowCueChecked(ids.show, ids.cues[0], { label: 'Ordinary edit' });
      shows.updateShowCueChecked(ids.show, ids.cues[0], { label: 'Sent draft' });
    }, ids);
    await settleDurableWrites(page);
    state.doc = { ...state.doc!, cues: state.doc!.cues!.map(c => (c.id === ids.cues[0] ? { ...c, accentColor: '#6600CC' } : c)) };
    advance();
  } finally { release(); }
  await expect.poll(() => state.calls).toBeGreaterThan(calls + 1);
  await expect.poll(() => page.evaluate(async id => {
    const team = await __noacgImport('/src/backend/teamProductions.ts');
    return team.getTeamState().saving[id] ?? null;
  }, ids.show)).toBeNull();
  expect(state.doc?.cues?.find(c => c.id === ids.cues[0])).toMatchObject({ label: 'Alpha', accentColor: '#6600CC' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('an ordinary team edit cannot inherit another tab’s draft proof (#2572, D6)', async ({ page }) => {
  const { ids, state } = await teamBackend(page);
  const proofs = await page.evaluate(async ({ ids, token }) => {
    const shows = await __noacgImport('/src/model/shows.ts');
    const history = await __noacgImport('/src/model/rundownHistory.ts');
    const { durable, libraryInUse } = await __noacgImport('/src/model/durableStore.ts');
    const base = shows.loadShows().find(show => show.id === ids.show)!;
    const local = structuredClone(base);
    const cueId = ids.cues[0];
    local.cues!.find(cue => cue.id === cueId)!.label = 'Same bytes';
    const cueDrafts = [{ cueId, before: history.cueTextKey(base, cueId), after: history.cueTextKey(local, cueId) }];
    // As an adopted account-scoped outbox write arrives, this tab still holds its own base.
    const key = 'spx-gfx-team-outbox';
    durable.setItem(key, JSON.stringify({ v: 1, owner: libraryInUse(), edits: {
      [ids.show]: { token, base, local, teamId: base.teamId, updatedBy: null, cueDrafts },
    } }));
    shows.updateShowCueChecked(ids.show, cueId, { label: 'Same bytes' });
    const edit = JSON.parse(durable.getItem(key)!).edits[ids.show];
    return edit.cueDrafts ?? [];
  }, { ids, token: state.token });
  expect(proofs).toEqual([]);
  await settleDurableWrites(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('an acknowledged team draft cannot authorize the next save from its older baseline (#2572, D3)', async ({ page }) => {
  const { ids, state, advance } = await teamBackend(page);
  await select(page, 'Alpha');
  const input = page.getByTestId('cue-label');
  let releaseFirst!: () => void;
  let releaseNext!: () => void;
  state.hold = new Promise<void>(resolve => { releaseFirst = resolve; });
  const calls = state.calls;
  try {
    await input.fill('First draft');
    await expect.poll(() => state.calls).toBeGreaterThan(calls);
    await input.fill('Next draft');
    await page.evaluate(id => { window.location.hash = '/production/' + id; }, ids.other);
    await expect(row(page, 'Beta')).toHaveCount(0);
    await settleDurableWrites(page);
    state.hold = new Promise<void>(resolve => { releaseNext = resolve; });
    releaseFirst();
    await expect.poll(() => state.doc?.cues?.find(c => c.id === ids.cues[0])?.label).toBe('First draft');
    await expect.poll(() => state.calls).toBeGreaterThan(calls + 1);
    state.doc = { ...state.doc!, cues: state.doc!.cues!.map(c => (c.id === ids.cues[0] ? { ...c, label: 'Alpha', accentColor: '#6600CC' } : c)) };
    advance();
  } finally {
    releaseFirst();
    releaseNext?.();
  }
  await expect.poll(() => state.calls).toBeGreaterThan(calls + 2);
  await expect.poll(() => page.evaluate(async id => {
    const team = await __noacgImport('/src/backend/teamProductions.ts');
    return team.getTeamState().saving[id] ?? null;
  }, ids.show)).toBeNull();
  expect(state.doc?.cues?.find(c => c.id === ids.cues[0])).toMatchObject({ label: 'Alpha', accentColor: '#6600CC' });
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('hiding keeps an owed team draft if its local outbox never confirmed it (#2572, D6)', async ({ page }) => {
  const { ids, state } = await teamBackend(page);
  await select(page, 'Alpha');
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.evaluate(async () => {
      const { durable } = await __noacgImport('/src/model/durableStore.ts');
      const put = durable.setItem;
      durable.setItem = function(key, value) {
        if (key === 'spx-gfx-team-outbox') throw new DOMException('Injected full store', 'QuotaExceededError');
        put.call(this, key, value);
      };
    });
    await page.getByTestId('cue-label').fill('Recover this cue');
    await expect.poll(() => page.evaluate(async ids => {
      const shows = await __noacgImport('/src/model/shows.ts');
      return shows.loadShows().find(show => show.id === ids.show)?.cues?.find(c => c.id === ids.cues[0])?.label;
    }, ids)).toBe('Recover this cue');
    const owed = await page.evaluate(async id => {
      const { libraryInUse } = await __noacgImport('/src/model/durableStore.ts');
      window.dispatchEvent(new PageTransitionEvent('pagehide'));
      await new Promise(resolve => setTimeout(resolve, 0));
      return JSON.parse(localStorage.getItem('spx-gfx-owed-cue-edits@' + libraryInUse()) ?? '{}').shows?.[id];
    }, ids.show);
    expect(owed?.fields.label).toBe('Recover this cue');
  } finally { release(); }
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('a change elsewhere to the cue being typed itself keeps today\'s rule: the typed text gives way (#2572, D3)', async ({ page }) => {
  const ids = await seed(page);
  await select(page, 'Alpha'); const input = page.getByTestId('cue-label');
  await input.fill('Typed here');
  await page.evaluate(async ids => { const m = await __noacgImport('/src/model/shows.ts'); m.updateShowCue(ids.show, ids.cues[0], { label: 'Renamed elsewhere' }); }, ids);
  await expect(page.getByTestId('rundown-note')).toContainText('changed elsewhere');
  await expect(row(page, 'Renamed elsewhere')).toBeVisible();
  await expect(input).toHaveValue('Renamed elsewhere');
  await expect(row(page, 'Typed here')).toHaveCount(0);
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
  await page.evaluate(async id => { await (await __noacgImport('/src/backend/teamProductions.ts')).flushTeamProduction(id); }, ids.show);
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
    await shownOn(page, 'GAMMA');
    await key(page, '0');
    await expect.poll(() => fake.actions.length, { message: 'Out must reach Bridge while the authoring save remains held' }).toBe(2);
    await shownOff(page, 'GAMMA');
    await key(page, 'Delete');
  } finally { release(); }
  await expect(page.getByTestId('sync-status')).toHaveText('Synced');
  await expect(row(page, 'GAMMA'), 'the Delete press must remain queued while the previous save is pending').toHaveCount(0);
  expect(fake.actions).toHaveLength(2);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

test('timed advancement during typing remains independent of a held team acknowledgement', async ({ page }) => {
  const { ids, state } = await teamBackend(page);
  await page.evaluate(async ids => {
    (await __noacgImport('/src/model/shows.ts')).setCueAuto(ids.show, ids.cues[0], { after: 2, then: 'next' });
    await (await __noacgImport('/src/backend/teamProductions.ts')).flushTeamProduction(ids.show);
  }, ids);
  await select(page, 'Alpha'); await key(page, 'Space'); await expect(row(page, 'Alpha')).toHaveClass(/up-here/);
  let release!: () => void;
  state.hold = new Promise<void>(resolve => { release = resolve; });
  try {
    await page.getByTestId('cue-label').fill('Still typing');
    // Allow the documented three-second output-anchor fallback plus the two-second cue timer.
    await expect(row(page, 'Beta'), 'the timed cue must advance before the held authoring save is released').toHaveClass(/up-here/, { timeout: 10000 });
  } finally { release(); }
  await expect(page.getByTestId('sync-status')).toHaveText('Synced');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

// Its first Ctrl+Z comes right after the Delete's save settles, while the rundown history's queue
// can still be finishing that write. Such a press used to be dropped (#1649); it is now held until
// the write lands. Verified by fault injection (a 1.5 s delay after the durable receipt in
// useRundownHistory's write: 3 of 3 failed here before the fix, 3 of 3 passed after), not by a spec
// for the window, which nothing a spec does can hold open.
test('restored server sources stay off, live redo refuses removal, and inverse sends zero Bridge commands', async ({ page }) => {
  const fake = await fakeBridge(page); await seedSettings(page); const ids = await seed(page, true), before = await snapshot(page, ids.show);
  await select(page, 'GAMMA'); await key(page, 'Delete'); await expect(row(page, 'GAMMA')).toHaveCount(0);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before); expect(fake.actions).toHaveLength(0);
  await select(page, 'GAMMA'); await key(page, 'Space'); await expect.poll(() => fake.actions.length).toBe(1); await shownOn(page, 'GAMMA');
  await key(page, 'Control+y'); await expect(page.getByTestId('rundown-note')).toContainText('off air'); expect(fake.actions).toHaveLength(1); await expect(row(page, 'GAMMA')).toBeVisible();
  await key(page, '0'); await expect.poll(() => fake.actions.length).toBe(2); await shownOff(page, 'GAMMA');
  await key(page, 'Control+y'); await expect(row(page, 'GAMMA')).toHaveCount(0); expect(fake.actions).toHaveLength(2);
  await key(page, 'Control+z'); await expectSlice(page, ids.show, before); expect(fake.actions).toHaveLength(2);
});

test('a running folder keeps its members until stopped, and folder undo never sends Out', async ({ page }) => {
  const fake = await fakeBridge(page); await seedSettings(page); const ids = await seed(page, true), before = await snapshot(page, ids.show);
  await row(page, 'GAMMA').getByTestId('cue-menu').click(); await page.getByTestId('cue-new-folder').click();
  const folder = page.getByTestId('cue-list').locator('.pd-folder').last(); await expect(folder).toBeVisible(); await folder.getByTestId('select-folder').click();
  await key(page, 'Space'); await expect.poll(() => fake.actions.length).toBe(1); await shownOn(page, 'GAMMA');
  await key(page, 'Control+z'); await expect(page.getByTestId('rundown-note')).toContainText('Stop the affected folder'); expect(fake.actions).toHaveLength(1);
  await key(page, '0'); await expect.poll(() => fake.actions.length).toBe(2); await shownOff(page, 'GAMMA');
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
  await page.evaluate(async () => (await __noacgImport('/src/model/durableStore.ts')).setAccountAuthoringEnabled(false));
  await settleDurableWrites(page); const paused = await snapshot(page, ids.show);
  expect(JSON.parse(paused).cues[0].label).toBe('Retain last character');
  await key(page, 'Control+z'); await expectSlice(page, ids.show, paused);
  await page.evaluate(async () => (await __noacgImport('/src/model/durableStore.ts')).setAccountAuthoringEnabled(true));
  await key(page, 'Control+z'); await expectSlice(page, ids.show, paused);
});

test('retention bounds embedded assets and records actual heap separately from serialized bytes', async ({ page }) => {
  const ids = await seed(page), cdp = await page.context().newCDPSession(page);
  await cdp.send('HeapProfiler.collectGarbage'); const baseline = await cdp.send('Runtime.getHeapUsage');
  const retained = await page.evaluate(async id => {
    const m = await __noacgImport('/src/model/shows.ts'), h = await __noacgImport('/src/model/rundownHistory.ts');
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

// playout-workflow-simplification AC-12: a team production wears the same cloud chip. A save in
// flight is quiet "Syncing"; only one still unconfirmed a minute later turns amber, and a failed
// one shows at once.
test('the team production chip is quiet while a save is in flight, amber after a minute, and at once on failure', async ({ page }) => {
  await page.clock.install();
  const { state } = await teamBackend(page);
  const chip = page.getByTestId('sync-status');
  await expect(chip).toHaveText('Synced');
  await expect(chip).toHaveAttribute('data-tone', 'ok');
  let release!: () => void;
  state.hold = new Promise<void>((resolve) => { release = resolve; });
  try {
    await select(page, 'Alpha');
    await page.getByTestId('cue-label').fill('Held save');
    await page.getByTestId('cue-label').blur();
    await expect(chip).toHaveText('Syncing');
    await expect(chip).toHaveAttribute('data-tone', 'quiet');
    await page.clock.fastForward(45_000);
    await expect(chip).toHaveText('Syncing');
    await page.clock.fastForward(16_000);
    await expect(chip).toHaveText('Not synced');
    await expect(chip).toHaveAttribute('data-tone', 'warn');
  } finally { release(); }
  await expect(chip).toHaveText('Synced');
  // A refused save says so without waiting out the minute.
  state.fail = true;
  await page.getByTestId('cue-label').fill('Refused save');
  await page.getByTestId('cue-label').blur();
  await expect(chip).toHaveText('Not synced');
  await expect(chip).toHaveAttribute('data-tone', 'warn');
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});
