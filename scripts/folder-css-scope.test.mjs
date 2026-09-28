// guards: src/styles/playout-dashboard.css
//
// THE HOSTED PAGE DRAWS NO FOLDERS (docs/CLIP_PLAYBACK_PLAN.md §16, phase 4). It shares `.pd-cue`, `.pd-tag`
// and the rest of a rundown row's rules with the production page, so every rule a folder added must
// start at the production page's rundown (`.pd-rundown`) or at the folder's own panel
// (`.pd-folder-editor`) - otherwise a hosted row changes with it. The folders' words are the classes
// and attributes only a folder, the range or a folder drag puts on the page.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const FOLDER_WORDS = [
  /\.pd-folder\b/,
  /\.in-folder\b/,
  /\.in-range\b/,
  /\.holds-cursor\b/,
  /\.pd-drop-end\b/,
  /\.pd-range-bar\b/,
  /\.pd-rundown-note\b/,
  /\.pd-cue-kind--folder\b/,
  /\.pd-tag\.(part|miss)\b/,
  /\.pd-sr\b/,
  /\[data-drop/,
];
const SCOPES = ['.pd-rundown', '.pd-folder-editor'];

/** Every style rule's selector list, with comments and at-rule headers taken out. */
function selectors(css) {
  const out = [];
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const re = /([^{}]+)\{/g;
  for (let m; (m = re.exec(text)); ) {
    const head = m[1].trim();
    if (!head || head.startsWith('@')) continue;
    out.push(head);
  }
  return out;
}

const css = readFileSync(new URL('../src/styles/playout-dashboard.css', import.meta.url), 'utf8');

test('every rule that draws a folder starts at the production rundown or the folder panel', () => {
  const found = [];
  for (const list of selectors(css)) {
    for (const one of list.split(/,(?![^()]*\))/).map((s) => s.trim())) {
      if (!FOLDER_WORDS.some((w) => w.test(one))) continue;
      found.push(one);
      assert.ok(
        SCOPES.some((scope) => one.startsWith(`${scope} `) || one.startsWith(`${scope}.`) || one === scope || one.startsWith(`${scope}:`)),
        `"${one}" reaches the hosted page: start it at .pd-rundown (or the folder panel's class)`,
      );
    }
  }
  // The check found the folder rules at all: a renamed class would otherwise pass by matching nothing.
  assert.ok(found.some((s) => /\.pd-folder\b/.test(s)), 'no .pd-folder rule was found');
  assert.ok(found.some((s) => /\[data-drop/.test(s)), 'no drop-mark rule was found');
});

test('the scope check catches a folder rule that is not scoped', () => {
  const bad = selectors('.pd-cue.in-folder { margin-left: 12px; } .pd-rundown .pd-folder { height: 34px; }');
  const loose = bad.filter((s) => FOLDER_WORDS.some((w) => w.test(s)) && !SCOPES.some((scope) => s.startsWith(`${scope} `)));
  assert.deepEqual(loose, ['.pd-cue.in-folder']);
});
