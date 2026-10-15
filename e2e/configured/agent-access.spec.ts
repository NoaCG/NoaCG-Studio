// CONFIGURED TRIGGERS: a change to a path below prints "also run npm run test:e2e:live:queued"
// (scripts/e2e-lists.mjs). The offline suite cannot walk what these paths change.
//
// AGENT ACCESS (docs/AGENT_SAVE.md): the consent page with a session, the loopback handoff,
// redeem, a save 201, the deep link after sync and revoke -> 401 only exist against a real
// backend (e2e/configured/agent-access.spec.ts). The offline spec can only pin their absence.
// covers: src/backend/agentAccess.ts, src/components/auth/AgentAccessConsent.tsx
//
// WHAT AN ACCOUNT IS FOR, and where a save goes in each state. The dialog and the inline gate
// only render with a backend, so the sentence they carry (accountCopy.ts) and its two shapes
// are pinned in e2e/configured/anonymous.spec.ts alone; the save dialog's signed-in and
// signed-out lines are pinned in signed-in-ux.spec.ts and anonymous.spec.ts, and offline
// auth.spec.ts can only pin that it says neither.
// covers: api/_lib/me/{agentKeys,graphics,graphicShape,communityPacks}.ts, supabase/migrations/0087_community_pack_submit_for.sql
// covers: api/_lib/{principal,agentAccessStore}.ts, api/me/?...path?.ts, scripts/meDevPlugin.mjs
// covers: api/_lib/me/{deliveries,deliveryReceipt,packages}.ts, supabase/migrations/0092_agent_deliveries.sql
// covers: api/_lib/me/graphicSets.ts, supabase/migrations/0093_agent_graphic_sets.sql
// covers: cli/src/commands/save.ts, cli/src/receipt.ts, cli/src/operations.ts, cli/src/auth.ts
// covers: src/backend/agentPackages.ts, src/components/home/sections/ProductionsSection.tsx, src/app/router.ts

import { test, expect, chromium, type Page } from '@playwright/test';
import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { dismissWizard, E2E_EMAIL, E2E_PASSWORD, haveCreds, settleSync, signIn, signInOnHome, wipeMyGraphics } from './_helpers';

// AGENT ACCESS, live (docs/AGENT_SAVE.md): the whole handoff a coding agent's `noacg login` +
// `noacg save` make, against the real backend, with the CLI's side played by this spec:
//   1. signed in, the consent page names the tool and the permission; Allow mints a one-time
//      code and redirects ONLY to the loopback listener (started here), code in the fragment;
//   2. redeem(code, verifier) mints the key once - a second redeem is refused;
//   3. POST /api/me/graphics with the key -> 201 { id, url }; the record is the studio's own
//      shape, server-stamped (origin noacg-cli);
//   4. the deep link opens the graphic on first load (a miss while signed in runs one sync pass);
//   4b. POST /api/me/packages with the key -> the package waits on Home -> Productions; its link
//      selects it, a failed list load shows Retry, Install makes the production with its rundown,
//      and the link and the readback then say "installed"; Dismiss removes one unseen;
//   4e. A SET (docs/AGENT_SAVE.md §10): three graphics in one operation arrive whole with every
//      link; sent again they answer the same ids; a changed set is refused, an invalid one writes
//      nothing; a fresh signed-in browser finds all three and opens each link;
//   4d. IDENTITY AND RECEIPTS (docs/AGENT_SAVE.md §9): consent, redeem, whoami and every receipt
//      name the same account and deployment; the readback finds only this key's deliveries;
//   4c. POST /api/me/community-packs with the key -> refused without the licence; with it, the
//      pack waits for review under the account's Your packs;
//   5. Settings -> Account -> Agent access lists the key; Revoke -> the same key is 401.
//
// THE CLI ITSELF (docs/AGENT_SAVE.md §10), the second test: the built `noacg` drives the real
// bridge and the real set door. A save killed mid-write and run again, the same command repeated
// and two runs at once each leave ONE set; an invalid graphic writes nothing; a changed set sent
// under the journaled operation is refused.

/** The delivery receipt the doors and the readback answer (docs/AGENT_SAVE.md §9). */
interface Receipt {
  version: number;
  operationId: string;
  deployment: string;
  account: { id: string; email: string | null };
  destination: string;
  state: string;
  resources: Array<{ kind: string; id: string; state: string; link: string }>;
  link: string | null;
  verified: boolean;
}

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

  test('consent -> loopback code -> redeem -> save 201 -> deep link -> revoke -> 401', async ({ page, request, baseURL, browser }) => {
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
      // Which account and deployment the key will save into - what whoami and every receipt say too.
      const host = new URL(origin).host;
      await expect(page.getByTestId('agent-consent-account')).toContainText(E2E_EMAIL.toLowerCase(), { ignoreCase: true });
      await expect(page.getByTestId('agent-consent-account')).toContainText(host);
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
      const minted = JSON.parse(redeemText) as {
        key: string; id: string; name: string; prefix: string; scopes: string[];
        account: { id: string; email: string | null }; deployment: string;
      };
      expect(minted.key.startsWith('noacg_ak_')).toBe(true);
      expect(minted.name).toBe(name);
      expect(minted.scopes).toEqual(['graphics:create']);
      expect(minted.account.email?.toLowerCase()).toBe(E2E_EMAIL.toLowerCase());
      expect(minted.deployment).toBe(origin);
      // whoami: the key describes itself with the same account and deployment.
      const whoami = (await (await fetch(`${origin}/api/me/agent-keys`, { headers: { authorization: `Bearer ${minted.key}` } })).json()) as { account: unknown; deployment: string };
      expect(whoami.account).toEqual(minted.account);
      expect(whoami.deployment).toBe(origin);
      const again = await fetch(`${origin}/api/me/agent-keys`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'redeem', code, verifier }),
      });
      expect(again.status).toBe(400);

      // 3. Save: the library record the bridge builds, posted with the key. Back in the studio
      // (a returning reader lands on Home; close the wizard if a first visit shows it).
      await page.goto('/app');
      await page.locator('.wz-modal .gallery-close').click({ timeout: 3_000 }).catch(() => undefined);
      // Back on the studio's origin (the consent ended on the loopback page): the key belongs to the
      // account that consented.
      const sessionUser = await page.evaluate(async () => {
        const { getSupabase } = await import('/src/backend/supabase.ts');
        return (await (await getSupabase())!.auth.getUser()).data.user?.id ?? null;
      });
      expect(minted.account.id, 'the key is minted for the account that consented').toBe(sessionUser);
      const doc = await page.evaluate(async () => {
        const { variantsFor } = await import('/src/templates/catalog.ts');
        const { graphicDoc } = await import('/src/bridge/bridgeApi.ts');
        const template = variantsFor('lower-third')[0].create({});
        return graphicDoc({ ...template, name: 'Agent E2E L3' }, { name: 'Agent E2E L3', origin: { tool: 'noacg-cli', version: 'e2e' } });
      });
      const saveOperation = randomUUID();
      const save = await fetch(`${origin}/api/me/graphics`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}`, 'x-noacg-operation': saveOperation },
        body: JSON.stringify(doc),
      });
      expect(save.status, await save.clone().text()).toBe(201);
      const saved = (await save.json()) as { id: string; url: string; receipt: Receipt };
      expect(saved.url).toContain(`/app#/graphic/${saved.id}`);
      // 4d. The write's receipt: same account and deployment, accepted but not yet read back.
      expect(saved.receipt).toMatchObject({ version: 1, operationId: saveOperation, deployment: origin, account: minted.account, destination: 'library', state: 'saved', link: saved.url, verified: false });
      // The readback by this key confirms it; an id it never delivered is a plain 404.
      const readBack = (id: string, key = minted.key) => fetch(`${origin}/api/me/deliveries?id=${id}`, { headers: { authorization: `Bearer ${key}` } });
      const savedBack = await readBack(saveOperation);
      expect(savedBack.status, await savedBack.clone().text()).toBe(200);
      expect(((await savedBack.json()) as { receipt: Receipt }).receipt).toMatchObject({ state: 'saved', verified: true, account: minted.account });
      expect((await readBack(randomUUID())).status).toBe(404);

      // 4. The printed deep link opens the graphic on first load (one sync pass on the miss). It
      // lands on the graphic's CONTROL page, rewritten to `#/control/<id>`: the old code editor
      // it used to open is closed (e2e/no-old-editor.spec.ts), so the working document is not
      // replaced any more and "open" is the control page showing the record.
      await page.goto(`/app#/graphic/${saved.id}`);
      await expect
        .poll(
          () =>
            page.evaluate(async (id) => {
              const { graphicById } = await import('/src/model/library.ts');
              const doc = graphicById(id);
              return {
                present: !!doc,
                origin: doc?.origin?.tool ?? null,
                open: !!document.querySelector('[data-testid="graphic-control-page"]'),
                hash: location.hash,
              };
            }, saved.id),
          { timeout: 30_000 },
        )
        .toEqual({ present: true, origin: 'noacg-cli', open: true, hash: `#/control/${saved.id}` });

      // 4e. A SET (docs/AGENT_SAVE.md §10): `noacg save a b c` sends three records as ONE operation
      // to the set door. All three arrive without Install, with every link; the readback verifies
      // them; sending it again - the records rebuilt, as a restarted CLI would - answers the same
      // ids and saves nothing; a changed set under that operation is refused; an invalid set is
      // refused before any write; and a fresh signed-in browser finds all three.
      const setTag = randomBytes(3).toString('hex');
      const setNames = ['Strap', 'Score', 'Clock'].map((n) => `Agent E2E set ${setTag} ${n}`);
      const buildSet = (names: string[]) =>
        page.evaluate(async (list) => {
          const { variantsFor } = await import('/src/templates/catalog.ts');
          const { graphicDoc } = await import('/src/bridge/bridgeApi.ts');
          return list.map((n) => graphicDoc({ ...variantsFor('lower-third')[0].create({}), name: n }, { name: n, origin: { tool: 'noacg-cli', version: 'e2e' } }));
        }, names);
      const sendSet = (graphics: unknown[], operation: string) =>
        fetch(`${origin}/api/me/graphic-sets`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}`, 'x-noacg-operation': operation },
          body: JSON.stringify({ graphics }),
        });
      type SetAnswer = { operationId: string; replayed: boolean; graphics: Array<{ id: string; name: string; url: string }>; receipt: Receipt };
      const setOperation = randomUUID();
      const setRecords = await buildSet(setNames);
      // What a rebuild changes: the ids and timestamps the bridge mints each time.
      const rebuilt = () => setRecords.map((r) => ({ ...r, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }));
      const created = await sendSet(setRecords, setOperation);
      expect(created.status, await created.clone().text()).toBe(201);
      const set = (await created.json()) as SetAnswer;
      expect(set.replayed).toBe(false);
      expect(set.graphics.map((g) => g.name)).toEqual(setNames);
      for (const g of set.graphics) expect(g.url).toBe(`${origin}/app#/graphic/${g.id}`);
      expect(set.receipt).toMatchObject({ operationId: setOperation, account: minted.account, deployment: origin, destination: 'library', state: 'saved', verified: false });
      const setBack = (await (await readBack(setOperation)).json()) as { receipt: Receipt };
      expect(setBack.receipt).toMatchObject({ state: 'saved', verified: true });
      expect(setBack.receipt.resources.map((r) => [r.id, r.state])).toEqual(set.graphics.map((g) => [g.id, 'saved']));

      const resent = await sendSet(rebuilt(), setOperation);
      expect(resent.status, await resent.clone().text()).toBe(200);
      const replay = (await resent.json()) as SetAnswer;
      expect(replay.replayed).toBe(true);
      expect(replay.graphics).toEqual(set.graphics);
      const changed = await sendSet(rebuilt().map((r, i) => (i === 2 ? { ...r, name: `${setNames[2]} changed` } : r)), setOperation);
      expect(changed.status).toBe(409);
      // Invalid input is refused before any write: nothing under that operation exists afterwards.
      const invalidOperation = randomUUID();
      const broken = await buildSet([`Agent E2E set ${setTag} broken`, `Agent E2E set ${setTag} fine`]);
      (broken[0] as { template: { html: string } }).template.html = '<p>no definition</p>';
      expect((await sendSet(broken, invalidOperation)).status).toBe(400);
      expect((await readBack(invalidOperation)).status).toBe(404);

      // A fresh browser, signed in: all three are in the library, once each, and every link opens.
      const fresh = await browser.newContext();
      try {
        const reader = await fresh.newPage();
        await signInOnHome(reader, E2E_EMAIL, E2E_PASSWORD);
        await expect
          .poll(
            () =>
              reader.evaluate(async (tag) => {
                const { loadGraphics } = await import('/src/model/library.ts');
                return loadGraphics().filter((g) => g.name.includes(`Agent E2E set ${tag}`)).map((g) => g.id).sort();
              }, setTag),
            { timeout: 30_000 },
          )
          .toEqual(set.graphics.map((g) => g.id).sort());
        await reader.goto('/app#/home/graphics');
        for (const n of setNames) await expect(reader.getByTestId('home-page').getByText(n, { exact: true }).first()).toBeVisible();
        for (const g of set.graphics) {
          await reader.goto(`/app#/graphic/${g.id}`);
          await expect(reader.getByTestId('graphic-control-page')).toBeVisible({ timeout: 30_000 });
          await expect.poll(() => reader.evaluate(() => location.hash)).toBe(`#/control/${g.id}`);
        }
      } finally {
        await fresh.close();
      }

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
      const sentBody = (await sent.json()) as { id: string; url: string; receipt: Receipt };
      // The link names THIS package, and the receipt says it waits for Install - not installed.
      expect(sentBody.url).toBe(`${origin}/app#/home/productions/${sentBody.id}`);
      expect(sentBody.receipt).toMatchObject({ state: 'pending_install', destination: 'home', account: minted.account, link: sentBody.url });
      const dismissName = `${packName} (dismiss)`;
      const dismissSent = await sendPack(dismissName);
      expect(dismissSent.status).toBe(201);
      const dismissId = ((await dismissSent.json()) as { id: string }).id;

      // A FAILED list load is an error with Retry - never the empty list it used to look like.
      const failList = (url: URL) => url.pathname.endsWith('/rest/v1/agent_packages');
      await page.route(failList, (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ message: 'injected outage' }) })
          : route.fallback(),
      );
      // The package link: Home → Productions with this one package selected.
      await page.goto(`/app#/home/productions/${sentBody.id}`);
      await expect(page.getByTestId('waiting-packages-error')).toBeVisible({ timeout: 20_000 });
      await expect(page.getByTestId('waiting-packages')).toHaveCount(0);
      await page.unroute(failList);
      await page.getByTestId('waiting-packages-retry').click();
      await expect(page.getByTestId('waiting-packages-error')).toHaveCount(0);
      const waitingRow = page.getByTestId(`waiting-package-${sentBody.id}`);
      const dismissRow = page.getByTestId(`waiting-package-${dismissId}`);
      await expect(waitingRow).toBeVisible({ timeout: 20_000 });
      await expect(waitingRow).toContainText('6 graphics');
      await expect(waitingRow).toHaveAttribute('aria-current', 'true');
      await expect(waitingRow).toBeFocused();
      await expect(dismissRow).not.toHaveAttribute('aria-current', 'true');

      await dismissRow.getByTestId('dismiss-waiting-package').click();
      await dismissRow.getByTestId('dismiss-waiting-package-confirm').click();
      await expect(dismissRow).toHaveCount(0);

      await waitingRow.getByTestId('install-waiting-package').click();
      await expect(page.getByTestId('production-page')).toBeVisible({ timeout: 30_000 });
      await expect(page.getByTestId('production-page')).toContainText(packName);
      await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(10);
      const productionId = decodeURIComponent(new URL(page.url()).hash.split('/')[2] ?? '');

      // The install is a durable receipt: the readback names the production, and so does the link.
      await expect
        .poll(async () => ((await (await readBack(sentBody.id)).json()) as { receipt?: Receipt }).receipt?.state)
        .toBe('installed');
      const installed = ((await (await readBack(sentBody.id)).json()) as { receipt: Receipt }).receipt;
      expect(installed.link).toBe(`${origin}/app#/production/${productionId}`);
      expect(((await (await readBack(dismissId)).json()) as { receipt: Receipt }).receipt.state).toBe('dismissed');
      await page.goto(`/app#/home/productions/${sentBody.id}`);
      await expect(page.getByTestId('waiting-package-fate')).toHaveAttribute('data-state', 'installed', { timeout: 20_000 });
      await page.getByTestId('waiting-package-open-production').click();
      await expect(page.getByTestId('production-page')).toContainText(packName);
      // A link this account has no package for: account guidance, nothing about anything else.
      await page.goto(`/app#/home/productions/${randomUUID()}`);
      await expect(page.getByTestId('waiting-package-fate')).toHaveAttribute('data-state', 'not_found', { timeout: 20_000 });
      await expect(page.getByTestId('waiting-package-fate')).toContainText(E2E_EMAIL.toLowerCase(), { ignoreCase: true });
      // Installed means gone from the waiting list - for good, not just on this screen.
      await expect
        .poll(() => page.evaluate(async (n) => {
          const { listWaitingPackages } = await import('/src/backend/agentPackages.ts');
          return (await listWaitingPackages()).filter((p) => p.name.startsWith(n)).length;
        }, packName))
        .toBe(0);

      // 4c. SHARE to Community packs (docs/AGENT_SAVE.md §8): the same key, only with the user's
      // licence and words, and a pack with no cues; it waits for review under Your packs. The
      // test withdraws it so the account is left as it was found.
      const shareName = `Agent E2E share ${randomBytes(3).toString('hex')}`;
      const graphicsOnly = (packFile.graphics as Array<Record<string, unknown>>).map(({ cues: _cues, ...g }) => g);
      const sendShare = (extra: Record<string, unknown>) =>
        fetch(`${origin}/api/me/community-packs`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}` },
          body: JSON.stringify({
            name: shareName,
            description: 'A newsroom pack shared from an agent',
            author: 'Agent E2E',
            pack: { format: 'noacg-pack', version: 1, name: shareName, graphics: graphicsOnly },
            ...extra,
          }),
        });
      expect((await sendShare({})).status, 'no licence, no share').toBe(400);
      const shared = await sendShare({ license: 'cc-by-4.0' });
      expect(shared.status, await shared.clone().text()).toBe(201);
      const sharedId = ((await shared.json()) as { id: string; state: string }).id;
      const mine = await page.evaluate(async () => {
        const { listMyPacks } = await import('/src/community/packs.ts');
        return listMyPacks();
      });
      expect(mine.find((p) => p.id === sharedId)).toMatchObject({ name: shareName, author: 'Agent E2E', state: 'in_review' });
      await page.evaluate(async (id) => {
        const { withdrawPack } = await import('/src/community/packs.ts');
        await withdrawPack(id);
      }, sharedId);

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

  test('the CLI delivers a set once, however its save is interrupted, repeated or doubled', async ({ page, baseURL }) => {
    test.setTimeout(480_000);
    const origin = baseURL!.replace(/\/+$/, '');
    buildCli();
    await signIn(page);
    await dismissWizard(page);
    await settleSync(page);
    const name = 'Claude Code CLI on E2E';
    await wipeE2EKeys(page, name);
    const work = await mkdtemp(path.join(os.tmpdir(), 'noacg-cli-e2e-'));
    try {
      const key = await mintKey(page, origin, name);
      const env = { NOACG_URL: origin, NOACG_AGENT_KEY: key, NOACG_CREDENTIALS_DIR: path.join(work, 'config'), NOACG_BROWSER: chromium.executablePath() };
      const tag = randomBytes(3).toString('hex');
      const pkg = (n: string) => path.join(work, n);
      for (const n of ['A', 'B', 'C']) {
        const made = await noacg(['scaffold', '--type', 'lower-third', '--name', `CLI set ${tag} ${n}`, '--out', pkg(n), '--json'], env);
        expect(made.code, made.stderr).toBe(0);
      }
      const inLibrary = () => libraryIds(page, `CLI set ${tag}`);
      const readBack = async (operation: string) =>
        ((await (await fetch(`${origin}/api/me/deliveries?id=${operation}`, { headers: { authorization: `Bearer ${key}` } })).json()) as { receipt?: Receipt }).receipt;
      const set = [pkg('A'), pkg('B'), pkg('C')];

      // KILLED MID-SAVE, THEN RUN AGAIN: the process dies once it has named its operation, whether
      // or not the write got out. The rerun resumes that operation and the account holds one set.
      const killed = await noacg(['save', ...set, '--no-bench', '--json'], env, { killWhen: /under operation [0-9a-f-]{36}/ });
      const operation = /under operation ([0-9a-f-]{36})/.exec(killed.stderr)?.[1];
      expect(operation, killed.stderr).toBeTruthy();
      const resumed = await noacg(['save', ...set, '--no-bench', '--json'], env);
      expect(resumed.code, resumed.stderr).toBe(0);
      expect(resumed.stderr).toContain(`Resuming 3 graphics under operation ${operation}`);
      const first = JSON.parse(resumed.stdout) as { ok: boolean; operationId: string; graphics: Array<{ id: string; name: string; url: string }>; receipt: Receipt };
      expect(first.operationId).toBe(operation);
      expect(first.graphics.map((g) => g.name)).toEqual(['A', 'B', 'C'].map((n) => `CLI set ${tag} ${n}`));
      expect(first.receipt).toMatchObject({ state: 'saved', verified: true, operationId: operation });
      const ids = first.graphics.map((g) => g.id);
      expect((await readBack(operation!))?.resources.map((r) => [r.id, r.state])).toEqual(ids.map((id) => [id, 'saved']));
      await expect.poll(inLibrary, { timeout: 30_000 }).toEqual([...ids].sort());

      // THE SAME COMMAND AGAIN: the first delivery's ids, nothing new saved.
      const repeated = await noacg(['save', ...set, '--no-bench', '--json'], env);
      expect(repeated.code, repeated.stderr).toBe(0);
      const again = JSON.parse(repeated.stdout) as { replayed: boolean; graphics: Array<{ id: string }> };
      expect(again.replayed).toBe(true);
      expect(again.graphics.map((g) => g.id)).toEqual(ids);
      await expect.poll(inLibrary, { timeout: 30_000 }).toEqual([...ids].sort());

      // AN INVALID GRAPHIC refuses the whole set before anything is sent.
      await cp(pkg('C'), pkg('Broken'), { recursive: true });
      await appendFile(path.join(pkg('Broken'), 'js', 'template.js'), '\nfunction play( {\n');
      const invalid = await noacg(['save', pkg('A'), pkg('Broken'), '--no-bench', '--json'], env);
      expect(invalid.code).toBe(1);
      expect(JSON.parse(invalid.stdout)).toMatchObject({ ok: false, reason: 'invalid' });
      expect(invalid.stderr).not.toContain('under operation');

      // TWO RUNS AT ONCE on a set not yet sent: one operation (the journal's lock), one set.
      const pair = [pkg('A'), pkg('B')];
      const [one, other] = await Promise.all([noacg(['save', ...pair, '--no-bench', '--json'], env), noacg(['save', ...pair, '--no-bench', '--json'], env)]);
      expect(one.code, one.stderr).toBe(0);
      expect(other.code, other.stderr).toBe(0);
      const pairOne = JSON.parse(one.stdout) as { operationId: string; graphics: Array<{ id: string }> };
      const pairOther = JSON.parse(other.stdout) as { operationId: string; graphics: Array<{ id: string }> };
      expect(pairOther.operationId).toBe(pairOne.operationId);
      expect(pairOther.graphics).toEqual(pairOne.graphics);
      const afterPair = [...ids, ...pairOne.graphics.map((g) => g.id)].sort();
      await expect.poll(inLibrary, { timeout: 30_000 }).toEqual(afterPair);

      // A CHANGED SET under the journaled operation: refused, nothing written, and forgotten.
      await appendFile(path.join(pkg('C'), 'css', 'template.css'), '\n/* changed */\n');
      const changed = await noacg(['save', ...set, '--no-bench', '--json'], env);
      expect(changed.code, changed.stderr).toBe(0);
      const changedOperation = (JSON.parse(changed.stdout) as { operationId: string }).operationId;
      expect(changedOperation, 'changed content is a new delivery of its own').not.toBe(operation);
      const afterChanged = await libraryIdsSettled(page, `CLI set ${tag}`, afterPair.length + 3);
      const journalFile = path.join(env.NOACG_CREDENTIALS_DIR, 'operations.json');
      const tiedTo = async (op: string) => (await readFile(journalFile, 'utf8')).split(op).length - 1;
      await writeFile(journalFile, (await readFile(journalFile, 'utf8')).replace(changedOperation, operation!));
      expect(await tiedTo(operation!), 'the first set and the changed one both journaled under it').toBe(2);
      const conflict = await noacg(['save', ...set, '--no-bench', '--json'], env);
      expect(conflict.code).toBe(1);
      expect(JSON.parse(conflict.stdout)).toMatchObject({ ok: false, reason: 'conflict', operationId: operation });
      expect(await tiedTo(operation!), 'the changed set is no longer tied to it; the first set still is').toBe(1);
      await expect.poll(inLibrary, { timeout: 30_000 }).toEqual(afterChanged);
      expect((await readBack(operation!))?.resources.map((r) => r.id)).toEqual(ids);
    } finally {
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
      await page.goto('/app').catch(() => undefined);
      await wipeE2EKeys(page, name).catch(() => undefined);
      await wipeMyGraphics(page).catch(() => undefined);
    }
  });
});

// ── the CLI, built and run (the second test) ──────────────────────────────────────────────

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = path.join(ROOT, 'cli', 'dist', 'index.js');

/** Build the CLI from this checkout with the root TypeScript. The terminal verbs need only what the
 *  root install already has; the MCP server's SDK, which they never load, is not installed here,
 *  so its file reports type errors and is emitted all the same. What matters is that it runs. */
function buildCli(): void {
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  spawnSync(process.execPath, [tsc, '-p', path.join(ROOT, 'cli', 'tsconfig.json')], { cwd: ROOT, encoding: 'utf8' });
  expect(existsSync(CLI), 'the CLI built').toBe(true);
  const version = spawnSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' });
  expect(version.status, version.stderr).toBe(0);
}

/** Run `noacg` to its end, or kill it as soon as its stderr matches `killWhen`. */
function noacg(args: string[], env: Record<string, string>, opts: { killWhen?: RegExp } = {}): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { ...process.env, ...env }, cwd: ROOT });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      if (opts.killWhen?.test(stderr) && child.exitCode === null) child.kill();
    });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

/** The library ids, after a sync pass, of the graphics whose name holds `tag`, sorted. */
async function libraryIds(page: Page, tag: string): Promise<string[]> {
  return page.evaluate(async (t) => {
    const { syncNow } = await import('/src/backend/syncController.ts');
    await syncNow();
    const { loadGraphics } = await import('/src/model/library.ts');
    return loadGraphics().filter((g) => g.name.includes(t)).map((g) => g.id).sort();
  }, tag);
}

/** `libraryIds` once it holds `count` graphics. */
async function libraryIdsSettled(page: Page, tag: string, count: number): Promise<string[]> {
  await expect.poll(async () => (await libraryIds(page, tag)).length, { timeout: 30_000 }).toBe(count);
  return libraryIds(page, tag);
}

/** Consent and redeem, as `noacg login` does, for a key the CLI is then handed. */
async function mintKey(page: Page, origin: string, name: string): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('hex');
  const state = randomBytes(16).toString('base64url');
  const listener = await loopback(state);
  try {
    await page.goto(`/app?agent=${state}&port=${listener.port}&name=${encodeURIComponent(name)}&challenge=${challenge}`);
    await page.getByTestId('agent-consent-allow').click();
    const code = await listener.code;
    const redeem = await fetch(`${origin}/api/me/agent-keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', code, verifier }),
    });
    expect(redeem.status, await redeem.clone().text()).toBe(201);
    return ((await redeem.json()) as { key: string }).key;
  } finally {
    listener.close();
    await page.goto('/app');
  }
}
