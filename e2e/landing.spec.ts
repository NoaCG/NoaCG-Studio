import { test, expect } from '@playwright/test';
import { createProject } from './_create';

// The public landing page lives at "/" (static, no React); the editor lives at "/app"
// (dev/preview: the app-clean-url Vite plugin; production: Vercel cleanUrls). Old share
// links that pointed at the root with a query keep working via the landing's redirect shim.

test('root shows the landing page, not the editor', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1')).toContainText('Make broadcast graphics');
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

test('the landing says what NoaCG is, where it plays out, and the three ways in', async ({ page }) => {
  // The page's job is that a stranger understands NoaCG in about thirty seconds (owner,
  // 2026-09-27): what it makes, NoaCG Playout and NoaCG Bridge near the top, then the three ways to
  // start in a fixed order. A capability nobody can discover does not exist, and a claim that runs
  // ahead of docs/GOALS.md outcomes 5 and 6 is not allowed on the page.
  await page.goto('/');

  // Free and open source in the hero, with the licence named further down.
  await expect(page.locator('.hero')).toContainText(/free (?:and|&) open source/i);
  await expect(page.locator('#free')).toContainText('AGPL-3.0');

  // Playout and Bridge come straight after the hero. Only the CasparCG route through the Bridge is
  // marked proven, because it is the only production-proven one; the Bridge's download is linked.
  const playout = page.locator('#playout');
  await expect(page.locator('main > section').first()).toHaveAttribute('id', 'playout');
  await expect(playout).toContainText('NoaCG Bridge');
  await expect(playout.locator('a[href="/downloads#bridge"]')).toHaveCount(1);
  await expect(playout.locator('.proven')).toHaveCount(1);
  await expect(playout.locator('.route', { has: page.locator('.proven') })).toContainText('CasparCG');
  await expect(playout).toContainText('not yet tested');

  // The three ways, in order: the coding agent, your own artwork, templates.
  const ways = page.locator('#start .way');
  await expect(ways).toHaveCount(3);
  await expect(ways.nth(0)).toHaveAttribute('id', 'agents');
  await expect(ways.nth(1)).toHaveAttribute('id', 'artwork');
  await expect(ways.nth(2)).toHaveAttribute('id', 'templates');
  const agents = page.locator('#agents');
  await expect(agents).toContainText('Claude Code');
  await expect(agents).toContainText('NoaCG CLI');
  await expect(agents.locator('a[href="/docs#agent-install"]')).toHaveCount(1);
  const artwork = page.locator('#artwork');
  await expect(artwork).toContainText('SVG');
  await expect(artwork.locator('a[href="/docs#svg"]')).toHaveCount(1);

  // OGraf has its own section, reachable from the nav, linking the starters page, and every
  // direction card is marked as direction rather than shown as shipped. The number of dashed
  // cards is not pinned: a card turns solid in the commit that lands its rung (docs/GOALS.md).
  // Nothing in it may say the Bridge carries OGraf graphics.
  const ograf = page.locator('#ograf');
  await expect(page.locator('header nav a[href="#ograf"]')).toHaveCount(1);
  await expect(ograf.locator('a[href="/ograf"]')).toHaveCount(1);
  const planned = await ograf.locator('.feat.planned').count();
  expect(planned).toBeGreaterThan(0);
  await expect(ograf.locator('.feat.planned .soon')).toHaveCount(planned);
  await expect(ograf.locator('.feat:not(.planned) .soon')).toHaveCount(0);
  await expect(ograf).not.toContainText('Bridge');

  // The docs home and the downloads page are reachable from the page chrome.
  await expect(page.locator('header nav a[href="/docs"]')).toHaveCount(1);
  await expect(page.locator('footer a[href="/docs"]')).toHaveCount(1);
  await expect(page.locator('footer a[href="/downloads"]')).toHaveCount(1);
});

test('the pages and anchors the landing links to exist', async ({ page }) => {
  // A link to a renamed anchor fails silently: the page opens at its top and nobody notices.
  // The first two are the landing's own old section anchors, still linked from /docs and
  // /downloads.
  for (const [path, anchor] of [
    ['/', 'live'],
    ['/', 'how'],
    ['/downloads', 'bridge'],
    ['/downloads', 'cli'],
    ['/docs', 'agent-install'],
    ['/docs', 'svg'],
    ['/docs', 'dashboard'],
  ]) {
    const response = await page.goto(path);
    expect(response?.ok(), path).toBe(true);
    await expect(page.locator(`[id="${anchor}"]`).first(), `${path}#${anchor}`).toBeAttached();
  }
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
