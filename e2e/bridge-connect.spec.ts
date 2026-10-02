// covers: src/components/{SettingsDialog,BridgePairPage}.tsx
// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer}.tsx
//
// NOACG BRIDGE (docs/BRIDGE.md). The browser half is one file, and the two surfaces it grows are
// already mapped elsewhere for their own reasons - SettingsDialog to analytics/auth, ProductionPage
// into the productions set - so those rules are UNION'd with this one rather than replaced. Without
// this line a change to the link contract would run specs that pin the panels' other contents and
// never the four diagnosis states, which are the whole point of the feature. The channel table and
// the per-cue slot helpers live in playoutLink.ts too, and the rundown is what reads them.
// serverPlayout.ts (with its store and playoutSlots.ts) is what every server verb and every row
// address goes through, and the baselines draw both.
// covers: src/control/{playoutLink,playoutProtocol,serverPlayout,serverPlayoutStore,playoutSlots}.ts
//
// ProductionLinks.tsx is where BridgeAirRow itself lives since the 2026-08-28 split, so it is named
// here rather than left to the `src/components/{home,save}/**` covers line: that rule's set does
// not include this spec, and the ONE button is the whole browser half of the feature.
// covers: src/components/home/{ProductionPage,CueRundown,PlayoutMonitors,ServerCueEditor,RailResizer,ProductionLinks}.tsx
//
// PLAYOUT SETTINGS from the production header: the dialog, the form it shares with Settings, and
// the system list. bridge-connect drives the form through a fake Bridge; playout-nav owns the
// header door and the Back/Home pair beside it.
// covers: src/{components/{PlayoutSettingsDialog,PlayoutSettingsPanel}.tsx,control/playoutSystems.ts}
//
// CasparCG Connect is a NICE-TO-HAVE over routes that already air (docs/BRIDGE.md),
// so it earns a place here for one reason only: it puts a control on the production page and a
// section in Settings, both of which ARE student-critical surfaces. What it protects during the
// sprint is that those two surfaces keep working, not that CasparCG does.
// focus

import { test, expect, type Page, type Route } from '@playwright/test';
import { bootstrapGraphic, openProductionWithCurrent } from './_create';
import { awaitDurableReady, settleDurableWrites } from './_durable';

// NoaCG Bridge (docs/BRIDGE.md). There is no CasparCG on a test machine and there is no Bridge
// either, so both are FAKED at the network layer: `page.route` answers the Bridge's own HTTP
// surface in the playout protocol (src/control/playoutProtocol.ts), and each test says what
// that Bridge does. What is under test is the studio half - the settings that persist, pairing,
// the one button that airs a production, and above all that the hops are told apart instead of
// collapsing into one generic red.
//
// The real AMCP wire is verified on the other side of the Bridge, in the CLI, against a fake
// listener (cli/test/playout.test.mjs); a real CasparCG server is an owner acceptance step.

const BRIDGE = 'http://127.0.0.1:8899';
const TOKEN = 'e2e-token';

/** The settings pairing would have written, seeded the way pairing writes them. */
async function seedSettings(page: Page, patch: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([bridge, token, extra]) => {
      // Written per context, never CLEARED here: clearing localStorage from addInitScript also
      // runs inside the same-origin preview iframe (e2e/AGENTS.md).
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({
          agentUrl: bridge,
          agentToken: token,
          host: '127.0.0.1',
          amcpPort: 5250,
          channel: 1,
          layer: 20,
          v: 1,
          ...(extra as Record<string, unknown>),
        }),
      );
    },
    [BRIDGE, TOKEN, patch] as const,
  );
}

interface FakeBridge {
  /** Nothing is listening at all - the Bridge is not running. */
  missing?: boolean;
  /** An agent from before the protocol: answers /health as the old name, protocol 1. */
  outdated?: boolean;
  /** The Bridge answers /health but rejects the token. */
  badToken?: boolean;
  /** The Bridge is fine and CasparCG is not there. */
  serverDown?: boolean;
  /** CasparCG answered, and refused the command with this status line. */
  refuses?: string;
  /** The pairing code the Bridge holds; spent on first use. */
  pairCode?: string;
  /** What `/health` lists. None by default: the 0.4.0 this fake started as. */
  features?: string[];
  /** The servers a Bridge with the `servers` feature remembers, most recent first. `/connect`
   *  moves the one it reached to the front, as the real Bridge's file does. */
  servers?: { host: string; port: number }[];
  /** Servers that do not answer: a `/status` or `/connect` naming one reports the target hop. */
  downHosts?: string[];
  /** Every action the page sent, in order. */
  actions: unknown[];
  /** Every pairing code presented. */
  paired: string[];
  /** Every token-guarded route the page called, in order. */
  routes: string[];
}

/**
 * Install the fake Bridge's HTTP surface.
 *
 * The CORS headers are REAL and load-bearing. The studio's calls carry an Authorization header
 * and a JSON content type on purpose - that forces a preflight, which is what lets the real
 * Bridge refuse an origin it does not know before a single command is sent. Playwright answers
 * the preflight itself from the fulfilled response's headers (measured: the handler is only
 * ever entered for the POST), so a fake that omitted them would pass a spec the browser fails.
 */
async function fakeBridge(page: Page, options: Partial<FakeBridge> = {}): Promise<FakeBridge> {
  const state: FakeBridge = { actions: [], paired: [], routes: [], ...options };
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  await page.route(`${BRIDGE}/**`, async (route) => {
    if (state.missing) {
      // What a browser sees when nothing is listening on that port.
      await route.abort('connectionrefused');
      return;
    }
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/health') {
      await json(
        route,
        200,
        state.outdated
          ? { ok: true, agent: 'noacg-caspar', v: 1 }
          : { ok: true, agent: 'noacg-bridge', v: 2, version: '0.4.0', adapters: ['casparcg'], ...(state.features ? { features: state.features } : {}) },
      );
      return;
    }
    const body = JSON.parse(request.postData() || '{}') as { code?: string; action?: unknown; target?: unknown };
    if (path === '/pair') {
      state.paired.push(body.code ?? '');
      if (state.pairCode && body.code === state.pairCode) {
        state.pairCode = undefined; // spent
        await json(route, 200, { ok: true, v: 2, token: TOKEN });
      } else {
        await json(route, 401, { ok: false, v: 2, error: { hop: 'agent', code: 'refused', detail: 'That pairing code is not valid. Start NoaCG Bridge again to get a fresh one.' } });
      }
      return;
    }
    if (request.headers().authorization !== `Bearer ${TOKEN}` || state.badToken) {
      await json(route, 401, { ok: false, v: 2, error: { hop: 'agent', code: 'refused', detail: 'Bad or missing Bridge token.' } });
      return;
    }
    if (path === '/act') {
      // What the real Bridge refuses, refused here too: an item must carry a name. The real
      // 2.5.0 walk of 2026-09-22 caught "Take off" sending an empty one that this fake had
      // waved through.
      const a = body.action as { item?: { name?: string } } | undefined;
      if (a && 'item' in a && !a.item?.name) {
        await json(route, 400, { ok: false, v: 2, error: { hop: 'agent', code: 'usage', detail: 'The item has no name.' } });
        return;
      }
    }
    state.routes.push(path);
    if (path === '/act') state.actions.push(body.action);
    if (path === '/servers') {
      await json(route, 200, { ok: true, v: 2, servers: state.servers ?? [] });
      return;
    }
    const aimed = body.target as { host?: string; port?: number } | undefined;
    if ((path === '/status' || path === '/connect') && aimed?.host && state.downHosts?.includes(aimed.host)) {
      await json(route, 200, {
        ok: false,
        v: 2,
        error: { hop: 'target', code: 'unreachable', detail: `CasparCG did not answer on ${aimed.host}:${aimed.port}. Is the server running, and is that its AMCP port?` },
      });
      return;
    }
    if (path === '/connect' && aimed?.host && !state.serverDown) {
      const reached = { host: aimed.host, port: aimed.port ?? 5250 };
      state.servers = [reached, ...(state.servers ?? []).filter((s) => s.host !== reached.host || s.port !== reached.port)];
      await json(route, 200, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK', servers: state.servers });
      return;
    }
    if (state.serverDown) {
      // The Bridge is fine; the socket behind it is not. The Bridge's own sentence, address included.
      await json(route, 200, {
        ok: false,
        v: 2,
        error: { hop: 'target', code: 'unreachable', detail: 'CasparCG did not answer on 127.0.0.1:5250 (connect ECONNREFUSED 127.0.0.1:5250). Is the server running, and is that its AMCP port?' },
      });
      return;
    }
    if (state.refuses) {
      await json(route, 200, {
        ok: false,
        v: 2,
        error: { hop: 'target', code: 'refused', detail: `CasparCG refused the command: ${state.refuses}. Check the channel and layer.`, raw: state.refuses },
      });
      return;
    }
    if (path === '/status') {
      await json(route, 200, { ok: true, v: 2, version: '2.5.0 69e8ad5 Stable', raw: '201 VERSION OK' });
      return;
    }
    await json(route, 200, { ok: true, v: 2, raw: '202 PLAY OK' });
  });
  return state;
}

/** Home's gear is the no-account door into Settings; jump to the Playout section. A RELOAD is
 *  NOT this: closing the wizard moves the route to Home, so a reloaded page lands on Home with
 *  no wizard to close - `reopenPlayoutSettings` is that path. */
async function openPlayoutSettings(page: Page): Promise<void> {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  await page.getByTestId('creation-wizard').locator('.gallery-close').click();
  await reopenPlayoutSettings(page);
}

async function reopenPlayoutSettings(page: Page): Promise<void> {
  await page.getByTestId('home-settings').click();
  await expect(page.getByTestId('settings')).toBeVisible();
  await page.getByTestId('settings-nav-playout').click();
  await expect(page.getByTestId('settings-playout')).toBeVisible();
}

const verdict = (page: Page) => page.getByTestId('playout-result');

// ── The panel with nothing set up ───────────────────────────────────────────────────────────

test('with no Bridge paired the Playout section is complete, and never looks broken', async ({ page }) => {
  // The feature is a NICE-TO-HAVE over routes that already air, so an unconfigured studio must
  // read as "here is what to run", not as a fault.
  await openPlayoutSettings(page);
  const section = page.getByTestId('settings-playout');
  await expect(section).toContainText('NoaCG Bridge');
  // The one way in is the download: the Bridge is its own product, and nothing here asks a
  // playout operator to know about the CLI package it is built from.
  await expect(section.getByTestId('bridge-download')).toHaveAttribute('href', '/downloads#bridge');
  await expect(section).not.toContainText('npx');
  // The defaults are filled in, so the only empty box is the one pairing fills.
  await expect(section.getByTestId('bridge-url')).toHaveValue('http://127.0.0.1:8899');
  await expect(section.getByTestId('caspar-amcp-port')).toHaveValue('5250');
  await expect(section.getByTestId('bridge-token')).toHaveValue('');
  await expect(section.getByTestId('bridge-paired')).toHaveAttribute('data-paired', 'no');
  // Nothing to test yet: the button is off rather than offering a call that must fail.
  await expect(section.getByTestId('playout-test')).toBeDisabled();
  await expect(verdict(page)).toHaveCount(0);
});

// ── Pairing ─────────────────────────────────────────────────────────────────────────────────

test('the link the Bridge prints pairs this browser with one click, and the code is spent', async ({ page }) => {
  const bridge = await fakeBridge(page, { pairCode: 'a1b2c3d4e5f60718a1b2c3d4e5f60718' });
  await page.goto('/app?bridge=8899&code=a1b2c3d4e5f60718a1b2c3d4e5f60718');
  await expect(page.getByTestId('bridge-pair')).toBeVisible();
  // Nothing is stored by merely opening the link.
  await expect(page.getByTestId('bridge-pair-connect')).toBeVisible();
  await page.getByTestId('bridge-pair-connect').click();
  await expect(page.getByTestId('bridge-pair-done')).toBeVisible();
  expect(bridge.paired).toEqual(['a1b2c3d4e5f60718a1b2c3d4e5f60718']);
  // The token came back over loopback and is now the one Settings holds; the page's own URL
  // never carried it.
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('spx-gfx-caspar') ?? '{}'));
  expect(stored).toMatchObject({ agentUrl: BRIDGE, agentToken: TOKEN, v: 1 });

  // "Open NoaCG" lands on Home, where the gear is the door into Settings.
  await page.getByTestId('bridge-pair-open').click();
  await reopenPlayoutSettings(page);
  await expect(page.getByTestId('bridge-paired')).toHaveAttribute('data-paired', 'yes');
});

test('a spent or wrong pairing code is refused on the page, and a malformed link changes nothing', async ({ page }) => {
  await fakeBridge(page, { pairCode: 'a1b2c3d4e5f60718a1b2c3d4e5f60718' });
  await page.goto('/app?bridge=8899&code=ffffffffffffffffffffffffffffffff');
  await page.getByTestId('bridge-pair-connect').click();
  await expect(page.getByTestId('bridge-pair-error')).toHaveAttribute('data-state', 'token');
  await expect(page.getByTestId('bridge-pair-error')).toContainText('not valid');

  await page.goto('/app?bridge=80&code=nope');
  await expect(page.getByTestId('bridge-pair-invalid')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('spx-gfx-caspar'))).toBeNull();
});

// ── After pairing: connecting to CasparCG (docs/work-specs/bridge-casparcg-connect) ─────────────

const CODE = 'a1b2c3d4e5f60718a1b2c3d4e5f60718';
/** A Bridge 0.7.0: everything 0.6.0 understood, and the servers it remembers. */
const WITH_SERVERS = ['state', 'playback', 'sequence', 'sequence-loop', 'servers'];

async function pair(page: Page): Promise<void> {
  await page.goto(`/app?bridge=8899&code=${CODE}`);
  await page.getByTestId('bridge-pair-connect').click();
  await expect(page.getByTestId('bridge-pair-done')).toBeVisible();
}

const storedHost = (page: Page) =>
  page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('spx-gfx-caspar') ?? '{}') as { host?: string; amcpPort?: number };
    return `${s.host}:${s.amcpPort}`;
  });

test('after pairing, the server the Bridge remembers is connected by itself, and nothing goes on air', async ({ page }) => {
  const bridge = await fakeBridge(page, { pairCode: CODE, features: WITH_SERVERS, servers: [{ host: '192.168.1.20', port: 5250 }] });
  await pair(page);
  const connected = page.getByTestId('bridge-connected');
  await expect(connected).toHaveText('✓ Connected to CasparCG 2.5.0 69e8ad5 Stable at 192.168.1.20.');
  await expect(page.getByTestId('bridge-pair')).toContainText('NoaCG Bridge remembers this server');
  // The studio's server is now this browser's too, so every production page names it.
  expect(await storedHost(page)).toBe('192.168.1.20:5250');
  // AC-5: pairing and connecting ask the server its VERSION and nothing else. No take, no out.
  expect(bridge.routes).toEqual(['/servers', '/connect']);
  expect(bridge.actions).toEqual([]);
  // Open NoaCG is the next step once connected; Put on air lives in the production.
  await expect(page.getByTestId('bridge-pair-open')).toHaveClass(/primary/);
});

test('when the last server does not answer, pairing offers it and the others, and Connect remembers the one that does', async ({ page }) => {
  const bridge = await fakeBridge(page, {
    pairCode: CODE,
    features: WITH_SERVERS,
    servers: [
      { host: '192.168.1.20', port: 5250 },
      { host: '192.168.1.30', port: 5251 },
    ],
    downHosts: ['192.168.1.20'],
  });
  await pair(page);
  // The last server used is filled in and said not to answer, rather than the page going quiet.
  await expect(page.getByTestId('bridge-connect-host')).toHaveValue('192.168.1.20');
  await expect(page.getByTestId('bridge-connect-error')).toContainText('did not answer on 192.168.1.20:5250');
  const recent = page.getByTestId('bridge-connect-recent');
  await expect(recent.getByRole('button')).toHaveText(['192.168.1.20', '192.168.1.30:5251']);
  // One click on a server used before connects to it, port and all.
  await recent.getByRole('button', { name: '192.168.1.30:5251' }).click();
  await expect(page.getByTestId('bridge-connected')).toContainText('at 192.168.1.30:5251.');
  expect(await storedHost(page)).toBe('192.168.1.30:5251');
  expect(bridge.servers?.[0]).toEqual({ host: '192.168.1.30', port: 5251 });
  expect(bridge.actions).toEqual([]);
});

test('a first pairing with nothing remembered asks for the server once, and Change goes back to it', async ({ page }) => {
  const bridge = await fakeBridge(page, { pairCode: CODE, features: WITH_SERVERS });
  await pair(page);
  // Nobody has chosen a server yet, so none is tried and none is blamed.
  await expect(page.getByTestId('bridge-connect-host')).toHaveValue('');
  await expect(page.getByTestId('bridge-connect-error')).toHaveCount(0);
  await expect(page.getByTestId('bridge-connect-recent')).toHaveCount(0);
  await expect(page.getByTestId('bridge-connect')).toBeDisabled();
  await page.getByTestId('bridge-connect-host').fill('10.0.0.5');
  await page.getByTestId('bridge-connect').click();
  await expect(page.getByTestId('bridge-connected')).toContainText('at 10.0.0.5.');
  expect(bridge.servers).toEqual([{ host: '10.0.0.5', port: 5250 }]);
  await page.getByTestId('bridge-connect-change').click();
  await expect(page.getByTestId('bridge-connect-host')).toHaveValue('10.0.0.5');
  // The server just connected is one of the servers used before now, without a reload.
  await expect(page.getByTestId('bridge-connect-recent').getByRole('button')).toHaveText(['10.0.0.5']);
});

test('with a Bridge from before 0.7.0, pairing still connects to the server this browser used', async ({ page }) => {
  await seedSettings(page, { host: '192.168.1.40' });
  const bridge = await fakeBridge(page, { pairCode: CODE });
  await pair(page);
  await expect(page.getByTestId('bridge-connected')).toContainText('at 192.168.1.40.');
  // No memory to write in an old Bridge: the connect is its Test connection, and it says nothing
  // about a Bridge remembering anything.
  expect(bridge.routes).toEqual(['/status']);
  await expect(page.getByTestId('bridge-pair')).not.toContainText('remembers');
});

test('Settings: a server used before is one press, Connect remembers one, and Test does not', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page, {
    features: WITH_SERVERS,
    servers: [
      { host: '192.168.1.20', port: 5250 },
      { host: '192.168.1.30', port: 5251 },
    ],
  });
  await openPlayoutSettings(page);
  const recent = page.getByTestId('caspar-recent');
  await expect(recent.getByRole('button')).toHaveText(['192.168.1.20', '192.168.1.30:5251']);

  // Test connection is /status and remembers nothing; only Connect is /connect.
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveText('✓ Connected - CasparCG 2.5.0 69e8ad5 Stable');
  expect(bridge.routes).not.toContain('/connect');

  // One press on a server used before fills in its address AND port, and connects to it.
  await recent.getByRole('button', { name: '192.168.1.30:5251' }).click();
  await expect(verdict(page)).toHaveText('✓ Connected - CasparCG 2.5.0 69e8ad5 Stable. NoaCG Bridge remembers this server.');
  await expect(page.getByTestId('caspar-host')).toHaveValue('192.168.1.30');
  await expect(page.getByTestId('caspar-amcp-port')).toHaveValue('5251');
  expect(bridge.servers?.[0]).toEqual({ host: '192.168.1.30', port: 5251 });
  await expect(recent.getByRole('button')).toHaveText(['192.168.1.30:5251', '192.168.1.20']);

  // A typed address connects the same way.
  await page.getByTestId('caspar-host').fill('192.168.1.40');
  await page.getByTestId('caspar-amcp-port').fill('5250');
  await page.getByTestId('playout-connect').click();
  await expect(verdict(page)).toContainText('NoaCG Bridge remembers this server.');
  expect(bridge.servers?.[0]).toEqual({ host: '192.168.1.40', port: 5250 });
  // General Settings has no production, so there is nothing to put on air from here.
  await expect(page.getByTestId('playout-put-on-air')).toHaveCount(0);
  expect(bridge.actions).toEqual([]);
});

// ── The hops, each told apart ───────────────────────────────────────────────────────────────

test("a working connection reports CasparCG's own version, from a real VERSION round-trip", async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'ok');
  await expect(verdict(page)).toContainText('2.5.0 69e8ad5 Stable');
  // It asked the server, rather than concluding from the settings being filled in.
  expect(bridge.actions).toEqual([]);
});

test('no Bridge running says so, and says what to start', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { missing: true });
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'bridge');
  await expect(verdict(page)).toContainText('Start NoaCG Bridge');
  await expect(verdict(page)).toContainText('the NoaCG Bridge file you downloaded');
});

test('an agent from before the protocol is "update NoaCG Bridge", not "not running"', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { outdated: true });
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'outdated');
  await expect(verdict(page)).toContainText('too old for this page');
});

test('a rejected token is its own verdict, not "unreachable"', async ({ page }) => {
  await seedSettings(page, { agentToken: 'stale-token' });
  await fakeBridge(page);
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'token');
  await expect(verdict(page)).toContainText('rejected this token');
});

test('a missing CasparCG names the server and port, not a raw socket error on its own', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { serverDown: true });
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'server');
  // `ECONNREFUSED 127.0.0.1:5250` alone is not a sentence anyone should have to read.
  await expect(verdict(page)).toContainText('CasparCG did not answer on 127.0.0.1:5250');
});

test('a CasparCG that answers and refuses is a different verdict from one that never answered', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { refuses: '404 PLAY FAILED' });
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'server');
  await expect(verdict(page)).toContainText('404 PLAY FAILED');
  await expect(verdict(page)).not.toContainText('did not answer');
});

// ── Local Network Access ────────────────────────────────────────────────────────────────────

test('the permission diagnosis is only ever offered where the browser actually gates it', async ({ page }) => {
  // The measured matrix from docs/BRIDGE.md §1b, pinned as code. Getting this wrong in either
  // direction is a lie told to an operator: a page on localhost that blames a permission sends
  // them to a setting that is not the problem, and a hosted page that stays silent about it
  // leaves them with a call that HANGS on an unanswered prompt.
  await page.goto('/app');
  const matrix = await page.evaluate(async () => {
    const { localNetworkGateApplies } = await import('/src/control/playoutLink.ts');
    const bridge = 'http://127.0.0.1:8899';
    return {
      hostedToLoopback: localNetworkGateApplies('https://noacg.studio', bridge),
      loopbackToLoopback: localNetworkGateApplies('http://localhost:5184', bridge),
      lanSelfHostToLoopback: localNetworkGateApplies('http://192.168.0.120:3000', bridge),
      hostedToLanBridge: localNetworkGateApplies('https://noacg.studio', 'http://10.0.0.4:8899'),
      hostedToPublicBridge: localNetworkGateApplies('https://noacg.studio', 'https://bridge.example.com'),
      // Ordinary PUBLIC names that a prefix match would read as local. Getting these wrong
      // withholds the one diagnosis that explains the failure.
      lookalikeLocalhost: localNetworkGateApplies('https://localhost.evil.example', bridge),
      lookalikeLan: localNetworkGateApplies('https://10.0.0.1.evil.example', bridge),
    };
  });
  expect(matrix).toEqual({
    hostedToLoopback: true,
    loopbackToLoopback: false,
    lanSelfHostToLoopback: false,
    hostedToLanBridge: true,
    hostedToPublicBridge: false,
    lookalikeLocalhost: true,
    lookalikeLan: true,
  });
});

test('a browser that has no such permission reports "unknown" rather than pretending it is granted', async ({ page }) => {
  // Chrome and Firefox 153+ expose the gate as an ordinary permission; Safari and an older
  // Firefox know none of its names and throw. Reading that as "granted" would produce a call that simply fails with no
  // explanation, and reading it as "prompt" would send a Safari user hunting for a bubble that
  // browser never shows - so it has its own answer, and its own sentence in the panel.
  await page.goto('/app');
  const state = await page.evaluate(async () => {
    Object.defineProperty(navigator, 'permissions', {
      configurable: true,
      value: { query: () => Promise.reject(new TypeError('unknown permission name')) },
    });
    const { localNetworkPermission } = await import('/src/control/playoutLink.ts');
    return localNetworkPermission();
  });
  expect(state).toBe('unknown');
});

test('the loopback permission is read by the name Firefox and current Chrome use, and an older Chrome still answers', async ({ page }) => {
  // The Bridge is on loopback. Firefox 153+ and Chrome after the split call that half
  // `loopback-network`; an older Chrome knows only `local-network-access`. Asking for the old
  // name alone read Firefox as "no such permission" and blamed the browser for a waiting prompt.
  await page.goto('/app');
  const read = async (known: Record<string, string>) =>
    page.evaluate(async (names) => {
      Object.defineProperty(navigator, 'permissions', {
        configurable: true,
        value: {
          query: ({ name }: { name: string }) =>
            name in names ? Promise.resolve({ state: names[name] }) : Promise.reject(new TypeError(`unknown ${name}`)),
        },
      });
      const { localNetworkPermission } = await import('/src/control/playoutLink.ts');
      return localNetworkPermission();
    }, known);
  expect(await read({ 'loopback-network': 'prompt', 'local-network': 'granted' })).toBe('prompt');
  expect(await read({ 'local-network-access': 'granted' })).toBe('granted');

  // Which browser, by user agent, only to word the sentence: every Chromium and Firefox UA also
  // says "Safari", so Safari is the one that says it with nothing else.
  const who = await page.evaluate(async () => {
    const { isFirefox, isSafari } = await import('/src/control/playoutLink.ts');
    const ua = {
      firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:156.0) Gecko/20100101 Firefox/156.0',
      chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
      edge: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36 Edg/149.0.0.0',
      safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    };
    return Object.fromEntries(Object.entries(ua).map(([k, v]) => [k, { firefox: isFirefox(v), safari: isSafari(v) }]));
  });
  expect(who).toEqual({
    firefox: { firefox: true, safari: false },
    chrome: { firefox: false, safari: false },
    edge: { firefox: false, safari: false },
    safari: { firefox: false, safari: true },
  });
});

// ── The settings themselves ─────────────────────────────────────────────────────────────────

test('the server is configured once, app-wide, and survives a reload', async ({ page }) => {
  await fakeBridge(page);
  await openPlayoutSettings(page);
  const section = page.getByTestId('settings-playout');
  await section.getByTestId('caspar-host').fill('caspar-01.studio.lan');
  // Renumbering the graphics channel's row carries the graphics default along with it.
  await section.getByTestId('caspar-channel-number').first().fill('2');
  await section.getByTestId('caspar-layer').fill('30');
  await section.getByTestId('bridge-token').fill(TOKEN);
  // The hint tracks the numbers, so what CasparCG will be told is visible before it is sent.
  await expect(section).toContainText('2-30');

  await page.reload();
  await reopenPlayoutSettings(page);
  const back = page.getByTestId('settings-playout');
  await expect(back.getByTestId('caspar-host')).toHaveValue('caspar-01.studio.lan');
  await expect(back.getByTestId('caspar-channel-number')).toHaveValue('2');
  await expect(back.getByTestId('caspar-graphics-channel')).toHaveValue('2');
  await expect(back.getByTestId('caspar-layer')).toHaveValue('30');
});

test('a studio saved before channels had names reads as one row, and one click adds a second channel named by its number', async ({ page }) => {
  // A v1 record with one channel and no table: the table is that one channel, named by its number,
  // and clips still go where they always went. Seeded only when ABSENT, unlike seedSettings,
  // because the reload below must read back what the table wrote, not the seed again.
  await page.addInitScript(
    ([bridge, token]) => {
      if (localStorage.getItem('spx-gfx-caspar')) return;
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({ agentUrl: bridge, agentToken: token, host: '127.0.0.1', amcpPort: 5250, channel: 3, layer: 20, v: 1 }),
      );
    },
    [BRIDGE, TOKEN] as const,
  );
  await fakeBridge(page);
  await openPlayoutSettings(page);
  const section = page.getByTestId('settings-playout');
  await expect(section.getByTestId('caspar-channel-row')).toHaveCount(1);
  await expect(section.getByTestId('caspar-channel-number')).toHaveValue('3');
  // Named by number, never by a use: NoaCG does not assume what a studio puts on a channel.
  await expect(section.getByTestId('caspar-channel-name')).toHaveValue('Channel 3');
  await expect(section.getByTestId('caspar-graphics-channel')).toHaveValue('3');
  await expect(section.getByTestId('caspar-clip-channel')).toHaveValue('3');
  // The graphics channel cannot be removed out from under the output URL.
  await expect(section.getByTestId('caspar-channel-remove')).toBeDisabled();

  // Add channel: the next number, named by that number and made the clip default.
  await section.getByTestId('caspar-channel-add').click();
  const rows = section.getByTestId('caspar-channel-row');
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(1).getByTestId('caspar-channel-number')).toHaveValue('4');
  await expect(rows.nth(1).getByTestId('caspar-channel-name')).toHaveValue('Channel 4');
  await expect(section.getByTestId('caspar-clip-channel')).toHaveValue('4');
  // A starting name is not said twice: the pick reads `Channel 4`, not `4 · Channel 4`.
  await expect(section.getByTestId('caspar-clip-channel').locator('option:checked')).toHaveText('Channel 4');
  // A second added row: named the same way, and the clip default stays where it was put.
  await section.getByTestId('caspar-channel-add').click();
  await expect(rows.nth(2).getByTestId('caspar-channel-name')).toHaveValue('Channel 5');
  await expect(section.getByTestId('caspar-clip-channel')).toHaveValue('4');

  // The operator's own word for a channel is kept; a starting name follows its number.
  await rows.nth(1).getByTestId('caspar-channel-name').fill('Inserts');
  await expect(section.getByTestId('caspar-clip-channel').locator('option:checked')).toHaveText('4 · Inserts');
  await rows.nth(2).getByTestId('caspar-channel-number').fill('7');
  await expect(rows.nth(2).getByTestId('caspar-channel-name')).toHaveValue('Channel 7');

  // A number past the range is clamped, never a row that silently vanishes on the next load.
  await rows.nth(2).getByTestId('caspar-channel-number').fill('150');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(2).getByTestId('caspar-channel-number')).toHaveValue('99');

  // Two rows on one number is a typo the table says out loud.
  await rows.nth(2).getByTestId('caspar-channel-number').fill('4');
  await expect(section.getByTestId('caspar-channel-duplicate')).toContainText('channel 4');
  await rows.nth(2).getByTestId('caspar-channel-remove').click();
  await expect(section.getByTestId('caspar-channel-duplicate')).toHaveCount(0);

  await page.reload();
  await reopenPlayoutSettings(page);
  const back = page.getByTestId('settings-playout');
  await expect(back.getByTestId('caspar-channel-row')).toHaveCount(2);
  await expect(back.getByTestId('caspar-clip-channel')).toHaveValue('4');
  await expect(back.getByTestId('caspar-graphics-channel')).toHaveValue('3');

  // Removing the insert channel sends clips back to the graphics channel rather than to a
  // number no row names.
  await back.getByTestId('caspar-channel-row').nth(1).getByTestId('caspar-channel-remove').click();
  await expect(back.getByTestId('caspar-channel-row')).toHaveCount(1);
  await expect(back.getByTestId('caspar-clip-channel')).toHaveValue('3');
});

test('editing a setting drops the last verdict, so a stale tick never speaks for new numbers', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'ok');
  await page.getByTestId('settings-playout').getByTestId('caspar-host').fill('another-box.lan');
  await expect(verdict(page)).toHaveCount(0);
});

// ── The one button ──────────────────────────────────────────────────────────────────────────

/** A production with its published capabilities faked in - publishing is backend-gated and
 *  lives on the live checklist (the same door e2e/productions.spec.ts opens for the SPX file). */
async function publishedProduction(page: Page): Promise<void> {
  await bootstrapGraphic(page, { category: 'Lower thirds', name: 'Hairline' });
  await openProductionWithCurrent(page, 'Evening News');
  await page.evaluate(async () => {
    const { loadShows, setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    const id = loadShows()[0].id;
    setShowHostedSlug(id, 'demo-slug');
    setShowOutputSlug(id, 'demo-output');
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('production-status').click();
}

test('the CasparCG row is absent until a server is configured', async ({ page }) => {
  await fakeBridge(page);
  await publishedProduction(page);
  // The output URL row - the manual route that has always worked - is there either way.
  await expect(page.getByTestId('copy-output-url')).toBeVisible();
  // A dead control on the busiest surface in the app would be worse than no control.
  await expect(page.getByTestId('caspar-put-on-air')).toHaveCount(0);
});

test('one button puts the production on the configured channel, and one takes it off', async ({ page }) => {
  await seedSettings(page, { channel: 2, layer: 30 });
  const bridge = await fakeBridge(page);
  await publishedProduction(page);

  // The row states where it will send BEFORE it is pressed - `LinkRow` carries no testid of its
  // own, so this asserts on the row's own target label.
  await expect(page.getByTestId('caspar-air-target')).toContainText('2-30');
  await page.getByTestId('caspar-put-on-air').click();
  await expect(page.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok');
  // THE WORDS, not only the state. Both buttons succeed identically - `{ state: 'ok' }` - so a
  // message written from the result alone reads "On 2-30" after Take off too. It did, until a
  // real CasparCG 2.5.0 showed it on 2026-09-10; this spec passed the whole time.
  await expect(page.getByTestId('caspar-air-result')).toHaveText('✓ On 2-30');

  // THE WHOLE LIVE LINK is this one action: a take of the production's own output URL, on the
  // configured slot. Everything after it - every cue, take, update, recovery - travels on the
  // durable command log the /output page already follows, which is why there is no per-cue
  // traffic here and no second copy of the graphics on the wire. The dev port is per checkout
  // (docs/DEV_PORTS.md), so the ORIGIN is not pinned - what is pinned is that the action carries
  // this production's own output URL and nothing else, in the protocol's own words - named for
  // the layer it lands on, which is what READY calls it (docs/work-specs/playout-ready R5).
  expect(bridge.actions).toHaveLength(1);
  expect(bridge.actions[0]).toMatchObject({
    verb: 'take',
    item: { kind: 'url', name: expect.stringMatching(/^https?:\/\/[^"]+\/output\?production=demo-output&name=CasparCG%202-30$/) },
    slot: { adapter: 'casparcg', channel: 2, layer: 30 },
  });

  await page.getByTestId('caspar-take-off-air').click();
  await expect(page.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('caspar-air-result')).toHaveText('✓ Off 2-30');
  expect(bridge.actions[1]).toMatchObject({ verb: 'out', slot: { adapter: 'casparcg', channel: 2, layer: 30 } });
});

test('a failure to air is reported on the row, and never as a success', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { serverDown: true });
  await publishedProduction(page);
  await page.getByTestId('caspar-put-on-air').click();
  const result = page.getByTestId('caspar-air-result');
  await expect(result).toHaveAttribute('data-state', 'server');
  await expect(result).toContainText('CasparCG did not answer');
  await expect(result).not.toContainText('On air');
});

// ── The header's playout status and its panel (docs/work-specs/studio-day-playout AC-7, AC-8) ──

/** A published production seeded through the model and opened from its own URL - no editor on
 *  the way. Publishing is backend-gated, so its capabilities are faked in, as above. */
/**
 * The Playout settings dialog, from the production page's Playout panel. Its Setup section folds once
 * the Bridge answers (docs/work-specs/studio-day-playout D10), so wait for that answer and unfold it,
 * as an operator does, rather than racing the fold.
 */
async function openPlayoutDialog(page: Page): Promise<void> {
  await page.getByTestId('production-status').click();
  await expect(page.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  const setup = page.getByTestId('playout-panel-setup');
  if (!(await setup.evaluate((d) => (d as HTMLDetailsElement).open))) await setup.locator('summary').click();
  await page.getByTestId('playout-settings-open').click();
}

async function seededPublishedProduction(page: Page, published = true): Promise<void> {
  await page.goto('/app');
  await awaitDurableReady(page);
  const id = await page.evaluate(async (started) => {
    const { variantsFor } = await import('/src/templates/catalog.ts');
    const { createGraphic } = await import('/src/model/library.ts');
    const { createShowNamed, addGraphicToShow, setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    const { doc, error } = createGraphic(variantsFor('lower-third')[0].create({}), { name: 'Guest Strap', packageId: null });
    if (error || !doc) throw new Error(error ?? 'seed failed');
    const show = createShowNamed('Evening News');
    addGraphicToShow(show.id, doc.template, { graphicId: doc.id });
    if (started) {
      setShowHostedSlug(show.id, 'demo-slug');
      setShowOutputSlug(show.id, 'demo-output');
    }
    return show.id;
  }, published);
  await settleDurableWrites(page);
  await page.goto(`/app#/production/${id}`);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
}

test('the production header says whether CasparCG answers, and its panel holds the output links', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page);
  await seededPublishedProduction(page);
  // A paired Bridge is asked on this page too, so the operator reads the connection where they
  // work instead of opening Settings to find out (owner, 2026-09-23). It is one line of the panel
  // behind the playout status now, and the links an OBS operator copies are further down it.
  await page.getByTestId('production-status').click();
  await expect(page.getByTestId('status-check-bridge')).toHaveAttribute('data-tone', 'ok');
  await expect(page.getByTestId('status-check-bridge')).toContainText('NoaCG Bridge and CasparCG answer');
  await expect(page.getByTestId('production-links').getByTestId('copy-output-url')).toBeVisible();
});

test('a paired Bridge that is not running turns the header status red, with the reason', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { missing: true });
  await seededPublishedProduction(page);
  const status = page.getByTestId('production-status');
  await expect(status).toHaveAttribute('data-tone', 'bad');
  await expect(status).toContainText('Bridge not running');
});

test("the production's Playout dialog puts its output on air with one press, and says where it went", async ({ page }) => {
  await seedSettings(page, { channel: 2, layer: 30 });
  const bridge = await fakeBridge(page, { features: WITH_SERVERS });
  await seededPublishedProduction(page);
  await openPlayoutDialog(page);
  await expect(page.getByTestId('playout-settings')).toBeVisible();
  // Opening the dialog, and the status poll behind the header, send nothing to a layer (AC-5).
  await expect(page.getByTestId('playout-put-on-air')).toBeEnabled();
  expect(bridge.actions).toEqual([]);
  await page.getByTestId('playout-put-on-air').click();
  await expect(verdict(page)).toHaveText('✓ On 2-30 of 127.0.0.1');
  await expect(verdict(page)).toHaveAttribute('data-verb', 'air');
  expect(bridge.actions).toHaveLength(1);
  expect(bridge.actions[0]).toMatchObject({
    verb: 'take',
    item: { kind: 'url', name: expect.stringMatching(/^https?:\/\/[^"]+\/output\?production=demo-output&name=CasparCG%202-30$/) },
    slot: { adapter: 'casparcg', channel: 2, layer: 30 },
  });
});

test('a production that is not started cannot be put on air from its Playout dialog, and says why', async ({ page }) => {
  await seedSettings(page);
  const bridge = await fakeBridge(page);
  await seededPublishedProduction(page, false);
  await openPlayoutDialog(page);
  await expect(page.getByTestId('playout-put-on-air')).toBeDisabled();
  await expect(page.getByTestId('playout-air-unstarted')).toContainText('Start production');
  expect(bridge.actions).toEqual([]);
});
