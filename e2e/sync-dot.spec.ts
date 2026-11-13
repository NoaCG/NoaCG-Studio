// covers: src/components/{SyncStatus,AccountSaveNotice}.tsx, src/components/editorFoundation/EditorFoundation.tsx
// covers: src/backend/{supabase,syncController,teamProductions}.ts
// covers: src/components/editorFoundation/foundation.css
// The cloud chip on the production page (#2090): it settles within seconds of the last change, and
// an amber dot says why and has a retry that works. Never a false Synced, signed out or offline.
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';
import { draw, ready, seek, source } from './_layerProperty';

const owner = '00000000-0000-4000-8000-000000000001', team = '00000000-0000-4000-8000-000000000010';
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'dot@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };
// Just past the minute the chip waits before it turns amber.
const A_MINUTE = 61_000;
// Past the shared client's limit on a request nobody answers, counted from the minute above.
const TO_THE_LIMIT = 15_000;
type Row = { id: string; kind: string; body: { updatedAt: string; deleted?: boolean; [key: string]: unknown }; deleted: boolean };

test.afterEach(async ({ page }) => { await page.unrouteAll({ behavior: 'ignoreErrors' }); });

/** A cloud behind the app: `silent` holds every document and team-save request unanswered, `down`
 *  refuses them, and `rows` is what the account keeps. */
async function cloud(page: Page) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, exp: expires, role: 'authenticated' })).toString('base64url')}.test`;
  await page.route('**/src/backend/config.ts*', route => route.fulfill({ contentType: 'text/javascript', body: "export function loadBackendConfig(){return {url:'https://cloudmock.invalid',anonKey:'test-public-key'}};export function isBackendConfigured(){return true}" }));
  await page.addInitScript(({ owner, user, token, expires }) => {
    if (window.top !== window) return;
    localStorage.setItem('spx-gfx-account', owner);
    localStorage.setItem('sb-cloudmock-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user }));
  }, { owner, user, token, expires });
  const state = {
    rows: new Map<string, Row>(), reads: 0, silent: false, silentWrites: false, silentStorage: false, goneStorage: false, silentReads: false, held: 0, down: false,
    doc: null as { id: string } | null, token: '2026-10-06T00:00:00.000Z', revision: 0,
    authUser: user, beforeWrite: null as ((row: Row) => Promise<void>) | null,
  };
  const hold = () => {
    state.held++;
    return new Promise<void>(() => {});
  };
  await page.route('https://cloudmock.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
    if (url.pathname === '/auth/v1/user') return respond(state.authUser);
    if (url.pathname === '/auth/v1/logout') return respond({});
    const teamRow = () => (state.doc ? [{ id: state.doc.id, team_id: team, updated_at: state.token, updated_by: owner, doc: state.doc }] : []);
    if (url.pathname === '/rest/v1/teams' || url.pathname === '/rest/v1/team_members' || url.pathname === '/rest/v1/team_productions') {
      if (state.silentReads) await hold();
      if (state.down) return route.abort('connectionfailed').catch(() => {});
      if (url.pathname === '/rest/v1/teams') return respond(state.doc ? [{ id: team, name: 'Dot team', join_code: 'testcode', owner_id: owner, created_at: state.token }] : []);
      if (url.pathname === '/rest/v1/team_members') return respond(state.doc ? [{ team_id: team, user_id: owner, display_name: 'Operator', role: 'owner', joined_at: state.token }] : []);
      return respond(teamRow());
    }
    if (url.pathname.startsWith('/storage/v1/object/')) {
      if (state.silentStorage) await hold();
      if (state.goneStorage) return respond({ statusCode: '404', error: 'not_found', message: 'Object not found' }, 400);
      if (request.method() === 'POST') return respond({ Key: url.pathname.split('/object/')[1] });
      return route.fulfill({ status: 200, contentType: 'font/woff2', body: Buffer.from('font bytes') }).catch(() => {});
    }
    if (url.pathname === '/rest/v1/rpc/team_production_save') {
      if (state.silent) await hold();
      if (state.down) return route.abort('connectionfailed').catch(() => {});
      const { p_expected, p_doc } = request.postDataJSON();
      if (p_expected !== state.token) return respond({ saved: false, updated_at: state.token, updated_by: owner, doc: state.doc });
      state.doc = p_doc;
      state.token = new Date(Date.parse('2026-10-06T00:00:00Z') + ++state.revision).toISOString();
      return respond({ saved: true, updated_at: state.token, updated_by: owner, doc: state.doc });
    }
    if (url.pathname === '/rest/v1/documents') {
      if (state.silent) await hold();
      if (state.down) return route.abort('connectionfailed').catch(() => {});
      if (request.method() === 'GET') {
        state.reads++;
        const kind = url.searchParams.get('kind')?.replace('eq.', '');
        const found = [...state.rows.values()].filter(row => row.kind === kind);
        const ids = url.searchParams.get('id')?.replace(/^(in\.\(|eq\.)|\)$/g, '').replace(/"/g, '').split(',');
        return respond(url.searchParams.get('select')?.includes('body,') ? found.filter(row => !ids || ids.includes(row.id)) : found.map(row => ({ id: row.id, deleted: row.deleted, updatedAt: row.body.updatedAt })));
      }
      if (state.silentWrites && request.method() !== 'GET') await hold();
      if (request.method() === 'POST') {
        const row = request.postDataJSON();
        if (state.beforeWrite) await state.beforeWrite(row);
        state.rows.set(row.id, row);
        return respond({ body: row.body });
      }
    }
    return respond([]);
  });
  return state;
}

async function production(page: Page) {
  await page.goto('/app#/home');
  await expect(page.getByTestId('home-page')).toBeVisible();
  const id = await page.evaluate(async () => {
    const m = await __noacgImport('/src/model/shows.ts'), { variantsFor } = await __noacgImport('/src/templates/catalog.ts');
    const show = m.createShowNamedChecked('Studio run').show;
    m.addGraphicToShow(show.id, { ...variantsFor('lower-third')[0].create({}), name: 'Guests' });
    return show.id;
  });
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  await expect(chip(page)).toHaveText('Synced', { timeout: 30_000 });
  return id;
}

async function teamProduction(page: Page, state: Awaited<ReturnType<typeof cloud>>) {
  const id = await production(page);
  state.doc = await page.evaluate(async id => (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === id)!, id);
  await page.evaluate(async owner => { const m = await __noacgImport('/src/backend/teamProductions.ts'); m.startTeamSync(owner); await m.refreshTeams(); }, owner);
  await expect.poll(() => page.evaluate(async id => (await __noacgImport('/src/model/shows.ts')).loadShows().find(s => s.id === id)?.teamId, id)).toBe(team);
  await expect(chip(page)).toHaveText('Synced');
  return id;
}

const chip = (page: Page) => page.getByTestId('sync-status');
const edit = (page: Page, id: string, label: string) => page.evaluate(async ({ id, label }) => {
  const m = await __noacgImport('/src/model/shows.ts');
  m.updateShowCue(id, m.loadShows().find(s => s.id === id)!.cues![0].id, { label });
}, { id, label });
const cueLabel = (body: unknown) => (body as { cues?: { label?: string }[] }).cues?.[0]?.label;
const signOut = (page: Page) => page.evaluate(async () => { const { getSupabase } = await __noacgImport('/src/backend/supabase.ts'); await (await getSupabase())!.auth.signOut({ scope: 'local' }); });

/** Amber, with this reason, and its action live. Leaves the panel open. */
async function expectAmber(page: Page, reason: RegExp, action = 'Sync now') {
  await expect(chip(page)).toHaveText('Not synced');
  await expect(chip(page)).toHaveAttribute('data-tone', 'warn');
  if (!await page.getByTestId('sync-panel').isVisible()) await chip(page).click();
  await expect(page.getByTestId('sync-detail')).toHaveText(reason);
  await expect(page.getByTestId('sync-action')).toHaveText(action);
  await expect(page.getByTestId('sync-action')).toBeEnabled();
}

test('the chip settles within seconds of the last change, and an old delete in the cloud does not stir it', async ({ page }) => {
  const state = await cloud(page);
  // A delete past the purge age in the cloud, the shape behind the re-pull loop of #2063.
  const old = new Date(Date.now() - 200 * 86_400_000).toISOString();
  state.rows.set('00000000-0000-4000-8000-0000000000aa', { id: '00000000-0000-4000-8000-0000000000aa', kind: 'graphic', deleted: true, body: { id: '00000000-0000-4000-8000-0000000000aa', name: 'Old', updatedAt: old, deleted: true } });
  const id = await production(page);
  await edit(page, id, 'Last change');
  await expect(chip(page)).toHaveText('Syncing');
  await expect(chip(page)).toHaveText('Synced', { timeout: 10_000 });
  await expect(chip(page)).toHaveAttribute('data-tone', 'ok');
  expect([...state.rows.values()].some(row => cueLabel(row.body) === 'Last change')).toBe(true);
  // The confirmation is the end of it: no pass runs after it until something changes.
  const reads = state.reads;
  await page.waitForTimeout(6_000);
  expect(state.reads).toBe(reads);
  await expect(chip(page)).toHaveText('Synced');
});

test('a sync the cloud never answers says so, and the retry saves the change once the cloud is back', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await production(page);
  state.silent = true;
  await edit(page, id, 'Saved by the retry');
  await page.clock.fastForward(3_000);
  await expect(chip(page)).toHaveText('Syncing');
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /Still waiting for the cloud/);
  await page.screenshot({ path: 'test-results/sync-dot-waiting.png', clip: { x: 0, y: 0, width: 1280, height: 220 } });
  await page.keyboard.press('Escape');
  await page.clock.fastForward(TO_THE_LIMIT);
  await expectAmber(page, /The cloud did not answer/);
  await expect(page.getByTestId('account-save-notice')).toContainText('Not saved to cloud');
  await page.screenshot({ path: 'test-results/sync-dot-no-answer.png', clip: { x: 0, y: 0, width: 1280, height: 220 } });
  state.silent = false;
  await page.getByTestId('sync-action').click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect([...state.rows.values()].some(row => cueLabel(row.body) === 'Saved by the retry')).toBe(true);
  await expect(page.getByTestId('account-save-notice')).toHaveCount(0);
});

test('a save the cloud reads for but never answers ends in one reason, and the retry lands it', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await production(page);
  state.silentWrites = true;
  await edit(page, id, 'Pushed by the retry');
  await page.clock.fastForward(3_000);
  await expect.poll(() => state.held).toBe(1);
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /Still waiting for the cloud/);
  await page.keyboard.press('Escape');
  // The limit on a write also leaves time to send what it carries.
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /^The cloud did not answer/);
  state.silentWrites = false;
  await page.getByTestId('sync-action').click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect([...state.rows.values()].some(row => cueLabel(row.body) === 'Pushed by the retry')).toBe(true);
});

test('a stored file the cloud never answers for fails the pull, so it is neither Synced nor blanked', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  await production(page);
  const id = '00000000-0000-4000-8000-0000000000bb';
  const updatedAt = new Date().toISOString();
  state.rows.set(id, { id, kind: 'look', deleted: false, body: { id, name: 'With a font', updatedAt, deleted: false, font: { path: 'f.woff2', data: 'spx-storage:u/abc' } } });
  state.silentStorage = true;
  const fontOfLook = () => page.evaluate(async id => {
    const look = (await __noacgImport('/src/model/packets.ts')).loadAllLooks().find(l => l.id === id) as unknown as { font?: { data?: string } } | undefined;
    return look?.font?.data ?? null;
  }, id);
  await page.evaluate(async () => { void (await __noacgImport('/src/backend/syncController.ts')).syncNow(); });
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await page.clock.fastForward(A_MINUTE + TO_THE_LIMIT);
  await expectAmber(page, /^The cloud did not answer/);
  expect(await fontOfLook()).toBeNull();
  state.silentStorage = false;
  await page.getByTestId('sync-action').click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  await expect.poll(fontOfLook).toMatch(/^data:/);
});

test('a stored file that is really gone stays blank and does not hold the chip on amber', async ({ page }) => {
  const state = await cloud(page);
  await production(page);
  const id = '00000000-0000-4000-8000-0000000000cc';
  const updatedAt = new Date().toISOString();
  state.rows.set(id, { id, kind: 'look', deleted: false, body: { id, name: 'Lost font', updatedAt, deleted: false, font: { path: 'f.woff2', data: 'spx-storage:u/gone' } } });
  state.goneStorage = true;
  await page.evaluate(async () => { await (await __noacgImport('/src/backend/syncController.ts')).syncNow(); });
  await expect(chip(page)).toHaveText('Synced');
  expect(await page.evaluate(async id => ((await __noacgImport('/src/model/packets.ts')).loadAllLooks().find(l => l.id === id) as unknown as { font: { data: string } }).font.data, id)).toBe('');
});

test('a retry pressed while a team read waits runs as soon as that read gives up', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  await teamProduction(page, state);
  state.down = true;
  await page.evaluate(async () => { await (await __noacgImport('/src/backend/teamProductions.ts')).refreshTeams(); });
  await expectAmber(page, /did not answer/);
  state.down = false;
  state.silentReads = true;
  await page.evaluate(async () => { void (await __noacgImport('/src/backend/teamProductions.ts')).refreshTeams(); });
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await page.getByTestId('sync-action').click();
  state.silentReads = false;
  await page.clock.fastForward(A_MINUTE + TO_THE_LIMIT);
  // Sooner than the wait that follows a failed read, so this is the press and not the poll.
  await expect(chip(page)).toHaveText('Synced', { timeout: 10_000 });
});

test('a retry pressed while the pass still waits runs as soon as that pass gives up', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await production(page);
  state.silent = true;
  await edit(page, id, 'Queued by the press');
  await page.clock.fastForward(3_000);
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /Still waiting for the cloud/);
  await page.getByTestId('sync-action').click();
  state.silent = false;
  await page.clock.fastForward(TO_THE_LIMIT);
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect([...state.rows.values()].some(row => cueLabel(row.body) === 'Queued by the press')).toBe(true);
});

test('a team save the cloud never answers says so, gives up, and lands on its retry', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await teamProduction(page, state);
  state.silent = true;
  await edit(page, id, 'Team retry');
  await page.clock.fastForward(1_000);
  await expect(chip(page)).toHaveText('Syncing');
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /Still waiting for the cloud/);
  await page.getByTestId('sync-action').click();
  state.silent = false;
  await page.clock.fastForward(TO_THE_LIMIT);
  // A failed save goes again on the next good read, and reads poll.
  await expect.poll(async () => {
    await page.clock.fastForward(5_000);
    return chip(page).textContent();
  }, { timeout: 20_000 }).toBe('Synced');
  expect(cueLabel(state.doc)).toBe('Team retry');
  await expect(page.getByTestId('production-team-note')).toHaveCount(0);
});

test('a team save that fails says why, and its line goes when it lands', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await teamProduction(page, state);
  state.down = true;
  await edit(page, id, 'Team failure');
  await page.clock.fastForward(1_000);
  await expectAmber(page, /The cloud did not answer/);
  await expect(page.getByTestId('production-team-note')).toHaveText(/The cloud did not answer/);
  state.down = false;
  await page.getByTestId('sync-action').click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect(cueLabel(state.doc)).toBe('Team failure');
  await expect(page.getByTestId('production-team-note')).toHaveCount(0);
});

test('a team production with its session gone is not Synced, and asks for a sign-in', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  await teamProduction(page, state);
  await signOut(page);
  await expectAmber(page, /Sign in to resume/, 'Sign in');
  await page.screenshot({ path: 'test-results/sync-dot-team-signed-out.png', clip: { x: 0, y: 0, width: 1280, height: 220 } });
  await page.getByTestId('sync-action').click();
  await expect(page.getByRole('dialog').first()).toBeVisible();
});

test('a team production offline is not Synced, and settles by itself when the network returns', async ({ page, context }) => {
  const state = await cloud(page);
  await page.clock.install();
  await teamProduction(page, state);
  state.down = true;
  await context.setOffline(true);
  await expect(chip(page)).toHaveText('Syncing');
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /^Offline\./);
  await page.keyboard.press('Escape');
  state.down = false;
  await context.setOffline(false);
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
});

test('a personal production offline says so, and settles by itself when the network returns', async ({ page, context }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await production(page);
  state.down = true;
  await context.setOffline(true);
  await edit(page, id, 'Made offline');
  await page.clock.fastForward(3_000);
  await expect(chip(page)).toHaveAttribute('title', /^Offline\./);
  // The library tries a read a few times before the pass can fail.
  await expect(chip(page)).toHaveText('Not synced', { timeout: 15_000 });
  await expectAmber(page, /^Offline\./);
  await page.screenshot({ path: 'test-results/sync-dot-offline.png', clip: { x: 0, y: 0, width: 1280, height: 220 } });
  await page.keyboard.press('Escape');
  state.down = false;
  await context.setOffline(false);
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect([...state.rows.values()].some(row => cueLabel(row.body) === 'Made offline')).toBe(true);
});

test('a team read that fails is not Synced, and the retry reads again', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  await teamProduction(page, state);
  state.down = true;
  await page.evaluate(async () => { await (await __noacgImport('/src/backend/teamProductions.ts')).refreshTeams(); });
  await expectAmber(page, /did not answer/);
  state.down = false;
  await page.getByTestId('sync-action').click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
});

test('the graphic editor separates a local save from a delayed cloud confirmation', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  await page.goto('/app#/home');
  await expect(chip(page)).toHaveText('Synced', { timeout: 30_000 });
  await page.getByTestId('analytics-consent').getByRole('button', { name: 'No thanks' }).click();
  await page.getByTestId('home-new-project').click();
  await page.locator('[data-entry="import-graphic"]').click();
  await page.locator('.wz-drop input[type=file]').setInputFiles('e2e/fixtures/cli-round-trip/riverlight.zip');
  await expect(page.getByTestId('import-template-card')).toContainText('Riverlight');
  await page.locator('.wz-next').click();
  await page.getByTestId('wz-finish-edit-artwork').click();
  await ready(page);
  await draw(page, .3);

  const notice = page.getByTestId('account-save-notice');
  const cloudGraphic = () => [...state.rows.values()].find(row => row.kind === 'graphic');
  state.silentWrites = true;
  await page.getByTestId('save-graphic').click();
  await page.getByTestId('save-name').fill('Delayed graphic');
  await page.getByTestId('save-confirm').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const saved = await source(page);
  await page.clock.fastForward(3_000);
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await expect(chip(page)).toHaveText('Syncing');
  await expect(notice).toHaveCount(0);
  expect(cloudGraphic()).toBeUndefined();

  await page.clock.fastForward(A_MINUTE);
  await page.setViewportSize({ width: 1366, height: 768 });
  await seek(page, 0);
  const timeline = page.getByTestId('foundation-timeline');
  await timeline.getByRole('button', { name: 'Play', exact: true }).click();
  const pause = timeline.getByRole('button', { name: 'Pause', exact: true });
  await expect(pause).toBeVisible();
  await expectAmber(page, /Still waiting for the cloud/);
  await expect(page.getByTestId('sync-panel')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  await expect(notice).toHaveCount(0);
  await page.screenshot({ path: 'test-results/editor-delayed-cloud.png' });
  await page.getByTestId('sync-action').focus();
  await expect(pause).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('sync-panel')).toHaveCount(0);
  await expect(chip(page)).toBeFocused();
  await expect(pause, 'Escape in the sync panel closes it without pausing artwork').toBeVisible();
  await pause.click();
  expect(await source(page)).toEqual(saved);
  await page.getByTestId('open-home').click();
  await expect(page.getByTestId('home-page')).toBeVisible();
  await expectAmber(page, /Still waiting for the cloud/);
  await page.keyboard.press('Escape');

  await page.clock.fastForward(A_MINUTE);
  await expect(notice).toContainText('Not saved to cloud');
  const firstNotice = await notice.elementHandle();
  const heldBeforeRetry = state.held;
  await page.clock.fastForward(16_000);
  await expect.poll(() => state.held).toBeGreaterThan(heldBeforeRetry);
  expect(cloudGraphic()).toBeUndefined();
  await expect(notice).toContainText('Not saved to cloud');
  expect(await firstNotice!.evaluate(element => element.isConnected)).toBe(true);

  await page.getByTestId('home-nav-graphics').click();
  const graphicRow = page.locator('.lib-row', { hasText: 'Delayed graphic' });
  await graphicRow.getByTestId('open-graphic').click();
  await page.getByTestId('control-open-editor').click();
  await ready(page);
  await expect(notice).toContainText('Not saved to cloud');
  const lowerEditor = await page.locator('.ef-status').evaluate(footer => {
    const area = footer.getBoundingClientRect();
    const notice = document.querySelector('[data-testid=account-save-notice]')!.getBoundingClientRect();
    const hit = document.elementFromPoint(area.left + 30, area.top + 12);
    return { editorBottom: area.bottom, noticeTop: notice.top, covered: !!hit?.closest('[data-testid=account-save-notice]') };
  });
  expect(lowerEditor.editorBottom).toBeLessThanOrEqual(lowerEditor.noticeTop);
  expect(lowerEditor.covered, 'the notice must leave the lower editor reachable').toBe(false);
  await page.screenshot({ path: 'test-results/editor-failed-cloud.png' });
  expect(await firstNotice!.evaluate(element => element.isConnected)).toBe(true);
  expect(await source(page)).toEqual(saved);
  await page.clock.fastForward(A_MINUTE * 2);
  await expect(notice).toHaveCount(1);
  expect(await firstNotice!.evaluate(element => element.isConnected)).toBe(true);

  state.silentWrites = false;
  await notice.getByRole('button', { name: 'Retry cloud save' }).click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  await expect(notice).toHaveCount(0);
  expect(cloudGraphic()?.body).toMatchObject({ name: saved.name, template: { html: saved.html, js: saved.js } });
  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();
  await graphicRow.getByTestId('open-graphic').click();
  await page.getByTestId('control-add-production').click();
  await page.getByTestId('control-new-production-name').fill('Local show');
  await page.getByTestId('control-new-production').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  const productionUrl = page.url();
  await page.goBack();
  await page.getByTestId('control-open-editor').click();
  await ready(page);
  expect(await source(page)).toEqual(saved);

  await draw(page, .6);
  await page.getByTestId('save-graphic').click();
  await expect(page.getByTestId('save-status')).toHaveText('Saved');
  const linked = await source(page);
  expect(linked.html).not.toBe(saved.html);
  await page.clock.fastForward(3_000);
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect(cloudGraphic()?.body).toMatchObject({ template: { html: linked.html, js: linked.js } });
  const productionTemplate = await page.evaluate(async url => {
    const { loadShows } = await __noacgImport('/src/model/shows.ts');
    const id = new URL(url).hash.split('/')[2];
    return loadShows().find(show => show.id === id)?.graphics[0].template;
  }, productionUrl);
  expect(productionTemplate).toMatchObject({ html: saved.html, js: saved.js });

  await page.getByTestId('open-home').click();
  await page.getByTestId('home-nav-graphics').click();
  await graphicRow.getByTestId('row-menu').click();
  await graphicRow.getByTestId('export-graphic').click();
  await page.locator('.issue', { hasText: 'SPX export' }).click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Validate & download/ }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.zip$/);
  expect(await download.failure()).toBeNull();
});

test('confirming an older revision does not clear the notice while newer work is pending', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await production(page);
  state.silentWrites = true;
  await edit(page, id, 'Older local change');
  await page.clock.fastForward(3_000);
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await page.clock.fastForward(A_MINUTE * 2);
  const notice = page.getByTestId('account-save-notice');
  await expect(notice).toContainText('Not saved to cloud');
  const firstNotice = await notice.elementHandle();

  const writes = new Map<string, () => void>();
  state.beforeWrite = row => {
    const label = cueLabel(row.body);
    if (typeof label !== 'string') return Promise.resolve();
    return new Promise<void>(release => { writes.set(label, release); });
  };
  state.silentWrites = false;
  await notice.getByRole('button', { name: 'Retry cloud save' }).click();
  await expect.poll(() => writes.has('Older local change')).toBe(true);
  await edit(page, id, 'Newest local change');
  await settleDurableWrites(page);
  writes.get('Older local change')!();
  await expect.poll(() => writes.has('Newest local change')).toBe(true);
  expect(cueLabel(state.rows.get(id)?.body)).toBe('Older local change');
  await expect(chip(page)).not.toHaveText('Synced');
  await expect(notice).toContainText('Not saved to cloud');
  expect(await firstNotice!.evaluate(element => element.isConnected)).toBe(true);

  writes.get('Newest local change')!();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect(cueLabel(state.rows.get(id)?.body)).toBe('Newest local change');
  await expect(notice).toHaveCount(0);
});

test('personal recovery stays with the session that encountered the failure', async ({ page, context }) => {
  // Team sync separately preserves its paused state. Keep that notice out of the personal-session oracle.
  await page.route('**/src/components/teams/useTeamsAvailable.ts*', route => route.fulfill({
    contentType: 'text/javascript', body: 'export function useTeamsAvailable() { return false; }',
  }));
  const state = await cloud(page);
  await page.clock.install();
  const id = await production(page);
  const session = await page.evaluate(async () => {
    const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
    const { data } = await (await getSupabase())!.auth.getSession();
    return { access_token: data.session!.access_token, refresh_token: data.session!.refresh_token };
  });
  const setSession = (next: typeof session) => page.evaluate(async session => {
    const { getSupabase } = await __noacgImport('/src/backend/supabase.ts');
    const { error } = await (await getSupabase())!.auth.setSession(session);
    return error?.message ?? null;
  }, next);

  state.silentWrites = true;
  await edit(page, id, 'Saved after resuming the session');
  await page.clock.fastForward(3_000);
  await expect.poll(() => state.held).toBeGreaterThan(0);
  await page.clock.fastForward(A_MINUTE * 2);
  const notice = page.getByTestId('account-save-notice');
  await expect(notice).toContainText('Not saved to cloud');
  const shown = await notice.elementHandle();
  expect(await setSession({ ...session, refresh_token: 'refreshed-test-session' })).toBeNull();
  await expect(notice).toContainText('Not saved to cloud');

  await context.setOffline(true);
  await expect(chip(page)).toHaveAttribute('title', /^Offline\./);
  await expect(notice).toContainText('Not saved to cloud');
  expect(await shown!.evaluate(element => element.isConnected)).toBe(true);
  const heldBeforeReconnecting = state.held;
  await context.setOffline(false);
  await expect.poll(() => state.held).toBeGreaterThan(heldBeforeReconnecting);

  await signOut(page);
  await expect(notice).toContainText('Account editing paused');
  await expect(notice.getByRole('button', { name: 'Retry cloud save' })).toHaveCount(0);
  await notice.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toBeVisible();
  await page.keyboard.press('Escape');

  const returnedFailure: string[] = [];
  await page.exposeFunction('recordReturnedCloudFailure', (message: string) => returnedFailure.push(message));
  await page.evaluate(() => {
    const report = (window as Window & {
      recordReturnedCloudFailure?: (message: string) => Promise<void>;
    }).recordReturnedCloudFailure;
    new MutationObserver(() => {
      const message = document.querySelector('[data-testid=account-save-notice]')?.textContent ?? '';
      if (message.startsWith('Not saved to cloud')) void report?.(message);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  state.silentWrites = false;
  expect(await setSession(session)).toBeNull();
  await expect(notice).toHaveCount(0);
  await expect.poll(() => page.evaluate(async () => (await __noacgImport('/src/model/durableStore.ts')).canAuthorAccount())).toBe(true);
  await expect(chip(page)).not.toHaveText('Synced');
  expect(cueLabel(state.rows.get(id)?.body)).not.toBe('Saved after resuming the session');
  await chip(page).click();
  const resumeSync = page.getByTestId('sync-action');
  await expect(resumeSync, 'the restored session can retry without signing in again').toHaveText('Sync now');
  await expect(resumeSync).toBeEnabled();
  await resumeSync.click();
  await expect(page.getByRole('dialog', { name: 'Sign in' })).toHaveCount(0);
  await page.clock.fastForward(A_MINUTE * 2);
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect([...state.rows.values()].some(row => cueLabel(row.body) === 'Saved after resuming the session')).toBe(true);
  await expect(notice).toHaveCount(0);
  expect(returnedFailure).toEqual([]);

  // A different authenticated account pauses the old library before its replacement loads.
  state.silentWrites = true;
  const heldBeforeSwitch = state.held;
  await edit(page, id, 'Still private to the old account');
  await page.clock.fastForward(3_000);
  await expect.poll(() => state.held).toBeGreaterThan(heldBeforeSwitch);
  await page.clock.fastForward(A_MINUTE * 2);
  await expect(notice).toContainText('Not saved to cloud');
  await chip(page).click();
  await expect(page.getByTestId('sync-action')).toHaveText('Sync now');
  const nextOwner = '00000000-0000-4000-8000-000000000002';
  state.authUser = { ...user, id: nextOwner };
  const [header, payload] = session.access_token.split('.');
  const nextPayload = { ...JSON.parse(Buffer.from(payload, 'base64url').toString()), sub: nextOwner };
  const nextToken = header + '.' + Buffer.from(JSON.stringify(nextPayload)).toString('base64url') + '.test';

  type PausedLibrary = {
    loadedOwner: string | null;
    retryVisible: boolean;
    signInVisible: boolean;
    chipAction: string | null;
    chipDisabled: boolean | null;
  };
  const oldLibraryPauses: PausedLibrary[] = [];
  await page.exposeFunction('recordPriorLibraryPause', (pause: PausedLibrary) => { oldLibraryPauses.push(pause); });
  await page.evaluate(async () => {
    const { libraryInUse } = await __noacgImport('/src/model/durableStore.ts');
    const report = (window as Window & {
      recordPriorLibraryPause?: (pause: PausedLibrary) => Promise<void>;
    }).recordPriorLibraryPause;
    const observer = new MutationObserver(() => {
      const banner = document.querySelector('[data-testid=account-save-notice]');
      if (!banner?.textContent?.includes('Account editing paused')) return;
      observer.disconnect();
      const chipAction = document.querySelector<HTMLButtonElement>('[data-testid=sync-action]');
      void report?.({
        loadedOwner: libraryInUse(),
        retryVisible: banner.textContent.includes('Retry cloud save'),
        signInVisible: Array.from(banner.querySelectorAll('button')).some(button => button.textContent === 'Sign in' && !button.disabled),
        chipAction: chipAction?.textContent ?? null,
        chipDisabled: chipAction?.disabled ?? null,
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  });
  const reloading = page.waitForRequest(request => request.isNavigationRequest() && new URL(request.url()).pathname === '/app');
  await page.evaluate(next => {
    // Capture the old document's final notice in-page. A Playwright query after the reload
    // request is too late because Chromium can already have discarded the old context.
    window.setTimeout(() => {
      void __noacgImport('/src/backend/supabase.ts').then(async ({ getSupabase }) => {
        await (await getSupabase())!.auth.setSession(next);
      });
    }, 0);
  }, { ...session, access_token: nextToken });
  await reloading;
  await expect.poll(() => oldLibraryPauses).toEqual([{
    loadedOwner: owner,
    retryVisible: false,
    signInVisible: true,
    chipAction: 'Sync now',
    chipDisabled: true,
  }]);
});
