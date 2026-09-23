// Guards for the prerender emitter (scripts/prerender.mjs). Everything pinned here fails
// SILENTLY in production - a wrong namespace, an unescaped quote or a shifting URL all
// produce a file that looks fine and is worthless - so none of it is covered by the build
// merely succeeding.

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appLink, assignSlugs, pageSlug, setStyleLabels, sitemap, templatePage } from './prerender.mjs';

const variant = (over = {}) => ({
  id: 'lt01',
  category: 'lower-third',
  name: 'Name Strap',
  styleTag: 'minimal',
  description: 'A clean two-line name strap.',
  maxLines: 2,
  suggestedLines: [{}, {}],
  logo: 'none',
  animationPresets: ['slide-in'],
  ...over,
});

test('the sitemap declares the sitemaps.org namespace', () => {
  const xml = sitemap([{ slug: 'name-strap', variant: variant() }]);
  // The plural is the protocol namespace; "sitemap.org" is discarded wholesale by crawlers.
  assert.match(xml, /xmlns="http:\/\/www\.sitemaps\.org\/schemas\/sitemap\/0\.9"/);
  assert.doesNotMatch(xml, /www\.sitemap\.org/);
  // Landing + editor + the docs home + the OGraf starters page + Downloads + every template.
  assert.equal((xml.match(/<url>/g) ?? []).length, 6);
  assert.match(xml, /<loc>https:\/\/noacg\.studio\/docs<\/loc>/);
  assert.match(xml, /<loc>https:\/\/noacg\.studio\/ograf<\/loc>/);
  assert.match(xml, /<loc>https:\/\/noacg\.studio\/downloads<\/loc>/);
});

test('slugs are readable, unique, and stable against a later addition', () => {
  assert.equal(pageSlug('Name Strap — Bold!'), 'name-strap-bold');
  assert.equal(pageSlug('///'), 'template');

  const first = assignSlugs([variant(), variant({ id: 'lt02', name: 'Score Bug' })]);
  assert.deepEqual(first.map((entry) => entry.slug), ['name-strap', 'score-bug']);

  // A THIRD design colliding on name must not renumber the two that already shipped: the
  // collision suffix is the variant id, never a counter.
  const second = assignSlugs([
    variant(),
    variant({ id: 'lt02', name: 'Score Bug' }),
    variant({ id: 'lt03', name: 'Score Bug' }),
  ]);
  assert.equal(second.find((entry) => entry.variant.id === 'lt01').slug, 'name-strap');
  assert.deepEqual(
    second.filter((entry) => entry.slug.startsWith('score-bug')).map((entry) => entry.slug).sort(),
    ['score-bug-lt02', 'score-bug-lt03'],
  );
});

test('catalog text is escaped into every place it lands', () => {
  const html = templatePage({
    slug: 'quote-card',
    variant: variant({
      name: 'Quote "Card" & Co',
      description: 'Shows a <script>alert(1)</script> quote.',
    }),
  });
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /&lt;script&gt;/);
  // The name reaches a title, an h1 and an og:title - the ATTRIBUTE ones are where a raw
  // quote would break out of the markup.
  assert.match(html, /<meta property="og:title" content="Quote &quot;Card&quot; &amp; Co - NoaCG Studio" \/>/);
});

test('every page carries the metadata a crawler and a share card need', () => {
  const html = templatePage({ slug: 'name-strap', variant: variant() });
  for (const needle of [
    '<title>',
    'name="description"',
    'rel="canonical"',
    'property="og:title"',
    'property="og:description"',
    'property="og:image"',
    'href="/app#/new/lt01"',
  ]) {
    assert.ok(html.includes(needle), `missing ${needle}`);
  }
  // The page must say something true about the design, not just boilerplate.
  assert.match(html, /A clean two-line name strap\./);
  assert.match(html, /up to 2 text lines/);
});

test('the CTA and footer link both open the wizard with this design preselected', () => {
  // #/new/<variantId> (src/app/router.ts) opens the creation wizard straight onto this
  // design's Fields step - never the generic /app entry a visitor would have to re-search
  // the catalog from (docs/PRERENDER.md).
  assert.equal(appLink(variant()), '/app#/new/lt01');
  // A variant id shaped like a URL-hostile string still round-trips through one segment.
  assert.equal(appLink(variant({ id: 'score/bug lt02' })), '/app#/new/score%2Fbug%20lt02');

  const html = templatePage({ slug: 'name-strap', variant: variant() });
  assert.equal((html.match(/href="\/app#\/new\/lt01"/g) ?? []).length, 2);
});

test('a data-driven design says so instead of claiming zero text lines', () => {
  const html = templatePage({
    slug: 'results-board',
    variant: variant({ maxLines: 0, suggestedLines: [], logo: 'none' }),
  });
  assert.match(html, /Data-driven - no free text lines\./);
});

test('the public page prints the display label for a style family, never the stored id', () => {
  // `noacg` is an internal tag; a marketing page showing it leaks the data model at exactly
  // the moment a stranger is deciding whether this looks professional.
  setStyleLabels({ noacg: 'Bold & on-air' });
  const html = templatePage({ slug: 'house-strap', variant: variant({ styleTag: 'noacg' }) });
  assert.match(html, /Bold &amp; on-air/);
  assert.doesNotMatch(html, /<dd>noacg<\/dd>/);

  // A family with no label yet still reads sanely rather than rendering "undefined".
  setStyleLabels({});
  const bare = templatePage({ slug: 'x', variant: variant({ styleTag: 'brand-new' }) });
  assert.match(bare, /<dd>brand new<\/dd>/);
});
