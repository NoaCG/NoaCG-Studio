import { test, expect, type Page, type Route } from '@playwright/test';
import { createProject } from './_create';
import { settleDurableWrites } from './_durable';

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
  /** Every action the page sent, in order. */
  actions: unknown[];
  /** Every pairing code presented. */
  paired: string[];
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
  const state: FakeBridge = { actions: [], paired: [], ...options };
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
          : { ok: true, agent: 'noacg-bridge', v: 2, version: '0.4.0', adapters: ['casparcg'] },
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
    if (path === '/act') state.actions.push(body.action);
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
  await expect(section.getByTestId('bridge-download')).toHaveAttribute('href', /NoaCG-Bridge\.exe$/);
  await expect(section).toContainText('npx @noacg/cli bridge');
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

test('no Bridge running says so, and names both ways to start one', async ({ page }) => {
  await seedSettings(page);
  await fakeBridge(page, { missing: true });
  await openPlayoutSettings(page);
  await page.getByTestId('playout-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'bridge');
  await expect(verdict(page)).toContainText('Start NoaCG Bridge');
  await expect(verdict(page)).toContainText('npx @noacg/cli bridge');
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
  // Chrome exposes the gate as an ordinary permission; Safari and Firefox do not know the name
  // and throw. Reading that as "granted" would produce a call that simply fails with no
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

// ── The settings themselves ─────────────────────────────────────────────────────────────────

test('the server is configured once, app-wide, and survives a reload', async ({ page }) => {
  await fakeBridge(page);
  await openPlayoutSettings(page);
  const section = page.getByTestId('settings-playout');
  await section.getByTestId('caspar-host').fill('caspar-01.studio.lan');
  await section.getByTestId('caspar-channel').fill('2');
  await section.getByTestId('caspar-layer').fill('30');
  await section.getByTestId('bridge-token').fill(TOKEN);
  // The hint tracks the numbers, so what CasparCG will be told is visible before it is sent.
  await expect(section).toContainText('2-30');

  await page.reload();
  await reopenPlayoutSettings(page);
  const back = page.getByTestId('settings-playout');
  await expect(back.getByTestId('caspar-host')).toHaveValue('caspar-01.studio.lan');
  await expect(back.getByTestId('caspar-channel')).toHaveValue('2');
  await expect(back.getByTestId('caspar-layer')).toHaveValue('30');
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
  await createProject(page, { category: 'Lower thirds', name: 'Hairline' });
  await page.getByTestId('dock-tab-control').click();
  const section = page.locator('.panel-section', { hasText: 'Productions' });
  await section.getByPlaceholder('New production name').fill('Evening News');
  await section.getByRole('button', { name: 'Create', exact: true }).click();
  await section.getByRole('button', { name: '+ Add current' }).click();
  await section.getByTestId('open-production-page').click();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.evaluate(async () => {
    const { loadShows, setShowHostedSlug, setShowOutputSlug } = await import('/src/model/shows.ts');
    const id = loadShows()[0].id;
    setShowHostedSlug(id, 'demo-slug');
    setShowOutputSlug(id, 'demo-output');
  });
  await settleDurableWrites(page);
  await page.reload();
  await expect(page.getByTestId('production-page')).toBeVisible();
  await page.getByTestId('production-links-toggle').click();
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
  // this production's own output URL and nothing else, in the protocol's own words.
  expect(bridge.actions).toHaveLength(1);
  expect(bridge.actions[0]).toMatchObject({
    verb: 'take',
    item: { kind: 'url', name: expect.stringMatching(/^https?:\/\/[^"]+\/output\?production=demo-output$/) },
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
