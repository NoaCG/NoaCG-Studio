import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';

// THE DOWNLOADS PAGE (/downloads, downloads.html + src/downloads/). NoaCG ships two things you
// install - NoaCG Bridge and the NoaCG CLI - and a visitor has to be able to find both from the
// landing page without knowing where to look (owner, 2026-09-23).
//
// One version, two channels (docs/BRIDGE.md §6): each card resolves ITS OWN artifact - the newest
// `bridge-v*` GitHub Release for the Bridge, npm's `latest` for the CLI. Both lookups are faked
// here at the network layer, because the subject is what the page does with each answer: filter
// the Bridge by tag, link that release's exe, and stay a working page when neither answers.

const RELEASES = 'https://api.github.com/repos/NoaCG/NoaCG-Studio/releases**';
const NPM_LATEST = 'https://registry.npmjs.org/@noacg/cli/latest';

const asset = (tag: string, name: string) => ({
  name,
  browser_download_url: `https://github.com/NoaCG/NoaCG-Studio/releases/download/${tag}/${name}`,
});

/** GitHub's answer, newest first, with the traps the filter exists for: a NEWER `cli-v*` Release
 *  (like the ones left from before the split), a newer Bridge PRERELEASE, and a draft. */
const releases = [
  { tag_name: 'cli-v0.9.0', html_url: 'https://github.com/r/cli-v0.9.0', draft: false, prerelease: false, published_at: '2026-09-30T00:00:00Z', assets: [] },
  { tag_name: 'bridge-v0.6.0-preview', html_url: 'https://github.com/r/preview', draft: false, prerelease: true, published_at: '2026-09-29T00:00:00Z', assets: [asset('bridge-v0.6.0-preview', 'NoaCG-Bridge.exe')] },
  { tag_name: 'bridge-v0.5.0', html_url: 'https://github.com/r/draft', draft: true, prerelease: false, published_at: null, assets: [asset('bridge-v0.5.0', 'NoaCG-Bridge.exe')] },
  {
    tag_name: 'bridge-v0.4.1',
    html_url: 'https://github.com/NoaCG/NoaCG-Studio/releases/tag/bridge-v0.4.1',
    draft: false,
    prerelease: false,
    published_at: '2026-09-23T11:29:06Z',
    assets: [asset('bridge-v0.4.1', 'NoaCG-Bridge.exe'), asset('bridge-v0.4.1', 'NoaCG-Bridge.exe.sha256')],
  },
  { tag_name: 'bridge-v0.4.0', html_url: 'https://github.com/r/0.4.0', draft: false, prerelease: false, published_at: '2026-09-23T07:47:44Z', assets: [asset('bridge-v0.4.0', 'NoaCG-Bridge.exe')] },
];

async function fakeChannels(page: Page, answer: 'ok' | 'down'): Promise<void> {
  if (answer === 'down') {
    await page.route(RELEASES, (route) => route.abort('connectionrefused'));
    await page.route(NPM_LATEST, (route) => route.abort('connectionrefused'));
    return;
  }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  await page.route(RELEASES, (route) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(releases) }));
  // The CLI is AHEAD of the newest exe here on purpose: one version number, two channels, and a
  // CLI-only release ships no new Bridge. Each card must show its own artifact's version.
  await page.route(NPM_LATEST, (route) =>
    route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ name: '@noacg/cli', version: '0.4.2' }) }),
  );
}

test('the landing names both tools and links the Downloads page from its nav, a band and its footer', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await expect(page.locator('header nav a[href="/downloads"]')).toBeVisible();
  await expect(page.locator('footer a[href="/downloads"]')).toHaveCount(1);
  const band = page.locator('#downloads');
  await expect(band).toContainText('NoaCG Bridge');
  await expect(band).toContainText('NoaCG CLI');
  await expect(band.locator('a[href="/downloads#bridge"]')).toHaveCount(1);
  await expect(band.locator('a[href="/downloads#cli"]')).toHaveCount(1);
  // The operating section points a CasparCG user at the Bridge where the question comes up.
  await expect(page.locator('#live a[href="/downloads#bridge"]')).toHaveCount(1);

  await page.locator('header nav a[href="/downloads"]').click();
  await expect(page).toHaveURL(/\/downloads$/);
  await expect(page.locator('h1')).toHaveText('Two tools you can install');
});

test('each card resolves its own channel: the newest bridge-v* exe, and npm latest for the CLI', async ({ page }) => {
  await fakeChannels(page, 'ok');
  await page.goto('/downloads');
  const bridge = page.getByTestId('download-bridge');
  const cli = page.getByTestId('download-cli');

  // A newer cli-v* Release, a newer Bridge prerelease and a draft are all passed over.
  await expect(page.getByTestId('bridge-version')).toHaveText('0.4.1');
  await expect(bridge.getByTestId('bridge-download')).toHaveAttribute(
    'href',
    'https://github.com/NoaCG/NoaCG-Studio/releases/download/bridge-v0.4.1/NoaCG-Bridge.exe',
  );
  await expect(bridge.getByTestId('bridge-release-notes')).toHaveAttribute(
    'href',
    'https://github.com/NoaCG/NoaCG-Studio/releases/tag/bridge-v0.4.1',
  );
  // Two channels, two numbers - never one borrowed for the other.
  await expect(page.getByTestId('cli-version')).toHaveText('0.4.2');

  // What each tool is FOR, before anything about installing it.
  await expect(bridge).toContainText('CasparCG');
  await expect(bridge.getByTestId('bridge-not-needed')).toContainText('OBS, vMix');
  await expect(cli).toContainText('Claude Code');
  // The install lines are the distribution table's (docs/AGENT_CLI.md), each its own block.
  for (const command of [
    'claude plugin marketplace add NoaCG/NoaCG-Studio',
    'claude plugin install noacg@noacg-studio',
    'codex plugin add noacg@noacg-studio',
    'npx -y @noacg/cli mcp',
    'npm i -g @noacg/cli',
    'npx @noacg/cli login',
  ]) {
    await expect(cli.locator('pre', { hasText: command })).toHaveCount(1);
  }
  // The docs page's copy button rides along on every command block.
  await expect(cli.locator('.cmd-copy').first()).toBeVisible();
});

test('with neither API answering the page still downloads the newest Bridge and reads "latest"', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads#bridge');
  await expect(page.getByTestId('bridge-download')).toHaveAttribute(
    'href',
    'https://github.com/NoaCG/NoaCG-Studio/releases/latest/download/NoaCG-Bridge.exe',
  );
  await expect(page.getByTestId('bridge-version')).toHaveText('latest');
  await expect(page.getByTestId('cli-version')).toHaveText('latest');
});

test('the Bridge card says which browsers work, and what to do about one that keeps asking', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads#browsers');
  const table = page.getByTestId('bridge-browsers');
  await expect(table).toBeVisible();
  // One verdict per row, in the order a reader decides: the best, the one that works, the one that cannot.
  const rows = table.locator('tr');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Recommended');
  await expect(rows.nth(0)).toContainText('Chrome or Edge');
  await expect(rows.nth(1)).toContainText('Supported');
  await expect(rows.nth(1)).toContainText('Firefox');
  // Firefox's own words for the prompt, so a reader recognises it on screen.
  await expect(rows.nth(1)).toContainText('access other apps and services on this device');
  await expect(rows.nth(2)).toContainText('Not supported');
  await expect(rows.nth(2)).toContainText('Safari');
  // The repeated prompt on a machine that forgets everything has a named, durable fix.
  await expect(page.getByTestId('bridge-browsers-forget')).toContainText('forget site permissions');
  await expect(page.getByTestId('download-bridge')).toContainText('SkipDomains');
  await expect(page.getByTestId('download-bridge')).toContainText('LoopbackNetworkAccessAllowedForUrls');
});

test('the classroom package sits under the two tools and its zip is served from /downloads', async ({ page, request }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads#classroom');
  const card = page.getByTestId('download-classroom');
  await expect(card).toBeVisible();
  // Example material for a lesson, not a third tool: the heading still counts two tools.
  await expect(page.locator('h1')).toHaveText('Two tools you can install');
  await expect(card).toContainText('Illustrator');
  await expect(card.getByTestId('classroom-download')).toHaveAttribute('href', '/downloads/NoaCG-classroom-package.zip');
  const zip = await request.get('/downloads/NoaCG-classroom-package.zip');
  expect(zip.status()).toBe(200);
  const bytes = await zip.body();
  // A zip starts with "PK": the server did not answer with the downloads page instead.
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(bytes.length).toBeGreaterThan(100_000);
  // The zip is committed, so it can go stale: every SVG and the README in it are the repo's own.
  const zipped = await JSZip.loadAsync(bytes);
  for (const file of ['README.md', 'SVG/show-intro.svg', 'SVG/name-tag.svg', 'SVG/quiz.svg', 'SVG/score-tracker.svg', 'SVG/end-credits.svg']) {
    const inZip = await zipped.file(`NoaCG-classroom-package/${file}`)?.async('string');
    const inRepo = readFileSync(fileURLToPath(new URL(`../docs/tutorials/classroom-package/${file}`, import.meta.url)), 'utf8');
    expect(inZip?.replace(/\r\n/g, '\n'), `${file} in the zip - repack with scripts/illustrator/pack-classroom-package.mjs`).toBe(inRepo.replace(/\r\n/g, '\n'));
  }

  // The same zip is linked from the docs, beside the layer names it teaches.
  await page.goto('/docs#svg-layers');
  await expect(page.getByTestId('docs-classroom-package')).toHaveAttribute('href', '/downloads/NoaCG-classroom-package.zip');
});

test('the top bar is the landing top bar, with Downloads as the current page', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads');
  const nav = page.locator('header.top nav');
  await expect(nav.locator('a')).toHaveText(['How it works', 'Going live', 'OGraf', 'Docs', 'Downloads', 'Contact', 'Start creating']);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', '/downloads');
});
