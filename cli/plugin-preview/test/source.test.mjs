import assert from 'node:assert/strict';
import test from 'node:test';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { FIXTURE_ROOT, readSource } from '../source.mjs';
import { writePackage } from './package-fixture.mjs';

test('fixed fixture retains its exact phase-1 baseline revision', async () => {
  assert.equal((await readSource()).revision, 'files-sha256:8dde8a7398c3d3a09d8bf499bdee9643d931a759ee7af28de7e34d5bf4db086f');
});
test('package dependency closure includes nested styles, relative assets and font bytes', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-package-'));
  try {
    await writePackage(root);
    const first = await readSource(root, 'square.html');
    assert.deepEqual(first.sourceFiles, ['css/template.css', 'css/type.css', 'fonts/inter.woff2', 'images/badge.svg', 'js/template.js', 'square.html']);
    assert.match(first.document, /data:font\/woff2;base64,/);
    assert.match(first.document, /data:image\/svg\+xml;base64,/);
    assert.ok(first.document.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy"'));
    assert.equal(globalThis.__NOACG_PREVIEW_NODE_PROBE, undefined);
    await writeFile(path.join(root, 'private.txt'), 'never part of package');
    assert.equal((await readSource(root, 'square.html')).revision, first.revision);
    await writeFile(path.join(root, 'fonts/inter.woff2'), Buffer.from('changed font bytes'));
    assert.notEqual((await readSource(root, 'square.html')).revision, first.revision);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('resource traversal, encoded traversal, external paths and symbolic links are refused', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-containment-'));
  try {
    await cp(FIXTURE_ROOT, root, { recursive: true });
    const html = await readFile(path.join(root, 'graphic.html'), 'utf8');
    for (const reference of ['../outside.svg', '%2e%2e/outside.svg', '/tmp/outside.svg', '%2ftmp/outside.svg', 'file:///tmp/outside.svg', 'https://example.invalid/outside.svg', '.env']) {
      await writeFile(path.join(root, 'graphic.html'), html.replace('src="badge.svg"', `src="${reference}"`));
      await assert.rejects(readSource(root));
    }
    await writeFile(path.join(root, 'graphic.html'), html.replace('src="badge.svg"', 'src="alias/badge.svg"'));
    await symlink(FIXTURE_ROOT, path.join(root, 'alias'), 'junction');
    await assert.rejects(readSource(root), /symbolic link/);
    await assert.rejects(readSource(root, '../graphic.html'), /Refused/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('oversized resources and circular styles fail before any graphic execution', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'preview-budgets-'));
  try {
    await cp(FIXTURE_ROOT, root, { recursive: true });
    await writeFile(path.join(root, 'badge.svg'), Buffer.alloc(4 * 1024 * 1024 + 1));
    await assert.rejects(readSource(root), /too large/);
    await cp(path.join(FIXTURE_ROOT, 'badge.svg'), path.join(root, 'badge.svg'));
    await writeFile(path.join(root, 'graphic.css'), '@import url("./other.css");');
    await writeFile(path.join(root, 'other.css'), '@import "graphic.css";');
    await assert.rejects(readSource(root), /Circular/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
