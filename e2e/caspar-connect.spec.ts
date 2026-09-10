import { test, expect, type Page, type Route } from '@playwright/test';
import { createProject } from './_create';
import { settleDurableWrites } from './_durable';

// CasparCG Connect (docs/CASPARCG_CONNECT.md). There is no CasparCG on a test machine and there
// is no local agent either, so both are FAKED at the network layer: `page.route` answers the
// agent's own HTTP surface, and each test says what that agent does. What is under test is the
// studio half - the settings that persist, the one button that airs a production, and above all
// that the FOUR hops are told apart instead of collapsing into one generic red.
//
// The real AMCP wire is verified on the other side of the agent, in the CLI, against a fake
// listener; a real CasparCG server is an owner acceptance step (§6 of the doc).

const AGENT = 'http://127.0.0.1:8899';
const TOKEN = 'e2e-token';

/** The settings the terminal would have printed, seeded the way a person pastes them in. */
async function seedSettings(page: Page, patch: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(
    ([agent, token, extra]) => {
      // Written per context, never CLEARED here: clearing localStorage from addInitScript also
      // runs inside the same-origin preview iframe (e2e/AGENTS.md).
      localStorage.setItem(
        'spx-gfx-caspar',
        JSON.stringify({
          agentUrl: agent,
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
    [AGENT, TOKEN, patch] as const,
  );
}

interface FakeAgent {
  /** Nothing is listening at all - the agent is not running. */
  missing?: boolean;
  /** The agent answers /health but rejects the token. */
  badToken?: boolean;
  /** The agent is fine and CasparCG is not there. */
  serverDown?: boolean;
  /** CasparCG answered, and refused the command. */
  refuses?: string;
  /** Every AMCP command the page caused, in order. */
  commands: string[];
}

/**
 * Install the fake agent's HTTP surface.
 *
 * The CORS headers are REAL and load-bearing. The studio's calls carry an Authorization header
 * and a JSON content type on purpose - that forces a preflight, which is what lets the real
 * agent refuse an origin it does not know before a single command is sent. Playwright answers
 * the preflight itself from the fulfilled response's headers (measured: the handler is only
 * ever entered for the POST), so a fake that omitted them would pass a spec the browser fails.
 */
async function fakeAgent(page: Page, options: Partial<FakeAgent> = {}): Promise<FakeAgent> {
  const state: FakeAgent = { commands: [], ...options };
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, content-type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
  const json = (route: Route, status: number, body: unknown) =>
    route.fulfill({ status, headers: { ...cors, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

  await page.route(`${AGENT}/**`, async (route) => {
    if (state.missing) {
      // What a browser sees when nothing is listening on that port.
      await route.abort('connectionrefused');
      return;
    }
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/health') {
      await json(route, 200, { ok: true, agent: 'noacg-caspar', v: 1 });
      return;
    }
    if (request.headers().authorization !== `Bearer ${TOKEN}` || state.badToken) {
      await json(route, 401, { ok: false, error: 'Bad or missing agent token.' });
      return;
    }
    const body = JSON.parse(request.postData() || '{}') as { channel?: number; layer?: number; url?: string };
    const address = `${body.channel ?? 1}-${body.layer ?? 20}`;
    const command =
      path === '/status' ? 'VERSION' : path === '/play' ? `PLAY ${address} [HTML] "${body.url}"` : `STOP ${address}`;
    state.commands.push(command);
    if (state.serverDown) {
      // The agent is fine; the socket behind it is not. 502 with the socket's own words.
      await json(route, 502, { ok: false, error: 'connect ECONNREFUSED 127.0.0.1:5250' });
      return;
    }
    if (state.refuses) {
      await json(route, 200, { ok: false, code: 404, status: state.refuses, lines: [] });
      return;
    }
    if (path === '/status') {
      await json(route, 200, { ok: true, code: 201, status: '201 VERSION OK', lines: ['2.4.0 6ff2e3f STABLE'] });
      return;
    }
    await json(route, 200, { ok: true, code: 202, status: `202 ${command.split(' ')[0]} OK`, lines: [] });
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

const verdict = (page: Page) => page.getByTestId('caspar-result');

// ── The panel with nothing set up ───────────────────────────────────────────────────────────

test('with no agent configured the Playout section is complete, and never looks broken', async ({ page }) => {
  // The feature is a NICE-TO-HAVE over routes that already air, so an unconfigured studio must
  // read as "here is what to run", not as a fault.
  await openPlayoutSettings(page);
  const section = page.getByTestId('settings-playout');
  await expect(section).toContainText('noacg caspar agent');
  // The defaults are filled in, so the only empty box is the one the terminal prints.
  await expect(section.getByTestId('caspar-agent-url')).toHaveValue('http://127.0.0.1:8899');
  await expect(section.getByTestId('caspar-amcp-port')).toHaveValue('5250');
  await expect(section.getByTestId('caspar-agent-token')).toHaveValue('');
  // Nothing to test yet: the button is off rather than offering a call that must fail.
  await expect(section.getByTestId('caspar-test')).toBeDisabled();
  await expect(verdict(page)).toHaveCount(0);
});

// ── The four hops, each told apart ──────────────────────────────────────────────────────────

test('a working connection reports CasparCG\'s own version, from a real VERSION round-trip', async ({ page }) => {
  await seedSettings(page);
  const agent = await fakeAgent(page);
  await openPlayoutSettings(page);
  await page.getByTestId('caspar-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'ok');
  await expect(verdict(page)).toContainText('2.4.0 6ff2e3f STABLE');
  // It asked the server, rather than concluding from the settings being filled in.
  expect(agent.commands).toEqual(['VERSION']);
});

test('no agent running says so, and names the command that starts one', async ({ page }) => {
  await seedSettings(page);
  await fakeAgent(page, { missing: true });
  await openPlayoutSettings(page);
  await page.getByTestId('caspar-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'agent');
  await expect(verdict(page)).toContainText('noacg caspar agent');
});

test('a rejected token is its own verdict, not "unreachable"', async ({ page }) => {
  await seedSettings(page, { agentToken: 'stale-token' });
  await fakeAgent(page);
  await openPlayoutSettings(page);
  await page.getByTestId('caspar-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'token');
  await expect(verdict(page)).toContainText('rejected this token');
});

test('a missing CasparCG names the server and port, not a raw socket error on its own', async ({ page }) => {
  await seedSettings(page);
  await fakeAgent(page, { serverDown: true });
  await openPlayoutSettings(page);
  await page.getByTestId('caspar-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'server');
  // `ECONNREFUSED 127.0.0.1:5250` alone is not a sentence anyone should have to read.
  await expect(verdict(page)).toContainText('CasparCG did not answer on 127.0.0.1:5250');
});

test('a CasparCG that answers and refuses is a different verdict from one that never answered', async ({ page }) => {
  await seedSettings(page);
  await fakeAgent(page, { refuses: '404 PLAY ERROR' });
  await openPlayoutSettings(page);
  await page.getByTestId('caspar-test').click();
  await expect(verdict(page)).toHaveAttribute('data-state', 'server');
  await expect(verdict(page)).toContainText('404 PLAY ERROR');
  await expect(verdict(page)).not.toContainText('did not answer');
});

// ── Local Network Access ────────────────────────────────────────────────────────────────────

test('the permission diagnosis is only ever offered where the browser actually gates it', async ({ page }) => {
  // The measured matrix from docs/CASPARCG_CONNECT.md §1b, pinned as code. Getting this wrong
  // in either direction is a lie told to an operator: a page on localhost that blames a
  // permission sends them to a setting that is not the problem, and a hosted page that stays
  // silent about it leaves them with a call that HANGS on an unanswered prompt.
  await page.goto('/app');
  const matrix = await page.evaluate(async () => {
    const { localNetworkGateApplies } = await import('/src/control/casparLink.ts');
    const agent = 'http://127.0.0.1:8899';
    return {
      hostedToLoopback: localNetworkGateApplies('https://noacg.studio', agent),
      loopbackToLoopback: localNetworkGateApplies('http://localhost:5184', agent),
      lanSelfHostToLoopback: localNetworkGateApplies('http://192.168.0.120:3000', agent),
      hostedToLanAgent: localNetworkGateApplies('https://noacg.studio', 'http://10.0.0.4:8899'),
      hostedToPublicAgent: localNetworkGateApplies('https://noacg.studio', 'https://agent.example.com'),
      // Ordinary PUBLIC names that a prefix match would read as local. Getting these wrong
      // withholds the one diagnosis that explains the failure.
      lookalikeLocalhost: localNetworkGateApplies('https://localhost.evil.example', agent),
      lookalikeLan: localNetworkGateApplies('https://10.0.0.1.evil.example', agent),
    };
  });
  expect(matrix).toEqual({
    hostedToLoopback: true,
    loopbackToLoopback: false,
    lanSelfHostToLoopback: false,
    hostedToLanAgent: true,
    hostedToPublicAgent: false,
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
    const { localNetworkPermission } = await import('/src/control/casparLink.ts');
    return localNetworkPermission();
  });
  expect(state).toBe('unknown');
});

// ── The settings themselves ─────────────────────────────────────────────────────────────────

test('the server is configured once, app-wide, and survives a reload', async ({ page }) => {
  await fakeAgent(page);
  await openPlayoutSettings(page);
  const section = page.getByTestId('settings-playout');
  await section.getByTestId('caspar-host').fill('caspar-01.studio.lan');
  await section.getByTestId('caspar-channel').fill('2');
  await section.getByTestId('caspar-layer').fill('30');
  await section.getByTestId('caspar-agent-token').fill(TOKEN);
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
  await fakeAgent(page);
  await openPlayoutSettings(page);
  await page.getByTestId('caspar-test').click();
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
  await fakeAgent(page);
  await publishedProduction(page);
  // The output URL row - the manual route that has always worked - is there either way.
  await expect(page.getByTestId('copy-output-url')).toBeVisible();
  // A dead control on the busiest surface in the app would be worse than no control.
  await expect(page.getByTestId('caspar-put-on-air')).toHaveCount(0);
});

test('one button puts the production on the configured channel, and one takes it off', async ({ page }) => {
  await seedSettings(page, { channel: 2, layer: 30 });
  const agent = await fakeAgent(page);
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

  // THE WHOLE LIVE LINK is this one command: the production's own output URL, on the configured
  // channel and layer. Everything after it - every cue, take, update, recovery - travels on the
  // durable command log the /output page already follows, which is why there is no CG ADD or
  // CG UPDATE traffic here and no second copy of the graphics on the wire.
  // The dev port is per checkout (docs/DEV_PORTS.md), so the ORIGIN is not pinned here - what
  // is pinned is that the command carries this production's own output URL and nothing else.
  expect(agent.commands).toHaveLength(1);
  expect(agent.commands[0]).toMatch(/^PLAY 2-30 \[HTML\] "https?:\/\/[^"]+\/output\?production=demo-output"$/);

  await page.getByTestId('caspar-take-off-air').click();
  await expect(page.getByTestId('caspar-air-result')).toHaveAttribute('data-state', 'ok');
  await expect(page.getByTestId('caspar-air-result')).toHaveText('✓ Off 2-30');
  expect(agent.commands[1]).toBe('STOP 2-30');
});

test('a failure to air is reported on the row, and never as a success', async ({ page }) => {
  await seedSettings(page);
  await fakeAgent(page, { serverDown: true });
  await publishedProduction(page);
  await page.getByTestId('caspar-put-on-air').click();
  const result = page.getByTestId('caspar-air-result');
  await expect(result).toHaveAttribute('data-state', 'server');
  await expect(result).toContainText('CasparCG did not answer');
  await expect(result).not.toContainText('On air');
});
