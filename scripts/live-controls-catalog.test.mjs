// gate: factory
// needs: browser
// guards: src/control/liveControls.ts, src/control/controlModel.ts, src/control/panelActions.ts, src/templates/**
//
// THE ONE-PRESS PICK RULE OVER EVERY CATALOG GRAPHIC, built for real (pinned live controls AC-3,
// AC-4): `variant.create()` parses its html with `DOMParser`, so the bundled modules run in one
// blank Chromium page (the catalog-line-gate.test.mjs pattern). The rule is derived from each
// declaration, so this pins which graphics gain a pick group and that every other family (the
// quiz show boards, the podium, the competition and audience boards, the clocks, the score
// boards) gains none. The rule's own edges are scripts/live-controls.test.mjs. It also pins which
// graphics' number steps a panel's ready keys leave out, because an event already presses them.

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { wizardBrowserScript } from './wizard-load.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (relative) => path.join(projectRoot, 'src', relative).replaceAll('\\', '/');

test('pick groups appear exactly on the boards whose declaration names a few-option pick off the default path', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'live-controls-'));
  const entry = path.join(dir, 'entry.ts');
  writeFileSync(
    entry,
    [
      `export { CATALOG } from '${src('templates/catalog.ts')}';`,
      `export { arrangeControls, eventButtons, continueEvents, fieldDescriptors } from '${src('control/controlModel.ts')}';`,
      `export { pickOptions, liveNumberFields } from '${src('control/liveControls.ts')}';`,
      `export { graphicCapabilities } from '${src('control/panelActions.ts')}';`,
    ].join('\n'),
  );
  let script;
  try {
    script = await wizardBrowserScript(entry, 'NOACG_LIVE');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.addScriptTag({ content: script });
    const { groups, checked, moved, covered, stepped } = await page.evaluate(() => {
      const { CATALOG, arrangeControls, eventButtons, continueEvents, fieldDescriptors, pickOptions, liveNumberFields, graphicCapabilities } = window.NOACG_LIVE;
      const groups = {};
      const moved = [];
      const covered = {};
      let stepped = 0;
      let checked = 0;
      for (const variants of Object.values(CATALOG)) {
        for (const v of variants) {
          const t = v.create({});
          const buttons = eventButtons(t.js);
          if (buttons.length === 0) continue;
          checked += 1;
          const path = continueEvents(t.js);
          const descriptors = fieldDescriptors(t.fields);
          const found = buttons.flatMap((b) => {
            const p = pickOptions(b, descriptors, path, buttons);
            return p ? [`${b.event}:${p.options.map((o) => o.value).join('')}`] : [];
          });
          if (found.length) groups[v.id] = found.join(' ');
          // AC-7: with the pick rule applied, every control keeps its event, label, section,
          // order and bucket; only a pick group's control gains `options`.
          const before = arrangeControls(buttons, undefined);
          const after = arrangeControls(buttons, undefined, (b) => pickOptions(b, descriptors, path, buttons));
          const strip = (a) => JSON.stringify(a, (k, val) => (k === 'options' ? undefined : val));
          if (strip(before) !== strip(after)) moved.push(v.id);
          const steps = graphicCapabilities({ graphic: v.id, live: 'c', cue: 'c', arranged: after, numbers: liveNumberFields(descriptors, buttons), legal: () => true, stepping: true, aired: null, held: true, foreign: { caps: [], refused: [] } }).filter((c) => c.kind === 'step');
          stepped += steps.length;
          const said = steps.filter((c) => c.covered).map((c) => `${c.id}:${c.covered.join()}`);
          if (said.length) covered[v.id] = said.join(' ');
        }
      }
      return { groups, checked, moved, covered, stepped };
    });
    assert.ok(checked > 50, `only ${checked} catalog graphics declare controls`);
    assert.deepEqual(moved, [], 'a graphic whose arrangement the pick rule moved');
    const expected = {};
    // The classic answer boards: Select answer becomes its letters; Correct answer rides `judge`.
    for (const id of ['qz01', 'qz02', 'qz03', 'qz04']) expected[id] = 'select:ABCD';
    for (const id of ['qz05', 'qz06', 'qz07', 'qz08']) expected[id] = 'select:AB';
    for (const id of ['qz09', 'qz10', 'qz11', 'qz12']) expected[id] = 'select:ABC';
    // The match-ups' side pick and highlight, and the verdict's call: the same rule, by declaration.
    for (const id of ['mu01', 'mu02', 'mu03', 'mu04']) expected[id] = 'select:AB';
    for (const id of ['h201', 'h202', 'h203', 'h204']) expected[id] = 'highlight:AB';
    for (const id of ['vd01', 'vd02', 'vd03', 'vd04']) expected[id] = 'judge:correctincorrect';
    assert.deepEqual(groups, expected);
    // Only the boards whose point presses move one figure: the football strip's goal has no undo, so
    // its -1 stays a step. Every other number, with or without actions beside it, keeps both steps.
    assert.ok(stepped > 50, `only ${stepped} number steps in the catalog`);
    const steps = {};
    for (const id of ['sb01', 'sb02', 'sb03', 'sb04']) steps[id] = 'step:f1:1 step:f3:1';
    for (const id of ['sb26', 'sb27', 'sb28']) steps[id] = 'step:f1:1,-1 step:f3:1,-1';
    assert.deepEqual(covered, steps);
  } finally {
    await browser.close();
  }
});
