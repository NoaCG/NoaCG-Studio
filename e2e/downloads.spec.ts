// The public Downloads page (downloads.html + src/downloads/): NoaCG Bridge and the NoaCG CLI.
// It borrows the docs stylesheet and copy buttons, and the landing links it from its nav, a band
// and its footer, so both of those specs ride along. public/downloads/ holds the SVG examples
// zip the page links, and downloads.spec.ts fetches it.
// covers: {downloads.html,src/downloads/**,public/downloads/**}
//
// THE SVG EXAMPLES (docs/tutorials/svg-examples/) are a fixture set: e2e/svg-examples.spec.ts
// imports their SVG/ files, so the ignore in scripts/e2e-affected.mjs carves the folder out, and
// downloads.spec.ts rides along because it checks the committed zip still holds these files.
// covers: docs/tutorials/svg-examples/**
//
// THE LANDING PAGE (index.html + src/landing/) carries the ways into this page - its nav, the
// per-section download links, the footer - and the tests below assert them. Without this line a
// landing change planned landing.spec.ts alone and broke main here (PR #477, reverted by #479).
// covers: src/landing/**, index.html
//
// THE CODING-AGENT PROMPT (scripts/agent-prompt.mjs) is rendered into this page at build, so a
// change to its text or to the CLI version it names rides along here.
// covers: scripts/agent-prompt.mjs, cli/package.json

import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import JSZip from 'jszip';
import { SVG_EXAMPLES_URL, SVG_EXAMPLES_ZIP_URL } from '../src/downloads/links';
import { AGENT_PROMPT } from '../scripts/agent-prompt.mjs';

/** The inventory is also checked against the live behavior registry and real source assets. */
const EXAMPLE_INVENTORY = JSON.parse(readFileSync(new URL('../docs/tutorials/svg-examples/examples.json', import.meta.url), 'utf8')) as { slug: string; preview: string }[];
const EXAMPLES = EXAMPLE_INVENTORY.map((entry) => entry.slug);

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

async function fakeChannels(page: Page, answer: 'ok' | 'down', answered: unknown[] = releases): Promise<void> {
  if (answer === 'down') {
    await page.route(RELEASES, (route) => route.abort('connectionrefused'));
    await page.route(NPM_LATEST, (route) => route.abort('connectionrefused'));
    return;
  }
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  await page.route(RELEASES, (route) => route.fulfill({ status: 200, headers: cors, body: JSON.stringify(answered) }));
  // The CLI is AHEAD of the newest exe here on purpose: one version number, two channels, and a
  // CLI-only release ships no new Bridge. Each card must show its own artifact's version.
  await page.route(NPM_LATEST, (route) =>
    route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ name: '@noacg/cli', version: '0.4.2' }) }),
  );
}

test('the landing names both tools and links each download where it is introduced, plus its nav and footer', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto('/');
  await expect(page.locator('header nav a[href="/downloads"]')).toBeVisible();
  await expect(page.locator('footer a[href="/downloads"]')).toHaveCount(1);
  // The short landing has no separate downloads band: each tool's download sits in the section
  // that introduces it, so a visitor meets the link where the question comes up.
  const playout = page.locator('#playout');
  await expect(playout).toContainText('NoaCG Bridge');
  await expect(playout.locator('a[href="/downloads#bridge"]')).toBeVisible();
  const agents = page.locator('#agents');
  await expect(agents).toContainText('NoaCG CLI');
  await expect(agents.locator('a[href="/downloads#cli"]')).toBeVisible();

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
  // One Bridge: the download. A command line here would run the Bridge inside the newest CLI,
  // which can be newer than the release the button offers.
  await expect(bridge.locator('pre')).toHaveCount(0);
  await expect(cli).toContainText('Claude Code');
  // The install lines are the distribution table's (docs/AGENT_CLI.md), each its own block.
  // Claude Code's is the one-command form a session accepts since 2.1.275 (Codex has none).
  for (const command of [
    '/plugin install noacg --marketplace NoaCG/NoaCG-Studio',
    'codex plugin marketplace add NoaCG/NoaCG-Studio',
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

test('a Bridge release whose exe carries its version is the one offered, with its own checksum', async ({ page }) => {
  const versioned = {
    tag_name: 'bridge-v0.6.1',
    html_url: 'https://github.com/NoaCG/NoaCG-Studio/releases/tag/bridge-v0.6.1',
    draft: false,
    prerelease: false,
    published_at: '2026-10-05T09:00:00Z',
    assets: [asset('bridge-v0.6.1', 'NoaCG-Bridge-0.6.1.exe'), asset('bridge-v0.6.1', 'NoaCG-Bridge-0.6.1.exe.sha256')],
  };
  await fakeChannels(page, 'ok', [versioned, ...releases]);
  await page.goto('/downloads');
  await expect(page.getByTestId('bridge-version')).toHaveText('0.6.1');
  const base = 'https://github.com/NoaCG/NoaCG-Studio/releases/download/bridge-v0.6.1';
  await expect(page.getByTestId('bridge-download')).toHaveAttribute('href', `${base}/NoaCG-Bridge-0.6.1.exe`);
  await expect(page.locator('[data-checksum="bridge"]')).toHaveAttribute('href', `${base}/NoaCG-Bridge-0.6.1.exe.sha256`);
});

test('with neither API answering the page still downloads the newest Bridge and reads "latest"', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads#bridge');
  await expect(page.getByTestId('bridge-download')).toHaveAttribute(
    'href',
    'https://github.com/NoaCG/NoaCG-Studio/releases/latest',
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

test('the SVG examples sit under the two tools and their zip is served from /downloads', async ({ page, request }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads#svg-examples');
  const card = page.getByTestId('download-svg-examples');
  await expect(card).toBeVisible();
  // Example files, not a third tool: the heading still counts two tools.
  await expect(page.locator('h1')).toHaveText('Two tools you can install');
  await expect(card).toContainText('Illustrator');
  await expect(card.getByTestId('svg-examples-download')).toHaveAttribute('href', SVG_EXAMPLES_ZIP_URL);
  // The anchor a later surface (the Import step) links to is this card.
  expect(SVG_EXAMPLES_URL).toBe('/downloads#svg-examples');
  const zip = await request.get(SVG_EXAMPLES_ZIP_URL);
  expect(zip.status()).toBe(200);
  const bytes = await zip.body();
  // A zip starts with "PK": the server did not answer with the downloads page instead.
  expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(bytes.length).toBeGreaterThan(100_000);
  // The zip is committed, so it can go stale: every SVG and the README in it are the repo's own,
  // and it holds an Illustrator file for each.
  const zipped = await JSZip.loadAsync(bytes);
  for (const file of ['README.md', 'examples.json', ...EXAMPLES.map((name) => `SVG/${name}.svg`)]) {
    const inZip = await zipped.file(`NoaCG-SVG-examples/${file}`)?.async('string');
    const inRepo = readFileSync(fileURLToPath(new URL(`../docs/tutorials/svg-examples/${file}`, import.meta.url)), 'utf8');
    expect(inZip?.replace(/\r\n/g, '\n'), `${file} in the zip - repack with scripts/illustrator/pack-svg-examples.mjs`).toBe(inRepo.replace(/\r\n/g, '\n'));
  }
  for (const file of ['README.pdf', ...EXAMPLE_INVENTORY.flatMap((entry) => [`Illustrator/${entry.slug}.ai`, `Previews/${entry.preview}.png`])]) {
    const native = zipped.file(`NoaCG-SVG-examples/${file}`);
    expect(native, `${file} in the zip`).not.toBeNull();
    expect(await native!.async('nodebuffer'), `${file} is the verified source artifact`).toEqual(readFileSync(new URL(`../docs/tutorials/svg-examples/${file}`, import.meta.url)));
  }

  // The same zip is linked from the docs, beside the layer names it teaches.
  await page.goto('/docs#svg-layers');
  await expect(page.getByTestId('docs-svg-examples')).toHaveAttribute('href', SVG_EXAMPLES_ZIP_URL);
  const gallery = page.locator('#svg-example-files + p + ul');
  await expect(gallery.locator('a[download]')).toHaveCount(EXAMPLES.length);
  for (const name of EXAMPLES) {
    await expect(gallery.locator(`a[href="/docs/examples/svg-examples/${name}.svg"]`)).toHaveCount(1);
    const response = await request.get(`/docs/examples/svg-examples/${name}.svg`);
    expect(response.status(), `${name} public SVG`).toBe(200);
  }
});

test('the top bar is the landing top bar, with Downloads as the current page', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads');
  const nav = page.locator('header.top nav');
  await expect(nav.locator('a')).toHaveText(['Create', 'Play or export', 'OGraf', "What's new", 'Docs', 'Downloads', 'Start creating']);
  await expect(nav.locator('a[aria-current="page"]')).toHaveAttribute('href', '/downloads');
});

// THE PROMPT LEADS THE CLI CARD (docs/work-specs/agent-delivery/spec.md AC-2). Owner, 2026-10-15:
// one short prompt a person pastes into the agent session they already have open, with nothing
// installed first; the plugin is optional, below it. The words, the 80-word limit and the pinned
// version are scripts/agent-prompt.test.mjs's; this is what a reader gets: the block before the
// plugin lines, readable at every width, and a Copy button that puts the whole prompt on the
// clipboard.
test('the CLI card leads with one short prompt that copies whole and reads at every width', async ({ page, context }) => {
  await fakeChannels(page, 'down');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/downloads#cli-prompt');
  const cli = page.getByTestId('download-cli');
  const prompt = cli.getByTestId('agent-prompt');
  await expect(prompt).toHaveText(AGENT_PROMPT);
  // What it needs stays on the card, and the plugin is the optional route after the prompt.
  await expect(cli.getByTestId('cli-needs')).toContainText('Node.js 20 or newer, and Chrome or Edge');
  const before = (a: string, b: string) =>
    cli.evaluate((card, [x, y]) => {
      const first = card.querySelector(x);
      const second = Array.from(card.querySelectorAll('pre')).find((pre) => pre.textContent?.includes(y));
      return Boolean(first && second && first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING);
    }, [a, b]);
  expect(await before('[data-testid="agent-prompt"]', '/plugin install noacg')).toBe(true);
  expect(await before('[data-testid="agent-prompt"]', 'codex plugin add')).toBe(true);

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await prompt.scrollIntoViewIfNeeded();
    await expect(prompt, `the prompt at ${width}px`).toBeInViewport();
    // Prose wraps inside the block: no sideways scroll in it, and none on the page.
    const fit = await prompt.evaluate((el) => ({
      block: el.scrollWidth - el.clientWidth,
      page: document.documentElement.scrollWidth - window.innerWidth,
    }));
    expect(fit, `nothing scrolls sideways at ${width}px`).toEqual({ block: 0, page: 0 });
  }

  // src/docs/docs.ts wraps the block in `.cmd` and puts its Copy button beside it.
  const copy = prompt.locator('xpath=..').locator('.cmd-copy');
  await copy.click();
  await expect(copy).toHaveText('Copied');
  const clipboard = await page.evaluate(() => navigator.clipboard.readText());
  expect(clipboard.trim()).toBe(AGENT_PROMPT);
});

// THE INSTALL LINES READ IN FULL (#1265). A card is half the page wide, so at 1440px the
// `/plugin install` line was longer than its block, scrolled sideways, and ran its end under the
// block's Copy button. Every command block on the page now wraps inside itself, clear of its
// button, at a desktop, a tablet and a phone width.
test('no command runs under its Copy button, and none scrolls sideways, at any width', async ({ page }) => {
  await fakeChannels(page, 'down');
  await page.goto('/downloads#cli');
  const plugin = page.locator('.dl-card .cmd', { hasText: '/plugin install noacg' });
  await expect(plugin.locator('.cmd-copy')).toBeVisible();

  for (const width of [1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const fit = await page.evaluate(() => {
      const clashes: string[] = [];
      for (const shell of Array.from(document.querySelectorAll<HTMLElement>('.dl-card .cmd'))) {
        const pre = shell.querySelector('pre');
        const text = shell.querySelector('pre code')?.getBoundingClientRect();
        const copy = shell.querySelector('.cmd-copy')?.getBoundingClientRect();
        if (!pre || !text || !copy) continue;
        const under = text.left < copy.right && copy.left < text.right && text.top < copy.bottom && copy.top < text.bottom;
        const scrolls = pre.scrollWidth > pre.clientWidth;
        if (under || scrolls) clashes.push(`${pre.innerText.slice(0, 40)}${under ? ' runs under its Copy' : ''}${scrolls ? ' scrolls' : ''}`);
      }
      return { clashes, page: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(fit, `at ${width}px`).toEqual({ clashes: [], page: 0 });
  }
  // The wrap is visual only: the plugin line is still one line of text, so it copies as one command.
  expect(await plugin.locator('pre').evaluate((pre) => pre.innerText.trim())).toBe(
    '/plugin install noacg --marketplace NoaCG/NoaCG-Studio',
  );
});
