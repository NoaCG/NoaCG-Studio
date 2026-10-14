// covers: src/site-chrome.css, src/brandCore.css, ograf.html, scripts/site-nav.mjs
// covers: {index,privacy,terms,docs,downloads,whats-new,roadmap}.html, src/legal.css, src/docs/**, src/downloads/**, src/landing/updates.css, docs/whats-new/**, docs/GOALS.md

import { existsSync } from 'node:fs';
import { test, expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { SITE_PAGES } from '../scripts/site-nav.mjs';

// THE PUBLIC PAGES' CHROME AS PICTURES. Every public page draws the same top bar and footer from
// src/site-chrome.css, whose colours and faces are the brand's (src/brandCore.css, which the app
// reads too). A brand value changed for the app, or a page stylesheet that outranks a chrome rule,
// repaints the chrome on one page and leaves the others alone; the role specs (landing, legal)
// check what the chrome links to, and these check what it looks like. /ograf is pinned whole too,
// its live starter previews masked, because its palette is the site's rather than its own.
//
// Baselines are per platform, because fonts rasterise differently. A platform with no recorded
// picture skips that test instead of failing, so the `-linux` set can be recorded on a runner:
//
//   npx playwright test e2e/public-chrome-baseline.spec.ts --update-snapshots    # -win32, locally
//   gh workflow run rerecord-screenshots.yml --ref <branch> -f spec=public-chrome-baseline.spec.ts

const SIZES = [
  { label: 'desktop', width: 1366, height: 768 },
  { label: 'phone', width: 390, height: 844 },
] as const;

function skipUnrecorded(testInfo: TestInfo, ...names: string[]): void {
  const updating = testInfo.config.updateSnapshots === 'all' || testInfo.config.updateSnapshots === 'changed';
  const missing = names.some((name) => !existsSync(testInfo.snapshotPath(name)));
  test.skip(missing && !updating, `no ${process.platform} baseline recorded yet`);
}

async function open(page: Page, path: string, size: (typeof SIZES)[number]): Promise<void> {
  await page.setViewportSize({ width: size.width, height: size.height });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(path);
  await page.evaluate(() => document.fonts.ready);
}

// The footer sits below the page's own content, whose height ends in a fraction of a pixel that
// changes with every edit to that content, and the footer picture rasterises differently at each
// fraction (#1190 lengthened /docs and /privacy and both footers failed, chrome untouched). Moving
// it down to the next whole pixel leaves only its own height deciding where it lands. A relative
// offset, because a larger top margin can collapse into the margin of the content above it.
async function snapToWholePixel(footer: Locator): Promise<void> {
  await footer.evaluate((el) => {
    const fraction = (el.getBoundingClientRect().top + window.scrollY) % 1;
    if (fraction) Object.assign(el.style, { position: 'relative', top: `${1 - fraction}px` });
  });
}

for (const size of SIZES) {
  for (const [path, { file }] of Object.entries(SITE_PAGES)) {
    const name = file.replace(/\.html$/, '');
    test(`${name} chrome at ${size.label}`, async ({ page }, testInfo) => {
      const header = `${name}-header-${size.label}.png`;
      const footer = `${name}-footer-${size.label}.png`;
      skipUnrecorded(testInfo, header, footer);
      await open(page, path, size);
      await expect(page.locator('header.top')).toHaveScreenshot(header);
      await snapToWholePixel(page.locator('footer.site'));
      await expect(page.locator('footer.site')).toHaveScreenshot(footer);
    });
  }

  test(`ograf page at ${size.label}`, async ({ page }, testInfo) => {
    const shot = `ograf-${size.label}.png`;
    skipUnrecorded(testInfo, shot);
    await open(page, '/ograf', size);
    await expect(page).toHaveScreenshot(shot, { mask: [page.locator('.preview iframe')] });
  });
}
