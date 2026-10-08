// guards: src/control/allOut.ts
//
// What All out clears (docs/work-specs/playout-workflow-simplification D11, AC-13): what this page
// has up and what the server's heads say is on, and every graphic of a published production when
// neither knows of any, so the panic control never does nothing.
import test from 'node:test';
import assert from 'node:assert/strict';

const { allOutTargets } = await import('../src/control/allOut.ts');

test('All out clears what the page has up and what the heads say is on, once each', () => {
  assert.deepEqual(allOutTargets({ local: ['A'], onServer: ['B', 'A'], all: ['A', 'B', 'C'], published: true }), ['A', 'B']);
  assert.deepEqual(allOutTargets({ local: [], onServer: ['B'], all: ['A', 'B'], published: true }), ['B'], 'a graphic whose cue marker went missing');
});

test('published with nothing known to be on, it clears every graphic; unpublished, nothing', () => {
  assert.deepEqual(allOutTargets({ local: [], onServer: [], all: ['A', 'B', 'A'], published: true }), ['A', 'B']);
  assert.deepEqual(allOutTargets({ local: [], onServer: null, all: ['A', 'B'], published: true }), ['A', 'B'], 'no head to ask');
  assert.deepEqual(allOutTargets({ local: [], onServer: null, all: ['A'], published: false }), []);
  assert.deepEqual(allOutTargets({ local: ['A'], onServer: null, all: ['A', 'B'], published: false }), ['A'], 'rehearsal clears what it put up');
});
