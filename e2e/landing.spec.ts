import { test, expect } from '@playwright/test';
import { createProject } from './_create';

// The public landing page lives at "/" (static, no React); the editor lives at "/app"
// (dev/preview: the app-clean-url Vite plugin; production: Vercel cleanUrls). Old share
// links that pointed at the root with a query keep working via the landing's redirect shim.

test('root shows the landing page, not the editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Run the show');
  // Every "Start creating" call to action lands on the CREATION WIZARD (`#/new`), not on
  // whatever document happened to be open last. Arriving from the marketing page means
  // "I want to make something"; dropping a returning visitor straight into an old project
  // answers a question they did not ask. The wizard's own Entry step is where continuing
  // existing work is offered, so nothing is lost by starting there.
  const ctas = page.locator('a.btn-amber[href^="/app"]');
  await expect(ctas).not.toHaveCount(0);
  for (const cta of await ctas.all()) {
    await expect(cta).toHaveAttribute('href', '/app#/new');
  }
  // The editor itself did not mount here.
  await expect(page.locator('.wz-modal')).toHaveCount(0);
  await expect(page.locator('#root')).toHaveCount(0);
});

test('the editor lives at /app (clean URL, dev parity with production)', async ({ page }) => {
  await page.goto('/app');
  await expect(page.locator('.wz-modal')).toBeVisible();
});

test('the landing CTA opens the wizard even for a visitor with work in progress', async ({ page }) => {
  // A returning visitor: an autosaved project exists, so a bare /app would go straight to the
  // editor. The CTA route must still open the wizard — that is the whole point of the change.
  await createProject(page, 'Hairline');
  await expect(page.locator('.wz-modal')).toHaveCount(0);

  await page.goto('/app#/new');
  await expect(page.locator('.wz-modal')).toBeVisible();

  // And their work is still there to go back to: closing the wizard returns to the project
  // rather than discarding it.
  await page.locator('.gallery-close').click();
  await expect(page.locator('.wz-modal')).toHaveCount(0);
  await expect(page.locator('iframe.preview-frame')).toBeVisible();
});

test('the landing says the four things a stranger has to meet', async ({ page }) => {
  // The four claims docs/PROMISE_AUDIT.md says the page must make early and plainly: free and
  // open source, your own artwork becomes fields and controls, a coding agent can drive it, and
  // OGraf is where it is going. A capability nobody can discover does not exist, and a claim
  // without a row in the audit is not allowed on the page.
  await page.goto('/');

  // Free and open source, before the product tour, with the licence named.
  const free = page.locator('#free');
  await expect(free).toContainText('AGPL-3.0');
  await expect(page.locator('.hero .lede')).toContainText('free and open source');

  // The artwork card leads with SVG and links to the authoring guide.
  const importCard = page.locator('.way', { hasText: 'Bring your own artwork' });
  await expect(importCard).toContainText('SVG');
  await expect(importCard.locator('a[href="/docs#svg"]')).toHaveCount(1);

  // The agent-door section shows the real, installable command - never a mocked terminal.
  const agents = page.locator('#agents');
  await expect(agents).toContainText('Claude Code');
  await expect(agents).toContainText('npx @noacg/cli');
  await expect(agents.locator('a[href="/docs#claude-code"]')).toHaveCount(1);

  // OGraf has its own section, reachable from the nav, linking the starters page, and every
  // direction card is marked as direction rather than shown as shipped. The number of dashed
  // cards is not pinned: a card turns solid in the commit that lands its rung (docs/GOALS.md).
  const ograf = page.locator('#ograf');
  await expect(page.locator('header nav a[href="#ograf"]')).toHaveCount(1);
  await expect(ograf.locator('a[href="/ograf"]')).toHaveCount(1);
  const planned = await ograf.locator('.feat.planned').count();
  expect(planned).toBeGreaterThan(0);
  await expect(ograf.locator('.feat.planned .soon')).toHaveCount(planned);
  await expect(ograf.locator('.feat:not(.planned) .soon')).toHaveCount(0);

  // And the docs home is reachable from the page chrome.
  await expect(page.locator('header nav a[href="/docs"]')).toHaveCount(1);
  await expect(page.locator('footer a[href="/docs"]')).toHaveCount(1);
});

test('old root share links redirect into the app with their query intact', async ({ page }) => {
  await page.goto('/?chat=my-show');
  await page.waitForURL('**/app?chat=my-show');
  await page.goto('/?template=some-slug');
  await page.waitForURL('**/app?template=some-slug');
});

// A PASSWORD-RESET LINK THAT LANDS HERE IS THE OWNER'S 2026-09-04 BUG
// (docs/backlog/password-reset-link-lands-nowhere.md): the mail arrived, the link opened this
// page, and there was nowhere to set a password - because Supabase falls back to the Site URL
// when its redirect allow-list does not cover the URL we asked for, and this page runs no
// Supabase client. The forward makes that failure impossible rather than one config line away,
// so it is pinned here even though the allow-list is currently right.
test('a password-reset link that lands on the landing page is forwarded into the app', async ({ page }) => {
  await page.goto('/#access_token=not-a-real-token&expires_in=3600&token_type=bearer&type=recovery');
  await page.waitForURL('**/app?recovery=1#*type=recovery*');
  // The token itself survived the trip - forwarding to a route that has lost it would be the
  // same bug with a different address.
  expect(new URL(page.url()).hash).toContain('access_token=not-a-real-token');
});
