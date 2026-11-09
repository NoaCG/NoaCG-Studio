// guards: src/templates/shared/qrEncoder.min.js, scripts/qr-vendor.mjs
//
// The Join card's QR encoder is a copy of the installed qrcode-generator. Both the panel's QR (the
// package) and the graphic's (this copy) must be the same encoder, so a QR in the studio and the
// one on air cannot differ; refresh with `node scripts/qr-vendor.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { VENDORED, vendoredText } from './qr-vendor.mjs';

test('the vendored encoder is the installed package, minified', () => {
  assert.equal(readFileSync(VENDORED, 'utf8'), vendoredText(), 'run node scripts/qr-vendor.mjs');
});

test('the vendored encoder runs as a plain script and defines qrcode', () => {
  const sandbox = {};
  vm.runInNewContext(`${readFileSync(VENDORED, 'utf8')};this.out = typeof qrcode;`, sandbox);
  assert.equal(sandbox.out, 'function');
});

test('the vendored encoder holds no String.replace pattern, so splicing it into a page keeps it whole', () => {
  // $$ $& $` $' $1 $<name> in a replacement string are patterns, not text (composeDocument splices
  // the graphic's script into the preview that way).
  assert.doesNotMatch(readFileSync(VENDORED, 'utf8'), /\$[$&`'0-9<]/);
});

test('the vendored encoder names no absolute URL, so a Join card passes the publish gate', () => {
  // The same pattern the gate reads a graphic's script with (src/validation/templateBench.ts JS_URL).
  assert.doesNotMatch(readFileSync(VENDORED, 'utf8'), /\bhttps?:\/\/[a-z0-9.-]+\.[a-z]{2,}/i);
});
