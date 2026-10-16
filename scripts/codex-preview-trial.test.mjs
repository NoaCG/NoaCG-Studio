// guards: cli/plugin-preview/**
// The local trial's pure source/protocol checks run with the repository's normal build gates.
import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { buildChangeMessage, regionFromPoints, selectionAt } from '../cli/plugin-preview/protocol.mjs';
import { FIXTURE_ROOT, readSource } from '../cli/plugin-preview/source.mjs';

const target = { id: 'f0', label: 'Name', bounds: { x: 100, y: 200, width: 300, height: 50 } };
const snapshot = { packageId: 'fixture', revision: 'files-sha256:abc', size: { width: 1920, height: 1080 }, sourceRoot: '/fixture', sourceFiles: ['graphic.css'], targets: [target], sampleValues: { f0: 'Alex Morgan' }, image: 'iVBORw0KGgo=' };
const args = { revision: snapshot.revision, selection: { kind: 'element', id: 'f0' }, request: 'Make the name larger' };

test('request preserves exact image, target, source and active conversation contract', () => {
  const message = buildChangeMessage(snapshot, args);
  assert.deepEqual(message._meta['openai/message'], { target: 'active', send: true });
  assert.equal(message.content[1].data, snapshot.image);
  const context = JSON.parse(message.content[0].text.slice(message.content[0].text.indexOf('{')));
  assert.deepEqual(context.selection, { kind: 'element', ...target });
  assert.equal(context.revision, snapshot.revision);
  assert.equal(context.sourceRoot, snapshot.sourceRoot);
  assert.equal(context.request, args.request);
});
test('stale source, unknown target and invalid region cannot submit', () => {
  for (const patch of [{ revision: 'older' }, { selection: { kind: 'element', id: 'missing' } }, { selection: { kind: 'region', bounds: { x: 1910, y: 0, width: 20, height: 50 } } }, { request: ' ' }]) assert.throws(() => buildChangeMessage(snapshot, { ...args, ...patch }));
  assert.doesNotThrow(() => buildChangeMessage(snapshot, { ...args, selection: { kind: 'region', bounds: { x: 10, y: 10, width: 20, height: 50 } } }));
});
test('selection uses graphic coordinates and prefers nested elements', () => {
  assert.equal(selectionAt([{ id: 'parent', bounds: { x: 0, y: 0, width: 1920, height: 1080 } }, target], { x: 120, y: 220 }).id, 'f0');
  assert.deepEqual(regionFromPoints({ x: 300, y: 220 }, { x: 120, y: 200 }), { x: 120, y: 200, width: 180, height: 20 });
});
test('source is exact-byte versioned, assets are inlined, CSP denies network', async () => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'noacg-preview-source-'));
  try {
    await cp(FIXTURE_ROOT, temporary, { recursive: true });
    const first = await readSource(temporary);
    assert.match(first.document, /img-src data:/);
    assert.match(first.document, /connect-src 'none'/);
    assert.match(first.document, /data:image\/svg\+xml;base64,/);
    assert.doesNotMatch(first.document, /href="graphic.css"|src="graphic.js"/);
    await writeFile(path.join(temporary, 'unrelated.txt'), 'unrelated');
    assert.equal((await readSource(temporary)).revision, first.revision);
    const css = await readFile(path.join(temporary, 'graphic.css'), 'utf8');
    await writeFile(path.join(temporary, 'graphic.css'), css + '\n');
    assert.notEqual((await readSource(temporary)).revision, first.revision);
  } finally { await rm(temporary, { recursive: true, force: true }); }
});
test('npm and toolkit distribution do not include this opt-in trial', async () => {
  const cliPackage = JSON.parse(await readFile(new URL('../cli/package.json', import.meta.url), 'utf8'));
  assert.ok(!cliPackage.files.some((entry) => entry.includes('plugin-preview')));
  const distribution = await readFile(new URL('../cli/scripts/toolkit-distribution.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(distribution, /plugin-preview/);
});
