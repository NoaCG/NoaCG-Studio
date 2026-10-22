// THE NEWS FEED READER (docs/work-specs/data-sources/spec.md, phase C4; AC-5, AC-6): the one door
// every server read of an RSS 2.0 or Atom feed goes through, used by the public route
// `/api/data/feed` and by the server tick. A helper, not a function.
//
// The route fetches addresses people type, so the guard is the core of this file:
//   - http and https only, on their own ports, with no credentials in the address;
//   - the name is resolved here and EVERY answer must be a public address (a name that answers
//     one private address is refused whole), and the connection goes to the address that was
//     checked, never to a second lookup (a name that answers public now and private a moment
//     later cannot slip through between the check and the connect);
//   - every redirect is checked the same way, and at most FEED_MAX_REDIRECTS are followed;
//   - the body stops at FEED_MAX_BYTES (counted after decompression) and the whole read, every
//     redirect included, at FEED_TIMEOUT_MS.
// What leaves is headlines only: newest FEED_ITEMS titles as plain text.
//
// Politeness (AC-6, evidence/feeds.md): one read per address serves every reader, through a
// `feed_cache` row every serverless instance shares (migration 0099). A row younger than its
// `next_allowed_at` (the 5-minute floor, or later when the feed asks with `<ttl>`, `max-age` or
// `Retry-After`) is served without fetching. A stale row is fetched by ONE instance, the one whose
// conditional update takes `claimed_until`, with the row's ETag and Last-Modified sent back; the
// others serve the stale row with its age. A failed fetch keeps the last good headlines.
//
// Every door (resolver, connection, cache, clock) arrives through `FeedIo`, so
// scripts/feed-fetch.test.mjs drives it with fakes.

import { lookup as dnsLookup } from 'node:dns/promises';
import { request as httpRequest, type IncomingMessage } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { isIP, type LookupFunction } from 'node:net';
import { pipeline } from 'node:stream';
import { createBrotliDecompress, createGunzip, createInflate } from 'node:zlib';
import { addressRefusal, normalizeFeedAddress, RETRY_FIX } from '../../src/control/feedSource.js';
import { sha256 } from './http.js';

export { normalizeFeedAddress };

/** Never fetched more often than this, whatever the readers (spec DS4, AC-6). */
export const FEED_FLOOR_MS = 5 * 60_000;
/** A feed asking for longer than this between reads is read this often anyway. */
export const FEED_MAX_WAIT_MS = 60 * 60_000;
/** One read, every redirect included (the Sheet reader's figure). */
export const FEED_TIMEOUT_MS = 10_000;
/** Redirects followed before the read is refused. */
export const FEED_MAX_REDIRECTS = 5;
/** The largest body read, after decompression: the Vercel blog's whole Atom feed is 3.9 MB
 *  (evidence/feeds.md), so ordinary large feeds fit and a runaway one does not. */
export const FEED_MAX_BYTES = 5_000_000;
/** How long one instance's claim on a stale row lasts: longer than a read and its save. */
export const FEED_CLAIM_MS = 20_000;
/** Headlines kept (spec DS4). */
export const FEED_ITEMS = 20;
/** A headline longer than this is cut, with an ellipsis. */
export const FEED_TITLE_CHARS = 300;
/** A row whose wait ended this long ago is an address nobody reads any more, and goes. */
export const FEED_PRUNE_MS = 24 * 60 * 60_000;
/** How soon a reader waiting for another instance's first read looks at the row again (then
 *  twice as long each time, up to a second). */
export const FEED_WAIT_POLL_MS = 250;

const USER_AGENT = 'NoaCG-Studio-feed-reader/1 (+https://noacg.studio)';

// ── The address ───────────────────────────────────────────────────────────────

/** The cache row's key: the normalized address's hash. */
export const feedKey = (url: string): string => sha256(url);

// ── Which addresses are public ────────────────────────────────────────────────

function v4Parts(ip: string): number[] | null {
  const parts = ip.split('.').map(Number);
  return parts.length === 4 && parts.every((p) => Number.isInteger(p) && p >= 0 && p <= 255) ? parts : null;
}

/** IPv4 ranges that are not the public internet: this network, private, shared, loopback,
 *  link-local (the cloud metadata address 169.254.169.254 among them), protocol assignments,
 *  documentation, benchmarking, multicast and reserved. */
const V4_BLOCKED: [number, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
].map(([base, bits]) => [v4Number(v4Parts(base as string)!), bits as number]);

function v4Number(p: number[]): number {
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function publicV4(ip: string): boolean {
  const parts = v4Parts(ip);
  if (!parts) return false;
  const n = v4Number(parts);
  return !V4_BLOCKED.some(([base, bits]) => n >>> (32 - bits) === base >>> (32 - bits));
}

/** An IPv6 address as eight 16-bit groups, or null. */
function v6Groups(ip: string): number[] | null {
  let text = ip.toLowerCase();
  const zone = text.indexOf('%');
  if (zone >= 0) text = text.slice(0, zone);
  // A trailing dotted quad (::ffff:10.0.0.1) is two groups.
  const quad = /(\d+\.\d+\.\d+\.\d+)$/.exec(text);
  if (quad) {
    const p = v4Parts(quad[1]);
    if (!p) return null;
    text = `${text.slice(0, quad.index)}${((p[0] << 8) | p[1]).toString(16)}:${((p[2] << 8) | p[3]).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? fill !== 0 : fill < 1) return null;
  const groups = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail].map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));
  return groups.length === 8 && groups.every((g) => !Number.isNaN(g)) ? groups : null;
}

/** IPv6 is public only inside global unicast (2000::/3), and not in its special parts: Teredo
 *  and other protocol assignments (2001::/23), documentation (2001:db8::/32) and 6to4 (2002::/16,
 *  which carries an IPv4 address of any kind). Loopback, unique-local (fc00::/7, the cloud metadata
 *  fd00:ec2::254 among them), link-local, multicast, IPv4-mapped and NAT64 all fall outside. */
function publicV6(ip: string): boolean {
  const g = v6Groups(ip);
  if (!g) return false;
  if (g[0] >> 13 !== 0b001) return false;
  if (g[0] === 0x2001 && g[1] < 0x200) return false;
  if (g[0] === 0x2001 && g[1] === 0xdb8) return false;
  if (g[0] === 0x2002) return false;
  return true;
}

/** Whether an address is on the public internet. Anything unparseable is not. */
export function publicAddress(ip: string): boolean {
  const kind = isIP(ip);
  return kind === 4 ? publicV4(ip) : kind === 6 ? publicV6(ip) : false;
}

// ── One guarded read ──────────────────────────────────────────────────────────

/** One answer of the resolver. */
export interface FeedAddress {
  address: string;
  family: number;
}

/** What a connection answers: headers in lower case, the body already decompressed. */
export interface FeedResponse {
  status: number;
  headers: Record<string, string | undefined>;
  body: AsyncIterable<Uint8Array>;
  /** Stop reading and close the connection. */
  cancel: () => void;
}

/** The network as the reader uses it. `request` connects to `address`, the one that was checked,
 *  and asks for `url` there (its host name still names the site, for TLS and virtual hosts). */
export interface FeedNet {
  lookup: (host: string) => Promise<FeedAddress[]>;
  request: (o: { url: URL; address: string; family: number; headers: Record<string, string>; signal: AbortSignal }) => Promise<FeedResponse>;
}

/** A refusal's or a failure's words, and how long the publisher asked to be left alone. */
export interface FeedProblem {
  error: string;
  fix: string;
  /** Refused by the guard (the address itself is the problem), not a passing failure. */
  refused?: boolean;
  /** The publisher's Retry-After, in ms. */
  retryMs?: number;
}

export type FeedFetch =
  | { kind: 'body'; text: string; etag: string | null; lastModified: string | null; cacheMs: number | null }
  | { kind: 'not-modified'; etag: string | null; lastModified: string | null; cacheMs: number | null }
  | ({ kind: 'problem' } & FeedProblem);

const refuse = (error: string, fix: string): FeedFetch => ({ kind: 'problem', error, fix, refused: true });
const PRIVATE_FIX = 'Use the feed’s public address on the internet.';

/** `max-age` in ms from a Cache-Control header, or null. */
function maxAgeMs(header: string | undefined): number | null {
  const m = /(?:^|[,\s])max-age\s*=\s*"?(\d+)/i.exec(header ?? '');
  return m ? Number(m[1]) * 1000 : null;
}

/** A Retry-After header in ms from `now`, or null. */
function retryAfterMs(header: string | undefined, now: number): number | null {
  if (!header) return null;
  if (/^\s*\d+\s*$/.test(header)) return Number(header) * 1000;
  const at = Date.parse(header);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** A promise that rejects once `signal` aborts, so a lookup counts against the read's time. */
function underSignal<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new Error('aborted'));
  return new Promise<T>((resolve, reject) => {
    const stop = () => reject(new Error('aborted'));
    signal.addEventListener('abort', stop, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener('abort', stop);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener('abort', stop);
        reject(error);
      },
    );
  });
}

/** Decode a body by the charset its header or its XML declaration names, UTF-8 otherwise. */
function decodeBody(bytes: Uint8Array, contentType: string | undefined): string {
  const declared =
    /charset\s*=\s*"?([\w.:-]+)/i.exec(contentType ?? '')?.[1] ??
    /^\s*<\?xml[^>]*encoding\s*=\s*["']([\w.:-]+)["']/i.exec(new TextDecoder('latin1').decode(bytes.subarray(0, 200)))?.[1];
  try {
    return new TextDecoder(declared ?? 'utf-8').decode(bytes);
  } catch {
    return new TextDecoder('utf-8').decode(bytes);
  }
}

/**
 * Read one address under the guard. `validators` are sent back as a conditional request. The
 * caller's `signal` bounds the whole read; `now` reads Retry-After dates.
 */
export async function guardedFetch(
  address: string,
  validators: { etag: string | null; lastModified: string | null },
  net: FeedNet,
  signal: AbortSignal,
  now: () => number = Date.now,
): Promise<FeedFetch> {
  let url: URL;
  try {
    url = new URL(address);
  } catch {
    return refuse('that is not a feed address', 'Paste the feed’s address.');
  }
  const headers: Record<string, string> = {
    'user-agent': USER_AGENT,
    accept: 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
    'accept-encoding': 'gzip, deflate, br',
  };
  if (validators.etag) headers['if-none-match'] = validators.etag;
  if (validators.lastModified) headers['if-modified-since'] = validators.lastModified;
  try {
    for (let hop = 0; ; hop += 1) {
      const why = addressRefusal(url)?.replace(/\.$/, '');
      if (why) return refuse(hop === 0 ? why : `it redirects to an address that cannot be read (${why})`, PRIVATE_FIX);
      const host = url.hostname.replace(/^\[|\]$/g, '');
      const answers = isIP(host) ? [{ address: host, family: isIP(host) }] : await underSignal(net.lookup(host), signal);
      if (answers.length === 0) return { kind: 'problem', error: 'that address does not exist', fix: 'Check the address.' };
      if (!answers.every((a) => publicAddress(a.address))) {
        return refuse(hop === 0 ? 'that address is not on the public internet' : 'it redirects to an address that is not on the public internet', PRIVATE_FIX);
      }
      // IPv4 first when the name has both: a function without IPv6 egress cannot reach the rest.
      const { address: ip, family } = answers.find((a) => a.family === 4) ?? answers[0];
      const response = await net.request({ url, address: ip, family, headers, signal });
      const location = response.headers.location;
      if (response.status >= 300 && response.status < 400 && response.status !== 304 && location) {
        response.cancel();
        if (hop >= FEED_MAX_REDIRECTS) return refuse(`it redirects more than ${FEED_MAX_REDIRECTS} times`, 'Use the address the feed finally lands on.');
        const next = new URL(location, url);
        // The validators are the first site's: another site could match one by chance and answer 304.
        if (next.origin !== url.origin) {
          delete headers['if-none-match'];
          delete headers['if-modified-since'];
        }
        url = next;
        continue;
      }
      const cacheMs = maxAgeMs(response.headers['cache-control']);
      if (response.status === 304) {
        response.cancel();
        return { kind: 'not-modified', etag: response.headers.etag ?? validators.etag, lastModified: response.headers['last-modified'] ?? validators.lastModified, cacheMs };
      }
      if (response.status < 200 || response.status >= 300) {
        response.cancel();
        const retry = retryAfterMs(response.headers['retry-after'], now());
        return {
          kind: 'problem',
          error: response.status === 404 || response.status === 410 ? 'the feed is not there' : `the feed answered ${response.status}`,
          fix: response.status === 404 || response.status === 410 ? 'Check the address.' : RETRY_FIX,
          ...(retry !== null ? { retryMs: retry } : {}),
        };
      }
      const declared = Number(response.headers['content-length']);
      const tooLarge = refuse(`the feed is larger than ${FEED_MAX_BYTES / 1_000_000} MB`, 'Use a smaller feed, such as one for a single category.');
      // A declared length is the compressed size, which only ever understates; checked early, and
      // the decompressed count below decides.
      if (Number.isFinite(declared) && declared > FEED_MAX_BYTES) {
        response.cancel();
        return tooLarge;
      }
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of response.body) {
        size += chunk.byteLength;
        if (size > FEED_MAX_BYTES) {
          response.cancel();
          return tooLarge;
        }
        chunks.push(chunk);
      }
      return {
        kind: 'body',
        text: decodeBody(Buffer.concat(chunks, size), response.headers['content-type']),
        etag: response.headers.etag ?? null,
        lastModified: response.headers['last-modified'] ?? null,
        cacheMs,
      };
    }
  } catch (error) {
    if (signal.aborted) return { kind: 'problem', error: `the feed did not answer in ${FEED_TIMEOUT_MS / 1000} seconds`, fix: RETRY_FIX };
    const code = (error as { code?: string }).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA') return { kind: 'problem', error: 'that address does not exist', fix: 'Check the address.' };
    return { kind: 'problem', error: 'the feed could not be reached', fix: RETRY_FIX };
  }
}

// ── The headlines ─────────────────────────────────────────────────────────────

const XML_ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
/** The named references an HTML title commonly carries, once its markup is read as HTML. */
const HTML_ENTITIES: Record<string, string> = {
  ...XML_ENTITIES,
  nbsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  copy: '©',
  reg: '®',
  trade: '™',
};

function decodeEntities(text: string, named: Record<string, string>): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const code = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return named[ref.toLowerCase()] ?? whole;
  });
}

/** Markup out, in one pass: a tag that breaks a line becomes a space, any other goes, and a `<`
 *  with no `>` after it is text. */
function stripTags(text: string): string {
  let out = '';
  let at = 0;
  for (let lt = text.indexOf('<'); lt >= 0; lt = text.indexOf('<', at)) {
    const gt = text.indexOf('>', lt);
    if (gt < 0) break;
    out += text.slice(at, lt) + (/^<\/?(?:br|p|div|li|tr|td|h\d)\b/i.test(text.slice(lt, Math.min(gt + 1, lt + 8))) ? ' ' : '');
    at = gt + 1;
  }
  return out + text.slice(at);
}
const escapeHtml = (text: string): string => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * An element's text as plain text. Each part becomes HTML first and the HTML then becomes text:
 * outside CDATA, child markup goes and entities are decoded once, and the result is TEXT, so a
 * plain-text title holding `&lt;script&gt;` reads as `<script>` (evidence/feeds.md, the Vercel
 * blog). A CDATA section, and an Atom title typed `html` (escaped markup), ARE HTML: their tags go
 * and their entities are decoded.
 */
function plainText(inner: string, html: boolean): string {
  let markup = '';
  for (const part of inner.split(/(<!\[CDATA\[[\s\S]*?\]\]>)/)) {
    if (part.startsWith('<![CDATA[')) markup += part.slice(9, -3);
    else if (html) markup += decodeEntities(stripTags(part), XML_ENTITIES);
    else markup += escapeHtml(decodeEntities(stripTags(part), XML_ENTITIES));
  }
  const out = decodeEntities(stripTags(markup), HTML_ENTITIES)
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Counted in characters, not UTF-16 units, so an emoji is never cut in half.
  const chars = Array.from(out);
  return chars.length > FEED_TITLE_CHARS ? `${chars.slice(0, FEED_TITLE_CHARS - 1).join('').trimEnd()}…` : out;
}

// THE PARSER SCANS FORWARD ONLY. A feed is up to 5 MB of text someone else wrote, and a lazy
// regex rescans to the end from every unclosed tag (quadratic: 400 KB of `<item>` took 5 s), which
// would hold the route and the tick. Every search below is an `indexOf` from where the last one
// ended, and an element without its end stops the scan. Tag names match as written (XML is case
// sensitive), without a namespace prefix.

/** Comments out; an unclosed comment ends the document. */
function stripComments(xml: string): string {
  if (!xml.includes('<!--')) return xml;
  let out = '';
  let at = 0;
  for (let open = xml.indexOf('<!--'); open >= 0; open = xml.indexOf('<!--', at)) {
    out += xml.slice(at, open);
    const close = xml.indexOf('-->', open + 4);
    if (close < 0) return out;
    at = close + 3;
  }
  return out + xml.slice(at);
}

/** The first element `name` at or after `from`: its attributes, inner text and where it ends. */
function element(xml: string, name: string, from = 0): { attrs: string; inner: string; end: number } | null {
  let open = xml.indexOf(`<${name}`, from);
  while (open >= 0 && !/[\s/>]/.test(xml.charAt(open + name.length + 1))) open = xml.indexOf(`<${name}`, open + 1);
  if (open < 0) return null;
  const gt = xml.indexOf('>', open);
  if (gt < 0) return null;
  const attrs = xml.slice(open + name.length + 1, gt);
  if (attrs.endsWith('/')) return { attrs: attrs.slice(0, -1), inner: '', end: gt + 1 };
  const close = xml.indexOf(`</${name}`, gt);
  if (close < 0) return null;
  const end = xml.indexOf('>', close);
  return { attrs, inner: xml.slice(gt + 1, close), end: end < 0 ? xml.length : end + 1 };
}

/** An element's text, cut to what a headline or an id can use before any parsing of it. */
const textOf = (e: { inner: string } | null, cap = 2048): string => (e ? plainText(e.inner.slice(0, cap), false) : '');

const attr = (attrs: string, name: string): string | null =>
  new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'i').exec(attrs.slice(0, 2048))?.slice(2).find((v) => v !== undefined) ?? null;

export interface FeedItem {
  title: string;
  /** guid / id, and the link: an item repeated by either appears once. */
  id: string | null;
  link: string | null;
  at: number | null;
}

export type FeedParse = { ok: true; items: FeedItem[]; ttlMs: number | null } | { ok: false; error: string; fix: string };

/**
 * RSS 2.0 (and 1.0) items or Atom entries: their titles as plain text, each item once by id or
 * link, newest first when every item carries a date (else in the feed's own order), at most
 * FEED_ITEMS. `<ttl>` (minutes) is returned as the feed's own wait.
 */
export function parseFeed(xml: string): FeedParse {
  const body = stripComments(xml);
  const rss = /<(?:[\w-]+:)?(?:rss|RDF)\b/.test(body);
  const atomRoot = /<([\w-]+:)?feed\b/.exec(body);
  const atom = atomRoot !== null;
  if (!rss && !atom) {
    return { ok: false, error: 'that address is not an RSS or Atom feed', fix: 'Paste the feed’s own address (it often ends in .xml, /rss or /feed).' };
  }
  const tag = atom && !rss ? 'entry' : 'item';
  // An Atom feed written with a prefix (`<atom:feed>`) names its entries and their children with
  // it; a child without it is read too.
  const prefix = tag === 'entry' ? (atomRoot?.[1] ?? '') : '';
  const el = (xml: string, name: string, from?: number) => element(xml, prefix + name, from) ?? (prefix ? element(xml, name, from) : null);
  const items: FeedItem[] = [];
  for (let e = element(body, prefix + tag); e; e = element(body, prefix + tag, e.end)) {
    const inner = e.inner;
    const t = el(inner, 'title');
    if (!t) continue;
    // A headline keeps 300 characters, so 16 KB of its markup is plenty to read.
    const title = plainText(t.inner.slice(0, 16_384), (attr(t.attrs, 'type') ?? '').toLowerCase() === 'html');
    if (!title) continue;
    let link: string | null;
    if (tag === 'entry') {
      const links: string[] = [];
      for (let l = el(inner, 'link'); l && links.length < 20; l = el(inner, 'link', l.end)) links.push(l.attrs);
      const alternate = links.find((a) => (attr(a, 'rel') ?? 'alternate') === 'alternate') ?? links[0];
      link = alternate ? attr(alternate, 'href') : null;
    } else {
      link = textOf(element(inner, 'link')) || null;
    }
    const id = textOf(el(inner, tag === 'entry' ? 'id' : 'guid')) || null;
    const date = el(inner, 'pubDate') ?? el(inner, 'updated') ?? el(inner, 'published') ?? element(inner, 'dc:date');
    const at = Date.parse(textOf(date, 256));
    items.push({ title, id, link, at: Number.isNaN(at) ? null : at });
  }
  const seen = new Set<string>();
  const once = items.filter((item) => {
    const keys = [item.id, item.link].filter((k): k is string => Boolean(k));
    if (keys.some((k) => seen.has(k))) return false;
    for (const k of keys) seen.add(k);
    return true;
  });
  if (once.length > 0 && once.every((i) => i.at !== null)) {
    once.sort((a, b) => (b.at as number) - (a.at as number));
  }
  const ttl = /<ttl>\s*(\d+)\s*<\/ttl>/i.exec(body);
  return { ok: true, items: once.slice(0, FEED_ITEMS), ttlMs: ttl ? Number(ttl[1]) * 60_000 : null };
}

// ── One cached read per address ───────────────────────────────────────────────

/** A `feed_cache` row (migration 0099). Times are ISO strings. */
export interface FeedRow {
  key: string;
  address: string;
  /** The last good headlines. */
  items: string[];
  etag: string | null;
  last_modified: string | null;
  /** The last good read (a 200 or a 304), or null before the first. */
  fetched_at: string | null;
  /** No fetch before this. */
  next_allowed_at: string;
  /** One instance's claim on fetching a stale row. */
  claimed_until: string;
  /** The last read's failure, cleared by a good read. */
  error: string | null;
  fix: string | null;
  failing_since: string | null;
  /** The failure is the guard's refusal of the address itself (answered 400, not 502). */
  refused: boolean;
  /** The wait the feed's own body asks for (`<ttl>`), kept so a 304 keeps honouring it. */
  feed_wait_ms: number | null;
}

/** The shared store, as the reader uses it (the service-role client in production). */
export interface FeedStore {
  get: (key: string) => Promise<FeedRow | null>;
  /** Insert a new row holding the claim; false when another instance inserted it first. */
  create: (row: FeedRow) => Promise<boolean>;
  /** Take the claim on a row whose claim has lapsed and whose wait has passed, in one conditional
   *  update; false when another instance holds it, or the row was read meanwhile. */
  claim: (key: string, now: string, until: string) => Promise<boolean>;
  save: (key: string, patch: Partial<FeedRow>) => Promise<void>;
  /** Delete the rows whose wait ended before `before`: addresses nobody reads any more. */
  prune: (before: string) => Promise<void>;
}

export interface FeedIo {
  net: FeedNet;
  store: FeedStore;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
}

/** What a reader is answered: headlines and their age, or why there are none. A failure with
 *  headlines in hand is still answered as a failure, with them, so a reader holds what it has. */
export type FeedAnswer =
  | { ok: true; items: string[]; fetchedAt: string }
  | { ok: false; status: number; error: string; fix: string; failingSince: string | null; items?: string[]; fetchedAt?: string | null };

const iso = (ms: number) => new Date(ms).toISOString();
const EPOCH = iso(0);

const BEING_READ: FeedAnswer = { ok: false, status: 503, error: 'the feed is being read', fix: RETRY_FIX, failingSince: null };

function answerOf(row: FeedRow): FeedAnswer {
  if (row.error) {
    return {
      ok: false,
      status: row.refused ? 400 : 502,
      error: row.error,
      fix: row.fix ?? RETRY_FIX,
      failingSince: row.failing_since,
      ...(row.fetched_at ? { items: row.items, fetchedAt: row.fetched_at } : {}),
    };
  }
  if (!row.fetched_at) return BEING_READ;
  return { ok: true, items: row.items, fetchedAt: row.fetched_at };
}

/** The wait before the next fetch: the floor, or longer when the feed asks, never past the cap. */
export function nextWait(asked: (number | null | undefined)[]): number {
  return Math.min(FEED_MAX_WAIT_MS, Math.max(FEED_FLOOR_MS, ...asked.filter((n): n is number => typeof n === 'number' && n > 0)));
}

/** Fetch under the claim, and keep what came of it on the row. */
async function fetchHeld(row: FeedRow, io: FeedIo, outer?: AbortSignal): Promise<FeedAnswer> {
  const abort = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    abort.abort();
  }, FEED_TIMEOUT_MS);
  const stop = () => abort.abort();
  outer?.addEventListener('abort', stop);
  if (outer?.aborted) abort.abort();
  let result: FeedFetch;
  try {
    // Validators only for headlines in hand: a 304 to a row without any would leave none.
    const held = row.fetched_at !== null;
    result = await guardedFetch(row.address, { etag: held ? row.etag : null, lastModified: held ? row.last_modified : null }, io.net, abort.signal, io.now);
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', stop);
  }
  // Cut short by the caller (the tick's deadline), not by the feed: nothing is learnt about the
  // feed, so the row keeps its headlines, its wait and its health, and only the claim goes.
  if (result.kind === 'problem' && abort.signal.aborted && !timedOut) {
    await io.store.save(row.key, { claimed_until: EPOCH });
    return { ok: false, status: 503, error: 'the read was cut short', fix: RETRY_FIX, failingSince: row.failing_since };
  }
  const now = io.now();
  const good = (etag: string | null, lastModified: string | null, waitMs: number, items?: string[], feedWaitMs?: number | null): Partial<FeedRow> => ({
    ...(items ? { items, feed_wait_ms: feedWaitMs ?? null } : {}),
    etag,
    last_modified: lastModified,
    fetched_at: iso(now),
    next_allowed_at: iso(now + waitMs),
    error: null,
    fix: null,
    failing_since: null,
    refused: false,
  });
  const bad = (problem: FeedProblem): Partial<FeedRow> => ({
    error: problem.error,
    fix: problem.fix,
    failing_since: row.failing_since ?? iso(now),
    next_allowed_at: iso(now + nextWait([problem.retryMs])),
    refused: problem.refused === true,
  });
  let patch: Partial<FeedRow>;
  if (result.kind === 'body') {
    const parsed = parseFeed(result.text);
    patch = parsed.ok
      ? good(result.etag, result.lastModified, nextWait([parsed.ttlMs, result.cacheMs]), parsed.items.map((i) => i.title), parsed.ttlMs)
      : bad(parsed);
  } else if (result.kind === 'not-modified') {
    // A 304 has no body, so the feed's own `<ttl>` comes from the row.
    patch = good(result.etag, result.lastModified, nextWait([row.feed_wait_ms, result.cacheMs]));
  } else {
    patch = bad(result);
  }
  const saved = { ...patch, claimed_until: EPOCH };
  await Promise.all([
    io.store.save(row.key, saved),
    // Rows nobody has read for a day go: an address read at all is fetched at least hourly.
    io.store.prune(iso(now - FEED_PRUNE_MS)).catch(() => {}),
  ]);
  return answerOf({ ...row, ...saved });
}

/**
 * One reader's read of an address: the cached headlines while they are fresh; else this instance
 * takes the claim and fetches, or another holds it and the stale row is served with its age (or,
 * before any first read, awaited until that read settles). `wait` ends that waiting (the route
 * passes its request's signal: a reader gone needs no answer); `cut` also cuts this instance's own
 * fetch short (the tick passes its deadline). A client leaving never cuts a fetch, whose failure
 * every other reader would then be served.
 */
export async function readFeed(text: string, io: FeedIo, { wait, cut }: { wait?: AbortSignal; cut?: AbortSignal } = {}): Promise<FeedAnswer> {
  const normal = normalizeFeedAddress(text);
  if ('error' in normal) return { ok: false, status: 400, error: normal.error.replace(/\.$/, '').toLowerCase(), fix: 'Paste the feed’s address.', failingSince: null };
  const key = feedKey(normal.url);
  const now = io.now();
  let row = await io.store.get(key);
  if (row && Date.parse(row.next_allowed_at) > now && (row.fetched_at || row.error)) return answerOf(row);
  const until = iso(now + FEED_CLAIM_MS);
  if (!row) {
    const fresh: FeedRow = {
      key,
      address: normal.url,
      items: [],
      etag: null,
      last_modified: null,
      fetched_at: null,
      next_allowed_at: EPOCH,
      claimed_until: until,
      error: null,
      fix: null,
      failing_since: null,
      refused: false,
      feed_wait_ms: null,
    };
    if (await io.store.create(fresh)) return fetchHeld(fresh, io, cut);
  } else if (await io.store.claim(key, iso(now), until)) {
    return fetchHeld({ ...row, claimed_until: until }, io, cut);
  }
  // Another instance holds the claim. Headlines in hand are served with their age; before the
  // first read, wait for that read to settle rather than fetching a second time, looking at the
  // row less often the longer it takes.
  if (row?.fetched_at) return answerOf(row);
  const deadline = now + FEED_TIMEOUT_MS + FEED_CLAIM_MS / 4;
  for (let pause = FEED_WAIT_POLL_MS; io.now() < deadline && !wait?.aborted; pause = Math.min(pause * 2, 1000)) {
    await io.sleep(pause);
    row = await io.store.get(key);
    if (row && (row.fetched_at || row.error) && Date.parse(row.claimed_until) <= io.now()) return answerOf(row);
  }
  return BEING_READ;
}

// ── The real doors ────────────────────────────────────────────────────────────

/** The resolver and the pinned connection, on Node's own modules. */
export const nodeFeedNet: FeedNet = {
  lookup: async (host) => {
    const answers = await dnsLookup(host, { all: true, verbatim: true });
    return answers.map((a) => ({ address: a.address, family: a.family }));
  },
  request: ({ url, address, family, headers, signal }) =>
    new Promise((resolve, reject) => {
      const send = url.protocol === 'https:' ? httpsRequest : httpRequest;
      const req = send(
        url,
        {
          method: 'GET',
          headers,
          signal,
          // The connection goes to the checked address; the URL's host name still names the site
          // for TLS (its certificate is checked against the name) and for virtual hosting.
          lookup: ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) => {
            if (options?.all) callback(null, [{ address, family }]);
            else callback(null, address, family);
          }) as LookupFunction,
        },
        (res: IncomingMessage) => {
          const encoding = String(res.headers['content-encoding'] ?? '').toLowerCase();
          const decoder = encoding === 'gzip' || encoding === 'x-gzip' ? createGunzip() : encoding === 'deflate' ? createInflate() : encoding === 'br' ? createBrotliDecompress() : null;
          // pipeline, not pipe: a response cut off (the 10-second abort) must end the decoder too,
          // or the read waits on it for ever.
          const body = decoder ? pipeline(res, decoder, () => {}) : res;
          const flat: Record<string, string | undefined> = {};
          for (const [k, v] of Object.entries(res.headers)) flat[k] = Array.isArray(v) ? v.join(', ') : v;
          resolve({
            status: res.statusCode ?? 0,
            headers: flat,
            body: body as AsyncIterable<Uint8Array>,
            cancel: () => {
              res.destroy();
              decoder?.destroy();
            },
          });
        },
      );
      req.on('error', reject);
      req.end();
    }),
};

/** The network the reader uses: Node's own, pinned to the checked address. A configured test in
 *  the route's own process replaces it with a stub upstream (e2e/configured/feed-route.spec.ts). */
export const feedNetwork: { current: FeedNet } = { current: nodeFeedNet };

/** The `feed_cache` table through a service-role client (api/_lib/adminAuth.ts `adminDb`). */
export function supabaseFeedStore(db: {
  from: (table: string) => any; // eslint-disable-line @typescript-eslint/no-explicit-any
}): FeedStore {
  const fail = (error: { message: string } | null) => {
    if (error) throw new Error(error.message);
  };
  return {
    get: async (key) => {
      const { data, error } = await db.from('feed_cache').select('*').eq('key', key).maybeSingle();
      fail(error);
      return (data as FeedRow | null) ?? null;
    },
    create: async (row) => {
      const { data, error } = await db.from('feed_cache').upsert(row, { onConflict: 'key', ignoreDuplicates: true }).select('key');
      fail(error);
      return Array.isArray(data) && data.length === 1;
    },
    claim: async (key, now, until) => {
      const { data, error } = await db
        .from('feed_cache')
        .update({ claimed_until: until })
        .eq('key', key)
        .lt('claimed_until', now)
        .lte('next_allowed_at', now)
        .select('key');
      fail(error);
      return Array.isArray(data) && data.length === 1;
    },
    save: async (key, patch) => {
      const { error } = await db.from('feed_cache').update(patch).eq('key', key);
      fail(error);
    },
    prune: async (before) => {
      const { error } = await db.from('feed_cache').delete().lt('next_allowed_at', before).lt('claimed_until', before);
      fail(error);
    },
  };
}
