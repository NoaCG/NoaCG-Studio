// guards: src/templates/**, src/blocks/**, src/export/targets/ograf.ts
//
// EVERY PAGE-LEVEL NAME A TEMPLATE RUNTIME READS HAS BEEN DECIDED FOR OGRAF. Under SPX and
// CasparCG a template IS the document, so `document.body` is its canvas and `document.querySelector`
// finds its own elements. Inside an OGraf renderer the same code runs as one component among
// several in the RENDERER's document, so `graphic.mjs` hands it a `document` scoped to its own
// element (`scopedDocument` in src/export/targets/ograf.ts): the members listed there answer for
// the graphic, and every other member passes through to the renderer's page.
//
// That list was hand-kept, and it grew after the defect each time (issue #789): `body` and
// `documentElement` were added only once the renderer's page had been measured instead of the
// canvas. So this test derives what the generators actually emit - every `document.<member>`,
// every viewport read off `window`, and every other road to the real document - from the sources
// the template runtimes are written in, and fails on any member nobody has decided about.
//
// A NEW MEMBER FAILS HERE. Decide it: either it reads or writes something that belongs to the
// graphic (then scope it in `scopedDocument`, and say how in the comment there), or it is a
// page-level service the graphic may share with its neighbours (then add it to PASS_THROUGH below
// with the reason). A decision whose member no generator uses any more fails too, so the list
// cannot go stale. The scan is over source text, so studio-side code in the same folders is
// counted as well; that over-reads, which costs a line here and never misses a runtime read.
//
// Run: node --test scripts/ograf-document-members.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { globSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { measured } from './measured.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Where the template runtimes are written: the generators and the animation/behaviour blocks. */
const RUNTIME_SOURCES = ['src/templates/**/*.ts', 'src/blocks/**/*.ts'];

/** Members of the real document a graphic may share with the renderer's page, and why. */
const PASS_THROUGH = {
  readyState: "the page's loading state; a graphic is initialised after the renderer's page has loaded, so its DOM-ready wait runs at once",
  addEventListener: "only DOMContentLoaded is listened for, which has already fired; a graphic owns no document-level events",
  fonts: "the page's font set, which is where a graphic's @font-face rules register: from its own stylesheet in the light mount, and lifted into the renderer's <head> in the shadow mount, because a shadow tree registers none; `fonts.ready` waits for the graphic's faces as well",
  createElement: 'makes a detached node; the template appends it inside its own canvas',
  createElementNS: 'makes a detached SVG node; the template appends it inside its own canvas',
  createRange: 'makes a detached range the text fit measures one of its own elements with',
};

/** Roads to the renderer's page around the scoped `document`: any of them is a decision as well. */
const ESCAPES = new RegExp(
  [
    // Through the window object. The scoped window passes these through to the renderer's, except
    // `document`, which it answers with the scoped one; that road stays closed here all the same,
    // because the member scan below reads only a bare `document.`.
    /\b(?:window|globalThis|self)\.(?:document|top|parent|frameElement|innerWidth|innerHeight|outerWidth|outerHeight|devicePixelRatio|visualViewport|screen|scrollX|scrollY|pageXOffset|pageYOffset|matchMedia)\b/.source,
    // As bare globals, which no parameter of initTemplate shadows. (`top`, `parent` and `screen`
    // are left out bare: they are ordinary words in the CSS and prose these sources carry.)
    /(?<![\w$.])(?:innerWidth|innerHeight|outerWidth|outerHeight|devicePixelRatio|visualViewport|matchMedia|frameElement)\b/.source,
    // A member the scan below cannot name.
    /(?<![\w$.])document(?:\?\.|\s*\[)/.source,
  ].join('|'),
  'g',
);
const MEMBER = /(?<![\w$.])document\.([A-Za-z_$][\w$]*)/g;
/** The events a runtime listens for on the document, which PASS_THROUGH.addEventListener's reason covers. */
const DOCUMENT_EVENT = /(?<![\w$.])document\.addEventListener\(\s*(['"])([\w-]+)\1/g;
const DECIDED_EVENTS = ['DOMContentLoaded'];

/** The members `scopedDocument` answers for the graphic, read off the generated module's source. */
function scopedMembers() {
  const source = readFileSync(path.join(ROOT, 'src/export/targets/ograf.ts'), 'utf8');
  const fn = /function scopedDocument\(root, head\) \{\r?\n {2}const scoped = \{\r?\n([\s\S]*?)\r?\n {2}\};/.exec(source);
  assert.ok(fn, 'scopedDocument() no longer has the shape this test reads - update the reader, not the list');
  return new Set([...fn[1].matchAll(/^ {4}([A-Za-z_$][\w$]*):/gm)].map((m) => m[1]));
}

/** Every member read in the runtime sources, with one file that reads it. */
function readMembers() {
  const files = RUNTIME_SOURCES.flatMap((glob) => globSync(glob, { cwd: ROOT }))
    .map((file) => file.split(path.sep).join('/'))
    .filter((file) => !/\.(?:test|d)\.ts$/.test(file));
  measured(files.length, 'template runtime source files');
  const members = new Map();
  const escapes = new Map();
  const events = new Map();
  for (const file of files) {
    const text = readFileSync(path.join(ROOT, file), 'utf8');
    for (const m of text.matchAll(MEMBER)) if (!members.has(m[1])) members.set(m[1], file);
    for (const m of text.matchAll(ESCAPES)) if (!escapes.has(m[0])) escapes.set(m[0], file);
    for (const m of text.matchAll(DOCUMENT_EVENT)) if (!events.has(m[2])) events.set(m[2], file);
  }
  return { members, escapes, events };
}

const scoped = scopedMembers();
const { members, escapes, events } = readMembers();
measured(members.size, 'document members the template runtimes read');

test('scopedDocument scopes the lookups, the canvas and the head', () => {
  // `head` is where a template's own document-level additions go: the shadow root in the shadow
  // mount, so a <style> it appends styles its own tree and not the renderer's page.
  for (const member of ['getElementById', 'querySelector', 'querySelectorAll', 'body', 'documentElement', 'head']) {
    assert.ok(scoped.has(member), `scopedDocument no longer scopes document.${member}`);
  }
});

test('every document member a template runtime reads is scoped or a decided pass-through', () => {
  const undecided = [...members].filter(([member]) => !scoped.has(member) && !(member in PASS_THROUGH));
  assert.deepEqual(
    undecided.map(([member, file]) => `document.${member} (${file})`),
    [],
    'a template runtime reads a document member OGraf has not decided about - scope it in scopedDocument or add it to PASS_THROUGH with the reason',
  );
});

test('no template runtime reaches the renderer page around the scoped document', () => {
  assert.deepEqual(
    [...escapes].map(([read, file]) => `${read} (${file})`),
    [],
    'a template runtime reads the real page through window - under OGraf that is the renderer, not the canvas',
  );
});

test('a runtime listens on the document only for the events its pass-through reason covers', () => {
  assert.deepEqual(
    [...events].filter(([event]) => !DECIDED_EVENTS.includes(event)).map(([event, file]) => `${event} (${file})`),
    [],
    "document.addEventListener reaches the renderer's page - a document-level event there is the renderer's, not the graphic's",
  );
});

test('every pass-through decision is still in use and not also scoped', () => {
  for (const member of Object.keys(PASS_THROUGH)) {
    assert.ok(members.has(member), `PASS_THROUGH.${member} is decided but no runtime reads it any more - remove it`);
    assert.ok(!scoped.has(member), `document.${member} is both scoped and passed through`);
  }
});
