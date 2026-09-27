// covers: src/admin/**, admin.html, api/admin/**, api/_lib/admin*{,/**}, scripts/adminDevPlugin.mjs
// covers: api/me/**, scripts/meDevPlugin.mjs, src/backend/myEntitlement.ts
// covers: src/components/useMyEntitlement.ts
//
// The entitlement contract is what the render and AI paths gate on, so a change there can
// move behaviour in either - and in the admin surface that explains it.
// covers: src/entitlements/**

import { test, expect, type Page } from '@playwright/test';
import { resultTotal } from './_browse';

// The private admin surface, from the outside (docs/ADMIN.md section 1).
//
// This suite runs in OFFLINE mode (playwright.config.ts pins blank Supabase vars), which is
// exactly the posture a self-hoster gets: no backend, therefore no users to administer,
// therefore no admin surface. Every assertion here is NEGATIVE on purpose - the value of
// this page is entirely in what it refuses to show, and a spec that only checked the
// authorized view would pass while the refusal path rotted.
//
// The authorized view needs a real signed-in admin and belongs to the live suite
// (playwright.live.config.ts), not here.

test('/admin renders a plain 404 with nothing about an admin system on it', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.locator('.admin-notfound')).toBeVisible();
  await expect(page.locator('.admin-notfound h1')).toHaveText('404');

  // The shell must never have mounted, not even for a frame before the gate answered.
  await expect(page.locator('.admin-shell')).toHaveCount(0);
  await expect(page.locator('.admin-rail')).toHaveCount(0);

  // No sign-in affordance: offering one would confirm there is something to sign in to.
  await expect(page.getByRole('button', { name: /sign in/i })).toHaveCount(0);
  await expect(page.locator('.auth-gate, .auth-signin, .auth-status')).toHaveCount(0);

  // Nothing on the page names the surface. The title, in particular, is what a browser
  // history or a shared screenshot would otherwise leak.
  await expect(page).toHaveTitle('Not found');
  const text = (await page.locator('body').innerText()).toLowerCase();
  for (const word of ['admin', 'sign in', 'forbidden', 'unauthorized', 'permission']) {
    expect(text).not.toContain(word);
  }
});

test('the admin API answers 404, and identically for a real route and an invented one', async ({ request }) => {
  const known = await request.get('/api/admin/session');
  const invented = await request.get('/api/admin/does-not-exist');
  const withToken = await request.get('/api/admin/session', {
    headers: { authorization: 'Bearer not-a-real-token' },
  });

  for (const response of [known, invented, withToken]) {
    expect(response.status()).toBe(404);
  }
  // Byte-identical bodies: the caller cannot tell which of the three they hit.
  const bodies = await Promise.all([known.text(), invented.text(), withToken.text()]);
  expect(bodies[1]).toBe(bodies[0]);
  expect(bodies[2]).toBe(bodies[0]);
  expect(JSON.parse(bodies[0])).toEqual({ error: { code: 'not_found', message: 'Not found' } });
});

test('a POST to an admin route is refused the same way, not with a 405', async ({ request }) => {
  const response = await request.post('/api/admin/session', { data: {} });
  expect(response.status()).toBe(404);
  expect(JSON.parse(await response.text())).toEqual({ error: { code: 'not_found', message: 'Not found' } });
});

// Without this one, every assertion above could pass because the page renders nothing at
// all. Stubbing a successful session proves the shell IS reachable, which is what makes
// "the shell never mounted" a real finding rather than a vacuous one. The stub replaces the
// SERVER's answer - it cannot bypass the server, it only shows what a yes looks like.
test('the shell renders when, and only when, the server says yes', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.goto('/admin');

  await expect(page.locator('.admin-shell')).toBeVisible();
  await expect(page.locator('.admin-role')).toHaveText('owner');
  await expect(page.locator('.admin-email')).toHaveText('owner@example.com');
  await expect(page.locator('.admin-notfound')).toHaveCount(0);
});

test('the editor is untouched by the admin surface existing', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
  // Nothing links to it from the app: not the topbar, not a menu, not a stray anchor.
  await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
  // And with no backend there is no notice to publish, so the band must not appear at all.
  await expect(page.locator('.system-notice')).toHaveCount(0);
});

// The admin surface can hide templates and narrow render formats. Offline it must do neither -
// the catalog and the local export targets are free-forever core, and an instance with no
// backend has no admin to have restricted anything.
test('offline: the entitlement endpoint is absent and the catalog stays whole', async ({ page, request }) => {
  const response = await request.get('/api/me/entitlement');
  const body = response.ok() ? ((await response.json()) as { hiddenTemplates: string[] }) : null;
  // Either the route answers the anonymous defaults, or it is not there at all. What it must
  // never do is come back with something hidden.
  if (body) expect(body.hiddenTemplates).toEqual([]);

  await page.goto('/app');
  await page.locator('[data-entry="template"]').click();
  // The browse grid renders real cards, so nothing filtered the catalog away. Read the
  // step's own count line rather than the cards: the grid shows a first page now
  // (re-design/handoff.md §2b), and the claim here is about the CATALOG, not the page.
  await expect(page.locator('.wz-variant').first()).toBeVisible();
  expect(await resultTotal(page)).toBeGreaterThan(5);
});

test('the landing page does not link to the admin surface either', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('a[href*="/admin"]')).toHaveCount(0);
  const text = (await page.locator('body').innerText()).toLowerCase();
  expect(text).not.toContain('/admin');
});

// Every section has to be reachable once the server says yes. Without this, a broken section
// would look identical to a section that is correctly refusing to render.
test('each admin section renders behind a stubbed session', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  // The data endpoints answer their real 404; every section must survive that rather than
  // blanking the shell, because that is exactly what a partial outage looks like.
  await page.goto('/admin');
  await expect(page.locator('.admin-shell')).toBeVisible();

  for (const label of [
    'Overview',
    'Users',
    'Plans',
    'Usage and cost',
    'Output quality',
    'Feedback',
    'Models',
    'System',
    'Templates',
    'Audit',
  ]) {
    await page.getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.admin-content h1')).toHaveText(label === 'Usage and cost' ? 'Usage and cost' : label);
    await expect(page.locator('.admin-notfound')).toHaveCount(0);
  }
});

// The quality section is the only surface that shows what the generator is being nudged by, so
// a silently-empty one would be indistinguishable from "nobody has thrown anything away yet".
// Stubbed rather than live: the authorized view with real data belongs to the live suite, but
// the RENDERING of that data is ordinary front-end work and is pinned here.
test('the quality section separates what the prompt is fed from what has not counted yet', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/quality*', (route) =>
    route.fulfill({
      json: {
        days: 30,
        // Worst keep rate first, as the endpoint sorts it: 1 of 5 kept, then 3 of 4.
        emerging: [
          { variantId: 'lt-ribbon', intentKind: 'person', accepted: 1, discarded: 4 },
          { variantId: 'lt-stack', intentKind: 'event', accepted: 3, discarded: 1 },
        ],
        reasons: [
          { reason: 'hard-to-read', count: 9 },
          { reason: 'wrong-style', count: 4 },
          { reason: 'brand-new-reason', count: 1 },
        ],
        priors: [{ variantId: 'lt-bar', intentKind: 'person', accepted: 18, discarded: 2 }],
        priorWindowDays: 90,
        priorMinSamples: 8,
        totals: { generations: 120, withVariant: 96, withFeedback: 14 },
        truncated: false,
      },
    }),
  );

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Output quality', exact: true }).click();
  await expect(page.locator('.admin-content h1')).toHaveText('Output quality');

  // The two tables must stay distinguishable: one is acting on the generator right now, the
  // other explicitly is not. Reading them as one list is the mistake this layout prevents.
  const prompted = page.locator('.admin-block').filter({ hasText: 'What the generator is being nudged by' });
  const emerging = page.locator('.admin-block').filter({ hasText: 'Emerging signal' });
  await expect(prompted).toContainText('last 90 days, minimum 8 samples');
  await expect(prompted.locator('tbody tr')).toHaveCount(1);
  await expect(prompted.locator('tbody tr').first()).toContainText('lt-bar');
  await expect(prompted.locator('tbody tr').first()).toContainText('90%');

  // Worst first, and a sub-50% rate is marked hot rather than left as a bar to squint at.
  await expect(emerging.locator('tbody tr')).toHaveCount(2);
  await expect(emerging.locator('tbody tr').first()).toContainText('lt-ribbon');
  await expect(emerging.locator('tbody tr').first()).toContainText('20%');
  await expect(emerging.locator('tbody tr').first().locator('.admin-meter-hot')).toHaveCount(1);
  await expect(emerging.locator('tbody tr').nth(1).locator('.admin-meter-hot')).toHaveCount(0);

  // Enumerated reasons read as English; one the UI has no label for is shown raw and FLAGGED,
  // because a reason nobody labelled must not become a reason nobody sees.
  const reasons = page.locator('.admin-block').filter({ hasText: 'Why people threw one away' });
  await expect(reasons).toContainText('Hard to read');
  await expect(reasons).toContainText('Wrong style');
  await expect(reasons.locator('tbody tr').last()).toContainText('brand-new-reason');
  await expect(reasons.locator('tbody tr').last().locator('.admin-pill')).toHaveText('unlabelled');

  await expect(page.locator('.admin-stats')).toContainText('96');
  await expect(page.locator('.admin-problem')).toHaveCount(0);
});

// A window that hit the read cap must say so: the tables below it are a floor, not a total, and
// an operator reading "3 discards" off a truncated window would draw the wrong conclusion.
test('a truncated quality window says the numbers are a floor', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/quality*', (route) =>
    route.fulfill({
      json: {
        days: 90,
        emerging: [],
        reasons: [],
        priors: [],
        priorWindowDays: 90,
        priorMinSamples: 8,
        totals: { generations: 20000, withVariant: 0, withFeedback: 0 },
        truncated: true,
      },
    }),
  );

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Output quality', exact: true }).click();
  await expect(page.locator('.admin-problem')).toContainText('hit the read cap');
  // And the empty tables must explain themselves rather than rendering as blank space.
  await expect(page.locator('.admin-content')).toContainText('No design has reached 8 samples yet');
});

// ── the overview dashboard ───────────────────────────────────────────────────────────────
//
// Stubbed rather than live, on the same reasoning as the quality specs above: the authorized
// view against real data belongs to the live suite, but how the numbers are PRESENTED is
// ordinary front-end work, and presentation is exactly where the misreadings this section is
// designed against would appear.

const OVERVIEW_METRICS = {
  newAccounts: 2,
  activeVisitors: 41,
  activeAccounts: 7,
  visits: 380,
  signups: 1,
  graphicsCreated: 18,
  videosCreated: 3,
  creatingVisitors: 9,
  firstTimeCreators: 4,
  anonymousCreates: 12,
  signedInCreates: 9,
  anonymousGraphics: 10,
  anonymousCreators: 6,
  exports: 6,
  exportingVisitors: 5,
  anonymousExports: 4,
  aiGenerations: 22,
  aiSuccesses: 17,
  aiFailures: 3,
  aiDeclined: 2,
  aiUsers: 5,
  aiCostUsd: 0.4123,
  gatewayManaged: 8,
  gatewayByo: 30,
  anonymousGatewayCalls: 7,
  gatewayManagedCostUsd: 0.09,
  gatewayFailures: 2,
  rendersStarted: 5,
  rendersDelivered: 4,
  rendersFailed: 1,
  renderMedianMs: 42_000,
};

function overviewWindow(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    from: '2026-07-31T00:00:00+03:00',
    to: '2026-07-31T09:15:00+03:00',
    previousFrom: '2026-07-30T00:00:00+03:00',
    previousTo: '2026-07-30T09:15:00+03:00',
    metrics: OVERVIEW_METRICS,
    previous: { ...OVERVIEW_METRICS, graphicsCreated: 11, exports: 6, aiFailures: 9 },
    previousPartialLedgers: [],
    ...overrides,
  };
}

function overviewBody(overrides: Record<string, unknown> = {}) {
  return {
    scope: 'external',
    internalAccounts: 2,
    timezone: 'Europe/Helsinki',
    generatedAt: '2026-07-31T06:15:00Z',
    windows: [overviewWindow('day'), overviewWindow('week'), overviewWindow('month')],
    state: {
      totalAccounts: 40,
      suspendedAccounts: 1,
      accountsNeverCreated: 24,
      internalAccounts: 2,
      activeGrants: 3,
      grantsExpiringSoon: 2,
      rendersInFlight: 1,
      rendersOverdue: 0,
      accountsSince: '2026-01-06T00:00:00Z',
      funnelSince: '2026-06-01T00:00:00Z',
      generationsSince: '2026-05-02T00:00:00Z',
      gatewaySince: '2026-05-02T00:00:00Z',
      rendersSince: '2026-04-03T00:00:00Z',
    },
    mix: [
      { bucket: 'creation-door', key: 'template', count: 12 },
      { bucket: 'creation-door', key: 'ai', count: 4 },
      { bucket: 'export-target', key: 'spx', count: 5 },
    ],
    available: true,
    fleet: { spendLast24hUsd: 0.41, ceilingUsd: 4 },
    notTracked: ['Export failures. Every export figure is a success count.'],
    ...overrides,
  };
}

async function stubOverview(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/overview*', (route) => route.fulfill({ json: body }));
  await page.route('**/api/admin/system*', (route) =>
    route.fulfill({ json: { disabledFeatures: [], models: [], maintenanceNotice: null, betaUserIds: [] } }),
  );
}

test('the overview states its reporting boundaries, and every number says what it counts', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');
  await expect(page.locator('.admin-content h1')).toHaveText('Overview');

  // The timezone and the comparison rule are ON the page. A dashboard whose "today" is
  // undefined is a dashboard two people read differently, and this sentence is what stops
  // that - so it is asserted rather than left as a nicety.
  const boundary = page.locator('.admin-boundary');
  await expect(boundary).toContainText('Europe/Helsinki');
  await expect(boundary).toContainText('same elapsed span one period earlier');
  await expect(boundary).toContainText('09:15');

  // Three windows, in reading order.
  const headers = page.locator('.admin-metrics').first().locator('thead th');
  await expect(headers.nth(1)).toHaveText('Today');
  await expect(headers.nth(2)).toHaveText('This week');
  await expect(headers.nth(3)).toHaveText('This month');

  // THE CENTRAL ASSERTION: an event count and a unique-browser count are visibly different
  // kinds of number. Without the unit line they would be two identical-looking figures that a
  // reader could add together or compare directly.
  await expect(page.locator('tr[data-metric="visits"] th .admin-muted')).toContainText('events');
  await expect(page.locator('tr[data-metric="activeVisitors"] th .admin-muted')).toContainText('distinct browsers');
  await expect(page.locator('tr[data-metric="activeAccounts"] th .admin-muted')).toContainText('accounts');

  // Money is formatted as money and a duration as a duration - never as a bare count.
  await expect(page.locator('tr[data-metric="aiCostUsd"] td').first()).toContainText('$0.41');
  await expect(page.locator('tr[data-metric="renderMedianMs"] td').first()).toContainText('42.0 s');

  // The user's own AI spend is present and NOT folded into ours.
  await expect(page.locator('tr[data-metric="gatewayByo"] th')).toContainText('user key');
});

test('a render that finished is reported as delivered, and an aged-out file is not a failure', async ({ page }) => {
  // The defect this pins: an `expired` render is one that WORKED and whose output has since been
  // deleted by the TTL cron. Counting it as failed reported four delivered renders as failures
  // on this instance, and building "completed" on the transient `complete` state made that
  // column decay to zero. The row must say delivered, and it must say why.
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const row = page.locator('tr[data-metric="rendersDelivered"]');
  await expect(row.locator('th')).toContainText('delivered');
  await expect(row.locator('th .admin-muted')).toContainText('whether or not the file still exists');
  await expect(row.locator('td').first()).toContainText('4');

  // The word "completed" is gone from the render table - it was the transient state.
  await expect(page.locator('tr[data-metric="rendersCompleted"]')).toHaveCount(0);

  // Failed says what it excludes, so nobody reads an expired output back into it.
  await expect(page.locator('tr[data-metric="rendersFailed"] th .admin-muted')).toContainText('not an expired output');

  // And the median admits its narrower scope rather than looking like the whole picture.
  await expect(page.locator('tr[data-metric="renderMedianMs"] th .admin-muted')).toContainText('still live');
});

test('a brief Lite refuses is reported as declined, not as a failure', async ({ page }) => {
  // The same shape as the render row above, on the AI side: `unsupported` is Lite correctly
  // refusing a brief outside its scope - the guardrail firing. Counting it as a failure turned
  // 19 real failures into 26 on production.
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const declined = page.locator('tr[data-metric="aiDeclined"]');
  await expect(declined.locator('th')).toContainText('declined as out of scope');
  await expect(declined.locator('th .admin-muted')).toContainText('guardrail firing, not failing');
  await expect(declined.locator('td').first()).toContainText('2');

  // The failure row must not silently absorb it, and must say so.
  await expect(page.locator('tr[data-metric="aiFailures"] td').first()).toContainText('3');
  await expect(page.locator('tr[data-metric="aiFailures"] th .admin-muted')).toContainText('declined');

  // Spend names its own scope, because a reservation ceiling is not a charge.
  await expect(page.locator('tr[data-metric="aiCostUsd"] th .admin-muted')).toContainText('reservation ceiling');
});

test('what gets made without an account is a first-class figure, not a footnote', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const block = page.locator('.admin-block').filter({ hasText: 'Made without an account' });
  // Events and people are separate rows: 10 graphics from 6 browsers is a different story from
  // 10 graphics from 1, and a single number cannot tell them apart.
  await expect(block.locator('tr[data-metric="anonymousGraphics"] td').first()).toContainText('10');
  await expect(block.locator('tr[data-metric="anonymousCreators"] th .admin-muted')).toContainText('distinct browsers');
  await expect(block.locator('tr[data-metric="anonymousExports"] td').first()).toContainText('4');

  // Account-free AI is the OTHER reading of "without an account" and comes from a different
  // ledger, so it is labelled rather than silently merged with the funnel rows.
  await expect(block.locator('tr[data-metric="anonymousGatewayCalls"] th')).toContainText('no account at all');

  // Stated as a subset, so nobody adds it to the creation table above.
  await expect(block).toContainText('subset of the table above');
});

test('a change is an absolute difference, and the direction is not assumed to be good', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  // 18 against 11: reported as +7, not as "+64%". At this instance's volume a percentage on a
  // single-digit base cries wolf every morning.
  const graphics = page.locator('tr[data-metric="graphicsCreated"] td').first();
  await expect(graphics).toContainText('18');
  await expect(graphics.locator('.admin-delta')).toHaveText('+7');

  // Unchanged says so rather than showing a zero that looks like a measurement.
  await expect(page.locator('tr[data-metric="exports"] td').first().locator('.admin-delta')).toHaveText('no change');

  // 3 failures against 9 is a FALL, and the arithmetic is the same whether falling is good news
  // or bad - the page reports the number and lets the operator judge.
  await expect(page.locator('tr[data-metric="aiFailures"] td').first().locator('.admin-delta')).toHaveText('−6');
});

test('with no comparable span the overview says so instead of showing a zero', async ({ page }) => {
  await stubOverview(page, overviewBody({ windows: [overviewWindow('month', { previous: null })] }));
  await page.goto('/admin');

  await expect(page.locator('tr[data-metric="graphicsCreated"] .admin-delta').first()).toHaveText('no comparison');
  // A missing comparison must never render as "−18", which would read as a collapse.
  await expect(page.locator('.admin-delta-down')).toHaveCount(0);
});

test('a comparison span older than a ledger is withheld ONLY for that ledger', async ({ page }) => {
  // The real failure this prevents: the activity ledger is younger than the window. Last month
  // is then mostly a stretch of time nothing was recording, so 18 against 0 renders as "+18"
  // and reads as growth when what changed is that counting began.
  //
  // And the second failure, which the first fix caused: withholding the whole COLUMN. These
  // ledgers were switched on months apart, so a young funnel must not cost the registration
  // trend, which comes from the account directory and is evidenced all the way back.
  await stubOverview(page, overviewBody({
    windows: [
      overviewWindow('month', {
        previousPartialLedgers: ['funnel'],
        previous: { ...OVERVIEW_METRICS, graphicsCreated: 0, newAccounts: 1, aiFailures: 9 },
      }),
    ],
  }));
  await page.goto('/admin');

  // Funnel-backed: withheld, and the value itself is still shown.
  await expect(page.locator('tr[data-metric="graphicsCreated"] .admin-delta').first()).toHaveText('partial history');
  await expect(page.locator('tr[data-metric="graphicsCreated"] td').first()).toContainText('18');
  await expect(page.locator('tr[data-metric="activeVisitors"] .admin-delta').first()).toHaveText('partial history');

  // Account-backed and Lite-backed: their ledgers cover the span, so they KEEP their change.
  await expect(page.locator('tr[data-metric="newAccounts"] .admin-delta').first()).toHaveText('+1');
  await expect(page.locator('tr[data-metric="aiFailures"] .admin-delta').first()).toHaveText('−6');
});

test('every metric declares a ledger, so none inherits another one\'s history', async ({ page }) => {
  // Mark EVERY ledger partial: if a row's ledger were missing or wrong, its delta would survive
  // this and the row would be comparing against history it does not have.
  await stubOverview(page, overviewBody({
    windows: [
      overviewWindow('month', {
        previousPartialLedgers: ['accounts', 'funnel', 'lite', 'gateway', 'render'],
      }),
    ],
  }));
  await page.goto('/admin');

  await expect(page.locator('.admin-metrics tbody tr')).not.toHaveCount(0);
  await expect(page.locator('.admin-delta-up')).toHaveCount(0);
  await expect(page.locator('.admin-delta-down')).toHaveCount(0);
  await expect(page.locator('.admin-delta-flat')).toHaveCount(0);
});

test('an uninstalled aggregation reads as an absence, never as an instance nobody uses', async ({ page }) => {
  await stubOverview(page, overviewBody({ available: false, windows: [], state: null, mix: [], fleet: null }));
  await page.goto('/admin');

  await expect(page.locator('.admin-problem')).toContainText('not installed');
  await expect(page.locator('.admin-problem')).toContainText('it is an absence');
  // And no table of zeroes is rendered beside that warning.
  await expect(page.locator('.admin-metrics')).toHaveCount(0);
});

test('what is wrong sits above what is big, and links to the page that fixes it', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/overview*', (route) =>
    route.fulfill({ json: overviewBody({ fleet: { spendLast24hUsd: 3.9, ceilingUsd: 4 } }) }),
  );
  await page.route('**/api/admin/system*', (route) =>
    route.fulfill({
      json: {
        disabledFeatures: ['ai.lite'],
        models: [],
        maintenanceNotice: { message: 'Renders are queued', level: 'warning', until: null },
        betaUserIds: [],
        // One failing deployment term: the gate block must NAME it, because every failing
        // term vanishes the tier identically for a visitor.
        hostedPro: {
          enabled: true, auth: true, ledger: true,
          task: false, managedKey: true, routesEnabled: true, configured: false,
        },
      },
    }),
  );
  await page.goto('/admin');

  const attention = page.locator('.admin-attention li');
  await expect(attention.first()).toContainText('Switched off instance-wide');
  await expect(attention.filter({ hasText: 'ceiling' })).toHaveCount(1);
  await expect(attention.filter({ hasText: 'suspended' })).toHaveCount(1);
  await expect(attention.filter({ hasText: 'expire within seven days' })).toHaveCount(1);

  // It is ABOVE the numbers, which is the whole point of the block: an operator arriving during
  // an incident must not have to read past three healthy tiles to find the kill switch.
  const attentionBox = await page.locator('.admin-attention').boundingBox();
  const firstTable = await page.locator('.admin-metrics').first().boundingBox();
  expect(attentionBox).not.toBeNull();
  expect(firstTable).not.toBeNull();
  expect(attentionBox?.y ?? 0).toBeLessThan(firstTable?.y ?? 0);

  // And it acts: the kill-switch card opens the section that turns it back on.
  await attention.filter({ hasText: 'Switched off' }).getByRole('button').click();
  await expect(page.locator('.admin-content h1')).toHaveText('System');

  // The hosted-Pro gate block names the ONE term that failed - every failing term vanishes
  // the tier identically for a visitor, so this diagnosis exists only here.
  const gateBlock = page.locator('.admin-block').filter({ hasText: 'Hosted Pro gate' });
  await expect(gateBlock.locator('li').filter({ hasText: '✗' })).toHaveCount(1);
  await expect(gateBlock.locator('li').filter({ hasText: '✗' })).toContainText('Task registry');
  await expect(gateBlock.locator('li').filter({ hasText: '✓' })).toHaveCount(5);
});

test('the overview names what it does not track, so an absence is not read as a zero', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const block = page.locator('.admin-block').filter({ hasText: 'Not tracked' });
  await expect(block.locator('li')).toContainText('success count');
  await expect(block.locator('.admin-pill').first()).toHaveText('no data');

  // The activation-attribution gap is stated rather than hidden behind a confident number.
  await expect(page.locator('.admin-content')).toContainText('upper bound');
});

test('the overview carries no user content of any kind', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');
  await expect(page.locator('.admin-metrics').first()).toBeVisible();

  // Every value on this page is a count, a slug or an amount. The mix bars are the only place a
  // string from a ledger is rendered at all, and those are server-written slugs - a creation
  // door, an export target, a referrer host, a rejection code like `provider_rejected` - so the
  // shape they are allowed to have is asserted rather than assumed. No spaces, therefore no
  // sentence, therefore nothing a person typed.
  const labels = await page.locator('.admin-bar-label').allInnerTexts();
  expect(labels.length).toBeGreaterThan(0);
  for (const label of labels) expect(label).toMatch(/^[a-z0-9._-]{1,64}$/);
});

// ── model eligibility ────────────────────────────────────────────────────────────────────

const MODEL_ROWS = [
  {
    key: 'vercel:vendor/approved-one',
    provider: 'vercel',
    model: 'vendor/approved-one',
    name: 'Approved One',
    contextLength: 131_072,
    inputPerMillion: 0.05,
    outputPerMillion: 0.15,
    structuredOutput: true,
    vision: false,
    openWeight: true,
    free: false,
    available: true,
    zdr: 'audited',
    zdrAvailable: true,
    approved: true,
    verdict: 'approved',
    blocks: [],
    createdAt: '2026-01-01T00:00:00Z',
    isNew: false,
  },
  {
    key: 'vercel:vendor/fresh',
    provider: 'vercel',
    model: 'vendor/fresh',
    name: 'Fresh Candidate',
    contextLength: 262_144,
    inputPerMillion: 0.11,
    outputPerMillion: 0.8,
    structuredOutput: true,
    vision: true,
    openWeight: true,
    free: false,
    available: true,
    zdr: 'unknown',
    zdrAvailable: null,
    approved: false,
    verdict: 'eligible',
    blocks: [],
    createdAt: '2026-07-20T00:00:00Z',
    isNew: true,
  },
  {
    key: 'vercel:vendor/expensive',
    provider: 'vercel',
    model: 'vendor/expensive',
    name: 'Expensive Flagship',
    contextLength: 200_000,
    inputPerMillion: 15,
    outputPerMillion: 75,
    structuredOutput: true,
    vision: true,
    openWeight: false,
    free: false,
    available: true,
    zdr: 'unknown',
    zdrAvailable: null,
    approved: false,
    verdict: 'ineligible',
    blocks: ['over-price-ceiling'],
    createdAt: '2026-07-22T00:00:00Z',
    isNew: true,
  },
];

const MODELS_BODY = {
  provider: 'vercel',
  syncedAt: '2026-07-31T06:00:00Z',
  models: MODEL_ROWS,
  rule: { provider: 'vercel', inputPerMillion: 1, outputPerMillion: 5, newModelDays: 30 },
  missingApproved: [] as string[],
  discoveryFailed: false,
};

async function stubModels(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/models*', (route) => route.fulfill({ json: body }));
}

test('the models section reports eligibility and refuses to imply quality', async ({ page }) => {
  await stubModels(page, MODELS_BODY);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await expect(page.locator('.admin-content h1')).toHaveText('Models');

  // The disclaimer is load-bearing, not decoration: a price table with capability ticks reads
  // like a shortlist unless the page says otherwise, first.
  await expect(page.locator('.admin-note').first()).toContainText('eligibility, not quality');
  await expect(page.locator('.admin-note').first()).toContainText('never starts a generation');

  // No score, rank or recommendation anywhere on the page.
  const text = (await page.locator('.admin-content').innerText()).toLowerCase();
  for (const word of ['score', 'rank', 'recommend']) {
    expect(text).not.toContain(word);
  }

  // The rule the verdicts were measured against is stated, so a verdict is checkable.
  await expect(page.locator('.admin-content')).toContainText('$1.00 per million input tokens');
});

test('ZDR is shown as audited only where an audit exists', async ({ page }) => {
  await stubModels(page, MODELS_BODY);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: /^Everything listed/ }).click();

  const approved = page.locator('tr[data-model="vendor/approved-one"]');
  await expect(approved).toContainText('verified');
  // ...and not the "not verified" that contains it as a substring - the two pills differ by a
  // word, so a bare toContainText passes for either.
  await expect(approved).not.toContainText('not verified');
  // The unapproved candidate must read "not audited". Either verification verdict would be an
  // equally unfounded claim: both assert a check was made, and none was.
  const fresh = page.locator('tr[data-model="vendor/fresh"]');
  await expect(fresh).toContainText('not audited');
  await expect(fresh).not.toContainText('not verified');

  // An ineligible route says WHY, in words, rather than leaving a blank cell.
  await expect(page.locator('tr[data-model="vendor/expensive"]')).toContainText('over the funded price ceiling');
});

test('the models filters count what they show, and default to what is new', async ({ page }) => {
  await stubModels(page, MODELS_BODY);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();

  await expect(page.getByRole('button', { name: 'Newly discovered (2)' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approved routes (1)' })).toBeVisible();
  // The landing filter is the newly discovered set - what an operator opens this page for.
  await expect(page.locator('tbody tr')).toHaveCount(2);

  await page.getByRole('button', { name: /^Approved routes/ }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
  await expect(page.locator('tbody tr')).toContainText('approved');
});

test('a provider outage costs the models section only, and says so', async ({ page }) => {
  await stubModels(page, { ...MODELS_BODY, models: [], syncedAt: null, discoveryFailed: true });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();

  await expect(page.locator('.admin-problem')).toContainText('could not be read');
  await expect(page.locator('.admin-problem')).toContainText('every other part of the admin surface');

  // The rest of the shell is still navigable, which is the actual claim being made.
  await page.getByRole('button', { name: 'Users', exact: true }).click();
  await expect(page.locator('.admin-content h1')).toHaveText('Users');
});

test('an approved route the provider stopped listing is reported as an outage', async ({ page }) => {
  await stubModels(page, { ...MODELS_BODY, missingApproved: ['vercel:vendor/vanished'] });
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();

  await expect(page.locator('.admin-problem')).toContainText('vercel:vendor/vanished');
  await expect(page.locator('.admin-problem')).toContainText('fails closed');
});

// The Models section is a LISTING, never a shortlist (docs/ADMIN.md section 9). These three
// behaviours are the ones that could quietly turn it into one, so they are pinned: the section
// must open unsorted, a sort must be something the operator did, and "we audited this" must
// stay visibly separate from "traffic is going here right now".
function modelRow(over: Record<string, unknown> = {}) {
  return {
    key: 'vercel:vendor/mid',
    provider: 'vercel',
    model: 'vendor/mid',
    name: 'Mid',
    contextLength: 128_000,
    inputPerMillion: 0.5,
    outputPerMillion: 2,
    structuredOutput: true,
    vision: false,
    openWeight: false,
    free: false,
    available: true,
    zdr: 'unknown',
    zdrAvailable: null,
    approved: false,
    verdict: 'eligible',
    blocks: [],
    createdAt: '2020-01-01T00:00:00Z',
    isNew: false,
    usedBy: [],
    ...over,
  };
}

test('the models table opens in reading order and sorts only when asked', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/models', (route) =>
    route.fulfill({
      json: {
        provider: 'vercel',
        syncedAt: '2026-08-01T06:00:00Z',
        models: [
          modelRow({ key: 'vercel:vendor/dear', model: 'vendor/dear', inputPerMillion: 9, contextLength: 8000 }),
          modelRow({ key: 'vercel:vendor/cheap', model: 'vendor/cheap', inputPerMillion: 0.1, contextLength: 32_000 }),
          // No published price. It is unmeasured, not cheap - it must never head an ascending
          // price sort, which would read as "the cheapest".
          modelRow({ key: 'vercel:vendor/unpriced', model: 'vendor/unpriced', inputPerMillion: null }),
          modelRow({
            key: 'vercel:vendor/live',
            model: 'vendor/live',
            inputPerMillion: 1,
            approved: true,
            verdict: 'approved',
            zdr: 'audited',
            zdrAvailable: true,
            usedBy: [{ task: 'NoaCG Lite', slot: 'primary' }],
          }),
        ],
        rule: { provider: 'vercel', inputPerMillion: 1, outputPerMillion: 5, newModelDays: 30 },
        missingApproved: [],
        discoveryFailed: false,
      },
    }),
  );

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: /Everything listed/ }).click();

  const routes = () => page.locator('.admin-table tbody tr').evaluateAll((rows) =>
    rows.map((row) => row.getAttribute('data-model')),
  );

  // Opens in the reading order the section has always used - approved first, then the rest
  // alphabetically. NOT by price: nothing arrives ranked.
  expect(await routes()).toEqual(['vendor/live', 'vendor/cheap', 'vendor/dear', 'vendor/unpriced']);

  // The operator asks for cheapest-first. The unpriced row sinks rather than leading.
  await page.getByRole('button', { name: /In \/ M/ }).click();
  expect(await routes()).toEqual(['vendor/cheap', 'vendor/live', 'vendor/dear', 'vendor/unpriced']);
  await expect(page.locator('th[aria-sort="ascending"]')).toHaveCount(1);

  // Clicking the same column again reverses it, and the unpriced row STILL sinks.
  await page.getByRole('button', { name: /In \/ M/ }).click();
  expect(await routes()).toEqual(['vendor/dear', 'vendor/live', 'vendor/cheap', 'vendor/unpriced']);
  await expect(page.locator('th[aria-sort="descending"]')).toHaveCount(1);

  // A different column takes over rather than compounding.
  await page.getByRole('button', { name: /Context/ }).click();
  expect((await routes())[0]).toBe('vendor/dear');

  // Approved and in-use are different claims and are shown as different pills.
  const live = page.locator('tr[data-model="vendor/live"]');
  await expect(live).toContainText('approved');
  await expect(live).toContainText('NoaCG Lite primary');
  await expect(page.locator('tr[data-model="vendor/cheap"]')).not.toContainText('primary');
});

test('the image tab lists routes without pretending to judge them', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/models', (route) =>
    route.fulfill({
      json: {
        provider: 'vercel',
        syncedAt: '2026-08-01T06:00:00Z',
        models: [modelRow()],
        rule: { provider: 'vercel', inputPerMillion: 1, outputPerMillion: 5, newModelDays: 30 },
        missingApproved: [],
        discoveryFailed: false,
      },
    }),
  );
  await page.route('**/api/admin/models?output=image', (route) =>
    route.fulfill({
      json: {
        provider: 'vercel',
        syncedAt: '2026-08-01T06:00:00Z',
        models: [
          // `usedBy` is EMPTY on both rows because that is what the server now returns: no NoaCG
          // task calls an image model since Phase A retired the concept-and-reconstruct engine
          // (docs/NOACG_PRO_PLAN.md §16), so `routesInUse` names none of them.
          { key: 'vercel:vendor/draw', provider: 'vercel', model: 'vendor/draw', name: 'Draw', imagePriceUsd: 30, inputPerMillion: 0.3, available: true, createdAt: null, isNew: false, usedBy: [] },
          { key: 'vercel:vendor/quiet', provider: 'vercel', model: 'vendor/quiet', name: 'Quiet', imagePriceUsd: null, inputPerMillion: null, available: true, createdAt: null, isNew: false, usedBy: [] },
        ],
        discoveryFailed: false,
      },
    }),
  );

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Models', exact: true }).click();
  await page.getByRole('button', { name: 'Image models', exact: true }).click();

  await expect(page.locator('tr[data-model="vendor/draw"]')).toContainText('$30.00');
  // An unpublished price says so. Rendering it as "free" next to a real price would be a lie
  // about money.
  await expect(page.locator('tr[data-model="vendor/quiet"]')).toContainText('not published');

  // No eligibility language at all: the funded ceiling is per million tokens and cannot judge
  // a model billed per image, so no verdict is offered rather than a wrong one.
  const table = page.locator('.admin-table');
  await expect(table).not.toContainText('ineligible');
  await expect(table).not.toContainText('eligible');
  const imageNote = page.locator('.admin-note').filter({ hasText: 'image output' });
  await expect(imageNote).toContainText('No eligibility verdict');
  // And it says OUTRIGHT that nothing here runs, rather than leaving an empty in-use column to
  // be read as a listing that failed to load. An absence nobody announces is the defect this
  // whole tab's copy exists to avoid.
  await expect(imageNote).toContainText('Nothing here is in use');

  // …and no row claims otherwise. Both halves matter: the sentence could be true and the table
  // still mark something, which is exactly the state this replaced.
  await expect(page.locator('tr[data-model="vendor/draw"]')).not.toContainText('NoaCG');
  await expect(page.locator('tr[data-model="vendor/quiet"]')).not.toContainText('NoaCG');
});

// ── the internal-account scope ───────────────────────────────────────────────────────────
//
// The filter's whole risk is silence. A dashboard that quietly excludes some of its rows and
// does not say so is more misleading than one that excludes nothing, so what these pin is not
// the arithmetic (migration 0027's own self-check asserts that against the live tables) but
// that the page ANNOUNCES what it is showing and what it cannot reach.

test('a scoped usage section says which scope it is showing, and what that scope misses', async ({ page }) => {
  await stubOverview(page, overviewBody());
  await page.goto('/admin');

  const scope = page.getByTestId('admin-scope');
  await expect(scope).toBeVisible();
  // External is the default and is stated in words, not just as a pressed button.
  await expect(scope).toContainText('Accounts marked internal');
  await expect(scope).toContainText('2 accounts are marked internal');
  // The honest limit rides with it: the funnel identifies a BROWSER, so signed-out
  // development traffic cannot be told from a stranger's and stays counted as external.
  await expect(scope).toContainText('upper bound');

  // Switching scope re-reads the endpoint with the new value rather than filtering in place -
  // the counting happens in SQL and a client-side filter would be a second, disagreeing answer.
  const asked: string[] = [];
  await page.route('**/api/admin/overview*', (route) => {
    asked.push(new URL(route.request().url()).searchParams.get('scope') ?? '');
    return route.fulfill({ json: overviewBody({ scope: 'internal' }) });
  });
  await page.getByTestId('admin-scope-internal').click();
  await expect.poll(() => asked).toContain('internal');
});

test('a scope that excludes nothing says so, rather than implying a filter is working', async ({ page }) => {
  // Zero marked accounts is the state every instance starts in, and it is exactly when a
  // confident "showing other people" would be a lie.
  await stubOverview(page, overviewBody({ internalAccounts: 0 }));
  await page.goto('/admin');
  await expect(page.getByTestId('admin-scope')).toContainText('this filter is currently doing nothing');
});

// ── the feedback inbox ───────────────────────────────────────────────────────────────────

const FEEDBACK_ITEM = {
  id: '11111111-1111-4111-8111-111111111111',
  kind: 'generation',
  sentiment: 'negative',
  reasons: ['hard-to-read'],
  message: 'The second line was cut off on the right.',
  userId: null,
  email: '',
  internal: false,
  visitorId: '22222222-2222-4222-8222-222222222222',
  area: 'wizard',
  generationId: '33333333-3333-4333-8333-333333333333',
  tier: 'lite',
  model: 'google/gemini-2.5-flash-lite',
  variantId: 'ltc01',
  intentKind: 'person',
  promptVersion: 'lite-lower-third-v3',
  status: 'new',
  adminNote: '',
  reviewedAt: null,
  createdAt: '2026-08-02T09:00:00Z',
};

function feedbackBody(overrides: Record<string, unknown> = {}) {
  return {
    scope: 'external',
    internalAccounts: 1,
    days: 90,
    items: [FEEDBACK_ITEM],
    totals: {
      all: 1, positive: 0, negative: 1, unresolved: 1,
      withMessage: 1, generationRatings: 1, betaNotes: 0,
    },
    reasons: [{ reason: 'hard-to-read', count: 1 }],
    byModel: [{ key: 'google/gemini-2.5-flash-lite', positive: 0, negative: 1, total: 1 }],
    byTier: [{ key: 'lite', positive: 0, negative: 1, total: 1 }],
    byVariant: [{ key: 'ltc01', positive: 0, negative: 1, total: 1 }],
    byArea: [{ key: 'wizard', positive: 0, negative: 1, total: 1 }],
    truncated: false,
    ...overrides,
  };
}

test('the feedback inbox shows the words and enough context to reproduce them', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/feedback*', (route) => route.fulfill({ json: feedbackBody() }));

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();

  const item = page.getByTestId('feedback-item');
  await expect(item).toContainText('The second line was cut off on the right.');
  // The investigation context an operator actually needs: which model, which chassis, which
  // prompt version. All server-derived - the browser is never told the model.
  await expect(item).toContainText('google/gemini-2.5-flash-lite');
  await expect(item).toContainText('ltc01');
  await expect(item).toContainText('lite-lower-third-v3');
  // And the things that must never be here.
  const body = (await page.locator('.admin-content').innerText()).toLowerCase();
  for (const forbidden of ['prompt:', 'brief', '<div', 'data:image']) {
    expect(body, `the inbox must not carry ${forbidden}`).not.toContain(forbidden);
  }
});

test('the feedback section refuses to rank models, and says why', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/feedback*', (route) => route.fulfill({ json: feedbackBody() }));

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();

  // The same rule the Models section holds: user feedback is operational evidence, and only a
  // NoaCG benchmark can establish quality. A per-model complaint count next to no such
  // sentence would read as a league table.
  await expect(page.locator('.admin-note').first()).toContainText('evidence, not a verdict');
  await expect(page.locator('.admin-content')).toContainText('NoaCG benchmarks');
  const text = await page.locator('.admin-content').innerText();
  expect(text.toLowerCase()).not.toContain('recommended');
});

test('a satisfaction percentage is withheld until there are enough ratings to mean one', async ({ page }) => {
  await page.route('**/api/admin/session', (route) =>
    route.fulfill({ json: { email: 'owner@example.com', role: 'owner' } }),
  );
  await page.route('**/api/admin/feedback*', (route) => route.fulfill({ json: feedbackBody() }));

  await page.goto('/admin');
  await page.getByRole('button', { name: 'Feedback', exact: true }).click();
  // One rating is not 0% satisfaction, it is one person - and a page that says 0% invites a
  // decision nobody has the evidence for.
  await expect(page.getByTestId('feedback-satisfaction')).toContainText('too few to put a number on');
  await expect(page.getByTestId('feedback-satisfaction')).not.toContainText('0%');
});
