// TEMPORARY reproduction probe for #2090. Never committed.
import { test, expect, type Page } from '@playwright/test';
import { settleDurableWrites } from './_durable';

const OUT = process.env.PROBE_OUT ?? 'test-results/probe';
const owner = '00000000-0000-4000-8000-000000000001', teamId = '00000000-0000-4000-8000-000000000010';
const user = { id: owner, aud: 'authenticated', role: 'authenticated', email: 'dot@example.invalid', app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' };

type Row = { id: string; kind: string; body: { updatedAt: string; [k: string]: unknown }; deleted: boolean };
async function cloud(page: Page) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: owner, exp: expires, role: 'authenticated' })).toString('base64url')}.test`;
  await page.route('**/src/backend/config.ts*', route => route.fulfill({ contentType: 'text/javascript', body: "export function loadBackendConfig(){return {url:'https://cloudmock.invalid',anonKey:'test-public-key'}};export function isBackendConfigured(){return true}" }));
  await page.addInitScript(({ owner, user, token, expires }) => {
    if (window.top !== window) return;
    localStorage.setItem('spx-gfx-account', owner);
    if (!sessionStorage.getItem('dot-seeded')) {
      sessionStorage.setItem('dot-seeded', '1');
      localStorage.setItem('sb-cloudmock-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-refresh', expires_in: 3600, expires_at: expires, token_type: 'bearer', user }));
    }
  }, { owner, user, token, expires });
  const rows = new Map<string, Row>();
  const st = { lists: 0, posts: 0, failReads: false, failWrites: false, hold: null as Promise<void> | null, teamDoc: null as unknown, teamToken: '2026-10-06T00:00:00.000Z', teamHold: null as Promise<void> | null, teamFail: false, teamRev: 0 };
  await page.route('https://cloudmock.invalid/**', async route => {
    const request = route.request(), url = new URL(request.url());
    const respond = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }).catch(() => {});
    if (url.pathname === '/auth/v1/user') return respond(user);
    if (url.pathname === '/auth/v1/logout') return respond({});
    if (url.pathname === '/rest/v1/teams') return respond(st.teamDoc ? [{ id: teamId, name: 'Dot team', join_code: 'testcode', owner_id: owner, created_at: st.teamToken }] : []);
    if (url.pathname === '/rest/v1/team_members') return respond(st.teamDoc ? [{ team_id: teamId, user_id: owner, display_name: 'Operator', role: 'owner', joined_at: st.teamToken }] : []);
    if (url.pathname === '/rest/v1/team_productions') return respond(st.teamDoc ? [{ id: (st.teamDoc as { id: string }).id, team_id: teamId, updated_at: st.teamToken, updated_by: owner, doc: st.teamDoc }] : []);
    if (url.pathname === '/rest/v1/rpc/team_production_save') {
      await st.teamHold;
      if (st.teamFail) return respond({ message: 'Injected team save failure', code: 'XX000' }, 503);
      const b = request.postDataJSON();
      if (b.p_expected !== st.teamToken) return respond({ saved: false, updated_at: st.teamToken, updated_by: owner, doc: st.teamDoc });
      st.teamDoc = b.p_doc; st.teamToken = new Date(Date.parse('2026-10-06T00:00:00Z') + ++st.teamRev).toISOString();
      return respond({ saved: true, updated_at: st.teamToken, updated_by: owner, doc: st.teamDoc });
    }
    if (url.pathname === '/rest/v1/documents') {
      if (request.method() === 'GET') {
        st.lists++;
        await st.hold;
        if (st.failReads) return respond({ message: 'Injected read failure', code: 'XX000' }, 503);
        const kind = url.searchParams.get('kind')?.replace('eq.', '');
        const found = [...rows.values()].filter(r => r.kind === kind);
        return respond(url.searchParams.get('select')?.includes('body,') ? found : found.map(r => ({ id: r.id, deleted: r.deleted, updatedAt: r.body.updatedAt })));
      }
      if (request.method() === 'POST') {
        st.posts++;
        await st.hold;
        if (st.failWrites) return respond({ message: 'Injected write failure', code: 'XX000' }, 503);
        const r = request.postDataJSON(); rows.set(r.id, r); return respond({ body: r.body });
      }
      return respond([]);
    }
    return respond([]);
  });
  return st;
}

async function seed(page: Page) {
  await page.goto('/app#/home'); await expect(page.getByTestId('home-page')).toBeVisible();
  const id = await page.evaluate(async () => {
    const m = await import('/src/model/shows.ts'), { variantsFor } = await import('/src/templates/catalog.ts');
    const show = m.createShowNamedChecked('Studio run').show;
    m.addGraphicToShow(show.id, { ...variantsFor('lower-third')[0].create({}), name: 'Guests' });
    return show.id;
  });
  await settleDurableWrites(page); await page.goto(`/app#/production/${id}`);
  await expect(page.getByTestId('production-page')).toBeVisible();
  return id;
}

async function read(page: Page, name: string) {
  const chip = page.getByTestId('sync-status');
  const out = {
    name,
    word: await chip.textContent(),
    tone: await chip.getAttribute('data-tone'),
    title: await chip.getAttribute('title'),
    cls: await chip.getAttribute('class'),
    action: null as string | null,
    disabled: null as boolean | null,
    detail: null as string | null,
    notice: await page.getByTestId('account-save-notice').textContent().catch(() => null),
  };
  await chip.click();
  await expect(page.getByTestId('sync-panel')).toBeVisible();
  out.action = await page.getByTestId('sync-action').textContent();
  out.disabled = await page.getByTestId('sync-action').isDisabled();
  out.detail = await page.getByTestId('sync-detail').textContent();
  await page.screenshot({ path: `${OUT}/${name}.png`, clip: { x: 0, y: 0, width: page.viewportSize()!.width, height: 220 } });
  await page.keyboard.press('Escape');
  console.log('STATE ' + JSON.stringify(out));
  return out;
}

const edit = (page: Page, id: string, label: string) => page.evaluate(async ({ id, label }) => {
  const m = await import('/src/model/shows.ts');
  const show = m.loadShows().find(s => s.id === id)!;
  m.updateShowCue(id, show.cues![0].id, { label });
}, { id, label });

test.setTimeout(240_000);

test('personal: settles, and how many passes after', async ({ page }) => {
  const st = await cloud(page);
  await page.clock.install();
  const id = await seed(page);
  const chip = page.getByTestId('sync-status');
  await expect(chip).toHaveText('Synced', { timeout: 30_000 });
  await edit(page, id, 'One');
  const t0 = Date.now();
  await expect(chip).toHaveText('Syncing', { timeout: 5_000 }).catch(() => {});
  await expect(chip).toHaveText('Synced', { timeout: 30_000 });
  console.log('SETTLE ms ' + (Date.now() - t0));
  const lists = st.lists;
  await page.waitForTimeout(8_000);
  console.log('LISTS after settle in 8s: ' + (st.lists - lists));
  await read(page, 'p0-settled');
});

test('personal: a request that never answers', async ({ page }) => {
  const st = await cloud(page);
  await page.clock.install();
  const id = await seed(page);
  const chip = page.getByTestId('sync-status');
  await expect(chip).toHaveText('Synced', { timeout: 30_000 });
  st.hold = new Promise(() => {});
  await edit(page, id, 'Held');
  await expect(chip).toHaveText('Syncing', { timeout: 10_000 });
  await page.clock.fastForward(3_000);
  await page.waitForTimeout(500);
  await page.clock.fastForward(61_000);
  await expect(chip).toHaveText('Not synced');
  await read(page, 'p1-held-syncing');
  await page.clock.fastForward(600_000);
  await page.waitForTimeout(500);
  await read(page, 'p1-held-10min');
  // A second edit: the pending phase with the wedged pass behind it.
  await edit(page, id, 'Held two');
  await page.waitForTimeout(300);
  const before = await read(page, 'p2-held-pending');
  if (!before.disabled) {
    await chip.click();
    const lists = st.lists;
    await page.getByTestId('sync-action').click();
    await page.waitForTimeout(1500);
    console.log('PRESS lists moved ' + (st.lists - lists));
    await read(page, 'p2-after-press');
  }
});

test('personal: failed reads, then retry', async ({ page }) => {
  const st = await cloud(page);
  await page.clock.install();
  const id = await seed(page);
  const chip = page.getByTestId('sync-status');
  await expect(chip).toHaveText('Synced', { timeout: 30_000 });
  st.failReads = true;
  await edit(page, id, 'Fail');
  await page.clock.fastForward(3_000);
  await expect(chip).toHaveText('Not synced', { timeout: 10_000 });
  await read(page, 'p3-failed');
  st.failReads = false;
  await chip.click();
  await page.getByTestId('sync-action').click();
  await expect(chip).toHaveText('Synced', { timeout: 10_000 });
  await read(page, 'p3-retried');
});

test('personal: offline', async ({ page, context }) => {
  await cloud(page);
  await page.clock.install();
  const id = await seed(page);
  const chip = page.getByTestId('sync-status');
  await expect(chip).toHaveText('Synced', { timeout: 30_000 });
  await context.setOffline(true);
  await page.waitForTimeout(300);
  await read(page, 'p4-offline-now');
  await page.clock.fastForward(61_000);
  await page.waitForTimeout(300);
  await read(page, 'p4-offline-minute');
  await edit(page, id, 'Offline');
  await page.clock.fastForward(3_000);
  await page.waitForTimeout(800);
  await read(page, 'p4-offline-edited');
  await chip.click();
  await page.getByTestId('sync-action').click();
  await page.waitForTimeout(800);
  await read(page, 'p4-offline-pressed');
  await context.setOffline(false);
  await expect(chip).toHaveText('Synced', { timeout: 15_000 }).catch(() => {});
  await read(page, 'p4-back-online');
});

test('personal: session gone', async ({ page }) => {
  await cloud(page);
  await page.clock.install();
  await seed(page);
  const chip = page.getByTestId('sync-status');
  await expect(chip).toHaveText('Synced', { timeout: 30_000 });
  await page.evaluate(async () => { const { getSupabase } = await import('/src/backend/supabase.ts'); await (await getSupabase())!.auth.signOut({ scope: 'local' }); });
  await page.waitForTimeout(800);
  await read(page, 'p5-session-gone');
});

async function teamSeed(page: Page) {
  const st = await cloud(page);
  await page.clock.install();
  const id = await seed(page);
  st.teamDoc = await page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)!, id);
  await page.evaluate(async owner => { const m = await import('/src/backend/teamProductions.ts'); m.startTeamSync(owner); await m.refreshTeams(); }, owner);
  await expect.poll(() => page.evaluate(async id => (await import('/src/model/shows.ts')).loadShows().find(s => s.id === id)?.teamId, id)).toBe(teamId);
  await expect(page.getByTestId('sync-status')).toHaveText('Synced', { timeout: 30_000 });
  return { st, id };
}

test('team: a save that never answers', async ({ page }) => {
  const { st, id } = await teamSeed(page);
  const chip = page.getByTestId('sync-status');
  st.teamHold = new Promise(() => {});
  await edit(page, id, 'Held team');
  await page.clock.fastForward(1_000);
  await expect(chip).toHaveText('Syncing');
  await page.clock.fastForward(61_000);
  await expect(chip).toHaveText('Not synced');
  await read(page, 't1-held');
});

test('team: session gone, with and without a pending edit', async ({ page }) => {
  const { id } = await teamSeed(page);
  const chip = page.getByTestId('sync-status');
  await page.evaluate(async () => { const { getSupabase } = await import('/src/backend/supabase.ts'); await (await getSupabase())!.auth.signOut({ scope: 'local' }); });
  await page.waitForTimeout(1000);
  await read(page, 't2-session-gone-clean');
  console.log('team still on page ' + await page.getByTestId('production-page').count());
  void id; void chip;
});

test('team: session gone with an edit waiting', async ({ page }) => {
  const { st, id } = await teamSeed(page);
  st.teamHold = new Promise(() => {});
  await page.evaluate(async ({ id }) => {
    const m = await import('/src/model/shows.ts');
    const show = m.loadShows().find(s => s.id === id)!;
    m.updateShowCue(id, show.cues![0].id, { label: 'Before sign-out' });
    const { setAccountAuthoringEnabled } = await import('/src/model/durableStore.ts');
    setAccountAuthoringEnabled(false);
  }, { id });
  await page.waitForTimeout(800);
  await page.clock.fastForward(61_000);
  await page.waitForTimeout(500);
  await read(page, 't3-authoring-off-pending');
});

test('team: offline', async ({ page, context }) => {
  const { id } = await teamSeed(page);
  await context.setOffline(true);
  await page.waitForTimeout(500);
  await read(page, 't4-offline-clean');
  await page.clock.fastForward(61_000);
  await page.waitForTimeout(500);
  await read(page, 't4-offline-minute');
  await edit(page, id, 'Offline team');
  await page.clock.fastForward(1_000);
  await page.waitForTimeout(800);
  await read(page, 't4-offline-edited');
  await context.setOffline(false);
  await page.clock.fastForward(20_000);
  await page.waitForTimeout(1500);
  await page.clock.fastForward(20_000);
  await page.waitForTimeout(1500);
  await read(page, 't4-back-online');
});

test('team: failed save, then retry; read failure', async ({ page }) => {
  const { st, id } = await teamSeed(page);
  const chip = page.getByTestId('sync-status');
  st.teamFail = true;
  await edit(page, id, 'Fail team');
  await page.clock.fastForward(1_000);
  await expect(chip).toHaveText('Not synced', { timeout: 10_000 });
  await read(page, 't5-failed');
  st.teamFail = false;
  await chip.click();
  await page.getByTestId('sync-action').click();
  await expect(chip).toHaveText('Synced', { timeout: 10_000 });
  await read(page, 't5-retried');
});
