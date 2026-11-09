// guards: src/audience/joinColours.ts
//
// AC-6 (interaction spec, Contrast): a production's look meets WCAG AA on the phone page, as the
// page RENDERS it. The page sets each colour as `rgb(r, g, b)` with whole channels, so a colour
// that passes before rounding can land just under the line once rounded (checker-2-2-c-3487 on
// d521e014). Every pair below is judged on the CSS strings the page receives, against the AA
// rule's own definition, never on joinColours' internal values.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import './lib/tsResolve.mjs';

const { joinColours, css } = await import('../src/audience/joinColours.ts');

/** The page behind everything: join.html's background, #0b0b0d. */
const PAGE = 'rgb(11, 11, 13)';

/** `rgb(r, g, b)` as the browser reads it: whole channels, or the string is not what renders. */
function channels(value) {
  const m = /^rgb\((\d{1,3}), (\d{1,3}), (\d{1,3})\)$/.exec(value);
  assert.ok(m, `not a whole-channel rgb(): ${value}`);
  return [m[1], m[2], m[3]].map(Number);
}

function luminance(value) {
  const lin = (c) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = channels(value).map(lin);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Every text and edge the AA rule covers on the page, as [name, foreground, background, needed]. */
function pairs(look) {
  const c = Object.fromEntries(Object.entries(joinColours(look)).map(([k, v]) => [k, css(v)]));
  return [
    ['text on page', c.text, PAGE, 4.5],
    ['muted text on page (.nj-title, .nj-waiting)', c.textMuted, PAGE, 4.5],
    ['card text', c.cardText, c.panel, 4.5],
    ['card muted text (.nj-label, .nj-mine li)', c.cardMuted, c.panel, 4.5],
    ['option and field edge', c.cardEdge, c.panel, 3],
    ['text on accent (Send)', c.onAccent, c.accent, 4.5],
    ['accent line on card', c.accentLine, c.panel, 3],
    ['accent text on page', c.accentText, PAGE, 4.5],
  ];
}

function failures(look) {
  return pairs(look)
    .map(([name, fg, bg, need]) => ({ name, fg, bg, need, got: ratio(fg, bg) }))
    .filter((p) => p.got < p.need);
}

/** A deterministic generator, so a failure names a look that reproduces. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const hex = (rand) => `#${Math.floor(rand() * 0x1000000).toString(16).padStart(6, '0')}`;

test('the four palettes the check found below AA now meet it as rendered', () => {
  const looks = [
    { accent: '#cc3333', text: '#dd4444', panel: '#bb3333' },
    { accent: '#4936b6', text: '#2372bf', panel: '#5fab3b' },
    { accent: '#2e1df6', text: '#a9e706', panel: '#45d12b' },
    { accent: '#c7dd77', text: '#8cd29b', panel: '#2cadcc' },
  ];
  for (const look of looks) assert.deepEqual(failures(look), [], JSON.stringify(look));
});

test('100,000 random looks meet AA on every covered pair, as rendered', () => {
  const rand = rng(0x2b2);
  const bad = [];
  for (let i = 0; i < 100_000; i++) {
    const look = { accent: hex(rand), text: hex(rand), panel: hex(rand) };
    // Every fourth look gives its panel an alpha, as the studio's own does (rgba(10,12,16,.86)).
    if (i % 4 === 0) look.panel += Math.floor(rand() * 256).toString(16).padStart(2, '0');
    const f = failures(look);
    if (f.length) bad.push({ look, f });
  }
  assert.equal(bad.length, 0, `${bad.length} looks below AA, first: ${JSON.stringify(bad.slice(0, 3))}`);
});

test('a look with no colours, or colours that do not parse, gets the defaults and still meets AA', () => {
  for (const look of [null, undefined, {}, { accent: 'red', text: 42, panel: 'rgb(1,2)' }]) {
    assert.deepEqual(failures(look), [], JSON.stringify(look));
  }
});
