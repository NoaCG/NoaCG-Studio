// guards: src/validation/networkGuard.ts, src/validation/networkBench.ts
// The observed-request refusal's pure half (docs/work-specs/community-packs/spec.md D5): the
// policy refuses everything but inline code, data and blob URLs and the bundled font folder; the
// guard goes first in the head wherever the head begins; and a finding names the URL, what kind
// of thing it was and when the graphic asked for it. The browser half runs in
// e2e/community-packs.spec.ts.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRequest,
  networkPolicy,
  requestMessage,
  withNetworkGuard,
} from '../src/validation/networkGuard.ts';

const FONTS = 'https://noacg.studio/fonts/';

test('the policy allows only inline code, data and blob URLs, and the bundled font folder', () => {
  const policy = networkPolicy(FONTS);
  assert.match(policy, /default-src 'none'/);
  assert.match(policy, /connect-src 'none'/);
  assert.match(policy, /img-src data: blob:;/);
  assert.match(policy, /font-src data: https:\/\/noacg\.studio\/fonts\/;/);
  assert.doesNotMatch(policy, /'self'|\*/);
  assert.equal(networkPolicy('https://noacg.studio/fonts?x=1'), networkPolicy(FONTS));
  assert.throws(() => networkPolicy('javascript:alert(1)'));
  assert.throws(() => networkPolicy("https://noacg.studio/fo'nts/"));
});

test('the guard goes first in the head, wherever the head begins', () => {
  const first = (html) => withNetworkGuard(html, FONTS, 20).indexOf('<meta http-equiv="Content-Security-Policy"');
  const doc = '<!doctype html><html lang="en"><head><link rel="stylesheet" href="https://x.example/a.css"></head><body></body></html>';
  const guarded = withNetworkGuard(doc, FONTS, 20);
  assert.ok(guarded.indexOf('Content-Security-Policy') < guarded.indexOf('x.example'));
  assert.equal(first(doc), doc.indexOf('<head>') + '<head>'.length);
  assert.equal(first('<html><body></body></html>'), '<html>'.length);
  assert.equal(first('<!DOCTYPE html><body></body>'), '<!DOCTYPE html>'.length);
  assert.equal(first('<div></div>'), 0);
  assert.match(guarded, /timeScale\(20\)/);
});

test('a finding names the URL, what it was and when it was asked for', () => {
  assert.equal(
    requestMessage({ url: 'https://cdn.example/logo.png', directive: 'img-src', phase: 'play' }),
    'It asks for https://cdn.example/logo.png (an image) when it plays. ' +
      'A community pack carries everything it shows: put the file in the graphic or remove the request.',
  );
  assert.match(requestMessage({ url: 'https://api.example/x', directive: 'connect-src', phase: 'next' }), /\(a request from its code\) on Continue\./);
  assert.match(requestMessage({ url: 'https://f.example/a.woff2', directive: 'font-src', phase: 'load' }), /\(a font\) as it loads\./);
  assert.match(requestMessage({ url: 'https://s.example/a.css', directive: 'style-src-elem', phase: 'stop' }), /\(a stylesheet\) when it goes out\./);
  assert.equal(isRequest('inline'), false);
  assert.equal(isRequest('eval'), false);
  assert.equal(isRequest('https://cdn.example/logo.png'), true);
});
