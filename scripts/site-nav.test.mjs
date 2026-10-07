// The site's top bar and footer are one of each, the same on every public page: no page writes its own.
// guards: index.html, ograf.html, privacy.html, terms.html, docs.html, downloads.html, whats-new.html, roadmap.html, src/site-chrome.css
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  pagePath,
  renderSiteChrome,
  renderSiteFooter,
  renderSiteNav,
  SITE_FOOTER,
  SITE_FOOTER_MARKER,
  SITE_HEADER_MARKER,
  SITE_NAV,
} from './site-nav.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAGES = {
  'index.html': '/',
  'ograf.html': '/ograf',
  'privacy.html': '/privacy',
  'terms.html': '/terms',
  'docs.html': '/docs',
  'downloads.html': '/downloads',
  'whats-new.html': '/whats-new',
  'roadmap.html': '/roadmap',
};
const read = (file) => readFileSync(path.join(ROOT, file), 'utf8');
const linksOf = (html) => [...html.matchAll(/<a([^>]*)>([^<]+)<\/a>/g)].map((m) => m[2]);
const count = (html, needle) => html.split(needle).length - 1;

test('every public page takes the shared top bar and footer, and links their stylesheet first', () => {
  for (const file of Object.keys(PAGES)) {
    const html = read(file);
    assert.equal(count(html, SITE_HEADER_MARKER), 1, `${file}: needs exactly one ${SITE_HEADER_MARKER}`);
    assert.equal(count(html, SITE_FOOTER_MARKER), 1, `${file}: needs exactly one ${SITE_FOOTER_MARKER}`);
    const sheets = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(sheets[0], '/src/site-chrome.css', `${file}: link /src/site-chrome.css before its own styles`);
    assert.ok(!html.includes('<style') || html.indexOf('/src/site-chrome.css') < html.indexOf('<style'), `${file}: chrome before its <style>`);
  }
});

// THE DUPLICATION GUARD. A hand-written bar or footer is how the copies drifted before: the
// What's new page's bar, and eight footers with eight different sets of links. Every page at the
// root is checked, so a new public page that copies one in fails here too.
test('no page writes its own top bar or footer', () => {
  const siteHrefs = new Set([...SITE_NAV, ...SITE_FOOTER].map((l) => l.href).filter((h) => h.startsWith('/')));
  for (const file of readdirSync(ROOT).filter((f) => f.endsWith('.html'))) {
    const html = read(file).replace(/<!--[\s\S]*?-->/g, '');
    assert.ok(!/<footer[\s>]/.test(html), `${file}: writes its own <footer>; use ${SITE_FOOTER_MARKER}`);
    assert.ok(!/class="[^"]*\bwordmark\b/.test(html), `${file}: writes its own wordmark; use ${SITE_HEADER_MARKER}`);
    assert.ok(!/<header[^>]*class="[^"]*\btop\b/.test(html), `${file}: writes its own top bar; use ${SITE_HEADER_MARKER}`);
    // An in-page nav (the docs' section list) is fine; one that links the site's pages is a copied bar.
    for (const [, nav] of html.matchAll(/<nav[\s>]([\s\S]*?)<\/nav>/g)) {
      const hrefs = [...nav.matchAll(/href="([^"#?]+)/g)].map((m) => m[1]);
      const site = hrefs.filter((h) => h === '/' || h.startsWith('/app') || siteHrefs.has(h));
      assert.deepEqual(site, [], `${file}: a hand-written <nav> links the site's pages; use ${SITE_HEADER_MARKER}`);
    }
  }
});

test('the rendered page carries one bar and one footer, and no marker survives', () => {
  for (const [file, here] of Object.entries(PAGES)) {
    const out = renderSiteChrome(read(file), here);
    assert.equal(count(out, '<header class="top">'), 1, file);
    assert.equal(count(out, '<footer class="site">'), 1, file);
    assert.ok(!out.includes('<!--site:'), `${file}: a marker survived`);
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

test('the footer shows the same links on every page, and marks only the page you are on', () => {
  const expected = SITE_FOOTER.map((l) => l.label);
  for (const [file, here] of Object.entries(PAGES)) {
    const footer = renderSiteFooter(`/${file}`);
    assert.deepEqual(linksOf(footer), expected, file);
    const current = [...footer.matchAll(/href="([^"]+)" aria-current="page"/g)].map((m) => m[1]);
    assert.deepEqual(current, SITE_FOOTER.some((l) => l.href === here) ? [here] : [], file);
  }
  assert.match(renderSiteFooter('/docs.html'), /NoaCG Studio &middot; Documentation/);
  assert.match(renderSiteFooter('/'), /target="_blank" rel="noopener noreferrer">Source<\/a>/);
});

test('section links are anchors on the landing and point back to it from every other page', () => {
  assert.match(renderSiteNav('/'), /<a class="gh" href="#start">Create<\/a>/);
  assert.match(renderSiteNav('/whats-new'), /<a class="gh" href="\/#start">Create<\/a>/);
  assert.match(renderSiteNav('/docs.html'), /<a href="\/docs" aria-current="page">Docs<\/a>/);
  assert.equal(pagePath('/index.html'), '/');
  assert.equal(pagePath('/whats-new/?x=1'), '/whats-new');
});
