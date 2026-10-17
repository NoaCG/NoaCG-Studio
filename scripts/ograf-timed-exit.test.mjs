// guards: src/export/targets/ograf.ts
//
// AN OGRAF GRAPHIC SET TO LEAVE BY ITSELF SAYS SO IN ITS MANIFEST (issue #1012). The SPX `out`
// setting is `manual` (wait for Stop), `none` (stay) or a hold in milliseconds. The last one leaves
// by itself in the studio preview, SPX and the HTML overlay, and the OGraf Graphic now runs the
// same timed exit, so its manifest declares the standard's `stepCount: 0` (playAction animates in
// and out by itself), its playAction lasts the entrance, the hold and the exit, and the `v_spx`
// block hands SPX the real out mode instead of `manual`. A graphic that waits or stays keeps its
// steps. What the Graphic does on a renderer is e2e/ograf-lifecycle.spec.ts.
//
// Run: node --test scripts/ograf-timed-exit.test.mjs

import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { rolldown } from 'rolldown';
import { rawSuffix } from './rolldown-raw.mjs';

const dir = mkdtempSync(path.join(tmpdir(), 'ograf-timed-exit-'));
after(() => rmSync(dir, { recursive: true, force: true }));

/** A source module bundled for node and imported from a file, so its package imports resolve. */
async function load(input, name) {
  const bundle = await rolldown({ input, platform: 'node', plugins: [rawSuffix], logLevel: 'silent' });
  const { output } = await bundle.generate({ format: 'esm', codeSplitting: false });
  await bundle.close();
  const file = path.join(dir, `${name}.mjs`);
  writeFileSync(file, output[0].code);
  return import(pathToFileURL(file).href);
}

const { buildOgrafManifest, validateOgrafManifest } = await load('src/export/targets/ograf.ts', 'ograf');
const { emitAnimRegion } = await load('src/templates/shared/animRuntime.ts', 'animRuntime');

/** A one-box graphic: a 1 s entrance, then a 0.5 s exit, at `speed` 2, so 500 ms and 250 ms. */
const ANIM = emitAnimRegion({
  version: 2, root: '#box', speed: 2,
  steps: [
    { name: 'In', duration: 1, ease: 'none', layers: {} },
    { name: 'Out', duration: 0.5, ease: 'none', layers: {} },
  ],
});

function template(settings) {
  return {
    name: 'Timed Exit', type: 'blank', resolution: { width: 1920, height: 1080 }, fps: 50,
    html: '<div id="box"></div>', css: '', js: ANIM, fields: [], assets: [],
    settings: {
      description: 'Timed Exit', playserver: 'OVERLAY', playchannel: '1', playlayer: '2', webplayout: '2',
      out: 'manual', steps: '1', dataformat: 'json', ...settings,
    },
  };
}

const playDuration = (manifest) => manifest.actionDurations.find((d) => d.type === 'playAction').duration;

test('a graphic set to leave by itself after N ms declares stepCount 0 and hands SPX its out', () => {
  const manifest = buildOgrafManifest(template({ out: '4000' }));
  assert.deepEqual(validateOgrafManifest(manifest), []);
  assert.equal(manifest.stepCount, 0);
  assert.equal(manifest.v_spx.out, '4000');
  assert.equal(playDuration(manifest), 500 + 4000 + 250, 'playAction is the entrance, the hold and the exit');
  assert.equal(manifest.actionDurations.find((d) => d.type === 'playAction').steps, undefined);
});

test('a timed graphic with several steps still leaves by itself, so it offers no steps', () => {
  assert.equal(buildOgrafManifest(template({ out: '2500', steps: '3' })).stepCount, 0);
});

test('a graphic that waits for Stop or stays keeps its steps and its out mode', () => {
  for (const [out, steps, stepCount] of [['manual', '1', 1], ['none', '1', 1], ['manual', '3', 3], ['none', '2', 2]]) {
    const manifest = buildOgrafManifest(template({ out, steps }));
    assert.deepEqual(validateOgrafManifest(manifest), [], `${out}/${steps}`);
    assert.equal(manifest.stepCount, stepCount, `${out}/${steps}`);
    assert.equal(manifest.v_spx.out, out, `${out}/${steps}`);
  }
  assert.equal(playDuration(buildOgrafManifest(template({ out: 'manual' }))), 500, 'playAction is the entrance alone');
});

test('an out SPX does not know is sent as manual, never as written', () => {
  for (const out of ['', '4s', '-1', 'manual ']) {
    assert.equal(buildOgrafManifest(template({ out })).v_spx.out, 'manual', JSON.stringify(out));
  }
});
