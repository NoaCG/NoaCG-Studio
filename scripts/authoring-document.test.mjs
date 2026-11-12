// guards: src/model/authoringDocument.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { readableWorkspace, workspaceDocument } from '../src/model/authoringDocument.ts';
const source = { html: '<p id="f0">Original</p>', css: ':root {}', js: '', assets: [], fields: [] };
const draft = { id: 'document-a', template: source, baseline: source, history: [], future: [], saved: { graphicId: null, dirty: true }, sampleData: {} };
const legacyAdopted = { v: 1, projects: [{ id: 'project-a', name: 'Bulletin', documents: ['document-a'] }], documents: [draft], active: 'document-a' };

test('v1 resolves the explicitly active document; unfiled retained documents remain readable', () => {
  assert.equal(readableWorkspace(legacyAdopted), true);
  assert.equal(workspaceDocument(legacyAdopted), draft);
  assert.equal(readableWorkspace({ ...legacyAdopted, projects: [] }), true);
  assert.equal(workspaceDocument({ ...legacyAdopted, active: null }), undefined);
});
test('unknown versions, duplicate ownership, orphan membership and malformed history are read-only without mutation', () => {
  for (const value of [undefined, null, { ...legacyAdopted, v: 2 }, { ...legacyAdopted, active: 'missing' },
    { ...legacyAdopted, documents: [draft, draft] },
    { ...legacyAdopted, projects: [{ ...legacyAdopted.projects[0], documents: ['missing'] }] },
    { ...legacyAdopted, documents: [{ ...draft, views: { future: [] } }] },
    { ...legacyAdopted, documents: [{ ...draft, history: [null] }] },
    { ...legacyAdopted, documents: [{ ...draft, view: { time: 0, selectedParts: 'not a list' } }] },
    { ...legacyAdopted, installations: [{ v: 2 }] },
  ]) {
    const exact = JSON.stringify(value);
    assert.equal(readableWorkspace(value), false);
    assert.equal(workspaceDocument(value), undefined);
    assert.equal(JSON.stringify(value), exact);
  }
});
