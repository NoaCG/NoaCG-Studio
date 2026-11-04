// covers: src/components/SyncStatus.tsx, src/backend/{supabase,syncController,teamProductions}.ts
// The cloud chip on the production page (#2090): it settles within seconds of the last change, and
// an amber dot says why and has a retry that works. Never a false Synced, signed out or offline.
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

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
    rows: new Map<string, Row>(), reads: 0, silent: false, down: false,
    doc: null as { id: string } | null, token: '2026-10-06T00:00:00.000Z', revision: 0,
  };
  const never = new Promise<void>(() => {});
  await page.route('https://cloudmock.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/auth/v1/logout') return respond({});
    const teamRow = () => (state.doc ? [{ id: state.doc.id, team_id: team, updated_at: state.token, updated_by: owner, doc: state.doc }] : []);
    if (url.pathname === '/rest/v1/teams' || url.pathname === '/rest/v1/team_members' || url.pathname === '/rest/v1/team_productions') {
      if (state.down) return route.abort('connectionfailed').catch(() => {});
      if (url.pathname === '/rest/v1/teams') return respond(state.doc ? [{ id: team, name: 'Dot team', join_code: 'testcode', owner_id: owner, created_at: state.token }] : []);
      if (url.pathname === '/rest/v1/team_members') return respond(state.doc ? [{ team_id: team, user_id: owner, display_name: 'Operator', role: 'owner', joined_at: state.token }] : []);
      return respond(teamRow());
    }
    if (url.pathname === '/rest/v1/rpc/team_production_save') {
      if (state.silent) await never;
      if (state.down) return route.abort('connectionfailed').catch(() => {});
      const { p_expected, p_doc } = request.postDataJSON();
      if (p_expected !== state.token) return respond({ saved: false, updated_at: state.token, updated_by: owner, doc: state.doc });
      state.doc = p_doc;
      state.token = new Date(Date.parse('2026-10-06T00:00:00Z') + ++state.revision).toISOString();
      return respond({ saved: true, updated_at: state.token, updated_by: owner, doc: state.doc });
    }
    if (url.pathname === '/rest/v1/documents') {
      if (state.silent) await never;
      if (state.down) return route.abort('connectionfailed').catch(() => {});
      if (request.method() === 'GET') {
        state.reads++;
        const kind = url.searchParams.get('kind')?.replace('eq.', '');
        const found = [...state.rows.values()].filter(row => row.kind === kind);
        const ids = url.searchParams.get('id')?.replace(/^in\.\(|\)$/g, '').replace(/"/g, '').split(',');
        return respond(url.searchParams.get('select')?.includes('body,') ? found.filter(row => !ids || ids.includes(row.id)) : found.map(row => ({ id: row.id, deleted: row.deleted, updatedAt: row.body.updatedAt })));
      }
      if (request.method() === 'POST') {
        const row = request.postDataJSON();
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
    const m = await import('/src/model/shows.ts'), { variantsFor } = await import('/src/templates/catalog.ts');
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
  state.doc = await page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)!, id);
  await page.evaluate(async owner => { const m = await import('/src/backend/teamProductions.ts'); m.startTeamSync(owner); await m.refreshTeams(); }, owner);
  await expect.poll(() => page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)?.teamId, id)).toBe(team);
  await expect(chip(page)).toHaveText('Synced');
  return id;
}

const chip = (page: Page) => page.getByTestId('sync-status');
const edit = (page: Page, id: string, label: string) => page.evaluate(async ({ id, label }) => {
  const m = await import('/src/model/shows.ts');
  m.updateShowCue(id, m.loadShows().find(s => s.id === id)!.cues![0].id, { label });
}, { id, label });
const cueLabel = (body: unknown) => (body as { cues?: { label?: string }[] }).cues?.[0]?.label;
const signOut = (page: Page) => page.evaluate(async () => { const { getSupabase } = await import('/src/backend/supabase.ts'); await (await getSupabase())!.auth.signOut({ scope: 'local' }); });

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

test('a retry pressed while the pass still waits runs as soon as that pass gives up', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await production(page);
  state.silent = true;
  await edit(page, id, 'Queued by the press');
  await page.clock.fastForward(3_000);
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /Still waiting for the cloud/);
  await page.getByTestId('sync-action').click();
  state.silent = false;
  await page.clock.fastForward(TO_THE_LIMIT);
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect([...state.rows.values()].some(row => cueLabel(row.body) === 'Queued by the press')).toBe(true);
});

test('a team save the cloud never answers says so, and the retry saves it', async ({ page }) => {
  const state = await cloud(page);
  await page.clock.install();
  const id = await teamProduction(page, state);
  state.silent = true;
  await edit(page, id, 'Team retry');
  await page.clock.fastForward(1_000);
  await expect(chip(page)).toHaveText('Syncing');
  await page.clock.fastForward(A_MINUTE);
  await expectAmber(page, /Still waiting for the cloud/);
  await page.keyboard.press('Escape');
  await page.clock.fastForward(TO_THE_LIMIT);
  await expectAmber(page, /The cloud did not answer/);
  state.silent = false;
  await page.getByTestId('sync-action').click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
  expect(cueLabel(state.doc)).toBe('Team retry');
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
  await page.evaluate(async () => { await (await import('/src/backend/teamProductions.ts')).refreshTeams(); });
  await expectAmber(page, /did not answer/);
  state.down = false;
  await page.getByTestId('sync-action').click();
  await expect(chip(page)).toHaveText('Synced', { timeout: 15_000 });
});
