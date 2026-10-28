import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createOutputOgrafHandler, ografFileType, openBase, sealBase, OGRAF_RATE } from './outputOgraf.js';

const show = '0d8f6a3e-1111-4222-8333-944455556666';
const revision = 'c'.repeat(64);
const key = Buffer.alloc(32, 7);
let ip = 0;
const files: Record<string, string> = {
  'graphic.mjs': 'data:text/javascript;base64,' + Buffer.from('export default class X extends HTMLElement {}').toString('base64'),
  'lib/a b.mjs': 'data:,export%20const%20a%3D1',
  'page.html': 'data:,<script>alert(1)</script>',
};
function handler(over: Partial<Parameters<typeof createOutputOgrafHandler>[0]> = {}) {
  const asked: string[] = [];
  const h = createOutputOgrafHandler({
    show: async (slug, version, rev) => (slug === 'output-capability' && version === 'v1' && rev === revision ? show : null),
    file: async (s, rev, path) => {
      asked.push(path);
      return s === show && rev === revision ? (files[path] ?? null) : null;
    },
    key: () => key,
    ...over,
  });
  return { h, asked };
}
const post = (body: unknown, token = 'output-capability') =>
  new Request('https://noacg.studio/api/output/assets?ograf', { method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-for': `198.51.100.${++ip % 250}`, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
const get = (sealed: string, path: string) =>
  new Request(`https://noacg.studio/api/output/assets?ograf=${encodeURIComponent(sealed)}&path=${encodeURIComponent(path)}`, { headers: { 'x-forwarded-for': `203.0.113.${++ip % 250}` } });

test('a sealed base names the production and revision to this key alone, and names neither in the clear', () => {
  const sealed = sealBase(key, show, revision);
  assert.deepEqual(openBase(key, sealed), { show, revision });
  assert.ok(!sealed.includes(show) && !sealed.includes(revision) && !Buffer.from(sealed, 'base64').toString('latin1').includes(show));
  assert.match(sealed, /^[A-Za-z0-9_-]+$/);
  assert.notEqual(sealBase(key, show, revision), sealed, 'a fresh IV each time');
  assert.equal(openBase(Buffer.alloc(32, 8), sealed), null, 'another key reads nothing');
  // One flipped character anywhere is refused by the tag.
  for (const at of [0, 20, sealed.length - 1]) {
    const flipped = sealed.slice(0, at) + (sealed[at] === 'A' ? 'B' : 'A') + sealed.slice(at + 1);
    assert.equal(openBase(key, flipped), null);
  }
  assert.equal(openBase(key, ''), null);
  assert.equal(openBase(key, 'a'.repeat(257)), null);
  assert.equal(openBase(key, '../x'), null);
});

test('the output capability gets a sealed base only for a revision its published version holds', async () => {
  const { h } = handler();
  const ok = await h(post({ version: 'v1', revision }));
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('cache-control'), 'no-store');
  const { base } = (await ok.json()) as { base: string };
  assert.match(base, /^\/ograf\/[A-Za-z0-9_-]+\/$/);
  assert.deepEqual(openBase(key, base.slice(7, -1)), { show, revision });
  assert.equal((await h(post({ version: 'v1', revision }, 'operator-capability'))).status, 403);
  assert.equal((await h(post({ version: 'v0', revision }))).status, 403);
  assert.equal((await h(post({ version: 'v1', revision: 'd'.repeat(64) }))).status, 403);
  assert.equal((await h(post({ version: 'v1', revision }, ''))).status, 401);
  assert.equal((await h(post({ version: 'v1', revision: '../x' }))).status, 400);
  assert.equal((await h(post({ version: 'x'.repeat(129), revision }))).status, 400);
  assert.equal((await handler({ key: () => null }).h(post({ version: 'v1', revision }))).status, 503);
  assert.equal((await handler({ show: async () => { throw new Error('down'); } }).h(post({ version: 'v1', revision }))).status, 503);
});

test('a file is served only by exact path, cross-origin, never as a document of this origin', async () => {
  const { h, asked } = handler();
  const sealed = sealBase(key, show, revision);
  const js = await h(get(sealed, 'graphic.mjs'));
  assert.equal(js.status, 200);
  assert.equal(await js.text(), 'export default class X extends HTMLElement {}');
  assert.equal(js.headers.get('content-type'), 'text/javascript; charset=utf-8');
  assert.equal(js.headers.get('access-control-allow-origin'), '*');
  assert.equal(js.headers.get('x-content-type-options'), 'nosniff');
  assert.match(js.headers.get('content-security-policy') ?? '', /^sandbox;/);
  assert.equal(js.headers.get('location'), null);
  // A space, as the router may hand it on escaped.
  assert.equal(await (await h(get(sealed, 'lib/a%20b.mjs'))).text(), 'export const a=1');
  // A page goes out as text.
  assert.equal((await h(get(sealed, 'page.html'))).headers.get('content-type'), 'text/plain; charset=utf-8');
  // Nothing outside the list, however it is spelt, and nothing for a base this key did not seal.
  for (const path of ['../graphic.mjs', '%2e%2e%2fgraphic.mjs', 'lib/../graphic.mjs', '/graphic.mjs', 'GRAPHIC.mjs', '', 'x\0y', 'a'.repeat(513)]) {
    assert.equal((await h(get(sealed, path))).status, 404, path);
  }
  assert.equal((await h(get(sealBase(Buffer.alloc(32, 9), show, revision), 'graphic.mjs'))).status, 404);
  assert.equal((await h(get(sealBase(key, show, 'd'.repeat(64)), 'graphic.mjs'))).status, 404);
  assert.ok(!asked.includes('a'.repeat(513)) && !asked.includes(''), 'refused before any read');
  assert.equal((await handler({ key: () => null }).h(get(sealed, 'graphic.mjs'))).status, 404);
  assert.equal((await handler({ file: async () => { throw new Error('down'); } }).h(get(sealed, 'graphic.mjs'))).status, 503);
  assert.equal((await h(new Request('https://noacg.studio/api/output/assets?ograf=x', { method: 'PUT' }))).status, 405);
});

test('types: modules as JavaScript, pages as text, the unknown as bytes', () => {
  assert.equal(ografFileType('a/b.MJS'), 'text/javascript; charset=utf-8');
  assert.equal(ografFileType('x.htm'), 'text/plain; charset=utf-8');
  assert.equal(ografFileType('x.xhtml'), 'application/octet-stream');
  assert.equal(ografFileType('noext'), 'application/octet-stream');
});

test('the rate is bounded per address', async () => {
  const { h } = handler();
  const sealed = sealBase(key, show, revision);
  const from = () => new Request(`https://noacg.studio/api/output/assets?ograf=${sealed}&path=graphic.mjs`, { headers: { 'x-forwarded-for': '192.0.2.77' } });
  for (let i = 0; i < OGRAF_RATE.max; i += 1) assert.equal((await h(from())).status, 200);
  assert.equal((await h(from())).status, 429);
});
