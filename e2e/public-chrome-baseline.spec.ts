// covers: src/site-chrome.css, src/brandTokens.css, ograf.html, scripts/site-nav.mjs

import { test, expect } from '@playwright/test';

// THE PUBLIC PAGES' CHROME AS PICTURES. Every public page draws the same top bar and footer from
// src/site-chrome.css, whose colours and faces come from src/brandTokens.css, the app's tokens
// too. A token changed for the app, or a page stylesheet that outranks a chrome rule, repaints
// the chrome on one page and leaves the others alone; the role specs (landing, legal) check what
// the chrome links to, and these check what it looks like. /ograf is pinned whole as well: its
// palette is the site's (decided with a design review when the chrome moved onto the brand
// tokens), and it is the one page whose own colours used to share names with the app's.
//
// Only the chrome is pinned elsewhere, so a copy edit on a page never touches these pictures.
//
// Baselines are per platform, because fonts rasterise differently. Only the `-win32` set is
// recorded so far; until the `-linux` set exists, the spec runs on Windows only. To record either:
//
//   npx playwright test e2e/public-chrome-baseline.spec.ts --update-snapshots    # -win32, locally
//   gh workflow run rerecord-screenshots.yml --ref <branch> -f spec=public-chrome-baseline.spec.ts

test.skip(process.platform !== 'win32', 'only the -win32 baselines are recorded so far');

const PAGES = ['/', '/docs', '/downloads', '/ograf', '/privacy', '/terms', '/roadmap', '/whats-new'];
const SIZES = [
  { label: 'desktop', width: 1366, height: 768 },
  { label: 'phone', width: 390, height: 844 },
] as const;

for (const size of SIZES) {
  for (const path of PAGES) {
    const name = path === '/' ? 'index' : path.slice(1);
    test(`${name} chrome at ${size.label}`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.goto(path);
      await page.evaluate(() => document.fonts.ready);
      await expect(page.locator('header.top')).toHaveScreenshot(`${name}-header-${size.label}.png`);
      await expect(page.locator('footer.site')).toHaveScreenshot(`${name}-footer-${size.label}.png`);
    });
  }

  test(`ograf page at ${size.label}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/ograf');
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot(`ograf-${size.label}.png`);
  });
}
