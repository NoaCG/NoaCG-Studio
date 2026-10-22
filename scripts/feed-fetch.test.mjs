// guards: api/_lib/feedFetch.ts, api/data/[...path].ts
//
// THE NEWS FEED READER (docs/work-specs/data-sources/spec.md, phase C4; AC-5, AC-6), run in Node
// against the real module with a fake resolver, connection, cache and clock.
//
// What is pinned. The guard: only http and https on their own ports and without credentials; a
// name is resolved and every answer must be public (private, loopback, link-local and the cloud
// metadata addresses refused, in IPv4 and IPv6, mapped forms included); the connection goes to the
// address that was checked, so a name that answers public and then private is never connected to
// privately; every redirect is checked the same way and at most five are followed; the body stops
// at 5 MB and the read at 10 seconds. The headlines: RSS and Atom titles as plain text from the
// six fixtures Q captured (evidence/feeds.md) - entities, CDATA and escaped markup - each item once
// by id or link, newest 20, at most 300 characters. Politeness: one read per address for every
// reader through the shared `feed_cache` row, fetched no more often than every 5 minutes, later
// when the feed asks and never later than an hour; the row's ETag and Last-Modified go back as a
// conditional request and a 304 keeps the headlines; one instance takes the claim on a stale row
// with a conditional update and two readers at once make one upstream fetch; a claim lapses after
// 20 seconds; a failed fetch keeps the last good headlines and says since when. The route: one
// client is refused after 30 reads a minute.
//
// Every limit is pinned by behaviour at its edge (the value passes, one past it fails), never by
// reading the constant back, so changing a limit turns a test red.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { after, before, mock, test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import './lib/tsResolve.mjs';
import { buildApiRuntime } from './api-runtime-build.mjs';

const { feedKey, guardedFetch, nodeFeedNet, normalizeFeedAddress, parseFeed, publicAddress, readFeed } = await import('../api/_lib/feedFetch.ts');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fixture = (name) => readFileSync(path.join(root, 'docs/work-specs/data-sources/evidence/feeds', name), 'utf8');

const MIN = 60_000;
const T0 = Date.parse('2026-10-22T12:00:00.000Z');

// ── Fakes ─────────────────────────────────────────────────────────────────────

/** A body in chunks of at most 64 KB. */
async function* chunks(bytes) {
  for (let at = 0; at < bytes.length; at += 65_536) yield bytes.subarray(at, at + 65_536);
}

const reply = (status, body = '', headers = {}) => {
  const bytes = typeof body === 'string' ? new TextEncoder().encode(body) : body;
  let cancelled = false;
  return {
    status,
    headers,
    body: chunks(bytes),
    cancel: () => {
      cancelled = true;
    },
    get cancelled() {
      return cancelled;
    },
  };
};

/**
 * A network: `dns` maps a host to its answers (an array, or a function of the lookup's number for
 * that host), `serve` answers a request. Every lookup and request is recorded.
 */
function fakeNet(dns, serve) {
  const lookups = [];
  const requests = [];
  return {
    lookups,
    requests,
    lookup: async (host) => {
      const n = lookups.filter((h) => h === host).length;
      lookups.push(host);
      const answer = typeof dns[host] === 'function' ? dns[host](n) : dns[host];
      if (!answer) throw Object.assign(new Error('not found'), { code: 'ENOTFOUND' });
      return answer.map((address) => ({ address, family: address.includes(':') ? 6 : 4 }));
    },
    request: async ({ url, address, headers, signal }) => {
      requests.push({ url: url.href, address, headers: { ...headers } });
      return serve({ url, address, headers, signal, n: requests.length });
    },
  };
}

const PUBLIC = '93.184.215.14';
const RSS = (titles, extra = '') =>
  `<?xml version="1.0"?><rss version="2.0"><channel><title>T</title>${extra}${titles
    .map((t, i) => `<item><title>${t}</title><guid>id-${i}</guid><link>https://news.example/${i}</link></item>`)
    .join('')}</channel></rss>`;

/** The shared cache as Postgres keeps it: the claim is a conditional update. */
function fakeStore() {
  const rows = new Map();
  return {
    rows,
    get: async (key) => (rows.has(key) ? structuredClone(rows.get(key)) : null),
    create: async (row) => {
      if (rows.has(row.key)) return false;
      rows.set(row.key, structuredClone(row));
      return true;
    },
    claim: async (key, now, until) => {
      const row = rows.get(key);
      if (!row || !(row.claimed_until < now) || !(row.next_allowed_at <= now)) return false;
      row.claimed_until = until;
      return true;
    },
    save: async (key, patch) => {
      rows.set(key, { ...rows.get(key), ...structuredClone(patch) });
    },
    prune: async (before) => {
      for (const [key, row] of rows) if (row.next_allowed_at < before && row.claimed_until < before) rows.delete(key);
    },
  };
}

function io(net, store = fakeStore(), clock = { t: T0 }) {
  return { net, store, clock, now: () => clock.t, sleep: async (ms) => void (clock.t += ms) };
}

const ok = (net, address = 'https://news.example/feed.xml') => guardedFetch(address, { etag: null, lastModified: null }, net, new AbortController().signal);

// ── The address ───────────────────────────────────────────────────────────────

test('only http and https addresses on their own ports, without credentials, are read', () => {
  assert.deepEqual(normalizeFeedAddress(' https://news.example/feed.xml#top '), { url: 'https://news.example/feed.xml' });
  assert.deepEqual(normalizeFeedAddress('http://news.example:80/rss'), { url: 'http://news.example/rss' });
  for (const bad of ['', 'news.example/feed', 'ftp://news.example/feed', 'file:///etc/passwd', 'gopher://x/', 'javascript:alert(1)',
    'https://user:pw@news.example/feed', 'https://user@news.example/feed', 'https://news.example:8443/feed', 'http://news.example:6379/']) {
    assert.ok('error' in normalizeFeedAddress(bad), bad);
  }
});

test('an address of 2048 characters is read, and one of 2049 is refused', () => {
  const base = 'https://news.example/';
  assert.ok('url' in normalizeFeedAddress(base + 'a'.repeat(2048 - base.length)));
  assert.ok('error' in normalizeFeedAddress(base + 'a'.repeat(2049 - base.length)));
});

test('the cache key is the normalized address’s hash', () => {
  assert.match(feedKey('https://news.example/feed.xml'), /^[0-9a-f]{64}$/);
  assert.notEqual(feedKey('https://news.example/a'), feedKey('https://news.example/b'));
});

// ── Which addresses are public ────────────────────────────────────────────────

test('private, loopback, link-local, metadata and reserved addresses are not public, in every form', () => {
  for (const ip of ['8.8.8.8', '1.1.1.1', PUBLIC, '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '2a00:1450:4001:80b::200e']) {
    assert.equal(publicAddress(ip), true, ip);
  }
  for (const ip of [
    '0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '127.255.255.254', '169.254.169.254', '172.16.0.1', '172.31.255.255',
    '192.0.0.1', '192.0.2.1', '192.168.1.1', '198.18.0.1', '198.51.100.1', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255',
    '::', '::1', 'fe80::1', 'fc00::1', 'fd00:ec2::254', 'ff02::1', '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:169.254.169.254',
    '64:ff9b::a9fe:a9fe', '2002:7f00:1::', '2001:db8::1', '2001::1', 'fe80::1%eth0', 'localhost', 'not-an-ip', '1.2.3', '1.2.3.256',
  ]) {
    assert.equal(publicAddress(ip), false, ip);
  }
});

// ── One guarded read ──────────────────────────────────────────────────────────

test('the connection goes to the address that was checked, with the site’s name in the URL', async () => {
  const net = fakeNet({ 'news.example': [PUBLIC] }, () => reply(200, RSS(['One'])));
  const result = await ok(net);
  assert.equal(result.kind, 'body');
  assert.deepEqual(net.lookups, ['news.example']);
  assert.equal(net.requests.length, 1);
  assert.equal(net.requests[0].address, PUBLIC);
  assert.equal(net.requests[0].url, 'https://news.example/feed.xml');
});

test('a name with one private answer among public ones is refused whole, and nothing is requested', async () => {
  const net = fakeNet({ 'news.example': [PUBLIC, '10.0.0.5'] }, () => reply(200, RSS(['One'])));
  const result = await ok(net);
  assert.equal(result.kind, 'problem');
  assert.equal(result.refused, true);
  assert.match(result.error, /not on the public internet/);
  assert.equal(net.requests.length, 0);
});

test('an address written as a private IP, or a name answering loopback or metadata, is refused before any request', async () => {
  for (const [address, dns] of [
    ['http://127.0.0.1/feed', {}],
    ['http://169.254.169.254/latest/meta-data/', {}],
    ['http://[::1]/feed', {}],
    ['http://[fd00:ec2::254]/feed', {}],
    ['https://localhost/feed', { localhost: ['127.0.0.1'] }],
    ['https://metadata.internal/feed', { 'metadata.internal': ['169.254.169.254'] }],
  ]) {
    const net = fakeNet(dns, () => reply(200, RSS(['x'])));
    const result = await ok(net, address);
    assert.equal(result.kind, 'problem', address);
    assert.equal(result.refused, true, address);
    assert.equal(net.requests.length, 0, address);
  }
});

test('a name that resolves public first and private on a later lookup is never connected to privately', async () => {
  // DNS rebinding: the first answer is public, every later one private. The read resolves once
  // per hop and connects to that answer, so the private one is never asked for the first hop...
  const flip = (n) => (n === 0 ? [PUBLIC] : ['127.0.0.1']);
  const once = fakeNet({ 'news.example': flip }, () => reply(200, RSS(['One'])));
  assert.equal((await ok(once)).kind, 'body');
  assert.deepEqual(once.lookups, ['news.example'], 'one lookup, no second one at connect time');
  assert.deepEqual(once.requests.map((r) => r.address), [PUBLIC]);
  // ...and a redirect back to the same name is resolved and checked again: private now, refused.
  const back = fakeNet({ 'news.example': flip }, ({ n }) => (n === 1 ? reply(302, '', { location: '/again' }) : reply(200, RSS(['x']))));
  const result = await ok(back);
  assert.equal(result.kind, 'problem');
  assert.equal(result.refused, true);
  assert.match(result.error, /redirects to an address that is not on the public internet/);
  assert.deepEqual(back.requests.map((r) => r.address), [PUBLIC]);
});

test('every redirect is checked: to a private address, another scheme or another port it is refused', async () => {
  for (const location of ['http://10.0.0.1/feed', 'http://169.254.169.254/', 'ftp://news.example/feed', 'https://news.example:8443/feed', 'https://u:p@news.example/x', 'http://[::ffff:127.0.0.1]/']) {
    const net = fakeNet({ 'news.example': [PUBLIC] }, ({ n }) => (n === 1 ? reply(301, '', { location }) : reply(200, RSS(['x']))));
    const result = await ok(net);
    assert.equal(result.refused, true, location);
    assert.equal(net.requests.length, 1, location);
  }
});

test('five redirects are followed and a sixth is refused', async () => {
  const chain = (hops) =>
    fakeNet({ 'news.example': [PUBLIC] }, ({ n }) => (n <= hops ? reply(302, '', { location: `/hop${n}` }) : reply(200, RSS(['Landed']))));
  const five = chain(5);
  const landed = await ok(five);
  assert.equal(landed.kind, 'body');
  assert.equal(five.requests.length, 6);
  const six = chain(6);
  const refused = await ok(six);
  assert.equal(refused.kind, 'problem');
  assert.equal(refused.refused, true);
  assert.match(refused.error, /redirects more than 5 times/);
  assert.equal(six.requests.length, 6, 'the sixth redirect is not followed');
});

test('a body of 5,000,000 bytes is read, and one byte more is refused and its connection closed', async () => {
  const head = new TextEncoder().encode(RSS(['Big']));
  const body = (size) => {
    const bytes = new Uint8Array(size).fill(0x20);
    bytes.set(head);
    return bytes;
  };
  const at = await ok(fakeNet({ 'news.example': [PUBLIC] }, () => reply(200, body(5_000_000))));
  assert.equal(at.kind, 'body');
  let sent;
  const over = await ok(fakeNet({ 'news.example': [PUBLIC] }, () => (sent = reply(200, body(5_000_001)))));
  assert.equal(over.kind, 'problem');
  assert.match(over.error, /larger than 5 MB/);
  assert.equal(sent.cancelled, true);
  // A declared length over the cap is refused before the body is read.
  const declared = await ok(fakeNet({ 'news.example': [PUBLIC] }, () => reply(200, RSS(['x']), { 'content-length': '5000001' })));
  assert.match(declared.error, /larger than 5 MB/);
});

test('the conditional request carries the validators, and a 304 is not modified', async () => {
  const net = fakeNet({ 'news.example': [PUBLIC] }, () => reply(304, '', { etag: 'W/"2"' }));
  const result = await guardedFetch('https://news.example/feed.xml', { etag: 'W/"1"', lastModified: 'Tue, 20 Oct 2026 19:52:24 GMT' }, net, new AbortController().signal);
  assert.equal(result.kind, 'not-modified');
  assert.equal(result.etag, 'W/"2"');
  assert.equal(net.requests[0].headers['if-none-match'], 'W/"1"');
  assert.equal(net.requests[0].headers['if-modified-since'], 'Tue, 20 Oct 2026 19:52:24 GMT');
});

test('a name that does not resolve, and a publisher error, are failures with a fix', async () => {
  const missing = await ok(fakeNet({}, () => reply(200, '')));
  assert.match(missing.error, /does not exist/);
  const gone = await ok(fakeNet({ 'news.example': [PUBLIC] }, () => reply(404)));
  assert.match(gone.error, /not there/);
  const busy = await ok(fakeNet({ 'news.example': [PUBLIC] }, () => reply(503, '', { 'retry-after': '600' })));
  assert.equal(busy.retryMs, 600_000);
});

// ── The headlines ─────────────────────────────────────────────────────────────

test('the five Q feeds come out as plain-text headlines: entities, CDATA, escaped markup, non-ASCII, emoji', () => {
  const yle = parseFeed(fixture('yle-paauutiset-rss.xml'));
  assert.equal(yle.items.length, 13);
  assert.equal(yle.ttlMs, 5 * MIN, '<ttl>5</ttl>');
  assert.ok(yle.items.every((i) => /[äöå–]/i.test(i.title)), 'every Yle title keeps its Finnish characters');
  const node = parseFeed(fixture('nodejs-blog-rss.xml'));
  assert.equal(node.items[0].title, 'Node.js 24.22.0 (LTS)', 'CDATA as plain text');
  const github = parseFeed(fixture('github-node-releases-atom.xml'));
  assert.equal(github.items.length, 3);
  assert.ok(github.items.some((i) => i.title === "2026-09-23, Version 22.23.3 'Jod' (LTS), @aduh95 prepared by @juanarbol"), '&#39; decoded');
  const youtube = parseFeed(fixture('youtube-channel-atom.xml'));
  assert.equal(youtube.items.length, 15);
  assert.ok(youtube.items.some((i) => i.title.startsWith('🧰 ')), 'emoji kept');
  assert.ok(!youtube.items.some((i) => /media:|<|&amp;/.test(i.title)));
  const vercel = parseFeed(fixture('vercel-blog-atom.xml')).items.map((i) => i.title);
  assert.ok(vercel.includes('<script type="text/llms.txt">'), 'escaped markup in a text title is text');
  assert.ok(vercel.includes('v0.dev -> v0.app'));
  assert.ok(vercel.includes('Introducing AI agents & services on the Vercel Marketplace'));
  for (const feed of ['yle-paauutiset-rss.xml', 'pypi-updates-rss.xml', 'nodejs-blog-rss.xml', 'github-node-releases-atom.xml', 'youtube-channel-atom.xml', 'vercel-blog-atom.xml']) {
    for (const item of parseFeed(fixture(feed)).items) assert.doesNotMatch(item.title, /&(amp|lt|gt|quot|#\d+);|<!\[CDATA|\s{2}/, `${feed}: ${item.title}`);
  }
});

test('newest 20: a feed of 25 items keeps 20, newest first when every item is dated', () => {
  const pypi = parseFeed(fixture('pypi-updates-rss.xml'));
  assert.equal(pypi.items.length, 20, '20 of 25 (a guid-less feed, identified by link)');
  const items = Array.from({ length: 21 }, (_, i) => `<item><title>Story ${i}</title><guid>g${i}</guid><pubDate>${new Date(T0 + i * MIN).toUTCString()}</pubDate></item>`);
  const dated = parseFeed(`<rss><channel>${items.join('')}</channel></rss>`).items;
  assert.equal(dated.length, 20);
  assert.equal(dated[0].title, 'Story 20');
  assert.equal(dated[19].title, 'Story 1', 'the oldest of 21 is the one left out');
  const twenty = parseFeed(`<rss><channel>${items.slice(0, 20).join('')}</channel></rss>`).items;
  assert.equal(twenty.length, 20);
});

test('an item repeated by id or by link appears once', () => {
  const feed = `<rss><channel>
    <item><title>First</title><guid>a</guid><link>https://n/1</link></item>
    <item><title>Same id</title><guid>a</guid><link>https://n/2</link></item>
    <item><title>Same link</title><guid>b</guid><link>https://n/1</link></item>
    <item><title>Second</title><guid>c</guid><link>https://n/3</link></item></channel></rss>`;
  assert.deepEqual(parseFeed(feed).items.map((i) => i.title), ['First', 'Second']);
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom">
    <entry><title>One</title><id>tag:x,1</id><link href="https://n/1"/></entry>
    <entry><title>Again</title><id>tag:x,1</id><link href="https://n/9"/></entry></feed>`;
  assert.deepEqual(parseFeed(atom).items.map((i) => i.title), ['One']);
});

test('an Atom feed written with a namespace prefix reads like its default-namespace twin', () => {
  const prefixed = `<atom:feed xmlns:atom="http://www.w3.org/2005/Atom">
    <atom:entry><atom:title>Prefixed one</atom:title><atom:id>tag:x,1</atom:id><atom:link href="https://n/1"/><atom:updated>2026-10-22T10:00:00Z</atom:updated></atom:entry>
    <atom:entry><atom:title>Prefixed two</atom:title><atom:id>tag:x,2</atom:id><atom:updated>2026-10-22T11:00:00Z</atom:updated></atom:entry>
    <atom:entry><atom:title>Again</atom:title><atom:id>tag:x,1</atom:id></atom:entry></atom:feed>`;
  const plain = prefixed.replace(/atom:/g, '').replace('xmlns:atom', 'xmlns');
  assert.deepEqual(parseFeed(prefixed).items.map((i) => i.title), ['Prefixed two', 'Prefixed one']);
  assert.deepEqual(parseFeed(prefixed).items, parseFeed(plain).items);
});

test('an item’s metadata is its own direct children: never markup inside CDATA or a nested element', () => {
  const rss = `<rss><channel><item>
    <description><![CDATA[<title>Embedded page title</title><link>https://elsewhere/</link><guid>other</guid>]]></description>
    <title>Real headline</title><guid>real</guid><link>https://n/1</link></item></channel></rss>`;
  assert.deepEqual(parseFeed(rss).items.map((i) => [i.title, i.id, i.link]), [['Real headline', 'real', 'https://n/1']]);
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry>
    <source><title>The source feed</title><id>tag:source</id></source>
    <title>Entry headline</title><id>tag:entry</id></entry></feed>`;
  assert.deepEqual(parseFeed(atom).items.map((i) => [i.title, i.id]), [['Entry headline', 'tag:entry']]);
  // A stray unclosed tag in a description does not hide the rest of the item.
  const stray = '<rss><channel><item><description>one<br>two</description><title>After a stray tag</title></item></channel></rss>';
  assert.deepEqual(parseFeed(stray).items.map((i) => i.title), ['After a stray tag']);
  // A CDATA title is still read as the title.
  assert.equal(parseFeed('<rss><channel><item><title><![CDATA[Node.js <b>26</b>]]></title></item></channel></rss>').items[0].title, 'Node.js 26');
});

test('a body cut off before its root ends is a failed read, not an empty feed; a feed with no items is empty', () => {
  const cut = parseFeed('<rss version="2.0"><channel><item><title>New headline');
  assert.equal(cut.ok, false);
  assert.match(cut.error, /incomplete/);
  assert.equal(parseFeed('<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>x</title></entry>').ok, false);
  assert.equal(parseFeed('<atom:feed xmlns:atom="http://www.w3.org/2005/Atom"><atom:entry><atom:title>x</atom:title></atom:entry></feed>').ok, false);
  assert.deepEqual(parseFeed('<rss version="2.0"><channel><title>Quiet</title></channel></rss>'), { ok: true, items: [], ttlMs: null });
  assert.equal(parseFeed('<rdf:RDF xmlns:rdf="x"><item><title>RSS 1.0</title></item></rdf:RDF>').items[0].title, 'RSS 1.0');
});

test('a truncated body keeps the last good headlines in the cache', async () => {
  let reads = 0;
  const net = fakeNet({ 'news.example': [PUBLIC] }, () => ((reads += 1) === 1 ? reply(200, RSS(['Kept'])) : reply(200, '<rss version="2.0"><channel><item><title>New')));
  const env = io(net);
  await readFeed(ADDRESS, env);
  env.clock.t += 5 * MIN;
  const answer = await readFeed(ADDRESS, env);
  assert.equal(answer.ok, false);
  assert.deepEqual(answer.items, ['Kept']);
  assert.deepEqual(env.store.rows.get(feedKey(ADDRESS)).items, ['Kept']);
});

test('an Atom title typed html loses its markup; tags inside a text title go', () => {
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title type="html">&lt;b&gt;Bold&lt;/b&gt; &amp;amp; plain &amp;nbsp;x</title><id>1</id></entry></feed>`;
  assert.equal(parseFeed(atom).items[0].title, 'Bold & plain x');
  const rss = '<rss><channel><item><title><![CDATA[<em>Big</em> news &amp; more]]></title><guid>1</guid></item></channel></rss>';
  assert.equal(parseFeed(rss).items[0].title, 'Big news & more');
});

test('a headline of 300 characters is kept whole, and a longer one is cut to 300 with an ellipsis', () => {
  const at = parseFeed(RSS(['x'.repeat(300)])).items[0].title;
  assert.equal(at, 'x'.repeat(300));
  const over = parseFeed(RSS(['x'.repeat(301)])).items[0].title;
  assert.equal(over.length, 300);
  assert.ok(over.endsWith('…'));
});

test('hostile markup of 5 MB parses in under 2 seconds each: the parser scans forward only', () => {
  // A lazy regex rescans to the end from every unclosed tag: 400 KB of `<item>` took 5 s that way,
  // and 5 MB would hold the route and the tick for minutes.
  const MB5 = 5_000_000;
  const fill = (head, unit, tail = '') => head + unit.repeat(Math.floor((MB5 - head.length - tail.length) / unit.length)) + tail;
  const cases = {
    'unclosed items': fill('<rss>', '<item>'),
    'unclosed comments': fill('<rss>', '<!--'),
    'unclosed feed tags': fill('', '<feed'),
    'unclosed titles in one item': fill('<rss><item>', '<title', '</item></rss>'),
    'unclosed links in one entry': fill('<feed><entry><title>x</title>', '<link', '</entry></feed>'),
    'unclosed tags in one title': fill('<rss><item><title>', '<a', '</title></item></rss>'),
    'an unclosed attribute': fill('<rss><item><title type="', 'a', '>x</title></item></rss>'),
    'entities in one title': fill('<rss><item><title>', '&a', '</title></item></rss>'),
    'many small items': fill('<rss>', '<item><title>t</title><guid>g</guid></item>', '</rss>'),
    'open tags piled in one item': fill('<rss><item>', '<a>', '<title>x</title></item></rss>'),
    'stray closes in one item': fill('<rss><item><a><b><c>', '</z>', '<title>x</title></item></rss>'),
    'unclosed CDATA': fill('<rss><item><title>', '<![CDATA[', '</title></item></rss>'),
  };
  for (const [name, xml] of Object.entries(cases)) {
    const started = performance.now();
    parseFeed(xml);
    const ms = performance.now() - started;
    assert.ok(ms < 2000, `${name}: ${Math.round(ms)} ms`);
  }
});

test('a page that is not a feed is said plainly', () => {
  const html = parseFeed('<!doctype html><html><head><title>Home</title></head></html>');
  assert.equal(html.ok, false);
  assert.match(html.error, /not an RSS or Atom feed/);
});

// ── One cached read per address ───────────────────────────────────────────────

const ADDRESS = 'https://news.example/feed.xml';

/** A feed server counting its upstream reads, optionally slow, answering `titles()`. */
function feedServer({ titles = () => ['One', 'Two'], headers = {}, delay = null, status = 200, extra = '' } = {}) {
  let reads = 0;
  const net = fakeNet({ 'news.example': [PUBLIC] }, async ({ headers: sent }) => {
    reads += 1;
    if (delay) await delay;
    if (headers.etag && sent['if-none-match'] === headers.etag) return reply(304, '', headers);
    return reply(status, status === 200 ? RSS(titles(), extra) : '', headers);
  });
  return { net, reads: () => reads };
}

test('the first read fetches and keeps the row; a fresh row is served to every reader without fetching', async () => {
  const server = feedServer();
  const env = io(server.net);
  const first = await readFeed(ADDRESS, env);
  assert.deepEqual(first, { ok: true, items: ['One', 'Two'], fetchedAt: new Date(T0).toISOString() });
  env.clock.t += MIN;
  assert.deepEqual(await readFeed(ADDRESS, env), first);
  assert.equal(server.reads(), 1);
  const row = env.store.rows.get(feedKey(ADDRESS));
  assert.deepEqual(row.items, ['One', 'Two']);
  assert.equal(row.address, ADDRESS);
});

test('the floor: nothing is fetched before 5 minutes, and the read at 5 minutes fetches', async () => {
  const server = feedServer();
  const env = io(server.net);
  await readFeed(ADDRESS, env);
  env.clock.t = T0 + 5 * MIN - 1;
  await readFeed(ADDRESS, env);
  assert.equal(server.reads(), 1, 'one millisecond before the floor');
  env.clock.t = T0 + 5 * MIN;
  await readFeed(ADDRESS, env);
  assert.equal(server.reads(), 2, 'at the floor');
});

test('a feed asking for less than the floor still waits 5 minutes', async () => {
  const server = feedServer({ headers: { 'cache-control': 'public, max-age=30' } });
  const env = io(server.net);
  await readFeed(ADDRESS, env);
  env.clock.t = T0 + 5 * MIN - 1;
  await readFeed(ADDRESS, env);
  assert.equal(server.reads(), 1);
});

test('a feed asking for longer is read later: max-age 900 and <ttl>15</ttl> both wait 15 minutes', async () => {
  for (const ask of [{ headers: { 'cache-control': 'public, max-age=900' } }, { extra: '<ttl>15</ttl>' }]) {
    const server = feedServer(ask);
    const env = io(server.net);
    await readFeed(ADDRESS, env);
    env.clock.t = T0 + 15 * MIN - 1;
    await readFeed(ADDRESS, env);
    assert.equal(server.reads(), 1, JSON.stringify(ask));
    env.clock.t = T0 + 15 * MIN;
    await readFeed(ADDRESS, env);
    assert.equal(server.reads(), 2, JSON.stringify(ask));
  }
});

test('a <ttl> of any size is kept as at most an hour', () => {
  assert.equal(parseFeed(RSS(['x'], '<ttl>99999999999</ttl>')).ttlMs, 60 * MIN);
  assert.equal(parseFeed(RSS(['x'], '<ttl>15</ttl>')).ttlMs, 15 * MIN);
});

test('a feed asking for more than an hour is read after an hour anyway', async () => {
  const server = feedServer({ headers: { 'cache-control': 'max-age=86400' } });
  const env = io(server.net);
  await readFeed(ADDRESS, env);
  env.clock.t = T0 + 60 * MIN - 1;
  await readFeed(ADDRESS, env);
  assert.equal(server.reads(), 1);
  env.clock.t = T0 + 60 * MIN;
  await readFeed(ADDRESS, env);
  assert.equal(server.reads(), 2);
});

test('a stale row is fetched with its ETag and Last-Modified, and a 304 keeps its headlines', async () => {
  const sent = [];
  let reads = 0;
  const net = fakeNet({ 'news.example': [PUBLIC] }, ({ headers }) => {
    reads += 1;
    sent.push(headers);
    return reads === 1 ? reply(200, RSS(['Kept']), { etag: 'W/"v1"', 'last-modified': 'Tue, 20 Oct 2026 19:52:24 GMT' }) : reply(304, '', { etag: 'W/"v1"' });
  });
  const env = io(net);
  await readFeed(ADDRESS, env);
  assert.equal(sent[0]['if-none-match'], undefined, 'the first read is unconditional');
  env.clock.t += 5 * MIN;
  const answer = await readFeed(ADDRESS, env);
  assert.equal(sent[1]['if-none-match'], 'W/"v1"');
  assert.equal(sent[1]['if-modified-since'], 'Tue, 20 Oct 2026 19:52:24 GMT');
  assert.deepEqual(answer.items, ['Kept']);
  assert.equal(answer.fetchedAt, new Date(T0 + 5 * MIN).toISOString(), 'a 304 is a good read: checked now');
});

test('a 304 keeps honouring the feed’s own <ttl>: an hour stays an hour', async () => {
  let reads = 0;
  const net = fakeNet({ 'news.example': [PUBLIC] }, ({ headers }) => {
    reads += 1;
    return headers['if-none-match'] === 'W/"v1"' ? reply(304, '', { etag: 'W/"v1"' }) : reply(200, RSS(['Slow'], '<ttl>60</ttl>'), { etag: 'W/"v1"' });
  });
  const env = io(net);
  await readFeed(ADDRESS, env);
  env.clock.t = T0 + 60 * MIN;
  await readFeed(ADDRESS, env);
  assert.equal(reads, 2, 'the conditional read at the hour');
  env.clock.t = T0 + 2 * 60 * MIN - 1;
  await readFeed(ADDRESS, env);
  assert.equal(reads, 2, 'after the 304, still an hour, not 5 minutes');
  env.clock.t = T0 + 2 * 60 * MIN;
  await readFeed(ADDRESS, env);
  assert.equal(reads, 3);
});

test('two readers at once on a new address make one upstream fetch, and both get the headlines', async () => {
  let release;
  const server = feedServer({ delay: new Promise((r) => (release = r)) });
  const env = io(server.net);
  env.sleep = async (ms) => {
    env.clock.t += ms;
    await new Promise((r) => setImmediate(r));
  };
  const a = readFeed(ADDRESS, env);
  const b = readFeed(ADDRESS, env);
  await new Promise((r) => setImmediate(r));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(server.reads(), 1);
  assert.deepEqual(ra.items, ['One', 'Two']);
  assert.deepEqual(rb.items, ['One', 'Two']);
});

test('on a stale row, one instance fetches and the other serves the stale headlines with their age', async () => {
  let n = 0;
  let release;
  const net = fakeNet({ 'news.example': [PUBLIC] }, async () => {
    n += 1;
    if (n === 2) await new Promise((r) => (release = r));
    return reply(200, RSS([`Read ${n}`]));
  });
  const env = io(net);
  await readFeed(ADDRESS, env);
  env.clock.t += 5 * MIN;
  const fetching = readFeed(ADDRESS, env);
  await new Promise((r) => setImmediate(r));
  const other = await readFeed(ADDRESS, env);
  assert.deepEqual(other, { ok: true, items: ['Read 1'], fetchedAt: new Date(T0).toISOString() });
  release();
  assert.deepEqual((await fetching).items, ['Read 2']);
  assert.equal(n, 2);
});

test('a claim lapses after 20 seconds: before that another instance cannot take it, at 20 seconds it can', async () => {
  const server = feedServer();
  const env = io(server.net);
  await readFeed(ADDRESS, env);
  const row = env.store.rows.get(feedKey(ADDRESS));
  // An instance claimed the stale row at 5 minutes and then died mid-fetch.
  env.clock.t = T0 + 5 * MIN;
  assert.equal(await env.store.claim(row.key, new Date(env.clock.t).toISOString(), new Date(env.clock.t + 20_000).toISOString()), true);
  env.clock.t = T0 + 5 * MIN + 20_000 - 1;
  await readFeed(ADDRESS, env);
  assert.equal(server.reads(), 1, 'the dead claim still holds');
  env.clock.t = T0 + 5 * MIN + 20_000 + 1;
  await readFeed(ADDRESS, env);
  assert.equal(server.reads(), 2, 'the claim lapsed and this instance read');
  // The claim a reader takes is the one checked: it reads its own `claimed_until` 20 s ahead.
  const fresh = io(feedServer({ delay: new Promise(() => {}) }).net);
  void readFeed(ADDRESS, fresh);
  await new Promise((r) => setImmediate(r));
  assert.equal(fresh.store.rows.get(feedKey(ADDRESS)).claimed_until, new Date(T0 + 20_000).toISOString());
});

test('a failed fetch keeps the last good headlines and says since when; the next good read clears it', async () => {
  let status = 200;
  const net = fakeNet({ 'news.example': [PUBLIC] }, () => (status === 200 ? reply(200, RSS(['Good'])) : reply(500)));
  const env = io(net);
  await readFeed(ADDRESS, env);
  status = 500;
  env.clock.t += 5 * MIN;
  const failed = await readFeed(ADDRESS, env);
  assert.equal(failed.ok, false);
  assert.match(failed.error, /answered 500/);
  assert.deepEqual(failed.items, ['Good'], 'the last good list is kept');
  assert.equal(failed.failingSince, new Date(T0 + 5 * MIN).toISOString());
  env.clock.t += 5 * MIN;
  assert.equal((await readFeed(ADDRESS, env)).failingSince, new Date(T0 + 5 * MIN).toISOString(), 'still failing since the first miss');
  status = 200;
  env.clock.t += 5 * MIN;
  assert.deepEqual(await readFeed(ADDRESS, env), { ok: true, items: ['Good'], fetchedAt: new Date(env.clock.t).toISOString() });
});

test('a publisher that asks to be left alone is: Retry-After 1800 on a 503 holds 30 minutes', async () => {
  let reads = 0;
  const net = fakeNet({ 'news.example': [PUBLIC] }, () => (reads += 1) === 1 ? reply(503, '', { 'retry-after': '1800' }) : reply(200, RSS(['Back'])));
  const env = io(net);
  await readFeed(ADDRESS, env);
  env.clock.t = T0 + 30 * MIN - 1;
  await readFeed(ADDRESS, env);
  assert.equal(reads, 1);
  env.clock.t = T0 + 30 * MIN;
  assert.deepEqual((await readFeed(ADDRESS, env)).items, ['Back']);
});

test('a refused address answers 400, from the row too, and is not looked up again for 5 minutes', async () => {
  const net = fakeNet({ 'internal.example': ['10.1.2.3'] }, () => reply(200, RSS(['x'])));
  const env = io(net);
  const refused = await readFeed('https://internal.example/feed', env);
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 400);
  const cached = await readFeed('https://internal.example/feed', env);
  assert.equal(cached.status, 400, 'a refusal stays a refusal when served from the row');
  assert.equal(net.lookups.length, 1);
  assert.equal(net.requests.length, 0);
  // A passing failure is 502, from the fetch and from the row.
  const busy = io(fakeNet({ 'news.example': [PUBLIC] }, () => reply(500)));
  assert.equal((await readFeed(ADDRESS, busy)).status, 502);
  assert.equal((await readFeed(ADDRESS, busy)).status, 502);
});

test('a row nobody has read for a day is deleted at the next fetch; a row in use is kept', async () => {
  const env = io(feedServer().net);
  await readFeed('https://news.example/old.xml', env);
  env.clock.t = T0 + 24 * 60 * MIN + 5 * MIN;
  await readFeed('https://news.example/in-use.xml', env);
  assert.ok(env.store.rows.has(feedKey('https://news.example/old.xml')), 'exactly a day after its wait ended: kept');
  env.clock.t += 1;
  await readFeed('https://news.example/third.xml', env);
  assert.equal(env.store.rows.has(feedKey('https://news.example/old.xml')), false, 'a day after its wait ended');
  assert.ok(env.store.rows.has(feedKey('https://news.example/in-use.xml')));
});

test('the validators go only to the same site: a redirect to another site is asked unconditionally', async () => {
  const net = fakeNet({ 'news.example': [PUBLIC], 'cdn.example': ['93.184.215.15'] }, ({ n }) =>
    n === 1 ? reply(301, '', { location: 'https://cdn.example/feed.xml' }) : reply(200, RSS(['Moved'])),
  );
  const result = await guardedFetch(ADDRESS, { etag: 'W/"1"', lastModified: 'Tue, 20 Oct 2026 19:52:24 GMT' }, net, new AbortController().signal);
  assert.equal(result.kind, 'body');
  assert.equal(net.requests[0].headers['if-none-match'], 'W/"1"');
  assert.equal(net.requests[1].headers['if-none-match'], undefined);
  assert.equal(net.requests[1].headers['if-modified-since'], undefined);
  const same = fakeNet({ 'news.example': [PUBLIC] }, ({ n }) => (n === 1 ? reply(302, '', { location: '/v2.xml' }) : reply(304)));
  await guardedFetch(ADDRESS, { etag: 'W/"1"', lastModified: null }, same, new AbortController().signal);
  assert.equal(same.requests[1].headers['if-none-match'], 'W/"1"', 'the same site keeps them');
});

test('a name with IPv6 and IPv4 answers is connected over IPv4, after every answer was checked', async () => {
  const net = fakeNet({ 'news.example': ['2606:4700::6810:84e5', PUBLIC] }, () => reply(200, RSS(['x'])));
  await ok(net);
  assert.equal(net.requests[0].address, PUBLIC);
  const mixed = fakeNet({ 'news.example': ['fd00::1', PUBLIC] }, () => reply(200, RSS(['x'])));
  assert.equal((await ok(mixed)).refused, true, 'a private IPv6 answer refuses the name even with a public IPv4 one');
});

test('a lookup that never answers counts against the read’s time', async () => {
  const net = { lookup: () => new Promise(() => {}), request: async () => reply(200, RSS(['x'])) };
  const abort = new AbortController();
  const pending = guardedFetch(ADDRESS, { etag: null, lastModified: null }, net, abort.signal);
  abort.abort();
  assert.match((await pending).error, /did not answer in 10 seconds/);
});

test('a headline is cut by characters, never inside an emoji', () => {
  const title = `${'x'.repeat(298)}🧰${'y'.repeat(10)}`;
  const cut = parseFeed(RSS([title])).items[0].title;
  assert.equal(Array.from(cut).length, 300);
  assert.ok(cut.endsWith('x🧰…'), cut.slice(-4));
  assert.doesNotMatch(cut, /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/);
});

test('a read the caller cuts short (the tick’s deadline) leaves the row’s headlines, wait and health as they were', async () => {
  let reads = 0;
  const net = fakeNet({ 'news.example': [PUBLIC] }, ({ signal }) =>
    (reads += 1) === 1
      ? reply(200, RSS(['Good']))
      : new Promise((_, reject) => signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  );
  const env = io(net);
  await readFeed(ADDRESS, env);
  env.clock.t += 5 * MIN;
  const before = structuredClone(env.store.rows.get(feedKey(ADDRESS)));
  const cut = new AbortController();
  const pending = readFeed(ADDRESS, env, { cut: cut.signal });
  await new Promise((r) => setImmediate(r));
  cut.abort();
  const answer = await pending;
  assert.equal(answer.ok, false);
  assert.match(answer.error, /cut short/);
  const after = env.store.rows.get(feedKey(ADDRESS));
  assert.deepEqual({ ...after, claimed_until: before.claimed_until }, before, 'nothing but the claim changed');
  assert.ok(after.claimed_until <= new Date(env.clock.t).toISOString(), 'the claim is let go');
  assert.equal(after.error, null);
});

test('a read that takes 10 seconds is cut off there, and one inside 10 seconds is not', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const hanging = (finishAt) =>
      fakeNet({ 'news.example': [PUBLIC] }, ({ signal }) =>
        new Promise((resolve, reject) => {
          signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
          if (finishAt !== null) setTimeout(() => resolve(reply(200, RSS(['In time']))), finishAt);
        }),
      );
    const late = readFeed(ADDRESS, io(hanging(null)));
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(10_000);
    const cut = await late;
    assert.match(cut.error, /did not answer in 10 seconds/);
    const inTime = readFeed(ADDRESS, io(hanging(9_999)));
    await new Promise((r) => setImmediate(r));
    mock.timers.tick(9_999);
    assert.deepEqual((await inTime).items, ['In time']);
  } finally {
    mock.timers.reset();
  }
});

// ── The real connection ───────────────────────────────────────────────────────

test('the real connection goes to the checked address whatever the name says, and reads a gzip body', async () => {
  const { createServer } = await import('node:http');
  const { gzipSync } = await import('node:zlib');
  const hosts = [];
  const server = createServer((req, res) => {
    hosts.push(req.headers.host);
    res.writeHead(200, { 'content-type': 'application/rss+xml', 'content-encoding': 'gzip' });
    res.end(gzipSync(RSS(['Pinned'])));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    // `pinned.invalid` resolves nowhere: only a connection pinned to the address given can answer.
    const response = await nodeFeedNet.request({
      url: new URL(`http://pinned.invalid:${port}/feed.xml`),
      address: '127.0.0.1',
      family: 4,
      headers: { 'accept-encoding': 'gzip' },
      signal: new AbortController().signal,
    });
    const chunks = [];
    for await (const chunk of response.body) chunks.push(Buffer.from(chunk));
    assert.equal(response.status, 200);
    assert.deepEqual(parseFeed(Buffer.concat(chunks).toString('utf8')).items.map((i) => i.title), ['Pinned']);
    assert.deepEqual(hosts, [`pinned.invalid:${port}`], 'the site’s name still travels in Host');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('the real connection: a compressed body that stalls is ended by the abort, not waited on for ever', async () => {
  const { createServer } = await import('node:http');
  const { gzipSync } = await import('node:zlib');
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-encoding': 'gzip' });
    res.write(gzipSync(RSS(['x'])).subarray(0, 12)); // the gzip header, then nothing
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const { port } = server.address();
    const abort = new AbortController();
    const response = await nodeFeedNet.request({ url: new URL(`http://pinned.invalid:${port}/`), address: '127.0.0.1', family: 4, headers: {}, signal: abort.signal });
    const started = Date.now();
    setTimeout(() => abort.abort(), 200);
    await assert.rejects(async () => {
      for await (const chunk of response.body) void chunk;
    });
    assert.ok(Date.now() - started < 3000, 'the read ended at the abort');
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
});

// ── The route ─────────────────────────────────────────────────────────────────

let built;
let route;
before(async () => {
  built = await buildApiRuntime(['api/data/[...path].ts']);
  route = (await import(pathToFileURL(path.join(built.outputDir, 'api/data/[...path].js')).href)).default;
});
after(async () => {
  await built?.cleanup();
});

test('the route answers one client 30 feed reads a minute and refuses the 31st', async () => {
  // No database here, so each allowed read answers 503; the 31st is refused before it.
  const saved = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SECRET_KEY, role: process.env.SUPABASE_SERVICE_ROLE_KEY };
  delete process.env.SUPABASE_URL;
  delete process.env.SUPABASE_SECRET_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    const call = () =>
      route.fetch(new Request(`https://noacg.test/api/data/feed?url=${encodeURIComponent(ADDRESS)}`, { headers: { 'x-forwarded-for': '203.0.113.77' } }));
    const statuses = [];
    for (let i = 0; i < 31; i += 1) statuses.push((await call()).status);
    assert.ok(statuses.slice(0, 30).every((s) => s !== 429), statuses.join(','));
    assert.equal(statuses[30], 429);
    const other = await route.fetch(new Request(`https://noacg.test/api/data/feed?url=x`, { headers: { 'x-forwarded-for': '203.0.113.78' } }));
    assert.notEqual(other.status, 429, 'another client is not refused');
  } finally {
    for (const [k, v] of [['SUPABASE_URL', saved.url], ['SUPABASE_SECRET_KEY', saved.key], ['SUPABASE_SERVICE_ROLE_KEY', saved.role]]) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
});

test('the route takes GET only', async () => {
  const response = await route.fetch(new Request(`https://noacg.test/api/data/feed?url=x`, { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.79' } }));
  assert.equal(response.status, 405);
});
