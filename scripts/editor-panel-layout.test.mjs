// guards: src/model/editorPanelLayout.ts, src/components/editorFoundation/panelLayout.ts, src/components/editorFoundation/usePanelLayout.ts, src/components/editorFoundation/PanelDivider.tsx, src/components/editorFoundation/EditorFoundation.tsx
import test from 'node:test';
import assert from 'node:assert/strict';
import { rolldown } from 'rolldown';
const bundle = await rolldown({ input: 'src/components/editorFoundation/panelLayout.ts', platform: 'neutral', logLevel: 'silent' });
const { output } = await bundle.generate({ format: 'esm', codeSplitting: false }); await bundle.close();
const { readPanelLayout, encodePanelLayout, defaultPanelLayout, fitPanelLayout } = await import(`data:text/javascript;base64,${Buffer.from(output[0].code).toString('base64')}`);

test('missing or corrupt current preferences cannot hide a panel or block authoring', () => {
  for (const raw of [null, '', '{', '{}', '{"v":1,"sizes":{"project":0,"inspector":280,"timeline":240}}', '{"v":1,"sizes":{"project":230,"inspector":"wide","timeline":240}}']) assert.deepEqual(readPanelLayout(raw, 768), { sizes: defaultPanelLayout(768), writable: true });
  const sizes = { project: 600, inspector: 500, timeline: 500 };
  assert.deepEqual(readPanelLayout(JSON.stringify({ v: 1, sizes }), 768), { sizes, writable: true });
});
test('viewport bounds reserve an actual canvas and workspace at the declared minimums', () => {
  const large = { project: 10000, inspector: 10000, timeline: 10000 }, before = JSON.stringify(large);
  assert.deepEqual(fitPanelLayout(large, 1366, 768, 114, true).sizes, { project: 180, inspector: 934, timeline: 454 });
  for (const [width, height] of [[1366,768], [1920,1080], [1093,614]]) for (const project of [false,true]) {
    const { sizes } = fitPanelLayout(large, width, height, 114, project);
    assert.ok(width - sizes.inspector - (project ? sizes.project + 12 : 6) >= 240);
    assert.ok(height - 114 - sizes.timeline >= 200);
    assert.ok(sizes.project >= 180 && sizes.inspector >= 240 && sizes.timeline >= 180);
  }
  assert.equal(JSON.stringify(large), before, 'fitting a small window must not destroy retained preferences');
});
test('small preferences clamp visibly; a later larger window can recover the retained choice', () => {
  assert.deepEqual(fitPanelLayout({ project:1, inspector:1, timeline:1 },1366,768,114,true).sizes, {project:180,inspector:240,timeline:180});
  const preferred={project:500,inspector:600,timeline:500};
  const small=fitPanelLayout(preferred,1093,614,114,true).sizes;
  const large=fitPanelLayout(preferred,1920,1080,114,true).sizes;
  assert.ok(small.project<preferred.project && small.timeline<preferred.timeline); assert.deepEqual(large,preferred);
});


test('unknown versions remain read-only for every serialization attempt', () => {
  const sizes = { project: 310, inspector: 330, timeline: 270 };
  for (const v of [2, 0, 'future', null]) {
    const raw = ' ' + JSON.stringify({ v, sizes, futureOnly: { keep: 'exact' } }) + '\n';
    assert.deepEqual(readPanelLayout(raw, 768), { sizes: defaultPanelLayout(768), writable: false });
    assert.equal(encodePanelLayout(raw, sizes), null); assert.equal(encodePanelLayout(raw, defaultPanelLayout(768)), null);
  }
});
test('supported writes keep additive fields and the current version', () => {
  const raw = JSON.stringify({ v: 1, sizes: { project: 230, inspector: 280, timeline: 240, futurePanel: 777 }, extra: { keep: true } });
  const encoded = JSON.parse(encodePanelLayout(raw, { project: 230, inspector: 330, timeline: 240 }));
  assert.deepEqual(encoded, { v: 1, sizes: { project: 230, inspector: 330, timeline: 240, futurePanel: 777 }, extra: { keep: true } });
});
