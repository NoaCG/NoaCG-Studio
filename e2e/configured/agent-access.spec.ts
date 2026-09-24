import { test, expect } from '@playwright/test';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { dismissWizard, haveCreds, settleSync, signIn, wipeMyGraphics } from './_helpers';

// AGENT ACCESS, live (docs/AGENT_SAVE.md): the whole handoff a coding agent's `noacg login` +
// `noacg save` make, against the real backend, with the CLI's side played by this spec:
//   1. signed in, the consent page names the tool and the permission; Allow mints a one-time
//      code and redirects ONLY to the loopback listener (started here), code in the fragment;
//   2. redeem(code, verifier) mints the key once - a second redeem is refused;
//   3. POST /api/me/graphics with the key -> 201 { id, url }; the record is the studio's own
//      shape, server-stamped (origin noacg-cli);
//   4. the deep link opens the graphic on first load (a miss while signed in runs one sync pass);
//   4b. POST /api/me/packages with the key -> the package waits on Home -> Productions; Install
//      makes the production with its rundown and removes the row; Dismiss removes one unseen;
//   5. Settings -> Account -> Agent access lists the key; Revoke -> the same key is 401.

/** A real pack file (`noacg-pack` v1) - what `noacg pack --save` sends. */
const UUTISHUONE = fileURLToPath(new URL('../../public/packs/uutishuone.noacgpack.json', import.meta.url));

/** The loopback listener `noacg login` runs: serves /callback (a page that forwards the fragment)
 *  and resolves with the code it receives. */
function loopback(state: string): Promise<{ port: number; code: Promise<string>; close: () => void }> {
  return new Promise((resolve) => {
    let settle: (code: string) => void = () => undefined;
    const code = new Promise<string>((r) => { settle = r; });
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      if (req.method === 'GET' && url.pathname === '/callback') {
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><meta charset="utf-8"><title>cb</title><p id="s">…</p><script>
          fetch('/complete',{method:'POST',body:location.hash.slice(1)}).then(r=>r.text()).then(t=>{document.getElementById('s').textContent=t;});
        </script>`);
        return;
      }
      if (req.method === 'POST' && url.pathname === '/complete') {
        let body = '';
        req.on('data', (c: Buffer) => { body += c.toString(); });
        req.on('end', () => {
          const params = new URLSearchParams(body);
          if (params.get('state') === state && params.get('code')) settle(params.get('code')!);
          res.writeHead(200, { 'content-type': 'text/plain' });
          res.end('done');
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ port: (server.address() as AddressInfo).port, code, close: () => server.close() });
    });
  });
}

/** Revoke every key this spec (or a failed earlier run of it) minted on the shared account, so the
 *  Settings list holds exactly the one row the walk expects. Through the browser's own client
 *  with the session - the same calls the Settings section makes. */
async function wipeE2EKeys(page: import('@playwright/test').Page, name: string): Promise<void> {
  await page.evaluate(async (n) => {
    const { listAgentKeys, revokeAgentKey } = await import('/src/backend/agentAccess.ts');
    for (const k of await listAgentKeys()) if (k.name === n) await revokeAgentKey(k.id);
  }, name);
}

test.describe('agent access (configured)', () => {
  test.skip(!haveCreds, 'needs E2E_EMAIL/E2E_PASSWORD');
  test.setTimeout(120_000);

  test('consent -> loopback code -> redeem -> save 201 -> deep link -> revoke -> 401', async ({ page, request, baseURL }) => {
    const origin = baseURL!.replace(/\/+$/, '');

    // The agent-key routes are SERVER-side: api/_lib/agentAccessStore.ts mints and honours keys
    // with SUPABASE_SECRET_KEY / SUPABASE_SERVICE_ROLE_KEY from the dev server's own process.env,
    // and answers 503 without one. A configured CLIENT is not enough to run this walk. That is
    // reported rather than skipped: CI brings up a local Supabase stack whose service key is a
    // published default, so the capability is always present by construction, and a 503 here means
    // the stack did not come up the way the workflow assumes - an environment fault worth failing
    // on, not a deployment that legitimately lacks the feature.
    const probe = await request.get(`${origin}/api/me/agent-keys`).catch(() => null);
    expect(
      probe?.status(),
      'the agent-key backend is configured (needs SUPABASE_SERVICE_ROLE_KEY on the server)',
    ).not.toBe(503);
    await signIn(page);
    await dismissWizard(page);
    await settleSync(page);

    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('hex');
    const state = randomBytes(16).toString('base64url');
    const listener = await loopback(state);
    const name = 'Claude Code on E2E';
    await wipeE2EKeys(page, name);
    try {
      // 1. The consent page, signed in.
      await page.goto(`/app?agent=${state}&port=${listener.port}&name=${encodeURIComponent(name)}&challenge=${challenge}`);
      await expect(page.getByTestId('agent-consent')).toBeVisible();
      await expect(page.getByTestId('agent-consent-permissions')).toContainText('Create graphics in your library and send graphics packages to your Home');
      await expect(page.getByTestId('agent-consent')).toContainText(`127.0.0.1:${listener.port}`);
      await page.getByTestId('agent-consent-allow').click();
      // The browser lands on the loopback page; the code rode the FRAGMENT and never the query.
      await page.waitForURL((u) => u.hostname === '127.0.0.1' && u.pathname === '/callback', { timeout: 20_000 });
      expect(page.url()).not.toMatch(/[?&]code=/);
      const code = await listener.code;
      expect(code.length).toBeGreaterThan(20);

      // 2. Redeem - once.
      const redeem = await fetch(`${origin}/api/me/agent-keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', code, verifier }),
      });
      const redeemText = await redeem.text();
      expect(redeem.status, redeemText).toBe(201);
      const minted = JSON.parse(redeemText) as { key: string; id: string; name: string; prefix: string; scopes: string[] };
      expect(minted.key.startsWith('noacg_ak_')).toBe(true);
      expect(minted.name).toBe(name);
      expect(minted.scopes).toEqual(['graphics:create']);
      const again = await fetch(`${origin}/api/me/agent-keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', code, verifier }),
      });
      expect(again.status).toBe(400);

      // 3. Save: the library record the bridge builds, posted with the key. Back in the studio
      // (Advanced mode + an autosaved project = the editor, no wizard; close one if it shows).
      await page.goto('/app');
      await page.locator('.wz-modal .gallery-close').click({ timeout: 3_000 }).catch(() => undefined);
      const doc = await page.evaluate(async () => {
        const { variantsFor } = await import('/src/templates/catalog.ts');
        const { graphicDoc } = await import('/src/bridge/bridgeApi.ts');
        const template = variantsFor('lower-third')[0].create({});
        return graphicDoc({ ...template, name: 'Agent E2E L3' }, { name: 'Agent E2E L3', origin: { tool: 'noacg-cli', version: 'e2e' } });
      });
      const save = await fetch(`${origin}/api/me/graphics`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}` },
        body: JSON.stringify(doc),
      });
      expect(save.status, await save.clone().text()).toBe(201);
      const saved = (await save.json()) as { id: string; url: string };
      expect(saved.url).toContain(`/app#/graphic/${saved.id}`);

      // 4. The deep link opens the graphic on first load (one sync pass on the miss).
      await page.goto(`/app#/graphic/${saved.id}`);
      await expect
        .poll(
          () =>
            page.evaluate(async (id) => {
              const { graphicById } = await import('/src/model/library.ts');
              const { useTemplateStore } = await import('/src/store/templateStore.ts');
              const doc = graphicById(id);
              return { present: !!doc, origin: doc?.origin?.tool ?? null, open: useTemplateStore.getState().saved.graphicId === id, hash: location.hash };
            }, saved.id),
          { timeout: 30_000 },
        )
        .toEqual({ present: true, origin: 'noacg-cli', open: true, hash: `#/graphic/${saved.id}` });

      // 4b. A whole PACKAGE (docs/AGENT_SAVE.md §7): `noacg pack --save` posts the pack file with
      // the same key; it waits on Home → Productions; Install makes the production and opens its
      // rundown, and the waiting row goes. A second one is dismissed without installing.
      const packName = `Agent E2E package ${randomBytes(3).toString('hex')}`;
      const packFile = JSON.parse(readFileSync(UUTISHUONE, 'utf8')) as Record<string, unknown>;
      const sendPack = (packageName: string) =>
        fetch(`${origin}/api/me/packages`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}` },
          body: JSON.stringify({ ...packFile, name: packageName }),
        });
      const sent = await sendPack(packName);
      expect(sent.status, await sent.clone().text()).toBe(201);
      expect(((await sent.json()) as { url: string }).url).toContain('/app#/home/productions');
      const dismissName = `${packName} (dismiss)`;
      expect((await sendPack(dismissName)).status).toBe(201);

      await page.goto('/app#/home/productions');
      const waitingRow = page.getByTestId('waiting-packages').locator('.pack-waiting-row').filter({ hasText: packName });
      const dismissRow = page.getByTestId('waiting-packages').locator('.pack-waiting-row').filter({ hasText: dismissName });
      await expect(waitingRow.first()).toBeVisible({ timeout: 20_000 });
      await expect(waitingRow.first()).toContainText('6 graphics');

      await dismissRow.getByTestId('dismiss-waiting-package').click();
      await dismissRow.getByTestId('dismiss-waiting-package-confirm').click();
      await expect(dismissRow).toHaveCount(0);

      await waitingRow.filter({ hasNotText: '(dismiss)' }).getByTestId('install-waiting-package').click();
      await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('production-page')).toContainText(packName);
      await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(10);
      // Installed means gone from the waiting list - for good, not just on this screen.
      await expect
        .poll(() => page.evaluate(async (n) => {
          const { listWaitingPackages } = await import('/src/backend/agentPackages.ts');
          return (await listWaitingPackages()).filter((p) => p.name.startsWith(n)).length;
        }, packName))
        .toBe(0);

      // 5. Settings lists the key; Revoke ends it. From HOME: the production page carries no
      // account button (issue #403 was this step waiting on one).
      await page.goto('/app#/home');
      await page.getByTestId('account-button').click();
      await page.getByTestId('account-menu').getByRole('menuitem', { name: /Settings/ }).click();
      await expect(page.getByTestId('settings-account')).toBeVisible();
      // By the minted PREFIX (unique), not the name: an earlier run's leftover would be a second row.
      const row = page.getByTestId('agent-key-row').filter({ hasText: minted.prefix });
      await expect(row).toBeVisible();
      await expect(row).toContainText(name);
      await row.getByTestId('agent-key-revoke').click();
      await expect(row).toHaveCount(0);
      const afterRevoke = await fetch(`${origin}/api/me/graphics`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}` },
        body: JSON.stringify(doc),
      });
      expect(afterRevoke.status).toBe(401);
    } finally {
      listener.close();
      // Leave the shared test account as it was found.
      await page.goto('/app').catch(() => undefined);
      await wipeE2EKeys(page, name).catch(() => undefined);
      await wipeMyGraphics(page).catch(() => undefined);
      await page.evaluate(async () => {
        const { listWaitingPackages, removeWaitingPackage } = await import('/src/backend/agentPackages.ts');
        for (const p of await listWaitingPackages()) if (p.name.startsWith('Agent E2E package')) await removeWaitingPackage(p.id);
      }).catch(() => undefined);
      // The production Install made (or a failed run's), pushed as a tombstone so the shared
      // account's cloud does not collect one per run.
      await page.evaluate(async () => {
        const { hydrateDurableStore } = await import('/src/model/durableStore.ts');
        await hydrateDurableStore();
        const { deleteShow, loadShows } = await import('/src/model/shows.ts');
        for (const s of loadShows()) if (s.name.startsWith('Agent E2E package')) deleteShow(s.id);
        const { syncNow } = await import('/src/backend/syncController.ts');
        await syncNow();
      }).catch(() => undefined);
    }
  });
});
