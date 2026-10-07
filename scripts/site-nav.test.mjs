// The site's top bar is one list, the same on every page that carries it: no page writes its own.
// guards: index.html, docs.html, downloads.html, whats-new.html, roadmap.html
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { pagePath, renderSiteNav, SITE_NAV } from './site-nav.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = { 'index.html': '/', 'docs.html': '/docs', 'downloads.html': '/downloads', 'whats-new.html': '/whats-new', 'roadmap.html': '/roadmap' };

const linksOf = (html) => [...html.matchAll(/<a([^>]*)>([^<]+)<\/a>/g)].map((m) => m[2]);

test('every page with the landing header takes the shared top bar, and writes none of its own', () => {
  for (const file of Object.keys(PAGES)) {
    const html = readFileSync(path.join(ROOT, file), 'utf8');
    const header = /<header[^>]*>([\s\S]*?)<\/header>/.exec(html)?.[1] ?? '';
    assert.ok(header.includes('<!--site:nav-->'), `${file}: its header has no <!--site:nav--> marker`);
    assert.ok(!/<nav[\s>]/.test(header), `${file}: its header writes its own <nav>; use the marker`);
  }
});

test('the top bar shows the same links on every page, and marks only the page you are on', () => {
  const expected = [...SITE_NAV.map((l) => l.label), 'Start creating'];
  for (const [file, here] of Object.entries(PAGES)) {
    const nav = renderSiteNav(`/${file}`);
    assert.deepEqual(linksOf(nav), expected, file);
    const current = [...nav.matchAll(/href="([^"]+)" aria-current="page"/g)].map((m) => m[1]);
    assert.deepEqual(current, SITE_NAV.some((l) => l.href === here) ? [here] : [], file);
  }
  assert.ok(!SITE_NAV.some((l) => l.href === '/roadmap'), 'the roadmap stays out of the top bar for now (owner, 2026-10-07)');
});

test('section links are anchors on the landing and point back to it from every other page', () => {
  assert.match(renderSiteNav('/'), /<a class="gh" href="#start">Create<\/a>/);
  assert.match(renderSiteNav('/whats-new'), /<a class="gh" href="\/#start">Create<\/a>/);
  assert.match(renderSiteNav('/docs.html'), /<a href="\/docs" aria-current="page">Docs<\/a>/);
  assert.equal(pagePath('/index.html'), '/');
  assert.equal(pagePath('/whats-new/?x=1'), '/whats-new');
});
