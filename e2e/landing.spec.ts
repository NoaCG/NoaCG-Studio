// covers: src/landing/**, index.html
// focus
//
// The public docs home (docs.html + src/docs/, docs/AGENT_CLI.md's landing half).
// public/docs/ holds the screenshots docs.html embeds, and docs.spec.ts asserts they load;
// left unmapped, one regenerated picture escalated to the full suite plus the catalog gate
// (measured 2026-08-30). The landing spec rides along on the entry because the two pages
// cross-link: a docs section renamed out from under the landing's anchors is exactly the
// break neither page sees alone.
// covers: {docs.html,public/docs/**}
//
// The public Downloads page (downloads.html + src/downloads/): NoaCG Bridge and the NoaCG CLI.
// It borrows the docs stylesheet and copy buttons, and the landing links it from its nav, a band
// and its footer, so both of those specs ride along. public/downloads/ holds the SVG examples
// zip the page links, and downloads.spec.ts fetches it.
// covers: {downloads.html,src/downloads/**,public/downloads/**}
//
// What's new and the roadmap: two public pages the landing links, whose lists the build generates
// from docs/whats-new/ and docs/GOALS.md (scripts/whats-new.mjs, scripts/roadmap.mjs).
// covers: {whats-new.html,roadmap.html,docs/whats-new/**,scripts/whats-new.mjs,scripts/roadmap.mjs}

import { test, expect } from '@playwright/test';
import { createProject } from './_create';

// The public landing page lives at "/" (static, no React); the editor lives at "/app"
// (dev/preview: the app-clean-url Vite plugin; production: Vercel cleanUrls). Old share
// links that pointed at the root with a query keep working via the landing's redirect shim.

test('root shows the landing page, not the editor', async ({ page }) => {
  await page.goto('/');
  // One headline on both surfaces: the wizard's first screen repeats it word for word
  // (e2e/wizard-entry-fit.spec.ts pins the wizard's side).
  await expect(page.locator('h1')).toHaveText(/^\s*Create live graphics\.\s+Run the show\.\s*$/);
  // The lede tells the whole story on the first screen: the three ways in and both roads to air.
  const lede = page.locator('.hero .lede');
  for (const phrase of ['template', 'SVG', 'AI coding agent', 'browser source', 'NoaCG Playout', 'CasparCG', 'NoaCG Bridge']) {
    await expect(lede).toContainText(phrase);
  }
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

test('the landing reads create first, then play or export', async ({ page }) => {
  // The page's job is that a stranger understands NoaCG in about thirty seconds, in the product's
  // own order (owner, 2026-09-28): first make graphics, then choose how to play or export them.
  // A capability nobody can discover does not exist, and a claim that runs ahead of
  // docs/GOALS.md outcomes 5 and 6 is not allowed on the page.
  await page.goto('/');

  // Free and open source in the hero, with the licence named further down.
  await expect(page.locator('.hero')).toContainText(/free (?:and|&) open source/i);
  await expect(page.locator('#free')).toContainText('AGPL-3.0');

  // Step 1 then step 2, straight after the hero, and the nav in the same order.
  const sections = page.locator('main > section');
  await expect(sections.nth(0)).toHaveAttribute('id', 'start');
  await expect(sections.nth(1)).toHaveAttribute('id', 'playout');
  const sectionLinks = page.locator('header nav a.gh[href^="#"]');
  await expect(sectionLinks.nth(0)).toHaveAttribute('href', '#start');
  await expect(sectionLinks.nth(1)).toHaveAttribute('href', '#playout');

  // Create: the three ways, in the wizard's card order - a template, your own SVGs, your agent.
  const ways = page.locator('#start .way');
  await expect(ways).toHaveCount(3);
  await expect(ways.nth(0)).toHaveAttribute('id', 'templates');
  await expect(ways.nth(1)).toHaveAttribute('id', 'artwork');
  await expect(ways.nth(2)).toHaveAttribute('id', 'agents');
  const agents = page.locator('#agents');
  await expect(agents).toContainText('Claude Code');
  await expect(agents).toContainText('NoaCG CLI');
  await expect(agents.locator('a[href="/docs#agent-install"]')).toHaveCount(1);
  const artwork = page.locator('#artwork');
  await expect(artwork).toContainText('SVG');
  await expect(artwork.locator('a[href="/docs#svg"]')).toHaveCount(1);

  // Play or export: exactly three routes - NoaCG Playout with the Bridge to CasparCG, OBS and
  // browser sources, export packages - and no route wears a "proven" badge. The untested
  // export targets are said to be untested; the Bridge's download is linked.
  const playout = page.locator('#playout');
  const routes = playout.locator('.route');
  await expect(routes).toHaveCount(3);
  await expect(routes.nth(0)).toContainText('NoaCG Bridge');
  await expect(routes.nth(0)).toContainText('CasparCG');
  await expect(routes.nth(1)).toContainText('browser source');
  // OBS has its place: the output as a browser source, and the control panel in an OBS dock.
  await expect(routes.nth(1)).toContainText('OBS');
  await expect(routes.nth(1)).toContainText('Custom Browser Dock');
  // ...with a real OBS capture, which has to load rather than leave a broken frame.
  const obsShot = playout.locator('.obs-shot img');
  await obsShot.scrollIntoViewIfNeeded();
  await expect.poll(() => obsShot.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth)).toBe(1438);
  await expect(routes.nth(2)).toContainText('Export');
  await expect(routes.nth(2)).toContainText('not yet tested');
  await expect(playout).not.toContainText(/proven/i);
  await expect(playout.locator('a[href="/downloads#bridge"]')).toHaveCount(1);

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
  // The first two are the landing's own old section anchors, still linked from /docs.
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

// The two pages are generated at build from notes in the repository, so the assertions are about
// their shape, never their words: an update a week from now must pass this as written today.
for (const [width, height] of [
  [1280, 900],
  [390, 844],
]) {
  test(`What's new and the roadmap are linked, generated and fit the screen at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    const fits = () => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

    await page.goto('/');
    await expect(page.locator('footer a[href="/whats-new"]')).toHaveCount(1);
    await expect(page.locator('#free a[href="/whats-new"]')).toBeVisible();
    await expect(page.locator('#free a[href="/roadmap"]')).toBeVisible();

    await page.locator('#free a[href="/whats-new"]').click();
    await expect(page).toHaveURL(/\/whats-new$/);
    await expect(page.locator('h1')).toHaveText("What changed in NoaCG");
    const updates = page.locator('.wn-update');
    expect(await updates.count()).toBeGreaterThan(0);
    // Newest first, each headed by its date, each area one of the six a note may name.
    const dates = await updates.locator('h2 time').evaluateAll((els) => els.map((e) => e.getAttribute('datetime') ?? ''));
    expect(dates.every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))).toBe(true);
    expect([...dates].sort().reverse()).toEqual(dates);
    const areas = await page.locator('.wn-area h3').allTextContents();
    expect(areas.length).toBeGreaterThan(0);
    for (const area of areas) {
      expect(['Playout systems', 'Editor and templates', 'CLI', 'MCP server', 'AI workflows', 'NoaCG Bridge']).toContain(area);
    }
    await expect(page.locator('.wn-area li').first()).toBeVisible();
    expect(await page.content()).not.toContain('whats-new:updates');
    expect(await fits()).toBe(true);

    await page.locator('.doc-hero a[href="/roadmap"]').click();
    await expect(page).toHaveURL(/\/roadmap$/);
    await expect(page.locator('h1')).toHaveText('Where NoaCG is going');
    // Now, next and later, in that order, each holding at least one item from GOALS.
    await expect(page.locator('.rm-col')).toHaveCount(3);
    const columns = await page.locator('.rm-col').evaluateAll((els) => els.map((e) => e.id));
    expect(columns).toEqual(['now', 'next', 'later']);
    for (const id of columns) expect(await page.locator(`#${id} .rm-item`).count()).toBeGreaterThan(0);
    await expect(page.locator('#now .rm-item li').first()).toBeVisible();
    expect(await page.content()).not.toContain('roadmap:columns');
    await expect(page.locator('.doc-hero a[href="/whats-new"]')).toHaveCount(1);
    expect(await fits()).toBe(true);
  });
}

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
