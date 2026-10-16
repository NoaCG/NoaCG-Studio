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
// covers: supabase/migrations/0094_agent_production_delivery.sql, src/model/productionDelivery.ts
// covers: cli/src/commands/docs.ts, cli/src/commands/status.ts, cli/src/commands/save.ts, cli/src/commands/pack.ts, cli/src/commands/login.ts, cli/src/receipt.ts, cli/src/operations.ts, cli/src/auth.ts
// covers: src/backend/agentPackages.ts, src/components/home/sections/ProductionsSection.tsx, src/app/router.ts
// covers: src/packs/graphicsPack.ts, src/model/templateSet.ts

import { test, expect, chromium, type Page } from '@playwright/test';
import http from 'node:http';
import { existsSync, readFileSync, rmSync } from 'node:fs';
import { appendFile, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { deleteAccountByEmail, dismissWizard, E2E_EMAIL, E2E_PASSWORD, haveCreds, mintAccount, SERVICE_ROLE_KEY, settleSync, signIn, signInOnHome, SUPABASE_URL, wipeMyGraphics } from './_helpers';

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
//   4f. A PRODUCTION (§11) asked for with this graphics-only key is refused, nothing written;
//   4g. a package of those graphics with no item identity warns before Install that they may
//      already be in the library; Cancel leaves it waiting;
//   4d. IDENTITY AND RECEIPTS (docs/AGENT_SAVE.md §9): consent, redeem, whoami and every receipt
//      name the same account and deployment; the readback finds only this key's deliveries;
//   4c. POST /api/me/community-packs with the key -> refused without the licence; with it, the
//      pack waits for review under the account's Your packs;
//   5. Settings -> Account -> Agent access lists the key; Revoke -> the same key is 401.
//
// THE CLI ITSELF (docs/AGENT_SAVE.md §10), the second test: the built `noacg` drives the real
// bridge and the real set door. A save killed mid-write and run again, the same command repeated
// and two runs at once each leave ONE set; an invalid graphic writes nothing; a changed set sent
// under the journaled operation is refused. Its key is consented with the production line (§11),
// so it then saves three graphics AS A PRODUCTION with an ordered rundown - killed and run again,
// repeated - reads the production back from the cloud, opens it in a fresh browser, and installs
// the same graphics' package after that recovery: Install warns it was already delivered, and
// installing anyway pools the delivered graphics instead of copying them.
//
// THE PUBLISHED ENTRY PATH (the third test, docs/work-specs/agent-delivery/spec.md AC-10/AC-11):
// what the Downloads prompt makes an agent do, from a home with nothing NoaCG in it, through
// `npx -y @noacg/cli@<pin>` (this checkout packed the same way until npm has the pin), for an
// account made for the run: doctor, `docs skill`, no login; "Don't allow" ends `login`; Allow on a
// card that names graphics and productions and the account; three graphics of a novel brief
// validated with their frames kept; one save with a production, killed and resumed, then replayed;
// `status` reads it back verified; a fresh browser opens every link; another account opening one
// sees only who it is; the same graphics' package reads back pending and Install says it was
// already delivered; logout revokes the key; the account is deleted with everything it owns.

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

      // 4f. A PRODUCTION needs its own consent (docs/AGENT_SAVE.md §11): this key was minted without
      // `productions:create`, so asking for one is refused before anything is written.
      const productionOperation = randomUUID();
      const asked = await fetch(`${origin}/api/me/graphic-sets`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}`, 'x-noacg-operation': productionOperation },
        body: JSON.stringify({ graphics: rebuilt(), production: { name: `Agent E2E production ${setTag}` } }),
      });
      expect(asked.status).toBe(403);
      expect(((await asked.json()) as { error: { message: string } }).error.message).toMatch(/not make productions\. Nothing was saved\..*noacg login.*library only/);
      expect((await readBack(productionOperation)).status).toBe(404);

      // 4g. A package of those same graphics that carries no item identity: Install cannot tell
      // whether they are the delivered ones, so it says they may already be in the library before
      // it adds copies. Cancel leaves it waiting; it is dismissed here.
      const unidentified = await page.evaluate(async (records) => {
        const { packGraphicEntry } = await import('/src/packs/graphicsPack.ts');
        return Promise.all(records.map((r) => packGraphicEntry(r.template as never, { name: r.name as string })));
      }, setRecords as Array<{ name: string; template: unknown }>);
      const unidentifiedSent = await fetch(`${origin}/api/me/packages`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${minted.key}` },
        body: JSON.stringify({ format: 'noacg-pack', version: 1, name: `Agent E2E package ${setTag} again`, description: '', graphics: unidentified }),
      });
      expect(unidentifiedSent.status, await unidentifiedSent.clone().text()).toBe(201);
      const unidentifiedId = ((await unidentifiedSent.json()) as { id: string }).id;
      await libraryIdsSettled(page, `Agent E2E set ${setTag}`, 3);
      await page.goto(`/app#/home/productions/${unidentifiedId}`);
      const unidentifiedRow = page.getByTestId(`waiting-package-${unidentifiedId}`);
      await expect(unidentifiedRow).toBeVisible({ timeout: 20_000 });
      await unidentifiedRow.getByTestId('install-waiting-package').click();
      const repeat = unidentifiedRow.getByTestId('waiting-package-repeat');
      await expect(repeat).toContainText('may already be in your library');
      for (const n of setNames) await expect(repeat).toContainText(n);
      await shot(page, unidentifiedRow, 'install-may-repeat');
      await unidentifiedRow.getByTestId('install-waiting-package-cancel').click();
      await expect(repeat).toHaveCount(0);
      await expect(unidentifiedRow.getByTestId('install-waiting-package')).toBeVisible();
      await unidentifiedRow.getByTestId('dismiss-waiting-package').click();
      await unidentifiedRow.getByTestId('dismiss-waiting-package-confirm').click();
      await expect(unidentifiedRow).toHaveCount(0);
      expect(await libraryIds(page, `Agent E2E set ${setTag}`), 'nothing was installed').toEqual(set.graphics.map((g) => g.id).sort());

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

  test('the CLI delivers a set once, however its save is interrupted, repeated or doubled', async ({ page, baseURL, browser }) => {
    test.setTimeout(720_000);
    const origin = baseURL!.replace(/\/+$/, '');
    buildCli();
    await signIn(page);
    await dismissWizard(page);
    await settleSync(page);
    const name = 'Claude Code CLI on E2E';
    await wipeE2EKeys(page, name);
    const work = await mkdtemp(path.join(os.tmpdir(), 'noacg-cli-e2e-'));
    try {
      // Consented with the production line, as `noacg login` asks for it.
      const key = await mintKey(page, origin, name, 'productions:create');
      const env = { NOACG_URL: origin, NOACG_AGENT_KEY: key, NOACG_CREDENTIALS_DIR: path.join(work, 'config'), NOACG_BROWSER: chromium.executablePath() };
      // The first CLI run must not be the dev server's first /bridge (the CLI gives it 30 s).
      await page.goto('/bridge');
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
      expect(killed.signal, `the save was killed, not finished: ${killed.stderr}`).toBe('SIGKILL');
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
      // That was a library-only set from a key that may make productions: it made none.
      expect((await readBack(operation!))?.destination).toBe('library');

      // A PRODUCTION IN THE SAME DELIVERY (docs/AGENT_SAVE.md §11): three graphics and an ordered,
      // interleaved rundown. Killed once it has named its operation and run again, it resumes that
      // operation; the same command again answers the same production. Nothing is published.
      const prodName = `CLI production ${tag}`;
      for (const n of ['A', 'B', 'C']) {
        const made = await noacg(['scaffold', '--type', 'lower-third', '--name', `CLI prod ${tag} ${n}`, '--out', pkg(`P${n}`), '--json'], env);
        expect(made.code, made.stderr).toBe(0);
      }
      const prodSet = [pkg('PA'), pkg('PB'), pkg('PC')];
      const g = (n: string) => `CLI prod ${tag} ${n}`;
      const cues = [
        { graphic: g('B'), label: 'Score 0-0' },
        { graphic: g('A'), label: 'Anna Andersson' },
        { graphic: g('B'), label: 'Score 1-0' },
        { graphic: g('C'), label: 'Clock' },
      ];
      const cuesFile = path.join(work, 'cues.json');
      await writeFile(cuesFile, JSON.stringify(cues));
      const prodArgs = ['save', ...prodSet, '--production', prodName, '--rundown', cuesFile, '--no-bench', '--json'];
      const prodKilled = await noacg(prodArgs, env, { killWhen: /under operation [0-9a-f-]{36}/ });
      expect(prodKilled.signal, `the save was killed, not finished: ${prodKilled.stderr}`).toBe('SIGKILL');
      const prodOperation = /under operation ([0-9a-f-]{36})/.exec(prodKilled.stderr)?.[1];
      expect(prodKilled.stderr).toContain(`and the production "${prodName}"`);
      const prodResumed = await noacg(prodArgs, env);
      expect(prodResumed.code, prodResumed.stderr).toBe(0);
      expect(prodResumed.stderr).toContain(`Resuming 3 graphics and the production "${prodName}" under operation ${prodOperation}`);
      type ProdOutcome = { ok: boolean; replayed: boolean; operationId: string; graphics: Array<{ id: string; name: string }>; production: { id: string; name: string; url: string }; receipt: Receipt };
      const prod = JSON.parse(prodResumed.stdout) as ProdOutcome;
      expect(prod.operationId).toBe(prodOperation);
      expect(prod.production.url).toBe(`${origin}/app#/production/${prod.production.id}`);
      expect(prod.receipt).toMatchObject({ destination: 'production', state: 'saved', verified: true, link: prod.production.url });
      const prodIds = prod.graphics.map((x) => x.id);
      const prodRepeated = JSON.parse((await noacg(prodArgs, env)).stdout) as ProdOutcome;
      expect(prodRepeated.replayed).toBe(true);
      expect(prodRepeated.production).toEqual(prod.production);
      expect(prodRepeated.graphics.map((x) => x.id)).toEqual(prodIds);
      // The readback by the production's own id is the same delivery, verified.
      const byProduction = await readBack(prod.production.id);
      expect(byProduction).toMatchObject({ operationId: prodOperation, destination: 'production', verified: true });
      expect(byProduction?.resources.map((r) => [r.kind, r.state])).toEqual([['graphic', 'saved'], ['graphic', 'saved'], ['graphic', 'saved'], ['production', 'saved']]);

      // The cloud holds the final records: one production, its pool the three delivered graphics on
      // their own layers, its rundown in the order sent, unpublished; three library graphics, once.
      const cloud = await page.evaluate(async ({ id, tagged }) => {
        const { getSupabase } = await import('/src/backend/supabase.ts');
        const sb = (await getSupabase())!;
        const show = await sb.from('documents').select('kind, deleted, body').eq('id', id).maybeSingle();
        const graphics = await sb.from('documents').select('id').eq('kind', 'graphic').eq('deleted', false).ilike('name', `${tagged}%`);
        const productions = await sb.from('documents').select('id').eq('kind', 'show').eq('deleted', false).eq('name', (show.data?.body as { name?: string } | undefined)?.name ?? '');
        return { show: show.data, graphics: (graphics.data ?? []).map((r) => r.id).sort(), productions: (productions.data ?? []).length };
      }, { id: prod.production.id, tagged: `CLI prod ${tag}` });
      expect(cloud.show?.kind).toBe('show');
      expect(cloud.show?.deleted).toBe(false);
      const body = cloud.show!.body as { name: string; graphics: Array<{ id: string; name: string; graphicId: string; layer: number }>; cues: Array<{ sourceId: string; label: string }>; hostedSlug?: string; outputSlug?: string };
      expect(body.name).toBe(prodName);
      expect(body.graphics.map((x) => x.graphicId)).toEqual(prodIds);
      expect(new Set(body.graphics.map((x) => x.layer)).size).toBe(3);
      const poolName = new Map(body.graphics.map((x) => [x.id, x.name]));
      expect(body.cues.map((c) => [poolName.get(c.sourceId), c.label])).toEqual(cues.map((c) => [c.graphic, c.label]));
      expect(body.hostedSlug ?? body.outputSlug ?? null).toBeNull();
      expect(cloud.graphics).toEqual([...prodIds].sort());
      expect(cloud.productions).toBe(1);

      // The link opens the production, rundown in order, in a fresh signed-in browser.
      const fresh = await browser.newContext();
      try {
        const reader = await fresh.newPage();
        await signInOnHome(reader, E2E_EMAIL, E2E_PASSWORD);
        await reader.goto(`/app#/production/${prod.production.id}`);
        await expect(reader.getByTestId('production-page')).toContainText(prodName, { timeout: 30_000 });
        const rows = reader.getByTestId('cue-list').locator('.pd-cue');
        await expect(rows).toHaveCount(4);
        for (const [i, c] of cues.entries()) await expect(rows.nth(i)).toContainText(c.label);
      } finally {
        await fresh.close();
      }

      // INSTALLED AFTER RECOVERY: the same three graphics' package, sent the old way, waits on Home.
      // Every entry carries the item identity its library record carries, so Install says the
      // delivery already became a production; installed anyway, it pools the delivered graphics
      // rather than saving copies.
      const packed = await noacg(['pack', ...prodSet, '--save', '--name', `${prodName} package`, '--rundown', cuesFile, '--no-bench', '--json'], env);
      expect(packed.code, packed.stderr).toBe(0);
      const packageId = (JSON.parse(packed.stdout) as { id: string }).id;
      await expect.poll(() => libraryIds(page, `CLI prod ${tag}`), { timeout: 30_000 }).toEqual([...prodIds].sort());
      await expect
        .poll(() => page.evaluate(async (id) => {
          const { loadShows } = await import('/src/model/shows.ts');
          return loadShows().some((s) => s.id === id);
        }, prod.production.id), { timeout: 30_000 })
        .toBe(true);
      await page.goto(`/app#/home/productions/${packageId}`);
      const packRow = page.getByTestId(`waiting-package-${packageId}`);
      await expect(packRow).toBeVisible({ timeout: 20_000 });
      await packRow.getByTestId('install-waiting-package').click();
      await expect(packRow.getByTestId('waiting-package-repeat')).toContainText(`Already delivered as “${prodName}”`);
      await shot(page, packRow, 'install-already-delivered');
      await packRow.getByTestId('install-waiting-package-anyway').click();
      await expect(page.getByTestId('production-page')).toContainText(`${prodName} package`, { timeout: 30_000 });
      await expect(page.getByTestId('cue-list').locator('.pd-cue')).toHaveCount(4);
      const second = await page.evaluate(async (n) => {
        const { loadShows } = await import('/src/model/shows.ts');
        return loadShows().find((s) => s.name === n)?.graphics.map((x) => x.graphicId) ?? null;
      }, `${prodName} package`);
      expect(second, 'the second production pools the delivered graphics').toEqual(prodIds);
      expect(await libraryIds(page, `CLI prod ${tag}`), 'and no copy of them was saved').toEqual([...prodIds].sort());
    } finally {
      killAll();
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
      await page.goto('/app').catch(() => undefined);
      await wipeE2EKeys(page, name).catch(() => undefined);
      await wipeMyGraphics(page).catch(() => undefined);
      // The productions this walk made, pushed as tombstones, and any package it left waiting.
      await page.evaluate(async () => {
        const { listWaitingPackages, removeWaitingPackage } = await import('/src/backend/agentPackages.ts');
        for (const p of await listWaitingPackages()) if (p.name.startsWith('CLI production')) await removeWaitingPackage(p.id);
        const { hydrateDurableStore } = await import('/src/model/durableStore.ts');
        await hydrateDurableStore();
        const { syncNow } = await import('/src/backend/syncController.ts');
        await syncNow();
        const { deleteShow, loadShows } = await import('/src/model/shows.ts');
        for (const s of loadShows()) if (s.name.startsWith('CLI production')) deleteShow(s.id);
        await syncNow();
      }).catch(() => undefined);
    }
  });

  test('the published entry path: npx from a clean home, a new account, early consent, a three-graphic production opened', async ({ page, baseURL, browser }) => {
    test.skip(!SERVICE_ROLE_KEY || !SUPABASE_URL, 'needs SUPABASE_SERVICE_ROLE_KEY to make and delete the new account');
    test.setTimeout(900_000);
    const origin = baseURL!.replace(/\/+$/, '');
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const email = `e2e-published-cli@${E2E_EMAIL.split('@')[1] || 'noacg.local'}`;
    const password = 'noacg-e2e-published-cli-pw';
    await mintAccount(admin, email, password);
    const work = await mkdtemp(path.join(os.tmpdir(), 'noacg-published-e2e-'));
    try {
      // THE CLI AS A USER GETS IT. The Downloads prompt's own command, `npx -y @noacg/cli@<pin>`,
      // when npm has the pinned version; before a release lands, this checkout packed as a tarball
      // (`npm pack` of its fresh dist and committed skill; CI checks the skill copy is current), run
      // through npx the same way. Which one ran is annotated. The walk runs on Linux runners: on
      // Windows, npx.cmd needs a shell, which would split the arguments with spaces.
      const { run, source } = await cleanAgentCli(work, origin);
      test.info().annotations.push({ type: 'noacg-cli', description: source });

      // Preflight, as the prompt asks: the version, doctor, the skill, and no login yet.
      const version = await run(['--version']);
      expect(version.code, version.stderr).toBe(0);
      expect(version.stdout.trim()).toBe(CLI_PIN);
      expect((await run(['doctor'])).code).toBe(0);
      const skill = await run(['docs', 'skill']);
      expect(skill.code, skill.stderr).toBe(0);
      expect(skill.stdout).toContain('Run the SAME');
      const nobody = await run(['whoami', '--json']);
      expect(JSON.parse(nobody.stdout)).toMatchObject({ loggedIn: false });

      // The new account signs in where the consent page will open.
      await signInOnHome(page, email, password);

      // CANCELLED CONSENT: "Don't allow" ends `login` at once, nothing is stored.
      const denied = await consent(page, run, 'deny');
      expect(denied.code, denied.stderr).toBe(1);
      expect(`${denied.stdout}${denied.stderr}`).toContain('not allowed');
      expect(JSON.parse((await run(['whoami', '--json'])).stdout)).toMatchObject({ loggedIn: false });

      // EARLY CONSENT, allowed: the card asks for graphics and productions and names the account.
      const allowed = await consent(page, run, 'allow', email);
      expect(allowed.code, allowed.stderr).toBe(0);
      const who = JSON.parse((await run(['whoami', '--json'])).stdout) as { valid: boolean; account: { email: string }; key: { scopes: string[] } };
      expect(who).toMatchObject({ valid: true, account: { email } });
      expect(who.key.scopes).toEqual(['graphics:create', 'productions:create']);

      // A NOVEL, SANITIZED BRIEF: a harbour regatta's name strap, start countdown and results ticker.
      const tag = randomBytes(3).toString('hex');
      const brief = [
        { dir: 'strap', type: 'lower-third', name: `Regatta ${tag} name strap` },
        { dir: 'countdown', type: 'countdown', name: `Regatta ${tag} start countdown` },
        { dir: 'ticker', type: 'ticker', name: `Regatta ${tag} results ticker` },
      ];
      const dirs = brief.map((b) => path.join(work, b.dir));
      for (const [i, b] of brief.entries()) {
        const made = await run(['scaffold', '--type', b.type, '--name', b.name, '--out', dirs[i], '--json']);
        expect(made.code, made.stderr).toBe(0);
        // VISUAL VALIDATION: the frames an agent judges, kept with the run's results for a person.
        const shots = path.join(work, `${b.dir}-shots`);
        const checked = await run(['validate', dirs[i], '--screenshots', shots, '--json']);
        expect(checked.code, checked.stderr).toBe(0);
        expect(JSON.parse(checked.stdout)).toMatchObject({ ok: true });
        for (const frame of ['onair', 'stress']) {
          const file = path.join(shots, `${frame}.png`);
          expect(readFileSync(file).length, `${b.dir} ${frame}.png is a real frame`).toBeGreaterThan(1000);
          await cp(file, test.info().outputPath(`published-${b.dir}-${frame}.png`));
        }
      }

      // DELIVERY WITH AN UNCERTAIN ANSWER: the save dies once it has named its operation, whether or
      // not the write got out; the same command again resumes that operation, and a third run is a
      // replay. One production, three graphics.
      const show = `Regatta ${tag} evening`;
      const cues = [
        { graphic: brief[1].name, label: 'Start in 5' },
        { graphic: brief[0].name, label: 'Race officer' },
        { graphic: brief[2].name, label: 'Results' },
      ];
      const cuesFile = path.join(work, 'cues.json');
      await writeFile(cuesFile, JSON.stringify(cues));
      const saveArgs = ['save', ...dirs, '--production', show, '--rundown', cuesFile, '--layer', '10', '--no-bench', '--json'];
      const killed = await run(saveArgs, { killWhen: /under operation [0-9a-f-]{36}/ });
      expect(killed.signal, `the save was killed, not finished: ${killed.stderr}`).toBe('SIGKILL');
      const operation = /under operation ([0-9a-f-]{36})/.exec(killed.stderr)?.[1];
      const resumed = await run(saveArgs);
      expect(resumed.code, resumed.stderr).toBe(0);
      expect(resumed.stderr).toContain(`Resuming 3 graphics and the production "${show}" under operation ${operation}`);
      type Delivered = { ok: boolean; replayed: boolean; operationId: string; graphics: Array<{ id: string; name: string; url: string }>; production: { id: string; url: string }; receipt: Receipt };
      const delivered = JSON.parse(resumed.stdout) as Delivered;
      expect(delivered.graphics.map((g) => g.name)).toEqual(brief.map((b) => b.name));
      expect(delivered.receipt).toMatchObject({ operationId: operation, destination: 'production', state: 'saved', verified: true, account: { email } });
      const replay = JSON.parse((await run(saveArgs)).stdout) as Delivered;
      expect(replay.replayed).toBe(true);
      expect(replay.graphics.map((g) => g.id)).toEqual(delivered.graphics.map((g) => g.id));
      expect(replay.production).toEqual(delivered.production);

      // READBACK through the CLI: every resource saved, verified, in the new account.
      const status = JSON.parse((await run(['status', operation!, '--json'])).stdout) as { receipt: Receipt };
      expect(status.receipt).toMatchObject({ verified: true, account: { email } });
      expect(status.receipt.resources.map((r) => [r.kind, r.state])).toEqual([['graphic', 'saved'], ['graphic', 'saved'], ['graphic', 'saved'], ['production', 'saved']]);

      // BROWSER-OPENED: a fresh browser, signed in as the new account, opens every link it was given.
      const fresh = await browser.newContext();
      try {
        const reader = await fresh.newPage();
        await signInOnHome(reader, email, password);
        for (const g of delivered.graphics) {
          await reader.goto(g.url);
          await expect(reader.getByTestId('graphic-control-page')).toBeVisible({ timeout: 30_000 });
          await expect.poll(() => reader.evaluate(() => location.hash)).toBe(`#/control/${g.id}`);
        }
        await reader.goto(delivered.production.url);
        await expect(reader.getByTestId('production-page')).toContainText(show, { timeout: 30_000 });
        const rows = reader.getByTestId('cue-list').locator('.pd-cue');
        await expect(rows).toHaveCount(3);
        for (const [i, c] of cues.entries()) await expect(rows.nth(i)).toContainText(c.label);
      } finally {
        await fresh.close();
      }

      // WRONG ACCOUNT: another account opening the same links is told who it is, and sees nothing.
      const other = await browser.newContext();
      try {
        const stranger = await other.newPage();
        await signInOnHome(stranger, E2E_EMAIL, E2E_PASSWORD);
        await stranger.goto(delivered.graphics[0].url);
        await expect(stranger.getByTestId('control-lookup')).toContainText('Graphic not found', { timeout: 30_000 });
        await expect(stranger.getByTestId('control-lookup-account')).toContainText(E2E_EMAIL);
        await expect(stranger.locator('body')).not.toContainText(brief[0].name);
      } finally {
        await other.close();
      }

      // LEGACY PENDING PACKAGE: the same graphics sent the older way wait for Install, read back as
      // pending, and Install says the delivery already became a production.
      const packed = await run(['pack', ...dirs, '--save', '--name', `${show} package`, '--rundown', cuesFile, '--no-bench', '--json']);
      expect(packed.code, packed.stderr).toBe(0);
      const packageId = (JSON.parse(packed.stdout) as { id: string }).id;
      const pending = JSON.parse((await run(['status', packageId, '--json'])).stdout) as { receipt: Receipt };
      expect(pending.receipt.resources.map((r) => r.state)).toEqual(['pending_install']);
      await page.goto('/app#/home/graphics');
      await expect.poll(() => libraryIds(page, `Regatta ${tag}`), { timeout: 30_000 }).toEqual(delivered.graphics.map((g) => g.id).sort());
      // Install recognises the delivery from the synced library and productions, so both first.
      await expect
        .poll(() => page.evaluate(async (id) => {
          const { loadShows } = await import('/src/model/shows.ts');
          return loadShows().some((s) => s.id === id);
        }, delivered.production.id), { timeout: 30_000 })
        .toBe(true);
      await page.goto(`/app#/home/productions/${packageId}`);
      const row = page.getByTestId(`waiting-package-${packageId}`);
      await expect(row).toBeVisible({ timeout: 20_000 });
      await row.getByTestId('install-waiting-package').click();
      await expect(row.getByTestId('waiting-package-repeat')).toContainText(`Already delivered as “${show}”`);
      await row.getByTestId('install-waiting-package-cancel').click();
      await expect(row).toBeVisible();

      // Logging out revokes the key: the next save is refused before anything is sent.
      expect((await run(['logout', '--json'])).code).toBe(0);
      expect(JSON.parse((await run(['whoami', '--json'])).stdout)).toMatchObject({ loggedIn: false });
    } finally {
      killAll();
      await rm(work, { recursive: true, force: true }).catch(() => undefined);
      // The account and everything it owns (documents, keys, deliveries, packages) go with it.
      await deleteAccountByEmail(admin, email);
    }
  });
});

// ── the published CLI, from a clean home (the third test) ─────────────────────────────────

/** The version the Downloads prompt pins: cli/package.json's. */
const CLI_PIN = (JSON.parse(readFileSync(fileURLToPath(new URL('../../cli/package.json', import.meta.url)), 'utf8')) as { version: string }).version;

type CliRun = (args: string[], opts?: { killWhen?: RegExp; timeoutMs?: number; watch?: (stderr: string) => void }) => ReturnType<typeof noacg>;

/** A coding agent's machine with nothing NoaCG on it: its own HOME, config dir and npm cache, no
 *  inherited NoaCG variable, and the CLI reached only through `npx -y`. The browser is the runner's
 *  Chromium, named as the docs allow (NOACG_BROWSER), because the CLI bundles none. */
async function cleanAgentCli(work: string, origin: string): Promise<{ run: CliRun; source: string }> {
  const home = path.join(work, 'home');
  const env: Record<string, string> = {
    PATH: process.env.PATH ?? '',
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    APPDATA: path.join(home, 'AppData', 'Roaming'),
    npm_config_cache: path.join(work, 'npm-cache'),
    npm_config_update_notifier: 'false',
    TMPDIR: work,
    NOACG_URL: origin,
    NOACG_BROWSER: chromium.executablePath(),
    ...(process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {}),
  };
  const npm = (args: string[], cwd: string) => spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', args, { cwd, env, encoding: 'utf8', shell: process.platform === 'win32' });
  // npm must ANSWER: an unreachable registry fails here rather than falling back to the checkout.
  const latestView = npm(['view', '@noacg/cli', 'version'], work);
  expect(latestView.status, `npm answered for @noacg/cli: ${latestView.stderr}`).toBe(0);
  const latest = latestView.stdout.trim();
  const onNpm = npm(['view', `@noacg/cli@${CLI_PIN}`, 'version'], work).stdout.trim() === CLI_PIN;
  // The checkout stands in ONLY for an unreleased version: a pin newer than npm's latest, which is
  // a release pull request or a landing whose publish has not finished. A run dispatched on main
  // is the published-path evidence (AC-10), so there the pin must come from npm.
  const unreleased = !onNpm && newerThan(CLI_PIN, latest);
  const evidenceRun = process.env.GITHUB_EVENT_NAME === 'workflow_dispatch' && process.env.GITHUB_REF === 'refs/heads/main';
  expect(onNpm || (unreleased && !evidenceRun), `@noacg/cli@${CLI_PIN} is not on npm (latest ${latest})${evidenceRun ? '; a run dispatched on main must run the published package' : ''}`).toBe(true);
  let spec: string[];
  let source: string;
  if (onNpm) {
    spec = ['-y', `@noacg/cli@${CLI_PIN}`];
    source = `npm @noacg/cli@${CLI_PIN}`;
  } else {
    buildCli();
    const packed = npm(['pack', '--ignore-scripts', '--pack-destination', work, '--json'], path.join(ROOT, 'cli'));
    expect(packed.status, packed.stderr).toBe(0);
    const tarball = path.join(work, (JSON.parse(packed.stdout) as Array<{ filename: string }>)[0].filename);
    spec = ['-y', '--package', tarball, 'noacg'];
    source = `this checkout packed as @noacg/cli@${CLI_PIN} (not on npm yet)`;
  }
  const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
  const run: CliRun = (args, opts = {}) => spawnCli(npx, [...spec, ...args], env, work, { timeoutMs: 240_000, ...opts });
  return { run, source };
}

/** Whether version `a` (x.y.z) is newer than `b`. */
function newerThan(a: string, b: string): boolean {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number));
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
}

/** `noacg login --no-browser`, answered on the consent page it prints: Allow or Don't allow. */
async function consent(page: Page, run: CliRun, answer: 'allow' | 'deny', email?: string): ReturnType<CliRun> {
  let opened: (url: string) => void = () => undefined;
  const url = new Promise<string>((r) => { opened = r; });
  const login = run(['login', '--no-browser', '--name', 'Published CLI on E2E', '--wait', '120'], {
    watch: (stderr) => {
      const m = /(https?:\/\/\S+\/app\?agent=\S+)/.exec(stderr);
      if (m) opened(m[1]);
    },
  });
  // A login that ends before printing its page fails the race; handled, so its later end is quiet.
  const early = login.then((r) => Promise.reject(new Error(`login ended before printing its page: ${r.stderr}`)));
  early.catch(() => undefined);
  await page.goto(await Promise.race([url, early]));
  if (answer === 'allow') {
    await expect(page.getByTestId('agent-consent-title')).toHaveText('Allow “Published CLI on E2E” to save graphics and productions to your NoaCG account?');
    await expect(page.getByTestId('agent-consent-account')).toContainText(email!);
    await page.getByTestId('agent-consent-allow').click();
  } else {
    await page.getByTestId('agent-consent-deny').click();
  }
  const done = await login;
  await page.goto('/app#/home');
  return done;
}

// ── the CLI, built and run (the second test) ──────────────────────────────────────────────

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const CLI = path.join(ROOT, 'cli', 'dist', 'index.js');

/** Build the CLI from this checkout with the root TypeScript into a fresh `cli/dist`, so a stale
 *  build can never stand in for this one. The root install is not the CLI's own: its zod is a major
 *  version ahead of the CLI's, so `mcp.ts` (which the terminal verbs never load) reports type
 *  errors and is emitted all the same. What matters is that the CLI built and runs. */
function buildCli(): void {
  rmSync(path.join(ROOT, 'cli', 'dist'), { recursive: true, force: true });
  const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
  const built = spawnSync(process.execPath, [tsc, '-p', path.join(ROOT, 'cli', 'tsconfig.json')], { cwd: ROOT, encoding: 'utf8' });
  expect(existsSync(CLI), `the CLI built:\n${built.stdout}${built.stderr}`).toBe(true);
  const version = spawnSync(process.execPath, [CLI, '--version'], { encoding: 'utf8' });
  expect(version.status, version.stderr).toBe(0);
}

/** Every CLI process a run started and that may still be alive, with its browser. */
const running = new Set<ReturnType<typeof spawn>>();

/** Kill a CLI and everything it started (its headless browser): on POSIX its own process group. */
function killTree(child: ReturnType<typeof spawn>): void {
  if (child.exitCode !== null || child.signalCode !== null || !child.pid) return;
  try {
    if (process.platform === 'win32') child.kill('SIGKILL');
    else process.kill(-child.pid, 'SIGKILL');
  } catch {
    /* already gone */
  }
}

function killAll(): void {
  for (const child of running) killTree(child);
}

/** Run `noacg` to its end, or SIGKILL it (a crash, which nothing in it can catch) as soon as its
 *  stderr matches `killWhen`. A run that takes longer than `timeoutMs` is killed too and fails. */
function noacg(
  args: string[],
  env: Record<string, string>,
  opts: { killWhen?: RegExp; timeoutMs?: number } = {},
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  return spawnCli(process.execPath, [CLI, ...args], { ...(process.env as Record<string, string>), ...env }, ROOT, opts);
}

/** `noacg`'s runner for any command line, with exactly `env` (nothing inherited) and its own
 *  process group; `watch` sees the stderr so far each time it grows. */
function spawnCli(
  command: string,
  argv: string[],
  env: Record<string, string>,
  cwd: string,
  opts: { killWhen?: RegExp; timeoutMs?: number; watch?: (stderr: string) => void } = {},
): Promise<{ code: number | null; signal: NodeJS.Signals | null; stdout: string; stderr: string }> {
  const shown = argv.filter((a) => a !== CLI).slice(0, 4).join(' ');
  return new Promise((resolve) => {
    const child = spawn(command, argv, { env, cwd, detached: process.platform !== 'win32', shell: process.platform === 'win32' && command !== process.execPath });
    running.add(child);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      stderr += `\n[e2e] ${shown} still running after ${(opts.timeoutMs ?? 120_000) / 1000} s - killed`;
      killTree(child);
    }, opts.timeoutMs ?? 120_000);
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => {
      stderr += d.toString();
      opts.watch?.(stderr);
      if (opts.killWhen?.test(stderr)) killTree(child);
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      running.delete(child);
      resolve({ code, signal, stdout, stderr });
    });
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

/** A picture of `what` at 1440 and 390 px wide, kept with the run's results (never committed) for a
 *  person to look at: the consent card and the Install warnings have no other render check. */
async function shot(page: Page, what: import('@playwright/test').Locator, name: string): Promise<void> {
  const size = page.viewportSize();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await what.screenshot({ path: test.info().outputPath(`${name}-${width}.png`) });
  }
  if (size) await page.setViewportSize(size);
}

/** Consent and redeem, as `noacg login` does, for a key the CLI is then handed. `scopes` is what the
 *  consent URL asks for beyond saving graphics; the card must list it before Allow. */
async function mintKey(page: Page, origin: string, name: string, scopes?: string): Promise<string> {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('hex');
  const state = randomBytes(16).toString('base64url');
  const listener = await loopback(state);
  try {
    await page.goto(`/app?agent=${state}&port=${listener.port}&name=${encodeURIComponent(name)}&challenge=${challenge}${scopes ? `&scopes=${scopes}` : ''}`);
    if (scopes) {
      await expect(page.getByTestId('agent-consent-permissions')).toContainText('Make new productions with rundowns from the graphics it saves (never publishes or plays them)');
      await expect(page.getByTestId('agent-consent-title')).toContainText('to save graphics and productions to your NoaCG account?');
      await shot(page, page.getByTestId('agent-consent'), 'consent-with-productions');
    } else {
      await expect(page.getByTestId('agent-consent-title')).toContainText('to save graphics to your NoaCG library?');
    }
    await page.getByTestId('agent-consent-allow').click();
    await page.waitForURL((u) => u.hostname === '127.0.0.1' && u.pathname === '/callback', { timeout: 20_000 });
    const code = await listener.code;
    const redeem = await fetch(`${origin}/api/me/agent-keys`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'redeem', code, verifier }),
    });
    expect(redeem.status, await redeem.clone().text()).toBe(201);
    const minted = (await redeem.json()) as { key: string; scopes: string[] };
    expect(minted.scopes).toEqual(scopes ? ['graphics:create', scopes] : ['graphics:create']);
    return minted.key;
  } finally {
    listener.close();
    await page.goto('/app');
  }
}
