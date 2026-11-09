// guards: scripts/app-clean-url.mjs
//
// The dev and preview servers serve the join page at all three of its doors (interaction spec
// AC-5): /j/<name>, /join/<name> and /join?p=<slug>, and the other clean pages as before.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanUrlPath } from './app-clean-url.mjs';

test('the three join doors serve the join entry', () => {
  assert.equal(cleanUrlPath('/j/friday-night-live'), '/join.html');
  assert.equal(cleanUrlPath('/join/friday-night-live'), '/join.html');
  assert.equal(cleanUrlPath('/join?p=friday-night-live'), '/join.html?p=friday-night-live');
  assert.equal(cleanUrlPath('/join'), '/join.html');
});

test('other pages keep their clean URLs, and nothing else moves', () => {
  assert.equal(cleanUrlPath('/app'), '/app.html');
  assert.equal(cleanUrlPath('/output?s=abc'), '/output.html?s=abc');
  assert.equal(cleanUrlPath('/joinery'), '/joinery');
  assert.equal(cleanUrlPath('/jx/abc'), '/jx/abc');
  assert.equal(cleanUrlPath('/src/join/main.ts'), '/src/join/main.ts');
  assert.equal(cleanUrlPath('/fonts/x.woff2'), '/fonts/x.woff2');
});
