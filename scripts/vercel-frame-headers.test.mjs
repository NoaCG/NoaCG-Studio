// guards: vercel.json
//
// Which pages another site may frame, read from the config production actually serves.
//
// The output embed (src/export/outputEmbed.ts) is an SPX, CasparCG or OBS template whose body is
// an iframe pointed at https://noacg.studio/output. It is loaded from another origin, or from a
// file:// path, so /output must not send X-Frame-Options or a frame-ancestors directive. Until
// 2026-09-29 the catch-all header rule sent both to /output too, and on a CasparCG 2.5 layer the
// embed put Chromium's opaque grey error page on air. No test caught it because the Vite dev server
// sends neither header; this one reads vercel.json instead.
//
// Every other page keeps frame-ancestors 'self' and X-Frame-Options SAMEORIGIN: those are the pages
// with operator controls, where framing is a clickjacking risk. /output holds only the render
// capability and has nothing to click.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { getTransformedRoutes } from '@vercel/routing-utils';

import { configPath } from './check-vercel-config.mjs';

const config = JSON.parse(readFileSync(configPath, 'utf8'));

/**
 * The header routes Vercel compiles from vercel.json, in order. Each is a `continue` route that
 * adds its headers when its `src` matches the request path (the query string is not part of the
 * match) and lets routing go on, so every matching rule applies.
 */
function headerRoutes() {
  const { routes, error } = getTransformedRoutes({
    cleanUrls: config.cleanUrls,
    trailingSlash: config.trailingSlash,
    redirects: config.redirects,
    rewrites: config.rewrites,
    headers: config.headers,
  });
  assert.equal(error, null);
  return routes.filter((route) => route.continue && route.headers && !route.status);
}

/**
 * The response headers vercel.json gives `url`, keys lower-cased. Also returns every key that two
 * matching rules both set: Vercel cannot unset a header from a later rule, and relying on which of
 * two values wins would make the answer depend on merge order, so the tests require there are none.
 */
function effectiveHeaders(url) {
  const pathname = new URL(url, 'https://noacg.studio').pathname;
  const headers = {};
  const setTwice = [];
  for (const route of headerRoutes()) {
    if (!new RegExp(route.src).test(pathname)) continue;
    for (const [key, value] of Object.entries(route.headers)) {
      const name = key.toLowerCase();
      if (name in headers) setTwice.push(name);
      headers[name] = value;
    }
  }
  return { headers, setTwice };
}

function directives(csp) {
  return new Map(
    (csp ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...values] = part.split(/\s+/);
        return [name.toLowerCase(), values.join(' ')];
      }),
  );
}

// The page's own name and the exact form the embed requests.
const OUTPUT_URLS = ['/output', '/output?production=friday-night-live'];

// Pages with controls, and near-misses of /output that must not share its exemption.
const OTHER_URLS = [
  '/',
  '/app',
  '/admin',
  '/bridge',
  '/join',
  '/join/friday-night-live',
  '/control?production=x',
  '/outputs',
  '/output/x',
  '/fonts/inter.woff2',
];

for (const url of OUTPUT_URLS) {
  test(`${url} can be framed by any origin, the output embed's included`, () => {
    const { headers, setTwice } = effectiveHeaders(url);
    assert.deepEqual(setTwice, [], `two rules set the same header on ${url}`);
    assert.equal(headers['x-frame-options'], undefined, `${url} sends X-Frame-Options`);
    // Omitted rather than `*`: a CSP wildcard does not match a file:// ancestor, and CasparCG and
    // OBS load templates from files.
    assert.equal(
      directives(headers['content-security-policy']).has('frame-ancestors'),
      false,
      `${url} sends frame-ancestors: ${headers['content-security-policy']}`,
    );
  });

  test(`${url} keeps the protections that do not stop framing`, () => {
    const { headers } = effectiveHeaders(url);
    const csp = directives(headers['content-security-policy']);
    assert.equal(csp.get('object-src'), "'none'");
    assert.equal(csp.get('base-uri'), "'self'");
    assert.equal(csp.get('form-action'), "'self'");
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
    assert.equal(headers['x-robots-tag'], 'noindex, nofollow, noarchive');
  });
}

for (const url of OTHER_URLS) {
  test(`${url} can only be framed by noacg.studio itself`, () => {
    const { headers, setTwice } = effectiveHeaders(url);
    assert.deepEqual(setTwice, [], `two rules set the same header on ${url}`);
    assert.equal(
      headers['content-security-policy'],
      "frame-ancestors 'self'; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
    assert.equal(headers['x-frame-options'], 'SAMEORIGIN');
    assert.equal(headers['x-content-type-options'], 'nosniff');
    assert.equal(headers['referrer-policy'], 'strict-origin-when-cross-origin');
  });
}
